'use client';
import { cloudinaryThumb } from '@/lib/cloudinaryImage';

import ErrorBoundary from '../../../../components/ErrorBoundary';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllOrdersNew, deleteOrder as deleteOrderApi } from '@/lib/ordersApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { remainingDue, depositDue, paidSoFar, orderTotal } from '@/lib/orderBalance';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination, CustomSelect, ConfirmModal } from '../inventory-v2/shared';
import { DEFAULT_CUSTOM_ORDER_TERMS } from '@/lib/customOrderTerms';
import { orderNo } from '@/lib/orderNumber';
import NoImage from '@/components/NoImage';
import { deliveryRisk, joRisk, RISK_STYLE } from '@/lib/deliveryRisk';
import { fetchJobOrders, updateJobOrder } from '@/lib/jobOrderApi';
import { JobOrderStatusBadge, DesignPreview, designUrl, joDocId, fmtJODate } from '@/components/dashboard/JobOrderBits';
import { getStatusBadge } from '@/lib/utils/orderHelpers';
import ImageLightbox from '@/components/shop/ImageLightbox';
import ProofGallery from '@/components/shop/ProofGallery';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import { normalizeStatus, statusLabel, ORDER_STATUS_ORDER } from '@/lib/orderStatus';

const API_URL    = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const POLL_MS    = 30000;
const PAGE_LIMIT = 500;
const EXPIRY_DAYS = 7;

// Preset reasons for rejecting a customer's uploaded file (bounce back for re-upload). "Other"
// reveals a free-text box. The chosen reason is saved on the order and shown to the customer.
const REJECT_REASONS = [
  'Wrong file format or file type',
  'Low resolution or blurry',
  'Text or elements are cut off',
  'Wrong size or dimensions',
  'Copyright or not allowed',
  'Other',
];

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_TABS = ['all', ...ORDER_STATUS_ORDER];

const STATUS_CFG = {
  // Active / in-progress → gold
  'Pending':            { bg:'rgba(212,168,67,0.08)', color:'var(--gold)', border:'rgba(212,168,67,0.3)' },
  'Processing':         { bg:'rgba(212,168,67,0.08)', color:'var(--gold)', border:'rgba(212,168,67,0.3)' },
  'In Production':      { bg:'rgba(212,168,67,0.08)', color:'var(--gold)', border:'rgba(212,168,67,0.3)' },
  'For QC':             { bg:'rgba(212,168,67,0.08)', color:'var(--gold)', border:'rgba(212,168,67,0.3)' },
  'For Delivery':       { bg:'rgba(212,168,67,0.08)', color:'var(--gold)', border:'rgba(212,168,67,0.3)' },
  // Success → green
  'Delivered':          { bg:'rgba(34,197,94,0.08)',  color:'#166534', border:'rgba(34,197,94,0.3)'  },
  // Negative → red
  'Cancelled':          { bg:'rgba(239,68,68,0.08)',  color:'#991b1b', border:'rgba(239,68,68,0.3)'  },
  'Returned':           { bg:'rgba(239,68,68,0.08)',  color:'#991b1b', border:'rgba(239,68,68,0.3)'  },
};

const PAY_CFG = {
  paid:    { bg:'#f0fdf4', color:'#166534', border:'#bbf7d0', label:'Paid'    },
  partial: { bg:'#fff7ed', color:'#c2410c', border:'#fdba74', label:'Partial' },
  unpaid:  { bg:'#fef2f2', color:'#991b1b', border:'#fecaca', label:'Unpaid'  },
};

// ── Mini components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const { label, bg, color, border } = getStatusBadge(status);
  return (
    <span style={{ ...S.badge, background:bg, color, border:`1px solid ${border}`, fontSize:'11px' }}>
      {label}
    </span>
  );
}

function PayBadge({ status, method }) {
  const c = PAY_CFG[status] ?? PAY_CFG.unpaid;
  const isCOD = String(method ?? '').toLowerCase() === 'cod';
  return (
    <span style={{ display:'inline-flex', flexDirection:'column', alignItems:'flex-end', gap:'2px' }}>
      <span style={{ ...S.badge, background:c.bg, color:c.color, border:`1px solid ${c.border}`, fontSize:'10px' }}>
        {c.label}
      </span>
      {isCOD && (
        <span style={{ fontSize:'9px', fontWeight:800, letterSpacing:'.06em', color:'var(--gray)' }}>
          COD
        </span>
      )}
    </span>
  );
}

/**
 * What is actually IN this order.
 *
 * A single word cannot describe a cart holding a printed mug and a plain totebag, and picking one
 * told the shop the wrong thing about half the order - it looked ready to ship when part of it still
 * had to be made, or looked like production work when most of it was on the shelf.
 *
 * So it reads the LINES. Mixed says so plainly, and the per-line labels in the panel below say which
 * is which.
 */
function TypeBadge({ isCustom, items }) {
  const lines = Array.isArray(items) ? items : [];
  const produced = lines.filter(i =>
    i?.isCustom || i?.isMadeToOrder || i?.designUrl || i?.designFiles?.length || i?.designRequested).length;
  const stocked = lines.length - produced;

  const style = (bg, fg, br) => ({ ...S.badge, background: bg, color: fg, border: `1px solid ${br}`, fontSize: '10px' });

  if (lines.length && produced > 0 && stocked > 0) {
    return <span style={style('#fef3c7', '#92400e', '#fde68a')}>Mixed</span>;
  }
  if (lines.length ? produced > 0 : isCustom) {
    return <span style={style('#ede9fe', '#5b21b6', '#ddd6fe')}>Custom</span>;
  }
  return <span style={style('#f0fdf4', '#166534', '#bbf7d0')}>Ready Made</span>;
}


function Chevron({ open }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5"
      style={{ transform:open ? 'rotate(180deg)' : 'none', transition:'transform .2s', flexShrink:0 }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function InfoRow({ label, value, mono }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'3px 0' }}>
      <span style={{ color:'var(--gray)' }}>{label}</span>
      <span style={{ color:'var(--white)', fontWeight:600, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function Modal({ children, onClose, maxWidth = 480, overflow = 'auto' }) {
  useLockBodyScroll(true);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      {/* No backdrop-close: modal may hold form input - a stray click would wipe it.
          overflow='visible' lets a short modal's dropdown pop-over float free instead of being
          clipped (and triggering the modal's own scrollbar). */}
      <div style={{ ...S.card, width:'100%', maxWidth, maxHeight:'90vh', overflow,
        boxShadow:'0 20px 60px rgba(0,0,0,.18)', padding:'24px' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ ...S.rowBetween, marginBottom:'20px', paddingBottom:'14px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ fontWeight:700, fontSize:'15px', color:'var(--white)' }}>{title}</div>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray)', display:'flex', padding:'4px' }}>
        {ICONS.x}
      </button>
    </div>
  );
}

function ModalFooter({ children }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'24px',
      paddingTop:'16px', borderTop:'1px solid var(--border)' }}>
      {children}
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────

function PaymentModal({ order, onClose, onSuccess }) {
  const { token } = useAuth();
  // Prefilled with what is actually left to pay. An empty box next to a wrong "Balance P0.00" is what
  // led to the total being typed in and the design fee being collected twice.
  const owed    = remainingDue(order);
  const deposit = depositDue(order);
  const [amount,      setAmount]      = useState(owed > 0 ? String(owed.toFixed(2)) : '');
  const [method,      setMethod]      = useState('cash');
  const [note,        setNote]        = useState('');
  const [error,       setError]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setError('Enter a valid amount.'); return; }
    // Overpayment is silently absorbed by the backend - the order reads as paid and the difference
    // owed back to the customer exists nowhere. Refuse it here rather than create an invisible debt.
    if (owed > 0 && amt > owed + 0.01) {
      setError(`That is more than the P${owed.toLocaleString('en-PH', { minimumFractionDigits: 2 })} still owed.`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${order.id}/record-payment`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ amount: amt, method, note: note || null }),
      }, 15000);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? d.message ?? 'Failed to record payment.');
        return;
      }
      const data = await res.json();
      onSuccess(data.order ?? data.data ?? null);
      onClose();
    } catch { setError('Network error. Please try again.'); }
    finally  { setSubmitting(false); }
  };

  const fmt = n => Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });

  return (
    <Modal onClose={onClose} maxWidth={440} overflow="visible">
      <ModalHeader title="Record Payment" onClose={onClose} />

      <div style={{ ...S.noteInfo, marginBottom:'16px' }}>
        <div style={{ fontWeight:600, marginBottom:'4px' }}>{order.customerName}</div>
        <div style={{ display:'flex', gap:'16px', fontSize:'12px', flexWrap:'wrap' }}>
          <span>Total: <strong>₱{fmt(orderTotal(order))}</strong></span>
          <span>Paid: <strong>₱{fmt(paidSoFar(order))}</strong></span>
          <span style={{ color: owed > 0 ? '#c2410c' : '#166534' }}>
            Remaining: <strong>₱{fmt(owed)}</strong>
          </span>
        </div>
      </div>

      <div style={S.col}>
        <div>
          <div style={S.label}>Amount *</div>
          <input type="number" min="0.01" step="0.01" max={owed > 0 ? owed : undefined} value={amount}
            onChange={e => { setAmount(e.target.value); setError(''); }}
            onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
            placeholder="0.00"
            style={{ ...S.input, marginTop:'4px', ...(error ? { border:'1px solid #e05252' } : {}) }} />
          {owed > 0 && (
            <div style={{ display:'flex', gap:'6px', marginTop:'6px' }}>
              <button type="button" onClick={() => { setAmount(owed.toFixed(2)); setError(''); }}
                style={{ ...S.btnSmGhost, flex:1, justifyContent:'center' }}>
                Full ₱{fmt(owed)}
              </button>
              {deposit > 0 && deposit < owed && (
                <button type="button" onClick={() => { setAmount(deposit.toFixed(2)); setError(''); }}
                  style={{ ...S.btnSmGhost, flex:1, justifyContent:'center' }}>
                  {order.downpaymentPercent}% ₱{fmt(deposit)}
                </button>
              )}
            </div>
          )}
          {error && <div style={S.errText}>{error}</div>}
        </div>
        <div>
          <div style={S.label}>Method *</div>
          <div style={{ marginTop:'4px' }}>
            <CustomSelect
              value={method}
              onChange={v => setMethod(v)}
              options={[
                { value:'cash',          label:'Cash'          },
                { value:'gcash',         label:'GCash'         },
                { value:'bank_transfer', label:'Bank Transfer' },
                { value:'paymongo',      label:'PayMongo'      },
                { value:'cod',           label:'COD'           },
              ]}
            />
          </div>
        </div>
        <div>
          <div style={S.label}>Note <span style={{ fontWeight:400, textTransform:'none', color:'var(--gray)' }}>(optional)</span></div>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Downpayment, ref #12345"
            style={{ ...S.input, marginTop:'4px' }} />
        </div>
      </div>

      <ModalFooter>
        <button onClick={onClose} disabled={submitting} style={S.btnGhost}>Cancel</button>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ ...S.btnPrimary, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Recording…' : 'Confirm Payment'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ── Archive Confirm Modal ─────────────────────────────────────────────────────

function ArchiveModal({ orderId, onClose, onArchived }) {
  const { token } = useAuth();
  const [archiving, setArchiving] = useState(false);
  const [error,     setError]     = useState('');

  const handleArchive = async () => {
    setArchiving(true); setError('');
    try {
      await deleteOrderApi(orderId, token);
      onArchived(orderId);
      onClose();
    } catch (e) { setError(e.message || 'Failed to archive order.'); }
    finally     { setArchiving(false); }
  };

  return (
    <Modal onClose={onClose} maxWidth={400}>
      <ModalHeader title="Archive Order" onClose={onClose} />
      <p style={{ fontSize:'13px', color:'var(--gray-light)', lineHeight:1.6 }}>
        Archive order{' '}
        <span style={{ fontFamily:'monospace', fontWeight:700, color:'#c2410c' }}>
          {orderNo(orderId)}
        </span>?{' '}
        The order will be hidden but kept for records. You can restore it later via the Archived filter.
      </p>
      {error && <div style={{ ...S.errText, marginTop:'8px' }}>{error}</div>}
      <ModalFooter>
        <button onClick={onClose} disabled={archiving} style={S.btnGhost}>Cancel</button>
        <button onClick={handleArchive} disabled={archiving} style={{ ...S.btnDanger, opacity: archiving ? 0.6 : 1 }}>
          {archiving ? 'Archiving…' : 'Archive'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ── JO Queuing Modal ──────────────────────────────────────────────────────────

// Priority queue of REAL job orders. It used to infer one job order per order from the order list,
// which broke as soon as a mixed order produced several, and its Start button posted the human code
// ("JOB-001") to an endpoint keyed by document id - a silent 404 every time.
function JOQueueModal({ orders, token, onClose, onJOUpdated, onPrintJO }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [jos, setJos] = useState([]);
  const [loadingJos, setLoadingJos] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [qErr, setQErr] = useState('');

  const loadJos = useCallback(async () => {
    setLoadingJos(true); setQErr('');
    try {
      const data = await fetchJobOrders(token);
      setJos(Array.isArray(data) ? data : []);
    } catch (e) { setQErr(e.message || 'Could not load job orders'); setJos([]); }
    finally { setLoadingJos(false); }
  }, [token]);

  useEffect(() => { loadJos(); }, [loadJos]);

  // Order lookup so each job order can still show who it is for.
  const orderById = Object.fromEntries((orders || []).map(o => [String(o.id ?? o._id), o]));

  const joOrders = jos
    .filter(j => !['QC_Passed', 'Completed', 'Cancelled'].includes(j.joStatus))
    .sort((a, b) => {
      const tA = a.targetCompletion ? new Date(a.targetCompletion) : null;
      const tB = b.targetCompletion ? new Date(b.targetCompletion) : null;
      const dA = tA ? Math.ceil((tA - today)/(86400000)) : 999;
      const dB = tB ? Math.ceil((tB - today)/(86400000)) : 999;
      const lA = tA && tA < today, lB = tB && tB < today;
      if (lA && !lB) return -1; if (!lA && lB) return 1;
      if (lA && lB)  return Math.abs(dA) - Math.abs(dB);
      if (a.isRush && !b.isRush) return -1; if (!a.isRush && b.isRush) return 1;
      return dA - dB;
    });

  const startJo = async (j) => {
    const id = joDocId(j);
    setBusyId(id); setQErr('');
    try {
      await updateJobOrder(token, id, { joStatus: 'In Progress' });
      await loadJos();
      onJOUpdated(String(j.orderId), 'In Progress');
    } catch (e) { setQErr(e.message || 'Could not start this job order'); }
    finally { setBusyId(null); }
  };

  return (
    <Modal onClose={onClose} maxWidth={820}>
      <ModalHeader title="Job Order Queue" onClose={onClose} />

      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
        {[
          { color:'#991b1b', bg:'#fef2f2', label:'Delayed'       },
          { color:'#c2410c', bg:'#fff7ed', label:'Rush Order'     },
          { color:'var(--gold)', bg:'#fefce8', label:'Near Deadline'  },
        ].map(p => (
          <div key={p.label} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'var(--gray)' }}>
            <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:p.color }} />
            {p.label}
          </div>
        ))}
      </div>

      {qErr && <div style={{ ...S.note, background:'var(--st-red-bg)', borderColor:'rgba(239,68,68,0.35)', color:'var(--st-red-fg)', marginBottom:'10px' }}>{qErr}</div>}

      {loadingJos
        ? <div style={{ display:'grid', gap:'8px' }}>
            <style>{`@keyframes pmPulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
            {[0,1,2].map(i => <div key={i} style={{ height:64, borderRadius:10, background:'var(--dark2)', animation:'pmPulse 1.4s ease-in-out infinite' }} />)}
          </div>
        : joOrders.length === 0
        ? <EmptyState message="No active job orders" sub="Job orders appear here once created from a paid, design-approved order." />
        : (
          <div style={S.col}>
            {joOrders.map(j => {
              const jid      = joDocId(j);
              const ord      = orderById[String(j.orderId)];
              const target   = j.targetCompletion ? new Date(j.targetCompletion) : null;
              const daysLeft = target ? Math.ceil((target - today)/86400000) : null;
              const isLate   = target && target < today;
              const isUrgent = !isLate && daysLeft !== null && daysLeft <= 2;
              const border   = isLate ? '#fca5a5' : j.isRush ? '#fdba74' : isUrgent ? '#fde68a' : 'var(--border)';
              const busy     = busyId === jid;

              return (
                <div key={jid} style={{ ...S.card, border:`2px solid ${border}`, padding:'14px 18px',
                  display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', alignItems:'center' }}>
                  <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                    <DesignPreview path={j.product?.thumbnail || j.designFilePath} size={40} />
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:'11px', color:'var(--gray)', fontFamily:'monospace', marginBottom:'3px' }}>{j.joId}</div>
                      <div style={{ fontWeight:700, fontSize:'13px', color:'var(--white)' }}>{ord?.customerName ?? (j.orderId ? orderNo(j.orderId) : '-')}</div>
                      <div style={{ fontSize:'12px', color:'var(--gray)', marginTop:'2px' }}>
                        {j.product?.name}{j.product?.variant ? ` - ${j.product.variant}` : ''} x {j.product?.quantity ?? 1}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    {isLate
                      ? <span style={{ ...S.badge, background:'#fef2f2', color:'#991b1b', border:'1px solid #fecaca' }}>
                          DELAYED - {Math.abs(daysLeft)}d late
                        </span>
                      : j.isRush
                        ? <span style={{ ...S.badge, background:'#fff7ed', color:'#c2410c', border:'1px solid #fdba74' }}>RUSH</span>
                        : <span style={{ ...S.badge, background:'var(--dark2)', color:'var(--gray-light)', border:'1px solid var(--border)' }}>Standard</span>
                    }
                    {target && (
                      <div style={{ fontSize:'11px', color: isLate ? '#991b1b' : 'var(--gray)', marginTop:'4px' }}>
                        Due {target.toLocaleDateString('en-PH', { month:'short', day:'numeric' })}
                        {daysLeft !== null && !isLate && ` · ${daysLeft}d left`}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end', alignItems:'center' }}>
                    <JobOrderStatusBadge status={j.joStatus} />
                    {ord && <button onClick={() => onPrintJO(ord, j)} style={S.btnSmGhost}>Print</button>}
                    {j.joStatus === 'Queued' && (
                      <button disabled={busy} style={S.btnSm} onClick={() => startJo(j)}>{busy ? 'Saving…' : 'Start'}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
      <ModalFooter>
        <button onClick={onClose} style={S.btnGhost}>Close</button>
      </ModalFooter>
    </Modal>
  );
}

// ── Print JO Modal ────────────────────────────────────────────────────────────

// The physical sheet that goes to the shop floor. It used to carry only the header details, so the
// operator got a page that never showed the artwork to print or the materials to pull. When a job
// order is supplied its approved design and BOM snapshot are printed with it.
function PrintJOModal({ order, jobOrder = null, onClose }) {
  const [description,   setDescription]   = useState('');
  const [designImages,  setDesignImages]  = useState([]);

  const jo       = jobOrder || {};
  const joCode   = jo.joId || order.joId || 'PENDING';
  const joTarget = jo.targetCompletion || order.targetCompletion || null;
  const joRush   = jo.isRush ?? order.isRush;
  const prodName = jo.product?.name || order.productName || '';
  const prodVar  = jo.product?.variant || order.variant || 'N/A';
  const prodQty  = jo.product?.quantity ?? order.quantity;
  const artwork  = designUrl(jo.designFilePath);
  const bom      = Array.isArray(jo.bomSnapshot) ? jo.bomSnapshot : [];

  const addFiles = files => {
    Array.from(files).forEach(file => {
      const r = new FileReader();
      r.onload = e => e.target?.result && setDesignImages(p => [...p, e.target.result]);
      r.readAsDataURL(file);
    });
  };

  const handlePrint = () => {
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const imgsHtml = designImages.length
      ? `<div style="margin:20px 0;padding:15px;border:2px solid #333;border-radius:8px">
          <h3 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;border-bottom:2px solid #000;padding-bottom:5px">Design References (${designImages.length})</h3>
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            ${designImages.map(img => `<img src="${img}" style="width:calc(33.333% - 10px);min-width:120px;max-width:220px;height:auto;border:1px solid var(--border);border-radius:4px"/>`).join('')}
          </div></div>`
      : '';
    const descHtml = description.trim()
      ? `<div style="margin:20px 0;padding:15px;border:2px solid #333;border-radius:8px">
          <h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase">Instructions</h3>
          <p style="margin:0;font-size:12px;white-space:pre-wrap">${esc(description)}</p></div>`
      : '';

    // Two different things, and the sheet needs both. The PROOF says what the finished item should
    // look like; the PRODUCTION FILE is what actually goes to the machine. Printing only the proof was
    // handing the operator a picture they cannot print, and printing only the file leaves them nothing
    // to check the result against.
    const isPrintableImg = artwork && /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(artwork);
    const prodFiles = Array.isArray(jo.productionFiles) ? jo.productionFiles : [];

    const proofHtml = artwork
      ? `<div style="flex:1;min-width:0;padding:12px;border:1px solid #999;border-radius:8px">
          <h3 style="margin:0 0 8px;font-size:11px;text-transform:uppercase;color:#555;letter-spacing:.5px">Approved proof - result should match this</h3>
          ${isPrintableImg
            ? `<img src="${artwork}" style="max-width:100%;max-height:260px;height:auto;border:1px solid #ccc;border-radius:4px;display:block"/>`
            : `<div style="font-size:12px"><a href="${artwork}">${esc(artwork)}</a></div>`}
        </div>`
      : '';

    const prodHtml = prodFiles.length
      ? `<div style="flex:1;min-width:0;padding:12px;border:2px solid #059669;border-radius:8px">
          <h3 style="margin:0 0 8px;font-size:11px;text-transform:uppercase;color:#059669;letter-spacing:.5px">Production artwork - print this</h3>
          ${prodFiles.map(f => `
            <div style="font-size:12px;margin-bottom:6px;word-break:break-all">
              <strong>${esc(String(f.name || 'file'))}</strong>
              ${f.note ? `<div style="color:#555">${esc(String(f.note))}</div>` : ''}
              <a href="${f.url}">${esc(String(f.url))}</a>
            </div>`).join('')}
        </div>`
      : `<div style="flex:1;min-width:0;padding:12px;border:2px dashed #b45309;border-radius:8px;font-size:12px;color:#b45309">
          <strong>No production artwork attached.</strong><br/>
          The proof is a mockup and cannot be printed. Do not start until the print-ready file is on this job order.
        </div>`;

    const artHtml = (proofHtml || prodHtml)
      ? `<div style="margin:20px 0;display:flex;gap:12px;align-items:flex-start">${proofHtml}${prodHtml}</div>
         ${jo.designNotes ? `<div style="margin:-8px 0 16px;font-size:12px"><strong>Design notes:</strong> ${esc(String(jo.designNotes))}</div>` : ''}`
      : `<div style="margin:20px 0;padding:12px;border:2px dashed #999;border-radius:8px;font-size:12px;color:#777">
          No artwork is attached to this job order. Do not start production until the approved design is available.
        </div>`;

    // Materials to pull, as a tickable checklist.
    const bomHtml = bom.length
      ? `<div style="margin:20px 0;padding:15px;border:2px solid #333;border-radius:8px">
          <h3 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;border-bottom:2px solid #000;padding-bottom:5px">Materials To Pull</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr>
              <th style="text-align:left;padding:5px 4px;border-bottom:1px solid #999;width:24px"></th>
              <th style="text-align:left;padding:5px 4px;border-bottom:1px solid #999">Material</th>
              <th style="text-align:right;padding:5px 4px;border-bottom:1px solid #999">Qty needed</th>
            </tr></thead>
            <tbody>
              ${bom.map(m => `<tr>
                <td style="padding:5px 4px;border-bottom:1px solid #eee">&#9744;</td>
                <td style="padding:5px 4px;border-bottom:1px solid #eee">${esc(String(m.name ?? ''))}</td>
                <td style="padding:5px 4px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${esc(String(m.totalQty ?? ''))} ${esc(String(m.unit ?? ''))}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`
      : '';

    const w = window.open('','','width=800,height=600');
    w.document.write(`<html><head><title>JO - ${joCode}</title>
      <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:20px;color:#000}
      h2{text-align:center;letter-spacing:2px;margin:0 0 4px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
      .label{font-size:10px;text-transform:uppercase;color:#555;margin-bottom:3px}
      .val{font-size:14px;font-weight:700}.sep{border-top:2px solid #000;margin:16px 0}
      @media print{body{margin:10px}}</style></head>
      <body>
        <h2>PERSONALIZE ME</h2>
        <div style="text-align:center;font-size:11px;color:#555;letter-spacing:1px;margin-bottom:16px">Job Order for Production</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div class="label">JO ID</div><div style="font-size:20px;font-weight:700">${joCode}</div>
            <div style="font-size:11px;color:#555;margin-top:2px">Order ${orderNo(order)}</div>
          </div>
          <div style="padding:6px 16px;border:2px solid ${joRush?'#dc2626':'#059669'};border-radius:20px;font-weight:700;font-size:12px;color:${joRush?'#dc2626':'#059669'};text-transform:uppercase">${joRush?'RUSH ORDER':'STANDARD'}</div>
        </div>
        ${joTarget ? `<div style="margin-bottom:12px"><div class="label">Target Completion</div><div class="val">${new Date(joTarget).toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div></div>` : ''}
        <div class="sep"></div>
        <div><div class="label">Customer</div><div class="val">${esc(order.customerName)}</div>
        <div style="font-size:12px;color:#555;margin-top:2px">${esc(order.customerContact||'')} ${order.customerEmail?'· '+esc(order.customerEmail):''}</div></div>
        <div class="sep"></div>
        <div style="padding:12px;border:2px solid #d97706;border-radius:6px;margin:12px 0">
          <div class="label" style="color:#d97706;border-bottom:1px solid #d97706;padding-bottom:4px;margin-bottom:10px">Product Specifications</div>
          <div class="grid">
            <div><div class="label">Product</div><div class="val">${esc(prodName)}</div></div>
            <div><div class="label">Category</div><div class="val">${esc(order.category||'')}</div></div>
            <div><div class="label">Variant</div><div class="val">${esc(prodVar)}</div></div>
            <div><div class="label">Quantity</div><div style="font-size:22px;font-weight:700;color:#d97706">${prodQty} pcs</div></div>
          </div>
        </div>
        ${artHtml}${bomHtml}${imgsHtml}${descHtml}
        <div style="margin-top:24px;padding-top:12px;border-top:1px solid #ccc;font-size:10px;color:#777">
          Printed: ${new Date().toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}
          &nbsp;·&nbsp; Internal Production Document
        </div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 250);
    onClose();
  };

  return (
    <Modal onClose={onClose} maxWidth={600}>
      <ModalHeader title={`Print Job Order - ${joCode}`} onClose={onClose} />

      <div style={{ ...S.col, gap:'16px' }}>
        <div style={{ ...S.card, background:'var(--dark2)', padding:'12px 16px' }}>
          <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'6px' }}>{order.customerName}</div>
          <div style={{ fontSize:'12px', color:'var(--gray)' }}>{order.productName} × {order.quantity} pcs</div>
        </div>

        <div>
          <div style={{ ...S.label, marginBottom:'6px' }}>Design Images <span style={{ fontWeight:400, textTransform:'none', color:'var(--gray)' }}>(optional)</span></div>
          <div style={{ border:'2px dashed var(--border)', borderRadius:'8px', padding:'16px', textAlign:'center',
            background: designImages.length ? 'var(--dark2)' : 'var(--dark2)', cursor:'pointer' }}
            onClick={() => document.getElementById('_joDesignInput').click()}>
            {designImages.length > 0
              ? (
                <div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))', gap:'8px', marginBottom:'8px' }}>
                    {designImages.map((img, i) => (
                      <div key={i} style={{ position:'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt="" style={{ width:'100%', aspectRatio:'1/1', objectFit:'cover', borderRadius:'6px', border:'1px solid var(--border)' }} />
                        <button type="button" onClick={e => { e.stopPropagation(); setDesignImages(p => p.filter((_,j)=>j!==i)); }}
                          style={{ position:'absolute', top:'-6px', right:'-6px', width:'18px', height:'18px',
                            background:'#e05252', border:'2px solid var(--border)', borderRadius:'50%', color:'var(--dark)',
                            fontSize:'10px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0 }}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:'11px', color:'var(--gray)' }}>Click to add more</div>
                </div>
              )
              : (
                <div>
                  <div style={{ fontSize:'13px', color:'var(--gray-light)', marginBottom:'4px' }}>Click to upload design images</div>
                  <div style={{ fontSize:'11px', color:'var(--gray)' }}>PNG, JPG - multiple supported</div>
                </div>
              )
            }
            <input id="_joDesignInput" type="file" accept="image/*" multiple style={{ display:'none' }}
              onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value=''; }} />
          </div>
        </div>

        <div>
          <div style={{ ...S.label, marginBottom:'6px' }}>Print Instructions <span style={{ fontWeight:400, textTransform:'none', color:'var(--gray)' }}>(optional)</span></div>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Special instructions for production…"
            rows={3} style={S.textarea} />
        </div>
      </div>

      <ModalFooter>
        <button onClick={onClose} style={S.btnGhost}>Cancel</button>
        <button onClick={handlePrint} style={S.btnPrimary}>{ICONS.download} Print</button>
      </ModalFooter>
    </Modal>
  );
}

// ── Section label helper ──────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize:'11px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase',
      letterSpacing:'.5px', marginBottom:'8px' }}>
      {children}
    </div>
  );
}

// ── Timeout helper ────────────────────────────────────────────────────────────

function isExpired(order) {
  if (order.orderStatus !== 'Pending') return false;
  if (order.paymentStatus === 'paid') return false;
  return (Date.now() - new Date(order.createdAt).getTime()) / 86400000 >= EXPIRY_DAYS;
}

// ── Status transition map ─────────────────────────────────────────────────────

// A courier that could not deliver brings the goods back BEFORE anyone received them, so "Returned"
// has to be reachable from For Delivery - not only from Delivered. The backend already allowed it;
// this map was the stricter one, which left a failed delivery with nowhere to go.
function getAvailableStatuses(o) {
  if (!o) return [];

  // The three maps below grew mixed keys - 'Pending' next to 'pending', 'In Production' next to
  // 'in_production' - because the vocabulary moved to canonical lowercase while older orders kept the
  // old spellings. The custom map happened to carry both; the COD and plain maps only had the
  // capitalised ones. So a READY-MADE order sitting at canonical 'pending' matched nothing at all and
  // the admin was told "No available transitions" on an order that had only just been paid for.
  //
  // Rather than add yet more duplicate keys, look the status up under every spelling it could be
  // written in. New statuses then work in all three maps without anyone remembering to add both.
  const raw = o.orderStatus;
  const pick = (map) => {
    if (map[raw] !== undefined) return map[raw];
    const lower = String(raw ?? '').toLowerCase().replace(/[\s-]+/g, '_');
    if (map[lower] !== undefined) return map[lower];
    const spaced = lower.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (map[spaced] !== undefined) return map[spaced];
    return [];
  };

  const s = o.orderStatus;
  const isCOD = (o.paymentMethod || '').toLowerCase() === 'cod';
  if (o.isCustom) {
    // Once any payment (downpayment or COD) has landed, "Awaiting Payment" is no longer a valid
    // next step - the customer already paid to unlock production. Only offer it when still unpaid.
    const paidCustom = isCOD || ['partial', 'paid'].includes(o.paymentStatus) || Number(o.downPayment) > 0;
    // Keyed by BOTH the canonical codes and the legacy ones that older orders still carry.
    // A custom order now starts at plain "pending", and this map had no entry for it - so
    // every new custom order showed "No available transitions" and could never be moved.
    // Custom orders enter production ONLY by creating a Job Order (Job Orders module), which
    // enforces downpayment-paid + design-approved and gives Production/QC a JO to build. So the
    // manual dropdown does NOT offer "In Production" from pending/processing - only Cancel here.
    return pick({
      pending:             ['Cancelled'],
      Pending:             ['Cancelled'],
      pending_review:      paidCustom ? [] : ['awaiting_payment'],
      design_approved:     paidCustom ? [] : ['awaiting_payment'],
      awaiting_payment:    [],
      awaiting_production: [],
      processing:          ['Cancelled'],
      Processing:          ['Cancelled'],
      in_production:       ['for_qc'],
      'In Production':     ['for_qc'],
      for_qc:              ['ready_for_delivery'],
      ready_for_delivery:  ['For Delivery'],
      for_delivery:        ['Delivered', 'Returned'],
      'For Delivery':      ['Delivered', 'Returned'],
      delivered:           ['Returned'],
      Delivered:           ['Returned'],
    });
  }
  if (isCOD) {
    // A shelf item is picked, not produced. Offering In Production for one sends an order into a
    // stage with no Job Order behind it, which Production and QC then have nothing to work on.
    if (!o.needsProduction) {
      return pick({
        Pending:        ['Processing', 'Cancelled'],
        Processing:     ['For Delivery', 'Cancelled'],
        'For Delivery': ['Delivered', 'Returned'],
        Delivered:      ['Returned'],
      });
    }
    return pick({
      Pending:        ['Processing', 'Cancelled'],
      Processing:     ['In Production', 'For Delivery', 'Cancelled'],
      'In Production': ['for_qc', 'Cancelled'],
      for_qc:         ['ready_for_delivery'],
      ready_for_delivery: ['For Delivery'],
      'For Delivery': ['Delivered', 'Returned'],
      Delivered:      ['Returned'],
    });
  }
  return pick({
    Pending:        ['Processing', 'Cancelled'],
    Processing:     ['For Delivery', 'Cancelled'],
    'For Delivery': ['Delivered', 'Returned'],
    Delivered:      ['Returned'],
  });
}

// ── Expanded Order Detail ─────────────────────────────────────────────────────

// Thumbnails for files chosen but not yet sent. Without this the owner clicks "Send 1 File" on
// faith and only discovers what actually went out once the customer has already seen it. Object URLs
// are revoked when the selection changes so the blobs do not leak.
// The only thing worth refusing: a file with neither a MIME type nor an extension. Nothing
// downstream - not the browser, not Cloudinary - can classify it, so it stores as something that
// will never play back. Everything else uploads; Cloudinary serves a browser-friendly copy.
function isUnidentifiable(file) {
  return !file.type && !/\.[a-z0-9]{2,5}$/i.test(file.name);
}

/** Split a picked batch into what we can accept and what we must refuse. */
function screenFiles(files) {
  const accepted = files.filter(f => !isUnidentifiable(f));
  const rejected = files.filter(isUnidentifiable).map(f => f.name);
  const note = rejected.length
    ? `${rejected.join(', ')} has no file extension, so it cannot be recognised. Rename it with its proper extension and try again.`
    : '';
  return { accepted, note };
}

function DraftFilePreview({ files = [], onRemove, onOpen }) {
  const [urls, setUrls] = useState([]);
  const [thumbs, setThumbs] = useState({});       // captured first frames, keyed by tile index
  const liveUrls = useRef([]);

  // Draw the clip's first frame onto a canvas so the tile shows the artwork rather than a generic
  // marker - the same thing Explorer shows. Only possible when the browser can decode the file; for
  // anything it cannot, the tile keeps its plain video badge.
  const captureThumb = (url, i) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.src = url;
    const bail = setTimeout(() => { v.src = ''; }, 6000);
    v.onloadeddata = () => {
      try { v.currentTime = Math.min(0.1, (v.duration || 1) / 10); } catch { /* seek unsupported */ }
    };
    v.onseeked = () => {
      clearTimeout(bail);
      try {
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 160; c.height = v.videoHeight || 120;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        setThumbs(prev => ({ ...prev, [i]: c.toDataURL('image/jpeg', 0.7) }));
      } catch { /* tainted or undecodable - leave the badge */ }
      v.src = '';
    };
    v.onerror = () => clearTimeout(bail);
  };

  // Object URLs must NOT be revoked in the effect's own cleanup. React re-runs effects in
  // development (mount, clean up, mount again), so revoking there tears down the URL the element is
  // still reading from - a video streams progressively and dies mid-load, which showed as a preview
  // that appeared for a moment and then vanished. Revoke the PREVIOUS batch when the files change,
  // and everything on unmount.
  useEffect(() => {
    liveUrls.current.forEach(URL.revokeObjectURL);
    const made = files.map(f => ({ url: URL.createObjectURL(f), file: f }));
    liveUrls.current = made.map(m => m.url);
    setUrls(made);
    setThumbs({});
    made.forEach((m, i) => { if (m.file.type.startsWith('video/')) captureThumb(m.url, i); });
  }, [files]);

  useEffect(() => () => { liveUrls.current.forEach(URL.revokeObjectURL); }, []);

  if (!files.length) return null;

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'6px' }}>
      {urls.map((m, i) => {
        const isImg = /^image\//.test(m.file.type);
        const isVid = /^video\//.test(m.file.type);
        const kb = m.file.size > 1048576
          ? `${(m.file.size / 1048576).toFixed(1)} MB`
          : `${Math.max(1, Math.round(m.file.size / 1024))} KB`;
        return (
          <div key={i} style={{ width:'92px' }}>
            <div style={{ position:'relative', width:'92px', height:'92px', borderRadius:'8px', overflow:'hidden', border:'1px solid var(--border)', background:'var(--dark2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {isImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                // Thumbnail to look at; the click still opens the original, because that is the
                // file the shop has to inspect before it prints.
                <img src={cloudinaryThumb(m.url, 320)} alt={m.file.name} onClick={() => onOpen?.(m.url, 'image')}
                  title="Click to enlarge"
                  style={{ width:'100%', height:'100%', objectFit:'contain', cursor:'zoom-in' }} />
              ) : isVid ? (
                // Decoding a clip just to fill a 92px tile is wasted work and it is what made the
                // strip sit there loading. The tile appears instantly; the video is only fetched
                // once it is actually asked for.
                (
                  <button type="button" onClick={() => onOpen?.(m.url, 'video')} title="Click to watch"
                    style={{ position:'relative', width:'100%', height:'100%', border:'none', padding:0, background:'var(--dark)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', color:'var(--gold)', overflow:'hidden' }}>
                    {thumbs[i] ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbs[i]} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"
                          style={{ position:'relative', filter:'drop-shadow(0 1px 3px rgba(0,0,0,.8))' }}>
                          <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16" fill="#fff" stroke="none" />
                        </svg>
                      </>
                    ) : (
                      <>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none" />
                        </svg>
                        <span style={{ fontSize:'9px', fontWeight:700, letterSpacing:'.4px' }}>VIDEO</span>
                      </>
                    )}
                  </button>
                )
              ) : (
                <span style={{ fontSize:'10px', fontWeight:700, color:'var(--gold)' }}>
                  {(m.file.name.split('.').pop() || 'FILE').toUpperCase()}
                </span>
              )}
              {onRemove && (
                <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${m.file.name}`}
                  style={{ position:'absolute', top:'2px', right:'2px', width:'18px', height:'18px', borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.65)', color:'#fff', cursor:'pointer', fontSize:'12px', lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>x</button>
              )}
            </div>
            <div title={m.file.name} style={{ fontSize:'10px', color:'var(--gray)', marginTop:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {m.file.name}
            </div>
            <div style={{ fontSize:'9px', color:'var(--gray)', opacity:.75 }}>{kb}</div>
          </div>
        );
      })}
    </div>
  );
}

function OrderDetail({ o, token, onStatusUpdated, onPayment, onDelete }) {
  const fmt = n => Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });

  const today = new Date(); today.setHours(0,0,0,0);

  const [lo,          setLo]          = useState(o);
  const [selStatus,   setSelStatus]   = useState(o.orderStatus);
  const [confirmSt,   setConfirmSt]   = useState(false);
  const [isUpdating,  setIsUpdating]  = useState(false);
  const [updateErr,   setUpdateErr]   = useState('');
  const [designAct,   setDesignAct]   = useState(null);
  const [designErr,   setDesignErr]   = useState('');
  const [draftFiles,  setDraftFiles]  = useState([]);
  const [uploading,   setUploading]   = useState(false);
  const [expiring,    setExpiring]    = useState(false);
  const [expireErr,   setExpireErr]   = useState('');
  const [feeInput,    setFeeInput]    = useState('');
  const [savingFee,   setSavingFee]   = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxKind, setLightboxKind] = useState(null);
  const [showApproved, setShowApproved] = useState(false);
  const [showReject,  setShowReject]  = useState(false);
  const [rejectReason,setRejectReason]= useState('');
  const [rejectOther, setRejectOther] = useState('');
  const [showFix,     setShowFix]     = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  // Which custom line the admin is acting on (per-item design, Option 2 mixed cart).
  const [activeItemIdx, setActiveItemIdx] = useState(0);
  const [showProof, setShowProof] = useState(false);   // T&C acceptance proof panel
  // Same upload panel, two jobs: a proof asks the customer to approve, a mockup only shows them.
  const [mockupMode, setMockupMode] = useState(false);
  const [delivDate,   setDelivDate]   = useState('');
  const [savingDeliv, setSavingDeliv] = useState(false);
  const [feeErr,      setFeeErr]      = useState('');
  // Every job order of this order. A mixed cart makes one per printable item, so reading the single
  // `joId` field showed only the first and hid the rest.
  const [jobOrders,   setJobOrders]   = useState([]);
  const [joBusyId,    setJoBusyId]    = useState(null);

  // Keyed on the order id, not the object. The list refreshes on a timer, and keying on `o` meant
  // each refresh rebuilt this panel from list data - discarding a proof that had just been uploaded.
  // Actions inside the panel merge their own fresh copy, so nothing is lost by ignoring the refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLo(o); setSelStatus(o.orderStatus); }, [o.id]);

  const loadJobOrders = useCallback(async () => {
    const oid = o._id ?? o.id;
    if (!token || !oid) return;
    try {
      const data = await fetchJobOrders(token, { orderId: String(oid) });
      setJobOrders(Array.isArray(data) ? data : []);
    } catch { setJobOrders([]); }
  }, [token, o._id, o.id]);

  useEffect(() => { loadJobOrders(); }, [loadJobOrders]);

  // Advance one job order from the order screen. The old shortcut passed the human code ("JOB-001")
  // to an endpoint that looks up by document id, so it always 404'd - and the error was swallowed.
  // One click here starts real work or hands the batch to the next station, from a compact row in a
  // busy panel. Neither is easy to undo, so both ask first.
  const [joConfirm, setJoConfirm] = useState(null);
  // A status change is the one thing on this screen that reaches the CUSTOMER: it emails them and,
  // at the far end, closes the sale. So each one says what it will actually do rather than a bare
  // "Are you sure?", which teaches people to click through without reading.
  const STATUS_COPY = {
    processing:         { title: 'Accept this order?',       label: 'Accept order',       body: 'The customer is told you have accepted their order and started work.' },
    in_production:      { title: 'Move to production?',      label: 'Move to production', body: 'The order moves to the production floor.' },
    for_qc:             { title: 'Send to quality control?', label: 'Send to QC',         body: 'Quality control decides what passes. Anything rejected comes back to be remade.' },
    ready_for_delivery: { title: 'Mark ready for delivery?', label: 'Mark ready',         body: 'The order is packed and waiting for the courier.' },
    for_delivery:       { title: 'Send this out?',           label: 'Send it out',        body: 'The customer is notified that their order is on the way.' },
    delivered:          { title: 'Mark as delivered?',       label: 'Mark delivered',     body: 'This closes the sale. It counts as revenue in Reports, the customer is asked to leave a review, and the only way back is to mark the order Returned.', danger: true },
    returned:           { title: 'Mark as returned?',        label: 'Mark returned',      body: 'The sale is reversed. If you ticked that the goods came back sellable, ready-made items go back into stock. Personalised items never do.', danger: true },
    cancelled:          { title: 'Cancel this order?',       label: 'Yes, cancel it',     body: 'Reserved material is released back to stock and the customer is notified. Any deposit is handled under the cancellation terms they accepted. This cannot be undone.', danger: true },
    awaiting_payment:   { title: 'Ask for payment?',         label: 'Request payment',    body: 'The customer is asked to pay before this goes any further.' },
  };
  const statusCopy = (v) => {
    const k = String(v ?? '').toLowerCase().replace(/[\s-]+/g, '_');
    return STATUS_COPY[k] ?? {
      title: 'Update this order?',
      label: `Set to ${getStatusBadge(v).label}`,
      body: `This moves the order to ${getStatusBadge(v).label} and notifies the customer.`,
    };
  };

  const JO_COPY = {
    'In Progress': { title: 'Start this job?',            body: 'Production begins and the reserved material is committed to it.', label: 'Start' },
    'QC_Pending':  { title: 'Send to quality control?',   body: 'The batch leaves the bench and QC decides what passes. Anything rejected comes back to be remade.', label: 'Send to QC' },
  };

  const advanceJO = async (jo, joStatus) => {
    const id = joDocId(jo);
    setJoBusyId(id);
    try {
      await updateJobOrder(token, id, { joStatus });
      setJoConfirm(null);
      await loadJobOrders();
      const fresh = await refetchOrder();
      if (fresh) setLo(fresh);
    } catch (e) { setUpdateErr(e.message || 'Could not update the job order.'); }
    finally { setJoBusyId(null); }
  };

  // Re-read this order after a job order moves, so orderStatus/joStatus reflect the aggregate.
  const refetchOrder = async () => {
    const oid = o._id ?? o.id;
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${oid}`, { headers: { Authorization:`Bearer ${token}` } }, 15000);
      if (!res.ok) return null;
      const j = await res.json();
      return j?.data ?? j?.order ?? null;
    } catch { return null; }
  };
  // Both of these reset work-in-progress, so they must fire only when a DIFFERENT order is opened.
  // Keyed on the whole `o` object they fired on every parent re-render - and since one of them calls
  // setDraftFiles([]), any background refresh silently threw away files that were staged but not yet
  // sent. That is why attachments vanished after a few seconds regardless of type.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setFeeInput(o.courierFee != null && Number(o.courierFee) > 0 ? String(o.courierFee) : ''); }, [o.id]);
  // Default the per-item design controls to the first custom line whenever the order opens.
  useEffect(() => {
    const first = (o.items || []).findIndex(it => it.isCustom || it.designRequested || it.designUrl || it.designName || it.adminDesignUrl);
    setActiveItemIdx(first >= 0 ? first : 0);
    setShowReject(false); setShowFix(false); setConfirmApprove(false); setDraftFiles([]); setShowProof(false); setMockupMode(false);
    // Intentionally keyed on the order id alone: re-running this on every `o.items` change would
    // clear staged files again, which is the bug this is fixing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id]);

  const handleCourierFeePaid = async (paid) => {
    setSavingFee(true); setFeeErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ courierFeePaid: paid }),
      }, 15000);
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.message || 'Failed to update'); }
      const updated = { ...lo, courierFeePaid: paid };
      setLo(updated);
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) { setFeeErr(err.message || 'Failed to update'); }
    finally { setSavingFee(false); }
  };

  const handleSaveCourierFee = async () => {
    const val = parseFloat(feeInput);
    if (isNaN(val) || val < 0) { setFeeErr('Enter a valid amount.'); return; }
    setSavingFee(true); setFeeErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ courierFee: val }),
      }, 15000);
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.message || 'Failed to save delivery fee'); }
      const updated = { ...lo, courierFee: val };
      setLo(updated);
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) { setFeeErr(err.message || 'Failed to save delivery fee'); }
    finally { setSavingFee(false); }
  };

  const canDelete  = ['Cancelled','Delivered','Returned'].includes(lo.orderStatus);
  const canExpire  = lo.orderStatus === 'Pending' && lo.paymentStatus !== 'paid' && isExpired(lo);

  const handleExpire = async () => {
    setExpiring(true); setExpireErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ orderStatus: 'Cancelled', cancellationReason: 'order_expired' }),
      }, 15000);
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.message || d.error || 'Failed to expire order'); }
      const updated = { ...lo, orderStatus: 'Cancelled' };
      setLo(updated);
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) { setExpireErr(err.message || 'Failed to expire order'); }
    finally { setExpiring(false); }
  };

  const target   = lo.targetCompletion ? new Date(lo.targetCompletion) : null;
  const daysLeft = target ? Math.ceil((target - today)/86400000) : null;
  const isLate   = target && target < today;
  const availableRaw = getAvailableStatuses(lo);

  // The stage is only blocked while money is genuinely outstanding. COD collects on delivery, so it
  // is never "awaiting payment" in this sense.
  // How long finished goods have been sitting unpaid. Personalised stock cannot be resold, so this is
  // the number that decides whether to keep chasing or to write the order off - and without it the
  // order simply disappears into the list.
  const readySince = lo.readyAt ? Math.floor((Date.now() - new Date(lo.readyAt).getTime()) / 86400000) : null;

  const awaitingMoney = ['awaiting_payment', 'ready_for_delivery'].includes(lo.orderStatus)
    && lo.paymentStatus !== 'paid'
    && String(lo.paymentMethod || '').toLowerCase() !== 'cod'
    && remainingDue(lo) > 0;

  // QC decides when an order is ready, not the status box. Offering "Ready for Delivery" while jobs
  // are still on the bench let the whole inspection be skipped with one click, and the order would
  // then be dragged back to In Production by the next QC sync anyway.
  const openJobs = jobOrders.filter(j => !['QC_Passed', 'Completed', 'Cancelled'].includes(j.joStatus));
  const available = openJobs.length > 0
    ? availableRaw.filter(st => !['ready_for_delivery', 'for_delivery', 'delivered',
                                 'Ready for Delivery', 'For Delivery', 'Delivered'].includes(st))
    : availableRaw;

  // Job Order coverage. Each printable item needs its own job order, so "already job-ordered" is not
  // "a joId exists" - it is "every printable item has a live job order".
  const printableItems = (lo.items || []).filter(it => it.isCustom || it.isMadeToOrder).length;
  const liveJobOrders  = jobOrders.filter(j => j.joStatus !== 'Cancelled').length;
  const jobOrdersMissing = Math.max(0, printableItems - liveJobOrders);
  const hasAnyJobOrder = liveJobOrders > 0;

  const [returnReason,   setReturnReason]   = useState('');
  const [returnOther,    setReturnOther]    = useState('');
  const [returnSellable, setReturnSellable] = useState(false);
  const [cancelReason,   setCancelReason]   = useState('');
  const [cancelOther,    setCancelOther]    = useState('');
  const [refundAmt,      setRefundAmt]      = useState('');
  const [payingRefund,   setPayingRefund]   = useState(false);
  const [refundMethod,   setRefundMethod]   = useState('gcash');
  const [refundErr,      setRefundErr]      = useState('');

  const handleMarkRefunded = async () => {
    setPayingRefund(true); setRefundErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/mark-refunded`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: Number(lo.refundOwed || 0), method: refundMethod }),
      }, 15000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Could not record the refund.');
      const updated = { ...lo, refundOwed: 0, refunds: d?.data?.refunds ?? lo.refunds };
      setLo(updated);
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) {
      setRefundErr(err.message || 'Could not record the refund.');
    } finally {
      setPayingRefund(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selStatus || selStatus === lo.orderStatus) return;
    // The modal stays open until this SUCCEEDS. Closing it up front left the admin looking at an
    // unchanged screen for up to 15 seconds with no sign anything was happening, and if the request
    // failed the confirmation was already gone.
    setIsUpdating(true); setUpdateErr('');
    try {
      const payload = selStatus === 'Paid' ? { paymentStatus:'paid' } : { orderStatus: selStatus };
      // A return needs two facts nothing else records: why the goods came back, and whether they are
      // sellable. Without the second, ready-made stock the shop physically has is written off.
      if (String(selStatus).toLowerCase() === 'returned') {
        payload.returnReason = returnReason === 'Other' ? returnOther.trim() : returnReason;
        payload.restock      = returnSellable;
      }
      // A cancellation the customer did not ask for needs the same two facts a return does: why,
      // and what happens to the money. Blank refund means "everything back", which is the right
      // default when nothing was made.
      if (String(selStatus).toLowerCase() === 'cancelled') {
        payload.cancelReason = cancelReason === 'Other' ? cancelOther.trim() : cancelReason;
        if (refundAmt !== '') payload.refundAmount = Number(refundAmt);
      }
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}`, {
        method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify(payload),
      }, 15000);
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.message || d.error || 'Update failed'); }
      const updated = selStatus === 'Paid'
        ? { ...lo, paymentStatus:'paid' }
        : { ...lo, orderStatus: selStatus };
      setLo(updated);
      setConfirmSt(false);
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) { setUpdateErr(err.message || 'Update failed'); }
    finally { setIsUpdating(false); }
  };

  // Each design action targets the selected line (itemIndex) and the backend returns the order with
  // the re-synced aggregate - merge it so both the item's status and the overall design badge update.
  const mergeLo = (data) => {
    const u = data?.data ?? data?.order ?? data;
    if (!u || (!u.items && !u.designStatus && !u.orderStatus)) return;
    setLo(p => ({ ...p, ...u, id: p.id }));
  };

  const handleApproveDesign = async () => {
    setDesignAct('approving'); setDesignErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/approve-design`,
        { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ itemIndex: activeItemIdx }) }, 15000);
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Failed');
      mergeLo(data);
      setConfirmApprove(false);
      if (onStatusUpdated) onStatusUpdated(lo.id, data?.data ?? data?.order ?? data);
    } catch (err) { setDesignErr(err.message); }
    finally { setDesignAct(null); }
  };

  const fmtDeliveryInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };
  const handleSaveDelivery = async () => {
    const chosen = delivDate || fmtDeliveryInput(lo.estimatedDeliveryMax);
    if (!chosen) return;
    setSavingDeliv(true); setUpdateErr('');
    try {
      const iso = new Date(chosen + 'T00:00:00').toISOString();
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}`,
        { method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ estimatedDeliveryMin: iso, estimatedDeliveryMax: iso }) }, 15000);
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.message || d.error || 'Failed'); }
      const updated = { ...lo, estimatedDeliveryMin: iso, estimatedDeliveryMax: iso };
      setLo(updated); setDelivDate('');
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) { setUpdateErr(err.message || 'Failed to update delivery date'); }
    finally { setSavingDeliv(false); }
  };

  // The shop confirms a rush REQUEST ("kaya ba isabay"). Decline waives + credits the rush fee.
  const handleRushDecision = async (decision) => {
    setSavingDeliv(true); setUpdateErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/rush-decision`,
        { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ decision }) }, 15000);
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Failed');
      const u = data.data ?? data;
      setLo(p => ({ ...p, rushStatus: u.rushStatus ?? decision, isRush: u.isRush ?? p.isRush, rushFee: u.rushFee ?? p.rushFee, totalAmount: u.totalAmount ?? p.totalAmount, balance: u.balance ?? p.balance }));
      if (onStatusUpdated) onStatusUpdated(lo.id, data?.data ?? data?.order ?? data);
    } catch (err) { setUpdateErr(err.message || 'Failed to update rush.'); }
    finally { setSavingDeliv(false); }
  };

  const [reminding,  setReminding]  = useState(false);
  const [remindMsg,  setRemindMsg]  = useState(null);

  // Disposal at the end of the holding period. Two presses, and the figures are shown before the
  // second - writing off finished goods is not something to do from a single button.
  const [writingOff,  setWritingOff]  = useState(false);
  const [woConfirm,   setWoConfirm]   = useState(false);
  const [woErr,       setWoErr]       = useState('');

  const handleWriteOff = async () => {
    setWritingOff(true); setWoErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/write-off`,
        { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
          body: JSON.stringify({}) }, 15000);
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Could not write off this order.');
      setLo(p => ({ ...p, orderStatus:'cancelled', isArchived:true, writeOff:data.data ?? data }));
      setWoConfirm(false);
      if (onStatusUpdated) onStatusUpdated(lo.id, { orderStatus:'cancelled' });
    } catch (err) { setWoErr(err.message); }
    finally { setWritingOff(false); }
  };

  const handleRemindBalance = async () => {
    setReminding(true); setRemindMsg(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/remind-balance`,
        { method:'POST', headers:{ Authorization:`Bearer ${token}` } }, 15000);
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Failed to send the reminder.');
      setRemindMsg({ ok:true, text:'Reminder sent to the customer, in the bell and in your chat.' });
    } catch (err) {
      setRemindMsg({ ok:false, text: err.message });
    } finally { setReminding(false); }
  };

  const handleRevertApprove = async () => {
    setDesignAct('reverting'); setDesignErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/revert-design`,
        { method:'POST', headers:{ Authorization:`Bearer ${token}` } }, 15000);
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Failed');
      mergeLo(data);
      if (onStatusUpdated) onStatusUpdated(lo.id, data?.data ?? data?.order ?? data);
    } catch (err) { setDesignErr(err.message); }
    finally { setDesignAct(null); }
  };

  const handleRejectDesign = async () => {
    const reason = (rejectReason === 'Other' ? rejectOther.trim() : rejectReason).trim();
    if (!reason) { setDesignErr('Please choose or type a reason.'); return; }
    setDesignAct('rejecting'); setDesignErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/reject-design`,
        { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ reason, itemIndex: activeItemIdx }) }, 15000);
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Failed');
      mergeLo(data);
      setShowReject(false); setRejectReason(''); setRejectOther('');
      if (onStatusUpdated) onStatusUpdated(lo.id, data?.data ?? data?.order ?? data);
    } catch (err) { setDesignErr(err.message); }
    finally { setDesignAct(null); }
  };

  const handleUploadDesign = async (files) => {
    if (!files.length) return;

    // The file is relayed browser -> our server -> Cloudinary, so a proof video takes far longer than
    // an ordinary request. 30s was cutting off uploads that were still in flight, which left the file
    // sitting staged with no explanation. Two minutes, and the server gives up first (100s) so the
    // failure arrives as a real message rather than a silent client timeout.
    const oversize = files.find(f => f.size > 50 * 1024 * 1024);
    if (oversize) {
      setDesignErr(`"${oversize.name}" is over the 50 MB limit. Compress it or send a shorter clip.`);
      return;
    }

    setUploading(true); setDesignErr('');
    try {
      const form = new FormData();
      files.forEach(f => form.append('design[]', f));
      form.append('itemIndex', String(activeItemIdx));
      if (mockupMode) form.append('informational', '1');
      // A shared artwork lands on every product it covers in one send, instead of the owner
      // uploading the identical proof once per line.
      (uploadTargets ?? [activeItemIdx]).forEach(i => form.append('itemIndexes[]', String(i)));
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/upload-design`,
        { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: form },
        // The server relays each file to Cloudinary in turn, allowing 100s apiece. A flat 120s here
        // therefore only ever covered ONE file - send two and the browser gave up while the server
        // was still working on the second, surfacing as a bare "Failed to fetch". Budget per file,
        // and keep the client's ceiling above the server's so the failure arrives explained.
        60000 + files.length * 110000,
        // Never retry: the body is a consumed stream and a resend would upload the proof twice.
        0);
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      const updated = data?.data ?? data?.order ?? data;
      mergeLo(data);
      setDraftFiles([]); setShowFix(false);
      // Hand the parent the order we just got back. Calling this WITHOUT it made the list refetch
      // instead, and when that returned it replaced this panel's state through the `o` prop - which
      // threw away the proof we had merged a moment earlier and put the previous one back on screen.
      // That was the "it reverts to the old upload" the owner kept hitting.
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) { setDesignErr(err.message); }
    finally { setUploading(false); }
  };

  const hasDesignWork = lo.isCustom || lo.items?.some(i => i.designRequested);
  // Per-item design (Option 2): the custom lines the admin can act on, and the selected one's fields.
  const designItems = (lo.items || []).map((it, idx) => ({ it, idx })).filter(({ it }) => it.isCustom || it.designRequested || it.designUrl || it.designName || it.adminDesignUrl);
  const ai = lo.items?.[activeItemIdx] ?? {};
  const aiStatus = ai.designStatus ?? (designItems.length <= 1 ? lo.designStatus : null) ?? null;
  // Kept as { url, name } rather than mapped down to url strings. Cloudinary renames every upload to
  // a random public_id, so the URL cannot tell anyone what the customer actually sent - the original
  // filename only exists on the line, and dropping it here was why the tiles were anonymous.
  const aiFiles = (ai.designFiles?.length
    ? ai.designFiles.map(f => ({ url: f.url, name: f.name || null }))
    : [{ url: ai.designUrl, name: ai.designName || null }]
  ).filter(f => f.url);
  // A proof can be several files. Reading only adminDesignUrl showed the owner one tile after
  // sending two, while the customer - who already reads the plural field - saw both. Prefer the
  // array, fall back to the single legacy field for proofs sent before it existed.
  // Request lines are one section (one artwork); each upload is its own, being a distinct file.
  const designSections = (() => {
    const reqs = designItems.filter(({ it }) => it.designRequested || (!it.designUrl && !it.designFiles?.length));
    const ups  = designItems.filter(({ it }) => !(it.designRequested || (!it.designUrl && !it.designFiles?.length)));
    const out = [];
    if (reqs.length) out.push({
      key: 'request', request: true, entries: reqs, indices: reqs.map(e => e.idx),
      label: reqs.length > 1 ? `Design request (${reqs.length} products)` : `${reqs[0].it.productName || 'Item'} (Request)`,
    });
    ups.forEach(e => out.push({
      key: `upload_${e.idx}`, request: false, entries: [e], indices: [e.idx],
      label: `${e.it.productName || `Item ${e.idx + 1}`} (Upload)`,
    }));
    return out;
  })();
  const activeSection = designSections.find(sec => sec.indices.includes(activeItemIdx)) ?? designSections[0];
  const uploadTargets = activeSection?.indices ?? [activeItemIdx];

  const [reviewLinkState, setReviewLinkState] = useState(null);
  const [msgState, setMsgState] = useState('idle');
  const [convertState, setConvertState] = useState('idle');
  const [confirmConvert, setConfirmConvert] = useState(false);

  // Bills the design fee onto the BALANCE rather than charging it. Nothing moves until the
  // customer settles the rest, which is why this is safe to press after they have agreed in
  // chat - and why taking the fee up front and refunding it would not have been.
  const convertToDesign = async () => {
    setConvertState('sending');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/convert-to-design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      }, 15000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Could not convert this order.');
      const updated = { ...lo, ...(d?.data ?? {}), id: lo.id };
      setLo(updated);
      setConfirmConvert(false);
      setConvertState('done');
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) {
      setConvertState('error');
    }
  };

  const messageCustomer = async () => {
    setMsgState('sending');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipient_id: String(lo.userId ?? lo.user_id ?? ''),
          type: 'order_reference',
          order_id: String(lo.id ?? lo._id ?? ''),
          body: 'Hi! We have your file but no printing instructions with it. '
            + 'Could you tell us how you would like it printed - which side, roughly what size, '
            + 'and whether this file is the final artwork or reference for us to design from? '
            + 'We will not print until you confirm.',
          metadata: {
            orderId: String(lo.id ?? lo._id ?? ''),
            orderNo: lo.orderNumber ?? lo.orderNo ?? 'Order',
            products: (lo.items ?? []).map(i => i.productName).filter(Boolean).join(', '),
          },
        }),
      }, 15000);
      setMsgState(res.ok ? 'sent' : 'error');
    } catch { setMsgState('error'); }
  };

  const sendReviewLink = async () => {
    setReviewLinkState('sending');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipient_id: String(lo.userId ?? lo.user_id ?? ''),
          type: 'order_reference',
          order_id: String(lo.id ?? lo._id ?? ''),
          body: 'Your proof is ready. Open the order to approve it or ask for changes.',
          metadata: {
            orderId: String(lo.id ?? lo._id ?? ''),
            orderNo: lo.orderNumber ?? lo.orderNo ?? 'Order',
            products: (activeSection?.entries ?? []).map(({ it }) => it.productName).filter(Boolean).join(', '),
          },
        }),
      }, 15000);
      setReviewLinkState(res.ok ? 'sent' : 'error');
    } catch { setReviewLinkState('error'); }
  };
  // One mockup per product, plus room for a detail shot or a clip. A flat five was fine for a single
  // mug and far too few once one artwork covered a totebag, a keychain, a cap and a shirt.
  const maxDraftFiles = Math.min(10, Math.max(5, uploadTargets.length + 3));

  const aiProofs = (
    ai.adminDesignUrls?.length ? ai.adminDesignUrls
      : ai.adminDesignUrl ? [ai.adminDesignUrl]
      : designItems.length <= 1 ? (lo.adminDesignUrls?.length ? lo.adminDesignUrls : [lo.adminDesignUrl])
      : []
  ).filter(Boolean);
  const aiProof = aiProofs[0] ?? null;
  const aiReason = ai.designRejectionReason ?? (designItems.length <= 1 ? lo.designRejectionReason : null) ?? null;
  const aiRequested = !!ai.designRequested || (!ai.designUrl && !ai.designFiles?.length);
  const aiHasFile = aiFiles.length > 0;
  const aiNotes = ai.designNotes ?? (designItems.length <= 1 ? lo.designNotes : null);
  const statusLabel = (st) => st==='approved'?'Approved':st==='rejected'?'Rejected':st==='revision_requested'?'Revision Requested':st==='draft_ready'||st==='proof_sent'?'Awaiting Review':st==='pending_design'?'Designing':st==='pending_review'?'Under Review':'Pending';

  return (
    <div style={{ padding:'16px 20px', background:'var(--dark2)', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

        {/* LEFT - customer + design (if custom) + status */}
        <div style={{ ...S.card, padding:'14px 16px', display:'flex', flexDirection:'column' }}>

          <SectionLabel>Customer</SectionLabel>
          {/* The name stays on a sale because it is a financial record; the contact details are wiped.
              Saying so beats leaving staff to discover it by trying to ring a number that is gone. */}
          {lo.customerDeleted && (
            <div style={{ marginBottom:'6px', padding:'7px 10px', borderRadius:'7px', background:'var(--dark2)', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:'10px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.5px' }}>
                Account deleted
              </div>
              <div style={{ fontSize:'11.5px', color:'var(--gray-light)', marginTop:'2px', lineHeight:1.5 }}>
                This customer deleted their account. The name is kept as part of the sales record; their
                contact details were removed and they cannot be reached here.
              </div>
            </div>
          )}
          <div style={{ fontWeight:700, fontSize:'14px', color:'var(--white)', marginBottom:'3px' }}>{lo.customerName}</div>
          {lo.customerContact && <div style={{ fontSize:'12px', color:'var(--gray)' }}>{lo.customerContact}</div>}
          {lo.customerEmail   && <div style={{ fontSize:'12px', color:'var(--gray)', marginBottom:'4px' }}>{lo.customerEmail}</div>}

          {lo.deliveryAddress && (
            <>
              <div style={S.divider} />
              <SectionLabel>Delivery Address</SectionLabel>
              <div style={{ fontSize:'12px', color:'var(--gray-light)', lineHeight:1.6 }}>
                {typeof lo.deliveryAddress === 'object'
                  ? [lo.deliveryAddress.house_number, lo.deliveryAddress.street,
                     lo.deliveryAddress.subdivision,
                     lo.deliveryAddress.barangay && `Brgy. ${lo.deliveryAddress.barangay}`,
                     lo.deliveryAddress.city, lo.deliveryAddress.province, lo.deliveryAddress.zip].filter(Boolean).join(', ')
                  : lo.deliveryAddress}
              </div>
              {typeof lo.deliveryAddress === 'object' && lo.deliveryAddress.phone && (
                <div style={{ fontSize:'12px', color:'var(--gray)', marginTop:'2px' }}>Phone: {lo.deliveryAddress.phone}</div>
              )}
              {typeof lo.deliveryAddress === 'object' && lo.deliveryAddress.delivery_notes && (
                <div style={{ fontSize:'12px', color:'var(--gray-light)', marginTop:'6px', padding:'8px 10px', background:'var(--dark2)', border:'1px solid var(--border)', borderRadius:'6px' }}>
                  <span style={{ fontWeight:600, color:'var(--gray)' }}>Delivery notes: </span>{lo.deliveryAddress.delivery_notes}
                </div>
              )}
              {typeof lo.deliveryAddress === 'object' && lo.deliveryAddress.lat && lo.deliveryAddress.lng && (
                <div style={{ marginTop:'8px' }}>
                  <div style={{ fontSize:'11px', color:'var(--gray)', marginBottom:'5px' }}>
                    Pinned drop-off - open this exact spot to book your courier (Lalamove / Grab / etc.):
                  </div>
                  <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${lo.deliveryAddress.lat},${lo.deliveryAddress.lng}`}
                       target="_blank" rel="noopener noreferrer"
                       style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'5px 10px', fontSize:'11px', fontWeight:600, borderRadius:'6px', border:'1px solid var(--border)', background:'var(--dark)', color:'var(--white)', textDecoration:'none', cursor:'pointer' }}>
                      Google Maps
                    </a>
                    <a href={`https://waze.com/ul?ll=${lo.deliveryAddress.lat},${lo.deliveryAddress.lng}&navigate=yes`}
                       target="_blank" rel="noopener noreferrer"
                       style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'5px 10px', fontSize:'11px', fontWeight:600, borderRadius:'6px', border:'1px solid var(--border)', background:'var(--dark)', color:'var(--white)', textDecoration:'none', cursor:'pointer' }}>
                      Waze
                    </a>
                    <button type="button"
                       onClick={() => { navigator.clipboard?.writeText(`${lo.deliveryAddress.lat}, ${lo.deliveryAddress.lng}`); }}
                       style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'5px 10px', fontSize:'11px', fontWeight:600, borderRadius:'6px', border:'1px solid var(--border)', background:'var(--dark)', color:'var(--white)', cursor:'pointer' }}>
                      ⧉ Copy coordinates
                    </button>
                  </div>
                </div>
              )}

              {/* Courier-booked delivery fee - paid by customer to the rider on delivery */}
              {!(Number(lo.shippingFee) > 0) && (
                <div style={{ marginTop:'10px', padding:'10px 12px', background:'var(--dark2)', border:'1px solid var(--border)', borderRadius:'8px' }}>
                  <div style={{ fontSize:'11px', fontWeight:600, color:'var(--gray-light)', marginBottom:'2px' }}>Delivery fee (paid by customer to rider)</div>
                  <div style={{ fontSize:'10.5px', color:'var(--gray)', marginBottom:'6px' }}>
                    After you book the courier, enter the fee. The customer is told what it is and can either
                    hand it to the rider or send it ahead - mark it received here when they do.
                  </div>
                  <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
                    <div style={{ display:'flex', alignItems:'center', border:'1px solid var(--border)', borderRadius:'6px', overflow:'hidden', background:'var(--dark)' }}>
                      <span style={{ padding:'0 8px', fontSize:'12px', color:'var(--gray)' }}>₱</span>
                      <input
                        type="text" inputMode="decimal" value={feeInput}
                        onChange={e => { setFeeInput(e.target.value.replace(/[^\d.]/g, '')); if (feeErr) setFeeErr(''); }}
                        placeholder="0.00"
                        style={{ width:'90px', border:'none', outline:'none', padding:'6px 8px 6px 0', fontSize:'12px', color:'var(--white)' }}
                      />
                    </div>
                    <button type="button" onClick={handleSaveCourierFee} disabled={savingFee}
                      style={{ padding:'6px 12px', fontSize:'11px', fontWeight:600, borderRadius:'6px', border:'none', background: savingFee ? 'var(--border)' : 'var(--gold)', color:'var(--dark)', cursor: savingFee ? 'not-allowed' : 'pointer' }}>
                      {savingFee ? 'Saving…' : (Number(lo.courierFee) > 0 ? 'Update fee' : 'Set fee')}
                    </button>
                    {Number(lo.courierFee) > 0 && (
                      <span style={{ fontSize:'11px', color:'#166534', fontWeight:600 }}>
                        Set: ₱{fmt(lo.courierFee)}
                      </span>
                    )}
                  </div>

                  {/* Only offered once a fee exists - there is nothing to settle before that. */}
                  {Number(lo.courierFee) > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginTop:'8px', paddingTop:'8px', borderTop:'1px solid var(--border)' }}>
                      {lo.courierFeePaid ? (
                        <>
                          <span style={{ fontSize:'11px', fontWeight:700, color:'#166534' }}>
                            Delivery fee received - nothing for the rider to collect
                          </span>
                          <button type="button" onClick={() => handleCourierFeePaid(false)} disabled={savingFee}
                            style={{ padding:'3px 9px', fontSize:'10.5px', fontWeight:600, borderRadius:'6px', border:'1px solid var(--border)', background:'transparent', color:'var(--gray)', cursor: savingFee ? 'not-allowed' : 'pointer' }}>
                            Undo
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize:'11px', color:'var(--gray)' }}>
                            Did they send it ahead (GCash / Maya)?
                          </span>
                          <button type="button" onClick={() => handleCourierFeePaid(true)} disabled={savingFee}
                            style={{ padding:'4px 11px', fontSize:'11px', fontWeight:700, borderRadius:'6px', border:'1px solid #166534', background:'transparent', color:'#166534', cursor: savingFee ? 'not-allowed' : 'pointer' }}>
                            Mark fee received
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {feeErr && <div style={{ marginTop:'4px', fontSize:'11px', color:'#dc2626' }}>{feeErr}</div>}
                </div>
              )}
            </>
          )}

          {lo.notes && (
            <>
              <div style={S.divider} />
              <div style={{ ...S.note, padding:'8px 12px', fontSize:'12px' }}>
                <span style={{ fontWeight:600 }}>Notes: </span>{lo.notes}
              </div>
            </>
          )}

          {jobOrders.length > 0 && (() => {
            const open = jobOrders.filter(j => !['QC_Passed', 'Completed', 'Cancelled'].includes(j.joStatus)).length;
            return (
              <>
                <div style={S.divider} />
                <SectionLabel>
                  {jobOrders.length > 1 ? `Job Orders (${jobOrders.length})` : 'Job Order'}
                </SectionLabel>
                {jobOrders.length > 1 && (
                  <div style={{ fontSize:'11px', color:'var(--gray)', marginBottom:'8px' }}>
                    One per printable item. This order is released for delivery only when all of them pass QC
                    {open > 0 ? ` (${open} still open).` : '.'}
                  </div>
                )}
                <div style={{ display:'grid', gap:'8px' }}>
                  {jobOrders.map(j => {
                    const jid = joDocId(j);
                    const busy = joBusyId === jid;
                    const jrisk = joRisk(j);
                    return (
                      <div key={jid} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 10px', borderRadius:'8px', background:'var(--dark2)', border:'1px solid var(--border)' }}>
                        <DesignPreview path={j.product?.thumbnail || j.designFilePath} size={38} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                            <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'12px', color:'var(--white)' }}>{j.joId}</span>
                            <JobOrderStatusBadge status={j.joStatus} />
                            {j.isRush && <span style={{ ...S.badge, background:'#fff7ed', color:'#c2410c', border:'1px solid #fdba74', fontSize:'10px' }}>RUSH</span>}
                            {jrisk && <span style={{ ...S.badge, ...RISK_STYLE[jrisk.color], fontSize:'9px', fontWeight:700 }}>{jrisk.label}</span>}
                          </div>
                          <div style={{ fontSize:'11px', color:'var(--gray)', marginTop:'2px' }}>
                            {j.product?.name}{j.product?.variant ? ` - ${j.product.variant}` : ''} x{j.product?.quantity ?? 1}
                            {j.targetCompletion ? ` · due ${fmtJODate(j.targetCompletion)}` : ''}
                          </div>
                        </div>
                        {j.joStatus === 'Queued' && (
                          <button disabled={busy} onClick={() => setJoConfirm({ jo: j, to: 'In Progress' })} style={S.btnSmGhost}>{busy ? 'Saving…' : 'Start'}</button>
                        )}
                        {j.joStatus === 'In Progress' && (
                          <button disabled={busy} onClick={() => setJoConfirm({ jo: j, to: 'QC_Pending' })} style={S.btnSmGhost}>{busy ? 'Saving…' : 'Send to QC'}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* Design workflow - custom orders only */}
          {hasDesignWork && (
            <>
              <div style={S.divider} />
              <SectionLabel>Design</SectionLabel>

              {/* Per-item selector - pick which custom line to review (mixed cart, Option 2). */}
              {designSections.length > 1 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px' }}>
                  {designSections.map(sec => {
                    const active = sec.indices.includes(activeItemIdx);
                    const done = sec.entries.every(({ it }) => it.designStatus === 'approved');
                    return (
                      <button key={sec.key} onClick={() => { setActiveItemIdx(sec.indices[0]); setShowReject(false); setShowFix(false); setConfirmApprove(false); setDraftFiles([]); setDesignErr(''); setMockupMode(false); }}
                        style={{ padding:'4px 10px', borderRadius:'999px', border:`1px solid ${active?'var(--gold)':done?'#bbf7d0':'var(--border)'}`, background: active?'rgba(212,168,67,0.1)':'transparent', color: active?'var(--gold)':'var(--gray)', fontSize:'11px', fontWeight:700, cursor:'pointer' }}>
                        {sec.label}{done ? ' - approved' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
              {activeSection?.request && activeSection.indices.length > 1 && (
                <div style={{ ...S.note, marginBottom:'8px', fontSize:'11px' }}>
                  Covers {activeSection.indices.length} products - {activeSection.entries.map(({ it }) => it.productName).filter(Boolean).join(', ')}. What you send here goes to all of them.
                </div>
              )}

              {(activeSection?.entries?.length ?? 0) > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px' }}>
                  {activeSection.entries.map(({ it, idx }) => {
                    const st = it.designStatus ?? (activeSection.indices.length === 1 ? aiStatus : null);
                    if (!st) return null;
                    return (
                      <span key={idx} style={{ ...S.badge, fontSize:'11px',
                        background: st==='approved' ? '#f0fdf4' : st==='rejected' ? '#fef2f2' : '#fff7ed',
                        color:      st==='approved' ? '#166534' : st==='rejected' ? '#991b1b' : '#c2410c',
                        border:`1px solid ${st==='approved'?'#bbf7d0':st==='rejected'?'#fecaca':'#fdba74'}` }}>
                        {designItems.length > 1 ? `${it.productName || 'Item'}: ` : ''}{statusLabel(st)}
                        {Number(it.revisionCount ?? 0) > 0 && ` - rev ${it.revisionCount}`}
                      </span>
                    );
                  })}
                </div>
              )}

              {aiStatus==='revision_requested' && (ai.revisionNotes || lo.revisionNotes) && (
                <div style={{ ...S.note, background:'#fff7ed', border:'1px solid #fdba74', marginBottom:'8px', fontSize:'12px' }}>
                  <span style={{ fontWeight:600, color:'#c2410c' }}>Revision: </span>{ai.revisionNotes || lo.revisionNotes}
                </div>
              )}

              {/* Inline preview so the file can be SEEN before opening. An image renders in a
                  sandboxed <img> (no script execution, safe even for SVG); a PDF embeds; other
                  source formats (AI/PSD) have no browser preview, so an icon + download. */}
              {(() => {
                const files = aiFiles;
                if (!files.length) return null;
                return (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'8px' }}>
                    {files.map((f, i) => {
                      const raw = f.url;
                      const url = raw.startsWith('http') ? raw : `${API_URL}/storage/${raw}`;
                      const isImg = /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(url);
                      // The format label comes off the URL (Cloudinary keeps the extension on raw
                      // uploads); the NAME has to come off the line, because the public_id is random.
                      const ext = (url.split('?')[0].split('.').pop() || '').toUpperCase().slice(0, 4);
                      const fname = f.name || 'Customer file';
                      // Image opens a full-screen lightbox in place; everything else is a labelled card.
                      return isImg ? (
                        <button key={i} type="button" onClick={() => setLightboxUrl(url)} title="Click to preview"
                          style={{ padding:0, border:'none', background:'none', cursor:'zoom-in', display:'block' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Customer design" style={{ width:'120px', height:'120px', objectFit:'contain', background:'#f3f4f6', borderRadius:'8px', border:'1px solid var(--border)', display:'block' }} />
                        </button>
                      ) : (
                        // One card for every non-image format. The PDF branch used to be an
                        // <embed>, which rendered as a blank white box: Cloudinary serves these from
                        // /raw/upload/ with a generic content-type, and a browser will not open a PDF
                        // viewer for that (cross-origin embedding is commonly refused too). A frame
                        // that silently shows nothing is worse than no frame - it reads as a broken
                        // upload rather than a file that simply has no inline preview. So: say what
                        // the format is, say what the customer called it, and open it on click.
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" title={`Open ${fname}`}
                          style={{ display:'block', textDecoration:'none' }}>
                          <div style={{ width:'120px', height:'120px', borderRadius:'8px', border:'1px solid var(--border)', background:'#f9fafb', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', padding:'8px', boxSizing:'border-box' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            <span style={{ fontSize:'11px', fontWeight:800, color:'#d4a843', letterSpacing:'0.04em' }}>{ext || 'FILE'}</span>
                            <span style={{ fontSize:'10px', color:'var(--gray)', textAlign:'center', lineHeight:1.3, wordBreak:'break-word', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{fname}</span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                );
              })()}

              <ImageLightbox url={lightboxUrl} kind={lightboxKind} onClose={() => { setLightboxUrl(null); setLightboxKind(null); }} />

              {aiHasFile && aiRequested && (
                <div style={{ fontSize: 11.5, color: 'var(--gold)', fontWeight: 600, marginBottom: 4 }}>
                  Reference from the customer - design from these, do not print them
                </div>
              )}
              {aiHasFile && (
                <a href={aiFiles[0]?.url?.startsWith('http') ? aiFiles[0].url : `${API_URL}/storage/${aiFiles[0]?.url}`} target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'12px', fontWeight:600, color:'#2563eb', textDecoration:'none', marginBottom:'8px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Open full file
                </a>
              )}

              {/* Printing instructions the customer left - the printer needs these next to the file. */}
              {aiNotes && (
                <div style={{ padding:'8px 10px', background:'#f9fafb', border:'1px solid var(--border)', borderRadius:'6px', fontSize:'12px', color:'var(--gray)', marginBottom:'8px', lineHeight:1.5 }}>
                  <span style={{ fontWeight:600, color:'var(--white)' }}>Instructions: </span>{aiNotes}
                </div>
              )}

              {/* Upload-line review: three choices - approve as-is, bounce back for a re-upload
                  (with a reason), or fix it yourself and send an adjusted proof for the customer
                  to approve (reuses the request-design proof flow below via showFix). */}
              {/* An uploaded file with nothing said about it. The shop is the one who finds
                  out, so the shop is the one that gets told - with the question already
                  addressed to the right person. Kept above Approve/Reject deliberately:
                  approving artwork nobody has explained is the mistake this prevents. */}
              {aiHasFile && !aiNotes && aiStatus === 'pending_review' && (
                <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.3)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b45309"
                      strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b45309' }}>No printing instructions</div>
                      <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 3, lineHeight: 1.5 }}>
                        The customer sent a file and said nothing about it - which side, what size,
                        whether it is even finished artwork. Ask before producing.
                      </div>
                    </div>
                  </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={messageCustomer} disabled={msgState === 'sending'}
                      style={{ ...S.btnSm, cursor: msgState === 'sending' ? 'wait' : 'pointer' }}>
                      {msgState === 'sent' ? 'Sent - open Messages'
                        : msgState === 'sending' ? 'Sending...'
                        : msgState === 'error' ? 'Could not send - try again'
                        : 'Message customer'}
                    </button>
                    {!confirmConvert && (
                      <button type="button" onClick={() => setConfirmConvert(true)} style={S.btnSmGhost}>
                        Convert to design job
                      </button>
                    )}
                  </div>

                  {/* Confirmed, because it puts money on somebody's bill. Press it after they
                      have agreed in chat, not instead of asking. */}
                  {confirmConvert && (
                    <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 6,
                      background: 'var(--dark)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11.5, color: 'var(--gray)', lineHeight: 1.5, marginBottom: 7 }}>
                        This becomes a design job: you draw the artwork and send a mockup to approve.
                        The design fee is <strong style={{ color: 'var(--white)' }}>added to their balance</strong>,
                        not charged now - so only do this once they have agreed to it.
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={convertToDesign} disabled={convertState === 'sending'}
                          style={{ ...S.btnSm, cursor: convertState === 'sending' ? 'wait' : 'pointer' }}>
                          {convertState === 'sending' ? 'Converting...' : 'Yes, convert and bill the fee'}
                        </button>
                        <button type="button" onClick={() => { setConfirmConvert(false); setConvertState('idle'); }}
                          style={S.btnSmGhost}>Cancel</button>
                      </div>
                      {convertState === 'error' && (
                        <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 6 }}>
                          Could not convert - try again.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {aiStatus==='pending_review' && aiHasFile && !aiRequested && !showReject && !showFix && !confirmApprove && (
                <div style={{ display:'flex', gap:'6px', marginBottom:'8px', flexWrap:'wrap' }}>
                  <button onClick={() => { setConfirmApprove(true); setDesignErr(''); }} disabled={!!designAct}
                    style={{ flex:'1 1 30%', padding:'5px 0', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'6px', color:'#166534', fontSize:'12px', fontWeight:700, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                    Approve
                  </button>
                  <button onClick={() => { setShowReject(true); setDesignErr(''); }} disabled={!!designAct}
                    style={{ flex:'1 1 30%', padding:'5px 0', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'6px', color:'#991b1b', fontSize:'12px', fontWeight:700, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                    Reject
                  </button>
                  <button onClick={() => { setShowFix(true); setDesignErr(''); }} disabled={!!designAct}
                    style={{ flex:'1 1 100%', padding:'5px 0', background:'rgba(212,168,67,0.08)', border:'1px solid var(--gold)', borderRadius:'6px', color:'var(--gold)', fontSize:'12px', fontWeight:700, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                    Adjust &amp; Send Proof
                  </button>
                </div>
              )}

              {/* Approve is one click with a hard effect (design goes to production-ready), so it
                  confirms first to avoid an accidental tap. */}
              {confirmApprove && (
                <div style={{ padding:'10px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'8px', marginBottom:'8px', display:'flex', flexDirection:'column', gap:'8px' }}>
                  <div style={{ fontSize:'12px', color:'#166534' }}>Approve this design? It becomes ready for production and the customer is notified. You can revert only before a Job Order is created.</div>
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={handleApproveDesign} disabled={!!designAct}
                      style={{ flex:1, padding:'6px 0', background:'#166534', border:'none', borderRadius:'6px', color:'#fff', fontSize:'12px', fontWeight:700, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                      {designAct==='approving' ? 'Approving...' : 'Yes, approve'}
                    </button>
                    <button onClick={() => { setConfirmApprove(false); setDesignErr(''); }} disabled={!!designAct}
                      style={{ padding:'6px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--gray)', fontSize:'12px', cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* A mockup after approval changes nothing, so unlike Revert it stays available once a
                  Job Order exists - which is exactly when someone asks to see what they are getting. */}
              {aiStatus === 'approved' && !showFix && (
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                  <span style={{ fontSize:'11px', color:'var(--gray)' }}>Show them what it will look like?</span>
                  <button onClick={() => { setMockupMode(true); setShowFix(true); setDesignErr(''); }} disabled={!!designAct}
                    style={{ padding:'4px 10px', background:'rgba(212,168,67,0.08)', border:'1px solid var(--gold)', borderRadius:'6px', color:'var(--gold)', fontSize:'11px', fontWeight:700, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                    Send mockup
                  </button>
                </div>
              )}

              {/* Undo an accidental approval - allowed only while no Job Order exists yet. */}
              {aiStatus === 'approved' && !hasAnyJobOrder && (
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                  <span style={{ fontSize:'11px', color:'var(--gray)' }}>Approved by mistake?</span>
                  <button onClick={handleRevertApprove} disabled={!!designAct}
                    style={{ padding:'4px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--gray)', fontSize:'11px', fontWeight:600, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                    {designAct==='reverting' ? 'Reverting...' : 'Revert to review'}
                  </button>
                </div>
              )}

              {/* Reject with a reason - saved on the order, shown to the customer, bounces the
                  order back so they can re-upload a corrected file. */}
              {showReject && (
                <div style={{ padding:'10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', marginBottom:'8px', display:'flex', flexDirection:'column', gap:'6px' }}>
                  <div style={{ fontSize:'12px', fontWeight:700, color:'#991b1b' }}>Why is this being rejected?</div>
                  {REJECT_REASONS.map(r => (
                    <label key={r} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'var(--white)', cursor:'pointer' }}>
                      <input type="radio" name="rejreason" checked={rejectReason===r} onChange={() => setRejectReason(r)} />
                      {r}
                    </label>
                  ))}
                  {rejectReason==='Other' && (
                    <div>
                      <textarea value={rejectOther} onChange={e => setRejectOther(e.target.value.slice(0, 200))} maxLength={200} rows={2}
                        placeholder="Type the reason the customer will see"
                        style={{ background:'var(--dark2)', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--white)', fontSize:'12px', padding:'6px 8px', resize:'vertical', outline:'none', width:'100%', boxSizing:'border-box' }} />
                      <div style={{ fontSize:'10px', color:'var(--gray)', textAlign:'right', marginTop:'2px' }}>{rejectOther.length}/200</div>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={handleRejectDesign} disabled={!!designAct}
                      style={{ flex:1, padding:'6px 0', background:'#991b1b', border:'none', borderRadius:'6px', color:'#fff', fontSize:'12px', fontWeight:700, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                      {designAct==='rejecting' ? 'Sending...' : 'Send rejection'}
                    </button>
                    <button onClick={() => { setShowReject(false); setRejectReason(''); setRejectOther(''); setDesignErr(''); }} disabled={!!designAct}
                      style={{ padding:'6px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--gray)', fontSize:'12px', cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* The approved proof is the record of what the customer agreed to, so it stays on screen
                  after approval - production checks its output against this, and a dispute later turns
                  on being able to see it. The upload controls below are still hidden once approved. */}
              {aiStatus === 'approved' && aiProofs.length > 0 && showApproved && (
                <div style={{ marginBottom:'10px' }}>
                  <div style={{ fontSize:'11px', color:'var(--gray)', marginBottom:'6px', display:'flex', alignItems:'center', gap:'8px' }}>
                    <span style={{ color:'var(--white)', fontWeight:600 }}>Approved proof</span>
                    <span>- what the customer signed off. Click a file to view it full size.</span>
                    <button type="button" onClick={() => setShowApproved(false)}
                      style={{ marginLeft:'auto', background:'transparent', border:'none', color:'var(--gray)', fontSize:'11px', cursor:'pointer', textDecoration:'underline' }}>
                      Hide
                    </button>
                  </div>
                  <ProofGallery urls={aiProofs.map(designUrl)} tiles compact
                    onOpen={(u, kind) => { setLightboxKind(kind); setLightboxUrl(u); }} />
                </div>
              )}

              {/* Collapsed by default once approved: the panel is long and the proof has done its job by
                  then. One click brings it back when someone needs to check what was agreed. */}
              {aiStatus === 'approved' && aiProofs.length > 0 && !showApproved && (
                <button type="button" onClick={() => setShowApproved(true)}
                  style={{ ...S.btnSmGhost, marginBottom:'8px', fontSize:'11px', padding:'4px 10px' }}>
                  Show approved design
                </button>
              )}

              {(aiRequested || showFix) && (aiStatus !== 'approved' || mockupMode) && (
                <div>
                  {showFix && (
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                      <span style={{ fontSize:'11px', color:'var(--gray)' }}>
                        {mockupMode
                          ? 'Send a mockup - information only. The approval and the Job Order stay exactly as they are.'
                          : 'Upload your adjusted design - the customer will approve it.'}
                      </span>
                      <button onClick={() => { setShowFix(false); setDraftFiles([]); setMockupMode(false); }} disabled={uploading}
                        style={{ padding:'2px 8px', background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--gray)', fontSize:'11px', cursor:'pointer' }}>
                        Back
                      </button>
                    </div>
                  )}
                  {/* Show the proof that actually went out, not just a link to it. Waiting until the
                      customer approves before you can see what you sent is too late to catch a mistake. */}
                  {aiProofs.length > 0 && !draftFiles.length && (
                    <div style={{ marginBottom:'10px' }}>
                      <div style={{ fontSize:'11px', color:'var(--gray)', lineHeight:1.6, marginBottom:'6px' }}>
                        <div style={{ color:'var(--white)', fontWeight:600 }}>
                          {aiProofs.length > 1 ? `Proof sent - ${aiProofs.length} files` : 'Proof sent'}
                        </div>
                        <div>Awaiting the customer&apos;s review. Click a file to view it full size.</div>
                      </div>
                      <ProofGallery urls={aiProofs.map(designUrl)} tiles compact
                        onOpen={(u, kind) => { setLightboxKind(kind); setLightboxUrl(u); }} />
                      <button type="button" onClick={sendReviewLink} disabled={reviewLinkState === 'sending'}
                        style={{ ...S.btnGhost, marginTop:'8px', fontSize:'11px', padding:'5px 10px',
                          cursor: reviewLinkState === 'sending' ? 'wait' : 'pointer' }}>
                        {reviewLinkState === 'sent' ? 'Link sent to chat'
                          : reviewLinkState === 'sending' ? 'Sending...'
                          : reviewLinkState === 'error' ? 'Could not send - try again'
                          : 'Send review link to chat'}
                      </button>
                    </div>
                  )}
                  {draftFiles.length > 0 ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                      <DraftFilePreview files={draftFiles}
                        onRemove={i => setDraftFiles(prev => prev.filter((_, xi) => xi !== i))}
                        onOpen={(url, kind) => { setLightboxKind(kind); setLightboxUrl(url); }} />
                      <div style={{ fontSize:'11px', color:'var(--gray)' }}>
                        {draftFiles.length} of {maxDraftFiles} file{draftFiles.length>1?'s':''} ready to send
                        {uploading && ' - video proofs can take a minute, please keep this open'}
                      </div>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={() => handleUploadDesign(draftFiles)} disabled={uploading}
                          style={{ flex:1, padding:'5px 0', background:'var(--gold)', border:'none', borderRadius:'6px', color:'var(--dark)', fontSize:'12px', fontWeight:700, cursor:uploading?'not-allowed':'pointer', opacity:uploading?.6:1 }}>
                          {uploading
                            ? `Uploading ${(draftFiles.reduce((n,f)=>n+f.size,0)/1048576).toFixed(1)} MB…`
                            : mockupMode
                              ? `Send ${draftFiles.length} Mockup${draftFiles.length>1?'s':''}`
                              : `Send ${draftFiles.length} File${draftFiles.length>1?'s':''}`}
                        </button>
                        {/* Staging a file used to be a one-shot decision - Send or start over. Let more
                            be added to the same batch, up to the five the endpoint accepts. */}
                        {draftFiles.length < 5 && (
                          <label style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
                            <div style={{ padding:'5px 10px', background:'transparent', border:'1px solid var(--gold)', borderRadius:'6px', color:'var(--gold)', fontSize:'12px', fontWeight:700, whiteSpace:'nowrap', opacity: uploading ? .5 : 1 }}>
                              + Add more
                            </div>
                            <input type="file" accept="image/*,video/*,.pdf,.ai,.psd,.svg" multiple disabled={uploading} style={{ display:'none' }}
                              onChange={async e => {
                                const picked = Array.from(e.target.files ?? []);
                                e.target.value = '';
                                if (!picked.length) return;
                                const { accepted, note } = screenFiles(picked);
                                setDesignErr(note);
                                setDraftFiles(prev => [...prev, ...accepted].slice(0, maxDraftFiles));
                              }} />
                          </label>
                        )}
                        <button onClick={() => setDraftFiles([])} disabled={uploading}
                          style={{ padding:'5px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--gray)', fontSize:'12px', cursor:'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label style={{ cursor:'pointer', display:'inline-block' }}>
                      <div style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'4px 10px', border:'1px solid var(--gold)', borderRadius:'6px', color:'var(--gold)', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                        Upload Draft
                      </div>
                      <input type="file" accept="image/*,video/*,.pdf,.ai,.psd,.svg" multiple style={{ display:'none' }}
                        onChange={async e => {
                          const picked = Array.from(e.target.files ?? []).slice(0, maxDraftFiles);
                          e.target.value = '';
                          if (!picked.length) return;
                          setDesignErr('');
                          const { accepted, note } = screenFiles(picked);
                          setDesignErr(note);
                          if (accepted.length) setDraftFiles(accepted);
                        }} />
                    </label>
                  )}
                </div>
              )}
              {designErr && <div style={{ fontSize:'11px', color:'#991b1b', marginTop:'4px' }}>{designErr}</div>}
            </>
          )}

          {/* Update Status */}
          <div style={S.divider} />
          <SectionLabel>Update Status</SectionLabel>

          {/* A reason nobody can read is a reason nobody collected. This is the only signal that
              separates a pricing problem from a delivery-time problem from a change of mind. */}
          {lo.cancelledReason && (
            <div style={{ marginBottom:'8px', padding:'8px 10px', borderRadius:'7px', background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontSize:'10px', fontWeight:700, color:'#991b1b', textTransform:'uppercase', letterSpacing:'.5px' }}>
                Cancelled by {lo.cancelledBy === 'customer' ? 'the customer' : 'the shop'}
              </div>
              <div style={{ fontSize:'12px', color:'var(--gray-light)', marginTop:'3px' }}>{lo.cancelledReason}</div>
            </div>
          )}
          {['pending_design','revision_requested'].includes(lo.orderStatus) ? (
            <span style={{ fontSize:'11px', color:'var(--gray)', fontStyle:'italic' }}>Managed via design upload above</span>
          ) : awaitingMoney ? (
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {/* This used to hide the whole control at ready_for_delivery whether or not the money
                  had arrived - so an order settled in cash stayed frozen with nothing on offer, and
                  the only thing the shop could still do about an unpaid one was Archive it. */}
              <span style={{ fontSize:'11px', color:'var(--gray)', fontStyle:'italic' }}>
                Waiting for ₱{fmt(remainingDue(lo))} from the customer. It cannot be dispatched until
                that clears - use Send payment reminder, or cancel it below.
              </span>
              {readySince !== null && (
                <span style={{ fontSize:'11px', fontWeight:700,
                  color: readySince >= 14 ? '#c2410c' : readySince >= 7 ? '#b45309' : 'var(--gray)' }}>
                  Finished goods held for {readySince} day{readySince === 1 ? '' : 's'}
                  {readySince >= 14 && ' - these cannot be resold. Decide whether to keep holding them.'}
                </span>
              )}

              {readySince !== null && readySince >= 7 && !lo.writeOff && (
                !woConfirm ? (
                  <button onClick={() => { setWoErr(''); setWoConfirm(true); }}
                    style={{ ...S.btnSmGhost, justifyContent:'center', color:'#c2410c' }}>
                    Write off and archive
                  </button>
                ) : (
                  <div style={{ padding:'10px', borderRadius:'7px', background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.25)' }}>
                    <div style={{ fontSize:'11.5px', color:'var(--gray-light)', lineHeight:1.6, marginBottom:'8px' }}>
                      The goods are disposed of and the order is closed. You keep the
                      <strong style={{ color:'var(--gold)' }}> ₱{fmt(paidSoFar(lo))} </strong>
                      already paid, and the
                      <strong style={{ color:'#c2410c' }}> ₱{fmt(remainingDue(lo))} </strong>
                      balance is never collected. The cost of what was made is recorded as a loss so
                      the forfeited deposit does not read as profit.
                    </div>
                    {woErr && <div style={{ fontSize:'11px', color:'#991b1b', marginBottom:'6px' }}>{woErr}</div>}
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={handleWriteOff} disabled={writingOff}
                        style={{ flex:1, padding:'6px 0', background:'#c2410c', border:'none', borderRadius:'6px', color:'#fff', fontSize:'12px', fontWeight:700, cursor: writingOff ? 'not-allowed' : 'pointer' }}>
                        {writingOff ? 'Writing off...' : 'Yes, write it off'}
                      </button>
                      <button onClick={() => setWoConfirm(false)}
                        style={{ padding:'6px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--gray)', fontSize:'12px', cursor:'pointer' }}>
                        Keep holding
                      </button>
                    </div>
                  </div>
                )
              )}
              {availableRaw.includes('cancelled') && (
                <button onClick={() => { setSelStatus('cancelled'); setConfirmSt(true); }}
                  style={{ ...S.btnSmGhost, justifyContent:'center', color:'var(--st-red-fg)' }}>
                  Cancel this order
                </button>
              )}
              {/* Confirmation is a modal now - see the ConfirmModal at the end of this component. */}
            </div>
          ) : openJobs.length > 0 && available.length === 0 ? (
            <span style={{ fontSize:'11px', color:'var(--gray)', fontStyle:'italic' }}>
              {openJobs.length} job order{openJobs.length > 1 ? 's' : ''} still open. This order is released for
              delivery by Quality Control, once every one of them passes.
            </span>
          ) : available.length > 0 ? (
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              <CustomSelect
                value={selStatus}
                onChange={v => { setSelStatus(v); setConfirmSt(false); setUpdateErr(''); }}
                options={[
                  { value: lo.orderStatus, label: `${getStatusBadge(lo.orderStatus).label} (current)` },
                  ...available.map(s => ({ value: s, label: getStatusBadge(s).label })),
                ]}
              />
              {String(selStatus).toLowerCase() === 'returned' && (
                <div style={{ padding:'10px', borderRadius:'7px', border:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:'7px' }}>
                  <span style={{ fontSize:'11px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.5px' }}>Why did it come back?</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                    {['Nobody received it', 'Refused on delivery', 'Wrong address', 'Damaged in transit', 'Wrong item sent', 'Other'].map(r => (
                      <button key={r} type="button" onClick={() => setReturnReason(r)}
                        style={{ padding:'4px 9px', borderRadius:'999px', fontSize:'11px', cursor:'pointer',
                          border:`1px solid ${returnReason === r ? 'var(--gold)' : 'var(--border)'}`,
                          background: returnReason === r ? 'rgba(212,168,67,0.1)' : 'transparent',
                          color: returnReason === r ? 'var(--gold)' : 'var(--gray)',
                          fontWeight: returnReason === r ? 700 : 500 }}>{r}</button>
                    ))}
                  </div>
                  {returnReason === 'Other' && (
                    <input type="text" value={returnOther} maxLength={200}
                      onChange={e => setReturnOther(e.target.value.slice(0, 200))}
                      placeholder="What happened?"
                      style={{ ...S.input, fontSize:'12px' }} />
                  )}
                  <label style={{ display:'flex', alignItems:'flex-start', gap:'7px', fontSize:'11.5px', color:'var(--gray-light)', cursor:'pointer' }}>
                    <input type="checkbox" checked={returnSellable}
                      onChange={e => setReturnSellable(e.target.checked)} style={{ marginTop:'2px' }} />
                    <span>
                      The goods came back sellable - put ready-made items back in stock.
                      <span style={{ display:'block', color:'var(--gray)', marginTop:'2px' }}>
                        Personalised items are never restocked; they carry the customer&apos;s design.
                      </span>
                    </span>
                  </label>
                </div>

              )}

                {/* Cancelling a PAID order is the case that costs money, so both questions are asked
                    here rather than discovered afterwards. */}
                {String(selStatus).toLowerCase() === 'cancelled' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginTop:'10px' }}>
                    <div style={{ fontSize:'11px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.5px' }}>
                      Why are you cancelling?
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                      {['Cannot fulfil', 'Out of stock', 'Customer asked', 'Duplicate order', 'Payment problem', 'Other'].map(r => (
                        <button key={r} type="button" onClick={() => setCancelReason(r)}
                          style={{ padding:'5px 11px', borderRadius:'999px', fontSize:'11.5px', cursor:'pointer',
                            border:`1px solid ${cancelReason === r ? 'var(--gold)' : 'var(--border)'}`,
                            background: cancelReason === r ? 'rgba(212,168,67,0.1)' : 'transparent',
                            color: cancelReason === r ? 'var(--gold)' : 'var(--gray)',
                            fontWeight: cancelReason === r ? 700 : 500 }}>{r}</button>
                      ))}
                    </div>
                    {cancelReason === 'Other' && (
                      <input value={cancelOther} onChange={e => setCancelOther(e.target.value)} maxLength={200}
                        placeholder="Say what happened - the customer is told this" style={S.input} />
                    )}

                    {paidSoFar(lo) > 0 && (
                      <div style={{ marginTop:'4px', padding:'9px 11px', borderRadius:'6px',
                        background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.25)' }}>
                        <div style={{ fontSize:'12px', fontWeight:700, color:'#b91c1c', marginBottom:'4px' }}>
                          This customer has paid &#8369;{fmt(paidSoFar(lo))}
                        </div>
                        <div style={{ fontSize:'11.5px', color:'var(--gray)', lineHeight:1.5, marginBottom:'7px' }}>
                          Leave blank to return all of it - which is right when nothing has been made.
                          Enter less only if production had already started: personalised goods cannot
                          be resold, and the deposit is what covers that.
                        </div>
                        <input value={refundAmt}
                          onChange={e => setRefundAmt(e.target.value.replace(/[^0-9.]/g, ''))}
                          inputMode="decimal" maxLength={9}
                          placeholder={`Refund amount - blank means all ${fmt(paidSoFar(lo))}`}
                          style={S.input} />
                      </div>
                    )}
                  </div>
                )}

              {/* One button, one modal. The old version swapped this button in place for a "Set to X"
                  confirm, so a double-click landed on the confirm and fired it - the exact accident
                  the step was there to prevent. */}
              <button onClick={() => selStatus !== lo.orderStatus && setConfirmSt(true)}
                disabled={selStatus === lo.orderStatus}
                style={{ ...S.btnSmGhost, justifyContent:'center', opacity: selStatus===lo.orderStatus?.5:1, cursor: selStatus===lo.orderStatus?'not-allowed':'pointer' }}>
                Update Status
              </button>
              {updateErr && <div style={{ fontSize:'11px', color:'#991b1b' }}>{updateErr}</div>}
            </div>
          ) : (
            (lo.isCustom && lo.designStatus === 'approved' && jobOrdersMissing > 0) ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                <span style={{ fontSize:'11px', color:'var(--gray)', fontStyle:'italic' }}>
                  {hasAnyJobOrder
                    ? `${jobOrdersMissing} item${jobOrdersMissing > 1 ? 's' : ''} on this order still has no job order.`
                    : 'Ready for production - create a Job Order to start.'}
                </span>
                <a href="/dashboard/business/job-orders" target="_blank" rel="noopener noreferrer"
                  style={{ ...S.btnSmGhost, justifyContent:'center', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'6px' }}>
                  {ICONS.plus} Create Job Order
                </a>
              </div>
            ) : (
              <span style={{ fontSize:'11px', color:'var(--gray)', fontStyle:'italic' }}>
                {['Cancelled','Returned','Delivered'].includes(lo.orderStatus) ? 'No further updates' : 'No available transitions'}
              </span>
            )
          )}

          {/* Delivery date - shown + editable so the admin can move the promise on a backlog.
              Saving notifies the customer. */}
          {!['Cancelled','Returned','Delivered'].includes(lo.orderStatus) && (
            <>
              <div style={S.divider} />
              <SectionLabel>Delivery</SectionLabel>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                <div style={{ fontSize:'12px', color:'var(--gray)' }}>
                  Est. delivery:{' '}
                  <span style={{ color:'var(--white)', fontWeight:600 }}>
                    {lo.estimatedDeliveryMin ? new Date(lo.estimatedDeliveryMin).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '-'}
                    {lo.estimatedDeliveryMax && lo.estimatedDeliveryMax !== lo.estimatedDeliveryMin ? ` - ${new Date(lo.estimatedDeliveryMax).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}` : ''}
                  </span>
                  {lo.isRush && <span style={{ marginLeft:6, fontSize:'10px', fontWeight:700, color:'#991b1b', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:4, padding:'1px 5px' }}>RUSH</span>}
                </div>
                {lo.needByDate && (
                  <div style={{ fontSize:'12px', color:'var(--gray)' }}>
                    Customer needs by:{' '}
                    <span style={{ color:'#c2410c', fontWeight:700 }}>{new Date(lo.needByDate).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</span>
                  </div>
                )}
                {/* Rush is a REQUEST - the shop decides if it can fit it in ("kaya ba isabay"). */}
                {lo.rushStatus === 'requested' && (
                  <div style={{ padding:'10px', background:'#fff7ed', border:'1px solid #fdba74', borderRadius:'8px', display:'flex', flexDirection:'column', gap:'8px' }}>
                    {/* The customer has ALREADY paid this - it was collected in the checkout total,
                        so "Accept" confirms and charges nothing. Declining is the expensive half,
                        and the old label ("waive fee") read as though it cost the shop nothing. */}
                    <div style={{ fontSize:'12px', fontWeight:700, color:'#c2410c' }}>
                      Rush requested (+₱{Number(lo.rushFee ?? 0).toLocaleString('en-PH')}) - can you fit it in?
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--gray)', lineHeight:1.45, marginTop:-2 }}>
                      {Number(lo.balance ?? 0) <= 0
                        ? 'Already paid. Accepting charges nothing more; declining means sending the fee back by hand.'
                        : 'Accepting charges nothing more - the fee is already in the order total.'}
                    </div>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={() => handleRushDecision('accepted')} disabled={savingDeliv}
                        style={{ flex:1, padding:'6px 0', background:'#166534', border:'none', borderRadius:'6px', color:'#fff', fontSize:'12px', fontWeight:700, cursor:savingDeliv?'not-allowed':'pointer', opacity:savingDeliv?.6:1 }}>Accept rush</button>
                      <button onClick={() => handleRushDecision('declined')} disabled={savingDeliv}
                        style={{ flex:1, padding:'6px 0', background:'transparent', border:'1px solid #fecaca', borderRadius:'6px', color:'#991b1b', fontSize:'12px', fontWeight:700, cursor:savingDeliv?'not-allowed':'pointer', opacity:savingDeliv?.6:1 }}>
                        {Number(lo.balance ?? 0) <= 0
                          ? `Decline & refund \u20B1${Number(lo.rushFee ?? 0).toLocaleString('en-PH')}`
                          : 'Decline (waive fee)'}
                      </button>
                    </div>
                  </div>
                )}
                {lo.rushStatus === 'accepted' && <div style={{ fontSize:'11px', fontWeight:700, color:'#166534' }}>Rush accepted - prioritise this order.</div>}
                {lo.rushStatus === 'declined' && <div style={{ fontSize:'11px', color:'var(--gray)' }}>Rush declined - standard schedule, fee waived.</div>}
                <div style={{ display:'flex', gap:'6px' }}>
                  <input type="date" value={delivDate || fmtDeliveryInput(lo.estimatedDeliveryMax)} onChange={e => setDelivDate(e.target.value)}
                    style={{ flex:1, padding:'6px 8px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--dark)', color:'var(--white)', fontSize:'12px' }} />
                  <button onClick={handleSaveDelivery} disabled={savingDeliv || !(delivDate || fmtDeliveryInput(lo.estimatedDeliveryMax))}
                    style={{ padding:'6px 12px', background:'var(--gold)', border:'none', borderRadius:'6px', color:'var(--dark)', fontSize:'12px', fontWeight:700, cursor:savingDeliv?'not-allowed':'pointer', opacity:savingDeliv?.6:1 }}>
                    {savingDeliv ? 'Saving...' : 'Update'}
                  </button>
                </div>
                <div style={{ fontSize:'10px', color:'var(--gray)' }}>Changing this notifies the customer.</div>
              </div>
            </>
          )}

          {/* Clickwrap ACCEPTANCE PROOF - the evidence to show if a customer disputes. Records who
              agreed, the exact date/time, the version, and the EXACT clause text they accepted. */}
          {lo.agreedToTerms ? (
            <div style={{ marginTop:'10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:'#166534', fontWeight:700 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                Accepted the Custom Order Terms{lo.termsVersion ? ` (v${lo.termsVersion})` : ''}
                <button onClick={() => setShowProof(s => !s)} style={{ marginLeft:'auto', background:'none', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--gold)', fontSize:'10px', fontWeight:700, padding:'2px 8px', cursor:'pointer' }}>
                  {showProof ? 'Hide proof' : 'View proof'}
                </button>
              </div>
              {showProof && (() => {
                const clauses = (Array.isArray(lo.agreedTermsSnapshot) && lo.agreedTermsSnapshot.length) ? lo.agreedTermsSnapshot : DEFAULT_CUSTOM_ORDER_TERMS;
                const snapshotted = Array.isArray(lo.agreedTermsSnapshot) && lo.agreedTermsSnapshot.length;
                return (
                  <div style={{ marginTop:'8px', padding:'10px 12px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'8px', fontSize:'11px', color:'var(--gray)' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'2px 10px', marginBottom:'8px' }}>
                      <span style={{ fontWeight:700, color:'var(--white)' }}>Customer:</span><span>{lo.customerName || lo.userSnapshot?.name || '-'}{(lo.customerEmail || lo.userSnapshot?.email) ? ` (${lo.customerEmail || lo.userSnapshot?.email})` : ''}</span>
                      <span style={{ fontWeight:700, color:'var(--white)' }}>Accepted:</span><span>{lo.agreedAt ? new Date(lo.agreedAt).toLocaleString('en-PH',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '-'}</span>
                      <span style={{ fontWeight:700, color:'var(--white)' }}>Version:</span><span>v{lo.termsVersion ?? 1}</span>
                      <span style={{ fontWeight:700, color:'var(--white)' }}>Method:</span><span>Clickwrap - ticked "I have read and agree" and could not place the order without it.</span>
                    </div>
                    <div style={{ fontWeight:700, color:'var(--white)', marginBottom:'4px' }}>Exact terms accepted{snapshotted ? '' : ' (current version - no snapshot on this order)'}:</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'200px', overflowY:'auto' }}>
                      {clauses.map((c, i) => (
                        <div key={i}>
                          <span style={{ fontWeight:700, color:'#166534' }}>{i+1}. {c.title}</span>
                          <div style={{ lineHeight:1.5 }}>{c.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            (lo.isCustom || lo.items?.some(i => i.isCustom)) && (
              <div style={{ marginTop:'10px', fontSize:'11px', color:'#c2410c' }}>No recorded T&C acceptance on this order.</div>
            )
          )}
        </div>

        {/* RIGHT - order items + payment */}
        <div style={{ ...S.card, padding:'14px 16px' }}>
          <SectionLabel>Order</SectionLabel>

          <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'12px', paddingBottom:'12px', borderBottom:'1px solid var(--border)' }}>
            {(Array.isArray(lo.items) && lo.items.length > 0 ? lo.items : []).map((item, i) => {
              const name    = item.productName || item.product_name || '-';
              const variant = item.variantName || item.variant_name || null;
              const unit    = Number(item.unitPrice ?? 0);
              const qty     = Number(item.qty ?? item.quantity ?? 1);
              const line    = Number(item.lineTotal ?? unit * qty);
              return (
                <div key={i} style={{ display:'flex', gap:'10px', alignItems:'flex-start', padding:'8px', background:'var(--dark2)', borderRadius:'6px', border:'1px solid var(--border)' }}>
                  <div style={{ width:'38px', height:'38px', borderRadius:'6px', background:item.thumbnail?'transparent':'#e9ecef', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                    {item.thumbnail
                      ? <img src={item.thumbnail} alt={name} style={{ objectFit:'cover', width:'38px', height:'38px', borderRadius:'6px' }} />
                      : <NoImage size={16} />
                    }
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'var(--white)' }}>{name}</div>
                    {variant && <div style={{ fontSize:'11px', color:'var(--gray)' }}>{variant}</div>}
                    {/* Which route THIS line took. On a mixed order the badge above says "Mixed"
                        and this is where the shop finds out which item is which - what has to be
                        made, and what can simply be picked. */}
                    {(() => {
                      const tag =
                        item.designRequested || item.designMode === 'request' ? null
                        : (item.designUrl || item.designFiles?.length) ? { t: 'UPLOAD',     c: '#5b21b6', b: '#ede9fe' }
                        : item.isMadeToOrder                            ? { t: 'MADE TO ORDER', c: '#92400e', b: '#fef3c7' }
                        : { t: 'READY-MADE', c: '#166534', b: '#f0fdf4' };
                      return tag ? (
                        <span style={{ fontSize:'10px', fontWeight:700, color:tag.c, background:tag.b, borderRadius:'4px', padding:'1px 6px', display:'inline-block', marginTop:'3px' }}>
                          {tag.t}
                        </span>
                      ) : null;
                    })()}
                    {item.designRequested && (
                      <span style={{ fontSize:'10px', fontWeight:700, color:'var(--gold)', background:'#fff7ed', padding:'1px 5px', borderRadius:'3px', border:'1px solid #fdba74', marginTop:'2px', display:'inline-block' }}>Design Service</span>
                    )}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:'11px', color:'var(--gray)' }}>₱{fmt(unit)} ×{qty}</div>
                    <div style={{ fontSize:'13px', fontWeight:700, color:'var(--white)' }}>₱{fmt(line)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <SectionLabel>Payment</SectionLabel>
          {Number(lo.discountAmount) > 0 && (
            <InfoRow label="Subtotal" value={`₱${fmt(Number(lo.totalAmount??0) + Number(lo.discountAmount))}`} />
          )}
          {Number(lo.discountAmount) > 0 && (
            <InfoRow label={`Voucher${lo.voucherCode ? ` (${lo.voucherCode})` : ''}`} value={`−₱${fmt(lo.discountAmount)}`} />
          )}
          {Number(lo.shippingFee) > 0 && (
            <InfoRow label="Shipping" value={`₱${fmt(lo.shippingFee)}`} />
          )}
          {Number(lo.designFee) > 0 && (
            <InfoRow
              label={`Design fee${lo.designFeePaid ? '' : ' (unpaid)'}`}
              value={`₱${fmt(lo.designFee)}`}
            />
          )}
          {Number(lo.rushFee) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'3px 0' }}>
              <span style={{ color:'var(--gray)' }}>
                Rush fee
                {lo.rushStatus === 'accepted' ? null : (
                  <span style={{ marginLeft:6, fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', color: lo.rushStatus === 'declined' ? '#c2410c' : 'var(--gray)' }}>
                    {lo.rushStatus === 'declined' ? 'declined' : 'not yet accepted'}
                  </span>
                )}
              </span>
              <span style={{ fontWeight:600, color:'var(--white)' }}>₱{fmt(lo.rushFee)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', fontWeight:700, padding:'4px 0', borderTop:'1px solid var(--border)', marginTop:'4px' }}>
            <span style={{ color:'var(--white)' }}>Total</span>
            <span style={{ color:'var(--gold)' }}>₱{fmt(lo.totalAmount ?? lo.totalPrice)}</span>
          </div>
          {Number(lo.courierFee) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', padding:'3px 0', color:'var(--gray)' }}>
              <span>Delivery fee (customer → rider)</span>
              <span style={{ fontWeight:600 }}>₱{fmt(lo.courierFee)}</span>
            </div>
          )}
          {/* balance is only written once a payment lands, so an unpaid order reported
              ₱0.00 owing on a ₱1,057.88 order. Derive it when it has never been set. */}
          {(() => {
            // Every peso received, not just the deposit. `downPayment` is untouched by a design fee,
            // so an order that had paid its P100 still reported "Paid P0.00" beside a payment history
            // showing that exact P100.
            const history = (lo.paymentHistory ?? []).reduce((t, x) => t + (Number(x.amount) || 0), 0);
            const paid  = Math.max(Number(lo.downPayment ?? 0), history);
            const total = Number(lo.totalAmount ?? lo.totalPrice ?? 0);
            // Always derived. Preferring the stored field is what reported P0.00 owing beside a
            // P350.00 total with P100.00 paid - the number the owner then acts on.
            const owing = Math.max(0, Math.round((total - paid) * 100) / 100);
            return (
              <>
                <InfoRow label="Paid" value={`₱${fmt(paid)}`} />
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'3px 0' }}>
                  <span style={{ color:'var(--gray)' }}>Balance</span>
                  <span style={{ fontWeight:700, color: owing <= 0 ? '#166534' : '#c2410c' }}>₱{fmt(owing)}</span>
                </div>

                {/* Money owed BACK. A cancelled paid order and a declined paid-for rush both leave
                    the shop holding money it is not entitled to, and until now neither said so
                    anywhere - the order simply read as cancelled and the total quietly dropped.
                    There is no refund API, so this is a to-do for a person, not a button that
                    moves money; the value of it is that the debt is no longer invisible. */}
                {Number(lo.refundOwed || 0) > 0 && (
                  <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 6,
                    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.28)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>
                      <span>Refund owed</span>
                      <span>₱{fmt(Number(lo.refundOwed))}</span>
                    </div>
                    {(lo.refunds || []).filter(r => (r.status || 'owed') === 'owed').map((r, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4, lineHeight: 1.45 }}>
                        ₱{fmt(Number(r.amount || 0))} - {r.reason}
                      </div>
                    ))}
                    <div style={{ fontSize: 10.5, color: 'var(--gray)', marginTop: 6, fontStyle: 'italic' }}>
                      Send this back by hand - the system cannot return it for you. Log it here once
                      you have, so the order stops reading as unpaid business.
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}
                        style={{ ...S.input, width: 'auto', flex: '0 0 auto', fontSize: 12, padding: '5px 8px' }}>
                        <option value="gcash">GCash</option>
                        <option value="maya">Maya</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cash">Cash</option>
                      </select>
                      <button type="button" onClick={handleMarkRefunded} disabled={payingRefund}
                        style={{ ...S.btnSm, opacity: payingRefund ? 0.6 : 1 }}>
                        {payingRefund ? 'Recording...' : `I have sent \u20B1${fmt(Number(lo.refundOwed))}`}
                      </button>
                    </div>
                    {refundErr && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 5 }}>{refundErr}</div>}
                  </div>
                )}

                {/* The automatic balance notice fires once, when the last job passes QC. Without a way
                    to send it again the only follow-up was typing in the chat by hand. */}
                {owing > 0 && String(lo.paymentMethod || '').toLowerCase() !== 'cod' && (
                  <div style={{ marginTop: 8 }}>
                    <button type="button" onClick={handleRemindBalance} disabled={reminding}
                      style={{ ...S.btnSmGhost, width: '100%', opacity: reminding ? 0.6 : 1 }}>
                      {reminding ? 'Sending...' : 'Send payment reminder'}
                    </button>
                    {remindMsg && (
                      <div style={{ fontSize: 11, marginTop: 5, color: remindMsg.ok ? '#166534' : '#c2410c' }}>
                        {remindMsg.text}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {Array.isArray(lo.paymentHistory) && lo.paymentHistory.length > 0 && (
            <>
              <div style={S.divider} />
              <SectionLabel>Payment History</SectionLabel>
              {lo.paymentHistory.map((p, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', padding:'2px 0' }}>
                  <span style={{ color:'var(--gray)' }}>{p.method}{p.note ? ` - ${p.note}` : ''}</span>
                  <span style={{ color:'#166534', fontWeight:600 }}>+₱{fmt(p.amount)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Action row */}
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'12px', alignItems:'center' }}>
        {lo.paymentStatus !== 'paid' && (
          <button onClick={onPayment} style={{ ...S.btnSmGhost, color:'#166534', borderColor:'#bbf7d0' }}>Record Payment</button>
        )}
        {canExpire && (
          <button onClick={handleExpire} disabled={expiring}
            style={{ ...S.btnSmDanger, background:'#fff7ed', color:'#c2410c', borderColor:'#fdba74', opacity: expiring ? 0.6 : 1 }}>
            {expiring ? 'Expiring…' : 'Mark Expired'}
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} style={S.btnSmDanger}>{ICONS.trash} Archive</button>
        )}
        {expireErr && <span style={{ fontSize:'11px', color:'#991b1b' }}>{expireErr}</span>}
      </div>

      <ConfirmModal
        open={confirmSt && selStatus !== lo.orderStatus}
        onClose={() => { setConfirmSt(false); setSelStatus(lo.orderStatus); }}
        onConfirm={handleUpdateStatus}
        loading={isUpdating}
        title={statusCopy(selStatus).title}
        confirmLabel={statusCopy(selStatus).label}
        confirmStyle={statusCopy(selStatus).danger ? 'danger' : 'primary'}
        message={updateErr
          ? `${updateErr}. Nothing was changed - the order is still ${getStatusBadge(lo.orderStatus).label}.`
          : `${lo.orderRef || 'This order'}: ${statusCopy(selStatus).body}`
            /* Delivering a COD order also records the cash as collected, which is a money change,
               and a money change should never be a side effect nobody was told about. Named here,
               with the figure, before it happens. */
            + (String(selStatus) === 'Delivered'
                && String(lo.paymentMethod ?? '').toLowerCase() === 'cod'
                && remainingDue(lo) > 0
                  ? ` This is a Cash on Delivery order, so it will also be marked PAID and ₱${fmt(remainingDue(lo))} recorded as collected by the rider.`
                  : '')}
      />

      <ConfirmModal
        open={!!joConfirm}
        onClose={() => setJoConfirm(null)}
        onConfirm={() => joConfirm && advanceJO(joConfirm.jo, joConfirm.to)}
        loading={!!joBusyId}
        confirmStyle="primary"
        title={joConfirm ? JO_COPY[joConfirm.to]?.title : ''}
        confirmLabel={joConfirm ? JO_COPY[joConfirm.to]?.label : 'Confirm'}
        message={joConfirm
          ? `${joConfirm.jo.joId} - ${joConfirm.jo.product?.productName || joConfirm.jo.product?.name || 'this item'}. ${JO_COPY[joConfirm.to]?.body ?? ''}`
          : ''}
      />
    </div>

  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { token } = useAuth();

  const [orders,       setOrders]       = useState([]);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payFilter,    setPayFilter]    = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [dateFilter,   setDateFilter]   = useState('all-time');
  const [customFrom,   setCustomFrom]   = useState('');
  const [customTo,     setCustomTo]     = useState('');
  const [expandedId,   setExpandedId]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');
  const [refreshing,   setRefreshing]   = useState(false);

  // Modals
  const [payTarget,     setPayTarget]     = useState(null);
  const [archiveId,     setArchiveId]     = useState(null);
  const [showJOQueue,   setShowJOQueue]   = useState(false);
  const [printTarget,   setPrintTarget]   = useState(null);
  const [showArchived,  setShowArchived]  = useState(false);

  const skipPollRef = useRef(false);
  const pollRef     = useRef(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    skipPollRef.current = false;
    setLoadError('');
    try {
      const data = await fetchAllOrdersNew(token, { page:1, limit:PAGE_LIMIT, showArchived });
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      setLoadError('Failed to load orders.');
      console.error(e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [token, showArchived]);

  useEffect(() => { if (token) fetchOrders(); }, [token, fetchOrders]);

  // An open row means someone is working in it - uploading a proof, approving, editing a date. The
  // background refresh must not run underneath them. `skipPollRef` was already here but nothing ever
  // set it true, so the guard did nothing.
  useEffect(() => { skipPollRef.current = expandedId !== null; }, [expandedId]);

  // Deep link from a chat card or a notification. Opens that order's row once the list has it, then
  // clears the param so a later Back or refresh does not reopen what was just closed. Guarded so it
  // only ever fires once - otherwise every poll would fight the owner for control of the row.
  const deepLinkedRef = useRef(null);
  useEffect(() => {
    if (!orders.length || typeof window === 'undefined') return;
    const wanted = new URLSearchParams(window.location.search).get('order');
    if (!wanted || deepLinkedRef.current === wanted) return;
    const idOf = (o) => {
      const raw = o?.id ?? o?._id;
      if (!raw) return '';
      return typeof raw === 'object' ? String(raw.$oid ?? raw) : String(raw);
    };
    const match = orders.find(o => idOf(o) === String(wanted));
    if (!match) return;
    deepLinkedRef.current = wanted;
    setExpandedId(match.id);
    window.history.replaceState({}, '', window.location.pathname);
    requestAnimationFrame(() => {
      document.getElementById(`order-row-${match.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [orders]);

  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => {
      if (!refreshing && !skipPollRef.current) fetchOrders(true);
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [token, refreshing, fetchOrders]);

  // ── Filter + sort ───────────────────────────────────────────────────────────

  // Everything except the status filter. The cards count this, and the table is this narrowed by
  // status - so the two can no longer describe different populations.
  const scoped = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (o.customerName || '').toLowerCase().includes(q) ||
      (o.id || '').toLowerCase().includes(q) ||
      (o.productName || '').toLowerCase().includes(q);

    const matchPay    = payFilter === 'all' || o.paymentStatus === payFilter;

    const matchType   = typeFilter === 'all'
      || (typeFilter === 'produced' ? !!o.needsProduction : !o.needsProduction);

    let matchDate = true;
    const d    = new Date(o.createdAt); d.setHours(0,0,0,0);
    const now  = new Date();            now.setHours(0,0,0,0);
    if (dateFilter === 'today') {
      matchDate = d.getTime() === now.getTime();
    } else if (dateFilter === 'this-week') {
      matchDate = d >= new Date(now - 7*86400000);
    } else if (dateFilter === 'this-month') {
      matchDate = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } else if (dateFilter === 'custom' && customFrom && customTo) {
      const from = new Date(customFrom); from.setHours(0,0,0,0);
      const to   = new Date(customTo);   to.setHours(23,59,59,999);
      matchDate  = d >= from && d <= to;
    }

    return matchSearch && matchPay && matchType && matchDate;
  });

  const filtered = scoped.filter(o =>
    // 'needs_attention' is not a stored status - it is the derived delivery-promise risk.
    statusFilter === 'all' ? true
      : statusFilter === 'needs_attention' ? !!deliveryRisk(o)
      : normalizeStatus(o.orderStatus) === statusFilter
  ).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  // ── Summary counts ──────────────────────────────────────────────────────────

  const countBy = (code) => scoped.filter(o => normalizeStatus(o.orderStatus) === code).length;
  const counts = {
    all:          scoped.length,
    pending:      countBy('pending'),
    inProduction: countBy('in_production'),
    forDelivery:  countBy('for_delivery'),
    delivered:    countBy('delivered'),
    cancelled:    countBy('cancelled'),
    // Orders whose delivery promise is late or about to be missed (derived, not stored).
    needsAttention: scoped.filter(o => !!deliveryRisk(o)).length,
  };

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const fmt = n => Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <div style={S.page}>

        {/* Summary cards - click to filter */}
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'16px' }}>
          {[
            { label:'Total Orders',   value:counts.all,          id:'all'           },
            { label:'Pending',        value:counts.pending,       id:'pending'       },
            { label:'In Production',  value:counts.inProduction,  id:'in_production' },
            { label:'For Delivery',   value:counts.forDelivery,   id:'for_delivery'  },
            { label:'Delivered',      value:counts.delivered,     id:'delivered'     },
            { label:'Cancelled',      value:counts.cancelled,     id:'cancelled'     },
            { label:'Needs Attention',value:counts.needsAttention,id:'needs_attention', alert:true },
          ].map(c => (
            <div key={c.id} onClick={() => { setStatusFilter(c.id); setPage(1); }}
              style={{ cursor:'pointer', flex:'1', minWidth:'100px' }}>
              <SummaryCard label={c.label} value={c.value}
                accent={statusFilter === c.id}
                color={statusFilter === c.id ? 'var(--gold)' : (c.alert && c.value > 0 ? 'var(--st-red-fg)' : undefined)} />
            </div>
          ))}
        </div>

        {/* Status pill tabs */}
        <div style={{ display:'flex', gap:'4px', background:'var(--dark2)', borderRadius:'8px', padding:'3px', alignSelf:'flex-start', marginBottom:'14px', flexWrap:'wrap' }}>
          {STATUS_TABS.map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'none', cursor:'pointer',
                fontWeight:600, fontSize:'12px',
                background: statusFilter === s ? 'var(--dark)' : 'transparent',
                color:      statusFilter === s ? 'var(--white)' : 'var(--gray)',
                boxShadow:  statusFilter === s ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                transition:'all .15s', whiteSpace:'nowrap',
              }}>{s === 'all' ? 'All' : statusLabel(s)}</button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ ...S.card, ...S.rowBetween, marginBottom:'10px', padding:'12px 16px' }}>
          <div style={{ ...S.row, gap:'8px', flex:1 }}>
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }}
              placeholder="Search order, customer, product…" style={{ width:'260px' }} />

            <CustomSelect
              value={typeFilter}
              onChange={v => { setTypeFilter(v); setPage(1); }}
              style={{ width:'150px' }}
              options={[
                { value:'all',      label:'All Types'   },
                { value:'produced', label:'Custom'      },
                { value:'ready',    label:'Ready Made'  },
              ]}
            />

            <CustomSelect
              value={payFilter}
              onChange={v => { setPayFilter(v); setPage(1); }}
              style={{ width:'140px' }}
              options={[
                { value:'all',     label:'All Payments' },
                { value:'paid',    label:'Paid'         },
                { value:'partial', label:'Partial'      },
                { value:'unpaid',  label:'Unpaid'       },
              ]}
            />

            <CustomSelect
              value={dateFilter}
              onChange={v => setDateFilter(v)}
              style={{ width:'150px' }}
              options={[
                { value:'all-time',   label:'All Time'     },
                { value:'today',      label:'Today'        },
                { value:'this-week',  label:'This Week'    },
                { value:'this-month', label:'This Month'   },
                { value:'custom',     label:'Custom Range' },
              ]}
            />

            {dateFilter === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...S.input, width:'140px' }} />
                <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   style={{ ...S.input, width:'140px' }} />
              </>
            )}
          </div>

          <div style={S.row}>
            {refreshing && <span style={{ fontSize:'12px', color:'var(--gray)' }}>Refreshing…</span>}
            <button onClick={() => setShowJOQueue(true)} style={S.btnSmGhost}>{ICONS.pkg} JO Queue</button>
            <button
              onClick={() => setShowArchived(v => !v)}
              style={{ ...S.btnSmGhost, ...(showArchived ? { background:'#fff7ed', color:'#c2410c', borderColor:'#fdba74' } : {}) }}>
              {showArchived ? 'Hide Archived' : 'Show Archived'}
            </button>
            <button onClick={() => fetchOrders()} style={S.btnSmGhost}>{ICONS.reload}</button>
            <span style={{ fontSize:'12px', color:'var(--gray)', whiteSpace:'nowrap' }}>{total} order{total !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {loadError && <div style={{ ...S.note, background:'#fef2f2', border:'1px solid #fecaca', color:'#991b1b', marginBottom:'10px' }}>{loadError}</div>}

        {/* Table */}
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['','Order Ref','Type','Customer','Product','Qty','Total','Status','Payment','Date'].map((h,i) => (
                    <th key={i} style={{ ...S.th, ...(i===0 ? {width:'36px'} : {}), textAlign: [5,6,7,8].includes(i) ? 'center' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ padding:'40px', textAlign:'center', color:'var(--gray)', fontSize:'13px' }}>Loading orders…</td></tr>
                ) : total === 0 ? (
                  <tr><td colSpan={10}>
                    <EmptyState message="No orders found" sub="Try adjusting your search or filter." />
                  </td></tr>
                ) : slice.map(o => {
                  const isOpen = expandedId === o.id;
                  const isArch = !!o.isArchived;
                  return (
                    <React.Fragment key={o.id}>
                      <tr id={`order-row-${o.id}`} style={{ ...S.tr, cursor:'pointer',
                        background: isOpen ? 'var(--dark2)' : isArch ? 'var(--dark2)' : undefined,
                        opacity: isArch ? 0.65 : 1,
                        borderBottom: isOpen ? 'none' : undefined }}
                        onClick={() => setExpandedId(isOpen ? null : o.id)}
                        onMouseEnter={e => !isOpen && (e.currentTarget.style.background='var(--dark2)')}
                        onMouseLeave={e => !isOpen && (e.currentTarget.style.background= isArch ? 'var(--dark2)' : '')}>

                        <td style={{ ...S.td, textAlign:'center', width:'36px' }}>
                          <Chevron open={isOpen} />
                        </td>
                        <td style={{ ...S.td, fontFamily:'monospace', fontWeight:700, fontSize:'12px', color:'var(--gold)', whiteSpace:'nowrap' }}>
                          {orderNo(o)}
                        </td>
                        <td style={{ ...S.td }}>
                          <TypeBadge isCustom={o.isCustom} items={o.items} />
                        </td>
                        <td style={{ ...S.td }}>
                          <div style={{ fontWeight:600, fontSize:'13px' }}>{o.customerName}</div>
                          {o.customerContact && <div style={{ fontSize:'11px', color:'var(--gray)' }}>{o.customerContact}</div>}
                        </td>
                        <td style={{ ...S.td }}>
                          <div style={{ fontSize:'13px' }}>{o.productName}</div>
                          {o.category && <div style={{ fontSize:'11px', color:'var(--gray)' }}>{o.category}</div>}
                        </td>
                        <td style={{ ...S.td, textAlign:'center', color:'var(--gray)', fontSize:'12px' }}>{o.quantity}</td>
                        <td style={{ ...S.td, textAlign:'center', fontWeight:700, fontFamily:'monospace', fontSize:'12px', color:'var(--gold)', whiteSpace:'nowrap' }}>
                          ₱{fmt(o.totalAmount ?? o.totalPrice)}
                        </td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          <StatusBadge status={o.orderStatus} />
                          {isArch && <span style={{ ...S.badge, fontSize:'10px', background:'var(--st-gray-bg)', color:'var(--st-gray-fg)', border:'1px solid var(--border)', marginLeft:'4px' }}>Archived</span>}
                          {isExpired(o) && <span style={{ ...S.badge, fontSize:'10px', background:'var(--st-orange-bg)', color:'var(--st-orange-fg)', border:'1px solid rgba(251,146,60,0.35)', marginLeft:'4px' }}>Expired</span>}
                          {(() => {
                            // The delivery promise used to lapse silently. Surface it on the row.
                            const risk = deliveryRisk(o);
                            if (!risk) return null;
                            return <span title={risk.reason} style={{ ...S.badge, ...RISK_STYLE[risk.color], fontSize:'10px', fontWeight:700, marginLeft:'4px' }}>{risk.label}</span>;
                          })()}
                        </td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          <PayBadge status={o.paymentStatus} method={o.paymentMethod} />
                        </td>
                        <td style={{ ...S.td, fontSize:'11px', color:'var(--gray)', whiteSpace:'nowrap' }}>
                          {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' }) : '-'}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${o.id}_detail`}>
                          <td colSpan={10} style={{ padding:0 }}>
                            <OrderDetail
                              o={o}
                              token={token}
                              onStatusUpdated={(id, updated) => {
                                if (updated) setOrders(prev => prev.map(x => x.id === id ? { ...x, ...updated } : x));
                                else fetchOrders(true);
                              }}
                              onPayment={() => setPayTarget(o)}
                              onDelete={()  => setArchiveId(o.id)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
              <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
            </div>
          )}
        </div>

        {/* Modals */}
        {payTarget && (
          <PaymentModal
            order={payTarget}
            onClose={() => setPayTarget(null)}
            onSuccess={updated => {
              if (updated) setOrders(prev => prev.map(o => o.id === payTarget.id ? { ...o, ...updated, id:o.id } : o));
            }}
          />
        )}

        {archiveId && (
          <ArchiveModal
            orderId={archiveId}
            onClose={() => setArchiveId(null)}
            onArchived={id => setOrders(prev => prev.filter(o => o.id !== id))}
          />
        )}

        {showJOQueue && (
          <JOQueueModal
            orders={orders}
            token={token}
            onClose={() => setShowJOQueue(false)}
            onJOUpdated={(id, status) => setOrders(prev => prev.map(o => o.id === id ? { ...o, joStatus:status } : o))}
            onPrintJO={(o, jo = null) => { setPrintTarget({ order: o, jobOrder: jo }); setShowJOQueue(false); }}
          />
        )}

        {printTarget && (
          <PrintJOModal order={printTarget.order} jobOrder={printTarget.jobOrder} onClose={() => setPrintTarget(null)} />
        )}

      </div>
    </ErrorBoundary>
  );
}
