'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Reusable image cropper - dependency-free, Cropper.js-style.
 * The full image is shown static; you drag / resize an aspect-locked selection
 * box over it (live preview alongside) and Crop returns the region as a File.
 * Rotate spins the whole image in 90° steps (cycles all 4 sides).
 *
 * Props:
 *   src        object URL / dataURL of the picked image (same-origin - no CORS taint)
 *   aspect     box width / height (1 = square, 3 = wide banner). Default 1.
 *   round      show the live preview as a circle (avatars). Box stays square. Default false.
 *   title      modal heading
 *   outputSize target output width in px (height = outputSize / aspect). Default 1000.
 *   onCancel   () => void
 *   onConfirm  (file: File) => void | Promise
 */
export default function ImageCropper({ src, aspect = 1, round = false, title = 'Crop image', outputSize = 1000, onCancel, onConfirm }) {
  const MAXW = 300, MAXH = 300, MIN = 40, HS = 14;

  // Explicit palette - the app's theme vars don't all flip together (some are
  // fixed-dark), which left dark text on a dark panel in light mode.
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const C = {
    panel:   isLight ? '#ffffff' : '#1a1a1a',
    border:  isLight ? '#e5e7eb' : '#333333',
    text:    isLight ? '#111827' : '#ffffff',
    sub:     isLight ? '#6b7280' : '#9aa0a6',
    softBg:  isLight ? '#f9fafb' : '#222222',
    imgBg:   isLight ? '#f3f4f6' : '#0d0d0d',
    gold:    '#d4a843',
    onGold:  '#1a1200',
  };

  const [orig, setOrig]     = useState(null);   // original { img, w, h }
  const [rotation, setRot]  = useState(0);      // 0 | 90 | 180 | 270
  const [workSrc, setWork]  = useState(null);   // rotated bitmap dataURL (display + preview + crop source)
  const [nat, setNat]       = useState(null);   // rotated natural { w, h }
  const [disp, setDisp]     = useState(null);   // displayed { w, h }
  const [box, setBox]       = useState(null);   // selection { x, y, w, h } in displayed px
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState(false);
  const imgRef  = useRef(null);                 // rotated Image, drawable for crop
  const areaRef = useRef(null);
  const dragRef = useRef(null);

  // Load the original once per src.
  useEffect(() => {
    setErr(false); setOrig(null); setWork(null); setNat(null); setDisp(null); setBox(null); setRot(0);
    const im = new window.Image();
    // Needed to re-crop an already-uploaded image (Cloudinary sends CORS headers);
    // harmless for blob:/data: URLs from a fresh pick.
    im.crossOrigin = 'anonymous';
    im.onload  = () => setOrig({ img: im, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => setErr(true);
    im.src = src;
  }, [src]);

  // Build the rotated working bitmap whenever the image or rotation changes.
  const buildWork = useCallback(() => {
    if (!orig) return;
    const swap = rotation % 180 !== 0;
    // Cap the working bitmap - keeps rotate snappy on big phone photos with no
    // quality loss (still well above the cropped output size).
    const cap = Math.max(1600, outputSize * 2);
    const scale = Math.min(1, cap / Math.max(swap ? orig.h : orig.w, swap ? orig.w : orig.h));
    const rw = Math.round((swap ? orig.h : orig.w) * scale);
    const rh = Math.round((swap ? orig.w : orig.h) * scale);
    const c = document.createElement('canvas');
    c.width = rw; c.height = rh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';            // flatten transparency (avoids black on rotate/jpeg)
    ctx.fillRect(0, 0, rw, rh);
    ctx.translate(rw / 2, rh / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(orig.img, -orig.w / 2, -orig.h / 2);
    const url = c.toDataURL('image/jpeg', 0.92);
    const wi = new window.Image();
    wi.onload = () => {
      imgRef.current = wi;
      const fit = Math.min(MAXW / rw, MAXH / rh);
      const dw = Math.round(rw * fit), dh = Math.round(rh * fit);
      const w0 = Math.min(dw, dh * aspect) * 0.92, h0 = w0 / aspect;
      setNat({ w: rw, h: rh });
      setDisp({ w: dw, h: dh });
      setBox({ x: (dw - w0) / 2, y: (dh - h0) / 2, w: w0, h: h0 });
      setWork(url);
    };
    wi.src = url;
  }, [orig, rotation, aspect, outputSize]);

  useEffect(() => { buildWork(); }, [buildWork]);

  const fitScale = nat && disp ? disp.w / nat.w : 1;

  const clampMove = (x, y, b) => ({
    x: Math.max(0, Math.min(x, disp.w - b.w)),
    y: Math.max(0, Math.min(y, disp.h - b.h)),
    w: b.w, h: b.h,
  });

  const resize = (corner, px, py, b0) => {
    const east = corner.includes('e'), south = corner.includes('s');
    const anchorX = east ? b0.x : b0.x + b0.w;
    const anchorY = south ? b0.y : b0.y + b0.h;
    const sx = east ? 1 : -1, sy = south ? 1 : -1;
    const dx = (px - anchorX) * sx, dy = (py - anchorY) * sy;
    let w = Math.max(dx, dy * aspect);
    const maxW = Math.min(sx > 0 ? disp.w - anchorX : anchorX, (sy > 0 ? disp.h - anchorY : anchorY) * aspect);
    w = Math.max(MIN, Math.min(w, maxW));
    const h = w / aspect;
    return { x: sx > 0 ? anchorX : anchorX - w, y: sy > 0 ? anchorY : anchorY - h, w, h };
  };

  const pt = (e) => {
    const r = areaRef.current.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };
  const startMove = (e) => {
    e.stopPropagation();
    areaRef.current.setPointerCapture?.(e.pointerId);
    const { px, py } = pt(e);
    dragRef.current = { mode: 'move', px, py, b0: { ...box } };
  };
  const startResize = (corner) => (e) => {
    e.stopPropagation();
    areaRef.current.setPointerCapture?.(e.pointerId);
    dragRef.current = { mode: 'resize', corner, b0: { ...box } };
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const { px, py } = pt(e);
    if (d.mode === 'move') setBox(clampMove(d.b0.x + (px - d.px), d.b0.y + (py - d.py), d.b0));
    else setBox(resize(d.corner, px, py, d.b0));
  };
  const onUp = (e) => {
    dragRef.current = null;
    try { areaRef.current.releasePointerCapture?.(e.pointerId); } catch {}
  };

  const doCrop = async () => {
    if (!nat || !box || !imgRef.current) return;
    setBusy(true);
    try {
      const outW = Math.round(outputSize), outH = Math.round(outputSize / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgRef.current, box.x / fitScale, box.y / fitScale, box.w / fitScale, box.h / fitScale, 0, 0, outW, outH);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('crop failed');
      await onConfirm(new File([blob], 'crop.jpg', { type: 'image/jpeg' }));
    } catch { setBusy(false); }
  };

  const pvW = 84, pvH = round ? 84 : Math.round(84 / aspect);
  const pvScale = box ? pvW / box.w : 1;

  const corners = ['nw', 'ne', 'sw', 'se'];
  const cornerPos = (c) => ({
    left: (c.includes('e') ? box.x + box.w : box.x) - HS / 2,
    top: (c.includes('s') ? box.y + box.h : box.y) - HS / 2,
    cursor: (c === 'nw' || c === 'se') ? 'nwse-resize' : 'nesw-resize',
  });

  const ready = disp && box && workSrc;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '1.25rem', maxWidth: 'min(460px, 94vw)', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.15rem' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: C.text }}>{title}</div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sub, fontSize: '20px', lineHeight: 1, padding: '2px', flexShrink: 0, marginTop: '-2px' }}>
            ×
          </button>
        </div>
        <div style={{ fontSize: '0.72rem', color: C.sub, marginBottom: '0.9rem' }}>Drag the box to move · drag a corner to resize</div>

        {err ? (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontSize: '0.82rem', border: `1px solid ${C.border}`, borderRadius: '10px' }}>
            Could not load image.
          </div>
        ) : !ready ? (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub, fontSize: '0.82rem' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Image + selection box */}
            <div ref={areaRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ position: 'relative', width: disp.w, height: disp.h, flexShrink: 0, borderRadius: '8px', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={workSrc} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: disp.w, height: disp.h, maxWidth: 'none', pointerEvents: 'none', userSelect: 'none' }} />
              {/* selection box (dims everything outside via huge shadow) */}
              <div onPointerDown={startMove}
                style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.9)', cursor: dragRef.current?.mode === 'move' ? 'grabbing' : 'move', boxSizing: 'border-box' }}>
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: `100% ${box.h / 3}px, ${box.w / 3}px 100%` }} />
                {round && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.7)', pointerEvents: 'none' }} />}
              </div>
              {/* corner handles */}
              {corners.map(c => (
                <div key={c} onPointerDown={startResize(c)}
                  style={{ position: 'absolute', ...cornerPos(c), width: HS, height: HS, borderRadius: '3px', background: C.gold, border: `2px solid ${C.panel}`, boxSizing: 'border-box' }} />
              ))}
            </div>

            {/* Live preview + rotate */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: C.sub, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</div>
                <div style={{ width: pvW, height: pvH, borderRadius: round ? '50%' : '8px', overflow: 'hidden', border: `1px solid ${C.border}`, background: C.imgBg, position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={workSrc} alt="preview" draggable={false}
                    style={{ position: 'absolute', width: disp.w * pvScale, height: disp.h * pvScale, left: -box.x * pvScale, top: -box.y * pvScale, maxWidth: 'none' }} />
                </div>
              </div>
              <button type="button" onClick={() => setRot(r => (r + 90) % 360)} disabled={busy}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.4rem 0.6rem', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.softBg, color: C.text, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Rotate
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.1rem' }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{ padding: '0.55rem 1rem', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.softBg, color: C.text, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={doCrop} disabled={busy || !ready}
            style={{ padding: '0.55rem 1.25rem', borderRadius: '8px', border: 'none', background: C.gold, color: C.onGold, fontSize: '0.82rem', fontWeight: 700, cursor: busy || !ready ? 'default' : 'pointer', opacity: busy || !ready ? 0.6 : 1 }}>
            {busy ? 'Cropping…' : 'Crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
