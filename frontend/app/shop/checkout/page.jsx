'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/context/CartContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import '@/app/shop/shop.css';
import { applyVoucher } from '@/lib/voucherApi';

const AddressBook = dynamic(() => import('@/components/profile/AddressBook'), { ssr: false });

const METRO_CITIES = ['Manila', 'Quezon City', 'Caloocan', 'Las Piñas', 'Makati', 'Malabon', 'Mandaluyong', 'Marikina', 'Muntinlupa', 'Navotas', 'Parañaque', 'Pasay', 'Pasig', 'Pateros', 'San Juan', 'Taguig', 'Valenzuela'];
function isMetroManila(city, province) {
  const p = (province || '').toLowerCase();
  const c = (city || '').toLowerCase();
  return p.includes('metro manila') || p.includes('ncr') || p.includes('national capital')
    || METRO_CITIES.some(m => c.includes(m.toLowerCase()));
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function VisaLogo({ width = 38, height = 24 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#1A1F71"/>
      <text
        x="19" y="17"
        textAnchor="middle"
        fill="white"
        fontSize="11"
        fontWeight="bold"
        fontStyle="italic"
        fontFamily="Arial, Helvetica, sans-serif"
        letterSpacing="0.5"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardLogo({ width = 38, height = 24 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#252525"/>
      <circle cx="14" cy="12" r="7.5" fill="#EB001B"/>
      <circle cx="24" cy="12" r="7.5" fill="#F79E1B"/>
      <path d="M19 6.41 A7.5 7.5 0 0 1 19 17.59 A7.5 7.5 0 0 1 19 6.41 Z" fill="#FF5F00"/>
    </svg>
  );
}

function CardLogosBig() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <VisaLogo width={38} height={24} />
      <MastercardLogo width={38} height={24} />
    </div>
  );
}

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
  const [paymentMethod,    setPaymentMethod]    = useState('cod');
  const [eWalletPhone,     setEWalletPhone]     = useState('');
  const [showEWalletPhone, setShowEWalletPhone] = useState(false);
  const [cardNumber,       setCardNumber]       = useState('');
  const [cardExpiry,    setCardExpiry]    = useState('');
  const [cardCvc,       setCardCvc]       = useState('');
  const [cardName,      setCardName]      = useState('');
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

  // Pay in full option for downpayment orders
  const [payFull, setPayFull] = useState(false);

  // Shipping fee
  const [storeSettings, setStoreSettings]   = useState(null);
  const [shippingFeeAmt, setShippingFeeAmt] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [showPinModal, setShowPinModal]     = useState(false);

  // ── EFFECT: Load store settings for shipping calculation ──
  useEffect(() => {
    fetch(`${API_URL}/api/public/settings`)
      .then(r => r.json())
      .then(d => setStoreSettings(d.data ?? d))
      .catch(() => {});
  }, []);

  // ── EFFECT: Calculate shipping fee when address or store settings change ──
  useEffect(() => {
    const addr = addresses.find(a => a.id === selectedAddressId) ?? null;

    if (storeSettings?.shippingMode === 'flat') {
      if (!addr) { setShippingFeeAmt(null); return; }
      const fee = isMetroManila(addr.city, addr.province)
        ? (storeSettings.flatRateInsideMetro  ?? 150)
        : (storeSettings.flatRateOutsideMetro ?? 250);
      setShippingFeeAmt(fee);
      return;
    }

    if (!storeSettings?.storeLat || !storeSettings?.storeLng || !addr?.lat || !addr?.lng) {
      setShippingFeeAmt(null);
      return;
    }
    setShippingLoading(true);
    const { storeLat, storeLng, shippingBaseRate = 50, shippingPerKmRate = 15 } = storeSettings;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${addr.lng},${addr.lat}?overview=false`
    )
      .then(r => r.json())
      .then(d => {
        const distanceM = d.routes?.[0]?.distance ?? null;
        if (distanceM !== null) {
          const distKm = distanceM / 1000;
          setShippingFeeAmt(Math.round((shippingBaseRate + shippingPerKmRate * distKm) * 100) / 100);
        } else {
          setShippingFeeAmt(null);
        }
      })
      .catch(() => setShippingFeeAmt(null))
      .finally(() => setShippingLoading(false));
  }, [selectedAddressId, addresses, storeSettings]);

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

  // ── Fetch addresses (also called after pin modal saves) ──
  const fetchAddresses = useCallback(async (keepSelection = false) => {
    if (!token) return;
    setAddressLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      }, 30000);
      if (!res.ok) throw new Error('Failed to load addresses.');
      const data = await res.json();
      const list = data.addresses || [];
      setAddresses(list);
      if (!keepSelection) {
        const def = list.find(a => a.is_default);
        setSelectedAddressId(def?.id ?? list[0]?.id ?? null);
      }
    } catch {
      setError('Failed to load addresses.');
    } finally {
      setAddressLoading(false);
    }
  }, [token]);

  // ── EFFECT: Fetch addresses on mount ──
  useEffect(() => { fetchAddresses(); }, [fetchAddresses]);

  // ── Computed ──
  const selectedAddress = addresses.find(a => a.id === selectedAddressId) ?? null;
  const subtotal        = items.reduce((sum, i) => sum + (i.unitPrice * i.qty), 0);
  // Custom item still needing a design file at checkout (not pre-uploaded and not design-service-requested)
  const hasCustomItem = items.some(i => i.isCustom === true && !i.designUrl && !i.designRequested);
  const voucherDiscount = appliedVoucher ? appliedVoucher.discountAmount : 0;
  const total           = Math.max(0, subtotal - voucherDiscount);
  const grandTotal      = total + (shippingFeeAmt ?? 0);

  // Order-level downpayment: if ANY item requires DP, apply the highest DP% to the full order total
  const downpaymentPercent = items
    .filter(i => i.product?.requiresDownpayment)
    .reduce((max, i) => Math.max(max, i.product?.downpaymentPercent ?? 50), 0);
  const downpaymentRequired = downpaymentPercent > 0;
  const amountDue = (downpaymentRequired && !payFull)
    ? Math.round(grandTotal * downpaymentPercent / 100 * 100) / 100
    : grandTotal;
  const remainingBalance = (downpaymentRequired && !payFull) ? Math.round((grandTotal - amountDue) * 100) / 100 : 0;

  // Auto-switch away from COD when downpayment is required
  useEffect(() => {
    if (downpaymentRequired && paymentMethod === 'cod') {
      setPaymentMethod('gcash');
    }
  }, [downpaymentRequired, paymentMethod]);

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

  // ── Card helpers ──
  const isOnlinePayment = ['gcash', 'paymaya', 'card'].includes(paymentMethod);

  function fmtPHPhone(digits) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return digits.slice(0, 3) + ' ' + digits.slice(3);
    return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
  }

  function fmtCardNumber(v) {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  }
  function fmtExpiry(v) {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length >= 3 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  }
  function cardBrand(num) {
    const n = num.replace(/\s/g, '');
    if (/^4/.test(n)) return 'VISA';
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'MC';
    if (/^3[47]/.test(n)) return 'AMEX';
    return null;
  }
  function luhnCheck(num) {
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let n = parseInt(num[i]);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function validateCardFields() {
    const num = cardNumber.replace(/\s/g, '');
    if (num.length < 16) return 'Enter a valid 16-digit card number.';
    if (!luhnCheck(num)) return 'Card number is invalid. Please check and try again.';
    const [m, y] = cardExpiry.split('/');
    if (!m || !y || parseInt(m) < 1 || parseInt(m) > 12 || y.length < 2) return 'Enter a valid expiry date (MM/YY).';
    if (cardCvc.length < 3) return 'Enter a valid security code (3–4 digits).';
    if (!cardName.trim()) return 'Enter the name on your card.';
    return null;
  }
  async function tokenizeCard() {
    const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
    if (!publicKey || publicKey.includes('REPLACE')) throw new Error('Card payments not configured. Contact support.');
    const [expMonth, expYear] = cardExpiry.split('/');
    const res = await fetch('https://api.paymongo.com/v1/payment_methods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(publicKey + ':')}`,
      },
      body: JSON.stringify({ data: { attributes: {
        type: 'card',
        details: {
          card_number: cardNumber.replace(/\s/g, ''),
          exp_month: parseInt(expMonth),
          exp_year: parseInt('20' + expYear),
          cvc: cardCvc,
        },
        billing: {
          name: cardName.trim() || currentUser?.name || '',
          email: currentUser?.email || '',
          phone: '',
        },
      }}}),
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = data.errors?.[0]?.detail ?? '';
      if (detail.includes('card_number')) throw new Error('Card number is invalid. Please check and try again.');
      if (detail.includes('exp_month') || detail.includes('exp_year')) throw new Error('Expiry date is invalid. Use MM/YY format.');
      if (detail.includes('cvc')) throw new Error('Security code is invalid.');
      throw new Error('Invalid card details. Please check and try again.');
    }
    return data.data.id;
  }

  // ── Place Order ──
  async function handlePlaceOrder() {
    if (!token) return;
    if (items.length === 0) return;
    if (!selectedAddress) {
      setError('Please select a delivery address.');
      return;
    }

    if (
      storeSettings?.shippingMode !== 'flat' &&
      storeSettings?.storeLat && storeSettings?.storeLng &&
      (!selectedAddress.lat || !selectedAddress.lng)
    ) {
      setError('Please pin your delivery location so we can calculate the shipping fee.');
      setShowPinModal(true);
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

    if (downpaymentRequired && paymentMethod === 'cod') {
      setError('Cash on Delivery is not available for downpayment orders. Please choose an online payment method.');
      return;
    }

    if (isOnlinePayment && amountDue < 100) {
      setError('Minimum payment amount is ₱100.00 for online payment. Please add more items.');
      return;
    }

    if (paymentMethod === 'card') {
      const cardErr = validateCardFields();
      if (cardErr) { setError(cardErr); return; }
    }

    setError(null);
    setPlacing(true);

    try {
      const orderItems = items.map(i => ({
        productId: String(i.product?.id ?? i.product?._id ?? i.productId ?? ''),
        variantId: i.variantId ?? null,
        variantName: i.variantName ?? null,
        qty: Math.max(1, parseInt(i.qty) || 1),
        unitPrice: i.unitPrice,
        ...(i.designUrl ? { designUrl: i.designUrl } : {}),
        ...(i.designNotes ? { designNotes: i.designNotes } : {}),
        ...(i.designRequested ? { designRequested: true, designFee: i.designFee ?? null } : {}),
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
        formData.append('shippingFee', String(shippingFeeAmt ?? 0));
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
          shippingFee: shippingFeeAmt ?? 0,
          ...(appliedVoucher?.code ? { voucherCode: appliedVoucher.code } : {}),
        });
        fetchHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };
      }

      if (paymentMethod === 'cod') {
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST', headers: fetchHeaders, body: fetchBody,
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
        // Custom payment via Payment Intents — bypasses PayMongo hosted checkout
        let paymentMethodId = null;
        if (paymentMethod === 'card') {
          paymentMethodId = await tokenizeCard();
        }

        const onlineBody = JSON.stringify({
          items: orderItems,
          deliveryAddress,
          design_notes: designNotes || null,
          paymentType: paymentMethod,
          paymentMethodId,
          eWalletPhone: eWalletPhone.trim() ? `+63${eWalletPhone.trim()}` : null,
          shippingFee: shippingFeeAmt ?? 0,
          ...(appliedVoucher?.code ? { voucherCode: appliedVoucher.code } : {}),
          ...(downpaymentRequired && !payFull ? { isDownpayment: true, downpaymentPercent } : {}),
        });
        const onlineHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

        const res = await fetchWithTimeout(`${API_URL}/api/payment/initiate`, {
          method: 'POST', headers: onlineHeaders, body: onlineBody,
        }, 25000);

        const data = await res.json();
        if (!res.ok) {
          const fieldErrors = data.errors ? Object.values(data.errors).flat().join(' ') : null;
          throw new Error(fieldErrors || data.message || 'Failed to initiate payment.');
        }

        const { orderId, status, redirectUrl } = data.data ?? data;

        if (status === 'succeeded') {
          sessionStorage.removeItem('checkout_payload');
          clearCart();
          router.push(`/shop/payment-success?id=${orderId}&method=${paymentMethod}`);
        } else if (redirectUrl) {
          sessionStorage.setItem('pending_payment_order_id', orderId);
          window.location.href = redirectUrl;
        } else {
          throw new Error('No redirect URL returned. Please try again.');
        }
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
            {!selectedAddress.lat && !selectedAddress.lng && storeSettings?.shippingMode !== 'flat' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.75rem', padding: '0.625rem 0.75rem', background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '8px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#eab308', lineHeight: 1.5 }}>
                    Pin your location to get a shipping estimate.
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPinModal(true)}
                    style={{ padding: '0.3rem 0.75rem', background: '#eab308', border: 'none', borderRadius: '6px', color: '#000', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Pin Location
                  </button>
                </div>
              </div>
            )}
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
              <div className="checkout-item-price">{item.qty} × ₱{Number(item.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="checkout-item-total">₱{(item.unitPrice * item.qty).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
          {shippingLoading ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Calculating…</span>
          ) : shippingFeeAmt !== null ? (
            <span>₱{shippingFeeAmt.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          ) : (() => {
            const addr = addresses.find(a => a.id === selectedAddressId);
            if (storeSettings?.shippingMode === 'flat' && !addr)
              return <span className="checkout-shipping-note">Select an address</span>;
            if ((!storeSettings?.storeLat || !storeSettings?.storeLng) && storeSettings?.shippingMode !== 'flat')
              return <span className="checkout-shipping-note">—</span>;
            if (!addr?.lat || !addr?.lng)
              return (
                <button type="button" className="checkout-shipping-note" style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: 'inherit', textDecoration: 'underline' }} onClick={() => setShowPinModal(true)}>
                  Pin your address
                </button>
              );
            return <span className="checkout-shipping-note">—</span>;
          })()}
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
                    : `₱${Number(appliedVoucher.discountValue).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} off`}
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
        {downpaymentRequired && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', padding: '8px 10px', background: 'rgba(212,168,67,0.08)', borderRadius: '8px', border: '1px solid rgba(212,168,67,0.2)' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)' }}>Due Now</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--gold)' }}>₱{amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}

        {downpaymentRequired && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'rgba(212,168,67,0.07)',
            border: '1px solid rgba(212,168,67,0.3)',
            display: 'flex',
            gap: '0.625rem',
            alignItems: 'flex-start',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '0.2rem' }}>
                Downpayment Required
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(212,168,67,0.75)', lineHeight: 1.5 }}>
                {payFull ? (
                  <>You&apos;re paying the <strong>full amount of ₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> upfront. No balance on completion.</>
                ) : (
                  <>Some items require a downpayment. You&apos;ll pay{' '}
                  <strong>₱{amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{' '}
                  now ({downpaymentPercent}%). The remaining{' '}
                  <strong>₱{remainingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{' '}
                  is collected on completion. COD is not available.</>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => setPayFull(false)}
                  style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(212,168,67,0.5)', background: !payFull ? 'var(--gold)' : 'transparent', color: !payFull ? '#000' : 'var(--gold)' }}
                >
                  Pay {downpaymentPercent}% Now
                </button>
                <button
                  type="button"
                  onClick={() => setPayFull(true)}
                  style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(212,168,67,0.5)', background: payFull ? 'var(--gold)' : 'transparent', color: payFull ? '#000' : 'var(--gold)' }}
                >
                  Pay in Full
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 6 — Payment Method */}
      <div className="checkout-card">
        <div className="checkout-section-label" style={{ marginBottom: '0.75rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          Payment Method
        </div>

        {/* Payment method cards — COD → GCash → Maya → Card */}
        {([
          {
            id: 'cod',
            label: 'Cash on Delivery',
            sub: 'Pay when your order arrives. Our team will contact you for details.',
            accent: 'var(--gold)',
            accentBg: 'rgba(212,168,67,0.08)',
            logo: null,
            icon: (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 0 0-4 0v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/>
                <circle cx="12" cy="12" r=".5" fill="currentColor"/>
              </svg>
            ),
          },
          {
            id: 'gcash',
            label: 'GCash',
            sub: "You'll be redirected to GCash to authorize payment.",
            accent: '#0066FF',
            accentBg: 'rgba(0,102,255,0.07)',
            logo: '/logos/Gcash-Logo-1024x1024.png',
            icon: null,
          },
          {
            id: 'paymaya',
            label: 'Maya',
            sub: "You'll be redirected to Maya to authorize payment.",
            accent: '#00B14F',
            accentBg: 'rgba(0,177,79,0.07)',
            logo: '/logos/maya logo.png',
            icon: null,
          },
          {
            id: 'card',
            label: 'Credit / Debit Card',
            sub: 'Pay securely with Visa or Mastercard.',
            accent: '#9C7BE8',
            accentBg: 'rgba(156,123,232,0.07)',
            logo: '/logos/credit-card.svg',
            filterImg: true,
            icon: null,
          },
        ].filter(opt => !downpaymentRequired || opt.id !== 'cod')).map(opt => {
          const isSelected = paymentMethod === opt.id;
          const isEWallet = opt.id === 'gcash' || opt.id === 'paymaya';
          const showPanel = isEWallet && isSelected;
          return (
            <React.Fragment key={opt.id}>
              <div
                onClick={() => { setPaymentMethod(opt.id); setEWalletPhone(''); setShowEWalletPhone(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.875rem',
                  padding: '0.875rem 1rem', borderRadius: '10px', cursor: 'pointer',
                  border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.07)'}`,
                  background: isSelected ? opt.accentBg : 'var(--dark)',
                  marginBottom: showPanel ? '0' : '0.625rem', transition: 'all 0.18s',
                }}
              >
                {/* Logo / icon box */}
                <div style={{
                  width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
                  background: opt.logo ? (isSelected ? opt.accentBg : 'rgba(255,255,255,0.05)') : (isSelected ? opt.accentBg : 'rgba(255,255,255,0.04)'),
                  border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.06)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isSelected ? opt.accent : 'var(--gray)',
                  overflow: 'hidden', transition: 'all 0.18s',
                }}>
                  {opt.logo
                    ? <img
                        src={opt.logo}
                        alt={opt.label}
                        style={{
                          width: '30px', height: '30px', objectFit: 'contain',
                          ...(opt.filterImg
                            ? { filter: 'brightness(0) invert(1)', opacity: isSelected ? 1 : 0.45 }
                            : { borderRadius: '6px' }),
                        }}
                      />
                    : opt.icon
                  }
                </div>

                {/* Label + sub */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.15rem' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                    {opt.sub}
                    {opt.id !== 'cod' && grandTotal < 100 && (
                      <span style={{ color: 'var(--red)', display: 'block', marginTop: '0.2rem' }}>
                        ⚠ Minimum ₱100.00 required.
                      </span>
                    )}
                  </div>
                </div>

                {/* Radio dot */}
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.2)'}`,
                  background: isSelected ? opt.accent : 'transparent',
                  transition: 'all 0.18s',
                }} />
              </div>

              {/* Inline e-wallet panel — appears directly below its own card */}
              {showPanel && (
                <div style={{
                  marginTop: '4px', marginBottom: '0.625rem',
                  padding: '0.875rem 1rem', borderRadius: '10px',
                  background: opt.id === 'gcash' ? 'rgba(0,102,255,0.04)' : 'rgba(0,177,79,0.04)',
                  border: `1px solid ${opt.id === 'gcash' ? 'rgba(0,102,255,0.18)' : 'rgba(0,177,79,0.18)'}`,
                }}>
                  {!showEWalletPhone ? (
                    <button
                      type="button"
                      onClick={() => setShowEWalletPhone(true)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        color: opt.id === 'gcash' ? '#0066FF' : '#00B14F',
                        fontSize: '0.8rem', fontWeight: 600,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                      </svg>
                      Use a different {opt.id === 'gcash' ? 'GCash' : 'Maya'} number for billing reference
                    </button>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: opt.id === 'gcash' ? '#0066FF' : '#00B14F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {opt.id === 'gcash' ? 'GCash' : 'Maya'} number
                        </span>
                        <button
                          type="button"
                          onClick={() => { setShowEWalletPhone(false); setEWalletPhone(''); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.75rem', padding: 0 }}
                        >
                          Cancel
                        </button>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', overflow: 'hidden',
                      }}
                        onFocusCapture={e => { e.currentTarget.style.borderColor = opt.id === 'gcash' ? '#0066FF' : '#00B14F'; }}
                        onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                      >
                        <span style={{
                          padding: '0.65rem 0.75rem', fontSize: '0.9rem', fontFamily: 'monospace',
                          color: 'var(--gray)', borderRight: '1px solid rgba(255,255,255,0.08)',
                          flexShrink: 0, userSelect: 'none',
                        }}>+63</span>
                        <input
                          type="tel"
                          inputMode="numeric"
                          placeholder="9XX XXX XXXX"
                          maxLength={12}
                          value={fmtPHPhone(eWalletPhone)}
                          autoFocus
                          onChange={e => setEWalletPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          style={{
                            flex: 1, background: 'transparent', border: 'none',
                            padding: '0.65rem 0.875rem',
                            color: 'var(--white)', fontSize: '0.9rem', outline: 'none',
                            fontFamily: 'monospace',
                          }}
                        />
                      </div>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                        For billing reference only. Actual authorization happens in the {opt.id === 'gcash' ? 'GCash' : 'Maya'} app.
                      </p>
                    </>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Card form */}
        {paymentMethod === 'card' && (
          <div style={{
            marginTop: '0.25rem', padding: '1.25rem', borderRadius: '12px',
            background: 'rgba(156,123,232,0.05)', border: '1px solid rgba(156,123,232,0.2)',
          }}>
            {/* Header with card logos */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(156,123,232,0.9)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Card Details
              </span>
              <CardLogosBig />
            </div>

            {/* Card number */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
                Card number
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text" inputMode="numeric" placeholder="1234 1234 1234 1234"
                  value={cardNumber}
                  onChange={e => setCardNumber(fmtCardNumber(e.target.value))}
                  style={{
                    width: '100%', background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '0.72rem 2.75rem 0.72rem 0.875rem',
                    color: 'var(--white)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'monospace', letterSpacing: '0.08em',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#9C7BE8'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
                {cardBrand(cardNumber) && (
                  <span style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    fontSize: '0.6rem', fontWeight: 900, color: '#9C7BE8', letterSpacing: '0.04em',
                    background: 'rgba(156,123,232,0.12)', padding: '2px 6px', borderRadius: '4px',
                  }}>
                    {cardBrand(cardNumber)}
                  </span>
                )}
              </div>
            </div>

            {/* Expiry + CVC */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
                  Expiration date
                </label>
                <input
                  type="text" inputMode="numeric" placeholder="MM / YY"
                  value={cardExpiry}
                  onChange={e => setCardExpiry(fmtExpiry(e.target.value))}
                  style={{
                    width: '100%', background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '0.72rem 0.875rem',
                    color: 'var(--white)', fontSize: '0.95rem', outline: 'none',
                    fontFamily: 'monospace', boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#9C7BE8'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
                  Security code
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text" inputMode="numeric" placeholder="CVC"
                    maxLength={4} value={cardCvc}
                    onChange={e => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    style={{
                      width: '100%', background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px', padding: '0.72rem 2.25rem 0.72rem 0.875rem',
                      color: 'var(--white)', fontSize: '0.95rem', outline: 'none',
                      fontFamily: 'monospace', boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#9C7BE8'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                  />
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"
                    style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Cardholder name */}
            <div style={{ marginBottom: '0.875rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
                Name on card
              </label>
              <input
                type="text" placeholder="Full name as on card"
                value={cardName}
                onChange={e => setCardName(e.target.value)}
                style={{
                  width: '100%', background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '0.72rem 0.875rem',
                  color: 'var(--white)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = '#9C7BE8'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(156,123,232,0.7)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                Card details encrypted and sent directly to PayMongo — never stored on our servers.
              </span>
            </div>
          </div>
        )}
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
        disabled={placing || !selectedAddress || items.length === 0 || (isOnlinePayment && grandTotal < 100)}
        className="checkout-place-btn"
      >
        {placing ? (
          <>
            <svg className="checkout-spinner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
            </svg>
            {paymentMethod === 'card' ? 'Processing...' : 'Placing Order...'}
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            {paymentMethod === 'cod' ? 'Place Order' : paymentMethod === 'gcash' ? 'Pay with GCash' : paymentMethod === 'paymaya' ? 'Pay with Maya' : 'Pay with Card'}
          </>
        )}
      </button>

      <p className="checkout-disclaimer">
        {paymentMethod === 'cod'
          ? shippingFeeAmt !== null
            ? 'By placing this order, you agree to our terms. You will pay upon delivery including the estimated shipping fee.'
            : 'By placing this order, you agree to our terms. You will pay upon delivery. Exact delivery fee may vary.'
          : paymentMethod === 'gcash'
            ? 'By placing this order, you agree to our terms. You\'ll be redirected to GCash to complete payment.'
            : paymentMethod === 'paymaya'
              ? 'By placing this order, you agree to our terms. You\'ll be redirected to Maya to complete payment.'
              : 'By placing this order, you agree to our terms. Your card details are processed securely by PayMongo.'}
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

      {/* PIN LOCATION MODAL */}
      {showPinModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPinModal(false); }}
        >
          <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '580px', marginTop: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--white)', fontWeight: 700 }}>Pin Your Delivery Location</h2>
              <button onClick={() => setShowPinModal(false)} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <AddressBook
              initialEditAddress={selectedAddress}
              onSaved={() => {
                fetchAddresses(true);
                setShowPinModal(false);
              }}
            />
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

