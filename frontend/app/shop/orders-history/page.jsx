'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyOrders, fetchMyOrder } from '@/lib/ordersApi';
import { StatusBadge, formatDate, formatPeso } from '@/lib/shopUtils';

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

// ─── Main Page ──────────────────────────────────────────
export default function OrdersHistoryPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [orders, setOrders]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  // Detail modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState(null);
  const [modalOpen, setModalOpen]         = useState(false);

  // Cancel dialog
  const [cancelTarget, setCancelTarget]   = useState(null);
  const [cancelling, setCancelling]       = useState(false);
  const [cancelError, setCancelError]     = useState(null);

  // ── Load orders list ───────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyOrders(token);
      const raw = data?.data ?? (Array.isArray(data) ? data : []);
      setOrders(raw);
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
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => {
      if (!modalOpen) {
        loadOrders();
      }
    }, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, modalOpen, loadOrders]);

  // ── Open detail modal ──────────────────────────────
  const openDetail = useCallback(async (order) => {
    setSelectedOrder(order);
    setDetailError(null);
    setDetailLoading(true);
    setModalOpen(true);
    try {
      const data = await fetchMyOrder(order.id ?? order._id, token);
      const detail = data?.data ?? data;
      setSelectedOrder(detail);
    } catch (err) {
      setDetailError(err.message || 'Failed to load order details.');
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const closeModal = () => {
    setModalOpen(false);
    setSelectedOrder(null);
    setDetailError(null);
  };

  const cancelOrder = async () => {
    if (!cancelTarget || !token) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const res = await fetch(`${API_URL}/api/orders/my/${cancelTarget._id ?? cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.message || 'Failed to cancel order.');
        return;
      }
      setCancelTarget(null);
      loadOrders();
    } catch (err) {
      setCancelError(err.message || 'Failed to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  // ── Render ─────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--dark)', padding: '24px 16px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
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
            border: '1px solid var(--danger, #ef4444)',
            color: 'var(--danger, #ef4444)',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: '16px',
          }}>
            <span>{error}</span>
            <button
              onClick={loadOrders}
              style={{
                background: 'none',
                border: '1px solid var(--danger, #ef4444)',
                borderRadius: '6px',
                color: 'var(--danger, #ef4444)',
                padding: '4px 12px', fontSize: '13px', cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && orders.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '4rem 1rem',
            color: 'var(--gray)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🛍️</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--white)', marginBottom: '8px' }}>
              No orders yet
            </div>
            <div style={{ fontSize: '0.875rem', marginBottom: '20px' }}>
              Your purchase history will appear here.
            </div>
            <Link href="/shop" style={{
              display: 'inline-block',
              padding: '10px 24px',
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

        {/* Order list */}
        {!loading && !error && orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {orders.map(order => {
              const oid = order.id ?? order._id;
              const items = order.items || [];
              const firstName = items[0]?.productName || items[0]?.product_name || 'Order';
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
                    <StatusBadge status={order.orderStatus} />
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '4px' }}>
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
                          border: '1px solid var(--danger, #ef4444)',
                          background: 'transparent',
                          color: 'var(--danger, #ef4444)',
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

              {/* Detail loading */}
              {detailLoading && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray)' }}>
                  Loading order details...
                </div>
              )}

              {/* Detail error */}
              {!detailLoading && detailError && (
                <div style={{
                  padding: '12px 16px', borderRadius: '8px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid var(--danger, #ef4444)',
                  color: 'var(--danger, #ef4444)',
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: '12px',
                }}>
                  <span>{detailError}</span>
                  <button
                    onClick={() => selectedOrder && openDetail(selectedOrder)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--danger, #ef4444)',
                      borderRadius: '6px',
                      color: 'var(--danger, #ef4444)',
                      padding: '4px 10px', fontSize: '12px', cursor: 'pointer',
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Detail content */}
              {!detailLoading && !detailError && selectedOrder && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

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
                        ['Order ID',   `#${(selectedOrder.id ?? selectedOrder._id)?.slice(-8).toUpperCase()}`],
                        ['Status',     null],
                        ['Payment',    selectedOrder.paymentStatus],
                        ['Date',       formatDate(selectedOrder.createdAt)],
                        ['Method',     selectedOrder.paymentMethod || '—'],
                      ].map(([label, value]) => (
                        <div key={label} style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', gap: '8px',
                        }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{label}</span>
                          {label === 'Status'
                            ? <StatusBadge status={selectedOrder.orderStatus} />
                            : <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>{value}</span>
                          }
                        </div>
                      ))}
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
                                Line: {formatPeso(lineTotal)}
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
                      {selectedOrder.shippingFee > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Shipping</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>
                            {formatPeso(selectedOrder.shippingFee)}
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
                          <span style={{ fontSize: '0.875rem', color: 'var(--danger, #ef4444)', fontWeight: 600 }}>
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
                  </div>

                  {/* Section 4: Delivery */}
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
                          selectedOrder.deliveryAddress.street,
                          selectedOrder.deliveryAddress.city,
                          selectedOrder.deliveryAddress.province,
                          selectedOrder.deliveryAddress.zip,
                        ].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Section 5: Production */}
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

                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end',
            }}>
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
                border: '1px solid var(--danger, #ef4444)',
                color: 'var(--danger, #ef4444)',
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
                  background: cancelling ? 'rgba(239,68,68,0.4)' : 'var(--danger, #ef4444)',
                  color: '#fff', fontSize: '0.875rem',
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

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
