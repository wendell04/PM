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
      <div className="p-8 text-center" style={{ color: 'var(--white)' }}>
        Please log in to access the chat.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', padding: '20px 24px 0' }}>
      <div style={{ marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--white)', letterSpacing: '-0.01em', margin: 0 }}>Messages</h1>
        </div>
        <p style={{ fontSize: '0.78rem', color: '#555', margin: 0, paddingLeft: '28px' }}>
          Manage customer inquiries and order specifications in real-time.
        </p>
      </div>

      <div style={{ flex: 1, minHeight: 0, borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <ChatModule user={user} token={token} />
      </div>
    </div>
  );
}
