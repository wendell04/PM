'use client';

import React, { useState, useRef, useEffect } from 'react';
import QuotationModal from './QuotationModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const ChatInput = ({ onSendMessage, isSending, activeConversation, token, isAdmin, onTyping }) => {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [showQuotation, setShowQuotation] = useState(false);
  const fileInputRef = useRef(null);
  const typingThrottleRef = useRef(null);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSending || isUploading) return;

    onSendMessage({
      type: 'text',
      body: text.trim(),
      conversation_id: activeConversation._id,
    });
    setText('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const cancelPreview = () => {
    setPreviewFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendQuotation = (quotationData) => {
    onSendMessage({
      type: 'quotation',
      body: `Quotation: ${quotationData.productName} — ₱${quotationData.total.toFixed(2)}`,
      conversation_id: activeConversation._id,
      metadata: quotationData,
    });
    setShowQuotation(false);
  };

  const handleSendImage = async () => {
    if (!previewFile) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('image', previewFile);

      const res = await fetch(`${API_URL}/api/chat/upload-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'ngrok-skip-browser-warning': '1',
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload failed.');

      onSendMessage({
        type: 'image',
        body: '📷 Image',
        file_url: data.data.url,
        conversation_id: activeConversation._id,
      });
      cancelPreview();
    } catch (err) {
      setUploadError(err.message || 'Failed to upload image.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="chat-input-area">
      {previewUrl && (
        <div style={{
          padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(0,0,0,0.25)', borderRadius: '8px 8px 0 0', marginBottom: '2px',
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img src={previewUrl} alt="preview" style={{
              width: '64px', height: '64px', objectFit: 'cover',
              borderRadius: '8px', border: '2px solid #d4a843', display: 'block',
            }} />
            <button
              type="button"
              onClick={cancelPreview}
              disabled={isUploading}
              style={{
                position: 'absolute', top: '-7px', right: '-7px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: '#222', border: '1px solid #555',
                color: '#ccc', fontSize: '9px', cursor: isUploading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, lineHeight: 1,
              }}
            >✕</button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {previewFile?.name}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>Ready to send</div>
          </div>
          <button
            type="button"
            onClick={handleSendImage}
            disabled={isUploading || isSending}
            style={{
              padding: '6px 16px', background: isUploading ? '#555' : '#d4a843',
              border: 'none', borderRadius: '8px',
              color: isUploading ? '#999' : '#000',
              fontWeight: 700, fontSize: '0.8rem',
              cursor: isUploading || isSending ? 'not-allowed' : 'pointer', flexShrink: 0,
            }}
          >
            {isUploading ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}
      {uploadError && (
        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '6px', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: '6px' }}>
          {uploadError}
        </div>
      )}
      {showQuotation && (
        <QuotationModal
          onClose={() => setShowQuotation(false)}
          onSubmit={handleSendQuotation}
          isSending={isSending}
        />
      )}

      <form onSubmit={handleSubmit} className="input-wrapper">
        <button
          type="button"
          disabled={isSending || isUploading || !!previewUrl}
          onClick={() => fileInputRef.current?.click()}
          title="Send image"
          style={{
            background: 'transparent', border: 'none',
            color: isUploading ? '#d4a843' : '#888',
            cursor: isSending || isUploading ? 'not-allowed' : 'pointer',
            fontSize: '1.3rem', lineHeight: 1, padding: '4px',
          }}
        >
          {isUploading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          )}
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: 'none' }}
        />

        {isAdmin && (
          <button
            type="button"
            disabled={isSending || isUploading || !!previewUrl}
            onClick={() => setShowQuotation(true)}
            title="Send quotation"
            style={{
              background: 'transparent', border: 'none',
              color: '#888',
              cursor: isSending || isUploading || !!previewUrl ? 'not-allowed' : 'pointer',
              lineHeight: 1, padding: '4px', flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2"/>
              <line x1="8" y1="7" x2="16" y2="7"/>
              <line x1="8" y1="11" x2="16" y2="11"/>
              <line x1="8" y1="15" x2="12" y2="15"/>
            </svg>
          </button>
        )}

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (onTyping && e.target.value && !typingThrottleRef.current) {
              onTyping();
              typingThrottleRef.current = setTimeout(() => { typingThrottleRef.current = null; }, 2000);
            }
          }}
          placeholder="Type a message..."
          className="text-input custom-scrollbar"
          rows={1}
          disabled={isUploading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        <button
          type="submit"
          disabled={!text.trim() || isSending || isUploading}
          className="send-btn"
          style={{ color: 'black', fontWeight: 800, fontSize: '1rem' }}
        >
          {isSending ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
