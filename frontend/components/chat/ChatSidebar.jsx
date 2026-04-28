'use client';

import React from 'react';

const isRecentlySeen = (ts) => ts && Date.now() - new Date(ts).getTime() < 120_000;

const ChatSidebar = ({ conversations, activeConversation, onSelectConversation, isLoading, onlineUsers = new Set() }) => {
  if (isLoading) {
    return (
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">Messages</div>
        <div className="chat-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="chat-item" style={{ opacity: 0.3 }}>
              <div className="chat-avatar"></div>
              <div className="chat-info">
                 <div style={{ height: '10px', background: '#333', width: '60%' }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">Messages</div>
      <div className="chat-list custom-scrollbar">
        {conversations.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.8rem', color: '#666' }}>
            No chats available
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeConversation?._id === conv._id ||
                            (conv._id?.startsWith('new_') && activeConversation?.other_user?.id === conv.other_user.id);

            const isSupport = conv.other_user?.role === 'admin' || conv.other_user?.role === 'owner';
            const avatarSrc = conv.other_user?.avatar || (isSupport ? '/logos/PersonalizeMe logo.png' : null);
            const isOnline = onlineUsers.has(conv.other_user?.id) || isRecentlySeen(conv.other_user?.last_seen_at);

            return (
              <div
                key={conv._id || conv.other_user.id}
                onClick={() => onSelectConversation(conv)}
                className={`chat-item ${isActive ? 'active' : ''}`}
              >
                <div className="chat-avatar" style={{ position: 'relative' }}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontWeight: 800 }}>{(conv.other_user?.name || 'U').charAt(0)}</span>
                  )}
                  {isOnline && (
                    <span style={{
                      position: 'absolute', bottom: '1px', right: '1px',
                      width: '9px', height: '9px', borderRadius: '50%',
                      background: '#22c55e',
                      border: '2px solid var(--dark2)',
                    }} />
                  )}
                </div>

                <div className="chat-info">
                  <div className="chat-name" style={{ color: isActive ? 'black' : 'white' }}>{conv.other_user?.name || 'User'}</div>
                  <div className="chat-last-msg" style={{ color: isActive ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.5)' }}>
                    {isOnline ? (
                      <span style={{ color: isActive ? 'rgba(0,0,0,0.55)' : '#22c55e', fontWeight: 600 }}>Online</span>
                    ) : (
                      conv.last_message || 'New conversation'
                    )}
                  </div>
                </div>

                {conv.unread_count > 0 && !isActive && (
                  <div style={{ backgroundColor: '#d4a843', width: '8px', height: '8px', borderRadius: '50%', alignSelf: 'center', flexShrink: 0 }}></div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
