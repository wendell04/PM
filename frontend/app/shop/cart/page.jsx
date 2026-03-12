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

// ── Login Required Modal ──────────────────────────────────────────────────────
function LoginRequiredModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Login Required</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.5rem' }}>
            Please Login or Register
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.6 }}>
            You need to have an account to place orders. This helps us process your order and keep you updated on its status.
          </p>
        </div>

        <div className="modal-actions" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <Link href="/#login" className="btn-primary" onClick={onClose} style={{ flex: 1 }}>
            Login
          </Link>
          <Link href="/#register" className="btn-secondary" onClick={onClose} style={{ flex: 1, background: 'var(--gold)', borderColor: 'var(--gold)', color: '#000' }}>
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const router = useRouter();
  const { cart, updateQty, removeFromCart, clearCart } = useCart();

  const [notes, setNotes]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Re-compute unit prices based on current qty
  const enrichedCart = cart.map(item => ({
    ...item,
    unitPrice: resolvePrice(item.product, item.qty),
    lineTotal: resolvePrice(item.product, item.qty) * item.qty,
  }));

  const total = enrichedCart.reduce((sum, i) => sum + i.lineTotal, 0);

  const handleRemoveItem = (productId, variantId) => {
    const key = `${productId}_${variantId}`;
    setRemovingId(key);
    setTimeout(() => {
      removeFromCart(productId, variantId);
      setRemovingId(null);
    }, 300);
  };

  async function handlePlaceOrder() {
    // Check if user is logged in
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    
    if (!token) {
      // User is not logged in - show login modal
      setShowLoginModal(true);
      return;
    }

    setError(null);
    setLoading(true);
    try {
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
      <div className="cart-success-state">
        <div className="cart-success-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="cart-success-title">Order Placed!</h2>
        <p className="cart-success-text">
          Your order has been received. The owner will confirm it shortly.
        </p>
        {typeof success === 'string' && success !== 'success' && (
          <p className="cart-order-id">
            Order ID: <span>{success}</span>
          </p>
        )}
        <div className="cart-actions">
          <Link href="/shop/orders" className="cart-view-orders-btn">
            View My Orders
          </Link>
          <Link href="/shop" className="cart-continue-btn">
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <div className="cart-empty-state">
        <div className="cart-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
            stroke="rgba(212,168,67,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
        <p className="cart-empty-text">Your cart is empty.</p>
        <Link href="/shop" className="cart-continue-btn">
          Browse Products
        </Link>
      </div>
    );
  }

  // ── Cart ────────────────────────────────────────────────────────────────────
  return (
    <div className="cart-page-wrapper">
      <div className="cart-header">
        <Link href="/shop" className="cart-back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Shop
        </Link>
        <span style={{ color: '#444' }}>/</span>
        <h1 className="cart-title">
          Your Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})
        </h1>
      </div>

      <style>{styles}</style>

      <div className="cart-items-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Items */}
        <div className="cart-items-list">
          {enrichedCart.map((item, idx) => {
            const isRemoving = removingId === `${item.product._id}_${item.variantId}`;
            return (
            <div key={idx} className={`cart-item-card${isRemoving ? ' removing' : ''}`} style={{
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
                onClick={() => handleRemoveItem(item.product._id, item.variantId)}
                title="Remove"
                className="cart-remove-btn"
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
          );
          })}
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

      {/* Login Required Modal */}
      <LoginRequiredModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = `
  .cart-page-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .cart-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .cart-back-link {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #888;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    transition: all 0.2s;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .cart-back-link:hover {
    color: #d4a843;
    background: rgba(212, 168, 67, 0.1);
    border-color: rgba(212, 168, 67, 0.3);
  }

  .cart-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #f5f5f5;
  }

  .cart-items-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .cart-item-card {
    background: #161616;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    gap: 1rem;
    align-items: center;
    transition: all 0.2s;
  }

  .cart-item-card:hover {
    border-color: rgba(212, 168, 67, 0.2);
    background: #1a1a1a;
  }

  .cart-item-card.removing {
    opacity: 0;
    transform: translateX(-20px);
    transition: all 0.3s ease;
  }

  .cart-item-thumbnail {
    width: 80px;
    height: 80px;
    flex-shrink: 0;
    border-radius: 8px;
    overflow: hidden;
    background: #222;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cart-item-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cart-item-info {
    flex: 1;
    min-width: 0;
  }

  .cart-item-name {
    font-weight: 600;
    font-size: 1rem;
    color: #f5f5f5;
    margin: 0 0 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cart-item-variant {
    font-size: 0.8rem;
    color: #888;
    margin-bottom: 0.25rem;
  }

  .cart-item-price {
    font-size: 0.85rem;
    color: #d4a843;
    font-weight: 600;
  }

  .cart-qty-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .cart-qty-btn {
    width: 32px;
    height: 32px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: #1a1a1a;
    color: #f5f5f5;
    cursor: pointer;
    font-size: 1.1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .cart-qty-btn:hover {
    background: #d4a843;
    color: #0f0f0f;
    border-color: #d4a843;
  }

  .cart-qty-value {
    min-width: 2rem;
    text-align: center;
    font-weight: 600;
    font-size: 0.95rem;
    color: #f5f5f5;
  }

  .cart-item-total {
    min-width: 90px;
    text-align: right;
    font-weight: 700;
    color: #d4a843;
    font-size: 1rem;
  }

  .cart-remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #555;
    padding: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .cart-remove-btn:hover {
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
  }

  .cart-summary-panel {
    background: #161616;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    padding: 1.5rem;
    position: sticky;
    top: 90px;
  }

  .cart-summary-title {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f5f5f5;
  }

  .cart-summary-lines {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .cart-summary-line {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #888;
  }

  .cart-summary-divider {
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    padding-top: 1rem;
    margin-bottom: 1rem;
  }

  .cart-summary-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
  }

  .cart-summary-total-label {
    font-weight: 700;
    color: #f5f5f5;
    font-size: 1rem;
  }

  .cart-summary-total-value {
    font-weight: 700;
    color: #d4a843;
    font-size: 1.25rem;
  }

  .cart-notes-label {
    display: block;
    font-size: 0.8rem;
    color: #777;
    margin-bottom: 0.5rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cart-notes-input {
    width: 100%;
    padding: 0.75rem;
    background: #111;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #f5f5f5;
    font-size: 0.85rem;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
    font-family: inherit;
  }

  .cart-notes-input:focus {
    border-color: rgba(212, 168, 67, 0.5);
  }

  .cart-error-message {
    background: rgba(255, 77, 79, 0.1);
    border: 1px solid rgba(255, 77, 79, 0.3);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    color: #ff6b6b;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .cart-place-order-btn {
    width: 100%;
    padding: 0.9rem 1.5rem;
    background: #d4a843;
    border: none;
    border-radius: 10px;
    color: #0f0f0f;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cart-place-order-btn:hover:not(:disabled) {
    background: #e5b953;
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(212, 168, 67, 0.3);
  }

  .cart-place-order-btn:disabled {
    background: #5a4a1a;
    cursor: not-allowed;
    opacity: 0.7;
  }

  .cart-disclaimer {
    margin: 0.75rem 0 0;
    font-size: 0.75rem;
    color: #555;
    text-align: center;
  }

  .cart-empty-state {
    max-width: 500px;
    margin: 4rem auto;
    text-align: center;
    padding: 3rem 2rem;
    background: rgba(212, 168, 67, 0.03);
    border: 1px dashed rgba(212, 168, 67, 0.2);
    border-radius: 16px;
  }

  .cart-empty-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 1.5rem;
    background: rgba(212, 168, 67, 0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cart-empty-text {
    color: #555;
    margin: 0 0 1.5rem;
    font-size: 1rem;
  }

  .cart-continue-btn {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: #d4a843;
    border-radius: 10px;
    color: #0f0f0f;
    text-decoration: none;
    font-weight: 700;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .cart-continue-btn:hover {
    background: #e5b953;
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(212, 168, 67, 0.3);
  }

  .cart-success-state {
    max-width: 500px;
    margin: 4rem auto;
    text-align: center;
    padding: 3rem 2rem;
    background: rgba(74, 222, 128, 0.03);
    border: 1px dashed rgba(74, 222, 128, 0.3);
    border-radius: 16px;
  }

  .cart-success-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 1.5rem;
    background: rgba(74, 222, 128, 0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cart-success-title {
    margin: 0 0 0.5rem;
    color: #f5f5f5;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .cart-success-text {
    color: #888;
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  .cart-order-id {
    color: #555;
    font-size: 0.8rem;
    margin-bottom: 2rem;
  }

  .cart-order-id span {
    color: #d4a843;
    font-family: monospace;
  }

  .cart-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .cart-view-orders-btn {
    padding: 0.75rem 1.5rem;
    background: rgba(212, 168, 67, 0.12);
    border: 1px solid rgba(212, 168, 67, 0.3);
    border-radius: 10px;
    color: #d4a843;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .cart-view-orders-btn:hover {
    background: rgba(212, 168, 67, 0.2);
    border-color: rgba(212, 168, 67, 0.5);
  }

  @media (max-width: 768px) {
    .cart-page-wrapper {
      padding: 1.5rem 1rem;
    }

    .cart-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .cart-title {
      font-size: 1.25rem;
    }

    .cart-item-card {
      flex-wrap: wrap;
    }

    .cart-item-thumbnail {
      width: 60px;
      height: 60px;
    }

    .cart-summary-panel {
      position: static;
    }

    .cart-actions {
      flex-direction: column;
    }

    .cart-view-orders-btn,
    .cart-continue-btn {
      width: 100%;
      text-align: center;
    }
  }
`;