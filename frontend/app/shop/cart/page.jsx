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

  const [selectedItems, setSelectedItems] = useState(new Set());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Re-compute unit prices based on current qty
  const enrichedCart = cart.map(item => ({
    ...item,
    unitPrice: resolvePrice(item.product, item.qty),
    lineTotal: resolvePrice(item.product, item.qty) * item.qty,
  }));

  // Toggle select item
  const toggleSelectItem = (key) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedItems(newSelected);
  };

  // Select all
  const toggleSelectAll = () => {
    if (selectedItems.size === enrichedCart.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(enrichedCart.map((_, i) => i)));
    }
  };

  // Get selected items
  const selectedCartItems = enrichedCart.filter((_, i) => selectedItems.has(i));
  const selectedTotal = selectedCartItems.reduce((sum, i) => sum + i.lineTotal, 0);

  const handleRemoveItem = (productId, variantId, index) => {
    const key = `${productId}_${variantId}`;
    setRemovingId(key);
    setTimeout(() => {
      removeFromCart(productId, variantId);
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
      setRemovingId(null);
    }, 300);
  };

  const handleDeleteSelected = () => {
    if (selectedItems.size === 0) return;
    const itemsToRemove = Array.from(selectedItems).map(i => enrichedCart[i]);
    itemsToRemove.forEach(item => {
      removeFromCart(item.product._id, item.variantId);
    });
    setSelectedItems(new Set());
  };

  async function handlePlaceOrder() {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');

    if (!token) {
      setShowLoginModal(true);
      return;
    }

    if (selectedItems.size === 0) {
      setError('Please select at least one item to order.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const items = selectedCartItems.map(i => ({
        productId: i.product._id,
        variantId: i.variantId ?? null,
        variantName: i.variantName ?? null,
        qty: i.qty,
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

      // Remove ordered items from cart
      selectedCartItems.forEach(item => {
        removeFromCart(item.product._id, item.variantId);
      });

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
        <span className="cart-divider">/</span>
        <h1 className="cart-title">
          Shopping Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})
        </h1>
      </div>

      <div className="cart-content">
        {/* Items Section */}
        <div className="cart-items-section">
          {/* Header with Select All */}
          <div className="cart-items-header">
            <label className="cart-select-all">
              <input
                type="checkbox"
                checked={selectedItems.size === enrichedCart.length && enrichedCart.length > 0}
                onChange={toggleSelectAll}
                className="cart-checkbox"
              />
              <span className="cart-checkbox-label">Select All ({enrichedCart.length})</span>
            </label>
            {selectedItems.size > 0 && (
              <button className="cart-delete-selected" onClick={handleDeleteSelected}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                </svg>
                Delete ({selectedItems.size})
              </button>
            )}
          </div>

          {/* Items List - Shopee Style */}
          <div className="cart-items-list">
            {enrichedCart.map((item, idx) => {
              const key = `${item.product._id}_${item.variantId}`;
              const isRemoving = removingId === key;
              const isSelected = selectedItems.has(idx);

              return (
                <div key={idx} className={`cart-item-card ${isRemoving ? 'removing' : ''} ${isSelected ? 'selected' : ''}`}>
                  {/* Checkbox */}
                  <div className="cart-item-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectItem(idx)}
                      className="cart-checkbox"
                    />
                  </div>

                  {/* Thumbnail */}
                  <Link href={`/shop/${item.product._id}`} className="cart-item-thumbnail">
                    {item.product.images?.[0]
                      ? <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.product.images[0]} alt="" />
                        </>
                      : <div className="cart-item-no-image">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                        </div>
                    }
                  </Link>

                  {/* Info */}
                  <div className="cart-item-info">
                    <Link href={`/shop/${item.product._id}`} className="cart-item-name">
                      {item.product.name}
                    </Link>
                    {item.variantName && (
                      <div className="cart-item-variant">
                        <span className="cart-variant-label">Variant:</span> {item.variantName}
                      </div>
                    )}
                    <div className="cart-item-price">
                      ₱{item.unitPrice.toLocaleString()} / pc
                    </div>
                  </div>

                  {/* Qty Controls */}
                  <div className="cart-item-qty">
                    <div className="cart-qty-stepper">
                      <button
                        onClick={() => updateQty(item.product._id, item.variantId, item.qty - 1)}
                        className="cart-qty-btn"
                        disabled={item.qty <= 1}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          if (val >= 1) updateQty(item.product._id, item.variantId, val);
                        }}
                        className="cart-qty-input"
                        min="1"
                      />
                      <button
                        onClick={() => updateQty(item.product._id, item.variantId, item.qty + 1)}
                        className="cart-qty-btn"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Line Total */}
                  <div className="cart-item-total">
                    <div className="cart-total-amount">₱{item.lineTotal.toLocaleString()}</div>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveItem(item.product._id, item.variantId, idx)}
                    className="cart-remove-btn"
                    title="Remove item"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Continue Shopping */}
          <div className="cart-continue-shopping">
            <Link href="/shop" className="cart-continue-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              Continue Shopping
            </Link>
          </div>
        </div>

        {/* Order Summary Panel */}
        <div className="cart-summary-panel">
          <div className="cart-summary-header">
            <h2>Order Summary</h2>
          </div>

          <div className="cart-summary-body">
            {/* Selected Items Count */}
            <div className="cart-summary-row">
              <span>Selected Items</span>
              <span>{selectedCartItems.length} of {enrichedCart.length}</span>
            </div>

            {/* Subtotal */}
            <div className="cart-summary-row">
              <span>Subtotal</span>
              <span>₱{selectedTotal.toLocaleString()}</span>
            </div>

            {/* Shipping */}
            <div className="cart-summary-row cart-summary-note">
              <span>Shipping</span>
              <span className="cart-shipping-note">Calculated after confirmation</span>
            </div>

            {/* Divider */}
            <div className="cart-summary-divider" />

            {/* Total */}
            <div className="cart-summary-total">
              <span>Total</span>
              <span className="cart-total-price">₱{selectedTotal.toLocaleString()}</span>
            </div>

            {/* Order Notes */}
            <div className="cart-notes-section">
              <label className="cart-notes-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                Order Notes (optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. design requests, preferred pickup date, special instructions..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="cart-notes-input"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="cart-error-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Place Order Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={loading || selectedItems.size === 0}
              className="cart-place-order-btn"
            >
              {loading ? (
                <>
                  <svg className="cart-loading-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
                  </svg>
                  Placing Order...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 0 1-8 0"/>
                  </svg>
                  Place Order
                </>
              )}
            </button>

            {/* Disclaimer */}
            <p className="cart-disclaimer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Payment will be arranged with the owner after confirmation.
            </p>
          </div>
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
    padding: 1.5rem;
  }

  .cart-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .cart-back-link {
    display: inline-flex;
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

  .cart-divider {
    color: #444;
  }

  .cart-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #f5f5f5;
  }

  .cart-content {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 1.5rem;
    align-items: start;
  }

  /* Items Section */
  .cart-items-section {
    background: #161616;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    overflow: hidden;
  }

  .cart-items-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .cart-select-all {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: #888;
  }

  .cart-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #d4a843;
  }

  .cart-checkbox-label {
    user-select: none;
  }

  .cart-delete-selected {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 0.5rem 0.875rem;
    color: #ef4444;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cart-delete-selected:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
  }

  .cart-items-list {
    display: flex;
    flex-direction: column;
  }

  .cart-item-card {
    display: grid;
    grid-template-columns: auto 100px 1fr auto auto auto;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: all 0.2s;
  }

  .cart-item-card:last-child {
    border-bottom: none;
  }

  .cart-item-card:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .cart-item-card.selected {
    background: rgba(212, 168, 67, 0.05);
  }

  .cart-item-card.removing {
    opacity: 0;
    transform: translateX(-20px);
    transition: all 0.3s ease;
  }

  .cart-item-checkbox {
    display: flex;
    align-items: center;
  }

  .cart-item-thumbnail {
    width: 100px;
    height: 100px;
    border-radius: 8px;
    overflow: hidden;
    background: #1a1a1a;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .cart-item-thumbnail:hover {
    transform: scale(1.05);
  }

  .cart-item-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cart-item-no-image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.15);
  }

  .cart-item-info {
    min-width: 0;
    padding: 0 0.5rem;
  }

  .cart-item-name {
    display: block;
    font-weight: 600;
    font-size: 0.95rem;
    color: #f5f5f5;
    text-decoration: none;
    margin-bottom: 0.5rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.2s;
  }

  .cart-item-name:hover {
    color: #d4a843;
  }

  .cart-item-variant {
    font-size: 0.8rem;
    color: #888;
    margin-bottom: 0.5rem;
  }

  .cart-variant-label {
    color: #666;
    font-size: 0.75rem;
  }

  .cart-item-price {
    font-size: 0.9rem;
    color: #d4a843;
    font-weight: 600;
  }

  .cart-item-qty {
    padding: 0 0.5rem;
  }

  .cart-qty-stepper {
    display: flex;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    overflow: hidden;
  }

  .cart-qty-btn {
    width: 32px;
    height: 32px;
    border: none;
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

  .cart-qty-btn:hover:not(:disabled) {
    background: #d4a843;
    color: #0f0f0f;
  }

  .cart-qty-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .cart-qty-input {
    width: 50px;
    height: 32px;
    border: none;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: #f5f5f5;
    text-align: center;
    font-size: 0.9rem;
    font-weight: 600;
    outline: none;
    -moz-appearance: textfield;
  }

  .cart-qty-input::-webkit-outer-spin-button,
  .cart-qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .cart-item-total {
    padding: 0 0.5rem;
    min-width: 100px;
    text-align: right;
  }

  .cart-total-amount {
    font-weight: 700;
    color: #d4a843;
    font-size: 1.1rem;
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
    flex-shrink: 0;
  }

  .cart-remove-btn:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .cart-continue-shopping {
    padding: 1rem 1.25rem;
    background: rgba(255, 255, 255, 0.02);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .cart-continue-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: #888;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: color 0.2s;
  }

  .cart-continue-link:hover {
    color: #d4a843;
  }

  /* Summary Panel */
  .cart-summary-panel {
    background: #161616;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    overflow: hidden;
    position: sticky;
    top: 90px;
  }

  .cart-summary-header {
    padding: 1.25rem;
    background: rgba(212, 168, 67, 0.1);
    border-bottom: 1px solid rgba(212, 168, 67, 0.2);
  }

  .cart-summary-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #d4a843;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cart-summary-body {
    padding: 1.25rem;
  }

  .cart-summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    font-size: 0.9rem;
    color: #888;
  }

  .cart-summary-note {
    font-size: 0.85rem;
  }

  .cart-shipping-note {
    color: #666;
    font-size: 0.8rem;
  }

  .cart-summary-divider {
    border-top: 1px dashed rgba(255, 255, 255, 0.1);
    margin: 0.5rem 0;
  }

  .cart-summary-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    font-size: 1.1rem;
  }

  .cart-summary-total span:first-child {
    font-weight: 600;
    color: #f5f5f5;
  }

  .cart-total-price {
    font-weight: 800;
    color: #d4a843;
    font-size: 1.4rem;
  }

  .cart-notes-section {
    margin: 1rem 0;
  }

  .cart-notes-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #777;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.5rem;
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
    min-height: 80px;
  }

  .cart-notes-input:focus {
    border-color: rgba(212, 168, 67, 0.5);
  }

  .cart-error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    color: #ef4444;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .cart-place-order-btn {
    width: 100%;
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, #d4a843 0%, #c4963a 100%);
    border: none;
    border-radius: 10px;
    color: #0f0f0f;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .cart-place-order-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(212, 168, 67, 0.4);
  }

  .cart-place-order-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .cart-loading-spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .cart-disclaimer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin: 1rem 0 0;
    font-size: 0.75rem;
    color: #555;
    text-align: center;
  }

  /* Empty State */
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

  /* Success State */
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

  /* Responsive */
  @media (max-width: 900px) {
    .cart-content {
      grid-template-columns: 1fr;
    }

    .cart-summary-panel {
      position: static;
    }
  }

  @media (max-width: 768px) {
    .cart-page-wrapper {
      padding: 1rem;
    }

    .cart-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .cart-title {
      font-size: 1.25rem;
    }

    .cart-item-card {
      grid-template-columns: auto 70px 1fr;
      grid-template-rows: auto auto;
      gap: 0.75rem;
      padding: 1rem;
    }

    .cart-item-checkbox {
      grid-row: 1;
      grid-column: 1;
    }

    .cart-item-thumbnail {
      grid-row: 1 / span 2;
      grid-column: 2;
      width: 70px;
      height: 70px;
    }

    .cart-item-info {
      grid-row: 1;
      grid-column: 3;
      padding: 0;
    }

    .cart-item-qty {
      grid-row: 2;
      grid-column: 3;
      justify-self: start;
      padding: 0;
    }

    .cart-item-total {
      grid-row: 1 / span 2;
      grid-column: 4;
      justify-self: end;
      padding: 0;
    }

    .cart-remove-btn {
      grid-row: 1 / span 2;
      grid-column: 5;
      justify-self: end;
    }

    .cart-items-header {
      flex-direction: column;
      gap: 0.75rem;
      align-items: flex-start;
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