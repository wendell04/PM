'use client';

import React, { useState, useRef } from 'react';

const ChatInput = ({ onSendMessage, isSending, activeConversation }) => {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSending || isUploading) return;

    onSendMessage({
      type: 'text',
      body: text.trim(),
      conversation_id: activeConversation._id
    });
    setText('');
  };

  return (
    <div className="chat-input-area">
      <form onSubmit={handleSubmit} className="input-wrapper">
        <button
          type="button"
          disabled={isSending || isUploading}
          onClick={() => fileInputRef.current?.click()}
          style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
        >
          {isUploading ? '...' : '+'}
        </button>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={() => {/* Image upload logic */}} 
          accept="image/*" 
          style={{ display: 'none' }} 
        />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="text-input custom-scrollbar"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        <button
          type="submit"
          disabled={!text.trim() || isSending}
          className="send-btn"
        >
          {isSending ? '...' : '>'}
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
