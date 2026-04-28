'use client';

import React, { useEffect, useRef, useState } from 'react';

const ChatWindow = ({ activeConversation, messages, user, isLoading, isAdmin, onStartChat, isSending, isLoadingMessages }) => {
  const scrollRef = useRef(null);
  const [lightboxUrl, setLightboxUrl] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!activeConversation) {
    return (
      <div className="welcome-screen">
        <div className="welcome-logo-box">
          <img src="/logos/PersonalizeMe logo.png" alt="" style={{ width: '60px' }} />
        </div>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', fontWeight: 900 }}>Welcome to Support</h3>
        <p style={{ color: '#888', maxWidth: '250px', fontSize: '0.85rem', marginBottom: '30px' }}>
          Select a conversation from the sidebar to start messaging.
        </p>
      </div>
    );
  }

  // Virtual conversation welcome screen
  const isVirtual = activeConversation._id === 'support_auto' || activeConversation._id?.startsWith('new_');
  if (isVirtual && messages.length === 0 && !isLoadingMessages) {
    const otherUser = activeConversation.other_user;
    return (
      <div className="welcome-screen">
        {isAdmin ? (
          <div className="welcome-logo-box" style={{ overflow: 'hidden' }}>
            {otherUser?.avatar ? (
              <img src={otherUser.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '2rem', fontWeight: 900, color: '#D4A843' }}>
                {(otherUser?.name || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        ) : (
          <div className="welcome-logo-box">
            <img src="/logos/PersonalizeMe logo.png" alt="" style={{ width: '60px' }} />
          </div>
        )}
        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', fontWeight: 900 }}>
          {isAdmin ? (otherUser?.name || 'Customer') : 'PersonalizeMe Support'}
        </h3>
        <p style={{ color: '#888', maxWidth: '280px', fontSize: '0.85rem', marginBottom: '30px' }}>
          {isAdmin
            ? "This customer hasn't received any messages yet. Be the first to reach out!"
            : 'How can we help you today? Our team is here to assist with your custom orders.'}
        </p>
        {!isSending && (
          <button
            className="start-btn"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.preventDefault();
              onStartChat(isAdmin ? `Hello! How can I help you today?` : 'Hello! I would like to inquire about my order.');
            }}
          >
            Start Conversation
          </button>
        )}
        {isSending && (
          <div style={{ color: '#888', fontSize: '0.85rem' }}>Sending...</div>
        )}
      </div>
    );
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
      <div className="chat-header">
        <div className="chat-avatar" style={{ width: '36px', height: '36px' }}>
          {activeConversation.other_user?.avatar ? (
            <img src={activeConversation.other_user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{(activeConversation.other_user?.name || 'U').charAt(0)}</span>
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>{activeConversation.other_user?.name || 'Chat'}</div>
          <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Online</div>
        </div>
      </div>

      <div className="chat-messages custom-scrollbar" ref={scrollRef}>
        <div style={{ textAlign: 'center', padding: '20px 0', opacity: 0.3, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
          Beginning of conversation
        </div>
        
        {messages.map((msg, idx) => {
          const isMe = msg.sender_id === (user.id || user._id);
          return (
            <div key={msg._id || msg.id || `msg-${idx}`} className={`bubble ${isMe ? 'me' : 'them'}`}>
              {msg.type === 'image' && msg.file_url && (
                <img
                  src={msg.file_url}
                  alt=""
                  onClick={() => setLightboxUrl(msg.file_url)}
                  style={{ maxWidth: '220px', maxHeight: '180px', objectFit: 'contain', borderRadius: '10px', marginBottom: '8px', display: 'block', cursor: 'zoom-in' }}
                />
              )}
              <div style={{ wordBreak: 'break-word' }}>{msg.body}</div>
              <div style={{ fontSize: '0.65rem', marginTop: '4px', opacity: 0.5, textAlign: 'right', fontWeight: 700 }}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {lightboxUrl && (

      <div
        onClick={() => setLightboxUrl('')}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out',
        }}
      >
        <img
          src={lightboxUrl}
          alt=""
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '10px', cursor: 'default' }}
        />
        <button
          type="button"
          onClick={() => setLightboxUrl('')}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: '1.2rem', cursor: 'pointer',
            width: '40px', height: '40px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
        >✕</button>
      </div>
    )}
    </>
  );
};

export default ChatWindow;
