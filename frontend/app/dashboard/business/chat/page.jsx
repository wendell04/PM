'use client';

import React from 'react';
import ChatModule from '@/components/chat/ChatModule';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminChatPage() {
  const { currentUser: user, token, isLoading: loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#d4a843] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <div className="p-8 text-center text-white">
        Please log in to access the chat.
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] p-4 lg:p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Messages</h1>
          <p className="text-[#888] text-sm">Manage customer inquiries and order specifications in real-time.</p>
        </div>
      </div>
      
      <div className="h-[calc(100%-80px)]">
        <ChatModule user={user} token={token} />
      </div>
    </div>
  );
}
