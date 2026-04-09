'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function CheckoutPage() {
  const router = useRouter();
  const { token, currentUser } = useAuth();

  // Cart payload (loaded from sessionStorage)
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');

  // Address
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressPicker, setShowAddressPicker] = useState(false);

  // UI state
  const [addressLoading, setAddressLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);
  const [payloadError, setPayloadError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [designFile, setDesignFile] = useState(null);
  const [designNotes, setDesignNotes] = useState('');

  // ── EFFECT: Load cart payload from sessionStorage ──
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('checkout_payload');
      if (!raw) {
        setPayloadError(true);
        return;
      }
      const payload = JSON.parse(raw);
      if (!payload.items || payload.items.length === 0) {
        setPayloadError(true);
        return;
      }
      setItems(payload.items);
      setNotes(payload.notes ?? '');
    } catch {
      setPayloadError(true);
    }
  }, []);

  // ── EFFECT: Redirect if not authenticated ──
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && token === null) {
      router.replace('/');
    }
  }, [mounted, token, router]);

  // ── EFFECT: Fetch addresses ──
  useEffect(() => {
    if (!token) return;
    const fetchAddresses = async () => {
      setAddressLoading(true);
      setError(null);
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/addresses`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }, 30000);
        if (!res.ok) throw new Error('Failed to load addresses.');
        const data = await res.json();
        const list = data.addresses || [];
        setAddresses(list);
        const def = list.find(a => a.is_default);
        setSelectedAddressId(def?.id ?? list[0]?.id ?? null);
      } catch (err) {
        setError('Failed to load addresses.');
      } finally {
        setAddressLoading(false);
      }
    };
    fetchAddresses();
  }, [token]);

  // ── Computed ──
  const selectedAddress = addresses.find(a => a.id === selectedAddressId) ?? null;
  const subtotal = items.reduce((sum, i) => sum + (i.unitPrice * i.qty), 0);
  const total = subtotal;

  function handleDesignFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (!allowed.includes(file.type)) {
      setError('Design file must be JPG, PNG, WEBP, or PDF.');
      e.target.value = '';
      return;
    }
    if (file.size > maxSize) {
      setError('Design file must be under 10MB.');
      e.target.value = '';
      return;
    }
    setError(null);
    setDesignFile(file);
  }

  // ── Place Order ──
  async function handlePlaceOrder() {
    if (!token) return;
    if (items.length === 0) return;
    if (!selectedAddress) {
      setError('Please select a delivery address.');
      return;
    }

    setError(null);
    setPlacing(true);

    try {
      const orderItems = items.map(i => ({
        productId: i.product.id ?? i.product._id,
        variantId: i.variantId ?? null,
        variantName: i.variantName ?? null,
        qty: i.qty,
      }));

      const deliveryAddress = {
        label:        selectedAddress.label,
        house_number: selectedAddress.house_number,
        street:       selectedAddress.street,
        subdivision:  selectedAddress.subdivision,
        barangay:     selectedAddress.barangay,
        city:         selectedAddress.city,
        province:     selectedAddress.province,
        zip:          selectedAddress.zip,
        phone:        selectedAddress.phone,
      };

      let fetchBody;
      let fetchHeaders;

      if (designFile) {
        const formData = new FormData();
        formData.append('design_file', designFile);
        formData.append('design_notes', designNotes);
        formData.append('items', JSON.stringify(orderItems));
        formData.append('notes', notes);
        formData.append('deliveryAddress', JSON.stringify(deliveryAddress));
        fetchBody = formData;
        fetchHeaders = {
          // Do NOT set Content-Type — browser sets it automatically with boundary
          Authorization: `Bearer ${token}`,
        };
      } else {
        fetchBody = JSON.stringify({
          items: orderItems,
          notes,
          deliveryAddress,
          design_notes: designNotes || null,
        });
        fetchHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };
      }

      const res = await fetchWithTimeout(`${API_URL}/api/payment/create-link`, {
        method: 'POST',
        headers: fetchHeaders,
        body: fetchBody,
      }, 20000);

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create payment link.');
      const { checkoutUrl } = data.data ?? data;
      if (!checkoutUrl) throw new Error('No payment URL returned. Please try again.');
      // Clear checkout session before leaving
      sessionStorage.removeItem('checkout_payload');
      window.location.href = checkoutUrl;

    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  // ── Helpers ──
  const formatAddress = (addr) => {
    const parts = [
      addr.house_number && addr.street ? `${addr.house_number} ${addr.street}` : '',
      addr.subdivision,
      addr.barangay ? `Brgy. ${addr.barangay}` : '',
      addr.city,
      addr.province,
      addr.zip,
    ].filter(Boolean);
    return parts.join(', ');
  };

  // ── GUARD: payload error ──
  if (payloadError) {
    return (
      <div className="checkout-wrapper">
        <div className="checkout-payload-error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <h2>No items found for checkout.</h2>
          <Link href="/shop/cart" className="checkout-back-cart-link">
            ← Back to Cart
          </Link>
        </div>
      </div>
    );
  }

  // ── GUARD: loading skeleton ──
  if (items.length === 0 && !payloadError) {
    return (
      <div className="checkout-wrapper">
        <div className="checkout-loading-state">
          <div className="checkout-spinner" />
          <p>Loading checkout…</p>
        </div>
      </div>
    );
  }

  // ── MAIN RENDER ──
  return (
    <div className="checkout-wrapper">
      {/* SECTION 1 — Header */}
      <div className="checkout-header">
        <Link href="/shop/cart" className="checkout-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Cart
        </Link>
        <span className="checkout-divider">/</span>
        <h1 className="checkout-title">Checkout</h1>
      </div>

      {/* SECTION 2 — Delivery Address */}
      <div className="checkout-card" style={{ borderLeft: '3px solid var(--gold)' }}>
        <div className="checkout-card-header">
          <div className="checkout-section-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            Delivery Address
          </div>
          {selectedAddress && (
            <button className="checkout-change-btn" onClick={() => setShowAddressPicker(true)}>
              Change
            </button>
          )}
        </div>

        {addressLoading ? (
          <div className="checkout-loading-line" />
        ) : selectedAddress ? (
          <div>
            {selectedAddress.label && (
              <span className="checkout-address-badge">{selectedAddress.label}</span>
            )}
            <div className="checkout-address-name">
              {currentUser?.firstName || ''} {currentUser?.lastName || ''}
            </div>
            <div className="checkout-address-phone">{selectedAddress.phone || '—'}</div>
            <div className="checkout-address-text">{formatAddress(selectedAddress)}</div>
          </div>
        ) : addresses.length > 0 ? (
          <div>
            <p className="checkout-no-default">No default address. Please select one.</p>
            <button className="checkout-select-btn" onClick={() => setShowAddressPicker(true)}>
              Select Address
            </button>
          </div>
        ) : (
          <div>
            <p className="checkout-no-address">No saved addresses. Please add one in your profile.</p>
            <Link href="/shop/profile" className="checkout-profile-link">
              Manage Addresses →
            </Link>
          </div>
        )}
      </div>

      {/* SECTION 3 — Order Items */}
      <div className="checkout-card">
        <div className="checkout-section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          Order Items ({items.length})
        </div>

        {items.map((item, idx) => (
          <div key={idx} className="checkout-item-row">
            {/* Thumbnail */}
            <div className="checkout-item-thumb">
              {item.product.images?.[0]
                ? <img src={item.product.images[0]} alt="" className="checkout-item-thumb-img" />
                : <div className="checkout-item-thumb-placeholder">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
              }
            </div>

            {/* Info */}
            <div className="checkout-item-info">
              <div className="checkout-item-name">{item.product.name}</div>
              {item.variantName && (
                <div className="checkout-item-variant">{item.variantName}</div>
              )}
            </div>

            {/* Pricing */}
            <div className="checkout-item-pricing">
              <div className="checkout-item-price">{item.qty} × ₱{item.unitPrice.toLocaleString()}</div>
              <div className="checkout-item-total">₱{(item.unitPrice * item.qty).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION 3B — Design Upload */}
      <div className="checkout-card">
        <div className="checkout-section-label" style={{ marginBottom: '0.75rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Design File
          <span style={{ marginLeft: '0.5rem', fontStyle: 'normal', fontWeight: 400, color: 'var(--gray)', textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>
            — Optional
          </span>
        </div>

        {/* Upload area */}
        <label
          htmlFor="design-upload"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: designFile ? 'rgba(212,168,67,0.06)' : '#1a1a1a',
            border: designFile
              ? '1px solid rgba(212,168,67,0.4)'
              : '1px dashed rgba(255,255,255,0.12)',
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {designFile ? (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="16 13 12 17 8 13"/>
                <line x1="12" y1="17" x2="12" y2="9"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f5f5f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {designFile.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                  {(designFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
              <button
                type="button"
                onClick={e => { e.preventDefault(); setDesignFile(null); document.getElementById('design-upload').value = ''; }}
                style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#f5f5f5', fontWeight: 500 }}>
                  Attach your design
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                  JPG, PNG, WEBP, or PDF · Max 10MB
                </div>
              </div>
            </>
          )}
        </label>

        <input
          id="design-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleDesignFileChange}
          style={{ display: 'none' }}
        />

        {/* Image quality notice */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          marginTop: '0.625rem',
          padding: '0.625rem 0.75rem',
          background: 'rgba(212,168,67,0.05)',
          border: '1px solid rgba(212,168,67,0.15)',
          borderRadius: '8px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:'1px'}}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ fontSize: '0.75rem', color: 'rgba(212,168,67,0.8)', lineHeight: 1.5 }}>
            Please make sure your image is clear and high resolution so our team can accurately evaluate your design. Blurry or low-quality files may cause delays.
          </span>
        </div>

        {/* Skip note */}
        <p style={{ margin: '0.625rem 0 0', fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.5 }}>
          No file yet? You can skip this and send your design later via our chat support.
        </p>

        <div style={{ marginTop: '0.75rem' }}>
          <label
            htmlFor="design-notes"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--gray)',
              marginBottom: '0.375rem',
              fontWeight: 500,
            }}
          >
            Design Notes
            <span style={{ marginLeft: '0.375rem', fontWeight: 400, opacity: 0.7 }}>— Optional</span>
          </label>
          <textarea
            id="design-notes"
            rows={3}
            className="checkout-notes-input"
            placeholder="Describe what you want printed — colors, text, placement, size, or any other details..."
            value={designNotes}
            onChange={e => setDesignNotes(e.target.value)}
          />
        </div>
      </div>

      {/* SECTION 4 — Order Notes */}
      <div className="checkout-card">
        <div className="checkout-section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Order Notes
        </div>
        <textarea
          rows={3}
          className="checkout-notes-input"
          placeholder="Special instructions, design requests, preferred pickup date..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* SECTION 5 — Order Summary */}
      <div className="checkout-card checkout-summary-card">
        <div className="checkout-summary-row">
          <span>Subtotal</span>
          <span>₱{subtotal.toLocaleString()}</span>
        </div>
        <div className="checkout-summary-row">
          <span>Shipping</span>
          <span className="checkout-shipping-note">To be arranged</span>
        </div>
        <div className="checkout-divider" />
        <div className="checkout-summary-total">
          <span>Total</span>
          <span className="checkout-total-amount">₱{total.toLocaleString()}</span>
        </div>
      </div>

      {/* SECTION 6 — Payment Method */}
      <div className="checkout-card">
        <div className="checkout-payment-row">
          <div className="checkout-payment-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div>
            <div className="checkout-payment-label">GCash · PayMaya · Credit / Debit Card</div>
            <div className="checkout-payment-subtext">You will be redirected to a secure PayMongo payment page to complete your payment.</div>
          </div>
        </div>
      </div>

      {/* SECTION 7 — Place Order Button */}
      {error && (
        <div className="checkout-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      <button
        onClick={handlePlaceOrder}
        disabled={placing || !selectedAddress || items.length === 0}
        className="checkout-place-btn"
      >
        {placing ? (
          <>
            <svg className="checkout-spinner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

      <p className="checkout-disclaimer">
        By placing this order, you agree to our terms. Payment is arranged separately after confirmation.
      </p>

      {/* ADDRESS PICKER MODAL */}
      {showAddressPicker && (
        <div className="checkout-modal-overlay" onClick={() => setShowAddressPicker(false)}>
          <div className="checkout-modal-content" onClick={e => e.stopPropagation()}>
            <div className="checkout-modal-header">
              <h2 className="checkout-modal-title">Select Delivery Address</h2>
              <button className="checkout-modal-close" onClick={() => setShowAddressPicker(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="checkout-modal-body">
              {addresses.map(addr => (
                <div
                  key={addr.id}
                  className={`checkout-addr-card ${addr.id === selectedAddressId ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedAddressId(addr.id);
                    setShowAddressPicker(false);
                  }}
                >
                  <div className={`checkout-addr-radio ${addr.id === selectedAddressId ? 'selected' : ''}`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      {addr.label && <span className="checkout-address-badge">{addr.label}</span>}
                      {addr.is_default && <span className="checkout-default-badge">Default</span>}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                      {formatAddress(addr)}
                    </div>
                    {addr.phone && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                        {addr.phone}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="checkout-modal-footer">
              <Link href="/shop/profile" className="checkout-manage-link">
                Manage Addresses →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style dangerouslySetInnerHTML={{ __html: checkoutStyles }} />
    </div>
  );
}

const checkoutStyles = `
  .checkout-wrapper {
    max-width: 680px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .checkout-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .checkout-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--gray);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.2s;
  }

  .checkout-back-btn:hover {
    color: var(--gold);
  }

  .checkout-divider {
    color: #444;
  }

  .checkout-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #f5f5f5;
  }

  .checkout-card {
    background: #161616;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }

  .checkout-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .checkout-section-label {
    font-size: 0.75rem;
    color: var(--gray);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .checkout-address-badge {
    display: inline-block;
    background: rgba(212, 168, 67, 0.12);
    border: 1px solid rgba(212, 168, 67, 0.3);
    border-radius: 20px;
    padding: 0.2rem 0.6rem;
    font-size: 0.7rem;
    color: var(--gold);
    margin-bottom: 0.5rem;
  }

  .checkout-default-badge {
    display: inline-block;
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 20px;
    padding: 0.15rem 0.5rem;
    font-size: 0.65rem;
    color: #22c55e;
  }

  .checkout-change-btn {
    background: none;
    border: none;
    color: var(--gold);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .checkout-change-btn:hover {
    opacity: 0.8;
  }

  .checkout-address-name {
    font-size: 1rem;
    font-weight: 600;
    color: #f5f5f5;
    margin: 0.5rem 0 0.25rem;
  }

  .checkout-address-phone {
    font-size: 0.85rem;
    color: var(--gray);
    margin-bottom: 0.25rem;
  }

  .checkout-address-text {
    font-size: 0.85rem;
    color: var(--gray);
    line-height: 1.5;
  }

  .checkout-loading-line {
    height: 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .checkout-no-default,
  .checkout-no-address {
    font-size: 0.85rem;
    color: var(--gray);
    margin: 0 0 0.5rem;
  }

  .checkout-select-btn {
    background: none;
    border: 1px solid rgba(212, 168, 67, 0.3);
    border-radius: 8px;
    padding: 0.5rem 1rem;
    color: var(--gold);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .checkout-select-btn:hover {
    background: rgba(212, 168, 67, 0.1);
  }

  .checkout-profile-link {
    color: var(--gold);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .checkout-item-row {
    display: grid;
    grid-template-columns: 60px 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .checkout-item-row:last-child {
    border-bottom: none;
  }

  .checkout-item-thumb {
    width: 60px;
    height: 60px;
    border-radius: 8px;
    overflow: hidden;
    background: #1a1a1a;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .checkout-item-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .checkout-item-thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.15);
  }

  .checkout-item-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #f5f5f5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .checkout-item-variant {
    font-size: 0.75rem;
    color: var(--gray);
    margin-top: 0.2rem;
  }

  .checkout-item-pricing {
    text-align: right;
    min-width: 100px;
  }

  .checkout-item-price {
    font-size: 0.85rem;
    color: var(--gold);
    margin-bottom: 0.25rem;
  }

  .checkout-item-total {
    font-size: 1rem;
    font-weight: 700;
    color: var(--gold);
  }

  .checkout-notes-input {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    color: #f5f5f5;
    font-size: 0.85rem;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s;
    font-family: inherit;
    margin-top: 0.75rem;
  }

  .checkout-notes-input:focus {
    border-color: var(--gold);
  }

  .checkout-notes-input::placeholder {
    color: #555;
  }

  .checkout-summary-card {
    background: rgba(255, 255, 255, 0.02);
  }

  .checkout-summary-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    font-size: 0.9rem;
    color: var(--gray);
  }

  .checkout-shipping-note {
    font-style: italic;
    color: #666;
  }

  .checkout-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 0.5rem 0;
  }

  .checkout-summary-total {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 0;
    font-size: 1.1rem;
  }

  .checkout-total-amount {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--gold);
  }

  .checkout-payment-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .checkout-payment-icon {
    color: var(--gray);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .checkout-payment-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #f5f5f5;
    margin-bottom: 0.25rem;
  }

  .checkout-payment-subtext {
    font-size: 0.8rem;
    color: var(--gray);
    line-height: 1.5;
  }

  .checkout-place-btn {
    width: 100%;
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, #d4a843 0%, #c4963a 100%);
    border: none;
    border-radius: 10px;
    color: #0f0f0f;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.2s;
  }

  .checkout-place-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #c4963a 0%, #b48630 100%);
  }

  .checkout-place-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .checkout-spinner-icon {
    animation: spin 1s linear infinite;
  }

  .checkout-error {
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

  .checkout-disclaimer {
    font-size: 0.75rem;
    color: var(--gray);
    text-align: center;
    margin-top: 1rem;
    line-height: 1.6;
  }

  .checkout-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .checkout-modal-content {
    background: #161616;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 16px;
    max-width: 480px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    position: relative;
  }

  .checkout-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .checkout-modal-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f5f5f5;
  }

  .checkout-modal-close {
    background: none;
    border: none;
    color: var(--gray);
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }

  .checkout-modal-close:hover {
    color: #f5f5f5;
  }

  .checkout-modal-body {
    padding: 1.25rem 1.5rem;
  }

  .checkout-modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    text-align: center;
  }

  .checkout-manage-link {
    color: var(--gray);
    text-decoration: none;
    font-size: 0.85rem;
    transition: color 0.2s;
  }

  .checkout-manage-link:hover {
    color: var(--gold);
  }

  .checkout-addr-card {
    padding: 1rem;
    border-radius: 10px;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: #1a1a1a;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    transition: all 0.2s;
  }

  .checkout-addr-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .checkout-addr-card.selected {
    border-color: var(--gold);
    background: rgba(212, 168, 67, 0.06);
  }

  .checkout-addr-radio {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 2px solid var(--gray);
    margin-top: 2px;
    transition: all 0.2s;
  }

  .checkout-addr-radio.selected {
    border-color: var(--gold);
    background: var(--gold);
  }

  .checkout-payload-error {
    text-align: center;
    padding: 4rem 1rem;
    color: var(--gray);
  }

  .checkout-payload-error h2 {
    color: #f5f5f5;
    margin: 1rem 0;
    font-size: 1.25rem;
  }

  .checkout-back-cart-link {
    display: inline-block;
    color: var(--gold);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 0.5rem 1rem;
    border: 1px solid rgba(212, 168, 67, 0.3);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .checkout-back-cart-link:hover {
    background: rgba(212, 168, 67, 0.1);
  }

  .checkout-loading-state {
    text-align: center;
    padding: 4rem 1rem;
    color: var(--gray);
  }

  .checkout-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (max-width: 768px) {
    .checkout-wrapper {
      padding: 1rem;
    }

    .checkout-title {
      font-size: 1.25rem;
    }

    .checkout-item-row {
      grid-template-columns: 50px 1fr auto;
    }

    .checkout-item-thumb {
      width: 50px;
      height: 50px;
    }
  }
`;
