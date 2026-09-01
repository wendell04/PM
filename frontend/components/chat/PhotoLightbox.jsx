'use client';

// A full-screen viewer for every photo in one conversation.
//
// Opening a single picture and closing it to reach the next is the wrong shape for the work this
// chat actually carries: a collage order arrives as fifteen references, and they are compared, not
// examined one at a time. So the album is the whole thread, the arrow keys move through it, and the
// strip along the bottom shows where you are - the arrangement Facebook settled on for the same
// reason.
//
// Shared by the admin window and the customer modal so the two sides never drift apart.

import React, { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { cloudinaryThumb } from '@/lib/cloudinaryImage';
import useLockBodyScroll from '@/lib/useLockBodyScroll';

const isVideo = (u) => /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u || '');

export default function PhotoLightbox({ urls = [], index, onIndexChange, onClose }) {
  // Rendered into document.body. `position: fixed` measures itself against the nearest ancestor
  // carrying a transform, and the chat modal has one - so the overlay was being centred inside the
  // modal instead of the screen, which is exactly what it looked like.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const count = urls.length;
  const has = count > 0 && index != null && index >= 0 && index < count;

  // Called unconditionally - a hook after the early return would run on some renders and not
  // others. The page behind a full-screen viewer must not scroll while it is open.
  useLockBodyScroll(has);

  // Wrapping rather than stopping. With no beginning or end to bump into, flipping through a set of
  // references stays one gesture instead of becoming a navigation problem.
  const go = useCallback((step) => {
    if (count < 2) return;
    onIndexChange((index + step + count) % count);
  }, [index, count, onIndexChange]);

  useEffect(() => {
    if (!has) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [has, go, onClose]);

  if (!has || !mounted) return null;
  const url = urls[index];

  const navBtn = (side) => ({
    position: 'absolute', [side]: '14px', top: '50%', transform: 'translateY(-50%)',
    width: '44px', height: '44px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff', fontSize: '1.3rem', cursor: 'pointer', zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  });

  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.93)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <button type="button" onClick={onClose} aria-label="Close"
        style={{
          position: 'absolute', top: '16px', right: '16px', zIndex: 3,
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
        }}>&#10005;</button>

      {count > 1 && (
        <div style={{
          position: 'absolute', top: '22px', left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, zIndex: 3,
        }}>{index + 1} / {count}</div>
      )}

      {count > 1 && (
        <>
          <button type="button" aria-label="Previous"
            onClick={e => { e.stopPropagation(); go(-1); }} style={navBtn('left')}>&#8249;</button>
          <button type="button" aria-label="Next"
            onClick={e => { e.stopPropagation(); go(1); }} style={navBtn('right')}>&#8250;</button>
        </>
      )}

      {/* The original, never a scaled copy - this is the one place the full picture is the point. */}
      {isVideo(url) ? (
        <video src={url} controls autoPlay playsInline onClick={e => e.stopPropagation()}
          style={{ maxWidth: '86vw', maxHeight: count > 1 ? '74vh' : '86vh', borderRadius: '10px', cursor: 'default' }} />
      ) : (
        <img src={url} alt="" onClick={e => e.stopPropagation()}
          style={{ maxWidth: '86vw', maxHeight: count > 1 ? '74vh' : '86vh', objectFit: 'contain', borderRadius: '10px', cursor: 'default' }} />
      )}

      {count > 1 && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            overflowX: 'auto', background: 'rgba(0,0,0,0.55)', cursor: 'default',
          }}
        >
        <div style={{ display: 'flex', gap: '6px', padding: '12px 14px', margin: '0 auto', width: 'fit-content' }}>
          {urls.map((u, i) => (
            <button key={u + i} type="button" onClick={() => onIndexChange(i)}
              aria-label={`Photo ${i + 1}`}
              style={{
                flexShrink: 0, width: '54px', height: '54px', padding: 0, borderRadius: '7px',
                overflow: 'hidden', cursor: 'pointer', background: '#111',
                border: i === index ? '2px solid #d4a843' : '2px solid transparent',
                opacity: i === index ? 1 : 0.55,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cloudinaryThumb(isVideo(u) ? u.replace(/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i, '.jpg$2') : u, 110)}
                alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
        </div>
      )}
    </div>
  ), document.body);
}
