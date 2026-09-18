'use client';

import { useEffect, useRef, useState } from 'react';
import useLockBodyScroll from '@/lib/useLockBodyScroll';

/**
 * The admin on a phone - designed for a thumb, not squeezed from a desktop.
 *
 * A desktop list is a wide table with a row of stat cards above it and a strip of filter
 * controls. Made "responsive" that becomes a column of label/value cards, each nine lines tall,
 * with filters stacked into a screenful of dropdowns - nothing is cut off, and nothing is quick.
 *
 * What a phone user wants is what the Shopee seller app and our own My Orders already do: a
 * dense list you can scan, one tap to open a thing full-screen, a single Filter button, and
 * the numbers that matter in a strip you flick through. These pieces are that, shared by every
 * module. The desktop layout is untouched: a page renders these below 700px and its table above.
 */

const PHONE_QUERY = '(max-width: 700px)';

/** True below 700px. False on the server and the first client frame, then settles. */
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return phone;
}

const chevron = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
);

/* ── KPI row ──────────────────────────────────────────────────────────────── */

/**
 * The numbers that matter, all visible at once - the Shopee seller app's "0 To Ship / 0
 * Cancelled / 0 Return / 0 Review" row. Never a strip that scrolls: what is off-screen does not
 * exist to the person holding the phone. Keep it to four or five. items: { key, label, value,
 * active, color, onClick }; tapping one filters, as clicking a card does on the desktop.
 */
export function KpiStrip({ items }) {
  const cols = Math.min(5, Math.max(2, items.length));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 0, marginBottom: 12,
      background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {items.slice(0, cols).map((it, i) => (
        <button key={it.key} type="button" onClick={it.onClick} disabled={!it.onClick}
          style={{
            minHeight: 64, padding: '10px 4px 8px', textAlign: 'center', cursor: it.onClick ? 'pointer' : 'default',
            background: it.active ? 'rgba(212,168,67,0.10)' : 'transparent', color: 'var(--white)',
            border: 'none', borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
            boxShadow: it.active ? 'inset 0 -3px 0 var(--gold)' : 'none',
          }}>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: it.active ? 'var(--gold)' : (it.color || 'var(--white)') }}>{it.value}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gray)', marginTop: 4, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
        </button>
      ))}
    </div>
  );
}

/* ── Search + Filter button + bottom sheet ────────────────────────────────── */

/**
 * One search box and one Filter button. The button carries the count of filters that are not at
 * their default; the chosen ones show as chips underneath with an x. The sheet lists each filter
 * as a row of pills.
 *
 * filters: [{ key, label, value, defaultValue, options: [{ value, label }], onChange }]
 * actions: extra small buttons for the row under the search (JO Queue, Show Archived, refresh).
 */
export function PhoneFilterBar({ search, onSearch, placeholder = 'Search…', filters = [], actions = null, note = null, children }) {
  const [open, setOpen] = useState(false);
  const active = filters.filter(f => f.value !== (f.defaultValue ?? 'all'));
  const labelOf = (f) => f.options.find(o => o.value === f.value)?.label ?? String(f.value);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', display: 'flex', pointerEvents: 'none' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </span>
          <input type="search" value={search} onChange={e => onSearch(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px 10px 36px', fontSize: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', outline: 'none' }} />
        </div>
        {filters.length > 0 && (
          <button type="button" onClick={() => setOpen(true)}
            style={{ flex: '0 0 auto', minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
              border: active.length ? '1.5px solid var(--gold)' : '1px solid var(--border)', background: 'var(--dark)', color: active.length ? 'var(--gold)' : 'var(--white)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
            Filter{active.length > 0 && ` (${active.length})`}
          </button>
        )}
      </div>

      {active.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {active.map(f => (
            <button key={f.key} type="button" onClick={() => f.onChange(f.defaultValue ?? 'all')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(212,168,67,0.12)', color: 'var(--gold)', border: '1px solid rgba(212,168,67,0.35)' }}>
              <span style={{ color: 'var(--gray)', fontWeight: 500 }}>{f.label}:</span> {labelOf(f)}
              <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>&times;</span>
            </button>
          ))}
        </div>
      )}

      {(actions || note) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          {actions}
          {note && <span style={{ fontSize: 12, color: 'var(--gray)', marginLeft: 'auto' }}>{note}</span>}
        </div>
      )}
      {children}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Filter">
        {filters.map(f => (
          <div key={f.key} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>{f.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {f.options.map(o => {
                const on = o.value === f.value;
                return (
                  <button key={String(o.value)} type="button" onClick={() => f.onChange(o.value)}
                    style={{ minHeight: 38, padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer',
                      background: on ? 'var(--gold)' : 'var(--dark2)', color: on ? '#1a1a1a' : 'var(--white)', border: on ? '1px solid var(--gold)' : '1px solid var(--border)' }}>
                    {o.label}
                  </button>
                );
              })}
            </div>
            {f.extra}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, paddingTop: 14 }}>
          <button type="button" onClick={() => filters.forEach(f => f.onChange(f.defaultValue ?? 'all'))}
            style={{ flex: 1, minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Clear
          </button>
          <button type="button" onClick={() => setOpen(false)}
            style={{ flex: 2, minHeight: 44, borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#1a1a1a', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Show results
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

/** A sheet that rises from the bottom, for choices. Tap outside to close. */
export function BottomSheet({ open, onClose, title, children }) {
  useLockBodyScroll(!!open);
  // Dragging the sheet down closes it, the way every phone sheet does. The drag starts on the
  // handle and the title, or anywhere while the content is scrolled to its top; past 90px on
  // release it closes, otherwise it springs back.
  const [dragY, setDragY] = useState(0);
  const drag = useRef(null);
  const bodyRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useEffect(() => { if (!open) setDragY(0); }, [open]);
  if (!open) return null;
  const start = (e, fromHandle) => {
    if (!fromHandle && (bodyRef.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y: e.clientY, handle: fromHandle };
  };
  const move = (e) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    if (dy > 0) { setDragY(dy); if (e.cancelable) e.preventDefault(); }
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragY > 90) onClose(); else setDragY(0);
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={title}
        onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        style={{ width: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--dark)', color: 'var(--white)', borderRadius: '16px 16px 0 0',
          boxSizing: 'border-box', boxShadow: '0 -8px 30px rgba(0,0,0,0.35)',
          transform: `translateY(${dragY}px)`, transition: drag.current ? 'none' : 'transform .18s ease', touchAction: 'pan-y' }}>
        <div onPointerDown={e => start(e, true)} style={{ padding: '10px 16px 6px', cursor: 'grab', touchAction: 'none', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 10px' }} />
          {title && <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>}
        </div>
        <div ref={bodyRef} onPointerDown={e => start(e, false)}
          style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 16px calc(16px + env(safe-area-inset-bottom, 0px))', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── The list ─────────────────────────────────────────────────────────────── */

export function PhoneList({ children }) {
  return (
    <div style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

/**
 * One thing in a list, in two or three lines: a title with a status chip on the right, then a
 * line of what it is, then (optional) a small line of numbers. Tapping opens it.
 */
export function PhoneRow({ title, chip, meta, sub, onClick, muted = false, first = false, mono = true }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', minHeight: 60, padding: '10px 12px 10px 14px',
        background: 'transparent', color: 'var(--white)', border: 'none', borderTop: first ? 'none' : '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default', opacity: muted ? 0.6 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 700, fontSize: mono ? 13 : 14, color: mono ? 'var(--gold)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          <span style={{ flexShrink: 0 }}>{chip}</span>
        </div>
        {meta && <div style={{ fontSize: 13, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>}
        {sub && <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
      {onClick && <span style={{ color: 'var(--gray)', display: 'flex', flexShrink: 0 }}>{chevron}</span>}
    </button>
  );
}

/* ── Full-screen sheet ────────────────────────────────────────────────────── */

/**
 * A thing opened full-screen with a back arrow, the way My Orders opens an order. Not an inline
 * expansion (no room) and not a modal (no room either). The body scrolls; the header stays.
 */
export function PhoneSheet({ open, title, chip, subtitle, onClose, children, footer, mono = true }) {
  useLockBodyScroll(!!open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-label={typeof title === 'string' ? title : undefined}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'var(--dark2)', color: 'var(--white)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 52, padding: 'calc(4px + env(safe-area-inset-top, 0px)) 8px 4px 4px', background: 'var(--dark)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button type="button" onClick={onClose} aria-label="Back"
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--white)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 700, fontSize: mono ? 14 : 15, color: mono ? 'var(--gold)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>}
        </div>
        {chip && <div style={{ flexShrink: 0, marginRight: 4 }}>{chip}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: footer ? 0 : 'env(safe-area-inset-bottom, 0px)' }}>
        {children}
      </div>
      {footer && (
        <div style={{ flexShrink: 0, padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))', background: 'var(--dark)', borderTop: '1px solid var(--border)' }}>
          {footer}
        </div>
      )}
    </div>
  );
}
