'use client';

import { useRef, useState, useEffect } from 'react';

const clamp = (n) => Math.max(0, Math.min(100, n));
// Zoom only goes 1x (fill) → 2.5x (crop tighter). Below 1x would shrink the image
// and leave empty space, so the minimum is the full-fill point.
const clampScale = (n) => Math.max(1, Math.min(2.5, Number(n) || 1));

// Parse a CSS object-position ("68% 35%" or "center center") → { x, y } percentages
function parsePos(v) {
  if (!v) return { x: 50, y: 50 };
  const m = /(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/.exec(v);
  if (m) return { x: clamp(parseFloat(m[1])), y: clamp(parseFloat(m[2])) };
  const map = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };
  const parts = v.trim().split(/\s+/);
  if (parts.length === 2) return { x: map[parts[0]] ?? 50, y: map[parts[1]] ?? 50 };
  return { x: 50, y: 50 };
}

/**
 * Hero image positioner with SEPARATE desktop + mobile focal points & zoom ("art direction").
 * - One photo, two draggable dots: gold = desktop focus, blue = mobile focus.
 * - Two live crop previews (desktop angled split + mobile full-bleed).
 * - Mobile INHERITS desktop until you move its dot / zoom (valueMobile null = inherit).
 * Writes object-position strings + numeric scales via the on*Change callbacks.
 */
export default function HeroImagePositioner({
  image,
  value, scale = 1, onChange, onScaleChange,                                  // desktop
  valueMobile, scaleMobile, onChangeMobile, onScaleMobileChange,              // mobile (optional)
  fit = 'cover', onFitChange,                                                 // 'cover' (fill) | 'contain' (whole + white)
}) {
  const boxRef = useRef(null);
  const [drag, setDrag] = useState(null); // 'd' | 'm' | null

  const hasMobile = !!onChangeMobile;
  const mInherits = valueMobile == null;
  const effFit = fit === 'contain' ? 'contain' : 'cover';

  const d  = parsePos(value);
  const m  = mInherits ? d : parsePos(valueMobile);
  const ds = clampScale(scale);
  const ms = (scaleMobile == null) ? ds : clampScale(scaleMobile);

  const setFromEvent = (e) => {
    const el = boxRef.current;
    if (!el || !drag) return;
    const rect = el.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const pos = `${Math.round(clamp(((cx - rect.left) / rect.width) * 100))}% ${Math.round(clamp(((cy - rect.top) / rect.height) * 100))}%`;
    if (drag === 'd') onChange(pos);
    else onChangeMobile?.(pos);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e) => { e.preventDefault(); setFromEvent(e); };
    const up = () => setDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [drag]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!image) {
    return <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Upload an image first to set its focus point.</div>;
  }

  const dot = (who, p, color) => (
    <div
      onMouseDown={(e) => { e.stopPropagation(); setDrag(who); }}
      onTouchStart={(e) => { e.stopPropagation(); setDrag(who); }}
      title={who === 'd' ? 'Desktop focus' : 'Mobile focus'}
      style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)', width: 26, height: 26, borderRadius: '50%', border: '3px solid #fff', background: color, boxShadow: '0 0 0 2px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.45)', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}
    >
      {who === 'd' ? 'D' : 'M'}
    </div>
  );

  const zoomRow = (label, val, cb, onReset) => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.66rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label} zoom</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--white)', fontWeight: 600 }}>{val.toFixed(2)}×</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <input type="range" min="1" max="2.5" step="0.05" value={val} onChange={(e) => cb(parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--gold)', cursor: 'pointer' }} />
        {onReset && <button type="button" onClick={onReset} style={{ fontSize: '0.68rem', color: 'var(--gray)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>Reset</button>}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Full photo + draggable dots */}
      <div>
        <div style={{ fontSize: '0.68rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
          Drag the <b style={{ color: '#d4a843' }}>● D</b> dot for desktop focus{hasMobile && <> · <b style={{ color: '#3b82f6' }}>● M</b> for mobile</>}.
        </div>
        <div ref={boxRef} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: 'var(--dark2)', userSelect: 'none', border: '1px solid var(--border)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
          {dot('d', d, 'rgba(212,168,67,0.85)')}
          {hasMobile && dot('m', m, 'rgba(59,130,246,0.85)')}
        </div>
      </div>

      {/* Fill vs Fit toggle */}
      {onFitChange && (
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>Image fit</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { v: 'cover', label: 'Fill', sub: 'crop, no white' },
              { v: 'contain', label: 'Fit', sub: 'whole photo + white' },
            ].map(o => {
              const on = effFit === o.v;
              return (
                <button key={o.v} type="button" onClick={() => onFitChange(o.v)}
                  style={{ flex: 1, textAlign: 'left', padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}`,
                    background: on ? 'rgba(212,168,67,0.12)' : 'transparent',
                    color: on ? 'var(--white)' : 'var(--gray)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{o.label}</div>
                  <div style={{ fontSize: '0.64rem', color: 'var(--gray)' }}>{o.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Live crop previews */}
      <div>
        <div style={{ fontSize: '0.68rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>How it appears in the hero:</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Desktop */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--gray)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desktop</div>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '2.08', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: '#fff' }}>
              {/* Both modes fill the SQUARE slice to the right of the wedge (matches live) */}
              <div style={{ position: 'absolute', left: '57%', right: 0, top: 0, bottom: 0, overflow: 'hidden', background: '#fff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: effFit, objectPosition: `${d.x}% ${d.y}%`, transform: `scale(${ds})`, transformOrigin: `${d.x}% ${d.y}%`, background: '#fff' }} />
              </div>
              {/* angled text wedge = left side, matching live .hero-content (65% / clip 88%) */}
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '65%', background: 'linear-gradient(160deg,#3a3a3a 0%,#222 100%)', clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 10% 0 6%', gap: 5 }}>
                <div style={{ width: '70%', height: 11, borderRadius: 3, background: 'rgba(255,255,255,0.85)' }} />
                <div style={{ width: '48%', height: 11, borderRadius: 3, background: 'var(--gold)' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <div style={{ width: 42, height: 14, borderRadius: 7, background: 'var(--gold)' }} />
                  <div style={{ width: 42, height: 14, borderRadius: 7, border: '1px solid rgba(255,255,255,0.5)' }} />
                </div>
              </div>
            </div>
          </div>
          {/* Mobile */}
          {hasMobile && (
            <div style={{ width: 116, flexShrink: 0 }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--gray)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mobile{mInherits && <span style={{ color: 'var(--gray)', textTransform: 'none' }}> · inherits</span>}</div>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '9 / 17', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: effFit, objectPosition: `${m.x}% ${m.y}%`, transform: `scale(${ms})`, transformOrigin: `${m.x}% ${m.y}%`, background: '#fff' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 45%, transparent 75%)' }} />
                <div style={{ position: 'absolute', left: 8, right: 8, bottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ width: '78%', height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.9)' }} />
                  <div style={{ width: '55%', height: 8, borderRadius: 2, background: 'var(--gold)' }} />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <div style={{ width: 32, height: 11, borderRadius: 6, background: 'var(--gold)' }} />
                    <div style={{ width: 32, height: 11, borderRadius: 6, border: '1px solid rgba(255,255,255,0.6)' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zoom controls */}
      {onScaleChange && zoomRow('Desktop', ds, onScaleChange)}
      {hasMobile && onScaleMobileChange && zoomRow('Mobile', ms, onScaleMobileChange, (!mInherits || scaleMobile != null) ? () => { onChangeMobile(null); onScaleMobileChange(null); } : null)}

      {hasMobile && !mInherits && (
        <button type="button" onClick={() => { onChangeMobile(null); onScaleMobileChange?.(null); }} style={{ alignSelf: 'flex-start', fontSize: '0.7rem', color: 'var(--gold)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
          Reset mobile to match desktop
        </button>
      )}
    </div>
  );
}
