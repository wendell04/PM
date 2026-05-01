'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyShopOrders, fetchMyShopOrder } from '@/lib/orderTrackingApi';
import { StatusBadge, formatDate, formatPeso } from '@/lib/shopUtils';
import { getEcho, disconnectEcho } from '@/lib/echo';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useCart } from '@/app/shop/layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const TABS = ['All', 'Custom', 'Pending', 'In Production', 'For Delivery', 'Delivered', 'Cancelled'];

const UPLOAD_STEPS = [
  { key: 'pending_review',      label: 'Review'   },
  { key: 'awaiting_payment',    label: 'Payment'  },
  { key: 'awaiting_production', label: 'Queued'   },
  { key: 'in_production',       label: 'Printing' },
  { key: 'shipped',             label: 'Shipped'  },
  { key: 'delivered',           label: 'Done'     },
];

const REQUEST_STEPS = [
  { key: 'pending_design',      label: 'Design'   },
  { key: 'proof_sent',          label: 'Proof'    },
  { key: 'design_approved',     label: 'Approved' },
  { key: 'awaiting_production', label: 'Queued'   },
  { key: 'in_production',       label: 'Printing' },
  { key: 'shipped',             label: 'Shipped'  },
  { key: 'delivered',           label: 'Done'     },
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

const TRACK_STEPS = [
  {
    key: 'Pending',
    label: 'Order Placed',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    key: 'In Production',
    label: 'In Production',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
    ),
  },
  {
    key: 'For Delivery',
    label: 'For Delivery',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13"/>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
  },
  {
    key: 'Delivered',
    label: 'Delivered',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
  },
];

function OrderTracker({ status, statusHistory = [] }) {
  const historyMap = {};
  (statusHistory || []).forEach(entry => {
    if (entry?.status && entry?.at) historyMap[entry.status] = entry.at;
  });

  const isTerminal = status === 'Cancelled' || status === 'Returned';
  const currentIdx = TRACK_STEPS.findIndex(s => s.key === status);

  if (isTerminal) {
    const isCancelled = status === 'Cancelled';
    return (
      <div style={{
        padding: '0.875rem 1rem',
        borderRadius: '10px',
        background: isCancelled ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.08)',
        border: `1px solid ${isCancelled ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.3)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        marginBottom: '1.25rem',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', color: isCancelled ? 'var(--red)' : '#f97316' }}>
          {isCancelled ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-3.39"/>
            </svg>
          )}
        </span>
        <div>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: isCancelled ? 'var(--red)' : '#f97316',
          }}>
            Order {status}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '2px' }}>
            {isCancelled
              ? 'This order was cancelled.'
              : 'This order was returned.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'var(--gold)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '0.875rem',
      }}>
        Order Status
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
        {TRACK_STEPS.map((step, idx) => {
          const isDone    = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {idx > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '14px',
                  left: 0,
                  width: '50%',
                  height: '2px',
                  background: idx <= currentIdx ? 'var(--gold)' : 'var(--border)',
                  transition: 'background 0.3s',
                }} />
              )}
              {idx < TRACK_STEPS.length - 1 && (
                <div style={{
                  position: 'absolute',
                  top: '14px',
                  right: 0,
                  width: '50%',
                  height: '2px',
                  background: idx < currentIdx ? 'var(--gold)' : 'var(--border)',
                  transition: 'background 0.3s',
                }} />
              )}
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                zIndex: 1,
                background: isCurrent
                  ? 'var(--gold)'
                  : isDone
                    ? 'rgba(212,168,67,0.2)'
                    : 'var(--border)',
                border: isCurrent
                  ? '2px solid var(--gold)'
                  : isDone
                    ? '2px solid var(--gold)'
                    : '2px solid var(--border)',
                color: isCurrent ? 'var(--black)' : isDone ? 'var(--gold)' : 'var(--gray)',
                boxShadow: isCurrent ? '0 0 0 3px rgba(212,168,67,0.2)' : 'none',
                transition: 'all 0.3s',
                flexShrink: 0,
              }}>
                {isDone ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : step.icon}
              </div>
              <div style={{
                marginTop: '0.4rem',
                fontSize: '0.68rem',
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? 'var(--gold)' : isDone ? 'var(--white)' : 'var(--gray)',
                textAlign: 'center',
                lineHeight: 1.3,
                maxWidth: '68px',
                transition: 'color 0.3s',
              }}>
                {step.label}
                {(isDone || isCurrent) && historyMap[step.key] && (
                  <div style={{
                    marginTop: '3px',
                    fontSize: '0.6rem',
                    color: 'var(--gray)',
                    fontWeight: 400,
                    lineHeight: 1.3,
                  }}>
                    {new Date(historyMap[step.key]).toLocaleDateString('en-PH', {
                      month: 'short', day: 'numeric',
                    })}
                    {' '}
                    {new Date(historyMap[step.key]).toLocaleTimeString('en-PH', {
                      hour: 'numeric', minute: '2-digit', hour12: true,
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CustomOrderTracker({ orderStatus, designType }) {
  const steps = designType === 'upload' ? UPLOAD_STEPS : REQUEST_STEPS;
  const currentIdx = steps.findIndex(s => s.key === orderStatus);
  const isTerminal = orderStatus === 'Cancelled' || orderStatus === 'Returned';

  const statusLabel = CUSTOM_STATUS_LABEL[orderStatus] || orderStatus;
  const statusColor = {
    pending_review:      '#60a5fa',
    awaiting_payment:    '#f59e0b',
    pending_design:      '#f59e0b',
    proof_sent:          '#a78bfa',
    revision_requested:  '#f97316',
    design_approved:     '#34d399',
    awaiting_production: '#6366f1',
    in_production:       '#3b82f6',
    ready_for_pickup:    '#4ade80',
    shipped:             '#a78bfa',
    delivered:           '#4ade80',
  }[orderStatus] || '#6b7280';

  if (isTerminal) {
    return (
      <div style={{
        padding: '0.875rem 1rem', borderRadius: '10px', marginBottom: '1.25rem',
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
        display: 'flex', alignItems: 'center', gap: '0.625rem',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--red)' }}>Order {orderStatus}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '2px' }}>This order was {orderStatus.toLowerCase()}.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {designType === 'upload' ? 'Upload Design' : 'Design Request'} Progress
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
          background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}40`,
        }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
        {steps.map((step, idx) => {
          const isDone    = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {idx > 0 && (
                <div style={{ position: 'absolute', top: '12px', left: 0, width: '50%', height: '2px', background: idx <= currentIdx ? 'var(--gold)' : 'var(--border)' }} />
              )}
              {idx < steps.length - 1 && (
                <div style={{ position: 'absolute', top: '12px', right: 0, width: '50%', height: '2px', background: idx < currentIdx ? 'var(--gold)' : 'var(--border)' }} />
              )}
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%', zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isCurrent ? 'var(--gold)' : isDone ? 'rgba(212,168,67,0.2)' : 'var(--border)',
                border: isCurrent || isDone ? '2px solid var(--gold)' : '2px solid var(--border)',
                boxShadow: isCurrent ? '0 0 0 3px rgba(212,168,67,0.2)' : 'none',
                transition: 'all 0.3s', flexShrink: 0,
              }}>
                {isDone && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <div style={{
                marginTop: '4px', fontSize: '0.62rem', textAlign: 'center', lineHeight: 1.3, maxWidth: '52px',
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? 'var(--gold)' : isDone ? 'var(--white)' : 'var(--gray)',
              }}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>

      {orderStatus === 'awaiting_payment' && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', fontSize: '0.8rem', color: '#f59e0b' }}>
          Payment required to move to production. Use the Pay Now button below.
        </div>
      )}
      {orderStatus === 'proof_sent' && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: '8px', fontSize: '0.8rem', color: '#a78bfa' }}>
          Your design proof is ready. Please review and approve or request changes below.
        </div>
      )}
      {orderStatus === 'revision_requested' && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '8px', fontSize: '0.8rem', color: '#f97316' }}>
          Revision submitted — we're working on the updated design and will notify you when it's ready.
        </div>
      )}
    </div>
  );
}

function PaymentStatusBadge({ status }) {
  if (!status || status === 'paid') return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '0.7rem',
      fontWeight: 600,
      background: status === 'unpaid' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
      color: status === 'unpaid' ? 'var(--red)' : 'var(--gold)',
      border: `1px solid ${status === 'unpaid' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'}`,
    }}>
      {status === 'unpaid' ? 'Unpaid' : 'Partial Payment'}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      padding: '1.25rem',
      background: 'var(--dark2)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ height: '16px', background: 'var(--border)', borderRadius: '4px', width: '30%' }} />
        <div style={{ height: '24px', background: 'var(--border)', borderRadius: '999px', width: '100px' }} />
      </div>
      <div style={{ height: '14px', background: 'var(--border)', borderRadius: '4px', width: '50%', marginBottom: '0.5rem' }} />
      <div style={{ height: '12px', background: 'var(--border)', borderRadius: '4px', width: '25%' }} />
    </div>
  );
}

function apiHeaders(token) {
  const h = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (process.env.NODE_ENV === 'development') {
    h['ngrok-skip-browser-warning'] = '1';
  }
  return h;
}

// ─── Main Page ──────────────────────────────────────────
export default function OrdersHistoryPage() {
  const { token } = useAuth();
  const { addToCart } = useCart();
  const router = useRouter();

  const [orders, setOrders]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [activeTab, setActiveTab]       = useState('All');
  const [visibleCount, setVisibleCount] = useState(5);

  // Detail modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState(null);
  const [modalOpen, setModalOpen]         = useState(false);

  // Reorder
  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderMsg, setReorderMsg]         = useState('');

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState(null);

  // Pay Now
  const [payNowLoading, setPayNowLoading] = useState(false);
  const [payNowError, setPayNowError]     = useState(null);
  const [payMethod, setPayMethod]         = useState(null);

  // Design re-upload
  const [showReupload, setShowReupload]       = useState(false);
  const [reuploadFile, setReuploadFile]       = useState(null);
  const [reuploadNotes, setReuploadNotes]     = useState('');
  const [reuploadLoading, setReuploadLoading] = useState(false);
  const [reuploadError, setReuploadError]     = useState(null);
  const [reuploadSuccess, setReuploadSuccess] = useState(false);

  // Admin design draft review
  const [approveDesignLoading, setApproveDesignLoading] = useState(false);
  const [approveDesignError, setApproveDesignError]     = useState(null);
  const [showRevisionForm, setShowRevisionForm]         = useState(false);
  const [revisionNotes, setRevisionNotes]               = useState('');
  const [revisionLoading, setRevisionLoading]           = useState(false);
  const [revisionError, setRevisionError]               = useState(null);
  const [revisionSuccess, setRevisionSuccess]           = useState(false);

  // Reviews
  const [existingReview, setExistingReview]       = useState(null);
  const [reviewCheckLoading, setReviewCheckLoading] = useState(false);
  const [reviewRating, setReviewRating]           = useState(0);
  const [reviewComment, setReviewComment]         = useState('');
  const [reviewSubmitting, setReviewSubmitting]   = useState(false);
  const [reviewError, setReviewError]             = useState(null);
  const [reviewSuccess, setReviewSuccess]         = useState(false);

  // ── Load orders list ───────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyShopOrders(token);
      const raw = Array.isArray(data) ? data : [];
      setOrders(raw);
      setVisibleCount(5);
    } catch (err) {
      if (err.message === 'Unauthorized') {
        router.push('/shop');
        return;
      }
      setError(err.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, [token, router]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Auto-refresh every 30s — paused when modal is open
  const pollRef = useRef(null);
  const echoChannelsRef = useRef([]);
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => {
      if (!modalOpen) loadOrders();
    }, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, modalOpen, loadOrders]);

  // Reverb — subscribe to order.{id} for each loaded order
  useEffect(() => {
    if (!token || orders.length === 0) return;
    echoChannelsRef.current.forEach(ch => {
      try { ch.stopListening('.order.status.updated'); } catch {}
    });
    echoChannelsRef.current = [];
    let echo;
    try { echo = getEcho(token); } catch { return; }
    if (!echo) return;
    orders.forEach(order => {
      const id = order._id ?? order.id;
      if (!id) return;
      try {
        const ch = echo.private(`order.${id}`)
          .listen('.order.status.updated', () => { loadOrders(); });
        echoChannelsRef.current.push(ch);
      } catch {}
    });
    return () => {
      echoChannelsRef.current.forEach(ch => {
        try { ch.stopListening('.order.status.updated'); } catch {}
      });
      echoChannelsRef.current = [];
    };
  }, [token, orders, loadOrders]);

  // Stop listening to order channels on unmount (Echo singleton stays alive for chat)
  useEffect(() => {
    return () => {
      echoChannelsRef.current.forEach(ch => {
        try { ch.stopListening('.order.status.updated'); } catch {}
      });
      echoChannelsRef.current = [];
    };
  }, []);

  // ── Reset modal-level state ────────────────────────
  const resetModalState = () => {
    setPayNowError(null);
    setPayMethod(null);
    setShowReupload(false);
    setReuploadFile(null);
    setReuploadNotes('');
    setReuploadError(null);
    setReuploadSuccess(false);
    setApproveDesignLoading(false);
    setApproveDesignError(null);
    setShowRevisionForm(false);
    setRevisionNotes('');
    setRevisionLoading(false);
    setRevisionError(null);
    setRevisionSuccess(false);
    setReorderMsg('');
    setExistingReview(null);
    setReviewCheckLoading(false);
    setReviewRating(0);
    setReviewComment('');
    setReviewSubmitting(false);
    setReviewError(null);
    setReviewSuccess(false);
  };

  // ── Load existing review for an order ─────────────
  const loadOrderReview = useCallback(async (orderId) => {
    setReviewCheckLoading(true);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/orders/my/${orderId}/review`,
        { headers: apiHeaders(token) },
        10000
      );
      const data = await res.json();
      if (res.ok && data.data) setExistingReview(data.data);
    } catch {}
    finally {
      setReviewCheckLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Open detail modal ──────────────────────────────
  const openDetail = useCallback(async (order) => {
    resetModalState();
    setSelectedOrder(order);
    setDetailError(null);
    setDetailLoading(true);
    setModalOpen(true);
    try {
      const data = await fetchMyShopOrder(token, order.id ?? order._id);
      const detail = data?.data ?? data;
      setSelectedOrder(detail);
      if (detail?.orderStatus === 'Delivered') {
        loadOrderReview(detail._id ?? detail.id ?? order._id ?? order.id);
      }
    } catch (err) {
      setDetailError(err.message || 'Failed to load order details.');
    } finally {
      setDetailLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const closeModal = () => {
    setModalOpen(false);
    setSelectedOrder(null);
    setDetailError(null);
    resetModalState();
  };

  // ── Cancel order ───────────────────────────────────
  const cancelOrder = async () => {
    if (!cancelTarget || !token) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/orders/my/${cancelTarget._id ?? cancelTarget.id}/cancel`,
        { method: 'POST', headers: { ...apiHeaders(token), 'Content-Type': 'application/json' } },
        15000
      );
      const data = await res.json();
      if (!res.ok) { setCancelError(data.message || 'Failed to cancel order.'); return; }
      setCancelTarget(null);
      loadOrders();
    } catch (err) {
      setCancelError(err.message || 'Failed to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  // ── Reorder ────────────────────────────────────────
  const handleReorder = async () => {
    if (!selectedOrder?.items?.length) return;
    setReorderLoading(true);
    setReorderMsg('');
    try {
      for (const item of selectedOrder.items) {
        await addToCart(
          { _id: item.productId, name: item.productName, price: item.unitPrice, flatPrice: item.unitPrice },
          item.qty ?? 1,
          item.variantId ?? null,
          item.variantName ?? null,
        );
      }
      setReorderMsg('Items added to cart!');
      setTimeout(() => setReorderMsg(''), 3000);
    } catch {
      setReorderMsg('Failed to add items to cart.');
    } finally {
      setReorderLoading(false);
    }
  };

  // ── Pay Now ────────────────────────────────────────
  const handlePayNow = async () => {
    if (!selectedOrder || !token || !payMethod) return;
    setPayNowLoading(true);
    setPayNowError(null);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/payment/create-order-pay-link`,
        {
          method: 'POST',
          headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: selectedOrder._id ?? selectedOrder.id, paymentMethod: payMethod }),
        },
        15000
      );
      const data = await res.json();
      if (!res.ok) { setPayNowError(data.message || 'Failed to create payment link.'); return; }
      if (data.data?.checkoutUrl) {
        window.location.href = data.data.checkoutUrl;
      }
    } catch (err) {
      setPayNowError(err.message || 'Failed to create payment link.');
    } finally {
      setPayNowLoading(false);
    }
  };

  // ── Re-upload design ───────────────────────────────
  const handleReupload = async () => {
    if (!selectedOrder || !token) return;
    if (!reuploadFile && !reuploadNotes.trim()) return;
    setReuploadLoading(true);
    setReuploadError(null);
    try {
      const formData = new FormData();
      if (reuploadFile) formData.append('design_file', reuploadFile);
      if (reuploadNotes.trim()) formData.append('design_notes', reuploadNotes.trim());

      const res = await fetchWithTimeout(
        `${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/reupload-design`,
        { method: 'POST', headers: apiHeaders(token), body: formData },
        20000
      );
      const data = await res.json();
      if (!res.ok) { setReuploadError(data.message || 'Failed to submit design.'); return; }

      setReuploadSuccess(true);
      setShowReupload(false);
      setReuploadFile(null);
      setReuploadNotes('');
      const oid = selectedOrder._id ?? selectedOrder.id;
      setSelectedOrder(prev => ({ ...prev, designStatus: 'pending_review', designRejectionReason: null }));
      setOrders(prev => prev.map(o => (o._id ?? o.id) === oid ? { ...o, designStatus: 'pending_review' } : o));
      setTimeout(() => setReuploadSuccess(false), 5000);
    } catch (err) {
      setReuploadError(err.message || 'Failed to submit design.');
    } finally {
      setReuploadLoading(false);
    }
  };

  // ── Approve admin design draft ─────────────────────────
  const handleApproveAdminDesign = async () => {
    if (!selectedOrder || !token) return;
    setApproveDesignLoading(true);
    setApproveDesignError(null);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/approve-admin-design`,
        { method: 'POST', headers: apiHeaders(token) },
        15000
      );
      const data = await res.json();
      if (!res.ok) { setApproveDesignError(data.message || 'Failed to approve design.'); return; }
      const oid = selectedOrder._id ?? selectedOrder.id;
      setSelectedOrder(prev => ({ ...prev, designStatus: 'approved' }));
      setOrders(prev => prev.map(o => (o._id ?? o.id) === oid ? { ...o, designStatus: 'approved' } : o));
    } catch (err) {
      setApproveDesignError(err.message || 'Failed to approve design.');
    } finally {
      setApproveDesignLoading(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!selectedOrder || !token) return;
    setRevisionLoading(true);
    setRevisionError(null);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/request-revision`,
        {
          method: 'POST',
          headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: revisionNotes.trim() || null }),
        },
        15000
      );
      const data = await res.json();
      if (!res.ok) { setRevisionError(data.message || 'Failed to submit revision request.'); return; }
      const oid = selectedOrder._id ?? selectedOrder.id;
      setSelectedOrder(prev => ({ ...prev, designStatus: 'revision_requested' }));
      setOrders(prev => prev.map(o => (o._id ?? o.id) === oid ? { ...o, designStatus: 'revision_requested' } : o));
      setRevisionSuccess(true);
      setShowRevisionForm(false);
      setRevisionNotes('');
    } catch (err) {
      setRevisionError(err.message || 'Failed to submit revision request.');
    } finally {
      setRevisionLoading(false);
    }
  };

  // ── Submit review ──────────────────────────────────
  const handleSubmitReview = async () => {
    if (!selectedOrder || !token || reviewRating === 0 || reviewComment.trim().length < 5) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/orders/my/${selectedOrder._id ?? selectedOrder.id}/review`,
        {
          method: 'POST',
          headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
        },
        15000
      );
      const data = await res.json();
      if (!res.ok) { setReviewError(data.message || 'Failed to submit review.'); return; }
      setExistingReview(data.data);
      setReviewSuccess(true);
    } catch (err) {
      setReviewError(err.message || 'Failed to submit review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ── Derived: filtered + paginated orders ──────────
  const filteredOrders = (() => {
    if (activeTab === 'All') return orders;
    if (activeTab === 'Custom') return orders.filter(o => o.isCustomOrder);
    if (activeTab === 'Delivered') return orders.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'delivered');
    return orders.filter(o => o.orderStatus === activeTab);
  })();

  // ── Render ─────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--dark)', padding: '24px 16px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <Link href="/shop" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            color: 'var(--gray)', fontSize: '0.85rem', textDecoration: 'none',
            marginBottom: '12px',
          }}>
            ← Back to Shop
          </Link>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>
            My Orders
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--gray)' }}>
            Regular and custom orders in one place
          </p>
        </div>

        {/* Status filter tabs */}
        {!loading && !error && orders.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '20px',
            flexWrap: 'wrap',
          }}>
            {TABS.map(tab => {
              const count = tab === 'All'
                ? orders.length
                : tab === 'Custom'
                  ? orders.filter(o => o.isCustomOrder).length
                  : tab === 'Delivered'
                    ? orders.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'delivered').length
                    : orders.filter(o => o.orderStatus === tab).length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setVisibleCount(5); }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '999px',
                    border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`,
                    background: isActive ? 'rgba(212,168,67,0.12)' : 'var(--dark2)',
                    color: isActive ? 'var(--gold)' : 'var(--gray)',
                    fontSize: '0.8rem',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab}
                  {count > 0 && (
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: '999px',
                      background: isActive ? 'var(--gold)' : 'var(--border)',
                      color: isActive ? 'var(--dark)' : 'var(--gray)',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      minWidth: '18px',
                      textAlign: 'center',
                      lineHeight: 1.6,
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            padding: '16px', borderRadius: '8px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: '16px',
          }}>
            <span>{error}</span>
            <button
              onClick={loadOrders}
              style={{
                background: 'none',
                border: '1px solid var(--red)',
                borderRadius: '6px',
                color: 'var(--red)',
                padding: '4px 12px', fontSize: '13px', cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* No orders at all */}
        {!loading && !error && orders.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '4rem 1.5rem',
            background: 'rgba(212,168,67,0.03)',
            border: '1px dashed rgba(212,168,67,0.15)',
            borderRadius: '16px',
          }}>
            <div style={{
              width: '80px', height: '80px',
              borderRadius: '50%',
              background: 'rgba(212,168,67,0.08)',
              border: '1px solid rgba(212,168,67,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                stroke="rgba(212,168,67,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '6px' }}>
              No orders yet
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Your purchase history will appear here once you place an order.
            </div>
            <Link href="/shop" style={{
              display: 'inline-block',
              padding: '10px 28px',
              borderRadius: '8px',
              background: 'var(--gold)',
              color: 'var(--dark)',
              fontWeight: 700,
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}>
              Browse Shop
            </Link>
          </div>
        )}

        {/* Empty state for active tab filter */}
        {!loading && !error && orders.length > 0 && filteredOrders.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '2.5rem 1.5rem',
            background: 'var(--dark2)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            color: 'var(--gray)',
            fontSize: '0.875rem',
          }}>
            No {activeTab.toLowerCase()} orders.
          </div>
        )}

        {/* Order list */}
        {!loading && !error && filteredOrders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredOrders.slice(0, visibleCount).map(order => {
              const oid = order.id ?? order._id;
              const rawItems = order.items || [];
              const items = Array.isArray(rawItems) ? rawItems : (typeof rawItems === 'string' ? (() => { try { return JSON.parse(rawItems); } catch { return []; } })() : []);
              const firstName = (items[0]?.productName || items[0]?.product_name || 'Order') + (items[0]?.variantName ? ` — ${items[0].variantName}` : '');
              const itemSummary = items.length > 1
                ? `${firstName} +${items.length - 1} more`
                : firstName;
              return (
                <div
                  key={oid}
                  onClick={() => openDetail(order)}
                  style={{
                    background: 'var(--dark2)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(212,168,67,0.5)';
                    e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Top row: icon + order # + badges */}
                  <div style={{
                    padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{
                        width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: order.isCustomOrder ? 'rgba(99,102,241,0.12)' : 'rgba(212,168,67,0.08)',
                        border: `1px solid ${order.isCustomOrder ? 'rgba(99,102,241,0.25)' : 'rgba(212,168,67,0.2)'}`,
                      }}>
                        {order.isCustomOrder ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                          </svg>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.5px', fontFamily: 'monospace' }}>
                          #{oid?.slice(-8).toUpperCase()}
                        </div>
                        {order.isCustomOrder && (
                          <div style={{ fontSize: '0.68rem', color: '#6366f1', fontWeight: 600, marginTop: '1px' }}>
                            Custom · {order.designType === 'upload' ? 'Upload Design' : 'Design Request'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <PaymentStatusBadge status={order.paymentStatus} />
                      <StatusBadge status={order.orderStatus} />
                    </div>
                  </div>

                  {/* Middle: item summary */}
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{
                      fontSize: '0.875rem', color: 'var(--gray)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {itemSummary}
                    </div>
                  </div>

                  {/* Bottom: date + amount + action hint */}
                  <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.77rem', color: 'var(--gray)' }}>
                      {formatDate(order.createdAt)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {order.orderStatus === 'awaiting_payment' && (
                        <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>
                          Action needed ›
                        </span>
                      )}
                      {order.orderStatus === 'proof_sent' && (
                        <span style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 700 }}>
                          Review proof ›
                        </span>
                      )}
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--gold)' }}>
                        {formatPeso(order.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredOrders.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 5)}
                style={{
                  marginTop: '4px',
                  padding: '0.625rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--dark2)',
                  color: 'var(--gray)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--gold)';
                  e.currentTarget.style.color = 'var(--gold)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--gray)';
                }}
              >
                Show more ({filteredOrders.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Detail Modal ──────────────────────────────── */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              width: '100%', maxWidth: '800px',
              maxHeight: '92vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Modal header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>
                  Order Details
                </h2>
                {selectedOrder && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '2px', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                    #{(selectedOrder.id ?? selectedOrder._id)?.slice(-8).toUpperCase()}
                    {selectedOrder.isCustomOrder && (
                      <span style={{ marginLeft: '8px', color: '#6366f1', fontFamily: 'sans-serif', fontWeight: 600 }}>
                        Custom · {selectedOrder.designType === 'upload' ? 'Upload Design' : 'Design Request'}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={closeModal}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--gray)', fontSize: '1.25rem',
                  cursor: 'pointer', padding: '4px', flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

              {detailLoading && (
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[40, 70, 55, 80, 45].map((w, i) => (
                    <div key={i} style={{
                      height: i === 3 ? '80px' : '13px',
                      background: 'var(--border)',
                      borderRadius: i === 3 ? '8px' : '4px',
                      width: `${w}%`,
                      animation: 'pulse 1.5s ease-in-out infinite',
                      animationDelay: `${i * 0.1}s`,
                    }} />
                  ))}
                </div>
              )}

              {!detailLoading && detailError && (
                <div style={{
                  margin: '24px',
                  padding: '12px 16px', borderRadius: '8px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid var(--red)',
                  color: 'var(--red)',
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: '12px',
                }}>
                  <span>{detailError}</span>
                  <button
                    onClick={() => selectedOrder && openDetail(selectedOrder)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--red)',
                      borderRadius: '6px',
                      color: 'var(--red)',
                      padding: '4px 10px', fontSize: '12px', cursor: 'pointer',
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!detailLoading && !detailError && selectedOrder && (
                <div style={{ display: 'flex', height: '100%', overflow: 'hidden', minHeight: 0 }}>

                  {/* ── LEFT COLUMN ── */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>

                  {/* Tracker */}
                  {selectedOrder.isCustomOrder ? (
                    <CustomOrderTracker
                      orderStatus={selectedOrder.orderStatus}
                      designType={selectedOrder.designType}
                    />
                  ) : (
                    <OrderTracker
                      status={selectedOrder.orderStatus}
                      statusHistory={selectedOrder.statusHistory}
                    />
                  )}

                  {/* Order Details meta */}
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                      Order Details
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {[
                        ['Placed',   formatDate(selectedOrder.createdAt)],
                        selectedOrder.paymentMethod && selectedOrder.paymentMethod !== 'cod'
                          ? ['Method', { cod: 'Cash on Delivery', gcash: 'GCash', paymaya: 'Maya', card: 'Credit / Debit Card' }[selectedOrder.paymentMethod] ?? selectedOrder.paymentMethod]
                          : selectedOrder.paymentMethod === 'cod' && !selectedOrder.isCustomOrder
                            ? ['Method', 'Cash on Delivery']
                            : null,
                      ].filter(Boolean).map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{label}</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600 }}>{value}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Status</span>
                        <StatusBadge status={selectedOrder.orderStatus} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: selectedOrder.designStatus ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Payment</span>
                        {selectedOrder.paymentStatus === 'paid'
                          ? <span style={{ fontSize: '0.82rem', color: 'var(--green)', fontWeight: 600 }}>Paid</span>
                          : <PaymentStatusBadge status={selectedOrder.paymentStatus} />}
                      </div>
                      {selectedOrder.designStatus && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Design</span>
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
                            background: selectedOrder.designStatus === 'approved' ? 'rgba(74,222,128,0.12)' : selectedOrder.designStatus === 'rejected' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
                            color: selectedOrder.designStatus === 'approved' ? 'var(--green)' : selectedOrder.designStatus === 'rejected' ? 'var(--red)' : 'var(--gold)',
                          }}>
                            {selectedOrder.designStatus === 'pending_review' ? 'Under Review' : selectedOrder.designStatus === 'approved' ? '✓ Approved' : selectedOrder.designStatus === 'rejected' ? 'Rejected' : selectedOrder.designStatus === 'draft_ready' ? 'Draft Ready' : selectedOrder.designStatus === 'revision_requested' ? 'Revision Requested' : selectedOrder.designStatus}
                          </span>
                        </div>
                      )}

                      {/* Rejection reason */}
                      {selectedOrder.designStatus === 'rejected' && selectedOrder.designRejectionReason && (
                        <div style={{
                          padding: '0.625rem 0.75rem',
                          background: 'rgba(239,68,68,0.06)',
                          border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          color: 'var(--gray)',
                        }}>
                          <strong style={{ color: 'var(--red)' }}>Rejection reason: </strong>
                          {selectedOrder.designRejectionReason}
                        </div>
                      )}

                      {/* Re-upload design (when rejected) */}
                      {selectedOrder.designStatus === 'rejected' && (
                        <div style={{ marginTop: '4px' }}>
                          {reuploadSuccess && (
                            <div style={{
                              padding: '10px 14px',
                              background: 'rgba(74,222,128,0.08)',
                              border: '1px solid rgba(74,222,128,0.3)',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              color: 'var(--green)',
                              marginBottom: '10px',
                            }}>
                              Design resubmitted. We'll review it shortly.
                            </div>
                          )}
                          {!showReupload ? (
                            <button
                              onClick={() => setShowReupload(true)}
                              style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid var(--gold)',
                                background: 'rgba(212,168,67,0.08)',
                                color: 'var(--gold)',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                width: '100%',
                              }}
                            >
                              Re-upload Design
                            </button>
                          ) : (
                            <div style={{
                              display: 'flex', flexDirection: 'column', gap: '10px',
                              padding: '14px',
                              background: 'var(--dark)',
                              borderRadius: '10px',
                              border: '1px solid var(--border)',
                            }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--gray)', fontWeight: 600 }}>
                                Re-upload Design
                              </div>
                              <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '6px' }}>
                                  File (JPG, PNG, PDF, AI, PSD, SVG — max 10MB)
                                </div>
                                <input
                                  type="file"
                                  accept=".jpg,.jpeg,.png,.webp,.pdf,.ai,.psd,.svg"
                                  onChange={e => setReuploadFile(e.target.files?.[0] || null)}
                                  style={{ fontSize: '0.8rem', color: 'var(--white)', width: '100%' }}
                                />
                              </div>
                              <textarea
                                placeholder="Updated design notes (optional)"
                                value={reuploadNotes}
                                onChange={e => setReuploadNotes(e.target.value)}
                                maxLength={2000}
                                rows={3}
                                style={{
                                  background: 'var(--dark2)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '8px',
                                  color: 'var(--white)',
                                  fontSize: '0.8rem',
                                  padding: '8px 12px',
                                  resize: 'vertical',
                                  outline: 'none',
                                }}
                              />
                              {reuploadError && (
                                <div style={{ color: 'var(--red)', fontSize: '0.8rem' }}>
                                  {reuploadError}
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={handleReupload}
                                  disabled={reuploadLoading || (!reuploadFile && !reuploadNotes.trim())}
                                  style={{
                                    flex: 1,
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: (reuploadLoading || (!reuploadFile && !reuploadNotes.trim()))
                                      ? 'var(--border)'
                                      : 'var(--gold)',
                                    color: 'var(--dark)',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: (reuploadLoading || (!reuploadFile && !reuploadNotes.trim()))
                                      ? 'not-allowed'
                                      : 'pointer',
                                  }}
                                >
                                  {reuploadLoading ? 'Submitting...' : 'Submit for Review'}
                                </button>
                                <button
                                  onClick={() => {
                                    setShowReupload(false);
                                    setReuploadFile(null);
                                    setReuploadNotes('');
                                    setReuploadError(null);
                                  }}
                                  disabled={reuploadLoading}
                                  style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--dark2)',
                                    color: 'var(--gray)',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Admin Design Draft */}
                  {selectedOrder.adminDesignUrl && (
                    <div style={{ padding: '14px', background: 'rgba(212,168,67,0.05)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                        Your Design Draft
                      </div>
                      {selectedOrder.designStatus === 'approved' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 600 }}>✓ You approved this design. We'll proceed to production.</span>
                          <a href={selectedOrder.adminDesignUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            View Design
                          </a>
                        </div>
                      ) : selectedOrder.designStatus === 'revision_requested' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>↩ Revision requested — we'll update the design and notify you.</span>
                          <a href={selectedOrder.adminDesignUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--gray)', fontWeight: 600, textDecoration: 'none' }}>View current draft</a>
                          {revisionSuccess && <div style={{ fontSize: '0.75rem', color: '#4ade80' }}>✓ Revision request sent.</div>}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Your design draft is ready. Please review and let us know if it looks good.</div>
                          <a href={selectedOrder.adminDesignUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            View Design Draft
                          </a>
                          {approveDesignError && <div style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{approveDesignError}</div>}
                          {!showRevisionForm ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={handleApproveAdminDesign}
                                disabled={approveDesignLoading}
                                style={{ flex: 1, padding: '9px 14px', borderRadius: '8px', border: 'none', background: approveDesignLoading ? 'var(--border)' : '#4ade80', color: '#000', fontSize: '0.8rem', fontWeight: 700, cursor: approveDesignLoading ? 'not-allowed' : 'pointer' }}
                              >
                                {approveDesignLoading ? 'Approving...' : '✓ Looks Good! Approve'}
                              </button>
                              <button
                                onClick={() => setShowRevisionForm(true)}
                                style={{ flex: 1, padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--gray)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                ↩ Request Changes
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <textarea
                                placeholder="Describe what you'd like changed..."
                                value={revisionNotes}
                                onChange={e => setRevisionNotes(e.target.value)}
                                rows={3}
                                style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.8rem', padding: '8px 12px', resize: 'vertical', outline: 'none' }}
                              />
                              {revisionError && <div style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{revisionError}</div>}
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleRequestRevision} disabled={revisionLoading} style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', border: 'none', background: revisionLoading ? 'var(--border)' : 'var(--gold)', color: '#000', fontSize: '0.8rem', fontWeight: 700, cursor: revisionLoading ? 'not-allowed' : 'pointer' }}>
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

                  {/* Section 4: Delivery Address */}
                  {selectedOrder.deliveryAddress && Object.keys(selectedOrder.deliveryAddress).length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                        Shipping Address
                      </div>
                      <div style={{
                        padding: '12px 14px',
                        background: 'var(--dark)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        fontSize: '0.875rem',
                        color: 'var(--white)',
                        lineHeight: 1.6,
                      }}>
                        {[
                          selectedOrder.deliveryAddress.house_number,
                          selectedOrder.deliveryAddress.street,
                          selectedOrder.deliveryAddress.subdivision,
                          selectedOrder.deliveryAddress.barangay,
                          selectedOrder.deliveryAddress.city,
                          selectedOrder.deliveryAddress.province,
                          selectedOrder.deliveryAddress.zip,
                        ].filter(Boolean).join(', ')}
                        {selectedOrder.deliveryAddress.phone && (
                          <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--gray)' }}>
                            {selectedOrder.deliveryAddress.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section 5: Delivery Details (courier + tracking) */}
                  {(selectedOrder.courierName || selectedOrder.trackingNumber) && (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                        Shipment
                      </div>
                      <div style={{
                        padding: '12px 14px',
                        background: 'var(--dark)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}>
                        {selectedOrder.courierName && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Courier</span>
                            <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>
                              {selectedOrder.courierName}
                            </span>
                          </div>
                        )}
                        {selectedOrder.trackingNumber && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Tracking #</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>
                                {selectedOrder.trackingNumber}
                              </span>
                              <button
                                onClick={() => navigator.clipboard?.writeText(selectedOrder.trackingNumber)}
                                title="Copy tracking number"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--gray)',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section 6: Production */}
                  {selectedOrder.joId && (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                        Production
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Job Order</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>
                            {selectedOrder.joId}
                          </span>
                        </div>
                        {selectedOrder.joStatus && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Production Status</span>
                            <StatusBadge status={selectedOrder.joStatus} />
                          </div>
                        )}
                        {selectedOrder.targetCompletion && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Target Completion</span>
                            <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>
                              {formatDate(selectedOrder.targetCompletion)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section 7: Review */}
                  {selectedOrder.orderStatus === 'Delivered' && (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                        Your Review
                      </div>

                      {reviewCheckLoading && (
                        <div style={{
                          height: '60px',
                          background: 'var(--border)',
                          borderRadius: '8px',
                          animation: 'pulse 1.5s ease-in-out infinite',
                        }} />
                      )}

                      {!reviewCheckLoading && existingReview && (
                        <div style={{
                          padding: '14px',
                          background: 'var(--dark)',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {[1,2,3,4,5].map(s => (
                              <svg key={s} width="18" height="18" viewBox="0 0 24 24"
                                fill={s <= existingReview.rating ? 'var(--gold)' : 'none'}
                                stroke="var(--gold)" strokeWidth="1.5"
                                strokeLinecap="round" strokeLinejoin="round"
                              >
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                            ))}
                            <span style={{ marginLeft: '6px', fontSize: '0.8rem', color: 'var(--gray)' }}>
                              {existingReview.rating}/5
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--white)', lineHeight: 1.6 }}>
                            {existingReview.comment}
                          </p>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                            {formatDate(existingReview.created_at)}
                          </div>
                        </div>
                      )}

                      {!reviewCheckLoading && !existingReview && (
                        <div style={{
                          padding: '14px',
                          background: 'var(--dark)',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}>
                          {reviewSuccess ? (
                            <div style={{
                              padding: '10px 14px',
                              background: 'rgba(74,222,128,0.08)',
                              border: '1px solid rgba(74,222,128,0.3)',
                              borderRadius: '8px',
                              fontSize: '0.875rem',
                              color: 'var(--green)',
                            }}>
                              Thank you for your review!
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                                Rate your experience with this order
                              </div>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {[1,2,3,4,5].map(s => (
                                  <button
                                    key={s}
                                    onClick={() => setReviewRating(s)}
                                    style={{
                                      background: 'none', border: 'none',
                                      cursor: 'pointer', padding: '2px',
                                      display: 'flex', alignItems: 'center',
                                    }}
                                  >
                                    <svg width="28" height="28" viewBox="0 0 24 24"
                                      fill={s <= reviewRating ? 'var(--gold)' : 'none'}
                                      stroke="var(--gold)" strokeWidth="1.5"
                                      strokeLinecap="round" strokeLinejoin="round"
                                      style={{ transition: 'fill 0.1s' }}
                                    >
                                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                    </svg>
                                  </button>
                                ))}
                              </div>
                              <textarea
                                placeholder="Share your experience... (min. 5 characters)"
                                value={reviewComment}
                                onChange={e => setReviewComment(e.target.value)}
                                maxLength={2000}
                                rows={3}
                                style={{
                                  background: 'var(--dark2)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '8px',
                                  color: 'var(--white)',
                                  fontSize: '0.8rem',
                                  padding: '8px 12px',
                                  resize: 'vertical',
                                  outline: 'none',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                }}
                              />
                              {reviewError && (
                                <div style={{ color: 'var(--red)', fontSize: '0.8rem' }}>
                                  {reviewError}
                                </div>
                              )}
                              <button
                                onClick={handleSubmitReview}
                                disabled={reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5}
                                style={{
                                  padding: '9px 20px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  background: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5)
                                    ? 'var(--border)'
                                    : 'var(--gold)',
                                  color: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5)
                                    ? 'var(--gray)'
                                    : 'var(--dark)',
                                  fontSize: '0.875rem',
                                  fontWeight: 700,
                                  cursor: (reviewSubmitting || reviewRating === 0 || reviewComment.trim().length < 5)
                                    ? 'not-allowed'
                                    : 'pointer',
                                }}
                              >
                                {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  </div>
                  {/* ── RIGHT COLUMN ── */}
                  <div style={{ width: '272px', flexShrink: 0, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(0,0,0,0.15)' }}>

                    {/* Items */}
                    {selectedOrder.items && selectedOrder.items.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
                          {selectedOrder.items.length} {selectedOrder.items.length === 1 ? 'Item' : 'Items'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {selectedOrder.items.map((item, i) => {
                            const unitPrice = item.unitPrice ?? item.price ?? 0;
                            const qty       = item.qty || item.quantity || 1;
                            const lineTotal = item.lineTotal ?? (unitPrice * qty);
                            const initial   = (item.productName || 'P')[0].toUpperCase();
                            const palettes  = ['#6366f1','#f59e0b','#34d399','#f97316','#60a5fa','#a78bfa','#f87171','#4ade80'];
                            const color     = palettes[initial.charCodeAt(0) % palettes.length];
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                  <div style={{ width: '52px', height: '52px', borderRadius: '10px', background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                    {item.imageUrl
                                      ? <img src={item.imageUrl} alt={item.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      : <span style={{ fontSize: '1.2rem', fontWeight: 800, color }}>{initial}</span>
                                    }
                                  </div>
                                  <div style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--dark2)', border: '2px solid var(--border)', color: 'var(--white)', fontSize: '0.62rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {qty}
                                  </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.productName || item.product_name || 'Product'}
                                  </div>
                                  {item.variantName && <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginTop: '2px' }}>{item.variantName}</div>}
                                  {item.category && <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{item.category}</div>}
                                </div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)', flexShrink: 0 }}>
                                  {formatPeso(lineTotal)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Divider */}
                    <div style={{ height: '1px', background: 'var(--border)' }} />

                    {/* Pricing */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {selectedOrder.subtotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Subtotal</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--white)' }}>{formatPeso(selectedOrder.subtotal)}</span>
                        </div>
                      )}
                      {selectedOrder.shippingFee > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Shipping</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--white)' }}>{formatPeso(selectedOrder.shippingFee)}</span>
                        </div>
                      )}
                      {selectedOrder.discountAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Discount</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--green)' }}>-{formatPeso(selectedOrder.discountAmount)}</span>
                        </div>
                      )}
                      {selectedOrder.downPayment > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Down Payment</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--white)' }}>{formatPeso(selectedOrder.downPayment)}</span>
                        </div>
                      )}
                      {selectedOrder.balance > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Balance Due</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--red)', fontWeight: 700 }}>{formatPeso(selectedOrder.balance)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)', marginTop: '2px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)' }}>Total</span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--gold)' }}>{formatPeso(selectedOrder.totalAmount)}</span>
                      </div>
                    </div>

                    {/* Pay Now – payment method selector */}
                    {selectedOrder.paymentStatus !== 'paid'
                      && !['Cancelled', 'Returned'].includes(selectedOrder.orderStatus)
                      && !['pending_review', 'pending_design', 'proof_sent', 'revision_requested', 'design_approved'].includes(selectedOrder.orderStatus) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Payment Method
                        </div>

                        {/* GCash */}
                        {[
                          {
                            id: 'gcash',
                            label: 'GCash',
                            sub: "Redirected to GCash to authorize.",
                            accent: '#0066FF',
                            accentBg: 'rgba(0,102,255,0.08)',
                            logo: (
                              <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
                                <rect width="100" height="100" rx="20" fill="#0066FF"/>
                                <path fillRule="evenodd" clipRule="evenodd" d="M50 14C30.12 14 14 30.12 14 50s16.12 36 36 36c16.8 0 30.9-11.46 35.12-27H50V47h39.4c.4 1.96.6 4 .6 6.1C90 74.9 72.1 90 50 90 27 90 10 73 10 50S27 10 50 10c11.55 0 22 4.47 29.6 11.72L73 28.3C67.2 23.2 59 20 50 20z" fill="white"/>
                              </svg>
                            ),
                          },
                          {
                            id: 'paymaya',
                            label: 'Maya',
                            sub: "Redirected to Maya to authorize.",
                            accent: '#00B14F',
                            accentBg: 'rgba(0,177,79,0.08)',
                            logo: (
                              <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
                                <rect width="100" height="100" rx="20" fill="#00B14F"/>
                                <path d="M18 68V35l18 22 18-22v33" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                <path d="M62 35h10c5.5 0 10 4.5 10 10s-4.5 10-10 10H62V35z" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                <line x1="62" y1="55" x2="62" y2="68" stroke="white" strokeWidth="7" strokeLinecap="round"/>
                              </svg>
                            ),
                          },
                          {
                            id: 'card',
                            label: 'Credit / Debit Card',
                            sub: "Visa or Mastercard accepted.",
                            accent: '#9C7BE8',
                            accentBg: 'rgba(156,123,232,0.08)',
                            logo: (
                              <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
                                <rect width="100" height="100" rx="20" fill="#1e1e2e"/>
                                <rect x="10" y="28" width="80" height="52" rx="8" stroke="#9C7BE8" strokeWidth="5"/>
                                <rect x="10" y="42" width="80" height="14" fill="#9C7BE8" opacity="0.7"/>
                                <rect x="20" y="62" width="22" height="8" rx="2" fill="#9C7BE8" opacity="0.5"/>
                                <rect x="50" y="62" width="14" height="8" rx="2" fill="#9C7BE8" opacity="0.5"/>
                                <rect x="67" y="62" width="14" height="8" rx="2" fill="#9C7BE8" opacity="0.5"/>
                              </svg>
                            ),
                          },
                        ].map(opt => {
                          const isSelected = payMethod === opt.id;
                          return (
                            <div
                              key={opt.id}
                              onClick={() => setPayMethod(opt.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                                border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.07)'}`,
                                background: isSelected ? opt.accentBg : 'var(--dark)',
                                transition: 'all 0.15s',
                              }}
                            >
                              <div style={{
                                width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                                background: isSelected ? opt.accentBg : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.06)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden',
                              }}>
                                {opt.logo}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' }}>{opt.label}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '1px' }}>{opt.sub}</div>
                              </div>
                              <div style={{
                                width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                                border: `2px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.2)'}`,
                                background: isSelected ? opt.accent : 'transparent',
                                transition: 'all 0.15s',
                              }} />
                            </div>
                          );
                        })}

                        {payNowError && (
                          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.8rem' }}>
                            {payNowError}
                          </div>
                        )}
                        <button
                          onClick={handlePayNow}
                          disabled={payNowLoading || !payMethod}
                          style={{
                            width: '100%', padding: '11px 16px', borderRadius: '8px', border: 'none',
                            background: (payNowLoading || !payMethod) ? 'var(--border)' : 'var(--gold)',
                            color: (payNowLoading || !payMethod) ? 'var(--gray)' : 'var(--dark)',
                            fontSize: '0.875rem', fontWeight: 700,
                            cursor: (payNowLoading || !payMethod) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            marginTop: '4px',
                          }}
                        >
                          {!payNowLoading && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
                          {payNowLoading ? 'Creating link...' : !payMethod ? 'Select a method above' : 'Proceed to Payment'}
                        </button>
                      </div>
                    )}

                  </div>

                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}>
              <div>
                {reorderMsg && (
                  <span style={{
                    fontSize: '0.8rem',
                    color: reorderMsg.includes('Failed') ? 'var(--red)' : 'var(--green)',
                    fontWeight: 600,
                  }}>
                    {reorderMsg}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {!detailLoading && !detailError && selectedOrder?.items?.length > 0 &&
                  !selectedOrder?.isCustomOrder &&
                  !['Cancelled'].includes(selectedOrder.orderStatus) && (
                  <button
                    onClick={handleReorder}
                    disabled={reorderLoading}
                    style={{
                      padding: '10px 20px', borderRadius: '8px',
                      border: 'none',
                      background: 'var(--gold)',
                      color: 'var(--dark)', fontSize: '0.875rem',
                      fontWeight: 700, cursor: reorderLoading ? 'not-allowed' : 'pointer',
                      opacity: reorderLoading ? 0.7 : 1,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/>
                      <path d="M3.51 15a9 9 0 1 0 .49-3.39"/>
                    </svg>
                    {reorderLoading ? 'Adding...' : 'Reorder'}
                  </button>
                )}
                <button
                  onClick={closeModal}
                  style={{
                    padding: '10px 24px', borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--dark)',
                    color: 'var(--gray)', fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      {cancelTarget && (
        <div
          onClick={() => { if (!cancelling) { setCancelTarget(null); setCancelError(null); } }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>
              Cancel Order?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Are you sure you want to cancel order{' '}
              <strong style={{ color: 'var(--white)' }}>
                #{(cancelTarget._id ?? cancelTarget.id)?.slice(-8).toUpperCase()}
              </strong>?
              This action cannot be undone.
            </p>
            {cancelError && (
              <div style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid var(--red)',
                color: 'var(--red)',
                fontSize: '0.8rem',
              }}>
                {cancelError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setCancelTarget(null); setCancelError(null); }}
                disabled={cancelling}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--dark)',
                  color: 'var(--gray)', fontSize: '0.875rem',
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                  opacity: cancelling ? 0.5 : 1,
                }}
              >
                Keep Order
              </button>
              <button
                onClick={cancelOrder}
                disabled={cancelling}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: 'none',
                  background: cancelling ? 'rgba(239,68,68,0.4)' : 'var(--red)',
                  color: 'var(--white)', fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                }}
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
