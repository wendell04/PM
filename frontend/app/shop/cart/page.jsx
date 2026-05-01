'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../layout';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useAuth } from '@/contexts/AuthContext';
import { uploadDesignFile } from '@/lib/orderRequestApi';
import '@/app/shop/shop.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const MAX_QTY = 99;

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
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  // designChoices: { [lineId]: { mode: 'upload'|'request'|null, file: File|null, url: string|null, uploading: boolean } }
  const [designChoices, setDesignChoices] = useState({});
  const removeTimerRef = useRef(null);

  const setDesignChoice = (lineId, patch) =>
    setDesignChoices(prev => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));

  async function handleDesignFileSelect(lineId, file) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) { setError('Design must be JPG, PNG, WEBP, or PDF.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Design file must be under 10 MB.'); return; }
    setError(null);
    setDesignChoice(lineId, { mode: 'upload', file, url: null, uploading: !!token });
    if (token) {
      try {
        const { url } = await uploadDesignFile(token, file);
        setDesignChoice(lineId, { url, uploading: false });
      } catch {
        setDesignChoice(lineId, { mode: null, file: null, url: null, uploading: false });
        setError('Upload failed. Please try again.');
      }
    }
  }

  function handleRequestDesign(lineId) {
    setDesignChoices(prev => {
      const cur = prev[lineId];
      const next = cur?.mode === 'request' ? { mode: null, file: null, url: null, uploading: false } : { mode: 'request', file: null, url: null, uploading: false };
      return { ...prev, [lineId]: next };
    });
  }

  useEffect(() => () => { if (removeTimerRef.current) clearTimeout(removeTimerRef.current); }, []);

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
        _id:                 item.productId,
        name:                item.productName,
        images:              item.image ? [item.image] : [],
        minOrderQty:         item.minOrderQty ?? null,
        requiresDownpayment: item.requiresDownpayment ?? false,
        downpaymentPercent:  item.downpaymentPercent ?? null,
        downpaymentMinQty:   item.downpaymentMinQty ?? null,
      },
      stockCap: (() => {
        const tracked = item.trackInventory && item.stockStatus !== 'upon-order';
        return tracked ? Math.max(item.stock ?? 99, 1) : 99;
      })(),
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
  const selectedBaseTotal = selectedCartItems.reduce((sum, i) => sum + i.lineTotal, 0);
  const selectedDesignFee = selectedCartItems.reduce((sum, i) => {
    const choice = designChoices[i.lineId];
    return sum + ((choice?.mode === 'request' && i.designFee > 0) ? (i.designFee * i.qty) : 0);
  }, 0);
  const selectedTotal = selectedBaseTotal + selectedDesignFee;

  const handleRemoveItem = (lineId, index) => {
    setRemovingId(lineId);
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    removeTimerRef.current = setTimeout(() => {
      removeFromCart(lineId);
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
      setRemovingId(null);
    }, 300);
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    const lineIds = Array.from(selectedItems).map(i => enrichedCart[i].lineId);
    await bulkRemove(lineIds);
    setSelectedItems(new Set());
  };

  // Order-level DP: if ANY selected item requires DP, apply the highest DP% to the full order total
  const dpPercent = selectedCartItems
    .filter(i => i.requiresDownpayment)
    .reduce((max, i) => Math.max(max, i.downpaymentPercent ?? 50), 0);
  const dpRequired = dpPercent > 0;
  const dpAmountDue = dpRequired ? Math.round(selectedTotal * dpPercent / 100 * 100) / 100 : selectedTotal;
  const dpRemaining = dpRequired ? Math.round((selectedTotal - dpAmountDue) * 100) / 100 : 0;

  async function handlePlaceOrder() {
    if (isCheckingOut) return;
    if (!token) {
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
        if (guestItems.length > 0) localStorage.setItem('pmp_guest_cart', JSON.stringify(guestItems));
      } catch {}
      setShowLoginModal(true);
      return;
    }

    if (selectedItems.size === 0) {
      setError('Please select at least one item to order.');
      return;
    }

    // Validate all selected custom items have a design choice
    const customWithNoDesign = selectedCartItems.filter(i => {
      if (!i.isCustom) return false;
      if (i.designUrl) return false; // already has design from product page
      const choice = designChoices[i.lineId];
      return !choice || (choice.mode !== 'request' && !choice.url);
    });
    if (customWithNoDesign.length > 0) {
      setError(`Please attach a design or request design service for: ${customWithNoDesign.map(i => i.product.name).join(', ')}`);
      return;
    }

    // Upload any pending design files (mode='upload' but still uploading or no url yet)
    const pendingUploads = selectedCartItems.filter(i => {
      const ch = designChoices[i.lineId];
      return ch?.mode === 'upload' && ch.file && !ch.url;
    });
    if (pendingUploads.length > 0) {
      setIsCheckingOut(true);
      try {
        for (const item of pendingUploads) {
          const ch = designChoices[item.lineId];
          setDesignChoice(item.lineId, { uploading: true });
          const { url } = await uploadDesignFile(token, ch.file);
          setDesignChoice(item.lineId, { url, uploading: false });
        }
      } catch {
        setError('Design upload failed. Please try again.');
        setIsCheckingOut(false);
        return;
      }
    }

    setError(null);
    setIsCheckingOut(true);

    // Read latest designChoices after uploads
    const latestChoices = { ...designChoices };
    for (const item of pendingUploads) {
      // already updated via setDesignChoice — but state may not be flushed yet
      // so we re-read from the file that was just uploaded above via closure
    }

    const payload = {
      items: selectedCartItems.map(i => {
        const choice = latestChoices[i.lineId];
        const designUrl = choice?.url ?? i.designUrl ?? null;
        const designRequested = choice?.mode === 'request';
        const designFee = i.designFee ?? null;
        return {
          product: {
            _id:                 i.product._id,
            name:                i.product.name,
            thumbnail:           i.thumbnail ?? i.product.thumbnail ?? i.product.images?.[0] ?? null,
            images:              i.product.images ?? [],
            minOrderQty:         i.product.minOrderQty ?? null,
            requiresDownpayment: i.requiresDownpayment ?? i.product.requiresDownpayment ?? false,
            downpaymentPercent:  i.downpaymentPercent ?? i.product.downpaymentPercent ?? null,
          },
          variantId:       i.variantId   ?? null,
          variantName:     i.variantName ?? null,
          qty:             i.qty,
          unitPrice:       designRequested && designFee ? i.unitPrice + designFee : i.unitPrice,
          isCustom:        i.isCustom    ?? false,
          designUrl:       designUrl,
          designNotes:     i.designNotes ?? null,
          designRequested: designRequested,
          designFee:       designRequested ? designFee : null,
        };
      }),
      notes,
      fromCart: true,
    };

    try {
      sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
      router.push('/shop/checkout');
    } finally {
      setIsCheckingOut(false);
    }
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
            Continue Shopping
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
          Continue Shopping
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
              const isRemoving = removingId === item.lineId;
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <Link href={`/shop/products/${item.product._id}`} className="cart-item-name">
                        {item.product.name}
                      </Link>
                      {item.requiresDownpayment && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: '#D4A843', color: '#000', borderRadius: '999px', padding: '1px 7px', fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                          Req DP
                        </span>
                      )}
                    </div>
                    {item.variantName && (
                      <div className="cart-item-variant">
                        <span className="cart-variant-label">Variant:</span> {item.variantName}
                      </div>
                    )}
                    {/* Design widget for custom products */}
                    {item.isCustom && (() => {
                      const choice = designChoices[item.lineId];
                      const hasExistingDesign = !!item.designUrl;
                      if (hasExistingDesign) return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--green)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          Design attached
                        </div>
                      );
                      const isUpload = choice?.mode === 'upload';
                      const isReq = choice?.mode === 'request';
                      const uploading = choice?.uploading;
                      const badge = (active) => ({
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '3px 10px', borderRadius: '999px',
                        background: active ? '#D4A843' : 'rgba(212,168,67,0.08)',
                        border: `1px solid ${active ? '#D4A843' : 'rgba(212,168,67,0.4)'}`,
                        color: active ? '#000' : 'var(--gold)',
                        fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer',
                        textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'inherit',
                      });
                      return (
                        <div style={{ marginTop: '7px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {!isUpload && !isReq && (
                            <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 600 }}>Design required before checkout</div>
                          )}
                          {uploading && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--gray)' }}>Uploading...</div>
                          )}
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <label style={badge(isUpload)}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              Upload Design
                              <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: 'none' }} onChange={e => handleDesignFileSelect(item.lineId, e.target.files?.[0])} />
                            </label>
                            {item.designFee > 0 && (
                              <button type="button" onClick={() => handleRequestDesign(item.lineId)} style={badge(isReq)}>
                                Req Design
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="cart-item-price">
                      ₱{Number(item.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / pc
                    </div>
                  </div>

                  {/* Qty Controls */}
                  <div className="cart-item-qty">
                    <div className="cart-qty-stepper">
                      <button
                        onClick={() => updateQty(item.lineId, item.qty - 1)}
                        className="cart-qty-btn"
                        disabled={item.qty <= (item.minOrderQty || 1)}
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
                        onClick={() => updateQty(item.lineId, Math.min(item.qty + 1, item.stockCap))}
                        className="cart-qty-btn"
                        disabled={item.qty >= item.stockCap}
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
                    onClick={() => handleRemoveItem(item.lineId, idx)}
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
              <span>₱{Number(selectedBaseTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            {/* Design fee */}
            {selectedDesignFee > 0 && (
              <div className="cart-summary-row">
                <span style={{ color: 'var(--gold)' }}>Design fee</span>
                <span style={{ color: 'var(--gold)' }}>₱{Number(selectedDesignFee).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}

            {/* Shipping */}
            <div className="cart-summary-row cart-summary-note">
              <span>Shipping</span>
              <span className="cart-shipping-note">Calculated after confirmation</span>
            </div>

            {/* Divider */}
            <div className="cart-summary-divider" />

            {dpRequired ? (
              <>
                <div className="cart-summary-total">
                  <span>Total</span>
                  <span className="cart-total-price">₱{Number(selectedTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)' }}>{dpPercent}% Downpayment Required</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Due now ({dpPercent}%)</span>
                    <span style={{ color: 'var(--white)', fontWeight: 700 }}>₱{Number(dpAmountDue).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Balance on completion</span>
                    <span style={{ color: 'var(--gray)' }}>₱{Number(dpRemaining).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ fontSize: '0.67rem', color: 'rgba(212,168,67,0.6)', lineHeight: 1.4, borderTop: '1px solid rgba(212,168,67,0.15)', paddingTop: '6px' }}>
                    Your cart contains custom items. The full order total requires a {dpPercent}% downpayment before production starts.
                  </div>
                </div>
              </>
            ) : (
              <div className="cart-summary-total">
                <span>Total</span>
                <span className="cart-total-price">₱{Number(selectedTotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}

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
                maxLength={500}
                placeholder="e.g. design requests, color preferences, special instructions..."
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 500))}
                className="cart-notes-input"
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--gray)', display: 'block', textAlign: 'right' }}>
                {notes.length}/500
              </span>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--gray)', margin: '0 0 0.5rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>Delivery address is selected at checkout.</span>
            </div>

            {/* Place Order Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={selectedItems.size === 0 || isCheckingOut}
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
