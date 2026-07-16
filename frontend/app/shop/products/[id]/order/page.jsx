'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { uploadDesignFile } from '@/lib/orderRequestApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function fmt(n) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPHPhone(d) {
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0,3)+' '+d.slice(3);
  return d.slice(0,3)+' '+d.slice(3,6)+' '+d.slice(6);
}
function fmtCardNumber(v) { return v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim(); }
function fmtExpiry(v) { const d=v.replace(/\D/g,'').slice(0,4); return d.length>=3?d.slice(0,2)+'/'+d.slice(2):d; }
function cardBrand(num) {
  const n=num.replace(/\s/g,'');
  if(/^4/.test(n)) return 'VISA';
  if(/^5[1-5]/.test(n)||/^2[2-7]/.test(n)) return 'MC';
  return null;
}

function getTierForQty(p, qty) {
  const tiers = p?.priceTiers ?? p?.tiers ?? [];
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0));
  let match = sorted[sorted.length - 1];
  for (const t of sorted) {
    const min = parseInt(t.minQty) || 0;
    const max = t.maxQty !== null && t.maxQty !== '' ? parseInt(t.maxQty) : Infinity;
    if (qty >= min && qty <= max) { match = t; break; }
  }
  return match;
}

function resolveCombo(product, variants) {
  if (!product?.combinations?.length) return null;
  return product.combinations.find(c =>
    Object.keys(variants).every(k => c.combo?.[k] === variants[k])
  ) ?? null;
}

function getUnitPrice(p, qty, variants) {
  if (!p) return null;
  if (p.priceType === 'tiered') {
    const tier = getTierForQty(p, qty);
    const comboId = resolveCombo(p, variants)?.id ?? null;
    const prices = tier?.prices ?? {};
    if (comboId && prices[comboId] !== undefined) return parseFloat(prices[comboId]) || null;
    const vals = Object.values(prices).map(v => parseFloat(v)).filter(v => v > 0);
    return vals.length ? Math.min(...vals) : null;
  }
  if (p.priceType === 'fixed') {
    const vp = p.variantPrices ?? {};
    const comboId = resolveCombo(p, variants)?.id ?? null;
    if (comboId && vp[comboId]) return parseFloat(vp[comboId]) || null;
    return parseFloat(p.price ?? p.flatPrice) || null;
  }
  return null;
}

function formatAddress(addr) {
  return [
    addr.house_number && addr.street ? `${addr.house_number} ${addr.street}` : '',
    addr.subdivision,
    addr.barangay ? `Brgy. ${addr.barangay}` : '',
    addr.city,
    addr.province,
    addr.zip,
  ].filter(Boolean).join(', ');
}

export default function CustomOrderPage() {
  const { id } = useParams();
  const router = useRouter();
  const { token } = useAuth();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');

  const [designMode, setDesignMode] = useState(null);
  const [designFile, setDesignFile] = useState(null);
  const [designFileUrl, setDesignFileUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [designNotes, setDesignNotes] = useState('');
  const fileInputRef = useRef(null);

  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [addressLoading, setAddressLoading] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState(null);
  const [eWalletPhone, setEWalletPhone] = useState('');
  const [showEWalletPhone, setShowEWalletPhone] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [placing, setPlacing] = useState(false);
  const [failedModal, setFailedModal] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [pendingVerifyId, setPendingVerifyId] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [storeSettings, setStoreSettings]     = useState(null);
  const [shippingFeeAmt, setShippingFeeAmt]   = useState(null);

  useEffect(() => {
    if (token === null) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }));
      router.push(`/shop/products/${id}`);
    }
  }, [token, id, router]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isCancelled = params.get('payment_cancelled') === '1';
    const pendingOrderId = sessionStorage.getItem('pending_payment_order_id');
    if (isCancelled) window.history.replaceState({}, '', window.location.pathname);
    if (pendingOrderId) {
      sessionStorage.removeItem('pending_payment_order_id');
      if (isCancelled) { setFailedModal(true); return; }
      setVerifyingPayment(true);
      setPendingVerifyId(pendingOrderId);
    } else if (isCancelled) {
      setFailedModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pendingVerifyId || !token) return;
    let cancelled = false;
    let attempt = 0;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/orders/my/${pendingVerifyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 10000);
        const data = await res.json();
        const order = data.data ?? data;
        if (order.paymentStatus === 'paid') {
          if (!cancelled) { setVerifyingPayment(false); router.push('/shop/orders-history?submitted=paid'); }
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
  }, [pendingVerifyId, token, router]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchWithTimeout(`${API_URL}/api/products/${id}`, {}, 30000)
      .then(r => r.json())
      .then(data => {
        const p = data.data ?? data;
        if (!p.isCustom) { router.push(`/shop/products/${id}`); return; }
        setProduct(p);
        const moq = p.minOrderQty || 1;
        setQuantity(moq);
        setQuantityInput(String(moq));
        if (p.variantGroups?.length) {
          const initial = {};
          p.variantGroups.forEach(g => { if (g.options?.length) initial[g.id] = g.options[0].value; });
          setSelectedVariants(initial);
        }
      })
      .catch(() => setLoadError('Product not found.'))
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    fetch(`${API_URL}/api/public/settings`)
      .then(r => r.json())
      .then(d => setStoreSettings(d.data ?? d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const addr = addresses.find(a => a.id === selectedAddressId) ?? null;
    if (!storeSettings?.storeLat || !storeSettings?.storeLng || !addr?.lat || !addr?.lng) {
      setShippingFeeAmt(null);
      return;
    }
    const { storeLat, storeLng, shippingBaseRate = 50, shippingPerKmRate = 15 } = storeSettings;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${addr.lng},${addr.lat}?overview=false`
    )
      .then(r => r.json())
      .then(d => {
        const distM = d.routes?.[0]?.distance ?? null;
        if (distM !== null) {
          setShippingFeeAmt(Math.round((shippingBaseRate + shippingPerKmRate * distM / 1000) * 100) / 100);
        } else {
          setShippingFeeAmt(null);
        }
      })
      .catch(() => setShippingFeeAmt(null));
  }, [selectedAddressId, addresses, storeSettings]);

  useEffect(() => {
    if (!token) return;
    setAddressLoading(true);
    fetchWithTimeout(`${API_URL}/api/addresses`, { headers: { Authorization: `Bearer ${token}` } }, 30000)
      .then(r => r.json())
      .then(data => {
        const list = data.addresses || [];
        setAddresses(list);
        const def = list.find(a => a.is_default);
        setSelectedAddressId(def?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setAddressLoading(false));
  }, [token]);

  const moq = product?.minOrderQty || 1;
  // Inquiry (quotation) products have no computable price — they go through the quote flow
  // (request now, owner sends a quote, customer pays it later), never a direct ₱0 checkout.
  const isInquiry = (product?.priceType ?? product?.pricingMode) === 'inquiry';
  const unitPrice = getUnitPrice(product, quantity, selectedVariants);
  const designFee = designMode === 'request' ? (product?.designFee ?? 0) : 0;
  const lineTotal = (unitPrice ?? 0) * quantity;
  const grandTotal = lineTotal + designFee + (shippingFeeAmt ?? 0);
  const downpaymentRequired = product?.requiresDownpayment ?? false;
  const downpaymentPercent = product?.downpaymentPercent ?? 50;
  const amountDue = designMode === 'request'
    ? designFee
    : downpaymentRequired
      ? Math.round(grandTotal * downpaymentPercent / 100 * 100) / 100
      : grandTotal;
  const remainingBalance = designMode === 'request'
    ? Math.round((grandTotal - designFee) * 100) / 100
    : downpaymentRequired
      ? Math.round((grandTotal - amountDue) * 100) / 100
      : 0;
  const selectedAddress = addresses.find(a => a.id === selectedAddressId) ?? null;
  const combo = product ? resolveCombo(product, selectedVariants) : null;
  const variantLabel = combo?.label ?? (Object.values(selectedVariants).join(', ') || null);

  async function handleFileSelect(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setSubmitError('File must be under 10 MB.'); return; }
    setDesignFile(file);
    setDesignFileUrl(null);
    setUploading(true);
    setSubmitError(null);
    try {
      const { url } = await uploadDesignFile(token, file);
      setDesignFileUrl(url);
    } catch {
      setDesignFile(null);
      setSubmitError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!designMode) { setSubmitError('Please choose how you want to provide your design.'); return; }
    if (designMode === 'upload' && !designFileUrl) {
      setSubmitError(uploading ? 'Design is still uploading, please wait.' : 'Please upload your design file.');
      return;
    }

    // Inquiry (quotation) products: submit a quote request only — no address, no payment.
    // The owner reviews it, sends a quote; the customer pays that quote later.
    if (isInquiry) {
      setSubmitError(null);
      setPlacing(true);
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/order-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            productId: String(product._id ?? product.id),
            quantity,
            selectedVariants,
            designUrl: designMode === 'upload' ? designFileUrl : null,
            designNotes: designNotes.trim() || null,
            designType: designMode,
            isCustom: true,
          }),
        }, 20000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to submit your request.');
        setRequestSubmitted(true);
      } catch (err) {
        setSubmitError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setPlacing(false);
      }
      return;
    }

    if (!selectedAddress) {
      setSubmitError('Please select a delivery address.'); return;
    }
    const needsPayment = designMode === 'request' || (designMode === 'upload' && downpaymentRequired);
    if (needsPayment && !paymentMethod) {
      setSubmitError('Please select a payment method.'); return;
    }
    if (needsPayment && paymentMethod === 'card') {
      const num = cardNumber.replace(/\s/g,'');
      if (num.length < 16) { setSubmitError('Enter a valid 16-digit card number.'); return; }
      if (!cardExpiry || cardExpiry.length < 4) { setSubmitError('Enter a valid expiry date (MM/YY).'); return; }
      if (cardCvc.length < 3) { setSubmitError('Enter a valid security code.'); return; }
      if (!cardName.trim()) { setSubmitError('Enter the name on your card.'); return; }
    }

    setSubmitError(null);
    setPlacing(true);

    try {
      const orderItem = {
        productId: String(product._id ?? product.id),
        variantId: combo?.id ?? null,
        variantName: variantLabel,
        qty: quantity,
        unitPrice: unitPrice ?? 0,
        isCustom: true,
        ...(designMode === 'upload' ? { designUrl: designFileUrl } : {}),
        ...(designMode === 'request'
          ? { designRequested: true, designFee, designNotes: designNotes.trim() || null }
          : {}),
      };

      if (designMode === 'upload' && !downpaymentRequired) {
        const deliveryAddress = {
          label: selectedAddress.label,
          house_number: selectedAddress.house_number,
          street: selectedAddress.street,
          subdivision: selectedAddress.subdivision,
          barangay: selectedAddress.barangay,
          city: selectedAddress.city,
          province: selectedAddress.province,
          zip: selectedAddress.zip,
          phone: selectedAddress.phone,
        };
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            items: [orderItem],
            deliveryAddress,
            shippingFee: shippingFeeAmt ?? 0,
            isCustomOrder: true,
            designType: 'upload',
            designNotes: designNotes.trim() || null,
          }),
        }, 20000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to submit.');
        router.push('/shop/orders-history?submitted=upload');
        return;
      }

      const deliveryAddress = {
        label: selectedAddress.label,
        house_number: selectedAddress.house_number,
        street: selectedAddress.street,
        subdivision: selectedAddress.subdivision,
        barangay: selectedAddress.barangay,
        city: selectedAddress.city,
        province: selectedAddress.province,
        zip: selectedAddress.zip,
        phone: selectedAddress.phone,
      };

      const commonFields = {
        items: [orderItem],
        deliveryAddress,
        shippingFee: shippingFeeAmt ?? 0,
        isCustomOrder: true,
        designType: designMode,
        ...(designMode === 'request'
          ? { isDesignFeeOnly: true }
          : downpaymentRequired ? { isDownpayment: true, downpaymentPercent } : {}),
      };

      if (paymentMethod === 'cod') {
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...commonFields, paymentMethod: 'cod' }),
        }, 20000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to place order.');
        const orderId = data.data?._id ?? data.data?.id ?? data._id ?? data.id;
        router.push(`/shop/payment-success?id=${orderId}&method=cod`);
      } else {
        let paymentMethodId = null;
        if (paymentMethod === 'card') {
          const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
          const [expMonth, expYear] = cardExpiry.split('/');
          const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(publicKey+':')}` },
            body: JSON.stringify({ data: { attributes: { type: 'card', details: { card_number: cardNumber.replace(/\s/g,''), exp_month: parseInt(expMonth), exp_year: parseInt('20'+expYear), cvc: cardCvc }, billing: { name: cardName.trim(), email: '', phone: '' } } } }),
          });
          const pmData = await pmRes.json();
          if (!pmRes.ok) {
            const detail = pmData.errors?.[0]?.detail ?? '';
            if (detail.includes('card_number')) throw new Error('Card number is invalid.');
            if (detail.includes('exp_month')||detail.includes('exp_year')) throw new Error('Expiry date is invalid.');
            if (detail.includes('cvc')) throw new Error('Security code is invalid.');
            throw new Error('Invalid card details. Please check and try again.');
          }
          paymentMethodId = pmData.data.id;
        }
        const res = await fetchWithTimeout(`${API_URL}/api/payment/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...commonFields,
            paymentType: paymentMethod,
            paymentMethodId,
            eWalletPhone: (['gcash','paymaya'].includes(paymentMethod) && eWalletPhone.trim()) ? `+63${eWalletPhone.trim()}` : null,
          }),
        }, 25000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Payment initiation failed.');
        const { orderId, status, redirectUrl } = data.data ?? data;
        if (status === 'succeeded') {
          router.push(`/shop/payment-success?id=${orderId}&method=${paymentMethod}`);
        } else if (redirectUrl) {
          sessionStorage.setItem('pending_payment_order_id', orderId);
          window.location.href = redirectUrl;
        } else {
          throw new Error('No redirect URL returned. Please try again.');
        }
      }
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setPlacing(false);
    }
  }
  if (verifyingPayment) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--dark2)', borderRadius: '18px', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: 6 }}>Verifying payment…</p>
        <p style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Please wait, this may take a few seconds.</p>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dark1)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(212,168,67,0.2)', borderTopColor: '#D4A843', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (failedModal) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
      <div style={{ background: 'var(--dark2)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '18px', padding: '40px 32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <h2 style={{ color: 'var(--white)', fontWeight: 700, fontSize: '1.3rem', marginBottom: 8 }}>Payment Cancelled</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.6 }}>
          Your payment was not completed. Your order has been saved — you can try again below.
        </p>
        <button onClick={() => setFailedModal(false)}
          style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
          Try Again
        </button>
      </div>
    </div>
  );
  
  if (requestSubmitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dark1)', padding: '20px', fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ background: 'var(--dark2)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '18px', padding: '40px 32px', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(212,168,67,0.1)', border: '2px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ color: 'var(--white)', fontWeight: 700, fontSize: '1.3rem', marginBottom: 8 }}>Quote request submitted</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.6 }}>
          We&apos;ve received your request for <strong style={{ color: 'var(--white)' }}>{product.name}</strong>. We&apos;ll review the details and send you a quote via chat — you only pay once you approve it.
        </p>
        <button onClick={() => router.push('/shop')}
          style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
          Continue Shopping
        </button>
      </div>
    </div>
  );

  if (loadError || !product) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'var(--dark1)', color: 'var(--white)', fontFamily: "'Outfit', sans-serif" }}>
      <p style={{ color: 'var(--gray)' }}>{loadError ?? 'Product not found.'}</p>
      <Link href="/shop" style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>← Back to Shop</Link>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--dark1)', color: 'var(--white)', padding: '2rem 1rem 4rem', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .custom-order-grid { display: grid; grid-template-columns: 1fr 360px; gap: 2rem; align-items: start; }
        @media (max-width: 768px) { .custom-order-grid { grid-template-columns: 1fr; } .custom-order-sidebar { position: static !important; } }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Link href={`/shop/products/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--gray)', fontSize: '0.85rem', textDecoration: 'none', marginBottom: '1.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Product
        </Link>

        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.2rem' }}>{isInquiry ? 'Request a Quote' : 'Place Custom Order'}</h1>
        <p style={{ color: 'var(--gray)', fontSize: '0.875rem', marginBottom: '2rem' }}>{product.name}</p>

        <div className="custom-order-grid">

          {/* ── LEFT: FORM ─────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Step 1: Product Config */}
            <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '1.25rem' }}>1 — Product Details</h2>

              {product.variantGroups?.map(group => (
                <div key={group.id} style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: '0.5rem' }}>{group.name}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {group.options?.map(opt => {
                      const active = selectedVariants[group.id] === opt.value;
                      return (
                        <button key={opt.value}
                          onClick={() => setSelectedVariants(prev => ({ ...prev, [group.id]: opt.value }))}
                          style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: active ? 700 : 500, fontFamily: "'Outfit', sans-serif", cursor: 'pointer', border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'rgba(212,168,67,0.12)' : 'transparent', color: active ? 'var(--gold)' : 'var(--white)', transition: 'all 0.12s' }}>
                          {opt.label ?? opt.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: '0.5rem' }}>
                  Quantity
                  {moq > 1 && <span style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'none', marginLeft: '6px' }}>Min. {moq} pcs</span>}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => { const n = Math.max(moq, quantity - 1); setQuantity(n); setQuantityInput(String(n)); }}
                    style={{ width: 36, height: 36, borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
                  <input type="text" value={quantityInput}
                    onChange={e => setQuantityInput(e.target.value)}
                    onBlur={() => { const n = Math.max(moq, parseInt(quantityInput) || moq); setQuantity(n); setQuantityInput(String(n)); }}
                    style={{ width: 64, textAlign: 'center', padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '0.95rem', fontFamily: "'Outfit', sans-serif" }} />
                  <button
                    onClick={() => { const n = quantity + 1; setQuantity(n); setQuantityInput(String(n)); }}
                    style={{ width: 36, height: 36, borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
                  {unitPrice != null && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--gray)', fontSize: '0.85rem' }}>{fmt(unitPrice)} / pc</span>
                  )}
                </div>
              </div>
            </section>

            {/* Step 2: Design */}
            <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '1.25rem' }}>2 — Your Design</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <button onClick={() => setDesignMode('upload')}
                  style={{ padding: '1.25rem', borderRadius: '10px', border: `1.5px solid ${designMode === 'upload' ? 'var(--gold)' : 'var(--border)'}`, background: designMode === 'upload' ? 'rgba(212,168,67,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', color: 'var(--white)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={designMode === 'upload' ? '#D4A843' : 'var(--gray)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', marginBottom: '0.6rem' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem', color: designMode === 'upload' ? 'var(--gold)' : 'var(--white)' }}>I have a design</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: 0 }}>Upload your file (JPG, PNG, PDF, AI)</p>
                </button>

                <button onClick={() => setDesignMode('request')}
                  style={{ padding: '1.25rem', borderRadius: '10px', border: `1.5px solid ${designMode === 'request' ? 'var(--gold)' : 'var(--border)'}`, background: designMode === 'request' ? 'rgba(212,168,67,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', color: 'var(--white)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={designMode === 'request' ? '#D4A843' : 'var(--gray)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', marginBottom: '0.6rem' }}>
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem', color: designMode === 'request' ? 'var(--gold)' : 'var(--white)' }}>Request a design</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: 0 }}>
                    We&apos;ll create it for you
                    {product.designFee > 0 && !isInquiry && (
                      <span style={{ color: 'var(--gold)', fontWeight: 700, marginLeft: '4px' }}>+{fmt(product.designFee)}</span>
                    )}
                  </p>
                </button>
              </div>

              {designMode === 'upload' && (
                <div>
                  <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,.ai,.psd,.svg,.eps" style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                  {designFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '10px' }}>
                      {uploading ? (
                        <div style={{ width: 20, height: 20, border: '2px solid rgba(212,168,67,0.2)', borderTopColor: '#D4A843', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                      <span style={{ fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--white)' }}>{designFile.name}</span>
                      <button onClick={() => { setDesignFile(null); setDesignFileUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(212,168,67,0.6)'; }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
                      style={{ border: '2px dashed var(--border)', borderRadius: '10px', padding: '2.5rem 1rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 0.75rem' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.3rem' }}>Click or drag to upload</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: 0 }}>JPG, PNG, PDF, AI, PSD, SVG, EPS · Max 10 MB</p>
                    </div>
                  )}
                  {product.designFormats?.length > 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.6rem' }}>
                      Accepted: {product.designFormats.map(f => f.name || f).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {designMode === 'request' && (
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>
                    Describe what you need (optional — our designer will contact you via chat to finalize):
                  </p>
                  <textarea value={designNotes} onChange={e => setDesignNotes(e.target.value)}
                    placeholder="E.g. Company logo in blue and white, add 'ABC Corp' in bold. Minimalist style."
                    rows={4}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--white)', fontSize: '0.85rem', fontFamily: "'Outfit', sans-serif", resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              )}
            </section>

            {/* Step 3: Delivery — shown for both upload and request */}
            {(designMode === 'upload' || designMode === 'request') && !isInquiry && <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '1.25rem' }}>3 — Delivery Address</h2>
              {addressLoading ? (
                <p style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Loading addresses...</p>
              ) : addresses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.25rem 0' }}>
                  <p style={{ color: 'var(--gray)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>No saved addresses.</p>
                  <Link href="/shop/profile" style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.85rem' }}>+ Add an address in Profile</Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {addresses.map(addr => {
                    const active = addr.id === selectedAddressId;
                    return (
                      <div key={addr.id} onClick={() => setSelectedAddressId(addr.id)}
                        style={{ padding: '0.875rem 1rem', borderRadius: '10px', border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'rgba(212,168,67,0.06)' : 'transparent', cursor: 'pointer', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', transition: 'all 0.12s' }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${active ? 'var(--gold)' : 'var(--gray)'}`, flexShrink: 0, marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '2px' }}>
                            {addr.label || 'Home'}
                            {addr.is_default && (
                              <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: 'rgba(212,168,67,0.15)', color: 'var(--gold)', padding: '1px 6px', borderRadius: '999px', fontWeight: 700 }}>Default</span>
                            )}
                          </p>
                          <p style={{ fontSize: '0.8rem', color: 'var(--gray)', margin: 0 }}>{formatAddress(addr)}</p>
                          {addr.phone && <p style={{ fontSize: '0.78rem', color: 'var(--gray)', margin: '2px 0 0' }}>{addr.phone}</p>}
                        </div>
                      </div>
                    );
                  })}
                  <Link href="/shop/profile" style={{ fontSize: '0.8rem', color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '0.25rem', textDecoration: 'none' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Manage addresses
                  </Link>
                </div>
              )}
            </section>}

            {/* Step 4: Payment */}
            {(designMode === 'request' || (designMode === 'upload' && downpaymentRequired)) && !isInquiry && <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '1.25rem' }}>4 — Payment Method</h2>

              <div style={{ padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                {designMode === 'request'
                  ? <>Pay the <strong style={{ color: 'var(--gold)' }}>design fee of {fmt(designFee)}</strong> now. The remaining order balance of <strong style={{ color: 'var(--white)' }}>{fmt(remainingBalance)}</strong> will be collected after design approval.</>
                  : <>A <strong style={{ color: 'var(--gold)' }}>{downpaymentPercent}% downpayment of {fmt(amountDue)}</strong> is required to confirm your custom order. The remaining <strong style={{ color: 'var(--white)' }}>{fmt(remainingBalance)}</strong> will be collected upon completion.</>
                }
              </div>

              {[
                ...(designMode === 'upload' && downpaymentRequired && product?.allowCOD
                  ? [{ id: 'cod', label: 'Cash on Delivery', sub: `Pay ₱${amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} downpayment on delivery.`, accent: '#d4a843', accentBg: 'rgba(212,168,67,0.08)', logo: '/logos/cod.png', isCOD: true }]
                  : []),
                { id: 'gcash',    label: 'GCash',              sub: "Redirect to GCash to authorize.",   accent: '#0066FF', accentBg: 'rgba(0,102,255,0.07)',    logo: '/logos/Gcash-Logo-1024x1024.png' },
                { id: 'paymaya', label: 'Maya',               sub: "Redirect to Maya to authorize.",    accent: '#00B14F', accentBg: 'rgba(0,177,79,0.07)',     logo: '/logos/maya logo.png' },
                { id: 'card',    label: 'Credit / Debit Card', sub: 'Pay with Visa or Mastercard.',     accent: '#9C7BE8', accentBg: 'rgba(156,123,232,0.07)', logo: '/logos/credit-card.svg', filterImg: true },
              ].map(opt => {
                const isSelected = paymentMethod === opt.id;
                const isEWallet = opt.id === 'gcash' || opt.id === 'paymaya';
                const showPanel = isEWallet && isSelected;
                return (
                  <div key={opt.id}>
                    <div onClick={() => { setPaymentMethod(opt.id); setEWalletPhone(''); setShowEWalletPhone(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem', borderRadius: '10px', cursor: 'pointer', border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.07)'}`, background: isSelected ? opt.accentBg : 'var(--dark1)', marginBottom: showPanel ? 0 : '0.625rem', transition: 'all 0.18s' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0, background: isSelected ? opt.accentBg : 'rgba(255,255,255,0.04)', border: `1px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={opt.logo} alt={opt.label} style={{ width: '30px', height: '30px', objectFit: 'contain', ...(opt.filterImg ? { filter: 'brightness(0) invert(1)', opacity: isSelected ? 1 : 0.45 } : { borderRadius: '6px' }) }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.15rem' }}>{opt.label}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{opt.sub}</div>
                      </div>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? opt.accent : 'rgba(255,255,255,0.2)'}`, background: isSelected ? opt.accent : 'transparent', transition: 'all 0.18s' }} />
                    </div>
                    {showPanel && (
                      <div style={{ marginTop: '4px', marginBottom: '0.625rem', padding: '0.875rem 1rem', borderRadius: '10px', background: opt.id === 'gcash' ? 'rgba(0,102,255,0.04)' : 'rgba(0,177,79,0.04)', border: `1px solid ${opt.id === 'gcash' ? 'rgba(0,102,255,0.18)' : 'rgba(0,177,79,0.18)'}` }}>
                        {!showEWalletPhone ? (
                          <button type="button" onClick={() => setShowEWalletPhone(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: opt.id === 'gcash' ? '#0066FF' : '#00B14F', fontSize: '0.8rem', fontWeight: 600 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                            Use a different {opt.id === 'gcash' ? 'GCash' : 'Maya'} number for billing reference
                          </button>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: opt.id === 'gcash' ? '#0066FF' : '#00B14F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{opt.id === 'gcash' ? 'GCash' : 'Maya'} number</span>
                              <button type="button" onClick={() => { setShowEWalletPhone(false); setEWalletPhone(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.75rem', padding: 0 }}>Cancel</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }} onFocusCapture={e => { e.currentTarget.style.borderColor = opt.id === 'gcash' ? '#0066FF' : '#00B14F'; }} onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
                              <span style={{ padding: '0.65rem 0.75rem', fontSize: '0.9rem', fontFamily: 'monospace', color: 'var(--gray)', borderRight: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>+63</span>
                              <input type="tel" inputMode="numeric" placeholder="9XX XXX XXXX" maxLength={12} value={fmtPHPhone(eWalletPhone)} autoFocus onChange={e => setEWalletPhone(e.target.value.replace(/\D/g,'').slice(0,10))} style={{ flex: 1, background: 'transparent', border: 'none', padding: '0.65rem 0.875rem', color: 'var(--white)', fontSize: '0.9rem', outline: 'none', fontFamily: 'monospace' }} />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {paymentMethod === 'card' && (
                <div style={{ marginTop: '0.25rem', padding: '1.25rem', borderRadius: '12px', background: 'rgba(156,123,232,0.05)', border: '1px solid rgba(156,123,232,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(156,123,232,0.9)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Card Details</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="38" height="24" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="24" rx="4" fill="#1A1F71"/><text x="19" y="17" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontStyle="italic" fontFamily="Arial,sans-serif">VISA</text></svg>
                      <svg width="38" height="24" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="24" rx="4" fill="#252525"/><circle cx="14" cy="12" r="7.5" fill="#EB001B"/><circle cx="24" cy="12" r="7.5" fill="#F79E1B"/></svg>
                    </div>
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem' }}>Card number</label>
                    <div style={{ position: 'relative' }}>
                      <input type="text" inputMode="numeric" placeholder="1234 1234 1234 1234" value={cardNumber} onChange={e => setCardNumber(fmtCardNumber(e.target.value))} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.72rem 2.75rem 0.72rem 0.875rem', color: 'var(--white)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: '0.08em' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                      {cardBrand(cardNumber) && <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', fontWeight: 900, color: '#9C7BE8', background: 'rgba(156,123,232,0.12)', padding: '2px 6px', borderRadius: '4px' }}>{cardBrand(cardNumber)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem' }}>Expiration date</label>
                      <input type="text" inputMode="numeric" placeholder="MM / YY" value={cardExpiry} onChange={e => setCardExpiry(fmtExpiry(e.target.value))} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.72rem 0.875rem', color: 'var(--white)', fontSize: '0.95rem', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem' }}>Security code</label>
                      <input type="text" inputMode="numeric" placeholder="CVC" maxLength={4} value={cardCvc} onChange={e => setCardCvc(e.target.value.replace(/\D/g,'').slice(0,4))} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.72rem 0.875rem', color: 'var(--white)', fontSize: '0.95rem', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, marginBottom: '0.35rem' }}>Name on card</label>
                    <input type="text" placeholder="Full name as on card" value={cardName} onChange={e => setCardName(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.72rem 0.875rem', color: 'var(--white)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor='#9C7BE8'; }} onBlur={e => { e.target.style.borderColor='rgba(255,255,255,0.1)'; }} />
                  </div>
                </div>
              )}
            </section>}

          </div>

          {/* ── RIGHT: STICKY SUMMARY ──────────────────────────── */}
          <div className="custom-order-sidebar" style={{ position: 'sticky', top: '5rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>

              <div style={{ display: 'flex', gap: '0.875rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                {(product.thumbnail || product.images?.[0]) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.thumbnail || product.images[0]} alt={product.name}
                    style={{ width: 56, height: 56, borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                  {variantLabel && <p style={{ fontSize: '0.78rem', color: 'var(--gray)', margin: '0 0 4px' }}>{variantLabel}</p>}
                  <div style={{ display: 'inline-flex', background: 'rgba(212,168,67,0.12)', color: 'var(--gold)', borderRadius: '999px', padding: '1px 8px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customizable</div>
                </div>
              </div>

              {isInquiry ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <span>{quantity} pc{quantity > 1 ? 's' : ''}</span>
                  <span style={{ color: 'var(--gold)' }}>Priced on quotation</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray)' }}>{fmt(unitPrice ?? 0)} × {quantity} pc{quantity > 1 ? 's' : ''}</span>
                    <span>{fmt(lineTotal)}</span>
                  </div>
                  {designMode === 'request' && designFee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--gray)' }}>Design fee</span>
                      <span style={{ color: 'var(--gold)' }}>+{fmt(designFee)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Shipping</span>
                    {shippingFeeAmt !== null
                      ? <span>{fmt(shippingFeeAmt)}</span>
                      : <span style={{ color: 'var(--gray)', fontStyle: 'italic', fontSize: '0.78rem' }}>Billed separately</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700, paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                    <span>Total</span>
                    <span>{fmt(grandTotal)}</span>
                  </div>
                </div>
              )}

              {isInquiry && (
                <div style={{ padding: '0.875rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--gold)', display: 'block', marginBottom: '4px' }}>No payment now</strong>
                  We&apos;ll review your request and send you a quote in chat. You only pay once you approve the quote.
                </div>
              )}

              {designMode === 'upload' && !isInquiry && (
                <div style={{ padding: '0.875rem', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                  <strong style={{ color: '#60a5fa', display: 'block', marginBottom: '4px' }}>No payment yet</strong>
                  We&apos;ll review your file first. You&apos;ll confirm your address and pay only after we verify it&apos;s print-ready.
                </div>
              )}

              {designMode === 'request' && !isInquiry && (
                <div style={{ padding: '0.875rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Design fee due now</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 800 }}>{fmt(designFee)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Order total due after approval</span>
                    <span style={{ color: 'var(--gray)' }}>{fmt(remainingBalance)}</span>
                  </div>
                </div>
              )}

              {designMode === 'request' && !isInquiry && (
                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                  Our designer will send a proof via chat within 24–48 hrs. Production starts once you approve.
                </div>
              )}

              {submitError && (
                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.82rem', color: '#f87171', lineHeight: 1.5 }}>
                  {submitError}
                </div>
              )}

              <button onClick={handleSubmit} disabled={placing}
                style={{ width: '100%', padding: '0.9rem', background: placing ? 'rgba(212,168,67,0.55)' : 'var(--gold)', color: '#000', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '0.95rem', cursor: placing ? 'wait' : 'pointer', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {placing ? (
                  <>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    {isInquiry ? 'Submitting...' : designMode === 'upload' ? 'Submitting...' : designMode === 'request' ? 'Requesting...' : 'Placing Order...'}
                  </>
                ) : isInquiry ? (
                  'Submit Quote Request'
                ) : designMode === 'upload' ? (
                  'Submit for Review'
                ) : designMode === 'request' ? (
                  `Request Design & Pay Design Fee ${fmt(designFee)}`
                ) : (
                  `Place Order & Pay ${fmt(amountDue)}`
                )}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.75rem', lineHeight: 1.5 }}>
                {isInquiry
                  ? 'No charge now — we\'ll send your quote after review.'
                  : designMode === 'upload'
                    ? 'You\'ll only pay after your file is reviewed and approved.'
                    : 'By placing this order you agree to our terms of service.'}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
