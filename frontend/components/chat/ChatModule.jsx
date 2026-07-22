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
              const fresh = msgs.map(normalizeMsg);
              const freshIds = new Set(fresh.map(m => m._id));
              const pending = prev.filter(m => m.pending && !freshIds.has(m._id));
              return [...fresh, ...pending];
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
          const confirmedIds = new Set(data.map(m => normalizeMsg(m)._id));
          // Remove pending bubbles that have been confirmed by the server
          const withoutStale = prev.filter(m => !m.pending || !confirmedIds.has(m._id));
          const existingIds = new Set(withoutStale.map(m => m._id));
          const newOnes = data.map(normalizeMsg).filter(m => !existingIds.has(m._id));
          return newOnes.length > 0 ? [...withoutStale, ...newOnes] : withoutStale.length !== prev.length ? withoutStale : prev;
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
          return [...prev, newMessage];
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
      setMessages(prev => prev.some(m => m._id === newMessage._id)
        ? prev.filter(m => m._id !== tempId)
        : prev.map(m => m._id === tempId ? newMessage : m));

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
