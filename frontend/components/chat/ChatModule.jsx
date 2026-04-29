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
    setActiveConversation(prev => {
      if (!prev) {
        return !isAdmin && data.length > 0 ? data[0] : null;
      }
      const realMatch = data.find(
        c => !c._id.startsWith('new_') && c._id !== 'support_auto' && c.other_user?.id === prev.other_user?.id
      );
      if (realMatch) return realMatch;
      const stillExists = data.find(c => c._id === prev._id);
      return stillExists ?? prev;
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

  // Conversation list polling — refreshes last_seen_at for online status
  useEffect(() => {
    if (!token) return;
    const id = setInterval(async () => {
      try { await applyConversations(); } catch { /* ignore */ }
    }, 20000);
    return () => clearInterval(id);
  }, [token, applyConversations]);

  // Heartbeat — keeps current user marked online
  useEffect(() => {
    if (!token) return;
    sendHeartbeat(token);
    const id = setInterval(() => sendHeartbeat(token), 30000);
    return () => clearInterval(id);
  }, [token]);

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

  // Message polling — 2s fallback for real-time delivery
  useEffect(() => {
    if (!activeConversation ||
        activeConversation._id === 'support_auto' ||
        activeConversation._id.startsWith('new_') ||
        !token) return;

    const convId = activeConversation._id;
    const poll = async () => {
      try {
        const data = await getMessages(token, convId);
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m._id));
          const newOnes = data.map(normalizeMsg).filter(m => !existingIds.has(m._id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      } catch { /* ignore */ }
    };

    poll(); // immediate check so messages appear without waiting for first interval
    const id = setInterval(poll, 2000);
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

  useEffect(() => {
    if (!user || !token) return;
    const echo = getEcho(token);
    if (!echo) return;

    const handleNewMessage = (data) => {
      const newMessage = normalizeMsg(data.message);
      if (activeConversation && newMessage.conversation_id === activeConversation._id) {
        setMessages(prev => {
          if (prev.find(m => m._id === newMessage._id)) return prev;
          return [...prev, newMessage];
        });
      } else if (
        activeConversation &&
        (activeConversation._id.startsWith('new_') || activeConversation._id === 'support_auto')
      ) {
        setMessages(prev => {
          if (prev.find(m => m._id === newMessage._id)) return prev;
          return [...prev, newMessage];
        });
      }
      loadConversations();
    };

    let adminChannel = null;
    if (isAdmin) {
      adminChannel = echo.private('admin.chat');
      adminChannel.listen('.message.sent', handleNewMessage);
    }

    let conversationChannel = null;
    if (activeConversation && !activeConversation._id.startsWith('new_') && activeConversation._id !== 'support_auto') {
      conversationChannel = echo.private(`conversation.${activeConversation._id}`);
      conversationChannel.listen('.message.sent', handleNewMessage);
      conversationChannel.listenForWhisper('typing', (data) => {
        const uid = String(data.userId || '');
        if (!uid) return;
        setTypingUsers(prev => ({ ...prev, [uid]: data.name || 'Someone' }));
        if (typingTimeoutRefs.current[uid]) clearTimeout(typingTimeoutRefs.current[uid]);
        typingTimeoutRefs.current[uid] = setTimeout(() => {
          setTypingUsers(prev => { const u = { ...prev }; delete u[uid]; return u; });
          delete typingTimeoutRefs.current[uid];
        }, 3000);
      });
      conversationChannelRef.current = conversationChannel;
    }

    return () => {
      conversationChannelRef.current = null;
      if (conversationChannel) {
        conversationChannel.stopListening('.message.sent');
        conversationChannel.stopListeningForWhisper('typing');
      }
      if (adminChannel) adminChannel.stopListening('.message.sent');
    };
  }, [activeConversation?._id, user, token, isAdmin, loadConversations]);

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
    try {
      setIsSending(true);
      const actualPayload = { ...payload };
      if (activeConversation?._id === 'support_auto' || activeConversation?._id?.startsWith('new_')) {
        actualPayload.recipient_id = activeConversation.other_user.id;
        delete actualPayload.conversation_id;
      }

      const newMessage = normalizeMsg(await sendMessage(token, actualPayload));
      setMessages(prev => [...prev, newMessage]);
      const updatedConvs = await getConversations(token);
      setConversations(updatedConvs);
      const newRealConv = updatedConvs.find(c => c._id === newMessage.conversation_id);
      if (newRealConv) setActiveConversation(newRealConv);
    } catch (error) {
      console.error('Failed to send message:', error);
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
