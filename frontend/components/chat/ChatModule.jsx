'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatWindow from './ChatWindow';
import ChatInput from './ChatInput';
import { getConversations, getMessages, sendMessage, markAsRead } from '../../lib/chatApi';
import { getEcho } from '../../lib/echo';
import './chat.css';

const ChatModule = ({ user, token, addToCart }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const isAdmin = useMemo(() => user?.role === 'admin' || user?.role === 'owner', [user]);

  const loadConversations = useCallback(async () => {
    try {
      setIsLoadingConversations(true);
      const data = await getConversations(token);
      setConversations(data);

      setActiveConversation(prev => {
        if (!prev) {
          return !isAdmin && data.length > 0 ? data[0] : null;
        }
        // Prefer a real conversation over a new_/virtual one for the same user
        const realMatch = data.find(
          c => !c._id.startsWith('new_') && c._id !== 'support_auto' && c.other_user?.id === prev.other_user?.id
        );
        if (realMatch) return realMatch;
        const stillExists = data.find(c => c._id === prev._id);
        return stillExists ?? prev;
      });
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!activeConversation || activeConversation._id === 'support_auto' || activeConversation._id.startsWith('new_')) {
        setMessages([]);
        return;
      }
      
      try {
        setIsLoadingMessages(true);
        const data = await getMessages(token, activeConversation._id);
        setMessages(data);
        
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

  useEffect(() => {
    if (!user || !token) return;
    const echo = getEcho(token);
    if (!echo) return;

    const handleNewMessage = (data) => {
      const newMessage = data.message;
      if (activeConversation && newMessage.conversation_id === activeConversation._id) {
        // Real conversation — append directly
        setMessages(prev => {
          if (prev.find(m => m._id === newMessage._id)) return prev;
          return [...prev, newMessage];
        });
      } else if (
        activeConversation &&
        (activeConversation._id.startsWith('new_') || activeConversation._id === 'support_auto')
      ) {
        // Virtual conversation: the first real message just created a conversation.
        // Append message optimistically; loadConversations below will resolve the real ID.
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
    }

    return () => {
      if (conversationChannel) conversationChannel.stopListening('.message.sent');
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

      const newMessage = await sendMessage(token, actualPayload);
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

  const isVirtualEmpty =
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
        />

        {activeConversation && !isVirtualEmpty && (
          <ChatInput
            onSendMessage={handleSendMessage}
            isSending={isSending}
            activeConversation={activeConversation}
            token={token}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  );
};

export default ChatModule;
