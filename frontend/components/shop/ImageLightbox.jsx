'use client';

import { useEffect } from 'react';

/**
 * Full-screen image preview. Pass a url to open; onClose clears it. Backdrop-click and Esc
 * close it. Used for design-file previews so an image opens in place instead of a new tab.
 */
export default function ImageLightbox({ url, onClose, kind }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close preview"
        style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      {/* Video proofs open here too, so a clip is reviewed at a size worth judging rather than in a
          thumbnail. Detected from the URL, or forced with kind="video" for blob URLs, which carry no
          extension to go on. */}
      {(kind === 'video' || /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url)) ? (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 8, background: '#000', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Design preview"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        />
      )}
    </div>
  );
}
