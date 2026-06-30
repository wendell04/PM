'use client';

import ErrorBoundary from '../../../../components/ErrorBoundary';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllOrdersNew, updateJobOrderStatus, deleteOrder as deleteOrderApi } from '@/lib/ordersApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination, CustomSelect } from '../inventory-v2/shared';
import { getStatusBadge } from '@/lib/utils/orderHelpers';
import { normalizeStatus, statusLabel, ORDER_STATUS_ORDER } from '@/lib/orderStatus';

const API_URL    = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const POLL_MS    = 30000;
const PAGE_LIMIT = 500;
const EXPIRY_DAYS = 7;

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

function PayBadge({ status }) {
  const c = PAY_CFG[status] ?? PAY_CFG.unpaid;
  return (
    <span style={{ ...S.badge, background:c.bg, color:c.color, border:`1px solid ${c.border}`, fontSize:'10px' }}>
      {c.label}
    </span>
  );
}

function TypeBadge({ isCustom }) {
  return isCustom
    ? <span style={{ ...S.badge, background:'#ede9fe', color:'#5b21b6', border:'1px solid var(--border)6fe', fontSize:'10px' }}>Custom</span>
    : <span style={{ ...S.badge, background:'#f0fdf4', color:'#166534', border:'1px solid #bbf7d0', fontSize:'10px' }}>Ready Made</span>;
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

function Modal({ children, onClose, maxWidth = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.card, width:'100%', maxWidth, maxHeight:'90vh', overflowY:'auto',
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
  const [amount,      setAmount]      = useState('');
  const [method,      setMethod]      = useState('cash');
  const [note,        setNote]        = useState('');
  const [error,       setError]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setError('Enter a valid amount.'); return; }
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
    <Modal onClose={onClose} maxWidth={440}>
      <ModalHeader title="Record Payment" onClose={onClose} />

      <div style={{ ...S.noteInfo, marginBottom:'16px' }}>
        <div style={{ fontWeight:600, marginBottom:'4px' }}>{order.customerName}</div>
        <div style={{ display:'flex', gap:'20px', fontSize:'12px' }}>
          <span>Total: <strong>₱{fmt(order.totalAmount ?? order.totalPrice)}</strong></span>
          <span>Balance: <strong>₱{fmt(order.balance)}</strong></span>
        </div>
      </div>

      <div style={S.col}>
        <div>
          <div style={S.label}>Amount *</div>
          <input type="number" min="0.01" step="0.01" value={amount}
            onChange={e => { setAmount(e.target.value); setError(''); }}
            onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
            placeholder="0.00"
            style={{ ...S.input, marginTop:'4px', ...(error ? { border:'1px solid #e05252' } : {}) }} />
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
          #{String(orderId).slice(-8).toUpperCase()}
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

function JOQueueModal({ orders, token, onClose, onJOUpdated, onPrintJO }) {
  const today = new Date(); today.setHours(0,0,0,0);

  const joOrders = orders
    .filter(o => o.downPayment > 0 && o.orderStatus === 'In Production' && o.joStatus !== 'Completed')
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

      {joOrders.length === 0
        ? <EmptyState message="No active job orders" sub="Orders in production will appear here." />
        : (
          <div style={S.col}>
            {joOrders.map(o => {
              const target   = o.targetCompletion ? new Date(o.targetCompletion) : null;
              const daysLeft = target ? Math.ceil((target - today)/86400000) : null;
              const isLate   = target && target < today;
              const isUrgent = !isLate && daysLeft !== null && daysLeft <= 2;
              const border   = isLate ? '#fca5a5' : o.isRush ? '#fdba74' : isUrgent ? '#fde68a' : 'var(--border)';

              return (
                <div key={o.id} style={{ ...S.card, border:`2px solid ${border}`, padding:'14px 18px',
                  display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:'11px', color:'var(--gray)', fontFamily:'monospace', marginBottom:'3px' }}>{o.joId || 'No JO assigned'}</div>
                    <div style={{ fontWeight:700, fontSize:'13px', color:'var(--white)' }}>{o.customerName}</div>
                    <div style={{ fontSize:'12px', color:'var(--gray)', marginTop:'2px' }}>{o.productName} × {o.quantity}</div>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    {isLate
                      ? <span style={{ ...S.badge, background:'#fef2f2', color:'#991b1b', border:'1px solid #fecaca' }}>
                          DELAYED — {Math.abs(daysLeft)}d late
                        </span>
                      : o.isRush
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
                    <StatusBadge status={o.joStatus || 'Queued'} />
                    <button onClick={() => onPrintJO(o)} style={S.btnSmGhost}>Print</button>
                    {o.joStatus !== 'In Progress' && (
                      <button style={S.btnSm} onClick={async () => {
                        if (!o.joId) return;
                        await updateJobOrderStatus(o.joId, 'In Progress', token).catch(() => {});
                        onJOUpdated(o.id, 'In Progress');
                      }}>Start</button>
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

function PrintJOModal({ order, onClose }) {
  const [description,   setDescription]   = useState('');
  const [designImages,  setDesignImages]  = useState([]);

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

    const w = window.open('','','width=800,height=600');
    w.document.write(`<html><head><title>JO — ${order.joId||'PENDING'}</title>
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
          <div><div class="label">JO ID</div><div style="font-size:20px;font-weight:700">${order.joId||'PENDING'}</div></div>
          <div style="padding:6px 16px;border:2px solid ${order.isRush?'#dc2626':'#059669'};border-radius:20px;font-weight:700;font-size:12px;color:${order.isRush?'#dc2626':'#059669'};text-transform:uppercase">${order.isRush?'RUSH ORDER':'STANDARD'}</div>
        </div>
        ${order.targetCompletion ? `<div style="margin-bottom:12px"><div class="label">Target Completion</div><div class="val">${new Date(order.targetCompletion).toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div></div>` : ''}
        <div class="sep"></div>
        <div><div class="label">Customer</div><div class="val">${esc(order.customerName)}</div>
        <div style="font-size:12px;color:#555;margin-top:2px">${esc(order.customerContact||'')} ${order.customerEmail?'· '+esc(order.customerEmail):''}</div></div>
        <div class="sep"></div>
        <div style="padding:12px;border:2px solid #d97706;border-radius:6px;margin:12px 0">
          <div class="label" style="color:#d97706;border-bottom:1px solid #d97706;padding-bottom:4px;margin-bottom:10px">Product Specifications</div>
          <div class="grid">
            <div><div class="label">Product</div><div class="val">${esc(order.productName||'')}</div></div>
            <div><div class="label">Category</div><div class="val">${esc(order.category||'')}</div></div>
            <div><div class="label">Variant</div><div class="val">${esc(order.variant||'N/A')}</div></div>
            <div><div class="label">Quantity</div><div style="font-size:22px;font-weight:700;color:#d97706">${order.quantity} pcs</div></div>
          </div>
        </div>
        ${imgsHtml}${descHtml}
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
      <ModalHeader title={`Print Job Order — ${order.joId || 'PENDING'}`} onClose={onClose} />

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
                  <div style={{ fontSize:'11px', color:'var(--gray)' }}>PNG, JPG — multiple supported</div>
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

function getAvailableStatuses(o) {
  if (!o) return [];
  const s = o.orderStatus;
  const isCOD = (o.paymentMethod || '').toLowerCase() === 'cod';
  if (o.isCustom) {
    return ({
      pending_review:      ['awaiting_payment'],
      design_approved:     ['awaiting_payment'],
      awaiting_production: ['In Production'],
      'In Production':     ['for_qc'],
      for_qc:              ['ready_for_delivery'],
      ready_for_delivery:  ['For Delivery'],
      'For Delivery':      ['Delivered'],
    })[s] ?? [];
  }
  if (isCOD) {
    return ({
      Pending:        ['Processing', 'Cancelled'],
      Processing:     ['In Production', 'For Delivery', 'Cancelled'],
      'In Production': ['for_qc', 'Cancelled'],
      for_qc:         ['ready_for_delivery'],
      ready_for_delivery: ['For Delivery'],
      'For Delivery': ['Delivered'],
      Delivered:      o.paymentStatus === 'paid' ? [] : ['Returned'],
    })[s] ?? [];
  }
  return ({
    Pending:        ['Processing', 'Cancelled'],
    Processing:     ['For Delivery', 'Cancelled'],
    'For Delivery': ['Delivered'],
    Delivered:      ['Returned'],
  })[s] ?? [];
}

// ── Expanded Order Detail ─────────────────────────────────────────────────────

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
  const [feeErr,      setFeeErr]      = useState('');

  useEffect(() => { setLo(o); setSelStatus(o.orderStatus); }, [o]);
  useEffect(() => { setFeeInput(o.courierFee != null && Number(o.courierFee) > 0 ? String(o.courierFee) : ''); }, [o]);

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
  const available = getAvailableStatuses(lo);

  const handleUpdateStatus = async () => {
    if (!selStatus || selStatus === lo.orderStatus) return;
    setIsUpdating(true); setUpdateErr(''); setConfirmSt(false);
    try {
      const payload = selStatus === 'Paid' ? { paymentStatus:'paid' } : { orderStatus: selStatus };
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}`, {
        method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify(payload),
      }, 15000);
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.message || d.error || 'Update failed'); }
      const updated = selStatus === 'Paid'
        ? { ...lo, paymentStatus:'paid' }
        : { ...lo, orderStatus: selStatus };
      setLo(updated);
      if (onStatusUpdated) onStatusUpdated(lo.id, updated);
    } catch (err) { setUpdateErr(err.message || 'Update failed'); }
    finally { setIsUpdating(false); }
  };

  const handleApproveDesign = async () => {
    setDesignAct('approving'); setDesignErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/approve-design`,
        { method:'POST', headers:{ Authorization:`Bearer ${token}` } }, 15000);
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).message || 'Failed');
      setLo(p => ({ ...p, designStatus:'approved' }));
      if (onStatusUpdated) onStatusUpdated(lo.id);
    } catch (err) { setDesignErr(err.message); }
    finally { setDesignAct(null); }
  };

  const handleRejectDesign = async () => {
    setDesignAct('rejecting'); setDesignErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/reject-design`,
        { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ reason: null }) }, 15000);
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).message || 'Failed');
      setLo(p => ({ ...p, designStatus:'rejected' }));
      if (onStatusUpdated) onStatusUpdated(lo.id);
    } catch (err) { setDesignErr(err.message); }
    finally { setDesignAct(null); }
  };

  const handleUploadDesign = async (files) => {
    if (!files.length) return;
    setUploading(true); setDesignErr('');
    try {
      const form = new FormData();
      files.forEach(f => form.append('design[]', f));
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${lo.id}/upload-design`,
        { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: form }, 30000);
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).message || 'Upload failed');
      const data = await res.json();
      const adminDesignUrl = data.order?.adminDesignUrl ?? data.adminDesignUrl ?? null;
      setLo(p => ({ ...p, adminDesignUrl, orderStatus:'proof_sent', designStatus:'draft_ready' }));
      setDraftFiles([]);
      if (onStatusUpdated) onStatusUpdated(lo.id);
    } catch (err) { setDesignErr(err.message); }
    finally { setUploading(false); }
  };

  const hasDesignWork = lo.isCustom || lo.items?.some(i => i.designRequested);

  return (
    <div style={{ padding:'16px 20px', background:'var(--dark2)', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

        {/* LEFT — customer + design (if custom) + status */}
        <div style={{ ...S.card, padding:'14px 16px', display:'flex', flexDirection:'column' }}>

          <SectionLabel>Customer</SectionLabel>
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
                <div style={{ fontSize:'12px', color:'var(--gray)', marginTop:'2px' }}>☎ {lo.deliveryAddress.phone}</div>
              )}
              {typeof lo.deliveryAddress === 'object' && lo.deliveryAddress.lat && lo.deliveryAddress.lng && (
                <div style={{ marginTop:'8px' }}>
                  <div style={{ fontSize:'11px', color:'var(--gray)', marginBottom:'5px' }}>
                    Pinned drop-off — open this exact spot to book your courier (Lalamove / Grab / etc.):
                  </div>
                  <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${lo.deliveryAddress.lat},${lo.deliveryAddress.lng}`}
                       target="_blank" rel="noopener noreferrer"
                       style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'5px 10px', fontSize:'11px', fontWeight:600, borderRadius:'6px', border:'1px solid var(--border)', background:'var(--dark)', color:'var(--white)', textDecoration:'none', cursor:'pointer' }}>
                      📍 Google Maps
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

              {/* Courier-booked delivery fee — paid by customer to the rider on delivery */}
              {!(Number(lo.shippingFee) > 0) && (
                <div style={{ marginTop:'10px', padding:'10px 12px', background:'var(--dark2)', border:'1px solid var(--border)', borderRadius:'8px' }}>
                  <div style={{ fontSize:'11px', fontWeight:600, color:'var(--gray-light)', marginBottom:'2px' }}>Delivery fee (paid by customer to rider)</div>
                  <div style={{ fontSize:'10.5px', color:'var(--gray)', marginBottom:'6px' }}>
                    After you book the courier, enter the fee. The customer is notified to pay this in cash on delivery.
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
                        Set: ₱{fmt(lo.courierFee)} · customer notified
                      </span>
                    )}
                  </div>
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

          {lo.joId && (
            <>
              <div style={S.divider} />
              <SectionLabel>Job Order</SectionLabel>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'4px' }}>
                <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'13px', color:'var(--white)' }}>{lo.joId}</span>
                <StatusBadge status={lo.joStatus || 'Queued'} />
                {lo.isRush && <span style={{ ...S.badge, background:'#fff7ed', color:'#c2410c', border:'1px solid #fdba74', fontSize:'10px' }}>RUSH</span>}
              </div>
              {target && (
                <div style={{ fontSize:'12px', color: isLate ? '#991b1b' : 'var(--gray)' }}>
                  Due {target.toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}
                  {daysLeft !== null && (
                    <span style={{ fontWeight:600, marginLeft:'6px' }}>
                      {isLate ? `· ${Math.abs(daysLeft)}d overdue` : `· ${daysLeft}d left`}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {/* Design workflow — custom orders only */}
          {hasDesignWork && (
            <>
              <div style={S.divider} />
              <SectionLabel>Design</SectionLabel>

              {lo.designStatus && (
                <div style={{ marginBottom:'8px' }}>
                  <span style={{ ...S.badge, fontSize:'11px',
                    background: lo.designStatus==='approved' ? '#f0fdf4' : lo.designStatus==='rejected' ? '#fef2f2' : '#fff7ed',
                    color:      lo.designStatus==='approved' ? '#166534' : lo.designStatus==='rejected' ? '#991b1b' : '#c2410c',
                    border:`1px solid ${lo.designStatus==='approved'?'#bbf7d0':lo.designStatus==='rejected'?'#fecaca':'#fdba74'}` }}>
                    {lo.designStatus==='approved' ? '✓ Approved'
                      : lo.designStatus==='rejected' ? '✗ Rejected'
                      : lo.designStatus==='revision_requested' ? '↩ Revision Requested'
                      : lo.designStatus==='draft_ready' ? '⏳ Awaiting Review'
                      : '⏳ Pending'}
                  </span>
                </div>
              )}

              {lo.orderStatus==='revision_requested' && lo.revisionNotes && (
                <div style={{ ...S.note, background:'#fff7ed', border:'1px solid #fdba74', marginBottom:'8px', fontSize:'12px' }}>
                  <span style={{ fontWeight:600, color:'#c2410c' }}>↩ Revision: </span>{lo.revisionNotes}
                </div>
              )}

              {lo.designFilePath && (
                <a href={lo.designFilePath?.startsWith('http') ? lo.designFilePath : `${API_URL}/storage/${lo.designFilePath}`} target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'12px', fontWeight:600, color:'#2563eb', textDecoration:'none', marginBottom:'8px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  View Customer File
                </a>
              )}

              {(!lo.designStatus || lo.designStatus==='pending_review') && lo.designFilePath && (
                <div style={{ display:'flex', gap:'6px', marginBottom:'8px' }}>
                  <button onClick={handleApproveDesign} disabled={!!designAct}
                    style={{ flex:1, padding:'5px 0', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'6px', color:'#166534', fontSize:'12px', fontWeight:700, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                    {designAct==='approving' ? 'Approving…' : '✓ Approve'}
                  </button>
                  <button onClick={handleRejectDesign} disabled={!!designAct}
                    style={{ flex:1, padding:'5px 0', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'6px', color:'#991b1b', fontSize:'12px', fontWeight:700, cursor:designAct?'not-allowed':'pointer', opacity:designAct?.6:1 }}>
                    {designAct==='rejecting' ? 'Rejecting…' : '✗ Reject'}
                  </button>
                </div>
              )}

              {lo.items?.some(i => i.designRequested) && (
                <div>
                  {lo.adminDesignUrl && !draftFiles.length && (
                    <div style={{ fontSize:'11px', color:'var(--gray)', marginBottom:'6px' }}>
                      <a href={lo.adminDesignUrl} target="_blank" rel="noopener noreferrer"
                        style={{ color:'var(--gold)', fontWeight:600, textDecoration:'none' }}>View Sent Draft ↗</a>
                      <span style={{ marginLeft:'6px' }}>— Awaiting review</span>
                    </div>
                  )}
                  {draftFiles.length > 0 ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                      <div style={{ fontSize:'11px', color:'var(--gray)' }}>{draftFiles.length} file{draftFiles.length>1?'s':''} ready</div>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={() => handleUploadDesign(draftFiles)} disabled={uploading}
                          style={{ flex:1, padding:'5px 0', background:'var(--gold)', border:'none', borderRadius:'6px', color:'var(--dark)', fontSize:'12px', fontWeight:700, cursor:uploading?'not-allowed':'pointer', opacity:uploading?.6:1 }}>
                          {uploading ? 'Sending…' : `Send ${draftFiles.length} File${draftFiles.length>1?'s':''}`}
                        </button>
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
                        onChange={e => { const f=Array.from(e.target.files??[]).slice(0,5); if(f.length) setDraftFiles(f); e.target.value=''; }} />
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
          {['pending_design','revision_requested'].includes(lo.orderStatus) ? (
            <span style={{ fontSize:'11px', color:'var(--gray)', fontStyle:'italic' }}>Managed via design upload above</span>
          ) : ['awaiting_payment','ready_for_delivery'].includes(lo.orderStatus) ? (
            <span style={{ fontSize:'11px', color:'var(--gray)', fontStyle:'italic' }}>Waiting for customer payment</span>
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
              {!confirmSt ? (
                <button onClick={() => selStatus !== lo.orderStatus && setConfirmSt(true)}
                  disabled={selStatus === lo.orderStatus}
                  style={{ ...S.btnSmGhost, justifyContent:'center', opacity: selStatus===lo.orderStatus?.5:1, cursor: selStatus===lo.orderStatus?'not-allowed':'pointer' }}>
                  Update Status
                </button>
              ) : (
                <div style={{ display:'flex', gap:'6px' }}>
                  <button onClick={handleUpdateStatus} disabled={isUpdating}
                    style={{ flex:1, padding:'6px 0', background:'var(--gold)', border:'none', borderRadius:'6px', color:'var(--dark)', fontSize:'12px', fontWeight:700, cursor:isUpdating?'not-allowed':'pointer' }}>
                    {isUpdating ? 'Updating…' : `→ ${selStatus}`}
                  </button>
                  <button onClick={() => { setConfirmSt(false); setSelStatus(lo.orderStatus); }}
                    style={{ padding:'6px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--gray)', fontSize:'12px', cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
              )}
              {updateErr && <div style={{ fontSize:'11px', color:'#991b1b' }}>{updateErr}</div>}
            </div>
          ) : (
            <span style={{ fontSize:'11px', color:'var(--gray)', fontStyle:'italic' }}>
              {['Cancelled','Returned','Delivered'].includes(lo.orderStatus) ? 'No further updates' : 'No available transitions'}
            </span>
          )}
        </div>

        {/* RIGHT — order items + payment */}
        <div style={{ ...S.card, padding:'14px 16px' }}>
          <SectionLabel>Order</SectionLabel>

          <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'12px', paddingBottom:'12px', borderBottom:'1px solid var(--border)' }}>
            {(Array.isArray(lo.items) && lo.items.length > 0 ? lo.items : []).map((item, i) => {
              const name    = item.productName || item.product_name || '—';
              const variant = item.variantName || item.variant_name || null;
              const unit    = Number(item.unitPrice ?? 0);
              const qty     = Number(item.qty ?? item.quantity ?? 1);
              const line    = Number(item.lineTotal ?? unit * qty);
              return (
                <div key={i} style={{ display:'flex', gap:'10px', alignItems:'flex-start', padding:'8px', background:'var(--dark2)', borderRadius:'6px', border:'1px solid var(--border)' }}>
                  <div style={{ width:'38px', height:'38px', borderRadius:'6px', background:item.thumbnail?'transparent':'#e9ecef', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                    {item.thumbnail
                      ? <img src={item.thumbnail} alt={name} style={{ objectFit:'cover', width:'38px', height:'38px', borderRadius:'6px' }} />
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#adb5bd" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    }
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'var(--white)' }}>{name}</div>
                    {variant && <div style={{ fontSize:'11px', color:'var(--gray)' }}>{variant}</div>}
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
          <InfoRow label="Paid" value={`₱${fmt(lo.downPayment)}`} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'3px 0' }}>
            <span style={{ color:'var(--gray)' }}>Balance</span>
            <span style={{ fontWeight:700, color: Number(lo.balance??0) <= 0 ? '#166534' : '#c2410c' }}>₱{fmt(lo.balance)}</span>
          </div>

          {Array.isArray(lo.paymentHistory) && lo.paymentHistory.length > 0 && (
            <>
              <div style={S.divider} />
              <SectionLabel>Payment History</SectionLabel>
              {lo.paymentHistory.map((p, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', padding:'2px 0' }}>
                  <span style={{ color:'var(--gray)' }}>{p.method}{p.note ? ` — ${p.note}` : ''}</span>
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
  const [dateFilter,   setDateFilter]   = useState('this-month');
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

  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => {
      if (!refreshing && !skipPollRef.current) fetchOrders(true);
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [token, refreshing, fetchOrders]);

  // ── Filter + sort ───────────────────────────────────────────────────────────

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (o.customerName || '').toLowerCase().includes(q) ||
      (o.id || '').toLowerCase().includes(q) ||
      (o.productName || '').toLowerCase().includes(q);

    const matchStatus = statusFilter === 'all' || normalizeStatus(o.orderStatus) === statusFilter;
    const matchPay    = payFilter === 'all' || o.paymentStatus === payFilter;

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

    return matchSearch && matchStatus && matchPay && matchDate;
  }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  // ── Summary counts ──────────────────────────────────────────────────────────

  const countBy = (code) => orders.filter(o => normalizeStatus(o.orderStatus) === code).length;
  const counts = {
    all:          orders.length,
    pending:      countBy('pending'),
    inProduction: countBy('in_production'),
    forDelivery:  countBy('for_delivery'),
    delivered:    countBy('delivered'),
    cancelled:    countBy('cancelled'),
  };

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const fmt = n => Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <div style={S.page}>

        {/* Summary cards — click to filter */}
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'16px' }}>
          {[
            { label:'Total Orders',   value:counts.all,          id:'all'           },
            { label:'Pending',        value:counts.pending,       id:'pending'       },
            { label:'In Production',  value:counts.inProduction,  id:'in_production' },
            { label:'For Delivery',   value:counts.forDelivery,   id:'for_delivery'  },
            { label:'Delivered',      value:counts.delivered,     id:'delivered'     },
            { label:'Cancelled',      value:counts.cancelled,     id:'cancelled'     },
          ].map(c => (
            <div key={c.id} onClick={() => { setStatusFilter(c.id); setPage(1); }}
              style={{ cursor:'pointer', flex:'1', minWidth:'100px' }}>
              <SummaryCard label={c.label} value={c.value}
                accent={statusFilter === c.id}
                color={statusFilter === c.id ? 'var(--gold)' : undefined} />
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
                { value:'today',      label:'Today'        },
                { value:'this-week',  label:'This Week'    },
                { value:'this-month', label:'This Month'   },
                { value:'all-time',   label:'All Time'     },
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
                      <tr style={{ ...S.tr, cursor:'pointer',
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
                          #{String(o.id ?? '').slice(-8).toUpperCase()}
                        </td>
                        <td style={{ ...S.td }}>
                          <TypeBadge isCustom={o.isCustom} />
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
                        </td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          <PayBadge status={o.paymentStatus} />
                        </td>
                        <td style={{ ...S.td, fontSize:'11px', color:'var(--gray)', whiteSpace:'nowrap' }}>
                          {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' }) : '—'}
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
            onPrintJO={o => { setPrintTarget(o); setShowJOQueue(false); }}
          />
        )}

        {printTarget && (
          <PrintJOModal order={printTarget} onClose={() => setPrintTarget(null)} />
        )}

      </div>
    </ErrorBoundary>
  );
}
