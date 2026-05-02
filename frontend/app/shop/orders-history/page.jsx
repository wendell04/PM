'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyShopOrders, fetchMyShopOrder } from '@/lib/orderTrackingApi';
import { StatusBadge, formatDate, formatPeso } from '@/lib/shopUtils';
import { getEcho } from '@/lib/echo';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useCart } from '@/app/shop/layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const TABS = ['All', 'Custom', 'Pending', 'In Production', 'For QC', 'For Delivery', 'Delivered', 'Cancelled'];

const UPLOAD_STEPS = [
  { key: 'pending_review',      label: 'Review',     icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
  { key: 'awaiting_payment',    label: 'Payment',    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
  { key: 'awaiting_production', label: 'Production', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> },
  { key: 'for_qc',              label: 'QC Check',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
  { key: 'shipped',             label: 'Delivery',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
  { key: 'delivered',           label: 'Delivered',  icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> },
];

const REQUEST_STEPS = [
  { key: 'pending_design',      label: 'Design',     icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
  { key: 'proof_sent',          label: 'Proof',      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> },
  { key: 'design_approved',     label: 'Approved',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
  { key: 'awaiting_production', label: 'Production', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> },
  { key: 'for_qc',              label: 'QC Check',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
  { key: 'shipped',             label: 'Delivery',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
  { key: 'delivered',           label: 'Delivered',  icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> },
];

const CUSTOM_STATUS_LABEL = {
  pending_review:      'Under Review',
  awaiting_payment:    'Awaiting Payment',
  pending_design:      'Pending Design',
  proof_sent:          'Proof Sent',
  revision_requested:  'Revision Requested',
  design_approved:     'Design Approved',
  awaiting_production: 'In Queue',
  in_production:       'In Production',
  ready_for_pickup:    'Ready for Pickup',
  shipped:             'Shipped',
  delivered:           'Delivered',
};

const STEP_ICON = {
  placed:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  processing:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 1.9 13.78M4.93 4.93a10 10 0 0 0 0 14.14M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  delivery:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  delivered:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  paid:        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

const COD_TRACK_STEPS = [
  { key: 'Pending',      label: 'Placed',     icon: STEP_ICON.placed },
  { key: 'Processing',   label: 'Processing', icon: STEP_ICON.processing },
  { key: 'For Delivery', label: 'Delivery',   icon: STEP_ICON.delivery },
  { key: 'Delivered',    label: 'Delivered',  icon: STEP_ICON.delivered },
  { key: 'Paid',         label: 'Paid',       icon: STEP_ICON.paid },
];

const ONLINE_TRACK_STEPS = [
  { key: 'Pending',      label: 'Placed',     icon: STEP_ICON.placed },
  { key: 'Processing',   label: 'Processing', icon: STEP_ICON.processing },
  { key: 'For Delivery', label: 'Delivery',   icon: STEP_ICON.delivery },
  { key: 'Delivered',    label: 'Delivered',  icon: STEP_ICON.delivered },
];

const STATUS_ACCENT = {
  'Pending':      '#d4a843',
  'Processing':   '#d4a843',
  'For Delivery': '#d4a843',
  'Delivered':    '#22c55e',
  'Paid':         '#22c55e',
  'Cancelled':    '#ef4444',
  'Returned':     '#ef4444',
};

// ─── OrderTracker ───────────────────────────────────────
function OrderTracker({ status, paymentMethod, paymentStatus, statusHistory = [] }) {
  const historyMap = {};
  (statusHistory || []).forEach(e => { if (e?.status && e?.at) historyMap[e.status] = e.at; });

  const isCOD = (paymentMethod || '').toLowerCase() === 'cod';
  const trackSteps = isCOD ? COD_TRACK_STEPS : ONLINE_TRACK_STEPS;
  const isTerminal = status === 'Cancelled' || status === 'Returned';

  const effectiveStatus = (isCOD && status === 'Delivered' && paymentStatus === 'paid') ? 'Paid' : status;
  const currentIdx = trackSteps.findIndex(s => s.key === effectiveStatus);

  if (isTerminal) {
    const isCancelled = status === 'Cancelled';
    return (
      <div style={{
        padding: '14px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px',
        background: isCancelled ? 'rgba(239,68,68,0.06)' : 'rgba(249,115,22,0.06)',
        border: `1px solid ${isCancelled ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.2)'}`,
      }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isCancelled ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)', color: isCancelled ? 'var(--red)' : '#f97316' }}>
          {isCancelled ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.39"/></svg>
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: isCancelled ? 'var(--red)' : '#f97316' }}>Order {status}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '2px' }}>{isCancelled ? 'This order was cancelled.' : 'This order was returned.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px' }}>
        Order Progress
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {trackSteps.map((step, idx) => {
          const isDone        = idx < currentIdx;
          const isCurrent     = idx === currentIdx;
          const isTerminal    = step.key === 'Paid' || (step.key === 'Delivered' && !isCOD);
          const showCheckmark = isDone || (isCurrent && isTerminal);
          const isGreenStep   = showCheckmark && (step.key === 'Paid' || (step.key === 'Delivered' && !isCOD));
          const stepColor     = isGreenStep ? '#4ade80' : 'var(--gold)';
          const stepBgAlpha   = isGreenStep ? 'rgba(74,222,128,0.15)' : 'rgba(212,168,67,0.15)';
          const stepGlow      = isGreenStep ? 'rgba(74,222,128,0.15)' : 'rgba(212,168,67,0.15)';
          const ts = historyMap[step.key];
          return (
            <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {idx > 0 && (
                <div style={{ position: 'absolute', top: '15px', left: 0, width: '50%', height: '2px', background: idx <= currentIdx ? 'var(--gold)' : 'var(--border)', transition: 'background 0.3s' }} />
              )}
              {idx < trackSteps.length - 1 && (
                <div style={{ position: 'absolute', top: '15px', right: 0, width: '50%', height: '2px', background: idx < currentIdx ? 'var(--gold)' : 'var(--border)', transition: 'background 0.3s' }} />
              )}
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%', zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showCheckmark ? stepBgAlpha : isCurrent ? stepColor : 'rgba(255,255,255,0.04)',
                border: (showCheckmark || isCurrent) ? `2px solid ${stepColor}` : '2px solid var(--border)',
                color: (showCheckmark || isCurrent) ? stepColor : 'var(--gray)',
                boxShadow: isCurrent && !showCheckmark ? `0 0 0 4px ${stepGlow}` : 'none',
                transition: 'all 0.3s', flexShrink: 0,
              }}>
                {showCheckmark ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : step.icon}
              </div>
              <div style={{ marginTop: '7px', textAlign: 'center', lineHeight: 1.3, fontSize: isCurrent ? '0.7rem' : '0.66rem', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? stepColor : isDone ? 'var(--white)' : 'var(--gray)', maxWidth: '60px' }}>
                {step.label}
                {ts && (
                  <div style={{ marginTop: '2px', fontSize: '0.58rem', color: 'var(--gray)', fontWeight: 400 }}>
                    {new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isCOD && status === 'Delivered' && paymentStatus !== 'paid' && (
        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '7px', fontSize: '0.75rem', color: 'var(--gold)' }}>
          COD — pending cash collection before order is marked Paid.
        </div>
      )}
    </div>
  );
}

// ─── CustomOrderTracker ─────────────────────────────────
function CustomOrderTracker({ orderStatus, designType }) {
  const steps = designType === 'upload' ? UPLOAD_STEPS : REQUEST_STEPS;
  const isTerminal = orderStatus === 'Cancelled' || orderStatus === 'Returned';
  const statusLabel = CUSTOM_STATUS_LABEL[orderStatus] || orderStatus;

  function getStepIdx(status) {
    let idx = steps.findIndex(s => s.key === status);
    if (idx === -1) {
      if (status === 'in_production') idx = steps.findIndex(s => s.key === 'awaiting_production');
      else if (status === 'revision_requested') idx = steps.findIndex(s => s.key === 'proof_sent');
      else if (status === 'for_delivery' || status === 'For Delivery') idx = steps.findIndex(s => s.key === 'shipped');
    }
    return idx;
  }
  const currentIdx = getStepIdx(orderStatus);

  const isDelivered = orderStatus === 'delivered' || orderStatus === 'Delivered';

  if (isTerminal) {
    return (
      <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        </div>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--red)' }}>Order {orderStatus}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '2px' }}>This order was {orderStatus.toLowerCase()}.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {designType === 'upload' ? 'Upload Design' : 'Design Request'} Progress
        </div>
        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, background: isDelivered ? 'rgba(34,197,94,0.1)' : 'rgba(212,168,67,0.1)', color: isDelivered ? '#22c55e' : 'var(--gold)', border: `1px solid ${isDelivered ? 'rgba(34,197,94,0.3)' : 'rgba(212,168,67,0.3)'}` }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {steps.map((step, idx) => {
          const isDone    = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isLastDone = isDone && idx === steps.length - 1;
          return (
            <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {idx > 0 && (
                <div style={{ position: 'absolute', top: '12px', left: 0, width: '50%', height: '2px', background: idx <= currentIdx ? 'var(--gold)' : 'var(--border)' }} />
              )}
              {idx < steps.length - 1 && (
                <div style={{ position: 'absolute', top: '12px', right: 0, width: '50%', height: '2px', background: idx < currentIdx ? 'var(--gold)' : 'var(--border)' }} />
              )}
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isCurrent ? (isDelivered && idx === steps.length - 1 ? '#22c55e' : 'var(--gold)') : isDone ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.04)', border: isCurrent || isDone ? '2px solid var(--gold)' : '2px solid var(--border)', boxShadow: isCurrent ? '0 0 0 3px rgba(212,168,67,0.15)' : 'none', flexShrink: 0 }}>
                {isDone
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : isCurrent
                  ? <span style={{ color: '#000', display: 'flex' }}>{step.icon}</span>
                  : <span style={{ color: 'var(--gray)', display: 'flex', opacity: 0.6 }}>{step.icon}</span>
                }
              </div>
              <div style={{ marginTop: '5px', fontSize: isCurrent ? '0.64rem' : '0.6rem', textAlign: 'center', lineHeight: 1.3, maxWidth: '50px', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--gold)' : isDone ? 'var(--white)' : 'var(--gray)' }}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
      {orderStatus === 'awaiting_payment' && (
        <div style={{ marginTop: '14px', padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: '#f59e0b' }}>
          Payment required to move to production. Use the Pay Now button.
        </div>
      )}
      {orderStatus === 'proof_sent' && (
        <div style={{ marginTop: '14px', padding: '10px 14px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--gold)' }}>
          Your design proof is ready. Please review and approve or request changes below.
        </div>
      )}
      {orderStatus === 'revision_requested' && (
        <div style={{ marginTop: '14px', padding: '10px 14px', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: '#f97316' }}>
          Revision submitted — we're working on the updated design and will notify you when ready.
        </div>
      )}
    </div>
  );
}

// ─── PaymentStatusBadge ─────────────────────────────────
function PaymentStatusBadge({ status }) {
  if (!status || status === 'paid') return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600, background: status === 'unpaid' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: status === 'unpaid' ? 'var(--red)' : 'var(--gold)', border: `1px solid ${status === 'unpaid' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'}` }}>
      {status === 'unpaid' ? 'Unpaid' : 'Partial'}
    </span>
  );
}

// ─── SkeletonCard ───────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: 'var(--dark2)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', animation: 'pulse 1.5s ease-in-out infinite', display: 'flex' }}>
      <div style={{ width: '3px', background: 'var(--border)' }} />
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ height: '13px', width: '110px', background: 'var(--border)', borderRadius: '4px' }} />
          <div style={{ height: '22px', width: '80px', background: 'var(--border)', borderRadius: '999px' }} />
        </div>
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ height: '12px', width: '55%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
          <div style={{ height: '14px', width: '20%', background: 'rgba(212,168,67,0.1)', borderRadius: '4px' }} />
        </div>
      </div>
    </div>
  );
}

function apiHeaders(token) {
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (process.env.NODE_ENV === 'development') h['ngrok-skip-browser-warning'] = '1';
  return h;
}
function fmtPHPhone(d) {
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0,3)+' '+d.slice(3);
  return d.slice(0,3)+' '+d.slice(3,6)+' '+d.slice(6);
}
function fmtCardNum(v) { return v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim(); }
function fmtExpiry(v) { const d=v.replace(/\D/g,'').slice(0,4); return d.length>=3?d.slice(0,2)+'/'+d.slice(2):d; }
function cardBrand(num) {
  const n=num.replace(/\s/g,'');
  if(/^4/.test(n)) return 'VISA';
  if(/^5[1-5]/.test(n)||/^2[2-7]/.test(n)) return 'MC';
  return null;
}

// ─── Main Page ──────────────────────────────────────────
export default function OrdersHistoryPage() {
  const { token, currentUser } = useAuth();
  const { addToCart } = useCart();
  const router = useRouter();

  const [orders, setOrders]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [activeTab, setActiveTab]       = useState('All');
  const [visibleCount, setVisibleCount] = useState(5);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState(null);
  const [modalOpen, setModalOpen]         = useState(false);

  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderMsg, setReorderMsg]         = useState('');

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState(null);

  const [payNowLoading, setPayNowLoading] = useState(false);
  const [payNowError, setPayNowError]     = useState(null);
  const [payMethod, setPayMethod]         = useState(null);
  const [payFullToggle, setPayFullToggle] = useState(false);
  const [payNowEWalletPhone, setPayNowEWalletPhone]       = useState('');
  const [payNowShowEWalletPhone, setPayNowShowEWalletPhone] = useState(false);
  const [payNowCardNumber, setPayNowCardNumber] = useState('');
  const [payNowCardExpiry, setPayNowCardExpiry] = useState('');
  const [payNowCardCvc, setPayNowCardCvc]       = useState('');
  const [payNowCardName, setPayNowCardName]     = useState('');
  const [payNowFailedModal, setPayNowFailedModal] = useState(false);
  const [payNowVerifying, setPayNowVerifying]     = useState(false);
  const [payNowVerifyId, setPayNowVerifyId]       = useState(null);

  const [showReupload, setShowReupload]       = useState(false);
  const [reuploadFile, setReuploadFile]       = useState(null);
  const [reuploadNotes, setReuploadNotes]     = useState('');
  const [reuploadLoading, setReuploadLoading] = useState(false);
  const [reuploadError, setReuploadError]     = useState(null);
  const [reuploadSuccess, setReuploadSuccess] = useState(false);

  const [approveDesignLoading, setApproveDesignLoading] = useState(false);
  const [approveDesignError, setApproveDesignError]     = useState(null);
  const [showRevisionForm, setShowRevisionForm]         = useState(false);
  const [revisionNotes, setRevisionNotes]               = useState('');
  const [revisionLoading, setRevisionLoading]           = useState(false);
  const [revisionError, setRevisionError]               = useState(null);
  const [revisionSuccess, setRevisionSuccess]           = useState(false);

  const [existingReview, setExistingReview]         = useState(null);
  const [reviewCheckLoading, setReviewCheckLoading] = useState(false);
  const [reviewRating, setReviewRating]             = useState(0);
  const [reviewComment, setReviewComment]           = useState('');
  const [reviewSubmitting, setReviewSubmitting]     = useState(false);
  const [reviewError, setReviewError]               = useState(null);
  const [reviewSuccess, setReviewSuccess]           = useState(false);

  const loadOrders = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const data = await fetchMyShopOrders(token);
      setOrders(Array.isArray(data) ? data : []);
      setVisibleCount(5);
    } catch (err) {
      if (err.message === 'Unauthorized') { router.push('/shop'); return; }
      setError(err.message || 'Failed to load orders.');
    } finally { setLoading(false); }
  }, [token, router]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const pollRef = useRef(null);
  const echoChannelsRef = useRef([]);

  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => { if (!modalOpen) loadOrders(); }, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, modalOpen, loadOrders]);

  useEffect(() => {
    if (!token || orders.length === 0) return;
    echoChannelsRef.current.forEach(ch => { try { ch.stopListening('.order.status.updated'); } catch {} });
    echoChannelsRef.current = [];
    let echo;
    try { echo = getEcho(token); } catch { return; }
    if (!echo) return;
    orders.forEach(order => {
      const id = order._id ?? order.id;
      if (!id) return;
      try {
        const ch = echo.private(`order.${id}`).listen('.order.status.updated', () => { loadOrders(); });
        echoChannelsRef.current.push(ch);
      } catch {}
    });
    return () => {
      echoChannelsRef.current.forEach(ch => { try { ch.stopListening('.order.status.updated'); } catch {} });
      echoChannelsRef.current = [];
    };
  }, [token, orders, loadOrders]);

  useEffect(() => {
    return () => {
      echoChannelsRef.current.forEach(ch => { try { ch.stopListening('.order.status.updated'); } catch {} });
      echoChannelsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_cancelled') === '1') {
      router.replace('/shop/orders-history', { scroll: false });
      const pendingId = sessionStorage.getItem('pending_paynow_order_id');
      if (pendingId) {
        sessionStorage.removeItem('pending_paynow_order_id');
        setPayNowFailedModal(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!payNowVerifyId || !token) return;
    let cancelled = false;
    let attempt = 0;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${payNowVerifyId}`, { headers: apiHeaders(token) }, 10000);
        const data = await res.json();
        const order = data.data ?? data;
        if (order.paymentStatus === 'paid' || order.paymentStatus === 'partial') {
          if (!cancelled) { setPayNowVerifying(false); loadOrders(); }
        } else if (attempt < 5) {
          attempt++;
          setTimeout(poll, 2000);
        } else {
          if (!cancelled) { setPayNowVerifying(false); setPayNowFailedModal(true); }
        }
      } catch {
        if (!cancelled) { setPayNowVerifying(false); setPayNowFailedModal(true); }
      }
    };
    poll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payNowVerifyId, token]);

  const resetModalState = () => {
    setPayNowError(null); setPayMethod(null); setPayFullToggle(false);
    setPayNowEWalletPhone(''); setPayNowShowEWalletPhone(false);
    setPayNowCardNumber(''); setPayNowCardExpiry(''); setPayNowCardCvc(''); setPayNowCardName('');
    setShowReupload(false); setReuploadFile(null); setReuploadNotes(''); setReuploadError(null); setReuploadSuccess(false);
    setApproveDesignLoading(false); setApproveDesignError(null);
    setShowRevisionForm(false); setRevisionNotes(''); setRevisionLoading(false); setRevisionError(null); setRevisionSuccess(false);
    setReorderMsg('');
    setExistingReview(null); setReviewCheckLoading(false); setReviewRating(0); setReviewComment(''); setReviewSubmitting(false); setReviewError(null); setReviewSuccess(false);
  };

  const loadOrderReview = useCallback(async (orderId) => {
    setReviewCheckLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${orderId}/review`, { headers: apiHeaders(token) }, 10000);
      const data = await res.json();
      if (res.ok && data.data) setExistingReview(data.data);
    } catch {} finally { setReviewCheckLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openDetail = useCallback(async (order) => {
    resetModalState();
    setSelectedOrder(order); setDetailError(null); setDetailLoading(true); setModalOpen(true);
    try {
      const data = await fetchMyShopOrder(token, order.id ?? order._id);
      const detail = data?.data ?? data;
      setSelectedOrder(detail);
      if (detail?.orderStatus === 'Delivered' && detail?.paymentStatus === 'paid') loadOrderReview(detail._id ?? detail.id ?? order._id ?? order.id);
    } catch (err) {
      setDetailError(err.message || 'Failed to load order details.');
    } finally { setDetailLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const closeModal = () => { setModalOpen(false); setSelectedOrder(null); setDetailError(null); resetModalState(); };

  const cancelOrder = async () => {
    if (!cancelTarget || !token) return;
    setCancelling(true); setCancelError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${cancelTarget._id ?? cancelTarget.id}/cancel`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' } }, 15000);
      const data = await res.json();
      if (!res.ok) { setCancelError(data.message || 'Failed to cancel order.'); return; }
      setCancelTarget(null); loadOrders();
    } catch (err) { setCancelError(err.message || 'Failed to cancel order.'); }
    finally { setCancelling(false); }
  };

  const handleReorder = async () => {
    if (!selectedOrder?.items?.length) return;
    setReorderLoading(true); setReorderMsg('');
    try {
      for (const item of selectedOrder.items) {
        addToCart(
          { _id: item.productId, name: item.productName, price: item.unitPrice, flatPrice: item.unitPrice },
          item.qty ?? 1, item.variantId ?? null, item.variantName ?? null,
        );
      }
      setReorderMsg('Items added to cart!');
      setTimeout(() => setReorderMsg(''), 3000);
    } catch { setReorderMsg('Failed to add items to cart.'); }
    finally { setReorderLoading(false); }
  };

  const handlePayNow = async () => {
    if (!selectedOrder || !token || !payMethod) return;
    if (payMethod === 'card') {
      const num = payNowCardNumber.replace(/\s/g,'');
      if (num.length < 16) { setPayNowError('Enter a valid 16-digit card number.'); return; }
      if (!payNowCardExpiry || payNowCardExpiry.length < 4) { setPayNowError('Enter a valid expiry date (MM/YY).'); return; }
      if (payNowCardCvc.length < 3) { setPayNowError('Enter a valid security code.'); return; }
      if (!payNowCardName.trim()) { setPayNowError('Enter the name on your card.'); return; }
    }
    setPayNowLoading(true); setPayNowError(null);
    try {
      let paymentMethodId = null;
      if (payMethod === 'card') {
        const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
        const [expMonth, expYear] = payNowCardExpiry.split('/');
        const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(publicKey+':')}` },
          body: JSON.stringify({ data: { attributes: { type: 'card', details: { card_number: payNowCardNumber.replace(/\s/g,''), exp_month: parseInt(expMonth), exp_year: parseInt('20'+expYear), cvc: payNowCardCvc }, billing: { name: payNowCardName.trim() || currentUser?.name || '', email: currentUser?.email || '', phone: '' } } } }),
        });
        const pmData = await pmRes.json();
        if (!pmRes.ok) {
          const detail = pmData.errors?.[0]?.detail ?? '';
          if (detail.includes('card_number')) throw new Error('Card number is invalid.');
          if (detail.includes('exp_month')||detail.includes('exp_year')) throw new Error('Expiry date is invalid.');
          if (detail.includes('cvc')) throw new Error('Security code is invalid.');
          throw new Error('Invalid card details. Please check and try again.');
        }
        paymentMethodId = pmData.data.id;
      }
      const orderId = selectedOrder._id ?? selectedOrder.id;
      const res = await fetchWithTimeout(`${API_URL}/api/payment/create-order-pay-link`, {
        method: 'POST',
        headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          paymentMethod: payMethod,
          payFull: payFullToggle,
          ...((['gcash','paymaya'].includes(payMethod) && payNowEWalletPhone.trim()) ? { eWalletPhone: `+63${payNowEWalletPhone.trim()}` } : {}),
          ...(payMethod === 'card' && paymentMethodId ? { paymentMethodId } : {}),
        }),
      }, 15000);
      const data = await res.json();
      if (!res.ok) { setPayNowError(data.message || 'Failed to create payment link.'); return; }
      if (data.data?.status === 'succeeded') {
        loadOrders();
        return;
      }
      if (data.data?.checkoutUrl) {
        sessionStorage.setItem('pending_paynow_order_id', orderId);
        window.location.href = data.data.checkoutUrl;
      }
    } catch (err) { setPayNowError(err.message || 'Failed to create payment link.'); }
    finally { setPayNowLoading(false); }
  };

  const handleReupload = async () => {
    if (!selectedOrder || !token) return;
    if (!reuploadFile && !reuploadNotes.trim()) return;
    setReuploadLoading(true); setReuploadError(null);
    try {
      const fd = new FormData();
      if (reuploadFile) fd.append('design_file', reuploadFile);
      if (reuploadNotes.trim()) fd.append('design_notes', reuploadNotes.trim());
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/reupload-design`, { method: 'POST', headers: apiHeaders(token), body: fd }, 20000);
      const data = await res.json();
      if (!res.ok) { setReuploadError(data.message || 'Failed to submit design.'); return; }
      setReuploadSuccess(true); setShowReupload(false); setReuploadFile(null); setReuploadNotes('');
      const oid = selectedOrder._id ?? selectedOrder.id;
      setSelectedOrder(prev => ({ ...prev, designStatus: 'pending_review', designRejectionReason: null }));
      setOrders(prev => prev.map(o => (o._id ?? o.id) === oid ? { ...o, designStatus: 'pending_review' } : o));
      setTimeout(() => setReuploadSuccess(false), 5000);
    } catch (err) { setReuploadError(err.message || 'Failed to submit design.'); }
    finally { setReuploadLoading(false); }
  };

  const handleApproveAdminDesign = async () => {
    if (!selectedOrder || !token) return;
    setApproveDesignLoading(true); setApproveDesignError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/approve-admin-design`, { method: 'POST', headers: apiHeaders(token) }, 15000);
      const data = await res.json();
      if (!res.ok) { setApproveDesignError(data.message || 'Failed to approve design.'); return; }
      const oid = selectedOrder._id ?? selectedOrder.id;
      setSelectedOrder(prev => ({ ...prev, designStatus: 'approved', orderStatus: 'design_approved' }));
      setOrders(prev => prev.map(o => (o._id ?? o.id) === oid ? { ...o, designStatus: 'approved', orderStatus: 'design_approved' } : o));
    } catch (err) { setApproveDesignError(err.message || 'Failed to approve design.'); }
    finally { setApproveDesignLoading(false); }
  };

  const handleRequestRevision = async () => {
    if (!selectedOrder || !token) return;
    setRevisionLoading(true); setRevisionError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/request-revision`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: revisionNotes.trim() || null }) }, 15000);
      const data = await res.json();
      if (!res.ok) { setRevisionError(data.message || 'Failed to submit revision request.'); return; }
      const oid = selectedOrder._id ?? selectedOrder.id;
      setSelectedOrder(prev => ({ ...prev, designStatus: 'revision_requested' }));
      setOrders(prev => prev.map(o => (o._id ?? o.id) === oid ? { ...o, designStatus: 'revision_requested' } : o));
      setRevisionSuccess(true); setShowRevisionForm(false); setRevisionNotes('');
    } catch (err) { setRevisionError(err.message || 'Failed to submit revision request.'); }
    finally { setRevisionLoading(false); }
  };

  const handleSubmitReview = async () => {
    if (!selectedOrder || !token || reviewRating === 0 || reviewComment.trim().length < 5) return;
    setReviewSubmitting(true); setReviewError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/review`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: reviewRating, comment: reviewComment }) }, 15000);
      const data = await res.json();
      if (!res.ok) { setReviewError(data.message || 'Failed to submit review.'); return; }
      setExistingReview(data.data); setReviewSuccess(true);
    } catch (err) { setReviewError(err.message || 'Failed to submit review.'); }
    finally { setReviewSubmitting(false); }
  };

  const isStaleUnpaidOnline = (o) => {
    if (o.paymentStatus !== 'unpaid') return false;
    if ((o.paymentMethod || '').toLowerCase() === 'cod') return false;
    const age = Date.now() - new Date(o.createdAt).getTime();
    return age < 30 * 60 * 1000; // hide if < 30 min old and still unpaid online
  };

  const visibleOrders = orders.filter(o => !isStaleUnpaidOnline(o));

  const filteredOrders = (() => {
    if (activeTab === 'All') return visibleOrders;
    if (activeTab === 'Custom') return visibleOrders.filter(o => o.isCustomOrder);
    if (activeTab === 'Delivered') return visibleOrders.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'delivered');
    return visibleOrders.filter(o => o.orderStatus === activeTab);
  })();

  // ── Render ──────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--dark)' }}>

      {/* Sticky breadcrumb nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--border)', background: 'rgba(12,12,12,0.92)', backdropFilter: 'blur(14px)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 16px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
            <Link href="/shop/profile" style={{ color: 'var(--gray)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--gray)'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Account
            </Link>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            <span style={{ color: 'var(--white)', fontWeight: 600 }}>My Orders</span>
          </div>
          <Link href="/shop" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--gold)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(212,168,67,0.25)', background: 'rgba(212,168,67,0.06)', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,67,0.12)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,168,67,0.06)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.25)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            Browse Shop
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 16px 48px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.3px' }}>My Orders</h1>
          <p style={{ margin: '5px 0 0', fontSize: '0.875rem', color: 'var(--gray)' }}>Track and manage your regular and custom orders</p>
        </div>

        {/* Filter tabs */}
        {!loading && !error && orders.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {TABS.map(tab => {
              const count = tab === 'All' ? visibleOrders.length
                : tab === 'Custom' ? visibleOrders.filter(o => o.isCustomOrder).length
                : tab === 'Delivered' ? visibleOrders.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'delivered').length
                : visibleOrders.filter(o => o.orderStatus === tab).length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setVisibleCount(5); }}
                  style={{ flexShrink: 0, padding: '6px 14px', borderRadius: '999px', border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`, background: isActive ? 'rgba(212,168,67,0.1)' : 'transparent', color: isActive ? 'var(--gold)' : 'var(--gray)', fontSize: '0.8rem', fontWeight: isActive ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                >
                  {tab}
                  {count > 0 && (
                    <span style={{ padding: '1px 6px', borderRadius: '999px', background: isActive ? 'var(--gold)' : 'rgba(255,255,255,0.08)', color: isActive ? '#000' : 'var(--gray)', fontSize: '0.65rem', fontWeight: 700, minWidth: '18px', textAlign: 'center', lineHeight: 1.6 }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1,2,3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ padding: '16px 20px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '0.875rem' }}>{error}</span>
            <button onClick={loadOrders} style={{ background: 'none', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '5px 14px', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}>Retry</button>
          </div>
        )}

        {/* No orders at all */}
        {!loading && !error && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '5rem 1.5rem', border: '1px dashed rgba(212,168,67,0.15)', borderRadius: '16px', background: 'rgba(212,168,67,0.02)' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 20px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,67,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)', marginBottom: '8px' }}>No orders yet</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '24px', lineHeight: 1.6 }}>Your purchase history will appear here once you place an order.</div>
            <Link href="/shop" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '8px', background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}>
              Start Shopping
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
        )}

        {/* Empty tab */}
        {!loading && !error && orders.length > 0 && filteredOrders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--gray)', fontSize: '0.875rem' }}>
            No {activeTab.toLowerCase()} orders found.
          </div>
        )}

        {/* Order list */}
        {!loading && !error && filteredOrders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredOrders.slice(0, visibleCount).map(order => {
              const oid = order.id ?? order._id;
              const rawItems = order.items || [];
              const items = Array.isArray(rawItems) ? rawItems : (typeof rawItems === 'string' ? (() => { try { return JSON.parse(rawItems); } catch { return []; } })() : []);
              const firstName = (items[0]?.productName || items[0]?.product_name || 'Order') + (items[0]?.variantName ? ` — ${items[0].variantName}` : '');
              const itemSummary = items.length > 1 ? `${firstName} +${items.length - 1} more` : firstName;
              const accent = STATUS_ACCENT[order.orderStatus] || 'var(--border)';

              return (
                <div
                  key={oid}
                  onClick={() => openDetail(order)}
                  style={{ background: 'var(--dark2)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s', display: 'flex' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: '3px', flexShrink: 0, background: accent, opacity: 0.75 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                            #{oid?.slice(-8).toUpperCase()}
                          </span>
                          {order.isCustomOrder && (
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'rgba(212,168,67,0.08)', color: 'var(--gold)', border: '1px solid rgba(212,168,67,0.2)', letterSpacing: '0.3px' }}>
                              CUSTOM
                            </span>
                          )}
                          {order.isCustomOrder && order.designType && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                              {order.designType === 'upload' ? 'Upload Design' : 'Design Request'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--gray)', marginTop: '3px' }}>{formatDate(order.createdAt)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <PaymentStatusBadge status={order.paymentStatus} />
                        <StatusBadge status={order.orderStatus} />
                      </div>
                    </div>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)', marginLeft: '16px' }} />
                    <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        {itemSummary}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        {order.orderStatus === 'awaiting_payment' && (
                          <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700, whiteSpace: 'nowrap' }}>Payment needed ›</span>
                        )}
                        {order.orderStatus === 'proof_sent' && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700, whiteSpace: 'nowrap' }}>Review proof ›</span>
                        )}
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gold)' }}>{formatPeso(order.totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredOrders.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 5)}
                style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', width: '100%', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; e.currentTarget.style.color = 'var(--gold)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--gray)'; }}
              >
                Show {Math.min(5, filteredOrders.length - visibleCount)} more · {filteredOrders.length - visibleCount} remaining
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Detail Modal ─────────────────────────────── */}
      {modalOpen && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '820px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: '4px' }}>Order Details</div>
                {selectedOrder && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--white)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                      #{(selectedOrder.id ?? selectedOrder._id)?.slice(-8).toUpperCase()}
                    </span>
                    {selectedOrder.isCustomOrder && (
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(212,168,67,0.08)', color: 'var(--gold)', border: '1px solid rgba(212,168,67,0.2)' }}>
                        CUSTOM · {selectedOrder.designType === 'upload' ? 'UPLOAD DESIGN' : 'DESIGN REQUEST'}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={closeModal}
                style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--gray)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--gray)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

              {detailLoading && (
                <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', animation: 'pulse 1.5s ease-in-out infinite' }}>
                  {[60, 90, 50, 80, 40].map((w, i) => (
                    <div key={i} style={{ height: i === 3 ? '72px' : '13px', background: 'var(--border)', borderRadius: i === 3 ? '8px' : '4px', width: `${w}%` }} />
                  ))}
                </div>
              )}

              {!detailLoading && detailError && (
                <div style={{ flex: 1, padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--red)', fontSize: '0.9rem', marginBottom: '12px' }}>{detailError}</div>
                    <button onClick={() => selectedOrder && openDetail(selectedOrder)} style={{ background: 'none', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '6px 16px', fontSize: '0.8rem', cursor: 'pointer' }}>Retry</button>
                  </div>
                </div>
              )}

              {!detailLoading && !detailError && selectedOrder && (
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

                  {/* LEFT column */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

                    {/* Tracker */}
                    <div style={{ padding: '18px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {selectedOrder.isCustomOrder ? (
                        <CustomOrderTracker orderStatus={selectedOrder.orderStatus} designType={selectedOrder.designType} />
                      ) : (
                        <OrderTracker status={selectedOrder.orderStatus} paymentMethod={selectedOrder.paymentMethod} paymentStatus={selectedOrder.paymentStatus} statusHistory={selectedOrder.statusHistory} />
                      )}
                    </div>

                    {/* Order Info */}
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Order Info</div>
                      <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        {[
                          ['Placed', formatDate(selectedOrder.createdAt)],
                          selectedOrder.paymentMethod
                            ? ['Method', { cod: 'Cash on Delivery', gcash: 'GCash', paymaya: 'Maya', card: 'Credit / Debit Card' }[selectedOrder.paymentMethod] ?? selectedOrder.paymentMethod]
                            : null,
                          ['Status', <StatusBadge key="s" status={selectedOrder.orderStatus} />],
                          ['Payment', selectedOrder.paymentStatus === 'paid'
                            ? <span key="p" style={{ fontSize: '0.8rem', color: 'var(--green)', fontWeight: 600 }}>Paid</span>
                            : selectedOrder.designFeePaid && selectedOrder.paymentStatus !== 'paid'
                            ? <span key="p" style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>Design Fee Paid · Order Unpaid</span>
                            : <PaymentStatusBadge key="p" status={selectedOrder.paymentStatus} />
                          ],
                          selectedOrder.designStatus
                            ? ['Design', <span key="d" style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600, background: selectedOrder.designStatus === 'approved' ? 'var(--gold)' : selectedOrder.designStatus === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: selectedOrder.designStatus === 'approved' ? 'var(--black)' : selectedOrder.designStatus === 'rejected' ? 'var(--red)' : 'var(--gold)' }}>
                                {selectedOrder.designStatus === 'pending_review' ? 'Under Review' : selectedOrder.designStatus === 'approved' ? 'Approved' : selectedOrder.designStatus === 'rejected' ? 'Rejected' : selectedOrder.designStatus === 'draft_ready' ? 'Draft Ready' : selectedOrder.designStatus === 'revision_requested' ? 'Revision Requested' : selectedOrder.designStatus}
                              </span>]
                            : null,
                        ].filter(Boolean).map(([label, value], i, arr) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{label}</span>
                            {typeof value === 'string'
                              ? <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600 }}>{value}</span>
                              : value
                            }
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Design rejection + re-upload */}
                    {selectedOrder.designStatus === 'rejected' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {selectedOrder.designRejectionReason && (
                          <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--gray)' }}>
                            <strong style={{ color: 'var(--red)' }}>Rejection reason: </strong>{selectedOrder.designRejectionReason}
                          </div>
                        )}
                        {reuploadSuccess && (
                          <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--green)' }}>
                            Design resubmitted. We'll review it shortly.
                          </div>
                        )}
                        {!showReupload ? (
                          <button onClick={() => setShowReupload(true)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid rgba(212,168,67,0.3)', background: 'rgba(212,168,67,0.06)', color: 'var(--gold)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                            Re-upload Design
                          </button>
                        ) : (
                          <div style={{ padding: '14px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', fontWeight: 600 }}>Re-upload Design</div>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '6px' }}>File (JPG, PNG, PDF, AI, PSD, SVG — max 10MB)</div>
                              <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.ai,.psd,.svg" onChange={e => setReuploadFile(e.target.files?.[0] || null)} style={{ fontSize: '0.8rem', color: 'var(--white)', width: '100%' }} />
                            </div>
                            <textarea placeholder="Updated design notes (optional)" value={reuploadNotes} onChange={e => setReuploadNotes(e.target.value)} maxLength={2000} rows={3} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.8rem', padding: '8px 12px', resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                            {reuploadError && <div style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{reuploadError}</div>}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={handleReupload} disabled={reuploadLoading || (!reuploadFile && !reuploadNotes.trim())} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: (reuploadLoading || (!reuploadFile && !reuploadNotes.trim())) ? 'var(--border)' : 'var(--gold)', color: '#000', fontSize: '0.8rem', fontWeight: 700, cursor: (reuploadLoading || (!reuploadFile && !reuploadNotes.trim())) ? 'not-allowed' : 'pointer' }}>
                                {reuploadLoading ? 'Submitting...' : 'Submit for Review'}
                              </button>
                              <button onClick={() => { setShowReupload(false); setReuploadFile(null); setReuploadNotes(''); setReuploadError(null); }} disabled={reuploadLoading} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.8rem', cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Admin design draft */}
                    {selectedOrder.adminDesignUrl && (
                      <div style={{ padding: '14px', background: 'rgba(212,168,67,0.03)', border: '1px solid rgba(212,168,67,0.15)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }}>Your Design Draft</div>
                        {selectedOrder.designStatus === 'approved' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600 }}>Design approved — we'll proceed once payment is confirmed.</span>
                            {(selectedOrder.adminDesignUrls ?? [selectedOrder.adminDesignUrl]).filter(Boolean).map((url, i, arr) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                {arr.length > 1 ? `File ${i + 1}` : 'View Design'}
                              </a>
                            ))}
                          </div>
                        ) : selectedOrder.designStatus === 'revision_requested' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>↩ Revision requested — we'll update the design and notify you.</span>
                            {(selectedOrder.adminDesignUrls ?? [selectedOrder.adminDesignUrl]).filter(Boolean).map((url, i, arr) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--gray)', fontWeight: 600, textDecoration: 'none' }}>
                                {arr.length > 1 ? `View File ${i + 1}` : 'View current draft'}
                              </a>
                            ))}
                            {revisionSuccess && <div style={{ fontSize: '0.75rem', color: 'var(--green)' }}>✓ Revision request sent.</div>}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Your design draft is ready. Please review and let us know if it looks good.</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {(selectedOrder.adminDesignUrls ?? [selectedOrder.adminDesignUrl]).filter(Boolean).map((url, i, arr) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                  {arr.length > 1 ? `View File ${i + 1}` : 'View Design Draft'}
                                </a>
                              ))}
                            </div>
                            {approveDesignError && <div style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{approveDesignError}</div>}
                            {!showRevisionForm ? (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleApproveAdminDesign} disabled={approveDesignLoading} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: approveDesignLoading ? 'var(--border)' : 'var(--gold)', color: approveDesignLoading ? 'var(--gray)' : '#000', fontSize: '0.8rem', fontWeight: 700, cursor: approveDesignLoading ? 'not-allowed' : 'pointer' }}>
                                  {approveDesignLoading ? 'Approving...' : 'Approve Design'}
                                </button>
                                <button onClick={() => setShowRevisionForm(true)} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                                  ↩ Request Changes
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <textarea placeholder="Describe what you'd like changed..." value={revisionNotes} onChange={e => setRevisionNotes(e.target.value)} rows={3} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.8rem', padding: '8px 12px', resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                                {revisionError && <div style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{revisionError}</div>}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={handleRequestRevision} disabled={revisionLoading} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: revisionLoading ? 'var(--border)' : 'var(--gold)', color: '#000', fontSize: '0.8rem', fontWeight: 700, cursor: revisionLoading ? 'not-allowed' : 'pointer' }}>
                                    {revisionLoading ? 'Sending...' : 'Send Revision Request'}
                                  </button>
                                  <button onClick={() => { setShowRevisionForm(false); setRevisionNotes(''); setRevisionError(null); }} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delivery Address */}
                    {selectedOrder.deliveryAddress && Object.keys(selectedOrder.deliveryAddress).length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Delivery Address</div>
                        <div style={{ padding: '12px 14px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.875rem', color: 'var(--white)', lineHeight: 1.6 }}>
                          {[selectedOrder.deliveryAddress.house_number, selectedOrder.deliveryAddress.street, selectedOrder.deliveryAddress.subdivision, selectedOrder.deliveryAddress.barangay, selectedOrder.deliveryAddress.city, selectedOrder.deliveryAddress.province, selectedOrder.deliveryAddress.zip].filter(Boolean).join(', ')}
                          {selectedOrder.deliveryAddress.phone && <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--gray)' }}>{selectedOrder.deliveryAddress.phone}</div>}
                        </div>
                      </div>
                    )}

                    {/* Shipment */}
                    {(selectedOrder.courierName || selectedOrder.trackingNumber) && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Shipment</div>
                        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                          {selectedOrder.courierName && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: selectedOrder.trackingNumber ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Courier</span>
                              <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600 }}>{selectedOrder.courierName}</span>
                            </div>
                          )}
                          {selectedOrder.trackingNumber && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Tracking #</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600 }}>{selectedOrder.trackingNumber}</span>
                                <button onClick={() => navigator.clipboard?.writeText(selectedOrder.trackingNumber)} title="Copy" style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Production */}
                    {selectedOrder.joId && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Production</div>
                        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: (selectedOrder.joStatus || selectedOrder.targetCompletion) ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Job Order</span>
                            <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600 }}>{selectedOrder.joId}</span>
                          </div>
                          {selectedOrder.joStatus && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: selectedOrder.targetCompletion ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Status</span>
                              <StatusBadge status={selectedOrder.joStatus} />
                            </div>
                          )}
                          {selectedOrder.targetCompletion && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Target</span>
                              <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600 }}>{formatDate(selectedOrder.targetCompletion)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Review — only after payment confirmed */}
                    {selectedOrder.orderStatus === 'Delivered' && selectedOrder.paymentStatus === 'paid' && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Your Review</div>
                        {reviewCheckLoading && (
                          <div style={{ height: '60px', background: 'var(--border)', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        )}
                        {!reviewCheckLoading && existingReview && (
                          <div style={{ padding: '14px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              {[1,2,3,4,5].map(s => (
                                <svg key={s} width="16" height="16" viewBox="0 0 24 24" fill={s <= existingReview.rating ? 'var(--gold)' : 'none'} stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                              ))}
                              <span style={{ marginLeft: '4px', fontSize: '0.75rem', color: 'var(--gray)' }}>{existingReview.rating}/5</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--white)', lineHeight: 1.6 }}>{existingReview.comment}</p>
                            <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{formatDate(existingReview.created_at)}</div>
                          </div>
                        )}
                        {!reviewCheckLoading && !existingReview && (
                          <div style={{ padding: '14px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {reviewSuccess ? (
                              <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', fontSize: '0.875rem', color: 'var(--green)' }}>
                                Thank you for your review!
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Rate your experience with this order</div>
                                <div style={{ display: 'flex', gap: '3px' }}>
                                  {[1,2,3,4,5].map(s => (
                                    <button key={s} onClick={() => setReviewRating(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                                      <svg width="26" height="26" viewBox="0 0 24 24" fill={s <= reviewRating ? 'var(--gold)' : 'none'} stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'fill 0.1s' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                    </button>
                                  ))}
                                </div>
                                <textarea placeholder="Share your experience... (min. 5 characters)" value={reviewComment} onChange={e => setReviewComment(e.target.value)} maxLength={2000} rows={3} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.8rem', padding: '8px 12px', resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                                {reviewError && <div style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{reviewError}</div>}
                                <button onClick={handleSubmitReview} disabled={reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5} style={{ padding: '9px', borderRadius: '8px', border: 'none', background: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5) ? 'var(--border)' : 'var(--gold)', color: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5) ? 'var(--gray)' : '#000', fontSize: '0.875rem', fontWeight: 700, cursor: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5) ? 'not-allowed' : 'pointer' }}>
                                  {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* RIGHT column */}
                  <div style={{ width: '265px', flexShrink: 0, overflowY: 'auto', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

                    {/* Items */}
                    {selectedOrder.items?.length > 0 && (
                      <div style={{ padding: '18px 18px 14px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px' }}>
                          {selectedOrder.items.length} {selectedOrder.items.length === 1 ? 'Item' : 'Items'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {selectedOrder.items.map((item, i) => {
                            const qty       = item.qty || item.quantity || 1;
                            const unitPrice = item.unitPrice ?? item.price ?? 0;
                            const lineTotal = item.lineTotal ?? (unitPrice * qty);
                            const initial   = (item.productName || 'P')[0].toUpperCase();
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                    {(item.thumbnail || item.imageUrl)
                                      ? <img src={item.thumbnail || item.imageUrl} alt={item.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      : <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold)', opacity: 0.5 }}>{initial}</span>
                                    }
                                  </div>
                                  <div style={{ position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--dark2)', border: '1.5px solid var(--border)', color: 'var(--white)', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {qty}
                                  </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.productName || item.product_name || 'Product'}
                                  </div>
                                  {item.variantName && <div style={{ fontSize: '0.7rem', color: 'var(--gold)', marginTop: '2px' }}>{item.variantName}</div>}
                                  {item.category && <div style={{ fontSize: '0.68rem', color: 'var(--gray)' }}>{item.category}</div>}
                                </div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--white)', flexShrink: 0 }}>{formatPeso(lineTotal)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Pricing */}
                    <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {selectedOrder.subtotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Subtotal</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--white)' }}>{formatPeso(selectedOrder.subtotal)}</span>
                        </div>
                      )}
                      {selectedOrder.shippingFee > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Shipping</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--white)' }}>{formatPeso(selectedOrder.shippingFee)}</span>
                        </div>
                      )}
                      {selectedOrder.discountAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Discount</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>-{formatPeso(selectedOrder.discountAmount)}</span>
                        </div>
                      )}
                      {selectedOrder.designFeePaid && (() => {
                        const df = (selectedOrder.items ?? []).reduce((s, i) => s + (parseFloat(i.designFee) || 0), 0);
                        return df > 0 ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Design Fee <span style={{ color: '#f59e0b', fontSize: '0.68rem', fontWeight: 700 }}>✓ Paid</span></span>
                            <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>{formatPeso(df)}</span>
                          </div>
                        ) : null;
                      })()}
                      {selectedOrder.downPayment > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Down Payment</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--white)' }}>{formatPeso(selectedOrder.downPayment)}</span>
                        </div>
                      )}
                      {selectedOrder.balance > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Balance Due</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--red)', fontWeight: 700 }}>{formatPeso(selectedOrder.balance)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)', marginTop: '3px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)' }}>Total</span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--gold)' }}>{formatPeso(selectedOrder.totalAmount)}</span>
                      </div>
                    </div>

                    {/* Pay Now */}
                    {selectedOrder.paymentStatus !== 'paid'
                      && (selectedOrder.orderStatus === 'awaiting_payment' || selectedOrder.paymentMethod !== 'cod')
                      && !['Cancelled', 'Returned'].includes(selectedOrder.orderStatus)
                      && !['pending_review', 'pending_design', 'proof_sent', 'revision_requested', 'design_approved'].includes(selectedOrder.orderStatus) && (
                      <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Pay Now</div>

                        {/* Breakdown for awaiting_payment */}
                        {selectedOrder.orderStatus === 'awaiting_payment' && (
                          <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '4px' }}>
                            {(selectedOrder.items || []).map((item, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: 'var(--gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>{item.productName} ×{item.qty || 1}</span>
                                <span style={{ color: 'var(--white)', flexShrink: 0 }}>{formatPeso(item.lineTotal || (item.unitPrice || 0) * (item.qty || 1))}</span>
                              </div>
                            ))}
                            {selectedOrder.shippingFee > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: 'var(--gray)' }}>Shipping</span>
                                <span style={{ color: 'var(--white)' }}>{formatPeso(selectedOrder.shippingFee)}</span>
                              </div>
                            )}
                            {selectedOrder.downPayment > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#22c55e' }}>DP Paid</span>
                                <span style={{ color: '#22c55e' }}>-{formatPeso(selectedOrder.downPayment)}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700, paddingTop: '5px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '2px' }}>
                              <span style={{ color: 'var(--white)' }}>
                                {selectedOrder.downPayment > 0 ? 'Balance Due' : 'Total Due'}
                              </span>
                              <span style={{ color: 'var(--gold)' }}>
                                {formatPeso(selectedOrder.downPayment > 0 ? selectedOrder.balance : selectedOrder.totalAmount)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* DP / Full toggle — only if no DP paid yet and order supports DP */}
                        {selectedOrder.orderStatus === 'awaiting_payment' && !selectedOrder.downPayment && selectedOrder.downpaymentPercent > 0 && (() => {
                          const dpAmt = Math.round(selectedOrder.totalAmount * selectedOrder.downpaymentPercent / 100 * 100) / 100;
                          return (
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
                              <button onClick={() => setPayFullToggle(false)}
                                style={{ flex: 1, padding: '7px 6px', borderRadius: '7px', border: `1px solid ${!payFullToggle ? 'var(--gold)' : 'var(--border)'}`, background: !payFullToggle ? 'rgba(212,168,67,0.1)' : 'transparent', color: !payFullToggle ? 'var(--gold)' : 'var(--gray)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center', lineHeight: 1.4 }}>
                                Pay {selectedOrder.downpaymentPercent}% Down<br/><span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{formatPeso(dpAmt)}</span>
                              </button>
                              <button onClick={() => setPayFullToggle(true)}
                                style={{ flex: 1, padding: '7px 6px', borderRadius: '7px', border: `1px solid ${payFullToggle ? 'var(--gold)' : 'var(--border)'}`, background: payFullToggle ? 'rgba(212,168,67,0.1)' : 'transparent', color: payFullToggle ? 'var(--gold)' : 'var(--gray)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center', lineHeight: 1.4 }}>
                                Pay Full<br/><span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{formatPeso(selectedOrder.totalAmount)}</span>
                              </button>
                            </div>
                          );
                        })()}

                        {[
                          { id: 'gcash',    label: 'GCash',               sub: 'Redirect to GCash',  accent: '#0066FF', logo: '/logos/Gcash-Logo-1024x1024.png' },
                          { id: 'paymaya', label: 'Maya',                sub: 'Redirect to Maya',   accent: '#00B14F', logo: '/logos/maya logo.png' },
                          { id: 'card',    label: 'Credit / Debit Card', sub: 'Visa or Mastercard', accent: '#9C7BE8', logo: '/logos/credit-card.svg', filterImg: true },
                        ].map(opt => {
                          const isSelected = payMethod === opt.id;
                          const isEWallet  = opt.id === 'gcash' || opt.id === 'paymaya';
                          const showPanel  = isEWallet && isSelected;
                          return (
                            <div key={opt.id}>
                              <div onClick={() => { setPayMethod(opt.id); setPayNowEWalletPhone(''); setPayNowShowEWalletPhone(false); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.07)'}`, background: isSelected ? `${opt.accent}12` : 'rgba(255,255,255,0.02)', transition: 'all 0.15s' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.06)'}`, background: isSelected ? `${opt.accent}20` : 'rgba(255,255,255,0.03)' }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={opt.logo} alt={opt.label} style={{ width: 20, height: 20, objectFit: 'contain', ...(opt.filterImg ? { filter: 'brightness(0) invert(1)', opacity: isSelected ? 1 : 0.5 } : {}) }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label}</div>
                                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', marginTop: '1px' }}>{opt.sub}</div>
                                </div>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.2)'}`, background: isSelected ? opt.accent : 'transparent', transition: 'all 0.15s' }} />
                              </div>
                              {showPanel && (
                                <div style={{ marginTop: '3px', marginBottom: '6px', padding: '10px 12px', borderRadius: '8px', background: opt.id === 'gcash' ? 'rgba(0,102,255,0.04)' : 'rgba(0,177,79,0.04)', border: `1px solid ${opt.id === 'gcash' ? 'rgba(0,102,255,0.18)' : 'rgba(0,177,79,0.18)'}` }}>
                                  {!payNowShowEWalletPhone ? (
                                    <button type="button" onClick={() => setPayNowShowEWalletPhone(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: opt.id === 'gcash' ? '#0066FF' : '#00B14F', fontSize: '0.75rem', fontWeight: 600 }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                                      Use a different {opt.id === 'gcash' ? 'GCash' : 'Maya'} number for billing reference
                                    </button>
                                  ) : (
                                    <>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: opt.id === 'gcash' ? '#0066FF' : '#00B14F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{opt.id === 'gcash' ? 'GCash' : 'Maya'} number</span>
                                        <button type="button" onClick={() => { setPayNowShowEWalletPhone(false); setPayNowEWalletPhone(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.72rem', padding: 0 }}>Cancel</button>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', overflow: 'hidden' }} onFocusCapture={e => { e.currentTarget.style.borderColor = opt.id === 'gcash' ? '#0066FF' : '#00B14F'; }} onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
                                        <span style={{ padding: '0.55rem 0.65rem', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--gray)', borderRight: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>+63</span>
                                        <input type="tel" inputMode="numeric" placeholder="9XX XXX XXXX" maxLength={12} value={fmtPHPhone(payNowEWalletPhone)} autoFocus onChange={e => setPayNowEWalletPhone(e.target.value.replace(/\D/g,'').slice(0,10))} style={{ flex: 1, background: 'transparent', border: 'none', padding: '0.55rem 0.75rem', color: 'var(--white)', fontSize: '0.85rem', outline: 'none', fontFamily: 'monospace' }} />
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {payMethod === 'card' && (
                          <div style={{ marginTop: '3px', padding: '0.75rem', borderRadius: '10px', background: 'rgba(156,123,232,0.05)', border: '1px solid rgba(156,123,232,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(156,123,232,0.9)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Card Details</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg width="26" height="16" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="24" rx="4" fill="#1A1F71"/><text x="19" y="17" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontStyle="italic" fontFamily="Arial,sans-serif">VISA</text></svg>
                                <svg width="26" height="16" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="24" rx="4" fill="#252525"/><circle cx="14" cy="12" r="7.5" fill="#EB001B"/><circle cx="24" cy="12" r="7.5" fill="#F79E1B"/></svg>
                              </div>
                            </div>
                            <div style={{ marginBottom: '0.45rem', position: 'relative' }}>
                              <input type="text" inputMode="numeric" placeholder="1234 1234 1234 1234" value={payNowCardNumber} onChange={e => setPayNowCardNumber(fmtCardNum(e.target.value))} style={{ width: '100%', background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.45rem 2.2rem 0.45rem 0.6rem', color: 'var(--white)', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '0.05em' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                              {cardBrand(payNowCardNumber) && <span style={{ position: 'absolute', right: '0.45rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.5rem', fontWeight: 900, color: '#9C7BE8', background: 'rgba(156,123,232,0.12)', padding: '2px 4px', borderRadius: '3px' }}>{cardBrand(payNowCardNumber)}</span>}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.45rem' }}>
                              <input type="text" inputMode="numeric" placeholder="MM / YY" value={payNowCardExpiry} onChange={e => setPayNowCardExpiry(fmtExpiry(e.target.value))} style={{ background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.45rem 0.6rem', color: 'var(--white)', fontSize: '0.78rem', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                              <input type="text" inputMode="numeric" placeholder="CVC" maxLength={4} value={payNowCardCvc} onChange={e => setPayNowCardCvc(e.target.value.replace(/\D/g,'').slice(0,4))} style={{ background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.45rem 0.6rem', color: 'var(--white)', fontSize: '0.78rem', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                            </div>
                            <input type="text" placeholder="Name on card" value={payNowCardName} onChange={e => setPayNowCardName(e.target.value)} style={{ width: '100%', background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.45rem 0.6rem', color: 'var(--white)', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                          </div>
                        )}

                        {payNowError && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', color: 'var(--red)', fontSize: '0.78rem' }}>{payNowError}</div>}
                        <button onClick={handlePayNow} disabled={payNowLoading || !payMethod} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: (payNowLoading || !payMethod) ? 'var(--border)' : 'var(--gold)', color: (payNowLoading || !payMethod) ? 'var(--gray)' : '#000', fontSize: '0.875rem', fontWeight: 700, cursor: (payNowLoading || !payMethod) ? 'not-allowed' : 'pointer', marginTop: '2px' }}>
                          {payNowLoading ? 'Processing...' : !payMethod ? 'Select payment method' : 'Proceed to Payment'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
              <div>
                {reorderMsg && <span style={{ fontSize: '0.8rem', color: reorderMsg.includes('Failed') ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{reorderMsg}</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {!detailLoading && !detailError && ['Pending', 'Processing'].includes(selectedOrder?.orderStatus) && (
                  <button
                    onClick={() => { closeModal(); setCancelTarget(selectedOrder); }}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: 'var(--red)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel Order
                  </button>
                )}
                {!detailLoading && !detailError && !selectedOrder?.isCustomOrder && selectedOrder?.orderStatus === 'Delivered' && selectedOrder?.items?.length > 0 && (
                  <button onClick={handleReorder} disabled={reorderLoading} style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: 'var(--gold)', color: '#000', fontSize: '0.875rem', fontWeight: 700, cursor: reorderLoading ? 'not-allowed' : 'pointer', opacity: reorderLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.39"/></svg>
                    {reorderLoading ? 'Adding...' : 'Reorder'}
                  </button>
                )}
                <button onClick={closeModal} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PayNow Verifying Overlay */}
      {payNowVerifying && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--dark2)', borderRadius: '18px', padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
            <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: 6 }}>Verifying payment…</p>
            <p style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Please wait, this may take a few seconds.</p>
          </div>
        </div>
      )}

      {/* PayNow Failed Modal */}
      {payNowFailedModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--dark2)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '18px', padding: '40px 32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <h2 style={{ color: 'var(--white)', fontWeight: 700, fontSize: '1.3rem', marginBottom: 8 }}>Payment Cancelled</h2>
            <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.6 }}>
              Your payment was not completed. You can try again from your order details.
            </p>
            <button onClick={() => setPayNowFailedModal(false)} style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── Cancel Confirmation ───────────────────────── */}
      {cancelTarget && (
        <div onClick={() => { if (!cancelling) { setCancelTarget(null); setCancelError(null); } }} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '380px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--red)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Cancel this order?</h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--gray)' }}>Order #{(cancelTarget._id ?? cancelTarget.id)?.slice(-8).toUpperCase()}</p>
              </div>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.6 }}>
              This action cannot be undone. The order will be cancelled and you'll be refunded if payment was made.
            </p>
            {cancelError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red)', fontSize: '0.8rem' }}>
                {cancelError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setCancelTarget(null); setCancelError(null); }} disabled={cancelling} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.875rem', cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.5 : 1 }}>
                Keep Order
              </button>
              <button onClick={cancelOrder} disabled={cancelling} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: cancelling ? 'rgba(239,68,68,0.4)' : 'var(--red)', color: 'var(--white)', fontSize: '0.875rem', fontWeight: 700, cursor: cancelling ? 'not-allowed' : 'pointer' }}>
                {cancelling ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
