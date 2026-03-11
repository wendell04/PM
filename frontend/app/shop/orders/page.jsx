'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const STATUS_STYLES = {
  pending:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)'   },
  confirmed:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)'   },
  processing: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.3)'   },
  completed:  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)'   },
  cancelled:  { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)'  },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: '6px', padding: '2px 8px',
      fontSize: '0.72rem', fontWeight: 600,
      color: s.color, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function OrdersPage() {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/orders/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load orders.');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: 700, color: '#f5f5f5' }}>
            My Orders
          </h1>
          <p style={{ margin: 0, color: '#777', fontSize: '0.85rem' }}>
            Track all your orders here
          </p>
        </div>
        <Link href="/shop" style={{
          padding: '0.5rem 1rem',
          background: 'rgba(212,168,67,0.1)',
          border: '1px solid rgba(212,168,67,0.3)',
          borderRadius: '8px', color: '#d4a843',
          textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600,
        }}>
          ← Back to Shop
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{
              height: '80px', borderRadius: '12px',
              background: 'linear-gradient(90deg, #1a1a1a 25%, #222 50%, #1a1a1a 75%)',
              backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
            }} />
          ))}
        </div>
      ) : error ? (
        <div style={{
          background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)',
          borderRadius: '10px', padding: '1.25rem', color: '#ff6b6b', textAlign: 'center',
        }}>
          {error}
          <button onClick={fetchOrders} style={{
            display: 'block', margin: '0.75rem auto 0',
            background: 'none', border: '1px solid rgba(255,107,107,0.3)',
            borderRadius: '6px', padding: '0.4rem 0.75rem',
            color: '#ff6b6b', cursor: 'pointer', fontSize: '0.8rem',
          }}>
            Try again
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem', color: '#555',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem' }}>
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <p style={{ margin: '0 0 1rem' }}>No orders yet.</p>
          <Link href="/shop" style={{
            display: 'inline-block', padding: '0.6rem 1.25rem',
            background: '#d4a843', borderRadius: '8px',
            color: '#0f0f0f', textDecoration: 'none', fontWeight: 700, fontSize: '0.875rem',
          }}>
            Start Shopping
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {orders.map(order => {
            const isOpen = expanded === order._id;
            return (
              <div key={order._id} style={{
                background: '#161616',
                border: `1px solid ${isOpen ? 'rgba(212,168,67,0.25)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: '12px', overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}>
                {/* Header row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : order._id)}
                  style={{
                    width: '100%', padding: '1rem',
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
                      marginBottom: '0.25rem',
                    }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: '0.72rem', color: '#555',
                      }}>
                        #{order._id?.slice(-8).toUpperCase()}
                      </span>
                      <StatusBadge status={order.status} />
                      {order.paymentStatus === 'paid' && (
                        <span style={{
                          display: 'inline-block',
                          background: 'rgba(74,222,128,0.08)',
                          border: '1px solid rgba(74,222,128,0.2)',
                          borderRadius: '6px', padding: '2px 8px',
                          fontSize: '0.7rem', color: '#4ade80',
                        }}>
                          Paid
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#666' }}>
                      {formatDate(order.created_at)} · {order.items?.length ?? 0} item{order.items?.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#d4a843', fontSize: '1rem', flexShrink: 0 }}>
                    ₱{(order.totalAmount ?? 0).toLocaleString()}
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {/* Expanded details */}
                {isOpen && (
                  <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    padding: '1rem',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {order.items?.map((item, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          fontSize: '0.82rem',
                        }}>
                          <div>
                            <span style={{ color: '#ddd' }}>{item.productName}</span>
                            {item.variantName && (
                              <span style={{ color: '#666', marginLeft: '0.4rem' }}>({item.variantName})</span>
                            )}
                            <span style={{ color: '#555', marginLeft: '0.4rem' }}>×{item.qty}</span>
                          </div>
                          <span style={{ color: '#d4a843', fontWeight: 600 }}>
                            ₱{(item.lineTotal ?? item.unitPrice * item.qty).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px', padding: '0.6rem 0.75rem',
                        fontSize: '0.78rem', color: '#777',
                      }}>
                        <strong style={{ color: '#555' }}>Notes: </strong>{order.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}