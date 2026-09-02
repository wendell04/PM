'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatWindow from './ChatWindow';
import ChatInput from './ChatInput';
import { getConversations, getMessages, sendMessage, markAsRead, sendHeartbeat } from '../../lib/chatApi';
import { getEcho } from '../../lib/echo';
import './chat.css';


const ChatModule = ({ user, token, addToCart }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimeoutRefs = useRef({});
  const conversationChannelRef = useRef(null);
  // Ref keeps handleNewMessage free of stale closure on activeConversation
  const activeConvRef = useRef(null);

  const isAdmin = useMemo(() => user?.role === 'admin' || user?.role === 'owner', [user]);

  const handleTyping = useCallback(() => {
    if (!conversationChannelRef.current) return;
    try {
      conversationChannelRef.current.whisper('typing', {
        userId: String(user?.id || user?._id || ''),
        name: user?.name || 'Someone',
      });
    } catch { /* ignore */ }
  }, [user]);

  // Normalize MongoDB ObjectId to plain string — WebSocket events may deliver {$oid:"..."} objects
  const nid = (id) => {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (typeof id === 'object') return id.$oid ?? String(id);
    return String(id);
  };
  const normalizeMsg = (m) => m ? { ...m, _id: nid(m._id), conversation_id: nid(m.conversation_id), sender_id: nid(m.sender_id) } : m;

  // Is this confirmed message the server's copy of that optimistic bubble? Matched on what was
  // actually sent, because the ids will never agree.
  const sameSend = (confirmed, pending) =>
    String(confirmed?.type ?? 'text') === String(pending?.type ?? 'text') &&
    String(confirmed?.body ?? '') === String(pending?.body ?? '') &&
    String(confirmed?.file_url ?? '') === String(pending?.file_url ?? '');

  // The confirmed message must be one we have never held before - an id already on screen belongs
  // to an earlier send, however identical the wording - and it must not predate the placeholder.
  // Carries each placeholder's render key onto its confirmed twin, so the list can be rebuilt from
  // server data without any bubble changing identity. Returns the mapped server list plus the
  // placeholders that have still not come back.
  const absorbPending = (fresh, prev) => {
    const known = new Set(prev.filter(m => !m.pending).map(m => m._id));
    const pend  = prev.filter(m => m.pending);
    const used  = new Set();
    const mapped = fresh.map(f => {
      const p = pend.find(x => !used.has(x.clientKey) && isTwin(f, x, known));
      if (!p) return f;
      used.add(p.clientKey);
      return { ...f, clientKey: p.clientKey };
    });
    return { mapped, leftover: pend.filter(x => !used.has(x.clientKey)) };
  };

  // Same bubbles in the same order and the same states means nothing to re-render. Without this the
  // 1.5s poll would hand React a brand new array every tick.
  const listSig = (l) => l.map(m => (m.clientKey || m._id) + (m.pending ? ':p' : ':c')).join('|');

  const isTwin = (confirmed, pending, knownIds) => {
    if (knownIds.has(confirmed._id) || !sameSend(confirmed, pending)) return false;
    const a = Date.parse(confirmed.created_at ?? '');
    const b = Date.parse(pending.created_at ?? '');
    return !a || !b || a >= b - 120000;
  };

  // Core fetch logic shared by initial load and background polls
  const applyConversations = useCallback(async () => {
    const data = await getConversations(token);
    setConversations(data);

    // Detect new messages for the active conversation via timestamp — text comparison misses same-text messages
    const curr = activeConvRef.current;
    if (curr && !curr._id.startsWith('new_') && curr._id !== 'support_auto') {
      const sameConv = data.find(c => nid(c._id) === nid(curr._id));
      if (sameConv) {
        const prevAt = curr.last_message_at ?? '';
        const newAt = sameConv.last_message_at ?? '';
        if (newAt && prevAt !== newAt) {
          try {
            const msgs = await getMessages(token, nid(sameConv._id));
            setMessages(prev => {
              const { mapped, leftover } = absorbPending(msgs.map(normalizeMsg), prev);
              const next = [...mapped, ...leftover];
              return listSig(next) === listSig(prev) ? prev : next;
            });
          } catch { /* ignore */ }
        }
      }
    }

    setActiveConversation(prev => {
      if (!prev) {
        return !isAdmin && data.length > 0 ? data[0] : null;
      }
      // Always try exact _id match first — prevents accidentally switching conversations
      const sameConv = data.find(c => nid(c._id) === nid(prev._id));
      if (sameConv) return sameConv;
      // Only fall back to other_user match for temporary placeholder conversations
      if (prev._id.startsWith('new_') || prev._id === 'support_auto') {
        const realMatch = data.find(
          c => !c._id.startsWith('new_') && c._id !== 'support_auto'
            && nid(c.other_user?.id) === nid(prev.other_user?.id)
        );
        if (realMatch) return realMatch;
      }
      return prev;
    });
  }, [token, isAdmin]);

  const loadConversations = useCallback(async () => {
    try {
      setIsLoadingConversations(true);
      await applyConversations();
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [applyConversations]);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Conversation list polling — refreshes sidebar and online status
  useEffect(() => {
    if (!token) return;
    const id = setInterval(async () => {
      try { await applyConversations(); } catch { /* ignore */ }
    }, 8000);
    return () => clearInterval(id);
  }, [token, applyConversations]);

  // Heartbeat — keeps current user marked online
  useEffect(() => {
    if (!token) return;
    sendHeartbeat(token);
    const id = setInterval(() => sendHeartbeat(token), 30000);
    return () => clearInterval(id);
  }, [token]);

  // Keep ref in sync — always points to latest activeConversation
  useEffect(() => { activeConvRef.current = activeConversation; }, [activeConversation]);

  // Clear typing indicator when conversation switches
  useEffect(() => {
    Object.values(typingTimeoutRefs.current).forEach(clearTimeout);
    typingTimeoutRefs.current = {};
    setTypingUsers({});
  }, [activeConversation?._id]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!activeConversation || activeConversation._id === 'support_auto' || activeConversation._id.startsWith('new_')) {
        setMessages([]);
        return;
      }
      
      try {
        setIsLoadingMessages(true);
        const data = await getMessages(token, activeConversation._id);
        setMessages(data.map(normalizeMsg));
        
        if (activeConversation.unread_count > 0) {
          await markAsRead(token, activeConversation._id);
          setConversations(prev => prev.map(c => 
            c._id === activeConversation._id ? { ...c, unread_count: 0 } : c
          ));
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadMessages();
  }, [activeConversation?._id, token]);

  // Message polling — 1.5s fallback for real-time delivery
  useEffect(() => {
    if (!activeConversation ||
        activeConversation._id === 'support_auto' ||
        activeConversation._id.startsWith('new_') ||
        !token) return;

    const convId = nid(activeConversation._id); // normalize so {$oid} objects work
    const poll = async () => {
      try {
        const data = await getMessages(token, convId);
        setMessages(prev => {
          const { mapped, leftover } = absorbPending(data.map(normalizeMsg), prev);
          const next = [...mapped, ...leftover];
          return listSig(next) === listSig(prev) ? prev : next;
        });
      } catch { /* ignore */ }
    };

    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [activeConversation?._id, token]);

  // Presence channel — track who is online
  useEffect(() => {
    if (!user || !token) return;
    const echo = getEcho(token);
    if (!echo) return;

    const presence = echo.join('presence-online');
    presence
      .here((members) => setOnlineUsers(new Set(members.map((m) => m.id))))
      .joining((member) => setOnlineUsers((prev) => new Set([...prev, member.id])))
      .leaving((member) => setOnlineUsers((prev) => { const s = new Set(prev); s.delete(member.id); return s; }));

    return () => { echo.leave('presence-online'); };
  }, [user, token]);

  // Stable message handler — uses ref so it never has a stale activeConversation
  const handleNewMessage = useCallback((data) => {
    const newMessage = normalizeMsg(data.message);
    const curr = activeConvRef.current;
    if (curr) {
      const currId = nid(curr._id);
      if (newMessage.conversation_id === currId ||
          curr._id.startsWith('new_') ||
          curr._id === 'support_auto') {
        setMessages(prev => {
          if (prev.find(m => m._id === newMessage._id)) return prev;
          // If this is the server's copy of a bubble already on screen, update that bubble where it
          // stands rather than appending a second one beside it.
          const { mapped } = absorbPending([newMessage], prev);
          const key = mapped[0]?.clientKey;
          return key
            ? prev.map(m => (m.pending && m.clientKey === key) ? mapped[0] : m)
            : [...prev, newMessage];
        });
      }
    }
    // Always refresh sidebar so unread counts and previews update
    try { applyConversations(); } catch { /* ignore */ }
  }, [applyConversations]); // stable — no activeConversation dep needed

  // Admin-wide channel — stays subscribed regardless of which conversation is open
  useEffect(() => {
    if (!user || !token || !isAdmin) return;
    const echo = getEcho(token);
    if (!echo) return;
    const ch = echo.private('admin.chat');
    ch.listen('.message.sent', handleNewMessage);
    return () => { ch.stopListening('.message.sent'); };
  }, [user, token, isAdmin, handleNewMessage]);

  // Conversation-specific channel — switches when active conversation changes
  useEffect(() => {
    if (!user || !token || !activeConversation ||
        activeConversation._id.startsWith('new_') ||
        activeConversation._id === 'support_auto') return;
    const echo = getEcho(token);
    if (!echo) return;

    const convId = nid(activeConversation._id);
    const ch = echo.private(`conversation.${convId}`);
    ch.listen('.message.sent', handleNewMessage);
    ch.listenForWhisper('typing', (data) => {
      const uid = String(data.userId || '');
      if (!uid) return;
      setTypingUsers(prev => ({ ...prev, [uid]: data.name || 'Someone' }));
      if (typingTimeoutRefs.current[uid]) clearTimeout(typingTimeoutRefs.current[uid]);
      typingTimeoutRefs.current[uid] = setTimeout(() => {
        setTypingUsers(prev => { const u = { ...prev }; delete u[uid]; return u; });
        delete typingTimeoutRefs.current[uid];
      }, 3000);
    });
    conversationChannelRef.current = ch;

    return () => {
      conversationChannelRef.current = null;
      ch.stopListening('.message.sent');
      ch.stopListeningForWhisper('typing');
    };
  }, [activeConversation?._id, user, token, handleNewMessage]);

  const handleSelectConversation = useCallback((conv) => {
    if (conv._id?.startsWith('new_')) {
      const realConv = conversations.find(
        c => !c._id.startsWith('new_') && c._id !== 'support_auto' && c.other_user?.id === conv.other_user?.id
      );
      if (realConv) {
        setActiveConversation(realConv);
        return;
      }
    }
    setActiveConversation(conv);
  }, [conversations]);

  const handleSendMessage = async (payload) => {
    const tempId = `pending_${Date.now()}`;
    const isNewConv = activeConversation?._id === 'support_auto' || activeConversation?._id?.startsWith('new_');

    // Optimistic: add bubble immediately before API call
    const optimistic = normalizeMsg({
      _id: tempId,
      // The identity that survives confirmation. Everything else about this object is replaced by
      // the server's version; this is what keeps it the same bubble on screen.
      clientKey: tempId,
      conversation_id: activeConversation?._id || '',
      sender_id: String(user?.id || user?._id || ''),
      type: payload.type || 'text',
      body: payload.body || '',
      file_url: payload.file_url || null,
      metadata: payload.metadata || null,
      created_at: new Date().toISOString(),
      pending: true,
    });
    setMessages(prev => [...prev, optimistic]);
    setIsSending(true);

    try {
      const actualPayload = { ...payload };
      if (isNewConv) {
        actualPayload.recipient_id = activeConversation.other_user.id;
        delete actualPayload.conversation_id;
      }

      const newMessage = normalizeMsg(await sendMessage(token, actualPayload));

      // Replace the optimistic bubble with the confirmed message. If the realtime socket already
      // delivered the same message (it can beat the HTTP response), drop the placeholder instead of
      // swapping it in — otherwise we'd get two copies (the duplicate inquiry/quote card bug).
      // The socket usually gets here first and has already folded this in, in which case there is
      // no placeholder left to update and nothing to do.
      setMessages(prev => prev.some(m => m._id === newMessage._id && m._id !== tempId)
        ? prev.filter(m => m._id !== tempId)
        : prev.map(m => m._id === tempId ? { ...newMessage, clientKey: m.clientKey } : m));

      // For new conversations only: fetch real conv and update sidebar
      if (isNewConv) {
        const updatedConvs = await getConversations(token);
        setConversations(updatedConvs);
        const newRealConv = updatedConvs.find(c => c._id === newMessage.conversation_id);
        if (newRealConv) setActiveConversation(newRealConv);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Mark optimistic bubble as failed
      setMessages(prev => prev.map(m => m._id === tempId ? { ...m, failed: true, pending: false } : m));
    } finally {
      setIsSending(false);
    }
  };

  // Hide input on the "start conversation" welcome screen — customers only.
  // Admins always have the input visible (they initiate without the button).
  const isVirtualEmpty =
    !isAdmin &&
    (activeConversation?._id === 'support_auto' || activeConversation?._id?.startsWith('new_')) &&
    messages.length === 0 &&
    !isLoadingMessages;

  return (
    <div className="chat-container">
      <ChatSidebar
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={handleSelectConversation}
        isLoading={isLoadingConversations}
        onlineUsers={onlineUsers}
      />

      <div className="chat-main">
        <ChatWindow
          activeConversation={activeConversation}
          messages={messages}
          user={user}
          isLoading={isLoadingMessages}
          isLoadingMessages={isLoadingMessages}
          isLoadingConversations={isLoadingConversations}
          isAdmin={isAdmin}
          isSending={isSending}
          onStartChat={(text) => handleSendMessage({ type: 'text', body: text })}
          addToCart={addToCart}
          onlineUsers={onlineUsers}
          typingUsers={typingUsers}
        />

        {activeConversation && !isVirtualEmpty && (
          <ChatInput
            onSendMessage={handleSendMessage}
            isSending={isSending}
            activeConversation={activeConversation}
            token={token}
            isAdmin={isAdmin}
            onTyping={handleTyping}
          />
        )}
      </div>
    </div>
  );
};

export default ChatModule;
