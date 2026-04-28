'use client';

import React, { useEffect, useRef, useState } from 'react';

const ChatWindow = ({ activeConversation, messages, user, isLoading, isAdmin, onStartChat, isSending, isLoadingMessages, isLoadingConversations, addToCart }) => {
  const scrollRef = useRef(null);
  const [lightboxUrl, setLightboxUrl] = useState('');
  const [addedToCart, setAddedToCart] = useState({});

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!activeConversation) {
    if (isLoadingConversations) {
      return (
        <div className="welcome-screen">
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid rgba(212,168,67,0.2)', borderTopColor: '#d4a843', animation: 'spin 0.8s linear infinite' }} />
        </div>
      );
    }
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
  if (isVirtual && messages.length === 0 && !isLoadingMessages && !isLoadingConversations) {
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
          const msgKey = msg._id || msg.id || `msg-${idx}`;

          if (msg.type === 'quotation' && msg.metadata) {
            const m = msg.metadata;
            const fmt = (n) => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const alreadyAdded = addedToCart[msgKey];

            const handleAddQuotationToCart = async () => {
              if (!addToCart || alreadyAdded) return;
              try {
                await addToCart(
                  {
                    _id: `quotation_${msgKey}`,
                    name: `${m.productName} (${m.qty} pcs)`,
                    flatPrice: m.total,
                    isCustom: true,
                    thumbnail: null,
                  },
                  1, null, null, null,
                  m.note ? { notes: m.note } : null
                );
                setAddedToCart((prev) => ({ ...prev, [msgKey]: true }));
              } catch (err) {
                console.error('Failed to add quotation to cart', err);
              }
            };

            return (
              <div key={msgKey} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', padding: '4px 12px' }}>
                <div style={{
                  background: 'var(--dark2)',
                  border: '1px solid rgba(212,168,67,0.3)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  minWidth: '230px',
                  maxWidth: '280px',
                }}>
                  <div style={{
                    background: 'linear-gradient(135deg,rgba(212,168,67,0.14),rgba(212,168,67,0.04))',
                    borderBottom: '1px solid rgba(212,168,67,0.2)',
                    padding: '8px 14px',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2.5">
                      <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/>
                    </svg>
                    <span style={{ color: '#d4a843', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Quotation</span>
                  </div>

                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--white)', marginBottom: '10px' }}>
                      {m.productName}
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#888', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>{m.qty} pcs &times; &#8369;{fmt(m.unitPrice)}</span>
                      <span>&#8369;{fmt(m.unitPrice * m.qty)}</span>
                    </div>
                    {m.designFee > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#888', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Design fee</span>
                        <span>&#8369;{fmt(m.designFee)}</span>
                      </div>
                    )}
                    {m.deliveryFee > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#888', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Delivery fee</span>
                        <span>&#8369;{fmt(m.deliveryFee)}</span>
                      </div>
                    )}

                    {m.note && (
                      <div style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '6px' }}>
                        {m.note}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '8px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Total</span>
                      <span style={{ fontSize: '1rem', fontWeight: 900, color: '#d4a843' }}>&#8369;{fmt(m.total)}</span>
                    </div>

                    {!isAdmin && !isMe && addToCart && (
                      <button
                        onClick={handleAddQuotationToCart}
                        disabled={alreadyAdded}
                        style={{
                          marginTop: '10px',
                          width: '100%',
                          padding: '8px',
                          borderRadius: '8px',
                          background: alreadyAdded ? 'rgba(34,197,94,0.15)' : '#d4a843',
                          border: alreadyAdded ? '1px solid rgba(34,197,94,0.4)' : 'none',
                          color: alreadyAdded ? '#4ade80' : '#000',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          cursor: alreadyAdded ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        {alreadyAdded ? 'Added to Cart' : 'Add to Cart'}
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: '0.62rem', padding: '0 14px 8px', textAlign: isMe ? 'right' : 'left', opacity: 0.4 }}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={msgKey} className={`bubble ${isMe ? 'me' : 'them'}`}>
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
