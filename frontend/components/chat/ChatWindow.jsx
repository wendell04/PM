'use client';

import React, { useEffect, useRef, useState } from 'react';

const isRecentlySeen = (ts) => ts && Date.now() - new Date(ts).getTime() < 120_000;

const dateLabel = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
};

const ChatWindow = ({ activeConversation, messages, user, isLoading, isAdmin, onStartChat, isSending, isLoadingMessages, isLoadingConversations, addToCart, onlineUsers = new Set(), typingUsers = {} }) => {
  const scrollRef = useRef(null);
  const [lightboxUrl, setLightboxUrl] = useState('');
  const [addedToCart, setAddedToCart] = useState({});

  const typingNames = Object.entries(typingUsers)
    .filter(([uid]) => uid !== String(user?.id || user?._id || ''))
    .map(([, name]) => name);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingNames.length]);

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
          <img src="/logos/PersonalizeMe logo.png" alt="" style={{ width: '60px', objectFit: 'contain' }} />
        </div>
        <h3 className="welcome-title">Customer Inbox</h3>
        <p className="welcome-sub">
          Select a conversation to start responding to your customers.
        </p>
        <div className="welcome-feature-row">
          <div className="welcome-feature">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/>
            </svg>
            <span>Quotations</span>
          </div>
          <div className="welcome-feature">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Images</span>
          </div>
          <div className="welcome-feature">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Real-time</span>
          </div>
        </div>
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
        <h3 className="welcome-title">
          {isAdmin ? (otherUser?.name || 'Customer') : 'PersonalizeMe Support'}
        </h3>
        <p className="welcome-sub" style={{ maxWidth: '280px' }}>
          {isAdmin
            ? "This customer hasn't received any messages yet. Be the first to reach out!"
            : 'How can we help you today? Our team is here to assist with your custom orders.'}
        </p>
        {!isAdmin && !isSending && (
          <button
            className="start-btn"
            onClick={(e) => {
              e.preventDefault();
              onStartChat('Hi! This is the Personalize Me Prints team. How can we help you?');
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

  const renderMessage = (msg, idx) => {
    const myId = String(user?.id || user?._id || '');
    const isMe = msg.sender_id === myId;
    const msgKey = msg._id || msg.id || `msg-${idx}`;

    if (msg.type === 'inquiry' && msg.metadata) {
      const m = msg.metadata;
      return (
        <div key={msgKey} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', padding: '4px 12px' }}>
          <div className="quotation-card">
            <div className="quotation-header">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span className="quotation-tag">Inquiry</span>
            </div>
            <a href={`/shop/products/${m.productSlug || m.productId || ''}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <div className="quotation-body" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {m.thumbnail ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={m.thumbnail} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 46, height: 46, borderRadius: 8, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="quotation-product" style={{ margin: 0 }}>{m.productName}</div>
                  {m.category && <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{m.category}</div>}
                </div>
              </div>
            </a>
            {msg.body && <div style={{ padding: '2px 12px 6px', fontSize: '0.82rem', color: '#4b5563' }}>{msg.body}</div>}
            <div className="quotation-timestamp" style={{ textAlign: isMe ? 'right' : 'left' }}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === 'quotation' && msg.metadata) {
      const m = msg.metadata;
      const fmt = (n) => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const alreadyAdded = addedToCart[msgKey];

      const handleAddQuotationToCart = async () => {
        if (!addToCart || alreadyAdded) return;
        try {
          await addToCart(
            { _id: `quotation_${msgKey}`, name: `${m.productName} (${m.qty} pcs)`, flatPrice: m.total, isCustom: true, thumbnail: null },
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
          <div className="quotation-card">
            <div className="quotation-header">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2.5">
                <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/>
              </svg>
              <span className="quotation-tag">Quotation</span>
            </div>
            <div className="quotation-body">
              <div className="quotation-product">{m.productName}</div>
              <div className="quotation-line">
                <span>{m.qty} pcs &times; &#8369;{fmt(m.unitPrice)}</span>
                <span>&#8369;{fmt(m.unitPrice * m.qty)}</span>
              </div>
              {m.designFee > 0 && (
                <div className="quotation-line"><span>Design fee</span><span>&#8369;{fmt(m.designFee)}</span></div>
              )}
              {m.deliveryFee > 0 && (
                <div className="quotation-line"><span>Delivery fee</span><span>&#8369;{fmt(m.deliveryFee)}</span></div>
              )}
              {m.note && <div className="quotation-note">{m.note}</div>}
              <div className="quotation-total-row">
                <span className="quotation-total-label">Total</span>
                <span className="quotation-total-amount">&#8369;{fmt(m.total)}</span>
              </div>
              {m.orderRequestId && m.downPayment != null && (
                <div className="quotation-line"><span>Downpayment ({m.downPaymentPct ?? 50}%)</span><span>&#8369;{fmt(m.downPayment)}</span></div>
              )}
              {!isAdmin && !isMe && !m.orderRequestId && addToCart && (
                <button
                  onClick={handleAddQuotationToCart}
                  disabled={alreadyAdded}
                  className={`btn-add-cart${alreadyAdded ? ' added' : ''}`}
                >
                  {alreadyAdded ? 'Added to Cart' : 'Add to Cart'}
                </button>
              )}
            </div>
            <div className="quotation-timestamp" style={{ textAlign: isMe ? 'right' : 'left' }}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={msgKey} className={`bubble ${isMe ? 'me' : 'them'}`}
        style={msg.pending ? { opacity: 0.6 } : msg.failed ? { opacity: 0.7 } : undefined}>
        {msg.type === 'image' && msg.file_url ? (
          <div style={{ display: 'block', overflow: 'hidden', borderRadius: '10px', marginBottom: '8px', lineHeight: 0 }}>
            <img
              src={msg.file_url}
              alt=""
              onClick={() => setLightboxUrl(msg.file_url)}
              style={{ display: 'block', width: '100%', maxWidth: '260px', height: 'auto', cursor: 'zoom-in', borderRadius: '10px' }}
            />
          </div>
        ) : msg.body ? (
          <div style={{ wordBreak: 'break-word' }}>{msg.body}</div>
        ) : null}
        <div className="bubble-time" style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
          {msg.failed ? (
            <span style={{ color: '#ef4444', fontSize: '10px' }}>Failed to send</span>
          ) : msg.pending ? (
            <span style={{ fontSize: '10px', opacity: 0.7 }}>Sending…</span>
          ) : (
            new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
        <div className="chat-header">
          {(() => {
            const isOnline = onlineUsers.has(activeConversation.other_user?.id) || isRecentlySeen(activeConversation.other_user?.last_seen_at);
            const role = activeConversation.other_user?.role;
            const roleLabel = role === 'admin' || role === 'owner' ? 'Staff' : 'Customer';
            return (
              <>
                <div className="chat-avatar" style={{ width: '38px', height: '38px', position: 'relative', flexShrink: 0 }}>
                  {activeConversation.other_user?.avatar ? (
                    <img src={activeConversation.other_user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>{(activeConversation.other_user?.name || 'U').charAt(0)}</span>
                  )}
                  {isOnline && (
                    <span style={{ position: 'absolute', bottom: '1px', right: '1px', width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', border: '2px solid var(--dark2)' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="chat-header-name">{activeConversation.other_user?.name || 'Chat'}</div>
                  <div className="chat-header-meta">
                    <span className={`chat-header-status ${isOnline ? 'online' : 'offline'}`}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                    <span className="chat-header-dot">·</span>
                    <span className="chat-header-role">{roleLabel}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div className="chat-messages custom-scrollbar" ref={scrollRef}>
          <div className="chat-thread-start">Beginning of conversation</div>

          {isLoadingMessages ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid rgba(212,168,67,0.2)', borderTopColor: '#d4a843', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            (() => {
              const items = [];
              let lastLabel = null;
              messages.forEach((msg, idx) => {
                const label = dateLabel(msg.created_at);
                if (label && label !== lastLabel) {
                  lastLabel = label;
                  items.push(
                    <div key={`datesep-${idx}`} className="chat-date-sep">
                      <span>{label}</span>
                    </div>
                  );
                }
                items.push(renderMessage(msg, idx));
              });
              return items;
            })()
          )}

          {typingNames.length > 0 && (
            <div className="typing-indicator">
              <span className="typing-dots"><span /><span /><span /></span>
              <span className="typing-label">
                {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing
              </span>
            </div>
          )}
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
              color: '#fff', cursor: 'pointer',
              width: '40px', height: '40px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </>
  );
};

export default ChatWindow;
