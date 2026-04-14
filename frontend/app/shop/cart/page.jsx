'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../layout';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useAuth } from '@/contexts/AuthContext';
import '@/app/shop/shop.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Mirrors layout’s openAuthModalWithRedirect — cart cannot import shop layout, so we dispatch the same event.
function openAuthModalWithRedirect(returnPath) {
  window.dispatchEvent(new CustomEvent('pmp_open_auth', {
    detail: { type: 'login', returnPath },
  }));
}

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
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block'}}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.5rem' }}>
            Please Login or Register
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.6 }}>
            You need to have an account to place orders. This helps us process your order and keep you updated on its status.
          </p>
        </div>

        <div className="modal-actions" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            onClick={() => {
              onClose();
              openAuthModalWithRedirect('/shop/checkout');
            }}
          >
            Login
          </button>
          <button
            className="btn-secondary"
            style={{ flex: 1, background: 'var(--gold)', borderColor: 'var(--gold)', color: 'var(--black)' }}
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'register' } }));
            }}
          >
            Register
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const router = useRouter();
  const { cartItems, isCartLoading, updateQty, removeFromCart, bulkRemove, clearCart } = useCart();
  const { token } = useAuth();

  const [selectedItems, setSelectedItems] = useState(new Set());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Re-compute unit prices based on current qty
  const enrichedCart = useMemo(() => (cartItems || []).map(item => {
    const qty = Math.max(1, parseInt(item.qty) || 1);
    const unitPrice = item.unitPrice || 0;
    return {
      ...item,
      qty,
      unitPrice,
      lineTotal: item.lineTotal || (qty * unitPrice),
      product: item.product ?? {
        _id: item.productId,
        name: item.productName,
        images: item.image ? [item.image] : [],
      },
    };
  }), [cartItems]);

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
    const key = `${productId}_${variantId ?? 'none'}`;
    setRemovingId(key);
    const timer = setTimeout(() => {
      removeFromCart(productId, variantId ?? null);
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
      setRemovingId(null);
    }, 300);
    return () => clearTimeout(timer);
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    const toRemove = Array.from(selectedItems).map(i => ({
      productId: enrichedCart[i].productId,
      variantId: enrichedCart[i].variantId ?? null,
    }));
    await bulkRemove(toRemove);
    setSelectedItems(new Set());
  };

  function handlePlaceOrder() {
    if (!token) {
      // Flush guest cart to localStorage immediately
      // before showing login modal, so the merge
      // after login finds the correct items.
      try {
        const guestItems = enrichedCart.map(i => ({
          productId:   i.product._id,
          productName: i.product.name,
          image:       i.product.images?.[0] ?? i.image ?? null,
          variantId:   i.variantId   ?? null,
          variantName: i.variantName ?? null,
          qty:         i.qty,
          unitPrice:   i.unitPrice,
        }));
        if (guestItems.length > 0) {
          localStorage.setItem('pmp_guest_cart', JSON.stringify(guestItems));
        }
      } catch {}
      setShowLoginModal(true);
      return;
    }

    if (selectedItems.size === 0) {
      setError('Please select at least one item to order.');
      return;
    }

    setError(null);

    // Serialize selected cart items for checkout page
    const payload = {
      items: selectedCartItems.map(i => ({
        product: {
          _id:    i.product._id,
          name:   i.product.name,
          images: i.product.images ?? [],
        },
        variantId:   i.variantId   ?? null,
        variantName: i.variantName ?? null,
        qty:         i.qty,
        unitPrice:   i.unitPrice,
      })),
      notes,
    };

    sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
    router.push('/shop/checkout');
  }

  {/* success state removed — order placement now redirects to /shop/payment-success */}

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (!isCartLoading && enrichedCart.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '60vh',
        padding: '2rem',
      }}>
        <div>
          <Link href="/shop" className="back-to-shop-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to Shop
          </Link>
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
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
        </div>
      </div>
    );
  }

  // ── Cart ────────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="cart-page-wrapper">
      <div className="cart-header">
        <Link href="/shop" className="back-to-shop-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Shop
        </Link>
        <span className="cart-divider">/</span>
        <h1 className="cart-title">
          Shopping Cart ({enrichedCart.length} item{enrichedCart.length !== 1 ? 's' : ''})
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
              const key = `${item.productId}_${item.variantId ?? 'none'}`;
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
                  <Link href={`/shop/products/${item.product._id}`} className="cart-item-thumbnail">
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
                    <Link href={`/shop/products/${item.product._id}`} className="cart-item-name">
                      {item.product.name}
                    </Link>
                    {item.variantName && (
                      <div className="cart-item-variant">
                        <span className="cart-variant-label">Variant:</span> {item.variantName}
                      </div>
                    )}
                    <div className="cart-item-price">
                      ₱{Number(item.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / pc
                    </div>
                  </div>

                  {/* Qty Controls */}
                  <div className="cart-item-qty">
                    <div className="cart-qty-stepper">
                      <button
                        onClick={() => updateQty(item.productId, item.variantId ?? null, item.qty - 1)}
                        className="cart-qty-btn"
                        disabled={item.qty <= 1}
                      >
                        −
                      </button>
                      <span className="cart-qty-input" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                      }}>
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateQty(item.productId, item.variantId ?? null, item.qty + 1)}
                        className="cart-qty-btn"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Line Total */}
                  <div className="cart-item-total">
                    <div className="cart-total-amount">₱{Number(item.lineTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveItem(item.productId, item.variantId ?? null, idx)}
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

          {/* removed duplicate Continue Shopping — Back to Shop in header serves this purpose */}
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
              <span>₱{Number(selectedTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
              <span className="cart-total-price">₱{Number(selectedTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
              disabled={selectedItems.size === 0}
              className="cart-place-order-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              Check Out ({selectedItems.size})
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
    </ErrorBoundary>
  );
}
