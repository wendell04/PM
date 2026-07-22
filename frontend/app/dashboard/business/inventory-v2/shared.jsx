'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
// ── shared.jsx — inventory-v2 shared components ───────────────────────────────

// ── Styles ────────────────────────────────────────────────────────────────────
// Theme-aware shared styles. Colors use the global CSS variables so these
// pages now follow the dashboard light/dark theme; radii use one standard
// scale (card 8 · controls 6 · pill). Danger keeps a fixed mid-red (readable
// on both themes).
export const S = {
  page:      { minHeight:'100vh', fontFamily:'Inter,system-ui,sans-serif', color:'var(--white)' },
  card:      { background:'var(--dark)', border:'1px solid var(--border)', borderRadius:'8px', padding:'20px' },
  cardSm:    { background:'var(--dark)', border:'1px solid var(--border)', borderRadius:'8px', padding:'14px 18px' },
  row:       { display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' },
  rowBetween:{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'10px' },
  col:       { display:'flex', flexDirection:'column', gap:'8px' },
  label:     { fontSize:'12px', fontWeight:600, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.5px' },
  val:       { fontSize:'14px', color:'var(--white)', fontWeight:500 },
  // inputs
  input:     { border:'1px solid var(--border)', borderRadius:'6px', padding:'8px 11px', fontSize:'14px', width:'100%', outline:'none', background:'var(--dark)', color:'var(--white)', boxSizing:'border-box' },
  inputErr:  { border:'1px solid #e05252', borderRadius:'6px', padding:'8px 11px', fontSize:'14px', width:'100%', outline:'none', background:'var(--dark)', color:'var(--white)', boxSizing:'border-box' },
  select:    { border:'1px solid var(--border)', borderRadius:'6px', padding:'8px 11px', fontSize:'14px', width:'100%', outline:'none', background:'var(--dark)', color:'var(--white)', cursor:'pointer', boxSizing:'border-box' },
  selectErr: { border:'1px solid #e05252', borderRadius:'6px', padding:'8px 11px', fontSize:'14px', width:'100%', outline:'none', background:'var(--dark)', color:'var(--white)', cursor:'pointer', boxSizing:'border-box' },
  textarea:  { border:'1px solid var(--border)', borderRadius:'6px', padding:'8px 11px', fontSize:'13px', width:'100%', outline:'none', background:'var(--dark)', color:'var(--white)', resize:'vertical', minHeight:'70px', boxSizing:'border-box' },
  errText:   { fontSize:'11px', color:'#e05252', marginTop:'3px' },
  // buttons
  btnPrimary:{ background:'var(--gold)', color:'#1a1a1a', border:'none', borderRadius:'6px', padding:'8px 18px', fontWeight:600, fontSize:'13px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'6px' },
  btnOutline:{ background:'transparent', color:'var(--gold)', border:'1px solid var(--gold)', borderRadius:'6px', padding:'8px 18px', fontWeight:600, fontSize:'13px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'6px' },
  btnDanger: { background:'#e05252', color:'#fff', border:'none', borderRadius:'6px', padding:'8px 18px', fontWeight:600, fontSize:'13px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'6px' },
  btnGhost:  { background:'transparent', color:'var(--gray)', border:'1px solid var(--border)', borderRadius:'6px', padding:'8px 18px', fontWeight:500, fontSize:'13px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'6px' },
  btnSm:     { background:'var(--gold)', color:'#1a1a1a', border:'none', borderRadius:'6px', padding:'5px 12px', fontWeight:600, fontSize:'12px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'5px' },
  btnSmGhost:{ background:'transparent', color:'var(--gray)', border:'1px solid var(--border)', borderRadius:'6px', padding:'5px 12px', fontWeight:500, fontSize:'12px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'5px' },
  btnSmDanger:{ background:'transparent', color:'#e05252', border:'1px solid #e05252', borderRadius:'6px', padding:'5px 12px', fontWeight:500, fontSize:'12px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'5px' },
  // table
  th:        { padding:'10px 14px', fontSize:'11px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.5px', textAlign:'left', background:'var(--dark2)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' },
  td:        { padding:'11px 14px', fontSize:'13px', borderBottom:'1px solid var(--border)', verticalAlign:'middle' },
  tr:        { transition:'background .12s' },
  // misc
  badge:     { display:'inline-block', borderRadius:'999px', padding:'3px 10px', fontSize:'11px', fontWeight:600, whiteSpace:'nowrap' },
  divider:   { borderTop:'1px solid var(--border)', margin:'14px 0' },
  note:      { background:'var(--gold-subtle)', border:'1px solid rgba(212,168,67,0.3)', borderRadius:'6px', padding:'10px 14px', fontSize:'12px', color:'var(--gold-dark)' },
  noteInfo:  { background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:'6px', padding:'10px 14px', fontSize:'12px', color:'var(--blue)' },
};

// ── Icons ─────────────────────────────────────────────────────────────────────
export const ICONS = {
  plus:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  search:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  check:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  x:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  warn:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  info:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  chevD:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>,
  chevU:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>,
  chevL:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>,
  chevR:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>,
  pkg:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
  truck:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  reload:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.66"/></svg>,
  eye:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  download:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
};

// ── IntegerInput — digits only, max 999999 ────────────────────────────────────
export function IntegerInput({ value, onChange, placeholder = '0', style, max = 999999, ...rest }) {
  const handleKey = (e) => { if (['e','E','+','-','.'].includes(e.key)) e.preventDefault(); };
  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    const num = raw === '' ? '' : Math.min(Number(raw), max);
    onChange(num === '' ? '' : String(num));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKey}
      placeholder={placeholder}
      style={{ ...S.input, ...style }}
      maxLength={String(max).length}
      {...rest}
    />
  );
}

// ── DecimalInput — up to 2 decimal places, max 999999.99 ─────────────────────
export function DecimalInput({ value, onChange, placeholder = '0.00', style, ...rest }) {
  const handleKey = (e) => { if (['e','E','+','-'].includes(e.key)) e.preventDefault(); };
  const handleChange = (e) => {
    let raw = e.target.value;
    // allow only digits and one dot
    raw = raw.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    if (parts[1] !== undefined && parts[1].length > 2) raw = parts[0] + '.' + parts[1].slice(0, 2);
    if (parseFloat(raw) > 999999.99) raw = '999999.99';
    onChange(raw);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKey}
      placeholder={placeholder}
      style={{ ...S.input, ...style }}
      {...rest}
    />
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
export function Field({ label, error, required, children, style }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'4px', ...style }}>
      {label && (
        <label style={{ fontSize:'12px', fontWeight:600, color:'var(--gray-light)' }}>
          {label}{required && <span style={{ color:'#e05252', marginLeft:'2px' }}>*</span>}
        </label>
      )}
      {children}
      {error && <span style={S.errText}>{error}</span>}
    </div>
  );
}

// ── Note callout ──────────────────────────────────────────────────────────────
export function Note({ type = 'warn', children }) {
  const isInfo = type === 'info';
  return (
    <div style={{ ...(isInfo ? S.noteInfo : S.note), display:'flex', alignItems:'flex-start', gap:'8px' }}>
      <span style={{ marginTop:'1px', flexShrink:0 }}>{isInfo ? ICONS.info : ICONS.warn}</span>
      <span>{children}</span>
    </div>
  );
}

// ── CustomSelect — styled dropdown, max 8 visible rows then scroll ────────────
// `searchable` adds a type-to-filter box at the top of the list (for long option
// lists like PSGC barangays); it is opt-in so existing short-list usages are unchanged.
export function CustomSelect({ value, onChange, options = [], placeholder = 'Select…', style, error, disabled, emptyLabel, searchable = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => { if (!open) setQuery(''); }, [open]);
  useEffect(() => { if (open && searchable) { const t = setTimeout(() => searchRef.current?.focus(), 0); return () => clearTimeout(t); } }, [open, searchable]);

  const normalized = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  const selected   = normalized.find(o => String(o.value) === String(value ?? ''));
  const hasValue   = value !== '' && value !== null && value !== undefined;
  const q = query.trim().toLowerCase();
  const visible = (searchable && q) ? normalized.filter(o => String(o.label).toLowerCase().includes(q)) : normalized;

  return (
    <div ref={ref} style={{ position: 'relative', ...(style ?? {}) }}>
      <button type="button" disabled={!!disabled}
        onClick={() => !disabled && setOpen(p => !p)}
        style={{
          width: '100%', textAlign: 'left',
          background: disabled ? 'var(--dark2)' : 'var(--dark)',
          border: `1px solid ${error ? '#e05252' : open ? 'var(--gold)' : 'var(--border)'}`,
          borderRadius: '6px', padding: '7px 30px 7px 10px',
          fontSize: '13px', color: (hasValue && selected) ? 'var(--white)' : 'var(--gray)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none', lineHeight: '1.5',
          boxSizing: 'border-box', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
        {(hasValue && selected) ? selected.label : placeholder}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={open ? 'var(--gold)' : 'var(--gray)'} strokeWidth="2.5"
          style={{ position: 'absolute', right: '9px', top: '50%',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            transition: 'transform .15s', pointerEvents: 'none', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 500,
          background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          maxHeight: '288px', overflowY: 'auto',
        }}>
          {searchable && (
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--dark)', padding: '8px', borderBottom: '1px solid var(--border)' }}>
              <input ref={searchRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
                onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="Search…"
                style={{ width: '100%', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '6px',
                  padding: '6px 9px', fontSize: '13px', color: 'var(--white)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}
          {visible.map((o, i) => {
            const isSel = String(o.value) === String(value ?? '');
            return (
              <button key={String(o.value ?? i)} type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', background: isSel ? 'var(--gold-subtle)' : 'none',
                  border: 'none', borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none',
                  padding: '9px 34px 9px 12px', fontSize: '13px',
                  color: isSel ? 'var(--gold)' : 'var(--gray-light)',
                  fontWeight: isSel ? 600 : 400, cursor: 'pointer', position: 'relative',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--dark2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSel ? 'var(--gold-subtle)' : 'none'; }}>
                {o.label}
                {isSel && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5"
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '12px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
              {q ? 'No matches' : (emptyLabel || 'No options')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
// Status chips reference theme-aware CSS vars (defined in custom-styles.css),
// so they read correctly in both light and dark mode.
const G = { bg:'var(--st-green-bg)',  color:'var(--st-green-fg)' };
const A = { bg:'var(--st-amber-bg)',  color:'var(--st-amber-fg)' };
const R = { bg:'var(--st-red-bg)',    color:'var(--st-red-fg)' };
const O = { bg:'var(--st-orange-bg)', color:'var(--st-orange-fg)' };
const B = { bg:'var(--st-blue-bg)',   color:'var(--st-blue-fg)' };
const P = { bg:'var(--st-purple-bg)', color:'var(--st-purple-fg)' };
const GR= { bg:'var(--st-gray-bg)',   color:'var(--st-gray-fg)' };
const BADGE_COLORS = {
  in_stock: G, low_stock: A, out_of_stock: R, pending: O, replaced: G,
  written_off: GR, completed: G, active: G, inactive: GR, damaged: R,
  defective: R, shortage: A, wrong_item: R, expired: P, credit: G,
  replacement: B, refunded: G,
};
export function StatusBadge({ status, label }) {
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');
  const c = BADGE_COLORS[key] || GR;
  const text = label || status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '';
  return <span style={{ ...S.badge, background:c.bg, color:c.color }}>{text}</span>;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
// Backdrop click does NOT close by default — these modals hold form input (quotation,
// stock-in, etc.) and an accidental backdrop click would wipe everything typed. Only the
// X button and footer buttons close. Pass closeOnBackdrop for throwaway/read-only dialogs.
export function Modal({ open, onClose, title, width = 520, children, footer, closeOnBackdrop = false }) {
  if (!open) return null;
  return (
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:'var(--dark)', borderRadius:'10px', width:'100%', maxWidth:width, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 40px rgba(0,0,0,.35)' }}
      >
        {/* header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <span style={{ fontWeight:700, fontSize:'16px', color:'var(--white)' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray)', padding:'4px', borderRadius:'5px', display:'flex' }}>{ICONS.x}</button>
        </div>
        {/* body — overflowX hidden so one long label can never turn the whole modal
            into a sideways scroller; content is expected to ellipsis instead. */}
        <div style={{ overflowY:'auto', overflowX:'hidden', flex:1, padding:'18px 20px' }}>{children}</div>
        {/* footer */}
        {footer && (
          <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:'8px', flexShrink:0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ConfirmModal — replaces browser confirm() ─────────────────────────────────
export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmStyle = 'danger', loading = false }) {
  if (!open) return null;
  const btnStyle = confirmStyle === 'danger' ? S.btnDanger : S.btnPrimary;
  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirm Action'} width={400}
      footer={
        <>
          <button onClick={onClose} style={S.btnGhost} disabled={loading}>Cancel</button>
          <button onClick={onConfirm} style={btnStyle} disabled={loading}>
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin:0, fontSize:'14px', color:'var(--gray-light)', lineHeight:1.6 }}>{message}</p>
    </Modal>
  );
}

// ── WarnModal — soft warning before proceeding ────────────────────────────────
export function WarnModal({ open, onClose, onProceed, title, message, proceedLabel = 'Proceed Anyway' }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={title || 'Warning'} width={420}
      footer={
        <>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={onProceed} style={{ ...S.btnPrimary, background:'#b45309' }}>{proceedLabel}</button>
        </>
      }
    >
      <div style={{ display:'flex', gap:'12px', alignItems:'flex-start' }}>
        <span style={{ color:'#b45309', marginTop:'2px', flexShrink:0 }}>{ICONS.warn}</span>
        <p style={{ margin:0, fontSize:'14px', color:'var(--gray-light)', lineHeight:1.6 }}>{message}</p>
      </div>
    </Modal>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return { toasts, push, dismiss };
}

export function ToastContainer({ toasts, dismiss }) {
  if (!toasts.length) return null;
  const colors = {
    success: { bg:'#1a7f3c', icon:ICONS.check },
    error:   { bg:'#c62828', icon:ICONS.x },
    warn:    { bg:'#b45309', icon:ICONS.warn },
    info:    { bg:'#1e40af', icon:ICONS.info },
  };
  return (
    <div style={{ position:'fixed', bottom:'24px', right:'24px', zIndex:2000, display:'flex', flexDirection:'column', gap:'8px', maxWidth:'320px' }}>
      {toasts.map(t => {
        const c = colors[t.type] || colors.success;
        return (
          <div key={t.id} style={{ background:c.bg, color:'#fff', borderRadius:'8px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'10px', boxShadow:'0 4px 16px rgba(0,0,0,.25)', fontSize:'13px', fontWeight:500, animation:'slideIn .2s ease' }}>
            <span style={{ flexShrink:0 }}>{c.icon}</span>
            <span style={{ flex:1 }}>{t.message}</span>
            <button onClick={() => dismiss(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.8)', padding:'0', display:'flex' }}>{ICONS.x}</button>
          </div>
        );
      })}
      <style>{`@keyframes slideIn { from { transform:translateX(20px); opacity:0 } to { transform:translateX(0); opacity:1 } }`}</style>
    </div>
  );
}

// ── PaginationBar ─────────────────────────────────────────────────────────────
export function PaginationBar({ total, page, perPage, onPage, onPerPage }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);

  const btn = (label, disabled, onClick, active = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border:'1px solid var(--border)', borderRadius:'6px', background: active ? 'var(--gold)' : 'var(--dark)',
        color: active ? '#1a1a1a' : (disabled ? 'var(--gray)' : 'var(--gray-light)'),
        padding:'5px 10px', fontSize:'12px', cursor: disabled ? 'default' : 'pointer',
        fontWeight: active ? 600 : 400, minWidth:'30px',
      }}
    >
      {label}
    </button>
  );

  const pageButtons = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [1];
    if (page > 3) pages.push('…');
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) pages.push(p);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'10px', marginTop:'14px' }}>
      <span style={{ fontSize:'12px', color:'var(--gray)' }}>
        {total === 0 ? 'No items' : `Showing ${from}–${to} of ${total}`}
      </span>
      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
        <span style={{ fontSize:'12px', color:'var(--gray)', marginRight:'4px' }}>Rows per page:</span>
        {[10, 25, 50].map(n => (
          <button key={n} onClick={() => { onPerPage(n); onPage(1); }}
            style={{ border:'1px solid var(--border)', borderRadius:'6px', background: perPage === n ? 'var(--gold)' : 'var(--dark)',
              color: perPage === n ? '#1a1a1a' : 'var(--gray-light)', padding:'4px 9px', fontSize:'12px', cursor:'pointer',
              fontWeight: perPage === n ? 600 : 400 }}>
            {n}
          </button>
        ))}
        <div style={{ display:'flex', gap:'4px', marginLeft:'8px' }}>
          {btn(ICONS.chevL, page === 1,          () => onPage(page - 1))}
          {pageButtons().map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} style={{ padding:'5px 6px', fontSize:'12px', color:'var(--gray)' }}>…</span>
              : <button key={p} onClick={() => onPage(p)}
                  style={{ border:'1px solid var(--border)', borderRadius:'6px', background: p === page ? 'var(--gold)' : 'var(--dark)',
                    color: p === page ? '#1a1a1a' : 'var(--gray-light)', padding:'5px 10px', fontSize:'12px',
                    cursor:'pointer', fontWeight: p === page ? 600 : 400, minWidth:'30px' }}>
                  {p}
                </button>
          )}
          {btn(ICONS.chevR, page === totalPages, () => onPage(page + 1))}
        </div>
      </div>
    </div>
  );
}

// ── SearchBar ─────────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search…', style }) {
  return (
    <div style={{ position:'relative', ...style }}>
      <span style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'var(--gray)', pointerEvents:'none', display:'flex' }}>{ICONS.search}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...S.input, paddingLeft:'32px' }}
      />
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ icon, message, sub }) {
  return (
    <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--gray)' }}>
      {icon && <div style={{ fontSize:'32px', marginBottom:'10px' }}>{icon}</div>}
      <div style={{ fontWeight:600, fontSize:'14px', color:'var(--gray)' }}>{message}</div>
      {sub && <div style={{ fontSize:'12px', marginTop:'4px' }}>{sub}</div>}
    </div>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────
export function SummaryCard({ label, value, sub, color = 'var(--white)', accent = false }) {
  return (
    <div style={{ ...S.cardSm, flex:1, minWidth:'140px', borderTop: accent ? '3px solid var(--gold)' : undefined }}>
      <div style={{ fontSize:'11px', fontWeight:600, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:'6px' }}>{label}</div>
      <div style={{ fontSize:'22px', fontWeight:700, color }}>{value}</div>
      {sub && <div style={{ fontSize:'11px', color:'var(--gray)', marginTop:'3px' }}>{sub}</div>}
    </div>
  );
}

// ── TabBar ────────────────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', gap:'4px', background:'var(--dark2)', borderRadius:'8px', padding:'4px', flexWrap:'wrap' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            border:'none', borderRadius:'6px', padding:'8px 18px', fontSize:'13px', fontWeight:600, cursor:'pointer',
            background: active === t.id ? 'var(--dark)' : 'transparent',
            color:      active === t.id ? 'var(--gold)' : 'var(--gray)',
            boxShadow:  active === t.id ? '0 1px 4px rgba(0,0,0,.18)' : 'none',
            transition: 'all .15s',
          }}
        >
          {t.label}
          {t.count != null && (
            <span style={{ marginLeft:'6px', background: active === t.id ? 'var(--gold)' : 'var(--border)', color: active === t.id ? '#1a1a1a' : 'var(--gray)', borderRadius:'999px', padding:'1px 7px', fontSize:'11px' }}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── usePagination hook ────────────────────────────────────────────────────────
export function usePagination(data, defaultPerPage = 10) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);

  // reset to page 1 when data changes
  useEffect(() => { setPage(1); }, [data.length]);

  const slice = data.slice((page - 1) * perPage, page * perPage);
  return { slice, page, perPage, total: data.length, setPage, setPerPage };
}

// ── formatCurrency ────────────────────────────────────────────────────────────
export const formatCurrency = (v) =>
  '₱' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── formatDate ────────────────────────────────────────────────────────────────
export const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' });
};

// ── UID helper ────────────────────────────────────────────────────────────────
export const uid = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
