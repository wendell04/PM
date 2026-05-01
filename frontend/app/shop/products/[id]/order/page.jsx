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

  const [paymentMethod, setPaymentMethod] = useState('gcash');
  const [placing, setPlacing] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (token === null) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }));
      router.push(`/shop/products/${id}`);
    }
  }, [token, id, router]);

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
  const unitPrice = getUnitPrice(product, quantity, selectedVariants);
  const designFee = designMode === 'request' ? (product?.designFee ?? 0) : 0;
  const lineTotal = (unitPrice ?? 0) * quantity;
  const grandTotal = lineTotal + designFee;
  const downpaymentRequired = product?.requiresDownpayment ?? false;
  const downpaymentPercent = product?.downpaymentPercent ?? 50;
  const amountDue = downpaymentRequired
    ? Math.round(grandTotal * downpaymentPercent / 100 * 100) / 100
    : grandTotal;
  const remainingBalance = downpaymentRequired
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
    if (designMode === 'request' && !selectedAddress) {
      setSubmitError('Please select a delivery address.'); return;
    }
    if (designMode === 'request' && downpaymentRequired && paymentMethod === 'cod') {
      setSubmitError('Cash on Delivery is not available for downpayment orders. Please choose GCash or Maya.');
      return;
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

      if (designMode === 'upload') {
        const res = await fetchWithTimeout(`${API_URL}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            items: [orderItem],
            isCustomOrder: true,
            designType: 'upload',
            designNotes: designNotes.trim() || null,
          }),
        }, 20000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to submit.');
        router.push('/shop/orders?submitted=upload');
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
        shippingFee: 0,
        isCustomOrder: true,
        designType: designMode,
        ...(downpaymentRequired ? { isDownpayment: true, downpaymentPercent } : {}),
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
        const res = await fetchWithTimeout(`${API_URL}/api/payment/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...commonFields, paymentType: paymentMethod }),
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

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dark1)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(212,168,67,0.2)', borderTopColor: '#D4A843', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.2rem' }}>Place Custom Order</h1>
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
                    {product.designFee > 0 && (
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

            {/* Steps 3 & 4 only needed for Request Design (Upload submits without payment) */}
            {/* Step 3: Delivery */}
            {designMode === 'request' && <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
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
            {designMode === 'request' && <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '1.25rem' }}>4 — Payment Method</h2>

              {downpaymentRequired && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                  A <strong style={{ color: 'var(--gold)' }}>{downpaymentPercent}% downpayment</strong> of {fmt(amountDue)} is required now. The remaining {fmt(remainingBalance)} is due after design approval.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {[
                  { key: 'gcash', label: 'GCash' },
                  { key: 'maya', label: 'Maya' },
                  { key: 'cod', label: 'COD', disabled: downpaymentRequired },
                ].map(m => (
                  <button key={m.key} onClick={() => !m.disabled && setPaymentMethod(m.key)} disabled={m.disabled}
                    style={{ padding: '0.75rem 0.5rem', borderRadius: '10px', border: `1.5px solid ${paymentMethod === m.key ? 'var(--gold)' : 'var(--border)'}`, background: paymentMethod === m.key ? 'rgba(212,168,67,0.08)' : 'transparent', cursor: m.disabled ? 'not-allowed' : 'pointer', color: m.disabled ? 'rgba(229,226,225,0.3)' : paymentMethod === m.key ? 'var(--gold)' : 'var(--white)', fontWeight: 700, fontSize: '0.9rem', fontFamily: "'Outfit', sans-serif", opacity: m.disabled ? 0.5 : 1, transition: 'all 0.12s' }}>
                    {m.label}
                    {m.disabled && <div style={{ fontSize: '0.6rem', fontWeight: 400, color: 'var(--gray)', marginTop: '3px' }}>N/A for DP</div>}
                  </button>
                ))}
              </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700, paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <span>Total</span>
                  <span>{fmt(grandTotal)}</span>
                </div>
              </div>

              {designMode === 'upload' && (
                <div style={{ padding: '0.875rem', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                  <strong style={{ color: '#60a5fa', display: 'block', marginBottom: '4px' }}>No payment yet</strong>
                  We&apos;ll review your file first. You&apos;ll confirm your address and pay only after we verify it&apos;s print-ready.
                </div>
              )}

              {designMode === 'request' && downpaymentRequired && (
                <div style={{ padding: '0.875rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Due now ({downpaymentPercent}%)</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 800 }}>{fmt(amountDue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--gray)' }}>After approval</span>
                    <span style={{ color: 'var(--gray)' }}>{fmt(remainingBalance)}</span>
                  </div>
                </div>
              )}

              {designMode === 'request' && (
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
                    {designMode === 'upload' ? 'Submitting...' : 'Placing Order...'}
                  </>
                ) : designMode === 'upload' ? (
                  'Submit for Review'
                ) : (
                  `Place Order & Pay ${fmt(amountDue)}`
                )}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.75rem', lineHeight: 1.5 }}>
                {designMode === 'upload'
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
