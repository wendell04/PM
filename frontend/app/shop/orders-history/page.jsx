'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyShopOrders, fetchMyOrder } from '@/lib/orderTrackingApi';
import { StatusBadge, formatDate, formatPeso } from '@/lib/shopUtils';
import { getEcho, disconnectEcho } from '@/lib/echo';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useCart } from '@/app/shop/layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const TABS = ['All', 'Pending', 'In Production', 'For Delivery', 'Delivered', 'Cancelled'];

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

  // Design re-upload
  const [showReupload, setShowReupload]       = useState(false);
  const [reuploadFile, setReuploadFile]       = useState(null);
  const [reuploadNotes, setReuploadNotes]     = useState('');
  const [reuploadLoading, setReuploadLoading] = useState(false);
  const [reuploadError, setReuploadError]     = useState(null);
  const [reuploadSuccess, setReuploadSuccess] = useState(false);

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
    setShowReupload(false);
    setReuploadFile(null);
    setReuploadNotes('');
    setReuploadError(null);
    setReuploadSuccess(false);
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
      const data = await fetchMyOrder(token, order.id ?? order._id);
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
    if (!selectedOrder || !token) return;
    setPayNowLoading(true);
    setPayNowError(null);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/payment/create-order-pay-link`,
        {
          method: 'POST',
          headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: selectedOrder._id ?? selectedOrder.id }),
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
  const filteredOrders = activeTab === 'All'
    ? orders
    : orders.filter(o => o.orderStatus === activeTab);

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
            Order History
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--gray)' }}>
            Your purchase orders
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
                  style={{
                    background: 'var(--dark2)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  onClick={() => openDetail(order)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap',
                    marginBottom: '8px',
                  }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)' }}>
                      #{oid?.slice(-8).toUpperCase()}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <PaymentStatusBadge status={order.paymentStatus} />
                      <StatusBadge status={order.orderStatus} />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '8px' }}>
                    {itemSummary}
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', flexWrap: 'wrap', gap: '8px',
                  }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                      {formatDate(order.createdAt)}
                    </span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--gold)' }}>
                      {formatPeso(order.totalAmount)}
                    </span>
                  </div>
                  {order.orderStatus === 'Pending' && (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={e => { e.stopPropagation(); setCancelTarget(order); }}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: '1px solid var(--red)',
                          background: 'transparent',
                          color: 'var(--red)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel Order
                      </button>
                    </div>
                  )}
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
              width: '100%', maxWidth: '560px',
              maxHeight: '90vh', overflowY: 'auto',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Modal header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>
                Order Details
              </h2>
              <button
                onClick={closeModal}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--gray)', fontSize: '1.25rem',
                  cursor: 'pointer', padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '24px', flex: 1 }}>

              {detailLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Order Tracker */}
                  <OrderTracker
                    status={selectedOrder.orderStatus}
                    statusHistory={selectedOrder.statusHistory}
                  />

                  {/* Section 1: Order Summary */}
                  <div>
                    <h3 style={{
                      margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700,
                      color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      Order Summary
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        ['Order ID', `#${(selectedOrder.id ?? selectedOrder._id)?.slice(-8).toUpperCase()}`],
                        ['Status',   null],
                        ['Payment',  null],
                        ['Date',     formatDate(selectedOrder.createdAt)],
                        ['Method',   selectedOrder.paymentMethod
                          ? <span className="payment-method-badge">{selectedOrder.paymentMethod}</span>
                          : '—'
                        ],
                      ].map(([label, value]) => (
                        <div key={label} style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', gap: '8px',
                          padding: '4px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{label}</span>
                          {label === 'Status'
                            ? <StatusBadge status={selectedOrder.orderStatus} />
                            : label === 'Payment'
                              ? selectedOrder.paymentStatus === 'paid'
                                ? <span style={{ fontSize: '0.875rem', color: 'var(--green)', fontWeight: 600 }}>Paid</span>
                                : <PaymentStatusBadge status={selectedOrder.paymentStatus} />
                              : label === 'Method'
                                ? value
                                : <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>{value}</span>
                          }
                        </div>
                      ))}

                      {/* Design status */}
                      {selectedOrder.designStatus && (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Design Status</span>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '20px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            background: selectedOrder.designStatus === 'approved'
                              ? 'rgba(74,222,128,0.12)'
                              : selectedOrder.designStatus === 'rejected'
                                ? 'rgba(239,68,68,0.12)'
                                : 'rgba(234,179,8,0.12)',
                            color: selectedOrder.designStatus === 'approved'
                              ? 'var(--green)'
                              : selectedOrder.designStatus === 'rejected'
                                ? 'var(--red)'
                                : 'var(--gold)',
                          }}>
                            {selectedOrder.designStatus === 'pending_review'
                              ? 'Under Review'
                              : selectedOrder.designStatus === 'approved'
                                ? 'Approved'
                                : selectedOrder.designStatus === 'rejected'
                                  ? 'Rejected'
                                  : selectedOrder.designStatus}
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

                  {/* Section 2: Items */}
                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <div>
                      <h3 style={{
                        margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700,
                        color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        Items
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedOrder.items.map((item, i) => {
                          const unitPrice = item.unitPrice ?? item.price ?? 0;
                          const qty = item.qty || item.quantity || 1;
                          const lineTotal = item.lineTotal ?? (unitPrice * qty);
                          return (
                            <div key={i} style={{
                              display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center', gap: '8px',
                              padding: '10px 14px',
                              background: 'var(--dark)',
                              borderRadius: '8px',
                              border: '1px solid var(--border)',
                            }}>
                              <div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>
                                  {item.productName || item.product_name || 'Product'}
                                </div>
                                {item.variantName && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--gold)', marginTop: '1px' }}>
                                    {item.variantName}
                                  </div>
                                )}
                                {item.category && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                                    {item.category}
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>
                                  {formatPeso(unitPrice)}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                                  qty: {qty}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>
                                  {formatPeso(lineTotal)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Section 3: Pricing */}
                  <div>
                    <h3 style={{
                      margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700,
                      color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      Pricing
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {selectedOrder.subtotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Subtotal</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>
                            {formatPeso(selectedOrder.subtotal)}
                          </span>
                        </div>
                      )}
                      {selectedOrder.shippingFee > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Shipping</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>
                            {formatPeso(selectedOrder.shippingFee)}
                          </span>
                        </div>
                      )}
                      {selectedOrder.discountAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Discount</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--green)' }}>
                            -{formatPeso(selectedOrder.discountAmount)}
                          </span>
                        </div>
                      )}
                      {selectedOrder.downPayment > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Down Payment</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>
                            {formatPeso(selectedOrder.downPayment)}
                          </span>
                        </div>
                      )}
                      {selectedOrder.balance > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Balance Due</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--red)', fontWeight: 700 }}>
                            {formatPeso(selectedOrder.balance)}
                          </span>
                        </div>
                      )}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        paddingTop: '8px', borderTop: '1px solid var(--border)',
                        marginTop: '4px',
                      }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)' }}>Total</span>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gold)' }}>
                          {formatPeso(selectedOrder.totalAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Pay Now — show for unpaid/partial orders that are not cancelled */}
                    {selectedOrder.paymentStatus !== 'paid'
                      && !['Cancelled', 'Returned'].includes(selectedOrder.orderStatus) && (
                      <div style={{ marginTop: '14px' }}>
                        {payNowError && (
                          <div style={{
                            padding: '8px 12px',
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '8px',
                            color: 'var(--red)',
                            fontSize: '0.8rem',
                            marginBottom: '8px',
                          }}>
                            {payNowError}
                          </div>
                        )}
                        <button
                          onClick={handlePayNow}
                          disabled={payNowLoading}
                          style={{
                            width: '100%',
                            padding: '11px 20px',
                            borderRadius: '8px',
                            border: 'none',
                            background: payNowLoading ? 'var(--border)' : 'var(--gold)',
                            color: payNowLoading ? 'var(--gray)' : 'var(--dark)',
                            fontSize: '0.875rem',
                            fontWeight: 700,
                            cursor: payNowLoading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                          }}
                        >
                          {!payNowLoading && (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                              <line x1="1" y1="10" x2="23" y2="10"/>
                            </svg>
                          )}
                          {payNowLoading ? 'Creating payment link...' : 'Pay Now Online'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Section 4: Delivery Address */}
                  {selectedOrder.deliveryAddress && Object.keys(selectedOrder.deliveryAddress).length > 0 && (
                    <div>
                      <h3 style={{
                        margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700,
                        color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        Delivery Address
                      </h3>
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
                      <h3 style={{
                        margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700,
                        color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        Delivery Details
                      </h3>
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
                      <h3 style={{
                        margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700,
                        color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        Production
                      </h3>
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
                      <h3 style={{
                        margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700,
                        color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        Your Review
                      </h3>

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
