'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/context/CartContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import '@/app/shop/shop.css';
import { applyVoucher } from '@/lib/voucherApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function CheckoutPage() {
  const router = useRouter();
  const { token, currentUser } = useAuth();
  const { clearCart } = useCart();

  // Cart payload (loaded from sessionStorage)
  const [items, setItems] = useState([]);

  // Address
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressPicker, setShowAddressPicker] = useState(false);

  // UI state
  const [addressLoading, setAddressLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [fromCart, setFromCart] = useState(false);
  const [error, setError] = useState(null);
  const [payloadError, setPayloadError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [designFile, setDesignFile] = useState(null);
  const [designNotes, setDesignNotes] = useState('');
  const [designPreviewUrl, setDesignPreviewUrl] = useState(null);
  const [designFilePreviewUrl, setDesignFilePreviewUrl] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [successModal,       setSuccessModal]       = useState(null); // { orderId, order | null }
  const [failedModal,        setFailedModal]        = useState(false);
  const [pendingVerifyId,    setPendingVerifyId]    = useState(null);
  const [verifyingPayment,   setVerifyingPayment]   = useState(false);

  // Voucher
  const [voucherInput, setVoucherInput]       = useState('');
  const [appliedVoucher, setAppliedVoucher]   = useState(null);
  const [voucherLoading, setVoucherLoading]   = useState(false);
  const [voucherError, setVoucherError]       = useState(null);

  // ── EFFECT: Handle return from PayMongo ──
  useEffect(() => {
    const params         = new URLSearchParams(window.location.search);
    const isCancelled    = params.get('payment_cancelled') === '1';
    const fromPayMongo   = isCancelled || (document.referrer || '').includes('paymongo.com');
    const pendingOrderId = sessionStorage.getItem('pending_payment_order_id');

    if (isCancelled) router.replace('/shop/checkout', { scroll: false });

    if (fromPayMongo && pendingOrderId) {
      sessionStorage.removeItem('pending_payment_order_id');
      setVerifyingPayment(true);
      setPendingVerifyId(pendingOrderId);
      return;
    }

    if (isCancelled && !pendingOrderId) setFailedModal(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── EFFECT: Verify payment status after PayMongo return ──
  // Polls up to 6× (12 s) to allow webhook to arrive before concluding.
  useEffect(() => {
    if (!pendingVerifyId || !token) return;
    let cancelled = false;
    let attempt   = 0;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res   = await fetchWithTimeout(`${API_URL}/api/orders/my/${pendingVerifyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 10000);
        const data  = await res.json();
        const order = data.data ?? data;
        if (order.paymentStatus === 'paid') {
          if (!cancelled) { setVerifyingPayment(false); setSuccessModal({ orderId: pendingVerifyId, order }); }
        } else if (attempt < 5) {
          attempt++;
          setTimeout(poll, 2000);
        } else {
          if (!cancelled) { setVerifyingPayment(false); setFailedModal(true); }
        }
      } catch {
        if (!cancelled) { setVerifyingPayment(false); setFailedModal(true); }
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [pendingVerifyId, token]);

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
      setFromCart(payload.fromCart === true);
      if (payload.designUrl) {
        setDesignPreviewUrl(payload.designUrl);
      }
      if (payload.notes && !designNotes) {
        setDesignNotes(payload.notes);
      }
    } catch {
      setPayloadError(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── EFFECT: Redirect if not authenticated ──
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && token === null) {
      router.replace('/shop');
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
  const subtotal        = items.reduce((sum, i) => sum + (i.unitPrice * i.qty), 0);
  // Custom item that doesn't yet have a per-item design uploaded.
  // Items uploaded on the product page already carry designUrl, so they don't need re-upload.
  const hasCustomItem = items.some(i => i.isCustom === true && !i.designUrl);
  const voucherDiscount = appliedVoucher ? appliedVoucher.discountAmount : 0;
  const total           = Math.max(0, subtotal - voucherDiscount);
  const grandTotal      = total; // Delivery is manually arranged — no fixed fee

  async function handleApplyVoucher() {
    if (!voucherInput.trim()) return;
    setVoucherLoading(true);
    setVoucherError(null);
    setAppliedVoucher(null);
    try {
      const data = await applyVoucher(token, voucherInput.trim(), subtotal);
      setAppliedVoucher(data.data);
    } catch (err) {
      setVoucherError(err.message);
    } finally {
      setVoucherLoading(false);
    }
  }

  function handleRemoveVoucher() {
    setAppliedVoucher(null);
    setVoucherInput('');
    setVoucherError(null);
  }

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
    if (file.type.startsWith('image/')) {
      setDesignFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setDesignFilePreviewUrl(null);
    }
  }

  // ── Place Order ──
  async function handlePlaceOrder() {
    if (!token) return;
    if (items.length === 0) return;
    if (!selectedAddress) {
      setError('Please select a delivery address.');
      return;
    }

    if (!selectedAddress.phone?.trim()) {
      setError('Your delivery address is missing a contact number. Please select a different address or update it in your profile.');
      return;
    }
    const requiredFields = ['street', 'barangay', 'city', 'province'];
    const missingField = requiredFields.find(f => !selectedAddress[f]?.trim());
    if (missingField) {
      setError('Your delivery address is incomplete. Please select a different address or update it in your profile.');
      return;
    }

    // Minimum ₱100 only applies to online payment (PayMongo requirement — charged amount is grandTotal)
    if (paymentMethod === 'online' && grandTotal < 100) {
      setError('Minimum order amount is ₱100.00 for online payment. Please add more items or choose Cash on Delivery.');
      return;
    }

    setError(null);
    setPlacing(true);

    try {
      const orderItems = items.map(i => ({
        productId: String(i.product?.id ?? i.product?._id ?? i.productId ?? ''),
        variantId: i.variantId ?? null,
        variantName: i.variantName ?? null,
        qty: Math.max(1, parseInt(i.qty) || 1),
        ...(i.designUrl ? { designUrl: i.designUrl } : {}),
        ...(i.designNotes ? { designNotes: i.designNotes } : {}),
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

      if (hasCustomItem && designFile) {
        const formData = new FormData();
        formData.append('design_file', designFile);
        formData.append('design_notes', designNotes);
        formData.append('items', JSON.stringify(orderItems));
        formData.append('deliveryAddress', JSON.stringify(deliveryAddress));
        formData.append('paymentMethod', paymentMethod);
        if (appliedVoucher?.code) formData.append('voucherCode', appliedVoucher.code);
        formData.append('shippingFee', '0');
        fetchBody = formData;
        fetchHeaders = {
          Authorization: `Bearer ${token}`,
        };
      } else {
        fetchBody = JSON.stringify({
          items: orderItems,
          deliveryAddress,
          design_notes: designNotes || null,
          paymentMethod,
          shippingFee: 0,
          ...(appliedVoucher?.code ? { voucherCode: appliedVoucher.code } : {}),
        });
        fetchHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };
      }

      if (paymentMethod === 'cod') {
        // COD path — POST to OrderController::store, no PayMongo
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST',
          headers: fetchHeaders,
          body: fetchBody,
        }, 20000);

        const data = await res.json();
        if (!res.ok) {
          const fieldErrors = data.errors ? Object.values(data.errors).flat().join(' ') : null;
          throw new Error(fieldErrors || data.message || 'Failed to place order.');
        }
        const orderId = (data.data?._id ?? data.data?.id ?? data._id ?? data.id);
        if (!orderId) throw new Error('Order created but no ID returned. Please check your orders.');
        sessionStorage.removeItem('checkout_payload');
        router.push(`/shop/payment-success?id=${orderId}&method=cod`);

      } else {
        // Online payment path — POST to PaymentController::createLink
        const res = await fetchWithTimeout(`${API_URL}/api/payment/create-link`, {
          method: 'POST',
          headers: fetchHeaders,
          body: fetchBody,
        }, 20000);

        const data = await res.json();
        if (!res.ok) {
          const fieldErrors = data.errors ? Object.values(data.errors).flat().join(' ') : null;
          throw new Error(fieldErrors || data.message || 'Failed to create payment link.');
        }
        const { checkoutUrl, orderId: pendingOrderId } = data.data ?? data;
        if (!checkoutUrl) throw new Error('No payment URL returned. Please try again.');
        if (pendingOrderId) sessionStorage.setItem('pending_payment_order_id', pendingOrderId);
        window.location.href = checkoutUrl;
      }

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
          <button
            className="checkout-back-cart-link"
            onClick={() => setShowCancelModal(true)}
          >
            ← Back to Cart
          </button>
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

      {/* ── Payment Success Modal ── */}
      {successModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'var(--dark2)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '18px', padding: '40px 32px', maxWidth: '460px', width: '100%', textAlign: 'center' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '2px solid #4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ color: '#4ade80', fontWeight: 700, fontSize: '1.4rem', marginBottom: 6 }}>Payment Successful!</h2>
            <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.6 }}>
              Your payment has been received. We'll start processing your order shortly.
            </p>

            {/* Receipt */}
            <div style={{ background: 'var(--dark3)', borderRadius: '10px', padding: '16px', marginBottom: 24, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Receipt</span>
                <span style={{ color: 'var(--white)', fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600 }}>
                  #{(successModal.orderId || '').slice(-8).toUpperCase()}
                </span>
              </div>
              {successModal.order ? (
                <>
                  {(successModal.order.items || []).map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>
                        {item.productName || item.product_name || 'Item'}
                        {item.variantName ? ` — ${item.variantName}` : ''} ×{item.qty || item.quantity}
                      </span>
                      <span style={{ color: 'var(--white)', fontSize: '0.82rem' }}>
                        ₱{Number(item.lineTotal ?? (item.unitPrice * (item.qty || 1)) ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.85rem' }}>Total Paid</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.95rem' }}>
                      ₱{Number(successModal.order.totalAmount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              ) : (
                <p style={{ color: 'var(--gray)', fontSize: '0.82rem', textAlign: 'center', padding: '8px 0' }}>Loading order details…</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  sessionStorage.removeItem('checkout_payload');
                  clearCart();
                  router.push('/shop/orders-history');
                }}
                style={{ flex: 1, padding: '11px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}
              >
                View Orders
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem('checkout_payload');
                  clearCart();
                  router.push('/shop');
                }}
                style={{ flex: 1, padding: '11px', background: 'transparent', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem' }}
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Verifying Payment Overlay ── */}
      {verifyingPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--dark2)', borderRadius: '18px', padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
            <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: 6 }}>Verifying payment…</p>
            <p style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Please wait, this may take a few seconds.</p>
          </div>
        </div>
      )}

      {/* ── Payment Cancelled/Failed Modal ── */}
      {failedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'var(--dark2)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '18px', padding: '40px 32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>
            <h2 style={{ color: 'var(--white)', fontWeight: 700, fontSize: '1.3rem', marginBottom: 8 }}>Payment Cancelled</h2>
            <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.6 }}>
              Your payment was not completed. Your cart items are still saved — you can try again anytime.
            </p>
            <button
              onClick={() => setFailedModal(false)}
              style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* SECTION 1 — Header */}
      <div className="checkout-header">
        <button
          className="checkout-back-btn"
          onClick={() => setShowCancelModal(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Cart
        </button>
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
            <a href="/shop/profile" target="_blank" rel="noopener noreferrer" className="checkout-profile-link">
              Manage Addresses (opens in new tab) →
            </a>
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
              {item.product.thumbnail || item.product.images?.[0]
                ? <img src={item.product.thumbnail || item.product.images[0]} alt="" className="checkout-item-thumb-img" />
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

      {/* SECTION 3B – Design Upload (only shown for custom print products) */}
      {hasCustomItem && <div className="checkout-card">
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

        {/* Design preview from product page — B-06 */}
        {((designPreviewUrl && !designFile) || designFilePreviewUrl) && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.75rem',
            background: 'rgba(212,168,67,0.06)',
            border: '1px solid rgba(212,168,67,0.25)',
            borderRadius: '8px',
            marginBottom: '0.75rem',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={designFilePreviewUrl || designPreviewUrl}
              alt="Attached design"
              style={{
                width: 64,
                height: 64,
                objectFit: 'cover',
                borderRadius: '6px',
                flexShrink: 0,
                border: '1px solid var(--border)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--gold)',
                marginBottom: '0.25rem',
              }}>
                Design attached from product page
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--gray)',
                lineHeight: 1.5,
              }}>
                To include this file in your order, please re-select
                it below before placing your order.
              </div>
            </div>
          </div>
        )}

        {/* Upload area */}
        <label
          htmlFor="design-upload"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: designFile ? 'rgba(212,168,67,0.06)' : 'var(--dark)',
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="16 13 12 17 8 13"/>
                <line x1="12" y1="17" x2="12" y2="9"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {designFile.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                  {(designFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
              <button
                type="button"
                onClick={e => { e.preventDefault(); setDesignFile(null); setDesignFilePreviewUrl(null); document.getElementById('design-upload').value = ''; }}
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
                <div style={{ fontSize: '0.85rem', color: 'var(--white)', fontWeight: 500 }}>
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:'1px'}}>
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
            maxLength={500}
            className="checkout-notes-input"
            placeholder="Describe what you want printed — colors, text, placement, size, or any other details..."
            value={designNotes}
            onChange={e => setDesignNotes(e.target.value.slice(0, 500))}
          />
        </div>
      </div>}

      {/* SECTION 5 — Order Summary */}
      <div className="checkout-card checkout-summary-card">
        <div className="checkout-summary-row">
          <span>Subtotal</span>
          <span>₱{subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="checkout-summary-row">
          <span>Delivery</span>
          <span className="checkout-shipping-note">Billed separately</span>
        </div>
        <div className="checkout-divider" />

        {/* Voucher Code */}
        <div style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          {!appliedVoucher ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                maxLength={50}
                value={voucherInput}
                onChange={e => setVoucherInput(e.target.value.toUpperCase().slice(0, 50))}
                onKeyDown={e => e.key === 'Enter' && handleApplyVoucher()}
                placeholder="Voucher code"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: 'var(--dark)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '13px',
                  outline: 'none',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                }}
              />
              <button
                onClick={handleApplyVoucher}
                disabled={voucherLoading || !voucherInput.trim()}
                style={{
                  padding: '8px 14px',
                  background: 'var(--gold)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: voucherLoading || !voucherInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: voucherLoading || !voucherInput.trim() ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {voucherLoading ? '…' : 'Apply'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '8px' }}>
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 700, fontFamily: 'monospace' }}>{appliedVoucher.code}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--gray)', marginLeft: '0.5rem' }}>
                  {appliedVoucher.discountType === 'percentage'
                    ? `${appliedVoucher.discountValue}% off`
                    : `₱${Number(appliedVoucher.discountValue).toLocaleString()} off`}
                </span>
              </div>
              <button onClick={handleRemoveVoucher} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
            </div>
          )}
          {voucherError && (
            <div style={{ marginTop: '0.375rem', fontSize: '0.78rem', color: '#ef4444' }}>{voucherError}</div>
          )}
        </div>

        {/* Voucher Discount Line */}
        {appliedVoucher && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#22c55e' }}>Voucher Discount</span>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>− ₱{Number(voucherDiscount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        )}

        <div className="checkout-summary-total">
          <span>Total</span>
          <span className="checkout-total-amount">₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* SECTION 6 — Payment Method */}
      <div className="checkout-card">
        <div className="checkout-section-label" style={{ marginBottom: '0.75rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          Payment Method
        </div>

        {/* COD Option */}
        <div
          onClick={() => setPaymentMethod('cod')}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '1rem', borderRadius: '10px', cursor: 'pointer',
            border: `1px solid ${paymentMethod === 'cod' ? 'var(--gold)' : 'rgba(255,255,255,0.07)'}`,
            background: paymentMethod === 'cod' ? 'rgba(212,168,67,0.06)' : 'var(--dark)',
            marginBottom: '0.75rem', transition: 'all 0.2s',
          }}
        >
          <div style={{
            width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
            border: `2px solid ${paymentMethod === 'cod' ? 'var(--gold)' : 'var(--gray)'}`,
            background: paymentMethod === 'cod' ? 'var(--gold)' : 'transparent',
            transition: 'all 0.2s',
          }} />
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.2rem' }}>
              Cash on Delivery
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Pay the product total upon delivery. Our team will contact you to confirm delivery details and arrange the delivery fee separately.
            </div>
          </div>
        </div>

        {/* Online Payment Option */}
        <div
          onClick={() => setPaymentMethod('online')}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '1rem', borderRadius: '10px', cursor: 'pointer',
            border: `1px solid ${paymentMethod === 'online' ? 'var(--gold)' : 'rgba(255,255,255,0.07)'}`,
            background: paymentMethod === 'online' ? 'rgba(212,168,67,0.06)' : 'var(--dark)',
            transition: 'all 0.2s',
          }}
        >
          <div style={{
            width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
            border: `2px solid ${paymentMethod === 'online' ? 'var(--gold)' : 'var(--gray)'}`,
            background: paymentMethod === 'online' ? 'var(--gold)' : 'transparent',
            transition: 'all 0.2s',
          }} />
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.2rem' }}>
              Online Payment
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Pay the product total securely via GCash, PayMaya, or Card. Delivery fee will be arranged separately by our team.
              {grandTotal < 100 && (
                <span style={{ color: 'var(--red)', display: 'block', marginTop: '0.25rem' }}>
                  ⚠ Minimum ₱100.00 required for online payment.
                </span>
              )}
            </div>
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
        disabled={placing || !selectedAddress || items.length === 0 || (paymentMethod === 'online' && grandTotal < 100)}
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
        {paymentMethod === 'cod'
          ? 'By placing this order, you agree to our terms. You will pay the product total upon delivery. Delivery fee will be billed separately.'
          : 'By placing this order, you agree to our terms. You will be redirected to pay the product total. Delivery fee will be billed separately.'}
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
              <a href="/shop/profile" target="_blank" rel="noopener noreferrer" className="checkout-manage-link">
                Manage Addresses (opens in new tab) →
              </a>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div
          onClick={() => setShowCancelModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '420px',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '1.125rem', color: 'var(--white)' }}>
              Cancel Checkout?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Are you sure you want to go back? Your cart items will be kept.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--white)', fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Continue Checkout
              </button>
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  router.push(fromCart ? '/shop/cart' : '/shop');
                }}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: 'none',
                  background: 'var(--red)',
                  color: 'var(--white)', fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

