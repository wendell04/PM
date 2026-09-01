'use client';

import React, { useState, useRef, useEffect } from 'react';
import { containsProfanity } from '../../lib/profanity';
import QuotationModal from './QuotationModal';
import { createAdminQuotation } from '../../lib/orderRequestApi';
import { compressImage, formatBytes } from '../../lib/compressImage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const ChatInput = ({ onSendMessage, isSending, activeConversation, token, onTyping, isAdmin }) => {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [profanityWarning, setProfanityWarning] = useState(false);
  // A collage order arrives as fifteen reference photos, not one. Holding a queue means the
  // customer picks them all once instead of repeating the same four gestures fifteen times.
  const [queue, setQueue] = useState([]);      // [{ id, file, url, name, size, was }]
  const [preparing, setPreparing] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [showQuotation, setShowQuotation] = useState(false);
  const [quotationSending, setQuotationSending] = useState(false);
  const [quotationError, setQuotationError] = useState('');
  const fileInputRef = useRef(null);
  const typingThrottleRef = useRef(null);
  const profanityTimerRef = useRef(null);

  const customerId = activeConversation?.other_user?.id;
  const canQuote = isAdmin && customerId
    && customerId !== 'support_auto' && !String(activeConversation?._id || '').startsWith('new_');

  const handleSendQuotation = async (payload) => {
    setQuotationSending(true);
    setQuotationError('');
    try {
      await createAdminQuotation(token, { recipientId: customerId, ...payload });
      setShowQuotation(false);
    } catch (err) {
      setQuotationError(err.message || 'Failed to send quotation.');
    } finally {
      setQuotationSending(false);
    }
  };

  // Release every object URL when the input unmounts. A ref rather than the queue itself as the
  // dependency: listing `queue` would tear down and rebuild this on every add, revoking previews
  // that are still on screen.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(() => {
    return () => { queueRef.current.forEach(q => { if (q.url) URL.revokeObjectURL(q.url); }); };
  }, []);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSending || isUploading) return;

    if (containsProfanity(text.trim())) {
      setProfanityWarning(true);
      if (profanityTimerRef.current) clearTimeout(profanityTimerRef.current);
      profanityTimerRef.current = setTimeout(() => {
        setProfanityWarning(false);
        profanityTimerRef.current = null;
      }, 3000);
      return;
    }

    const isVirtual = activeConversation._id === 'support_auto' || activeConversation._id?.startsWith('new_');
    const payload = {
      type: 'text',
      body: text.trim(),
    };
    if (!isVirtual) {
      payload.conversation_id = activeConversation._id;
    } else {
      payload.recipient_id = activeConversation.other_user?.id;
    }

    onSendMessage(payload);
    setText('');
  };

  const MAX_QUEUE = 15;

  // "1 photo ready" over a PDF icon was the interface telling the customer something they could
  // see was untrue. The noun follows the contents: photos, files, or neither when they are mixed.
  const imgCount  = queue.filter(q => q.isImage).length;
  const queueNoun = queue.length === 0
    ? 'item'
    : imgCount === queue.length
      ? (queue.length === 1 ? 'photo' : 'photos')
      : imgCount === 0
        ? (queue.length === 1 ? 'file' : 'files')
        : 'items';

  const handleFileChange = async (e) => {
    const picked = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!picked.length) return;
    setUploadError('');

    const room = MAX_QUEUE - queue.length;
    if (room <= 0) { setUploadError(`You can attach up to ${MAX_QUEUE} photos at a time.`); return; }
    const take = picked.slice(0, room);
    if (picked.length > room) setUploadError(`Only ${MAX_QUEUE} photos at a time - the rest were skipped.`);

    setPreparing(true);
    try {
      // Shrunk before the preview, not at send time, so the size on screen is the size that will
      // actually be uploaded - and a 25 MB photo stops being a failure the customer has to discover.
      const prepared = [];
      for (const original of take) {
        // Only pictures are shrunk. A canvas cannot open a PDF, and a document that survived a
        // round trip through one would not be the document any more.
        const isImage = original.type?.startsWith('image/');
        const file = isImage ? await compressImage(original) : original;
        if (!isImage && file.size > 10 * 1024 * 1024) {
          setUploadError(`${original.name} is over 10 MB.`);
          continue;
        }
        prepared.push({
          id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          isImage,
          url: isImage ? URL.createObjectURL(file) : null,
          name: original.name,
          size: file.size,
          was: file.size < original.size ? original.size : null,
        });
      }
      setQueue(prev => [...prev, ...prepared]);
    } finally {
      setPreparing(false);
    }
  };

  const removeFromQueue = (id) => {
    setQueue(prev => {
      const hit = prev.find(q => q.id === id);
      if (hit?.url) URL.revokeObjectURL(hit.url);
      return prev.filter(q => q.id !== id);
    });
  };

  const cancelPreview = () => {
    queue.forEach(q => { if (q.url) URL.revokeObjectURL(q.url); });
    setQueue([]);
    setSentCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendImage = async () => {
    if (!queue.length) return;
    setIsUploading(true);
    setUploadError('');
    setSentCount(0);
    // A plain local, not the state. Reading sentCount inside the catch would give whatever it was
    // when this function was created - always 0 - so a failure halfway would have re-sent every
    // photo that already arrived.
    let done = 0;
    try {
      // Sequential on purpose. Fifteen parallel uploads from a phone finish slower than fifteen in
      // a row and arrive out of order, and the order a customer sends references in carries meaning.
      for (let i = 0; i < queue.length; i++) {
      const formData = new FormData();
      formData.append('image', queue[i].file);

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

      const isVirtual = activeConversation._id === 'support_auto' || activeConversation._id?.startsWith('new_');
      const kind = data.data.kind === 'file' ? 'file' : 'image';
      const imgPayload = {
        type: kind,
        body: kind === 'file' ? (data.data.name || 'File') : 'Photo',
        file_url: data.data.url,
        // The name travels in metadata, which the message model already carries - a document
        // labelled with Cloudinary's own random id tells the reader nothing.
        ...(kind === 'file'
          ? { metadata: { name: data.data.name || null, size: data.data.size ?? null } }
          : {}),
      };
      if (!isVirtual) {
        imgPayload.conversation_id = activeConversation._id;
      } else {
        imgPayload.recipient_id = activeConversation.other_user?.id;
      }
      onSendMessage(imgPayload);
      done = i + 1;
      setSentCount(done);
      }
      cancelPreview();
    } catch (err) {
      // Whatever already went through has been sent; drop those from the queue so pressing Send
      // again retries only what is left instead of posting the first ones twice.
      setQueue(prev => {
        prev.slice(0, done).forEach(q => { if (q.url) URL.revokeObjectURL(q.url); });
        return prev.slice(done);
      });
      setSentCount(0);
      setUploadError(err.message || 'Failed to upload image.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="chat-input-area">
      {(queue.length > 0 || preparing) && (
        <div style={{
          boxSizing: 'border-box', width: '100%',
          padding: '10px 12px 12px',
          background: 'rgba(212,168,67,0.06)',
          border: '1px solid rgba(212,168,67,0.22)',
          borderRadius: '12px', marginBottom: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: queue.length ? '10px' : 0 }}>
            <div style={{ fontSize: '0.74rem', color: '#d4a843', fontWeight: 700, letterSpacing: '0.02em' }}>
              {preparing
                ? 'Preparing...'
                : isUploading
                  ? `Sending ${Math.min(sentCount + 1, queue.length)} of ${queue.length}`
                  : `${queue.length} ${queueNoun} ready`}
            </div>
            {!isUploading && !preparing && queue.length > 0 && (
              <button type="button" onClick={cancelPreview}
                style={{ background: 'none', border: 'none', color: '#8a8a8a', fontSize: '0.72rem',
                  cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                Clear all
              </button>
            )}
          </div>

          {queue.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {queue.map((q, i) => {
                const sent = isUploading && i < sentCount;
                return (
                  <div key={q.id} style={{ flexShrink: 0, width: '68px' }}>
                    <div style={{ position: 'relative' }}>
                      {q.isImage ? (
                        <img src={q.url} alt="" style={{
                          width: '68px', height: '68px', objectFit: 'cover',
                          borderRadius: '10px', display: 'block',
                          border: sent ? '1px solid rgba(125,216,125,0.5)' : '1px solid rgba(255,255,255,0.14)',
                          opacity: sent ? 0.4 : 1,
                        }} />
                      ) : (
                        <div style={{
                          width: '68px', height: '68px', borderRadius: '10px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          justifyContent: 'center', gap: '3px',
                          background: 'rgba(255,255,255,0.05)',
                          border: sent ? '1px solid rgba(125,216,125,0.5)' : '1px solid rgba(255,255,255,0.14)',
                          opacity: sent ? 0.4 : 1,
                        }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.8">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>
                          </svg>
                          <span style={{ fontSize: '0.52rem', color: '#d4a843', fontWeight: 700, letterSpacing: '0.04em' }}>
                            {(q.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4)}
                          </span>
                        </div>
                      )}
                      {sent && (
                        <div style={{
                          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', color: '#7dd87d', fontSize: '1.1rem', fontWeight: 700,
                        }}>&#10003;</div>
                      )}
                      {/* Inside the tile, not hanging off it. The row scrolls horizontally, and an
                          overflow container clips in both directions - so a button sitting at
                          -6px was having its top and side cut away. */}
                      {!isUploading && (
                        <button type="button" onClick={() => removeFromQueue(q.id)}
                          aria-label="Remove"
                          style={{
                            position: 'absolute', top: '3px', right: '3px',
                            width: '18px', height: '18px', borderRadius: '50%',
                            background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.3)',
                            color: '#fff', fontSize: '9px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 0, lineHeight: 1,
                          }}
                        >&#10005;</button>
                      )}
                    </div>
                    {/* Under the picture rather than across it. Covering the bottom third of a
                        thumbnail to report its size hides the very thing being reviewed - and the
                        saving is only worth mentioning when there was one. */}
                    <div style={{
                      fontSize: '0.6rem', textAlign: 'center', marginTop: '3px', lineHeight: 1.3,
                      color: q.was ? '#7dd87d' : '#7a7a7a',
                    }}>
                      {formatBytes(q.size)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {queue.length > 0 && !preparing && (
            <button
              type="button"
              onClick={handleSendImage}
              disabled={isUploading || isSending}
              style={{
                width: '100%', marginTop: '10px',
                padding: '9px 16px', background: isUploading ? 'rgba(212,168,67,0.4)' : '#d4a843',
                border: 'none', borderRadius: '9px',
                color: isUploading ? 'rgba(0,0,0,0.5)' : '#000',
                fontWeight: 800, fontSize: '0.82rem',
                cursor: isUploading || isSending ? 'wait' : 'pointer',
              }}
            >
              {isUploading
                ? `Sending ${Math.min(sentCount + 1, queue.length)} of ${queue.length}...`
                : `Send ${queue.length} ${queueNoun}`}
            </button>
          )}
        </div>
      )}

      {profanityWarning && (
        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '6px', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: '6px' }}>
          Please keep the conversation respectful. Inappropriate language is not allowed.
        </div>
      )}
      {uploadError && (
        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '6px', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: '6px' }}>
          {uploadError}
        </div>
      )}
      {quotationError && (
        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '6px', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: '6px' }}>
          {quotationError}
        </div>
      )}
      <form onSubmit={handleSubmit} className="input-wrapper">
        <button
          type="button"
          disabled={isSending || isUploading || preparing}
          onClick={() => fileInputRef.current?.click()}
          title="Send photos"
          style={{
            width: '34px', height: '34px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none',
            color: isUploading ? '#d4a843' : '#888',
            cursor: isSending || isUploading ? 'not-allowed' : 'pointer',
            padding: 0,
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

        {canQuote && (
          <button
            type="button"
            disabled={isSending || isUploading}
            onClick={() => { setQuotationError(''); setShowQuotation(true); }}
            title="Send quotation"
            style={{
              width: '34px', height: '34px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none',
              color: '#d4a843',
              cursor: isSending || isUploading ? 'not-allowed' : 'pointer',
              padding: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="12" y2="15" />
            </svg>
          </button>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.ai,.psd,.doc,.docx"
          multiple
          style={{ display: 'none' }}
        />

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (onTyping && !typingThrottleRef.current) {
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showQuotation && (
        <QuotationModal
          onClose={() => setShowQuotation(false)}
          onSubmit={handleSendQuotation}
          isSending={quotationSending}
          token={token}
          customerId={activeConversation?.other_user?.id}
          customerName={activeConversation?.other_user?.name}
        />
      )}
    </div>
  );
};

export default ChatInput;
