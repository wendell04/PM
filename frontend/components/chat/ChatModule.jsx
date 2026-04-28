'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatWindow from './ChatWindow';
import ChatInput from './ChatInput';
import { getConversations, getMessages, sendMessage, markAsRead } from '../../lib/chatApi';
import { getEcho } from '../../lib/echo';
import './chat.css';

const ChatModule = ({ user, token }) => {
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
      
      if (activeConversation) {
        const stillExists = data.find(c => c._id === activeConversation._id || (c.other_user?.id === activeConversation.other_user?.id));
        if (stillExists) setActiveConversation(stillExists);
      } else if (!isAdmin && data.length > 0) {
          // Auto-select Support for customers
          setActiveConversation(data[0]);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [token, activeConversation, isAdmin]);

  useEffect(() => {
    loadConversations();
  }, []);

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
        setMessages(prev => {
          if (prev.find(m => m._id === newMessage._id)) return prev;
          return [...prev, newMessage];
        });
      }
      loadConversations();
    };

    const adminChannel = echo.private('admin.chat');
    if (isAdmin) {
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

  return (
    <div className="chat-container">
      <ChatSidebar 
        conversations={conversations} 
        activeConversation={activeConversation}
        onSelectConversation={setActiveConversation}
        isLoading={isLoadingConversations}
      />

      <div className="chat-main">
        <ChatWindow 
          activeConversation={activeConversation}
          messages={messages}
          user={user}
          isLoading={isLoadingMessages}
          isAdmin={isAdmin}
          onStartChat={(text) => handleSendMessage({ type: 'text', body: text })}
        />
        
        {activeConversation && activeConversation._id !== 'support_auto' && !activeConversation._id.startsWith('new_') && (
          <ChatInput 
            onSendMessage={handleSendMessage} 
            isSending={isSending}
            activeConversation={activeConversation}
          />
        )}
      </div>
    </div>
  );
};

export default ChatModule;
