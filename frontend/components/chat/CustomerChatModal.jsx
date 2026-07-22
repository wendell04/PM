'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ChatInput from './ChatInput';
import { getMessages, sendMessage, markAsRead, sendHeartbeat, getConversations } from '../../lib/chatApi';
import { getEcho } from '../../lib/echo';
import './chat.css';

const isRecentlySeen = (ts) => ts && Date.now() - new Date(ts).getTime() < 120_000;

const nid = (id) => {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object') return id.$oid ?? String(id);
  return String(id);
};
const normalizeMsg = (m) =>
  m ? { ...m, _id: nid(m._id), conversation_id: nid(m.conversation_id), sender_id: nid(m.sender_id) } : m;

const FAQS = [
  { q: 'How do I place a custom order?' },
  { q: 'How long does delivery take?' },
  { q: 'What payment methods do you accept?' },
  { q: 'Can I request a sample before ordering?' },
  { q: 'What is your return and refund policy?' },
];

const TypingDots = () => (
  <div className="cw-typing-bubble">
    <span /><span /><span />
  </div>
);

const CustomerChatWidget = ({ user, token, addToCart, onlineUsers = new Set(), onRequestLogin }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('home');
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [isLoadingConvs, setIsLoadingConvs] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [unreadTotal, setUnreadTotal] = useState(0);
  const typingTimeoutRefs = useRef({});
  const conversationChannelRef = useRef(null);
  const activeConvRef = useRef(null);
  const scrollRef = useRef(null);
  const pendingFaqRef = useRef(null);
  const pendingCardRef = useRef(null);
  const lastInquiryRef = useRef({ key: '', at: 0 });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, Object.keys(typingUsers).length]);

  // Keep ref in sync — used in loadConversations to avoid stale closure
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  const loadConversations = useCallback(async () => {
    if (!token || !user) return;
    try {
      setIsLoadingConvs(true);
      const convs = await getConversations(token);
      setConversations(convs);
      setUnreadTotal(convs.reduce((s, c) => s + (c.unread_count || 0), 0));

      // Detect new messages for the active conversation via timestamp
      const curr = activeConvRef.current;
      if (curr && !curr._id?.startsWith('new_') && curr._id !== 'support_auto') {
        const fresh = convs.find(c => nid(c._id) === nid(curr._id));
        if (fresh) {
          const prevAt = curr.last_message_at ?? '';
          const newAt = fresh.last_message_at ?? '';
          if (newAt && prevAt !== newAt) {
            try {
              const msgs = await getMessages(token, nid(fresh._id));
              setMessages(prev => {
                const normalized = msgs.map(normalizeMsg);
                const freshIds = new Set(normalized.map(m => String(m._id)));
                // Keep local messages not yet in the fetch — pending OR just-confirmed (racing the DB
                // read) — so a just-sent message isn't dropped from the view before it re-appears.
                const localExtra = prev.filter(m => !freshIds.has(String(m._id)) &&
                  (m.pending || (m.created_at && Date.now() - new Date(m.created_at).getTime() < 15000)));
                return [...normalized, ...localExtra];
              });
            } catch { /* silent */ }
          }
          setActiveConv(fresh);
        }
      }
    } catch { /* silent */ } finally {
      setIsLoadingConvs(false);
    }
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return;
    loadConversations();
    const id = setInterval(loadConversations, 8000);
    return () => clearInterval(id);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConv || !token) return;
    if (activeConv._id?.startsWith('new_') || activeConv._id === 'support_auto') {
      setMessages([]);
      return;
    }
    const load = async () => {
      try {
        setIsLoadingMsgs(true);
        const data = await getMessages(token, activeConv._id);
        setMessages(data.map(normalizeMsg));
        if (activeConv.unread_count > 0) {
          await markAsRead(token, activeConv._id);
          loadConversations();
        }
      } catch { /* silent */ } finally {
        setIsLoadingMsgs(false);
      }
    };
    load();
  }, [activeConv?._id, token]);

  // Message polling — 1.5s fallback, normalized ID to handle {$oid} objects
  useEffect(() => {
    if (!activeConv || activeConv._id?.startsWith('new_') || activeConv._id === 'support_auto' || !token) return;
    const convId = nid(activeConv._id);
    const poll = async () => {
      try {
        const data = await getMessages(token, convId);
        setMessages(prev => {
          const confirmedIds = new Set(data.map(m => normalizeMsg(m)._id));
          const withoutStale = prev.filter(m => !m.pending || !confirmedIds.has(m._id));
          const existingIds = new Set(withoutStale.map(m => m._id));
          const fresh = data.map(normalizeMsg).filter(m => !existingIds.has(m._id));
          return fresh.length > 0 ? [...withoutStale, ...fresh] : withoutStale.length !== prev.length ? withoutStale : prev;
        });
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [activeConv?._id, token]);

  // Heartbeat
  useEffect(() => {
    if (!token) return;
    sendHeartbeat(token);
    const id = setInterval(() => sendHeartbeat(token), 30000);
    return () => clearInterval(id);
  }, [token]);

  // WebSocket real-time — normalized conversation ID
  useEffect(() => {
    if (!user || !token || !activeConv || activeConv._id?.startsWith('new_') || activeConv._id === 'support_auto') return;
    const echo = getEcho(token);
    if (!echo) return;
    const convId = nid(activeConv._id);
    const channel = echo.private(`conversation.${convId}`);
    channel.listen('.message.sent', (data) => {
      const msg = normalizeMsg(data.message);
      setMessages(prev => prev.find(m => m._id === msg._id) ? prev : [...prev, msg]);
    });
    channel.listenForWhisper('typing', (data) => {
      const uid = String(data.userId || '');
      if (!uid) return;
      setTypingUsers(prev => ({ ...prev, [uid]: data.name || 'Someone' }));
      if (typingTimeoutRefs.current[uid]) clearTimeout(typingTimeoutRefs.current[uid]);
      typingTimeoutRefs.current[uid] = setTimeout(() => {
        setTypingUsers(prev => { const u = { ...prev }; delete u[uid]; return u; });
        delete typingTimeoutRefs.current[uid];
      }, 3000);
    });
    conversationChannelRef.current = channel;
    return () => {
      conversationChannelRef.current = null;
      channel.stopListening('.message.sent');
      channel.stopListeningForWhisper('typing');
    };
  }, [activeConv?._id, user, token]);

  const handleTyping = useCallback(() => {
    if (!conversationChannelRef.current) return;
    try {
      conversationChannelRef.current.whisper('typing', {
        userId: String(user?.id || user?._id || ''),
        name: user?.name || 'Someone',
      });
    } catch { /* ignore */ }
  }, [user]);

  const handleSendMessage = async (payload) => {
    const tempId = `pending_${Date.now()}`;
    const isNewConv = activeConv._id?.startsWith('new_') || activeConv._id === 'support_auto';

    // Optimistic: show bubble immediately
    const optimistic = normalizeMsg({
      _id: tempId,
      conversation_id: activeConv._id || '',
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
        actualPayload.recipient_id = activeConv.other_user.id;
        delete actualPayload.conversation_id;
      }
      const newMessage = normalizeMsg(await sendMessage(token, actualPayload));

      // Replace the optimistic bubble with the confirmed message. If the realtime socket already
      // delivered the same message (it can beat the HTTP response), just drop the placeholder instead
      // of swapping it in — otherwise we'd end up with two copies (the duplicate inquiry/quote card bug).
      setMessages(prev => prev.some(m => m._id === newMessage._id)
        ? prev.filter(m => m._id !== tempId)
        : prev.map(m => m._id === tempId ? newMessage : m));

      if (isNewConv) {
        const convs = await getConversations(token);
        const real = convs.find(c => c._id === newMessage.conversation_id);
        if (real) setActiveConv(real);
        setConversations(convs);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => prev.map(m => m._id === tempId ? { ...m, failed: true, pending: false } : m));
    } finally {
      setIsSending(false);
    }
  };

  const openConversation = (conv) => {
    if (activeConv?._id !== conv._id) setMessages([]);
    setActiveConv(conv);
    setTypingUsers({});
    setView('chat');
  };

  // Auto-send FAQ question once chat view is ready
  useEffect(() => {
    if (view !== 'chat' || !activeConv) return;
    if (pendingCardRef.current) {
      const card = pendingCardRef.current;
      pendingCardRef.current = null;
      // Dedupe the ACTUAL send — the support_auto → real-conversation transition can re-fire this effect.
      const key = card.productId || card.productName || '';
      const now = Date.now();
      if (lastInquiryRef.current.key === key && now - lastInquiryRef.current.at < 6000) return;
      lastInquiryRef.current = { key, at: now };
      handleSendMessage({ body: `Hi! I'd like to inquire about ${card.productName}.`, type: 'inquiry', metadata: card, conversation_id: activeConv._id });
      return;
    }
    if (!pendingFaqRef.current) return;
    const q = pendingFaqRef.current;
    pendingFaqRef.current = null;
    handleSendMessage({ body: q, type: 'text', conversation_id: activeConv._id });
  }, [view, activeConv]);

  const handleFaqClick = (question) => {
    if (!token) { onRequestLogin?.(); return; }
    pendingFaqRef.current = question;
    openNewChat();
  };

  const openNewChat = () => {
    // Reuse the existing store conversation (a customer chats with a single store) — prefer the
    // admin/owner thread, else the most recent one — so we never fragment the history into a fresh
    // "support_auto" thread (which clears messages) when a conversation already exists.
    const supportConv = conversations.find(
      c => c.other_user?.role === 'admin' || c.other_user?.role === 'owner'
    ) || conversations[0];
    if (supportConv) {
      openConversation(supportConv);
    } else {
      openConversation({
        _id: 'support_auto',
        // id MUST be 'support_auto' so the backend resolves it to the real store admin/owner
        // (ChatController@store special-cases 'support_auto'/'admin_auto'). 'support' would NOT
        // resolve → the message fails to send.
        other_user: { id: 'support_auto', name: 'PersonalizeMe Support', role: 'admin' },
        unread_count: 0,
        last_message: '',
      });
    }
  };

  // Let other parts of the app (e.g. the "Request a Quote" button) open the chat with a
  // prefilled first message — reuses the FAQ auto-send path (pendingFaqRef).
  useEffect(() => {
    const handleOpenChat = (e) => {
      if (!token) { onRequestLogin?.(); return; }
      const card = e.detail?.inquiryCard;
      if (card) {
        pendingCardRef.current = card;
      } else if (e.detail?.message) {
        pendingFaqRef.current = e.detail.message;
      }
      setOpen(true);
      openNewChat();
    };
    window.addEventListener('pmp_open_chat', handleOpenChat);
    return () => window.removeEventListener('pmp_open_chat', handleOpenChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, conversations]);

  const typingNames = activeConv
    ? Object.entries(typingUsers)
        .filter(([uid]) => uid !== String(user?.id || user?._id || ''))
        .map(([, name]) => name)
    : [];

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        className={`cw-launcher ${open ? 'cw-launcher--open' : ''}`}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && conversations.length > 0 && view === 'home') setView('messages');
        }}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unreadTotal > 0 && (
              <span className="cw-launcher-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
            )}
          </>
        )}
      </button>

      {/* Widget panel */}
      {open && (
        <div className="cw-panel">

          {/* ── Home view ── */}
          {view === 'home' && (
            <>
              <div className="cw-home-header">
                <button type="button" className="cw-close" onClick={() => setOpen(false)} aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
                <img src="/logos/PersonalizeMe logo.png" alt="" className="cw-home-logo" />
                <div className="cw-home-greeting">Hi{user?.firstName ? `, ${user.firstName}` : ' there'}</div>
                <div className="cw-home-tagline">How can we help?</div>
              </div>
              <div className="cw-home-body">
                <button
                  type="button"
                  className="cw-send-msg-row"
                  onClick={() => {
                    if (!user) { onRequestLogin?.(); setOpen(false); return; }
                    setView('messages');
                  }}
                >
                  <div>
                    <div className="cw-send-msg-title">Send us a message</div>
                    <div className="cw-send-msg-sub">We will be back as soon as possible</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>

                <div className="cw-faq-section">
                  <div className="cw-faq-label">Search for help</div>
                  {FAQS.map((f, i) => (
                    <button key={i} type="button" className="cw-faq-item" onClick={() => handleFaqClick(f.q)}>
                      <span>{f.q}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Messages list view ── */}
          {view === 'messages' && (
            <>
              <div className="cw-nav-header">
                <button type="button" className="cw-back" onClick={() => setView('home')} aria-label="Back">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="cw-nav-title">Messages</span>
                <button type="button" className="cw-close" style={{ position: 'static' }} onClick={() => setOpen(false)} aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="cw-msgs-body">
                {isLoadingConvs ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid rgba(212,168,67,0.2)', borderTopColor: '#d4a843', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="cw-no-msgs">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.95rem' }}>No messages</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Messages from the team will be shown here</div>
                  </div>
                ) : (
                  <div className="cw-conv-list">
                    {conversations.map(conv => {
                      const isSupport = conv.other_user?.role === 'admin' || conv.other_user?.role === 'owner';
                      const avatarSrc = isSupport ? '/logos/PersonalizeMe logo.png' : conv.other_user?.avatar || null;
                      return (
                        <button key={conv._id} type="button" className="cw-conv-item" onClick={() => openConversation(conv)}>
                          <div className="cw-conv-avatar">
                            {avatarSrc
                              ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span>{(conv.other_user?.name || 'U').charAt(0).toUpperCase()}</span>}
                          </div>
                          <div className="cw-conv-info">
                            <div className="cw-conv-name">{conv.other_user?.name || 'Support'}</div>
                            <div className="cw-conv-last">{conv.last_message || 'Start a conversation'}</div>
                          </div>
                          {conv.unread_count > 0 && <div className="cw-unread-dot" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Chat view ── */}
          {view === 'chat' && activeConv && (
            <>
              <div className="cw-nav-header">
                <button
                  type="button"
                  className="cw-back"
                  onClick={() => { setView('messages'); setActiveConv(null); setMessages([]); setTypingUsers({}); }}
                  aria-label="Back"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <div className="cw-conv-avatar" style={{ width: '28px', height: '28px', fontSize: '0.72rem', flexShrink: 0 }}>
                    {(() => {
                      const isSupport = activeConv.other_user?.role === 'admin' || activeConv.other_user?.role === 'owner';
                      const src = isSupport ? '/logos/PersonalizeMe logo.png' : activeConv.other_user?.avatar || null;
                      return src
                        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                        : <span>{(activeConv.other_user?.name || 'U').charAt(0).toUpperCase()}</span>;
                    })()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="cw-nav-title" style={{ fontSize: '0.82rem' }}>{activeConv.other_user?.name || 'Support'}</div>
                    {(() => {
                      const online = onlineUsers.has(activeConv.other_user?.id) || isRecentlySeen(activeConv.other_user?.last_seen_at);
                      return <div style={{ fontSize: '0.65rem', color: online ? '#22c55e' : 'var(--gray)', fontWeight: 600 }}>{online ? 'Online' : 'Offline'}</div>;
                    })()}
                  </div>
                </div>
                <button type="button" className="cw-close" style={{ position: 'static' }} onClick={() => setOpen(false)} aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="cw-messages" ref={scrollRef}>
                {isLoadingMsgs ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid rgba(212,168,67,0.2)', borderTopColor: '#d4a843', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : (
                  <>
                    <div className="cw-thread-start">Beginning of conversation</div>
                    {messages.map((msg, idx) => {
                      const myId = String(user?.id || user?._id || '');
                      const isMe = msg.sender_id === myId;
                      const msgKey = msg._id || `msg-${idx}`;

                      if (msg.type === 'image' && msg.file_url) {
                        return (
                          <div key={msgKey} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                            <img src={msg.file_url} alt="" style={{ maxWidth: '65%', borderRadius: '10px', border: '1px solid var(--border)' }} />
                          </div>
                        );
                      }

                      if (msg.type === 'inquiry' && msg.metadata) {
                        const m = msg.metadata;
                        return (
                          <div key={msgKey} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                            <div className="quotation-card">
                              <div className="quotation-header">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                <span className="quotation-tag">Inquiry</span>
                              </div>
                              <a href={`/shop/products/${m.productSlug || m.productId || ''}`} style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
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
                              <div className="quotation-timestamp">{formatTime(msg.created_at)}</div>
                            </div>
                          </div>
                        );
                      }

                      if (msg.type === 'quotation' && msg.metadata) {
                        const m = msg.metadata;
                        const fmt = (n) => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        // Quotes are multi-item now; cards sent before that only carry the
                        // singular fields, so fold them into the same shape.
                        const lines = Array.isArray(m.items) && m.items.length
                          ? m.items
                          : [{
                              productName: m.productName,
                              qty: m.qty ?? 1,
                              unitPrice: m.unitPrice ?? 0,
                              lineTotal: (m.unitPrice ?? 0) * (m.qty ?? 1),
                            }];
                        return (
                          <div key={msgKey} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                            <div className="quotation-card">
                              <div className="quotation-header">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2.5"><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="12" y2="15" /></svg>
                                <span className="quotation-tag">Quotation</span>
                              </div>
                              <div className="quotation-body">
                                {lines.map((li, li_i) => (
                                  // Keyed by index too: one product can appear on several
                                  // lines (a shirt printed in two sizes).
                                  <div key={`${li.productId ?? 'l'}-${li_i}`} style={{ marginBottom: '6px' }}>
                                    <div className="quotation-product" style={{ marginBottom: '2px' }}>
                                      {li.productName}
                                      {li.variantName && (
                                        <span style={{ fontWeight: 500, color: '#6b7280' }}> - {li.variantName}</span>
                                      )}
                                    </div>
                                    <div className="quotation-line">
                                      <span>{li.qty} pcs x &#8369;{fmt(li.unitPrice)}</span>
                                      <span>&#8369;{fmt(li.lineTotal ?? li.unitPrice * li.qty)}</span>
                                    </div>
                                  </div>
                                ))}
                                {m.designFee > 0 && <div className="quotation-line"><span>Design fee</span><span>&#8369;{fmt(m.designFee)}</span></div>}
                                {m.deliveryFee > 0 && <div className="quotation-line"><span>Delivery fee</span><span>&#8369;{fmt(m.deliveryFee)}</span></div>}
                                {m.note && <div className="quotation-note">{m.note}</div>}
                                {m.designUrl && (
                                  <a href={m.designUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', textDecoration: 'none' }}>
                                    <img src={m.designUrl} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#2563eb' }}>View attached design</span>
                                  </a>
                                )}
                                <div className="quotation-total-row">
                                  <span className="quotation-total-label">Total</span>
                                  <span className="quotation-total-amount">&#8369;{fmt(m.total)}</span>
                                </div>
                                {m.orderRequestId && m.downPayment != null && (
                                  <div className="quotation-line"><span>Downpayment ({m.downPaymentPct ?? 50}%)</span><span>&#8369;{fmt(m.downPayment)}</span></div>
                                )}
                                {!isMe && (m.orderRequestId ? (
                                  <a href={`/shop/checkout/quote/${m.orderRequestId}`} className="btn-add-cart" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                                    View &amp; Pay
                                  </a>
                                ) : addToCart && (
                                  <button className="btn-add-cart" onClick={() => addToCart({ _id: `quotation_${msgKey}`, name: `${m.productName} (${m.qty} pcs)`, flatPrice: m.total, isCustom: true, thumbnail: null }, 1, null, null, null, m.note ? { notes: m.note } : null)}>
                                    Add to Cart
                                  </button>
                                ))}
                              </div>
                              <div className="quotation-timestamp">{formatTime(msg.created_at)}</div>
                            </div>
                          </div>
                        );
                      }

                      const body = msg.body || msg.text || msg.message || '';
                      return (
                        <div key={msgKey} className={`cw-bubble-wrap ${isMe ? 'me' : 'them'}`}
                          style={msg.pending ? { opacity: 0.6 } : msg.failed ? { opacity: 0.7 } : undefined}>
                          <div className={`cw-bubble ${isMe ? 'me' : 'them'}`}>{body}</div>
                          <div className="cw-bubble-time">
                            {msg.failed ? (
                              <span style={{ color: '#ef4444' }}>Failed to send</span>
                            ) : msg.pending ? (
                              <span>Sending…</span>
                            ) : (
                              formatTime(msg.created_at)
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {typingNames.length > 0 && (
                      <div className="cw-bubble-wrap them">
                        <TypingDots />
                      </div>
                    )}
                  </>
                )}
              </div>

              <ChatInput
                onSendMessage={handleSendMessage}
                isSending={isSending}
                activeConversation={activeConv}
                token={token}
                isAdmin={false}
                onTyping={handleTyping}
              />
            </>
          )}
        </div>
      )}
    </>
  );
};

export default CustomerChatWidget;
