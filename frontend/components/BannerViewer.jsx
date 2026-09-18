'use client';

import { useEffect, useRef, useState } from 'react';
import useLockBodyScroll from '@/lib/useLockBodyScroll';

/**
 * Full-screen look at a banner, with zoom.
 *
 * A banner is designed for a wide screen and then shown on a phone at about 340px across, where the
 * small print on a promo is simply unreadable. Tapping it opens this: the whole image on a dark
 * ground, and a way to magnify the part they care about.
 *
 * Zoom is buttons and double-tap rather than pinch. Pinch inside a fixed overlay fights the
 * browser's own page zoom and behaves differently on every phone; two fixed steps do the one thing
 * the person wants - read the small print - the same way everywhere, and drag pans while zoomed.
 */
export default function BannerViewer({ banners, index, onClose, onIndex }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const swipeRef = useRef(null);
  const lastTapRef = useRef(0);

  const total = banners.length;
  const banner = banners[index];

  useLockBodyScroll(true);

  // Every change of slide starts from a clean, unzoomed view - carrying a pan across slides leaves
  // the next banner apparently missing.
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (total > 1 && e.key === 'ArrowRight') onIndex((index + 1) % total);
      if (total > 1 && e.key === 'ArrowLeft') onIndex((index - 1 + total) % total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total, onClose, onIndex]);

  if (!banner) return null;

  const step = () => setZoom(z => (z >= 3 ? 1 : z + 1));

  const onPointerDown = (e) => {
    if (zoom > 1) dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    swipeRef.current = e.clientX;
    const now = Date.now();
    if (now - lastTapRef.current < 300) step();
    lastTapRef.current = now;
  };
  const onPointerMove = (e) => {
    if (!dragRef.current || zoom === 1) return;
    setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    // A swipe only changes the banner while the image sits unzoomed; once magnified the same
    // gesture is how you move around the image.
    if (zoom === 1 && total > 1 && swipeRef.current != null) {
      const dx = e.clientX - swipeRef.current;
      if (Math.abs(dx) > 45) onIndex((index + (dx < 0 ? 1 : -1) + total) % total);
    }
    swipeRef.current = null;
  };

  const round = {
    width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.16)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner.image}
        alt={banner.headline || banner.name || 'Banner'}
        onClick={e => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        draggable={false}
        style={{
          maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: dragRef.current ? 'none' : 'transform 0.18s ease',
          cursor: zoom > 1 ? 'grab' : 'zoom-in', touchAction: 'none', userSelect: 'none',
        }} />

      <button type="button" aria-label="Close" onClick={onClose}
        style={{ ...round, position: 'absolute', top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 12, width: 40, height: 40, fontSize: 20 }}>&times;</button>

      <div onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - 1))} style={round}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.8rem', minWidth: 74, textAlign: 'center' }}>
          {zoom > 1 ? `${zoom}x - drag to move` : (total > 1 ? `${index + 1} of ${total}` : 'Double-tap to zoom')}
        </span>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z + 1))} style={round}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      {total > 1 && zoom === 1 && (
        <>
          <button type="button" aria-label="Previous banner"
            onClick={e => { e.stopPropagation(); onIndex((index - 1 + total) % total); }}
            style={{ ...round, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button type="button" aria-label="Next banner"
            onClick={e => { e.stopPropagation(); onIndex((index + 1) % total); }}
            style={{ ...round, position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </>
      )}
    </div>
  );
}
