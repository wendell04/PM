'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchMyOrders, fetchMyOrder } from '@/lib/orderTrackingApi';
import { cancelMyOrderRequest, createOrderRequestPaymentLink } from '@/lib/orderRequestApi';
import CustomerTrackingView from './components/CustomerTrackingView';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/context/CartContext';
import { StatusBadge, formatDate, formatTimestamp, formatPeso } from '@/lib/shopUtils';
import { getEcho, disconnectEcho } from '@/lib/echo';

function SkeletonRow() {
  return (
    <div style={{
      padding: '1.25rem',
      background: 'var(--dark2)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ height: '16px', background: 'var(--dark3)', borderRadius: '4px', width: '30%' }} />
        <div style={{ height: '24px', background: 'var(--dark3)', borderRadius: '999px', width: '100px' }} />
      </div>
      <div style={{ height: '14px', background: 'var(--dark3)', borderRadius: '4px', width: '50%', marginBottom: '0.5rem' }} />
      <div style={{ height: '12px', background: 'var(--dark3)', borderRadius: '4px', width: '25%' }} />
    </div>
  );
}

const REQUEST_STEPS = [
  { key: 'pending_design',      label: 'Design' },
  { key: 'proof_sent',          label: 'Proof' },
  { key: 'design_approved',     label: 'Approved' },
  { key: 'awaiting_production', label: 'Queued' },
  { key: 'in_production',       label: 'Printing' },
  { key: 'shipped',             label: 'Shipped' },
  { key: 'delivered',           label: 'Done' },
];

const UPLOAD_STEPS = [
  { key: 'pending_review',      label: 'Review' },
  { key: 'awaiting_payment',    label: 'Pay' },
  { key: 'awaiting_production', label: 'Queued' },
  { key: 'in_production',       label: 'Printing' },
  { key: 'shipped',             label: 'Shipped' },
  { key: 'delivered',           label: 'Done' },
];

function customStepIndex(steps, status) {
  const keys = steps.map(s => s.key);
  const idx = keys.indexOf(status);
  if (status === 'ready_for_pickup') return keys.indexOf('shipped');
  if (status === 'revision_requested') return keys.indexOf('proof_sent');
  return idx;
}

function CustomOrderProgress({ status, designType }) {
  const steps = designType === 'upload' ? UPLOAD_STEPS : REQUEST_STEPS;
  const active = customStepIndex(steps, status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginTop: '0.75rem', marginBottom: '0.25rem', overflowX: 'auto', paddingBottom: '2px' }}>
      {steps.map((step, i) => {
        const done = i < active;
        const current = i === active;
        const isRevision = status === 'revision_requested' && step.key === 'proof_sent';
        const isAwaitingPay = status === 'awaiting_payment' && step.key === 'awaiting_payment';
        const dotColor = isRevision ? '#f97316' : isAwaitingPay ? '#f59e0b' : done || current ? '#D4A843' : 'rgba(255,255,255,0.15)';
        const labelColor = isRevision ? '#f97316' : isAwaitingPay ? '#f59e0b' : current ? '#D4A843' : done ? 'rgba(212,168,67,0.6)' : 'rgba(255,255,255,0.25)';
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, transition: 'background 0.2s' }} />
              <span style={{ fontSize: '0.6rem', fontWeight: current ? 700 : 500, color: labelColor, whiteSpace: 'nowrap' }}>{isRevision ? 'Revision' : step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 24, height: 1, background: done ? 'rgba(212,168,67,0.5)' : 'rgba(255,255,255,0.1)', margin: '0 2px', marginBottom: '11px', flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ImageWithFallback({ src, alt, label, style }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div style={{ ...style, background: 'var(--dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', fontSize: '0.8rem', textAlign: 'center' }}>
        Image unavailable
      </div>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ ...style, cursor: 'pointer', borderRadius: '8px', objectFit: 'cover' }}
        onError={() => setBroken(true)}
      />
    </a>
  );
}

export default function ShopOrdersPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { cartItems, removeFromCart } = useCart();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Cancel dialog
  const [cancelTarget, setCancelTarget]   = useState(null);
  const [cancelling, setCancelling]       = useState(false);
  const [cancelError, setCancelError]     = useState(null);
  const [visibleCount, setVisibleCount]   = useState(5);

  // Payment
  const [payingId,    setPayingId]    = useState(null);
  const [payError,    setPayError]    = useState(null);

  // Design approval
  const [approvingId,     setApprovingId]     = useState(null);
  const [revisionTarget,  setRevisionTarget]  = useState(null);
  const [revisionNotes,   setRevisionNotes]   = useState('');
  const [revisionSending, setRevisionSending] = useState(false);
  const [designActionErr, setDesignActionErr] = useState(null);

  const loadOrders = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyOrders(token);
      setOrders(Array.isArray(data) ? data : []);
      setVisibleCount(5);
    } catch (err) {
      if (err.message === 'Unauthorized') {
        router.push('/shop');
        return;
      }
      setError(err.message);
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
      if (!selectedOrder) {
        loadOrders();
      }
    }, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, selectedOrder, loadOrders]);

  // Reverb — subscribe to order.{id} for each loaded order
  useEffect(() => {
    if (!token || orders.length === 0) return;
    // Unsubscribe previous channels first
    echoChannelsRef.current.forEach(ch => {
      try { ch.stopListening('.order.status.updated'); } catch {}
    });
    echoChannelsRef.current = [];
    let echo;
    try {
      echo = getEcho(token);
    } catch { return; }
    if (!echo) return;
    orders.forEach(order => {
      const id = order._id ?? order.id;
      if (!id) return;
      try {
        const ch = echo.private(`order.${id}`)
          .listen('.order.status.updated', () => {
            loadOrders();
          });
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

  async function openDetail(order) {
    if (!token) return;
    setSelectedOrder(order);
    setModalLoading(true);
    setModalError(null);
    try {
      const data = await fetchMyOrder(token, order.id ?? order._id);
      setSelectedOrder(data);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  }

  function closeDetail() {
    setSelectedOrder(null);
    setModalLoading(false);
    setModalError(null);
  }

  const cancelOrder = async () => {
    if (!cancelTarget || !token) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelMyOrderRequest(token, cancelTarget._id ?? cancelTarget.id);
      // Remove cancelled order items from cart if they still exist
      const cancelledItems = cancelTarget.items ?? [];
      cancelledItems.forEach(item => {
        const inCart = cartItems.find(c => c.productId === item.productId && (c.variantId ?? null) === (item.variantId ?? null));
        if (inCart?.lineId) removeFromCart(inCart.lineId);
      });
      setCancelTarget(null);
      loadOrders();
    } catch (err) {
      setCancelError(err.message || 'Failed to cancel order request.');
    } finally {
      setCancelling(false);
    }
  };

  async function handlePay(order, type) {
    if (!token) return;
    const id = order._id ?? order.id;
    setPayingId(`${id}-${type}`);
    setPayError(null);
    try {
      const result = await createOrderRequestPaymentLink(token, id, type);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      setPayError(err.message || 'Failed to initiate payment. Please try again.');
      setPayingId(null);
    }
  }

  async function handleApproveDesign(order) {
    const id = order._id ?? order.id;
    setApprovingId(id);
    setDesignActionErr(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/orders/my/${id}/approve-admin-design`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to approve design.');
      loadOrders();
      if (selectedOrder && (selectedOrder._id ?? selectedOrder.id) === id) closeDetail();
    } catch (err) {
      setDesignActionErr(err.message);
    } finally {
      setApprovingId(null);
    }
  }

  async function handleSendRevision() {
    if (!revisionTarget) return;
    const id = revisionTarget._id ?? revisionTarget.id;
    setRevisionSending(true);
    setDesignActionErr(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/orders/my/${id}/request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: revisionNotes.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send revision request.');
      setRevisionTarget(null);
      setRevisionNotes('');
      loadOrders();
      if (selectedOrder && (selectedOrder._id ?? selectedOrder.id) === id) closeDetail();
    } catch (err) {
      setDesignActionErr(err.message);
    } finally {
      setRevisionSending(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Back to Shop */}
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/shop" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--gray)', textDecoration: 'none', fontSize: '0.875rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back to Shop
          </Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>My Orders</h1>
          <p style={{ margin: 0, color: 'var(--gray)', fontSize: '0.9rem' }}>Track your custom and regular orders</p>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--red)' }}>
            <p style={{ marginBottom: '1rem' }}>{error}</p>
            <button onClick={loadOrders} style={{ background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', padding: '0.625rem 1.25rem', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5" style={{ marginBottom: '1rem' }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
            <p style={{ fontSize: '1rem', color: 'var(--white)', marginBottom: '0.5rem' }}>No orders yet.</p>
            <Link href="/shop" style={{ display: 'inline-block', padding: '0.625rem 1.25rem', background: 'var(--gold)', color: 'var(--black)', borderRadius: '8px', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, marginTop: '1rem' }}>Browse Products</Link>
          </div>
        )}

        {/* Orders List */}
        {!loading && !error && orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {orders.slice(0, visibleCount).map(order => (
              <div key={order.id ?? order._id} style={{ padding: '1.25rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)' }}>{(order.id ?? order._id)?.slice(-8).toUpperCase()}</span>
                    {order.isCustomOrder && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, background: 'rgba(212,168,67,0.15)', color: 'var(--gold)', padding: '1px 7px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom</span>
                    )}
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--white)', marginBottom: '0.25rem' }}>{order.productName || (order.items?.[0]?.productName ?? order.items?.[0]?.variantName ?? '—')}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Qty: {order.quantity ?? order.items?.reduce((s, i) => s + (i.qty || 0), 0) ?? '—'}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>{formatDate(order.createdAt)}</div>
                {order.isCustomOrder && (
                  <CustomOrderProgress status={order.status} designType={order.designType} />
                )}
                <div style={{ marginBottom: '0.75rem' }}>
                  {order.finalPrice != null
                    ? <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gold)' }}>Final Price: {formatPeso(order.finalPrice)}</span>
                    : <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Price pending confirmation</span>
                  }
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  <button onClick={() => openDetail(order)} style={{ background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>View Details</button>

                  {order.status === 'awaiting_payment' && (
                    <button
                      onClick={() => router.push(`/shop/products/${order.items?.[0]?.productId}/order/pay?orderId=${order._id ?? order.id}`)}
                      style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: '#f59e0b', color: '#000', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                      Pay Now
                    </button>
                  )}

                  {order.status === 'proof_sent' && (
                    <>
                      <button
                        onClick={() => handleApproveDesign(order)}
                        disabled={approvingId === (order._id ?? order.id)}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: approvingId === (order._id ?? order.id) ? 'rgba(52,211,153,0.4)' : '#34d399', color: '#000', fontSize: '0.8rem', fontWeight: 700, cursor: approvingId === (order._id ?? order.id) ? 'not-allowed' : 'pointer' }}>
                        {approvingId === (order._id ?? order.id) ? 'Approving...' : 'Approve Design'}
                      </button>
                      <button
                        onClick={() => { setRevisionTarget(order); setRevisionNotes(''); setDesignActionErr(null); }}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #f97316', background: 'transparent', color: '#f97316', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                        Request Revision
                      </button>
                    </>
                  )}

                  {['confirmed', 'processing', 'ready'].includes(order.status) &&
                    order.paymentStatus === 'unpaid' && (
                    <button
                      onClick={() => handlePay(order, 'downpayment')}
                      disabled={payingId === `${order._id ?? order.id}-downpayment`}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: payingId === `${order._id ?? order.id}-downpayment`
                          ? 'rgba(212,168,67,0.4)'
                          : 'var(--gold)',
                        color: 'var(--black)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: payingId === `${order._id ?? order.id}-downpayment`
                          ? 'not-allowed'
                          : 'pointer',
                      }}
                    >
                      {payingId === `${order._id ?? order.id}-downpayment`
                        ? 'Redirecting...'
                        : `Pay 50% Downpayment${order.finalPrice ? ` (₱${(order.finalPrice * 0.5).toLocaleString('en-PH', { minimumFractionDigits: 2 })})` : ''}`
                      }
                    </button>
                  )}

                  {['confirmed', 'processing', 'ready'].includes(order.status) &&
                    order.paymentStatus === 'downpayment_paid' && (
                    <button
                      onClick={() => handlePay(order, 'balance')}
                      disabled={payingId === `${order._id ?? order.id}-balance`}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: payingId === `${order._id ?? order.id}-balance`
                          ? 'rgba(212,168,67,0.4)'
                          : 'var(--gold)',
                        color: 'var(--black)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: payingId === `${order._id ?? order.id}-balance`
                          ? 'not-allowed'
                          : 'pointer',
                      }}
                    >
                      {payingId === `${order._id ?? order.id}-balance`
                        ? 'Redirecting...'
                        : `Pay Remaining Balance${order.finalPrice ? ` (₱${(order.finalPrice * 0.5).toLocaleString('en-PH', { minimumFractionDigits: 2 })})` : ''}`
                      }
                    </button>
                  )}

                  {order.paymentStatus === 'paid' && (
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: '999px',
                      background: 'rgba(34,197,94,0.1)',
                      border: '1px solid var(--green)',
                      color: 'var(--green)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}>
                      Fully Paid
                    </span>
                  )}

                  {order.paymentStatus === 'downpayment_paid' &&
                    !['confirmed', 'processing', 'ready'].includes(order.status) && (
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: '999px',
                      background: 'rgba(212,168,67,0.1)',
                      border: '1px solid var(--gold)',
                      color: 'var(--gold)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}>
                      Downpayment Paid
                    </span>
                  )}

                  {payError && payingId === null && (
                    <div style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: 'var(--red)',
                      fontSize: '0.75rem',
                    }}>
                      {payError}
                    </div>
                  )}

                  {order.status === 'pending_review' && (
                    <button
                      onClick={() => setCancelTarget(order)}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: '1px solid var(--red)',
                        background: 'transparent',
                        color: 'var(--red)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  {order.status !== 'pending_review' && order.status !== 'delivered' && order.status !== 'cancelled' && (
                    <div
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        background: 'var(--dark3)',
                        color: 'var(--gray)',
                        fontSize: '0.75rem',
                        lineHeight: 1.4,
                      }}
                    >
                      This order can no longer be cancelled as it has already been confirmed and is in progress.
                    </div>
                  )}
                  {order.status === 'delivered' && order.productId && (
                    <button
                      onClick={() => router.push(`/shop/products/${order.productId}`)}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: '1px solid var(--gold)',
                        background: 'transparent',
                        color: 'var(--gold)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Re-order
                    </button>
                  )}
                </div>
              </div>
            ))}
            {orders.length > visibleCount && (
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
                  e.currentTarget.style.color = 'var(--gold)';
                }}
              >
                Show more ({orders.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={closeDetail}>
          <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            {/* Close button */}
            <button onClick={closeDetail} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: '0.25rem', zIndex: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>

            {modalLoading ? (
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ height: '16px', background: 'var(--dark3)', borderRadius: '4px', width: '40%', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: '13px', background: 'var(--dark3)', borderRadius: '4px', width: '70%', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.1s' }} />
                <div style={{ height: '13px', background: 'var(--dark3)', borderRadius: '4px', width: '55%', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.2s' }} />
                <div style={{ marginTop: '0.5rem', height: '80px', background: 'var(--dark3)', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.15s' }} />
                <div style={{ height: '13px', background: 'var(--dark3)', borderRadius: '4px', width: '45%', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.25s' }} />
              </div>
            ) : modalError ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--red)' }}>
                <p>{modalError}</p>
                <button onClick={() => openDetail(selectedOrder)} style={{ background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem' }}>Retry</button>
              </div>
            ) : (
              <div style={{ padding: '1.5rem' }}>
                {/* Order Progress Tracker */}
                <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                  <CustomerTrackingView order={selectedOrder} />
                </div>
                {/* Section 1: Order Info */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order Info</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>{(selectedOrder.id ?? selectedOrder._id)?.slice(-8).toUpperCase()}</span>
                    <StatusBadge status={selectedOrder.status} />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{formatDate(selectedOrder.createdAt)}</div>
                </div>

                {/* Section 2: Product Details */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Product Details</h3>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>
                    {selectedOrder.productName || selectedOrder.items?.[0]?.productName || '—'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray)', marginBottom: '1rem' }}>
                    Quantity: {selectedOrder.quantity ?? selectedOrder.items?.reduce((s, i) => s + (i.qty || 0), 0)}
                  </div>

                  {selectedOrder.isCustomOrder && (
                    <div style={{ marginBottom: '1rem' }}>
                      <CustomOrderProgress status={selectedOrder.status} designType={selectedOrder.designType} />
                    </div>
                  )}

                  {selectedOrder.proofUrl && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Design Proof</div>
                      <ImageWithFallback src={selectedOrder.proofUrl} alt="Design Proof" label="Proof" style={{ width: '100%', maxWidth: '280px', height: '160px' }} />
                    </div>
                  )}

                  {selectedOrder.status === 'proof_sent' && (
                    <div style={{ padding: '1rem', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '10px', marginBottom: '1rem' }}>
                      <p style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600, marginBottom: '0.75rem' }}>Your design proof is ready. Please review and respond.</p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleApproveDesign(selectedOrder)}
                          disabled={approvingId === (selectedOrder._id ?? selectedOrder.id)}
                          style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', background: '#34d399', color: '#000', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                          {approvingId === (selectedOrder._id ?? selectedOrder.id) ? 'Approving...' : 'Approve & Start Production'}
                        </button>
                        <button
                          onClick={() => { setRevisionTarget(selectedOrder); setRevisionNotes(''); setDesignActionErr(null); }}
                          style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1px solid #f97316', background: 'transparent', color: '#f97316', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                          Request Revision
                        </button>
                      </div>
                      {designActionErr && <p style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: '0.5rem' }}>{designActionErr}</p>}
                    </div>
                  )}

                  {selectedOrder.designUrl && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>Your Design File</div>
                      <ImageWithFallback src={selectedOrder.designUrl} alt="Design" label="Design File" style={{ width: '100%', maxWidth: '200px', height: '120px' }} />
                    </div>
                  )}
                </div>

                {/* Section 3: Pricing */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pricing</h3>
                  {selectedOrder.finalPrice != null
                    ? <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--gold)' }}>Final Price: {formatPeso(selectedOrder.finalPrice)}</div>
                    : <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Awaiting final price from admin</div>
                  }
                </div>

                {/* Section 4: Status History */}
                <div>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status History</h3>
                  {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 ? (
                    <div style={{ position: 'relative', paddingLeft: '1.25rem' }}>
                      <div style={{ position: 'absolute', left: '4px', top: '0', bottom: '0', width: '1px', background: 'var(--border)' }} />
                      {[...selectedOrder.statusHistory].reverse().map((entry, i) => (
                        <div key={i} style={{ position: 'relative', marginBottom: i < selectedOrder.statusHistory.length - 1 ? '1rem' : '0' }}>
                          <div style={{ position: 'absolute', left: '-1.25rem', top: '4px', width: '9px', height: '9px', borderRadius: '50%', background: 'var(--gold)', border: '2px solid var(--dark2)' }} />
                          <div style={{ marginBottom: '0.25rem' }}>
                            <StatusBadge status={entry.status} />
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.125rem' }}>{formatTimestamp(entry.timestamp)}</div>
                          {entry.note && <div style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic' }}>{entry.note}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>No status history available.</div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', gap: '8px' }}>
              {selectedOrder.status === 'delivered' && selectedOrder.productId && (
                <button
                  onClick={() => { closeDetail(); router.push(`/shop/products/${selectedOrder.productId}`); }}
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: '8px',
                    border: '1px solid var(--gold)',
                    background: 'transparent',
                    color: 'var(--gold)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Re-order
                </button>
              )}
              <button onClick={closeDetail} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.625rem 1.25rem', color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Revision Notes Dialog */}
      {revisionTarget && (
        <div onClick={() => { if (!revisionSending) { setRevisionTarget(null); setRevisionNotes(''); setDesignActionErr(null); } }}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Request Design Revision</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--gray)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Describe what you&apos;d like changed. Our designer will update the proof and resend it.
            </p>
            <textarea value={revisionNotes} onChange={e => setRevisionNotes(e.target.value)}
              placeholder="E.g. Change font to bold, shift logo to the left, use darker blue..."
              rows={4}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '0.85rem', fontFamily: "'Outfit', sans-serif", resize: 'vertical', boxSizing: 'border-box', outline: 'none', marginBottom: '0.75rem' }} />
            {designActionErr && <p style={{ fontSize: '0.78rem', color: 'var(--red)', marginBottom: '0.75rem' }}>{designActionErr}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setRevisionTarget(null); setRevisionNotes(''); setDesignActionErr(null); }} disabled={revisionSending}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.85rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSendRevision} disabled={revisionSending}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', background: revisionSending ? 'rgba(249,115,22,0.4)' : '#f97316', color: '#000', fontSize: '0.85rem', fontWeight: 700, cursor: revisionSending ? 'not-allowed' : 'pointer' }}>
                {revisionSending ? 'Sending...' : 'Send Revision Request'}
              </button>
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
              Cancel Design Request?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Are you sure you want to cancel order request{' '}
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
                Keep Request
              </button>
              <button
                onClick={cancelOrder}
                disabled={cancelling}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: 'none',
                  background: cancelling
                    ? 'rgba(239,68,68,0.4)'
                    : 'var(--red)',
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
