'use client';

import React, { useState, useMemo } from 'react';

const isRecentlySeen = (ts) => ts && Date.now() - new Date(ts).getTime() < 120_000;

const formatConvTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (now - d < 7 * 864e5) return d.toLocaleDateString('en-PH', { weekday: 'short' });
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

const ChatSidebar = ({ conversations, activeConversation, onSelectConversation, isLoading, onlineUsers = new Set() }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c =>
      (c.other_user?.name || '').toLowerCase().includes(q) ||
      (c.last_message || '').toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
  const onlineCount = conversations.filter(c =>
    onlineUsers.has(c.other_user?.id) || isRecentlySeen(c.other_user?.last_seen_at)
  ).length;

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-top">
          <div>
            <div className="chat-sidebar-title">Inbox</div>
            <div className="chat-sidebar-meta">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} · {onlineCount} online
            </div>
          </div>
          {totalUnread > 0 && (
            <span className="chat-total-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
          )}
        </div>
        <div className="chat-search-wrap">
          <svg className="chat-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className="chat-search-input"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="chat-search-clear" onClick={() => setSearch('')}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="chat-list custom-scrollbar">
        {isLoading ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} className="chat-item" style={{ cursor: 'default', pointerEvents: 'none' }}>
              <div className="chat-avatar" style={{ animation: 'shimmer 1.5s ease-in-out infinite', background: 'rgba(255,255,255,0.06)' }} />
              <div className="chat-info">
                <div className="chat-skeleton-line" style={{ width: '52%', marginBottom: '8px' }} />
                <div className="chat-skeleton-line" style={{ width: '78%' }} />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="chat-empty">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div className="chat-empty-text">
              {search ? 'No results found' : 'No conversations yet'}
            </div>
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = activeConversation?._id === conv._id ||
              (conv._id?.startsWith('new_') && activeConversation?.other_user?.id === conv.other_user?.id);
            const isSupport = conv.other_user?.role === 'admin' || conv.other_user?.role === 'owner';
            const avatarSrc = conv.other_user?.avatar || (isSupport ? '/logos/PersonalizeMe logo.png' : null);
            const isOnline = onlineUsers.has(conv.other_user?.id) || isRecentlySeen(conv.other_user?.last_seen_at);
            const hasUnread = conv.unread_count > 0 && !isActive;

            return (
              <div
                key={conv._id || conv.other_user?.id}
                onClick={() => onSelectConversation(conv)}
                className={`chat-item${isActive ? ' active' : ''}${hasUnread ? ' has-unread' : ''}`}
              >
                <div className="chat-avatar-wrap">
                  <div className="chat-avatar">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span>{(conv.other_user?.name || 'U').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  {isOnline && <span className="chat-online-dot" />}
                </div>

                <div className="chat-info">
                  <div className="chat-item-row">
                    <div className="chat-name">{conv.other_user?.name || 'User'}</div>
                    <div className="chat-item-time">{formatConvTime(conv.updated_at)}</div>
                  </div>
                  <div className="chat-item-row" style={{ marginTop: '2px' }}>
                    <div className={`chat-last-msg${hasUnread ? ' unread' : ''}`}>
                      {conv.last_message || 'No messages yet'}
                    </div>
                    {hasUnread && (
                      <span className="chat-unread-badge">{conv.unread_count > 9 ? '9+' : conv.unread_count}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
