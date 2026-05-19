'use client';

import React from 'react';
import ChatModule from '@/components/chat/ChatModule';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminChatPage() {
  const { currentUser: user, token, isLoading: loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 80px)', padding: '0 24px', gap: '0' }}>
        <style>{`@keyframes chatPageSkel { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
        {/* Sidebar skeleton */}
        <div style={{ width: '280px', flexShrink: 0, borderRadius: '14px 0 0 14px', border: '1px solid var(--border)', borderRight: 'none', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--dark)' }}>
          <div style={{ height: '36px', borderRadius: '8px', background: 'var(--dark2)', animation: 'chatPageSkel 1.5s ease-in-out infinite' }} />
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--dark2)', flexShrink: 0, animation: 'chatPageSkel 1.5s ease-in-out infinite' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ height: '13px', borderRadius: '6px', background: 'var(--dark2)', width: '70%', animation: 'chatPageSkel 1.5s ease-in-out infinite' }} />
                <div style={{ height: '11px', borderRadius: '6px', background: 'var(--dark2)', width: '90%', animation: 'chatPageSkel 1.5s ease-in-out infinite' }} />
              </div>
            </div>
          ))}
        </div>
        {/* Window skeleton */}
        <div style={{ flex: 1, borderRadius: '0 14px 14px 0', border: '1px solid var(--border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--dark)' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: i % 3 === 2 ? 'flex-end' : 'flex-start' }}>
              <div style={{ height: '40px', width: `${40 + (i * 17) % 40}%`, borderRadius: '12px', background: 'var(--dark2)', animation: 'chatPageSkel 1.5s ease-in-out infinite' }} />
            </div>
          ))}
        </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', padding: '0 24px' }}>
      <div style={{ flex: 1, minHeight: 0, borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <ChatModule user={user} token={token} />
      </div>
    </div>
  );
}
