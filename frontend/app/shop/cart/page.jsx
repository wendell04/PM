'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function resolvePrice(product, qty) {
  const tiers = product.priceTiers ?? [];
  if (tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    for (const tier of sorted) {
      if (qty >= tier.minQty && qty <= (tier.maxQty ?? Infinity)) return tier.price;
    }
    return sorted[sorted.length - 1].price;
  }
  return product.flatPrice ?? 0;
}

export default function CartPage() {
  const router = useRouter();
  const { cart, updateQty, removeFromCart, clearCart } = useCart();

  const [notes, setNotes]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);

  // Re-compute unit prices based on current qty
  const enrichedCart = cart.map(item => ({
    ...item,
    unitPrice: resolvePrice(item.product, item.qty),
    lineTotal: resolvePrice(item.product, item.qty) * item.qty,
  }));

  const total = enrichedCart.reduce((sum, i) => sum + i.lineTotal, 0);

  async function handlePlaceOrder() {
    setError(null);
    setLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const items = enrichedCart.map(i => ({
        productId:   i.product._id,
        variantId:   i.variantId ?? null,
        variantName: i.variantName ?? null,
        qty:         i.qty,
      }));

      const res = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items, notes }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to place order.');

      clearCart();
      setSuccess(data.order?._id ?? 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{
        maxWidth: '500px', margin: '4rem auto',
        textAlign: 'center',
      }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: 'rgba(74,222,128,0.1)',
          border: '1px solid rgba(74,222,128,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.5rem',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 style={{ margin: '0 0 0.5rem', color: '#f5f5f5', fontSize: '1.4rem' }}>Order Placed!</h2>
        <p style={{ color: '#888', margin: '0 0 0.5rem', fontSize: '0.875rem' }}>
          Your order has been received. The owner will confirm it shortly.
        </p>
        {typeof success === 'string' && success !== 'success' && (
          <p style={{ color: '#555', fontSize: '0.75rem', marginBottom: '1.5rem' }}>
            Order ID: <span style={{ color: '#d4a843', fontFamily: 'monospace' }}>{success}</span>
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <Link href="/shop/orders" style={{
            padding: '0.65rem 1.25rem',
            background: 'rgba(212,168,67,0.12)',
            border: '1px solid rgba(212,168,67,0.3)',
            borderRadius: '8px', color: '#d4a843',
            textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600,
          }}>
            View My Orders
          </Link>
          <Link href="/shop" style={{
            padding: '0.65rem 1.25rem',
            background: '#d4a843', border: 'none',
            borderRadius: '8px', color: '#0f0f0f',
            textDecoration: 'none', fontSize: '0.875rem', fontWeight: 700,
          }}>
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <div style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ marginBottom: '1rem' }}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
        <p style={{ color: '#555', margin: '0 0 1.5rem', fontSize: '0.95rem' }}>Your cart is empty.</p>
        <Link href="/shop" style={{
          display: 'inline-block',
          padding: '0.65rem 1.5rem',
          background: '#d4a843', borderRadius: '8px',
          color: '#0f0f0f', textDecoration: 'none',
          fontWeight: 700, fontSize: '0.875rem',
        }}>
          Browse Products
        </Link>
      </div>
    );
  }

  // ── Cart ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        <Link href="/shop" style={{ color: '#777', textDecoration: 'none', fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Shop
        </Link>
        <span style={{ color: '#444' }}>/</span>
        <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f5f5f5' }}>
          Your Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {enrichedCart.map((item, idx) => (
            <div key={idx} style={{
              background: '#161616',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px',
              padding: '1rem',
              display: 'flex', gap: '1rem', alignItems: 'center',
            }}>
              {/* Thumbnail */}
              <div style={{
                width: '70px', height: '70px', flexShrink: 0,
                background: item.product.images?.[0] ? 'transparent' : '#222',
                borderRadius: '8px', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.product.images?.[0]
                  ? <img src={item.product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                      stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                }
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600, fontSize: '0.9rem', color: '#f5f5f5',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.product.name}
                </div>
                {item.variantName && (
                  <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>
                    Variant: {item.variantName}
                  </div>
                )}
                <div style={{ fontSize: '0.78rem', color: '#d4a843', marginTop: '4px' }}>
                  ₱{item.unitPrice.toLocaleString()} / pc
                </div>
              </div>

              {/* Qty controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button onClick={() => updateQty(item.product._id, item.variantId, item.qty - 1)} style={{
                  width: '28px', height: '28px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px', background: '#1a1a1a', color: '#f5f5f5',
                  cursor: 'pointer', fontSize: '1rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>−</button>
                <span style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
                  {item.qty}
                </span>
                <button onClick={() => updateQty(item.product._id, item.variantId, item.qty + 1)} style={{
                  width: '28px', height: '28px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px', background: '#1a1a1a', color: '#f5f5f5',
                  cursor: 'pointer', fontSize: '1rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>+</button>
              </div>

              {/* Line total */}
              <div style={{ minWidth: '80px', textAlign: 'right', fontWeight: 700, color: '#d4a843', fontSize: '0.9rem' }}>
                ₱{item.lineTotal.toLocaleString()}
              </div>

              {/* Remove */}
              <button
                onClick={() => removeFromCart(item.product._id, item.variantId)}
                title="Remove"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#555', padding: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#ff6b6b'}
                onMouseLeave={e => e.currentTarget.style.color = '#555'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Order summary */}
        <div style={{
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '12px', padding: '1.25rem',
          position: 'sticky', top: '80px',
        }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#f5f5f5' }}>
            Order Summary
          </h2>

          {/* Line items summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {enrichedCart.map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '0.78rem', color: '#888',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                  {item.product.name}{item.variantName ? ` (${item.variantName})` : ''} ×{item.qty}
                </span>
                <span>₱{item.lineTotal.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingTop: '0.75rem', marginBottom: '1rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 700, color: '#f5f5f5' }}>Total</span>
            <span style={{ fontWeight: 700, color: '#d4a843', fontSize: '1.1rem' }}>
              ₱{total.toLocaleString()}
            </span>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#777', marginBottom: '0.4rem', fontWeight: 500 }}>
              ORDER NOTES (optional)
            </label>
            <textarea
              rows={3}
              placeholder="e.g. design requests, preferred pickup date..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%', padding: '0.6rem',
                background: '#111', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', color: '#f5f5f5',
                fontSize: '0.8rem', resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(255,77,79,0.1)',
              border: '1px solid rgba(255,77,79,0.3)',
              borderRadius: '8px', padding: '0.6rem 0.75rem',
              color: '#ff6b6b', fontSize: '0.8rem',
              marginBottom: '0.75rem',
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handlePlaceOrder}
            disabled={loading}
            style={{
              width: '100%', padding: '0.8rem',
              background: loading ? '#5a4a1a' : '#d4a843',
              border: 'none', borderRadius: '10px',
              color: '#0f0f0f', fontWeight: 700, fontSize: '0.9rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Placing Order…' : 'Place Order'}
          </button>

          <p style={{
            margin: '0.75rem 0 0',
            fontSize: '0.72rem', color: '#555', textAlign: 'center',
          }}>
            Payment will be arranged with the owner after confirmation.
          </p>
        </div>
      </div>
    </div>
  );
}