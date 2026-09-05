'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyShopOrders, fetchMyShopOrder } from '@/lib/orderTrackingApi';
import { orderNo } from '@/lib/orderNumber';
import { StatusBadge, humanizeStatus, formatDate, formatPeso } from '@/lib/shopUtils';
import { remainingDue } from '@/lib/orderBalance';
import { getEcho } from '@/lib/echo';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useCart } from '@/app/shop/layout';
import { normalizeStatus } from '@/lib/orderStatus';
import NoImage from '@/components/NoImage';
import PaymentPicker from '@/components/shop/PaymentPicker';
import ImageLightbox from '@/components/shop/ImageLightbox';
import ProofGallery from '@/components/shop/ProofGallery';
import { watermarkProofs } from '@/lib/proofWatermark';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const TABS = ['All', 'To Pay', 'In Progress', 'To Receive', 'Completed', 'Cancelled', 'Custom'];

// Map any granular order status into a customer-facing phase bucket so EVERY order is
// filterable (Shopee/Lazada style). The wizard inside still shows the exact status.
function orderBucket(o) {
  const raw = o.orderStatus;
  const s = normalizeStatus(raw);            // tolerant of legacy + canonical casing
  if (s === 'cancelled' || s === 'returned') return 'Cancelled';
  if (s === 'delivered' || raw === 'Paid') return 'Completed';
  if (s === 'for_delivery' || raw === 'shipped' || raw === 'ready_for_pickup') return 'To Receive';
  if (raw === 'awaiting_payment') return 'To Pay';
  // "To Pay" means money is still owed on a real order - most often a downpaid order whose
  // balance is still outstanding. An online order that was never paid at all belongs here
  // too, since it is waiting on the same thing.
  if (Number(o.balance) > 0) return 'To Pay';
  if (s === 'pending' && o.paymentStatus !== 'paid' && o.paymentMethod && o.paymentMethod !== 'cod') return 'To Pay';
  return 'In Progress';
}

// Payment comes before review now: the customer pays a downpayment at checkout, and the
// artwork is checked before production starts. Showing Review first described a flow the
// shop no longer runs.
const UPLOAD_STEPS = [
  { key: 'awaiting_payment',    label: 'Payment',    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
  { key: 'pending_review',      label: 'Review',     icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
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

// A mixed cart holds an uploaded design AND a requested one in the same order. The order's single
// designType field cannot describe that, so label it from the lines instead.
function customTypeLabel(order) {
  const lines = (order?.items || []).filter(it => it?.isCustom || it?.designRequested || it?.designUrl || it?.designFiles?.length);
  const hasRequest = lines.some(it => it?.designRequested || it?.designMode === 'request');
  const hasUpload  = lines.some(it => (it?.designUrl || it?.designFiles?.length) && !it?.designRequested);
  if (hasRequest && hasUpload) return 'Mixed Custom';
  return order?.designType === 'upload' ? 'Upload Design' : 'Design Request';
}

// A revision request must actually say something - the designer cannot act on a blank one.
const REVISION_MIN = 5;
const REVISION_MAX = 1000;

// A stepper says "you are here" - one position. Lighting Production AND QC at once would stop it
// meaning anything, so the dot keeps the order's true stage (its least advanced item, because that
// is what actually holds the order back) and this line says what one dot cannot.
function ItemProgressNote({ jobs }) {
  const live = (jobs || []).filter(j => j?.joStatus !== 'Cancelled');
  if (live.length < 2) return null;

  // "passed to quality check" read as if the item had passed, when it may only have reached the
  // bench. Done and being-checked are different promises to a customer, so they are counted apart.
  const done     = live.filter(j => ['QC_Passed', 'Completed'].includes(j?.joStatus)).length;
  const checking = live.filter(j => j?.joStatus === 'QC_Pending').length;
  const making   = live.length - done - checking;
  if (making === 0 || (done === 0 && checking === 0)) return null;

  const parts = [];
  if (done)     parts.push(`${done} of ${live.length} finished`);
  if (checking) parts.push(`${checking} in quality check`);
  if (making)   parts.push(`${making} still being made`);

  return (
    <div style={{ fontSize: '0.72rem', color: '#d4a843', marginTop: '8px', fontWeight: 600 }}>
      {parts.join(', ')}.
    </div>
  );
}

// A mixed cart sets designType to 'upload' (upload wins the ternary at creation), even though the
// order still carries a design fee for its requested line. Keying the fee gate on designType meant
// the Pay Design Fee block never appeared on a mixed order and the deposit could be paid first -
// bypassing the whole design-fee-first rule. Ask the items instead; they cannot lie about it.
function owesDesignFee(order) {
  const hasRequest = (order?.items ?? []).some(i => i?.designRequested || i?.designMode === 'request');
  return hasRequest && Number(order?.designFee) > 0 && !order?.designFeePaid;
}

const CUSTOM_STATUS_LABEL = {
  pending_review:      'Under Review',
  awaiting_payment:    'Awaiting Payment',
  pending_design:      'Pending Design',
  proof_sent:          'Proof Sent',
  revision_requested:  'Revision Requested',
  design_approved:     'Design Approved',
  awaiting_production: 'In Queue',
  in_production:       'In Production',
  for_qc:              'Quality Check',
  ready_for_delivery:  'Ready for Delivery',
  for_delivery:        'Out for Delivery',
  pending:             'Order Placed',
  processing:          'Processing',
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
  // Active / in-progress → gold
  'Pending':            '#d4a843',
  'Processing':         '#d4a843',
  'In Production':      '#d4a843',
  'For QC':             '#d4a843',
  'For Delivery':       '#d4a843',
  'awaiting_payment':   '#d4a843',
  'pending_review':     '#d4a843',
  'pending_design':     '#d4a843',
  'design_approved':    '#d4a843',
  'awaiting_production':'#d4a843',
  'in_production':      '#d4a843',
  'for_qc':             '#d4a843',
  'ready_for_pickup':   '#d4a843',
  'shipped':            '#d4a843',
  // Needs customer action → amber
  'proof_sent':           '#f59e0b',
  'revision_requested':   '#f59e0b',
  // Success → green
  'Delivered':          '#22c55e',
  'delivered':          '#22c55e',
  'Paid':               '#22c55e',
  // Negative → red
  'Cancelled':          '#ef4444',
  'Returned':           '#ef4444',
};

// ─── OrderTracker ───────────────────────────────────────
function OrderTracker({ status, paymentMethod, paymentStatus, statusHistory = [], items = [], productionJobs = [] }) {
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
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isCancelled ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)', color: isCancelled ? '#ef4444' : '#f97316' }}>
          {isCancelled ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.39"/></svg>
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: isCancelled ? '#ef4444' : '#f97316' }}>Order {status}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '2px' }}>{isCancelled ? 'This order was cancelled.' : 'This order was returned.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {(() => {
        const designItems = items.filter(i => i.isCustom || i.designRequested || i.designUrl || i.designFiles?.length);
        const approved = designItems.filter(i => i.designStatus === 'approved').length;
        const showCount = designItems.length > 1 && approved < designItems.length;
        return (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Order Progress
            </span>
            {showCount && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d4a843' }}>
                {approved} of {designItems.length} designs approved
              </span>
            )}
          </div>
        );
      })()}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {trackSteps.map((step, idx) => {
          const isDone        = idx < currentIdx;
          const isCurrent     = idx === currentIdx;
          const GOLD          = '#d4a843';
          const ts = historyMap[step.key];
          return (
            <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {/* Connectors - a single hairline that fills gold as it is passed. */}
              {idx > 0 && (
                <div style={{ position: 'absolute', top: '13px', left: 0, width: '50%', height: '2px', background: idx <= currentIdx ? GOLD : 'var(--border)' }} />
              )}
              {idx < trackSteps.length - 1 && (
                <div style={{ position: 'absolute', top: '13px', right: 0, width: '50%', height: '2px', background: idx < currentIdx ? GOLD : 'var(--border)' }} />
              )}
              {/* Node: done = filled gold + white check, current = gold ring + gold dot,
                  upcoming = quiet hairline circle. One accent, no glow. */}
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%', zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? GOLD : 'var(--dark2)',
                border: `2px solid ${isDone || isCurrent ? GOLD : 'var(--border)'}`,
                color: isDone ? '#fff' : isCurrent ? GOLD : 'var(--gray)',
                transition: 'all 0.25s', flexShrink: 0,
              }}>
                {isDone
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : isCurrent
                    ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} />
                    : step.icon}
              </div>
              <div style={{ marginTop: '8px', textAlign: 'center', lineHeight: 1.3, fontSize: '0.66rem', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? GOLD : isDone ? 'var(--white)' : 'var(--gray)', maxWidth: '64px' }}>
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
      <ItemProgressNote jobs={productionJobs} />
      {isCOD && status === 'Delivered' && paymentStatus !== 'paid' && (
        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '7px', fontSize: '0.75rem', color: '#d4a843' }}>
          COD - pending cash collection before order is marked Paid.
        </div>
      )}
    </div>
  );
}

// ─── CustomOrderTracker ─────────────────────────────────
function CustomOrderTracker({ orderStatus, designType, designStatus, paymentStatus, items = [], productionJobs = [] }) {
  // A mixed cart can hold an uploaded design AND a requested one in the same order, but the order
  // carries a single designType - so calling the whole order "Upload Design" was a lie about half of
  // it. Detect the mix from the lines and fall back to the request track, whose stages are a superset.
  const customLines = (items || []).filter(it => it?.isCustom || it?.designRequested || it?.designUrl || it?.designFiles?.length);
  const hasRequest  = customLines.some(it => it?.designRequested || it?.designMode === 'request');
  const hasUpload   = customLines.some(it => (it?.designUrl || it?.designFiles?.length) && !it?.designRequested);
  const isMixed     = hasRequest && hasUpload;
  const effectiveType = isMixed ? 'mixed' : designType;

  const steps = effectiveType === 'upload' ? UPLOAD_STEPS : REQUEST_STEPS;
  const isTerminal = orderStatus === 'Cancelled' || orderStatus === 'Returned';
  const statusLabel = CUSTOM_STATUS_LABEL[orderStatus] || humanizeStatus(orderStatus);

  function getStepIdx(status) {
    const raw = String(status ?? '');
    let idx = steps.findIndex(s => s.key === raw);
    if (idx !== -1) return idx;
    // Fulfillment codes arrive in mixed case ('In Production', 'For QC', 'Delivered') from the JO
    // flow. Normalise, then map each onto the closest step in this design flow's step list so a
    // request order advances past 'Approved' into Production/QC/Delivery instead of stalling.
    const norm = raw.toLowerCase().replace(/[\s-]+/g, '_');
    const map = {
      processing:          'awaiting_production',
      in_production:       'awaiting_production',
      revision_requested:  'proof_sent',
      for_qc:              'for_qc',
      ready_for_delivery:  'shipped',
      for_delivery:        'shipped',
      shipped:             'shipped',
      delivered:           'delivered',
    };
    return steps.findIndex(s => s.key === (map[norm] ?? norm));
  }

  const rawIdx = getStepIdx(orderStatus);
  // If design is already approved, visually advance to at least design_approved step
  const approvedIdx = (designStatus === 'approved' || designStatus === 'revision_requested')
    ? steps.findIndex(s => s.key === 'design_approved')
    : -1;

  // The API normalises orderStatus down to the fulfillment vocabulary (pending_review and
  // awaiting_payment both arrive as "pending"), so the design and payment stages have to be
  // read from their own fields - otherwise every early order rendered as a row of grey dots.
  let derivedIdx = -1;
  if (rawIdx === -1) {
    const paid = paymentStatus === 'paid' || paymentStatus === 'partial';
    if (effectiveType === 'upload') {
      if (!paid) {
        derivedIdx = steps.findIndex(s => s.key === 'awaiting_payment');
      } else if (designStatus === 'approved') {
        // Only an APPROVED design advances to Production. A sent proof (draft_ready / proof_sent),
        // a rejected file, or one still pending all stay at Review - the customer hasn't signed off.
        derivedIdx = steps.findIndex(s => s.key === 'awaiting_production');
      } else {
        derivedIdx = steps.findIndex(s => s.key === 'pending_review');
      }
    } else {
      // Request design normalises to 'pending' at creation too. Its first real stage is the
      // designer making the artwork; without this it also rendered as a row of grey dots.
      if (designStatus === 'approved') {
        derivedIdx = steps.findIndex(s => s.key === 'design_approved');
      } else {
        derivedIdx = steps.findIndex(s => s.key === 'pending_design');
      }
    }
  }

  const currentIdx = Math.max(rawIdx, approvedIdx, derivedIdx);

  const isDelivered = orderStatus === 'delivered' || orderStatus === 'Delivered';

  if (isTerminal) {
    return (
      <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        </div>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#ef4444' }}>Order {orderStatus}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '2px' }}>This order was {orderStatus.toLowerCase()}.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {isMixed ? 'Custom Order' : effectiveType === 'upload' ? 'Upload Design' : 'Design Request'} Progress
        </div>
        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, background: isDelivered ? 'rgba(34,197,94,0.1)' : 'rgba(212,168,67,0.1)', color: isDelivered ? '#22c55e' : '#d4a843', border: `1px solid ${isDelivered ? 'rgba(34,197,94,0.3)' : 'rgba(212,168,67,0.3)'}` }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {steps.map((step, idx) => {
          // Delivered is the end of the journey, not a step still in progress. Treating the last
          // step as "current" left the finished order showing an open dot, as if something were
          // still pending - the one moment the tracker should read as finished.
          const isDone    = idx < currentIdx || (isDelivered && idx <= currentIdx);
          const isCurrent = idx === currentIdx && !isDone;
          const GOLD      = '#d4a843';
          // Identical treatment to the ready-made OrderTracker: done = filled gold + white check,
          // current = gold ring + gold dot, upcoming = quiet hairline circle + icon. No glow.
          return (
            <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {idx > 0 && (
                <div style={{ position: 'absolute', top: '13px', left: 0, width: '50%', height: '2px', background: idx <= currentIdx ? GOLD : 'var(--border)' }} />
              )}
              {idx < steps.length - 1 && (
                <div style={{ position: 'absolute', top: '13px', right: 0, width: '50%', height: '2px', background: idx < currentIdx ? GOLD : 'var(--border)' }} />
              )}
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%', zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? GOLD : 'var(--dark2)',
                border: `2px solid ${isDone || isCurrent ? GOLD : 'var(--border)'}`,
                color: isDone ? '#fff' : isCurrent ? GOLD : 'var(--gray)',
                transition: 'all 0.25s', flexShrink: 0,
              }}>
                {isDone
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : isCurrent
                    ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} />
                    : step.icon}
              </div>
              <div style={{ marginTop: '8px', textAlign: 'center', lineHeight: 1.3, fontSize: '0.66rem', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? GOLD : isDone ? 'var(--white)' : 'var(--gray)', maxWidth: '64px' }}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
      <ItemProgressNote jobs={productionJobs} />
      {orderStatus === 'awaiting_payment' && (
        <div style={{ marginTop: '14px', padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: '#f59e0b' }}>
          Payment required to move to production. Use the Pay Now button.
        </div>
      )}
      {orderStatus === 'proof_sent' && (
        <div style={{ marginTop: '14px', padding: '10px 14px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: '#d4a843' }}>
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
// Anything that was not 'paid' or 'unpaid' got labelled "Partial", so downpayment_paid and approved
// both described themselves wrongly to the customer.
const PAYMENT_LABEL = {
  unpaid:           'Unpaid',
  partial:          'Partial',
  downpayment_paid: 'Downpayment Paid',
  approved:         'Payment Approved',
};

function PaymentStatusBadge({ status }) {
  if (!status || status === 'paid') return null;
  const isUnpaid = status === 'unpaid';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600, background: isUnpaid ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: isUnpaid ? '#ef4444' : '#d4a843', border: `1px solid ${isUnpaid ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'}` }}>
      {PAYMENT_LABEL[status] ?? humanizeStatus(status)}
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
        <div style={{ height: '1px', background: 'var(--border)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ height: '12px', width: '55%', background: 'var(--border)', borderRadius: '4px' }} />
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
  // A request-design order pays its design fee at checkout, so that money is already in. Every later
  // figure - the deposit, "pay in full", the amount due - nets it off, or the customer is charged for
  // the same fee twice.
  const feeCredit = selectedOrder
    ? (Number(selectedOrder.designFeePaidAmount)
        || (selectedOrder.designFeePaid ? Number(selectedOrder.designFee) || 0 : 0))
    : 0;
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
  // Owner-controlled method availability (Homepage CMS -> Payment Methods). Missing = enabled.
  const [payEnabled, setPayEnabled] = useState({});
  // Revision allowance and the price of a paid round live in shop settings, so the modal can state
  // the cost of the NEXT request before the customer commits to it.
  const [storeSettings, setStoreSettings] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/public/settings`)
      .then(r => r.json())
      .then(d => setStoreSettings(d.data ?? d))
      .catch(() => {});
  }, []);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/storefront/content/payment_methods`)
      .then(r => r.json())
      .then(d => { if (d?.data?.enabled && typeof d.data.enabled === 'object') setPayEnabled(d.data.enabled); })
      .catch(() => {});
  }, []);
  const [payNowEWalletPhone, setPayNowEWalletPhone]       = useState('');
  const [payNowShowEWalletPhone, setPayNowShowEWalletPhone] = useState(false);
  const [payNowCardNumber, setPayNowCardNumber] = useState('');
  const [payNowCardExpiry, setPayNowCardExpiry] = useState('');
  const [payNowCardCvc, setPayNowCardCvc]       = useState('');
  const [payNowCardName, setPayNowCardName]     = useState('');
  const [payNowFailedModal, setPayNowFailedModal] = useState(false);
  const [payNowVerifying, setPayNowVerifying]     = useState(false);
  const [payNowVerifyId, setPayNowVerifyId]       = useState(null);

  // Which item's form is open (index), so per-item design cards each get their own re-upload /
  // revision form in a mixed order. null = none open.
  const [reuploadForIdx, setReuploadForIdx]   = useState(null);
  const [reuploadFile, setReuploadFile]       = useState(null);
  const [reuploadNotes, setReuploadNotes]     = useState('');
  const [reuploadLoading, setReuploadLoading] = useState(false);
  const [reuploadError, setReuploadError]     = useState(null);
  const [reuploadSuccess, setReuploadSuccess] = useState(false);

  // Keyed by item index, not a single flag: with one boolean, approving the mug put "Approving..." on
  // the totebag's button too, which reads as both being submitted.
  const [approvingIdx, setApprovingIdx] = useState(null);
  const [approveDesignError, setApproveDesignError]     = useState(null);
  const [revisionForIdx, setRevisionForIdx]             = useState(null);
  const [revisionNotes, setRevisionNotes]               = useState('');
  const [revisionLoading, setRevisionLoading]           = useState(false);
  const [revisionError, setRevisionError]               = useState(null);
  // A restart is its own action, not another revision - it carries a real charge, so it gets its
  // own confirm step rather than reusing the revision textarea's "just send it" flow.
  const [restartForIdx, setRestartForIdx]                = useState(null);
  const [restartNotes, setRestartNotes]                  = useState('');
  const [restartLoading, setRestartLoading]              = useState(false);
  const [restartError, setRestartError]                  = useState(null);
  const [revisionSuccess, setRevisionSuccess]           = useState(false);

  const [existingReview, setExistingReview]         = useState(null);
  // Every review already left on this order, and which product the form is currently open for. An
  // order can hold one review per product now, so a single "existingReview" cannot describe it.
  const [orderReviews, setOrderReviews]             = useState([]);
  const [reviewForProduct, setReviewForProduct]     = useState(null);
  const [reviewCheckLoading, setReviewCheckLoading] = useState(false);
  const [reviewRating, setReviewRating]             = useState(0);
  const [reviewComment, setReviewComment]           = useState('');
  const [reviewSubmitting, setReviewSubmitting]     = useState(false);
  const [reviewError, setReviewError]               = useState(null);
  const [reviewSuccess, setReviewSuccess]           = useState(false);

  // `silent` for the background poll and for refreshes after an action. Raising the page skeleton
  // every 30 seconds blanked a list the customer was already reading, which looks like the page
  // breaking rather than refreshing.
  const loadOrders = useCallback(async (silent = false) => {
    if (!token) { setLoading(false); return; }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchMyShopOrders(token);
      setOrders(Array.isArray(data) ? data : []);
      setVisibleCount(5);
    } catch (err) {
      if (err.message === 'Unauthorized') { router.push('/shop'); return; }
      setError(err.message || 'Failed to load orders.');
    } finally { if (!silent) setLoading(false); }
  }, [token, router]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const pollRef = useRef(null);
  const echoChannelsRef = useRef([]);

  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => { if (!modalOpen) loadOrders(true); }, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, modalOpen, loadOrders]);

  // Lock background scroll while any modal/overlay is open (fixes mobile bg-scroll)
  useEffect(() => {
    const anyOpen = modalOpen || !!cancelTarget || payNowFailedModal;
    if (!anyOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [modalOpen, cancelTarget, payNowFailedModal]);

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
        const ch = echo.private(`order.${id}`).listen('.order.status.updated', () => { loadOrders(true); });
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

    if (params.get('payment_return') === '1') {
      const returnId = params.get('id') ?? sessionStorage.getItem('pending_paynow_order_id');
      router.replace('/shop/orders-history', { scroll: false });
      if (returnId) {
        sessionStorage.removeItem('pending_paynow_order_id');
        setPayNowVerifyId(returnId);
        setPayNowVerifying(true);
      }
      return;
    }

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
          if (!cancelled) { setPayNowVerifying(false); loadOrders(true); }
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
    setReuploadForIdx(null); setReuploadFile(null); setReuploadNotes(''); setReuploadError(null); setReuploadSuccess(false);
    setApprovingIdx(null); setApproveDesignError(null);
    setRevisionForIdx(null); setRevisionNotes(''); setRevisionLoading(false); setRevisionError(null); setRevisionSuccess(false);
    setReorderMsg('');
    setExistingReview(null); setReviewCheckLoading(false); setReviewRating(0); setReviewComment(''); setReviewSubmitting(false); setReviewError(null); setReviewSuccess(false);
    setOrderReviews([]); setReviewForProduct(null);
  };

  const loadOrderReview = useCallback(async (orderId) => {
    setReviewCheckLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${orderId}/review`, { headers: apiHeaders(token) }, 10000);
      const data = await res.json();
      if (res.ok && data.data) setExistingReview(data.data);
      // The full set, so each item knows whether it has been rated yet.
      if (res.ok && Array.isArray(data.reviews)) setOrderReviews(data.reviews);
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
      if (detail?.orderStatus?.toLowerCase() === 'delivered' && detail?.paymentStatus === 'paid') loadOrderReview(detail._id ?? detail.id ?? order._id ?? order.id);
    } catch (err) {
      setDetailError(err.message || 'Failed to load order details.');
    } finally { setDetailLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const closeModal = () => {
    setModalOpen(false); setSelectedOrder(null); setDetailError(null); resetModalState();
    // Drop the deep-link param so a later Back or refresh does not reopen what was just closed.
    // Clear the guard too, or clicking the same card again would be ignored for the rest of the session.
    deepLinkedRef.current = null;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('order')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  // Open the deep-linked order DIRECTLY, without first finding it in the list.
  //
  // Matching against the fetched list was the wrong dependency and had two ways to fail silently: the
  // list has to have arrived, and the id has to match - but the API returns `_id`, sometimes as a raw
  // BSON {$oid} whose String() is "[object Object]". Neither failure showed anything on screen, which
  // is exactly what made it hard to see.
  //
  // `openDetail` only needs an id to fetch the order, so hand it one. Nothing else has to be true, and
  // it works even when the order is not on the first page of the list.
  const deepLinkedRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !token) return;
    const wanted = new URLSearchParams(window.location.search).get('order');
    if (!wanted || deepLinkedRef.current === wanted) return;
    deepLinkedRef.current = wanted;
    openDetail({ _id: wanted, id: wanted });
  }, [token, openDetail]);

  const [cancelReason, setCancelReason] = useState('');
  const [cancelOther,  setCancelOther]  = useState('');

  const cancelOrder = async () => {
    if (!cancelTarget || !token) return;
    setCancelling(true); setCancelError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${cancelTarget._id ?? cancelTarget.id}/cancel`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: cancelReason === 'Other' ? cancelOther.trim() : cancelReason }) }, 15000);
      const data = await res.json();
      if (!res.ok) { setCancelError(data.message || 'Failed to cancel order.'); return; }
      setCancelTarget(null); loadOrders(true);
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

  // Called by the shared PaymentPicker with (method, cardData). opts.designFeeOnly charges
  // only the request-design fee (first payment); otherwise it pays the DP/balance.
  const handlePayNow = async (method, cardData, opts = {}) => {
    if (!selectedOrder || !token || !method) return;
    setPayNowLoading(true); setPayNowError(null);
    try {
      let paymentMethodId = null;
      if (method === 'card') {
        const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
        const [expMonth, expYear] = (cardData?.expiry || '').split('/');
        const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(publicKey+':')}` },
          body: JSON.stringify({ data: { attributes: { type: 'card', details: { card_number: (cardData?.number || '').replace(/\s/g,''), exp_month: parseInt(expMonth), exp_year: parseInt('20'+(expYear||'')), cvc: cardData?.cvc }, billing: { name: (cardData?.name || '').trim() || currentUser?.name || '', email: currentUser?.email || '', phone: '' } } } }),
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
          paymentMethod: method,
          payFull: payFullToggle,
          ...(opts.designFeeOnly ? { designFeeOnly: true } : {}),
          ...(method === 'card' && paymentMethodId ? { paymentMethodId } : {}),
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

  // After any per-item design action the backend returns the updated order (with the re-synced
  // aggregate). Merge it back so both the item card and the overall tracker reflect the change.
  const mergeUpdatedOrder = (data) => {
    const updated = data?.data ?? data;
    if (!updated || (!updated.items && !updated.designStatus && !updated.orderStatus)) return;
    const oid = selectedOrder._id ?? selectedOrder.id;
    setSelectedOrder(prev => ({ ...prev, ...updated, id: prev.id, _id: prev._id }));
    setOrders(prev => prev.map(o => (o._id ?? o.id) === oid
      ? { ...o, designStatus: updated.designStatus ?? o.designStatus, orderStatus: updated.orderStatus ?? o.orderStatus, items: updated.items ?? o.items }
      : o));
  };

  const handleReupload = async (idx = null) => {
    if (!selectedOrder || !token) return;
    if (!reuploadFile && !reuploadNotes.trim()) return;
    setReuploadLoading(true); setReuploadError(null);
    try {
      const fd = new FormData();
      if (reuploadFile) fd.append('design_file', reuploadFile);
      if (reuploadNotes.trim()) fd.append('design_notes', reuploadNotes.trim());
      if (idx != null) fd.append('itemIndex', String(idx));
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/reupload-design`, { method: 'POST', headers: apiHeaders(token), body: fd }, 20000);
      const data = await res.json();
      if (!res.ok) { setReuploadError(data.message || 'Failed to submit design.'); return; }
      setReuploadSuccess(true); setReuploadForIdx(null); setReuploadFile(null); setReuploadNotes('');
      mergeUpdatedOrder(data);
      setTimeout(() => setReuploadSuccess(false), 5000);
    } catch (err) { setReuploadError(err.message || 'Failed to submit design.'); }
    finally { setReuploadLoading(false); }
  };

  const handleApproveAdminDesign = async (idx = null) => {
    if (!selectedOrder || !token) return;
    setApprovingIdx(idx ?? 'order'); setApproveDesignError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/approve-admin-design`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(idx != null ? { itemIndex: idx } : {}) }, 15000);
      const data = await res.json();
      if (!res.ok) { setApproveDesignError(data.message || 'Failed to approve design.'); return; }
      mergeUpdatedOrder(data);
    } catch (err) { setApproveDesignError(err.message || 'Failed to approve design.'); }
    finally { setApprovingIdx(null); }
  };

  const handleRequestRevision = async (idx = null) => {
    if (revisionNotes.trim().length < REVISION_MIN) {
      setRevisionError(`Please describe what you'd like changed (at least ${REVISION_MIN} characters).`);
      return;
    }
    if (!selectedOrder || !token) return;
    setRevisionLoading(true); setRevisionError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/request-revision`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: revisionNotes.trim(), ...(idx != null ? { itemIndex: idx } : {}) }) }, 15000);
      const data = await res.json();
      if (!res.ok) { setRevisionError(data.message || 'Failed to submit revision request.'); return; }
      mergeUpdatedOrder(data);
      setRevisionSuccess(true); setRevisionForIdx(null); setRevisionNotes('');
    } catch (err) { setRevisionError(err.message || 'Failed to submit revision request.'); }
    finally { setRevisionLoading(false); }
  };

  const handleRestartDesignJob = async (idx = null) => {
    if (restartNotes.trim().length < REVISION_MIN) {
      setRestartError(`Please describe what the new design should do differently (at least ${REVISION_MIN} characters).`);
      return;
    }
    if (!selectedOrder || !token) return;
    setRestartLoading(true); setRestartError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/restart-design-job`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: restartNotes.trim(), ...(idx != null ? { itemIndex: idx } : {}) }) }, 15000);
      const data = await res.json();
      if (!res.ok) { setRestartError(data.message || 'Failed to start a new design job.'); return; }
      mergeUpdatedOrder(data);
      setRestartForIdx(null); setRestartNotes('');
    } catch (err) { setRestartError(err.message || 'Failed to start a new design job.'); }
    finally { setRestartLoading(false); }
  };

  const handleSubmitReview = async (productId) => {
    if (!selectedOrder || !token || reviewRating === 0 || reviewComment.trim().length < 5) return;
    setReviewSubmitting(true); setReviewError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/review`, { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: reviewRating, comment: reviewComment, productId }) }, 15000);
      const data = await res.json();
      if (!res.ok) { setReviewError(data.message || 'Failed to submit review.'); return; }
      // Append rather than replace: the other items on this order may still be unreviewed.
      setExistingReview(data.data);
      setOrderReviews(prev => [...prev.filter(r => String(r.productId) !== String(productId)), data.data]);
      setReviewForProduct(null);
      setReviewRating(0);
      setReviewComment('');
    } catch (err) { setReviewError(err.message || 'Failed to submit review.'); }
    finally { setReviewSubmitting(false); }
  };

  const isStaleUnpaidOnline = (o) => {
    if (o.paymentStatus !== 'unpaid') return false;
    if ((o.paymentMethod || '').toLowerCase() === 'cod') return false;
    if (o.isCustomOrder) return false;
    const age = Date.now() - new Date(o.createdAt).getTime();
    return age < 30 * 60 * 1000;
  };

  const visibleOrders = orders.filter(o => !isStaleUnpaidOnline(o));

  const filteredOrders = (() => {
    if (activeTab === 'All') return visibleOrders;
    if (activeTab === 'Custom') return visibleOrders.filter(o => o.isCustomOrder);
    return visibleOrders.filter(o => orderBucket(o) === activeTab);
  })();

  // ── Render ──────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh' }}>

      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '28px 16px 48px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.3px' }}>My Orders</h1>
          {!loading && !error && visibleOrders.length > 0 && (
            <span style={{ fontSize: '0.85rem', color: 'var(--gray)', fontWeight: 500 }}>{visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'}</span>
          )}
        </div>

        {/* Filter tabs */}
        {!loading && !error && orders.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitMaskImage: 'linear-gradient(to right, #000 92%, transparent)', maskImage: 'linear-gradient(to right, #000 92%, transparent)' }}>
            {TABS.map(tab => {
              const count = tab === 'All' ? visibleOrders.length
                : tab === 'Custom' ? visibleOrders.filter(o => o.isCustomOrder).length
                : visibleOrders.filter(o => orderBucket(o) === tab).length;
              const isActive = activeTab === tab;
              // Hide empty filters to cut clutter — keep "All" and whatever is currently selected.
              if (count === 0 && tab !== 'All' && !isActive) return null;
              return (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setVisibleCount(5); }}
                  style={{ flexShrink: 0, padding: '6px 14px', borderRadius: '999px', border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`, background: isActive ? 'rgba(212,168,67,0.1)' : 'transparent', color: isActive ? 'var(--gold)' : 'var(--gray)', fontSize: '0.8rem', fontWeight: isActive ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                >
                  {tab}
                  {count > 0 && (
                    <span style={{ padding: '1px 6px', borderRadius: '999px', background: isActive ? 'var(--gold)' : 'var(--border)', color: isActive ? '#000' : 'var(--gray)', fontSize: '0.65rem', fontWeight: 700, minWidth: '18px', textAlign: 'center', lineHeight: 1.6 }}>
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
              const grouped = items.reduce((acc, item) => {
                const name = item.productName || item.product_name || 'Order';
                acc[name] = (acc[name] || 0) + (item.qty || 1);
                return acc;
              }, {});
              const groupedEntries = Object.entries(grouped);
              const [gName, gQty] = groupedEntries[0];
              const itemSummary = groupedEntries.length === 1
                ? `${gName}${gQty > 1 ? ` ×${gQty}` : ''}`
                : `${gName}${gQty > 1 ? ` ×${gQty}` : ''} +${groupedEntries.length - 1} more`;
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
                  {/* Thumbnail */}
                  <div style={{ padding: '12px 0 12px 12px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ position: 'relative', width: '52px', height: '52px', borderRadius: '9px', overflow: 'hidden', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.12)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {(items[0]?.thumbnail || items[0]?.imageUrl)
                        ? <img src={items[0].thumbnail || items[0].imageUrl} alt={items[0].productName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,67,0.35)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      }
                      {items.length > 1 && (
                        <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'rgba(0,0,0,0.7)', color: 'var(--gray)', fontSize: '0.55rem', fontWeight: 700, padding: '1px 4px', borderTopLeftRadius: '5px' }}>
                          +{items.length - 1}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                            {orderNo(oid)}
                          </span>
                          {order.isCustomOrder && (
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'rgba(212,168,67,0.08)', color: 'var(--gold)', border: '1px solid rgba(212,168,67,0.2)', letterSpacing: '0.3px' }}>
                              CUSTOM
                            </span>
                          )}
                          {order.isCustomOrder && order.designType && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                              {customTypeLabel(order)}
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
                    <div style={{ height: '1px', background: 'var(--border)', marginLeft: '16px' }} />
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
        <>
        <style>{`
          .oh-modal-outer { display:flex; flex:1; overflow:hidden; min-height:0; background:var(--dark); }
          /* Two-card body (mirrors the admin order module): both columns are cards floating on a
             slightly darker body, separated by a gap - not edge-to-edge panes. */
          .oh-modal-columns { display:flex; flex:1; overflow:hidden; min-height:0; gap:14px; padding:16px; background:var(--dark); }
          .oh-modal-left-col { border:1px solid var(--border); border-radius:14px; background:var(--dark2); }
          .oh-modal-right { flex:1; min-width:0; overflow-y:auto; border:1px solid var(--border); border-radius:14px; display:flex; flex-direction:column; background:var(--dark2); }

          /* Just the slider, no stepper arrows.
             The arrows would not go away before because of a precedence rule that is easy to miss:
             from Chrome 121, setting the standard scrollbar-width / scrollbar-color switches the
             browser to the native scrollbar and makes it IGNORE every ::-webkit-scrollbar rule -
             including the one hiding the buttons. So the standard properties are now scoped to
             browsers that have no ::-webkit-scrollbar at all (Firefox, which draws no arrows anyway)
             and Chrome is left to the pseudo-elements below. */
          @supports not selector(::-webkit-scrollbar) {
            .oh-modal-left-col, .oh-modal-right { scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
          }
          .oh-modal-left-col::-webkit-scrollbar, .oh-modal-right::-webkit-scrollbar { width:10px; }
          .oh-modal-left-col::-webkit-scrollbar-button, .oh-modal-right::-webkit-scrollbar-button { display:none; width:0; height:0; }
          .oh-modal-left-col::-webkit-scrollbar-corner, .oh-modal-right::-webkit-scrollbar-corner { background:transparent; }
          .oh-modal-left-col::-webkit-scrollbar-track, .oh-modal-right::-webkit-scrollbar-track { background:transparent; }
          /* Inset by 3px so the pill never rides over the card's rounded corner. */
          .oh-modal-left-col::-webkit-scrollbar-thumb, .oh-modal-right::-webkit-scrollbar-thumb { background:var(--border); border-radius:8px; border:3px solid transparent; background-clip:content-box; min-height:40px; }
          .oh-modal-left-col::-webkit-scrollbar-thumb:hover, .oh-modal-right::-webkit-scrollbar-thumb:hover { background:var(--gray); background-clip:content-box; }
          /* Light mode: white panel + explicit light-grey inset cards (var(--dark) is near-white in light) */
          html.light .oh-modal-panel { --dark2:#ffffff; --dark:#eef1f4; }
          .oh-modal-outer, .oh-modal-left-col, .oh-modal-right { overscroll-behavior: contain; }
          @media(max-width:860px){
            .oh-modal-outer { overflow-y:auto; }
            .oh-modal-columns { flex-direction:column; overflow:visible; height:auto; flex:none; min-height:unset; }
            .oh-modal-left-col { overflow-y:visible !important; }
            .oh-modal-right { width:100%; flex-shrink:0; overflow-y:visible; height:auto; }
          }
        `}</style>
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
          <div className="oh-modal-panel" onClick={e => e.stopPropagation()} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '880px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', fontFamily: 'Inter, system-ui, sans-serif' }}>

            {/* Modal header */}
            <div style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: 'transparent', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: '4px' }}>Order Details</div>
                {selectedOrder && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--white)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                      {orderNo(selectedOrder)}
                    </span>
                    {selectedOrder.isCustomOrder ? (
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', letterSpacing: '0.03em', background: 'rgba(212,168,67,0.08)', color: '#d4a843', border: '1px solid rgba(212,168,67,0.2)' }}>
                        CUSTOM · {customTypeLabel(selectedOrder).toUpperCase()}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', letterSpacing: '0.03em', background: 'rgba(34,197,94,0.08)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
                        READY-MADE
                      </span>
                    )}
                    <StatusBadge status={selectedOrder.orderStatus} />
                    {selectedOrder.paymentStatus === 'paid'
                      ? <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>Paid</span>
                      : <PaymentStatusBadge status={selectedOrder.paymentStatus} />}
                  </div>
                )}
              </div>
              <button
                onClick={closeModal}
                style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--border)', color: 'var(--gray)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--gray)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="oh-modal-outer" style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

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
                    <div style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '12px' }}>{detailError}</div>
                    <button onClick={() => selectedOrder && openDetail(selectedOrder)} style={{ background: 'none', border: '1px solid #ef4444', borderRadius: '6px', color: '#ef4444', padding: '6px 16px', fontSize: '0.8rem', cursor: 'pointer' }}>Retry</button>
                  </div>
                </div>
              )}

              {!detailLoading && !detailError && selectedOrder && (
                <div className="oh-modal-columns" style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                  {/* LEFT column */}
                  <div className="oh-modal-left-col" style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>

                    {/* Tracker */}
                    <div style={{ paddingBottom: '4px' }}>
                      {selectedOrder.isCustomOrder ? (
                        <CustomOrderTracker orderStatus={selectedOrder.orderStatus} designType={selectedOrder.designType} designStatus={selectedOrder.designStatus} paymentStatus={selectedOrder.paymentStatus} items={selectedOrder.items} productionJobs={selectedOrder.productionJobs} />
                      ) : (
                        <OrderTracker status={selectedOrder.orderStatus} paymentMethod={selectedOrder.paymentMethod} paymentStatus={selectedOrder.paymentStatus} statusHistory={selectedOrder.statusHistory} items={selectedOrder.items} productionJobs={selectedOrder.productionJobs} />
                      )}
                    </div>

                    {/* Order Info */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Order Info</div>
                      <div>
                        {[
                          ['Placed', formatDate(selectedOrder.createdAt)],
                          (selectedOrder.estimatedDeliveryMin && !['delivered','Delivered','cancelled','Cancelled','returned','Returned'].includes(selectedOrder.orderStatus))
                            ? ['Est. Delivery', <span key="ed" style={{ fontSize: '13px', color: 'var(--white)', fontWeight: 600 }}>
                                {formatDate(selectedOrder.estimatedDeliveryMin)}{selectedOrder.estimatedDeliveryMax && selectedOrder.estimatedDeliveryMax !== selectedOrder.estimatedDeliveryMin ? ` - ${formatDate(selectedOrder.estimatedDeliveryMax)}` : ''}
                                {selectedOrder.isRush && <span style={{ marginLeft: 6, fontSize: '10px', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '1px 5px' }}>RUSH</span>}
                              </span>]
                            : null,
                          (selectedOrder.paymentMethod && !(selectedOrder.paymentStatus === 'unpaid' && selectedOrder.orderStatus === 'awaiting_payment'))
                            ? ['Method', { cod: 'Cash on Delivery', gcash: 'GCash', paymaya: 'Maya', card: 'Credit / Debit Card' }[selectedOrder.paymentMethod] ?? selectedOrder.paymentMethod]
                            : null,
                          (selectedOrder.designFeePaid && selectedOrder.paymentStatus !== 'paid')
                            ? ['Payment', <span key="p" style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>Design Fee Paid · Order Unpaid</span>]
                            : null,
                          selectedOrder.designStatus
                            ? ['Design', <span key="d" style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600, background: selectedOrder.designStatus === 'approved' ? '#d4a843' : selectedOrder.designStatus === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: selectedOrder.designStatus === 'approved' ? '#000000' : selectedOrder.designStatus === 'rejected' ? '#ef4444' : '#d4a843' }}>
                                {selectedOrder.designStatus === 'pending_review' ? 'Under Review' : selectedOrder.designStatus === 'approved' ? 'Approved' : selectedOrder.designStatus === 'rejected' ? 'Rejected' : selectedOrder.designStatus === 'draft_ready' ? 'Draft Ready' : selectedOrder.designStatus === 'revision_requested' ? 'Revision Requested' : selectedOrder.designStatus}
                              </span>]
                            : null,
                        ].filter(Boolean).map(([label, value]) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                            <span style={{ fontSize: '12px', color: 'var(--gray)' }}>{label}</span>
                            {typeof value === 'string'
                              ? <span style={{ fontSize: '13px', color: 'var(--white)', fontWeight: 600 }}>{value}</span>
                              : value
                            }
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedOrder.mockups?.length > 0 && (
                      <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#d4a843', marginBottom: '2px' }}>
                          Mockup from the shop
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--gray)', lineHeight: 1.5, marginBottom: '8px' }}>
                          How your order will look. Nothing to approve here - your design is already confirmed.
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {selectedOrder.mockups.map((m, i) => (
                            <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
                              title={m.sentAt ? `Sent ${new Date(m.sentAt).toLocaleDateString()}` : 'Open'}
                              style={{ display: 'block', width: '84px', height: '84px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: '#fff' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.url} alt="Mockup" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Per-item designs (Option 2): each custom line has its own artwork state and
                        actions, so a mixed order can approve one item, review another and wait on a
                        proof for a third - all in the same modal. */}
                    {(() => {
                      const custom = (selectedOrder.items || [])
                        .map((it, idx) => ({ it, idx }))
                        .filter(({ it }) => it.isCustom || it.designRequested || it.designUrl || it.designName || it.adminDesignUrl);
                      if (!custom.length) return null;

                      const STATUS = {
                        pending_review:     { label: 'Under review',       color: '#d4a843', bg: 'rgba(234,179,8,0.1)' },
                        pending_design:     { label: 'Designing',          color: '#d4a843', bg: 'rgba(234,179,8,0.1)' },
                        draft_ready:        { label: 'Proof ready',        color: '#d4a843', bg: 'rgba(212,168,67,0.12)' },
                        proof_sent:         { label: 'Proof ready',        color: '#d4a843', bg: 'rgba(212,168,67,0.12)' },
                        revision_requested: { label: 'Revision requested', color: '#d4a843', bg: 'rgba(234,179,8,0.1)' },
                        rejected:           { label: 'Needs revision',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                        approved:           { label: 'Approved',           color: '#000',    bg: '#d4a843' },
                      };

                      // One artwork, several products. Splitting the request lines into separate
                      // cards asked the customer to judge the same piece of work twice, and produced
                      // a state - half an artwork approved - that means nothing. They share one
                      // container and one proof. The DECISION stays per product, because "revise the
                      // mug, the totebag is fine" is a real answer: the artwork is right and only its
                      // placement on one item is wrong. Uploads keep their own card - each is the
                      // customer's own distinct file with its own review.
                      const requestItems = custom.filter(({ it }) => it.designRequested || (!it.designUrl && !it.designFiles?.length));
                      const uploadItems  = custom.filter(({ it }) => !(it.designRequested || (!it.designUrl && !it.designFiles?.length)));
                      const sharedProof  = (() => {
                        for (const { it } of requestItems) {
                          const u = watermarkProofs(it.adminDesignUrls?.length ? it.adminDesignUrls : [it.adminDesignUrl]);
                          if (u.length) return u;
                        }
                        return [];
                      })();
                      const renderDesignItem = ({ it, idx }, grouped = false) => {
                            const type = (it.designRequested || (!it.designUrl && !it.designFiles?.length)) ? 'request' : 'upload';
                            const st = it.designStatus || (type === 'request' ? 'pending_design' : 'pending_review');
                            const s = STATUS[st] || { label: st, color: 'var(--gray)', bg: 'rgba(255,255,255,0.06)' };
                            const myFiles = (it.designFiles?.length ? it.designFiles.map(f => f.url) : [it.designUrl]).filter(Boolean);
                            // Watermarked and size-capped: the artwork is not handed over until the
                            // order is paid, and a proof good enough to print is a proof good enough to
                            // take elsewhere. The shop's own screens and the Job Order get the original.
                            const proofUrls = watermarkProofs(it.adminDesignUrls?.length ? it.adminDesignUrls : [it.adminDesignUrl]);
                            const name = it.productName || it.product_name || 'Custom item';
                            return (
                              <div key={idx} style={grouped
                                ? { borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }
                                : { border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--dark)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)' }}>
                                    {name}{it.variantName ? <span style={{ color: 'var(--gray)', fontWeight: 500 }}> - {it.variantName}</span> : null}
                                    {!grouped && <span style={{ marginLeft: '8px', fontSize: '0.62rem', fontWeight: 700, color: 'var(--gray)', border: '1px solid var(--border)', borderRadius: '999px', padding: '1px 7px', textTransform: 'uppercase' }}>{type === 'request' ? 'Request' : 'Upload'}</span>}
                                  </div>
                                  <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: s.bg, color: s.color }}>{s.label}</span>
                                </div>

                                {type === 'upload' && myFiles.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '0.64rem', color: 'var(--gray)', marginBottom: '6px' }}>Your file</div>
                                    <ProofGallery urls={myFiles} height={200} compact
                                      onOpen={(u) => setLightboxUrl(u)} />
                                  </div>
                                )}

                                {/* No label: the proof sits directly under "Proof ready" and above
                                    "Please review the proof for this item", so naming it again only
                                    adds noise between the customer and the thing they came to see. */}
                                {!grouped && proofUrls.length > 0 && (
                                  <ProofGallery urls={proofUrls} height={280}
                                    onOpen={(u) => setLightboxUrl(u)} />
                                )}

                                {st === 'approved' ? (
                                  (() => {
                                    // Payment is not due until EVERY design on the order is approved, so
                                    // saying "complete payment" beside the first approval asked for money
                                    // the order was not yet ready to take - and hid the fact that another
                                    // item was still waiting on the customer.
                                    const waiting = requestItems
                                      .filter(e => e.idx !== idx && e.it.designStatus !== 'approved')
                                      .map(e => e.it.productName)
                                      .filter(Boolean);
                                    const label = waiting.length
                                      ? `Approved - waiting on ${waiting.join(', ')} before payment is due.`
                                      : selectedOrder.paymentStatus === 'unpaid'
                                        ? 'Approved - complete payment to begin production.'
                                        : 'Approved - in production.';
                                    return (
                                      <div style={{ fontSize: '0.76rem', color: waiting.length ? 'var(--gray)' : '#d4a843', fontWeight: 600 }}>
                                        {label}
                                      </div>
                                    );
                                  })()
                                ) : type === 'request' && st === 'pending_design' ? (
                                  <div style={{ fontSize: '0.76rem', color: 'var(--gray)' }}>Our designer is working on your proof. We'll notify you when it's ready.</div>
                                ) : type === 'upload' && st === 'pending_review' ? (
                                  <div style={{ fontSize: '0.76rem', color: 'var(--gray)' }}>Your file is being reviewed before production.</div>
                                ) : st === 'rejected' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {it.designRejectionReason && <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '0.76rem', color: 'var(--gray)' }}><strong style={{ color: '#ef4444' }}>Reason: </strong>{it.designRejectionReason}</div>}
                                    {reuploadForIdx !== idx ? (
                                      <button onClick={() => { setReuploadForIdx(idx); setReuploadFile(null); setReuploadNotes(''); setReuploadError(null); }} style={{ padding: '8px', borderRadius: '8px', border: '1px solid rgba(212,168,67,0.3)', background: 'rgba(212,168,67,0.06)', color: '#d4a843', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>Re-upload this item</button>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.ai,.psd,.svg" onChange={e => setReuploadFile(e.target.files?.[0] || null)} style={{ fontSize: '0.76rem', color: 'var(--white)', width: '100%' }} />
                                        <textarea placeholder="Updated notes (optional)" value={reuploadNotes} onChange={e => setReuploadNotes(e.target.value)} maxLength={2000} rows={2} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.76rem', padding: '7px 10px', resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                                        {reuploadError && <div style={{ color: '#ef4444', fontSize: '0.72rem' }}>{reuploadError}</div>}
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button onClick={() => handleReupload(idx)} disabled={reuploadLoading || (!reuploadFile && !reuploadNotes.trim())} style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', background: (reuploadLoading || (!reuploadFile && !reuploadNotes.trim())) ? 'var(--border)' : '#d4a843', color: '#000', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>{reuploadLoading ? 'Submitting...' : 'Submit for review'}</button>
                                          <button onClick={() => { setReuploadForIdx(null); setReuploadFile(null); setReuploadNotes(''); }} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.76rem', cursor: 'pointer' }}>Cancel</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : st === 'revision_requested' ? (
                                  <div style={{ fontSize: '0.76rem', color: '#d4a843' }}>Revision requested - we'll update the proof and notify you.</div>
                                ) : (st === 'draft_ready' || st === 'proof_sent') && proofUrls.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {!grouped && <div style={{ fontSize: '0.76rem', color: 'var(--gray)' }}>Please review the proof for this item.</div>}
                                    {approveDesignError && <div style={{ fontSize: '0.72rem', color: '#ef4444' }}>{approveDesignError}</div>}
                                    {revisionForIdx !== idx && restartForIdx !== idx ? (
                                      (() => {
                                        const usedNow = Number(it.revisionCount ?? 0);
                                        const maxNow  = Number(storeSettings?.maxRevisions ?? 5);
                                        const atCap   = usedNow >= maxNow;
                                        const anyBusy = approvingIdx !== null;
                                        return (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                              {(() => {
                                                const busy = approvingIdx === idx;
                                                return (
                                                  <button onClick={() => handleApproveAdminDesign(idx)} disabled={anyBusy}
                                                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: anyBusy ? 'var(--border)' : '#d4a843', color: '#000', fontSize: '0.76rem', fontWeight: 700, cursor: anyBusy ? 'not-allowed' : 'pointer' }}>
                                                    {busy ? 'Approving...' : 'Approve'}
                                                  </button>
                                                );
                                              })()}
                                              {/* Past the cap, "Request changes" would just hit the same wall the
                                                  backend enforces - so it is replaced rather than left to fail. */}
                                              {atCap ? (
                                                <button onClick={() => { setRestartForIdx(idx); setRestartNotes(''); setRestartError(null); }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(212,168,67,0.4)', background: 'rgba(212,168,67,0.08)', color: '#d4a843', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Start new design job</button>
                                              ) : (
                                                <button onClick={() => { setRevisionForIdx(idx); setRevisionNotes(''); setRevisionError(null); }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>Request changes</button>
                                              )}
                                            </div>
                                            {atCap && (
                                              <div style={{ fontSize: '0.68rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                                                You have used all {maxNow} revisions on this draft. Starting a new design
                                                job restarts the round count with a fresh {formatPeso(Number(storeSettings?.designRequestFee ?? 100))} design fee.
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()
                                    ) : restartForIdx === idx ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ padding: '8px 11px', borderRadius: '8px', fontSize: '0.72rem', lineHeight: 1.5, background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', color: 'var(--gray)' }}>
                                          This starts over as a new design job: <strong style={{ color: '#d4a843' }}>{formatPeso(Number(storeSettings?.designRequestFee ?? 100))}</strong> is
                                          added to your order balance, and you get a fresh set of included revisions on the new draft.
                                        </div>
                                        <textarea placeholder="What should the new design do differently?" value={restartNotes} maxLength={REVISION_MAX} onChange={e => setRestartNotes(e.target.value)} rows={3} style={{ background: 'var(--dark2)', border: `1px solid ${restartNotes.trim().length > 0 && restartNotes.trim().length < REVISION_MIN ? '#ef4444' : 'var(--border)'}`, borderRadius: '8px', color: 'var(--white)', fontSize: '0.76rem', padding: '7px 10px', resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--gray)' }}>
                                          <span>{restartNotes.trim().length < REVISION_MIN ? `At least ${REVISION_MIN} characters` : 'Ready to send'}</span>
                                          <span>{restartNotes.length}/{REVISION_MAX}</span>
                                        </div>
                                        {restartError && <div style={{ fontSize: '0.72rem', color: '#ef4444' }}>{restartError}</div>}
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button onClick={() => handleRestartDesignJob(idx)} disabled={restartLoading || restartNotes.trim().length < REVISION_MIN} style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', background: (restartLoading || restartNotes.trim().length < REVISION_MIN) ? 'var(--border)' : '#d4a843', color: (restartLoading || restartNotes.trim().length < REVISION_MIN) ? 'var(--gray)' : '#000', fontSize: '0.76rem', fontWeight: 700, cursor: (restartLoading || restartNotes.trim().length < REVISION_MIN) ? 'not-allowed' : 'pointer' }}>
                                            {restartLoading ? 'Starting...' : `Confirm & pay ${formatPeso(Number(storeSettings?.designRequestFee ?? 100))}`}
                                          </button>
                                          <button onClick={() => { setRestartForIdx(null); setRestartNotes(''); }} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.76rem', cursor: 'pointer' }}>Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {(() => {
                                          const used = Number(it.revisionCount ?? 0);
                                          const free = Number(storeSettings?.freeRevisions ?? 3);
                                          const fee  = Number(storeSettings?.extraRevisionFee ?? 50);
                                          const max  = Number(storeSettings?.maxRevisions ?? 5);
                                          const next = used + 1;
                                          const left = Math.max(0, free - used);
                                          const paid = next > free && fee > 0;
                                          return (
                                            <div style={{ padding: '8px 11px', borderRadius: '8px', fontSize: '0.72rem', lineHeight: 1.5,
                                              background: paid ? 'rgba(212,168,67,0.08)' : 'var(--dark2)',
                                              border: `1px solid ${paid ? 'rgba(212,168,67,0.3)' : 'var(--border)'}`,
                                              color: 'var(--gray)' }}>
                                              {paid ? (
                                                <>Revision {next} of {max}. Your {free} included revision{free === 1 ? '' : 's'} {free === 1 ? 'has' : 'have'} been used, so this round costs{' '}
                                                <strong style={{ color: '#d4a843' }}>{formatPeso(fee)}</strong>, added to your order balance.</>
                                              ) : (
                                                <>Revision {next}. You have <strong style={{ color: 'var(--white)' }}>{left}</strong> included revision{left === 1 ? '' : 's'} left; after that each round costs {formatPeso(fee)}.</>
                                              )}
                                            </div>
                                          );
                                        })()}
                                        {/* The designer has to be told what to change; an empty request
                                            just sends them back to ask. Required, with a floor that
                                            stops "no" being a brief. */}
                                        <textarea placeholder="Describe what you'd like changed..." value={revisionNotes} maxLength={REVISION_MAX} onChange={e => setRevisionNotes(e.target.value)} rows={3} style={{ background: 'var(--dark2)', border: `1px solid ${revisionNotes.trim().length > 0 && revisionNotes.trim().length < REVISION_MIN ? '#ef4444' : 'var(--border)'}`, borderRadius: '8px', color: 'var(--white)', fontSize: '0.76rem', padding: '7px 10px', resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--gray)' }}>
                                          <span>{revisionNotes.trim().length < REVISION_MIN ? `At least ${REVISION_MIN} characters` : 'Ready to send'}</span>
                                          <span>{revisionNotes.length}/{REVISION_MAX}</span>
                                        </div>
                                        {revisionError && <div style={{ fontSize: '0.72rem', color: '#ef4444' }}>{revisionError}</div>}
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button onClick={() => handleRequestRevision(idx)} disabled={revisionLoading || revisionNotes.trim().length < REVISION_MIN} style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', background: (revisionLoading || revisionNotes.trim().length < REVISION_MIN) ? 'var(--border)' : '#d4a843', color: (revisionLoading || revisionNotes.trim().length < REVISION_MIN) ? 'var(--gray)' : '#000', fontSize: '0.76rem', fontWeight: 700, cursor: (revisionLoading || revisionNotes.trim().length < REVISION_MIN) ? 'not-allowed' : 'pointer' }}>{revisionLoading ? 'Sending...' : 'Send request'}</button>
                                          <button onClick={() => { setRevisionForIdx(null); setRevisionNotes(''); }} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.76rem', cursor: 'pointer' }}>Cancel</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                      };

                      return (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Designs</div>

                          {requestItems.length > 0 && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--dark)' }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)' }}>
                                Design request
                                <span style={{ marginLeft: '8px', fontSize: '0.66rem', fontWeight: 600, color: 'var(--gray)' }}>
                                  {requestItems.length > 1
                                    ? requestItems.map(({ it }) => it.productName).filter(Boolean).join(', ')
                                    : requestItems[0].it.productName || 'Custom item'}
                                </span>
                              </div>
                              {sharedProof.length > 0 && (
                                <ProofGallery urls={sharedProof} height={280} onOpen={(u) => setLightboxUrl(u)} />
                              )}
                              {/* The revisions are a conversation. Reachable from the order itself, not
                                  only from the receipt the customer saw once and closed. */}
                              <button
                                type="button"
                                onClick={() => window.dispatchEvent(new CustomEvent('pmp_open_chat', { detail: { orderCard: {
                                  orderId: String(selectedOrder._id ?? selectedOrder.id ?? ''),
                                  orderNo: selectedOrder.orderNumber || selectedOrder.orderNo || 'Order',
                                  products: requestItems.map(({ it }) => it.productName).filter(Boolean).join(', '),
                                  brief: selectedOrder.designNotes || '',
                                  body: 'Hi! I have a question about my design.',
                                } } }))}
                                style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                                Message the designer
                              </button>
                              {requestItems.map(entry => renderDesignItem(entry, true))}
                            </div>
                          )}

                          {uploadItems.map(entry => renderDesignItem(entry, false))}
                        </div>
                      );

                    })()}

                    {/* Delivery Address */}
                    {selectedOrder.deliveryAddress && Object.keys(selectedOrder.deliveryAddress).length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Delivery Address</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--white)', lineHeight: 1.6 }}>
                          {[selectedOrder.deliveryAddress.house_number, selectedOrder.deliveryAddress.street, selectedOrder.deliveryAddress.subdivision, selectedOrder.deliveryAddress.barangay, selectedOrder.deliveryAddress.city, selectedOrder.deliveryAddress.province, selectedOrder.deliveryAddress.zip].filter(Boolean).join(', ')}
                          {selectedOrder.deliveryAddress.phone && <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--gray)' }}>{selectedOrder.deliveryAddress.phone}</div>}
                        </div>
                      </div>
                    )}

                    {/* Shipment */}
                    {(selectedOrder.courierName || selectedOrder.trackingNumber) && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Shipment</div>
                        <div style={{ background: 'var(--dark)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                          {selectedOrder.courierName && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: selectedOrder.trackingNumber ? '1px solid var(--border)' : 'none' }}>
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

                    {/* Production - one row per job order. An order with two printable items has two
                        JOs, and rendering only the scalar joId showed the customer JOB-001 alone. */}
                    {(selectedOrder.productionJobs?.length || selectedOrder.joId) && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Production</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(selectedOrder.productionJobs?.length
                            ? selectedOrder.productionJobs
                            : [{ joId: selectedOrder.joId, joStatus: selectedOrder.joStatus, targetCompletion: selectedOrder.targetCompletion }]
                          ).map((jo, i) => (
                            <div key={jo.joId || i} style={{ background: 'var(--dark)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 700 }}>{jo.joId}</div>
                                  {jo.label && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {jo.label}{jo.variant ? ` - ${jo.variant}` : ''}{jo.quantity ? ` x${jo.quantity}` : ''}
                                    </div>
                                  )}
                                </div>
                                {jo.joStatus && <StatusBadge status={jo.joStatus} />}
                              </div>
                              {jo.targetCompletion && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px' }}>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Target</span>
                                  <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600 }}>{formatDate(jo.targetCompletion)}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Review — only after payment confirmed */}
                    {selectedOrder.orderStatus?.toLowerCase() === 'delivered' && selectedOrder.paymentStatus === 'paid' && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Your Review</div>
                        {reviewCheckLoading && (
                          <div style={{ height: '60px', background: 'var(--border)', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        )}
                        {/* One block per PRODUCT, not one for the order. A single order-level review
                            was attached to every product in it, so a bad totebag pulled down the mug's
                            rating and each product page showed a score that was partly about something
                            else. It also never said which product was being rated. */}
                        {!reviewCheckLoading && (selectedOrder.items ?? [])
                          .filter(it => it.productId)
                          .map((it, idx) => {
                            const done = orderReviews.find(r => String(r.productId) === String(it.productId));
                            const isOpen = reviewForProduct === String(it.productId);
                            return (
                              <div key={it.productId ?? idx} style={{ padding: '14px', background: 'var(--dark)', borderRadius: '10px', marginBottom: '10px' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)', marginBottom: '8px' }}>
                                  {it.productName}
                                  {it.variantName && <span style={{ color: 'var(--gray)', fontWeight: 400 }}> - {it.variantName}</span>}
                                </div>

                                {done ? (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '5px' }}>
                                      {[1,2,3,4,5].map(s => (
                                        <svg key={s} width="15" height="15" viewBox="0 0 24 24" fill={s <= done.rating ? '#d4a843' : 'none'} stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                      ))}
                                      <span style={{ marginLeft: '4px', fontSize: '0.72rem', color: 'var(--gray)' }}>{done.rating}/5</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--white)', lineHeight: 1.55 }}>{done.comment}</p>
                                  </>
                                ) : isOpen ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>How was this item?</div>
                                    <div style={{ display: 'flex', gap: '3px' }}>
                                      {[1,2,3,4,5].map(s => (
                                        <button key={s} type="button" onClick={() => setReviewRating(s)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                                          <svg width="26" height="26" viewBox="0 0 24 24" fill={s <= reviewRating ? '#d4a843' : 'none'} stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                        </button>
                                      ))}
                                    </div>
                                    <textarea
                                      placeholder="Share your experience... (min. 5 characters)"
                                      value={reviewComment}
                                      maxLength={2000}
                                      onChange={e => setReviewComment(e.target.value.slice(0, 2000))}
                                      style={{ width: '100%', minHeight: '76px', padding: '9px 11px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark2)', color: 'var(--white)', fontSize: '0.84rem', resize: 'vertical', boxSizing: 'border-box' }}
                                    />
                                    {reviewError && <div style={{ color: '#ef4444', fontSize: '0.78rem' }}>{reviewError}</div>}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <button
                                        onClick={() => handleSubmitReview(it.productId)}
                                        disabled={reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5}
                                        style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5) ? 'var(--border)' : '#d4a843', color: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5) ? 'var(--gray)' : '#000', fontSize: '0.86rem', fontWeight: 700, cursor: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5) ? 'not-allowed' : 'pointer' }}
                                      >
                                        {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                                      </button>
                                      <button
                                        onClick={() => { setReviewForProduct(null); setReviewError(null); }}
                                        style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.84rem', cursor: 'pointer' }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => { setReviewForProduct(String(it.productId)); setReviewRating(0); setReviewComment(''); setReviewError(null); }}
                                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid rgba(212,168,67,0.35)', background: 'rgba(212,168,67,0.07)', color: '#d4a843', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    Rate this item
                                  </button>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* RIGHT column */}
                  <div className="oh-modal-right" style={{ display: 'flex', flexDirection: 'column', background: 'var(--dark2)' }}>

                    {/* Items */}
                    {selectedOrder.items?.length > 0 && (
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                          {selectedOrder.items.length} {selectedOrder.items.length === 1 ? 'Item' : 'Items'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {selectedOrder.items.map((item, i) => {
                            const qty       = item.qty || item.quantity || 1;
                            const unitPrice = item.unitPrice ?? item.price ?? 0;
                            const lineTotal = item.lineTotal ?? (unitPrice * qty);
                            const name      = item.productName || item.product_name || 'Product';
                            const variant   = item.variantName || item.variant_name || null;
                            // Same px sizing as the admin order module item card (13px / 11px).
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                <div style={{ width: '38px', height: '38px', borderRadius: '6px', background: (item.thumbnail || item.imageUrl) ? 'transparent' : 'rgba(212,168,67,0.06)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                  {(item.thumbnail || item.imageUrl)
                                    ? <img src={item.thumbnail || item.imageUrl} alt={name} style={{ width: '38px', height: '38px', objectFit: 'cover' }} />
                                    : <NoImage size={18} />
                                  }
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--white)', lineHeight: 1.3 }}>{name}</div>
                                  {variant && <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '1px' }}>{variant}</div>}
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontSize: '11px', color: 'var(--gray)' }}>{formatPeso(unitPrice)} ×{qty}</div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--white)', marginTop: '1px' }}>{formatPeso(lineTotal)}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Pricing - same compact px scale as the admin Payment section. */}
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {selectedOrder.subtotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Subtotal</span>
                          <span style={{ fontSize: '12px', color: 'var(--white)' }}>{formatPeso(selectedOrder.subtotal)}</span>
                        </div>
                      )}
                      {/* A zero shipping fee means two different things - delivery is free, or the
                          recipient pays the rider on arrival. Showing P0.00 for both lets a customer
                          reasonably believe they owe nothing, then meet a rider asking for money. */}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Shipping</span>
                        {(() => {
                          const courierMode = selectedOrder.shippingMode === 'courier_booked'
                            && !(Number(selectedOrder.shippingFee) > 0);
                          if (!courierMode) return (
                            <span style={{ fontSize: '12px', color: 'var(--white)' }}>{formatPeso(selectedOrder.shippingFee ?? 0)}</span>
                          );
                          const cf = Number(selectedOrder.courierFee ?? 0);
                          return (
                            <span style={{ fontSize: '12px', color: '#d4a843', textAlign: 'right' }}>
                              {cf > 0 ? formatPeso(cf) : 'Billed separately'}
                              <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--gray)', fontWeight: 400, marginTop: '1px' }}>
                                {cf <= 0
                                  ? 'We will send the exact fee in chat'
                                  : selectedOrder.courierFeePaid
                                    ? 'Received - nothing to pay the rider'
                                    : 'Paid to the rider, separate from your order total'}
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                      {selectedOrder.isRush && Number(selectedOrder.rushFee) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Rush fee</span>
                          <span style={{ fontSize: '12px', color: '#d4a843' }}>{formatPeso(selectedOrder.rushFee)}</span>
                        </div>
                      )}
                      {selectedOrder.discountAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Discount</span>
                          <span style={{ fontSize: '12px', color: '#22c55e' }}>-{formatPeso(selectedOrder.discountAmount)}</span>
                        </div>
                      )}
                      {selectedOrder.designFeePaid && (() => {
                        // ONE fee for the order however many products the artwork goes on. Summing the
                        // per-line copies of that same fee showed double what was charged.
                        const df = Number(selectedOrder.designFeePaidAmount ?? selectedOrder.designFee ?? 0);
                        return df > 0 ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Design Fee <span style={{ color: '#f59e0b', fontSize: '10px', fontWeight: 700 }}>Paid</span></span>
                            <span style={{ fontSize: '12px', color: '#f59e0b' }}>{formatPeso(df)}</span>
                          </div>
                        ) : null;
                      })()}
                      {selectedOrder.requiresDownpayment && selectedOrder.downPayment > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Down Payment</span>
                          <span style={{ fontSize: '12px', color: 'var(--white)' }}>{formatPeso(selectedOrder.downPayment)}</span>
                        </div>
                      )}
                      {selectedOrder.balance > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Balance Due</span>
                          <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700 }}>{formatPeso(selectedOrder.balance)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)', marginTop: '3px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--white)' }}>Total</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#d4a843' }}>{formatPeso(selectedOrder.totalAmount)}</span>
                      </div>
                    </div>

                    {/* Pay Design Fee - the FIRST payment on a request-design order, collected
                        here (not on the product page). The goods are paid later, after the
                        proof is approved. */}
                    {owesDesignFee(selectedOrder)
                      && selectedOrder.paymentStatus !== 'paid'
                      && !['delivered','Delivered','cancelled','Cancelled','returned','Returned'].includes(selectedOrder.orderStatus)
                      && (
                      <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Pay Design Fee</div>
                        <div style={{ padding: '10px 12px', background: 'var(--dark)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                            <span style={{ color: 'var(--white)' }}>Design fee</span>
                            <span style={{ color: '#d4a843' }}>{formatPeso(selectedOrder.designFee)}</span>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                            Paid now so our designer can start. The order total is settled after you approve the proof.
                          </span>
                        </div>
                        <PaymentPicker
                          methods={['gcash', 'paymaya', 'card'].filter(m => payEnabled[m] !== false)}
                          amount={Number(selectedOrder.designFee)}
                          onPay={(m, c) => handlePayNow(m, c, { designFeeOnly: true })}
                          loading={payNowLoading}
                          error={payNowError}
                        />
                      </div>
                    )}

                    {/* The order is finished and waiting on money. The bell notification is easy to
                        miss, and the Pay Now block below says what to press without saying why it
                        matters now, so the reason sits right above it. */}
                    {['ready_for_delivery', 'for_delivery'].includes(String(selectedOrder.orderStatus))
                      && selectedOrder.paymentStatus !== 'paid'
                      && selectedOrder.paymentMethod !== 'cod'
                      && remainingDue(selectedOrder) > 0 && (
                      <div style={{ margin: '0 18px 14px', padding: '12px 14px', borderRadius: '9px', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.28)' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#d4a843', marginBottom: '3px' }}>
                          Your order is ready
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.55 }}>
                          Settle the remaining {formatPeso(remainingDue(selectedOrder))} below and we will release it for delivery.
                        </div>
                      </div>
                    )}

                    {/* Pay Now / Pay Balance. A downpaid order sits at partial with the balance
                        still owed; without this it could never be settled, so it stuck before
                        delivery. Hidden only once fully paid or the order is finished. Suppressed
                        while a request-design order still owes its design fee. */}
                    {!owesDesignFee(selectedOrder)
                      && selectedOrder.paymentStatus !== 'paid'
                      && !['delivered','Delivered','cancelled','Cancelled','returned','Returned'].includes(selectedOrder.orderStatus)
                      && (selectedOrder.orderStatus === 'awaiting_payment'
                        || selectedOrder.paymentStatus === 'partial'
                        || (selectedOrder.orderStatus === 'Pending' && selectedOrder.paymentMethod !== 'cod'))
                      && (
                      <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>
                          {selectedOrder.orderStatus === 'awaiting_payment' && selectedOrder.designFeePaid ? 'Deposit Due' : 'Pay Now'}
                        </div>

                        {/* An approved proof is held, not made, until the goods are paid for. Saying
                            when the hold lapses is the difference between a customer who pays and one
                            who forgets - and it is why the shop can release the reserved stock later. */}
                        {selectedOrder.orderStatus === 'awaiting_payment' && selectedOrder.paymentDueAt && (
                          <div style={{ padding: '8px 11px', borderRadius: '8px', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                            Your proof is approved and your slot is held until{' '}
                            <strong style={{ color: '#d4a843' }}>
                              {new Date(selectedOrder.paymentDueAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </strong>. Production starts once this payment clears.
                          </div>
                        )}

                        {/* What cancelling costs, said where the money is committed rather than
                            only in a clause ticked weeks ago on the product page. Deliberately
                            derived from the deposit already shown above - the deposit IS the cap. */}
                        <div style={{ padding: '8px 11px', borderRadius: '8px', background: 'var(--dark)', border: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--gray)', lineHeight: 1.55 }}>
                            <strong style={{ color: 'var(--white)' }}>If you cancel later:</strong>{' '}
                            before we start making it, everything comes back except the downpayment.
                            Once production has started we keep the downpayment and nothing more -
                            anything you paid above it is refunded, and you are never billed extra
                            for materials. If <em>we</em> cancel, or we get your order wrong, you get
                            all of it back.
                        </div>

                        {/* Breakdown for awaiting_payment */}
                        {selectedOrder.orderStatus === 'awaiting_payment' && (
                          <div style={{ padding: '10px 12px', background: 'var(--dark)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                              <span style={{ color: 'var(--gray)' }}>Items subtotal</span>
                              <span style={{ color: 'var(--white)' }}>{formatPeso((selectedOrder.items || []).reduce((s, it) => s + (it.lineTotal || (it.unitPrice || 0) * (it.qty || 1)), 0))}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                              <span style={{ color: 'var(--gray)' }}>Shipping</span>
                              <span style={{ color: 'var(--white)' }}>{formatPeso(selectedOrder.shippingFee ?? 0)}</span>
                            </div>
                            {feeCredit > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#22c55e' }}>Design fee paid</span>
                                <span style={{ color: '#22c55e' }}>-{formatPeso(feeCredit)}</span>
                              </div>
                            )}
                            {selectedOrder.downPayment > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#22c55e' }}>DP Paid</span>
                                <span style={{ color: '#22c55e' }}>-{formatPeso(selectedOrder.downPayment)}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700, paddingTop: '5px', borderTop: '1px solid var(--border)', marginTop: '2px' }}>
                              <span style={{ color: 'var(--white)' }}>
                                {selectedOrder.downPayment > 0 ? 'Balance Due' : 'Total Due'}
                              </span>
                              <span style={{ color: '#d4a843' }}>
                                {formatPeso(selectedOrder.downPayment > 0 ? selectedOrder.balance : Math.max(0, (selectedOrder.totalAmount || 0) - feeCredit))}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* DP / Full toggle — only if no DP paid yet and order supports DP */}
                        {selectedOrder.orderStatus === 'awaiting_payment' && !selectedOrder.downPayment && selectedOrder.requiresDownpayment && selectedOrder.downpaymentPercent > 0 && (() => {
                          const owed = Math.max(0, (selectedOrder.totalAmount || 0) - feeCredit);
                          const dpAmt = Math.round(owed * selectedOrder.downpaymentPercent / 100 * 100) / 100;
                          return (
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
                              <button onClick={() => setPayFullToggle(false)}
                                style={{ flex: 1, padding: '7px 6px', borderRadius: '7px', border: `1px solid ${!payFullToggle ? '#d4a843' : 'var(--border)'}`, background: !payFullToggle ? 'rgba(212,168,67,0.1)' : 'transparent', color: !payFullToggle ? '#d4a843' : 'var(--gray)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center', lineHeight: 1.4 }}>
                                Pay {selectedOrder.downpaymentPercent}% Down<br/><span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{formatPeso(dpAmt)}</span>
                              </button>
                              <button onClick={() => setPayFullToggle(true)}
                                style={{ flex: 1, padding: '7px 6px', borderRadius: '7px', border: `1px solid ${payFullToggle ? '#d4a843' : 'var(--border)'}`, background: payFullToggle ? 'rgba(212,168,67,0.1)' : 'transparent', color: payFullToggle ? '#d4a843' : 'var(--gray)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center', lineHeight: 1.4 }}>
                                Pay Full<br/><span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{formatPeso(owed)}</span>
                              </button>
                            </div>
                          );
                        })()}

                        {/* One shared picker - same UI here as at checkout. GCash/Maya redirect
                            (no number to enter); only a card is filled inline. */}
                        {(() => {
                          const isUnpaidFirst = selectedOrder.paymentStatus === 'unpaid';
                          // The design fee was already collected at checkout, so the deposit is a
                          // share of what is STILL owed. Taking a percentage of the gross total would
                          // quietly charge for that fee a second time.
                          const owed = Math.max(0, (selectedOrder.totalAmount || 0) - feeCredit);
                          const dpAmt = Math.round(owed * (selectedOrder.downpaymentPercent || 0) / 100 * 100) / 100;
                          const balanceAmt = selectedOrder.balance != null && selectedOrder.balance !== ''
                            ? Number(selectedOrder.balance)
                            : Math.max(0, (selectedOrder.totalAmount || 0) - (selectedOrder.downPayment || 0));
                          const chargeAmount = isUnpaidFirst
                            ? ((selectedOrder.requiresDownpayment && selectedOrder.downpaymentPercent > 0 && !payFullToggle) ? dpAmt : owed)
                            : balanceAmt;
                          return (
                            <PaymentPicker
                              methods={['gcash', 'paymaya', 'card'].filter(m => payEnabled[m] !== false)}
                              amount={chargeAmount}
                              onPay={handlePayNow}
                              loading={payNowLoading}
                              error={payNowError}
                            />
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', background: 'transparent', flexShrink: 0 }}>
              <div>
                {reorderMsg && <span style={{ fontSize: '0.8rem', color: reorderMsg.includes('Failed') ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{reorderMsg}</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Was `=== 'Pending'` with a capital P while the canonical value is lowercase, so the
                    button never appeared for anyone. It shows while nothing has been committed yet:
                    no job order, and the order has not entered production. */}
                {!detailLoading && !detailError
                  && ['pending', 'awaiting_payment', 'pending_design', 'pending_review'].includes(String(selectedOrder?.orderStatus))
                  && !(selectedOrder?.productionJobs?.length) && (
                  <button
                    onClick={() => { closeModal(); setCancelTarget(selectedOrder); }}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel Order
                  </button>
                )}
                {!detailLoading && !detailError && !selectedOrder?.isCustomOrder && selectedOrder?.orderStatus === 'Delivered' && selectedOrder?.items?.length > 0 && (
                  <button onClick={handleReorder} disabled={reorderLoading} style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#d4a843', color: '#000', fontSize: '0.875rem', fontWeight: 700, cursor: reorderLoading ? 'not-allowed' : 'pointer', opacity: reorderLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.39"/></svg>
                    {reorderLoading ? 'Adding...' : 'Reorder'}
                  </button>
                )}
                {/* View Receipt - re-accessible anytime (payment-success renders the receipt from the
                    order id: shows the downpayment receipt while partial, the fully-paid one once paid). */}
                {!detailLoading && !detailError && (['partial', 'paid'].includes(selectedOrder?.paymentStatus) || selectedOrder?.designFeePaid) && (
                  <a
                    href={`/shop/payment-success?id=${selectedOrder?._id ?? selectedOrder?.id}&view=1`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--gold)', background: 'transparent', color: 'var(--gold)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
                    View Receipt
                  </a>
                )}
                <button onClick={closeModal} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {/* PayNow Verifying Overlay */}
      {payNowVerifying && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--dark2)', borderRadius: '18px', padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, border: '3px solid #d4a843', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
            <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: 6 }}>Verifying payment…</p>
            <p style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Please wait, this may take a few seconds.</p>
          </div>
        </div>
      )}

      {/* PayNow Failed Modal */}
      {payNowFailedModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--dark2)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '18px', padding: '40px 32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <h2 style={{ color: 'var(--white)', fontWeight: 700, fontSize: '1.3rem', marginBottom: 8 }}>Payment Cancelled</h2>
            <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.6 }}>
              Your payment was not completed. You can try again from your order details.
            </p>
            <button onClick={() => setPayNowFailedModal(false)} style={{ width: '100%', padding: '12px', background: '#d4a843', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
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
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#ef4444' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Cancel this order?</h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--gray)' }}>{orderNo(cancelTarget)}</p>
              </div>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.6 }}>
              {cancelTarget?.requiresDownpayment && cancelTarget?.downPayment > 0
                ? 'This action cannot be undone. The order will be cancelled. Note: down payments are non-refundable.'
                : 'This action cannot be undone. The order will be cancelled.'}
            </p>
            {/* Why someone cancelled is the only thing that separates a pricing problem from a
                delivery-time problem from a change of mind. Required, because an optional box on a
                screen someone is trying to leave is a box nobody fills in. */}
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
              Why are you cancelling?
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {['Changed my mind', 'Ordered by mistake', 'Too expensive', 'Needed it sooner', 'Other'].map(r => (
                <button key={r} type="button" onClick={() => { setCancelReason(r); if (r !== 'Other') setCancelOther(''); }}
                  style={{ padding: '5px 10px', borderRadius: '999px', fontSize: '0.75rem', cursor: 'pointer',
                    border: `1px solid ${cancelReason === r ? '#d4a843' : 'var(--border)'}`,
                    background: cancelReason === r ? 'rgba(212,168,67,0.1)' : 'transparent',
                    color: cancelReason === r ? '#d4a843' : 'var(--gray)',
                    fontWeight: cancelReason === r ? 700 : 500 }}>
                  {r}
                </button>
              ))}
            </div>
            {cancelReason === 'Other' && (
              <textarea value={cancelOther} maxLength={300}
                onChange={e => setCancelOther(e.target.value.slice(0, 300))}
                placeholder="Tell us briefly what happened"
                style={{ width: '100%', minHeight: '64px', padding: '9px 11px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--white)', fontSize: '0.82rem', marginBottom: '8px', resize: 'vertical', boxSizing: 'border-box' }} />
            )}
            <div style={{ height: '10px' }} />

            {cancelError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.8rem' }}>
                {cancelError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setCancelTarget(null); setCancelError(null); }} disabled={cancelling} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.875rem', cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.5 : 1 }}>
                Keep Order
              </button>
              <button onClick={cancelOrder} disabled={cancelling || !cancelReason || (cancelReason === 'Other' && !cancelOther.trim())} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: (cancelling || !cancelReason || (cancelReason === 'Other' && !cancelOther.trim())) ? 'rgba(239,68,68,0.4)' : '#ef4444', color: 'var(--white)', fontSize: '0.875rem', fontWeight: 700, cursor: cancelling ? 'not-allowed' : 'pointer' }}>
                {cancelling ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
