'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'http://127.0.0.1:8000';

export default function ProductDetailPage() {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [designUrl, setDesignUrl] = useState('');
  const [designNotes, setDesignNotes] = useState('');
  const [uploadingDesign, setUploadingDesign] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [flashSale, setFlashSale] = useState(null);

  const params = useParams();
  const router = useRouter();
  const { token, currentUser } = useAuth();
  const id = params?.id;

  // Fetch product
  useEffect(() => {
    if (!id) return;
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/products/${id}`, {}, 30000);
        if (!res.ok) throw new Error('Product not found');
        const data = await res.json();
        const p = data.data ?? data;
        setProduct(p);

        if (p.variantGroups?.length) {
          const initial = {};
          p.variantGroups.forEach(g => {
            if (g.options?.length) {
              initial[g.id] = g.options[0].value;
            }
          });
          setSelectedVariants(initial);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  // Fetch flash sale
  useEffect(() => {
    if (!product) return;
    const fetchFlashSale = async () => {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/storefront/flash-sales`, {}, 30000);
        if (!res.ok) return;
        const data = await res.json();
        const match = (data.data || []).find(
          s => s.productId === (product.id ?? product._id)
        );
        setFlashSale(match || null);
      } catch { /* silent */ }
    };
    fetchFlashSale();
  }, [product]);

  // Helpers
  function getTiers(p) {
    return p?.priceTiers ?? p?.tiers ?? [];
  }

  function computePrice(p, qty, variants) {
    const tiers = getTiers(p);

    if (p.priceType === 'tiered' && tiers.length) {
      const tier = tiers.find(t => {
        const min = parseInt(t.minQty) || 0;
        const max = t.maxQty !== null && t.maxQty !== ''
          ? parseInt(t.maxQty) : Infinity;
        return qty >= min && qty <= max;
      });
      if (!tier) return null;
      const prices = tier.prices || {};
      if (Object.keys(variants).length && Object.keys(prices).length > 1) {
        const sorted = Object.fromEntries(
          Object.entries(variants).sort(([a],[b]) => a.localeCompare(b))
        );
        const key = JSON.stringify(sorted);
        const unit = prices[key] ?? Object.values(prices)[0] ?? null;
        return unit ? parseFloat(unit) * qty : null;
      }
      const unit = prices['__base__']
        ?? Object.values(prices)[0] ?? null;
      return unit ? parseFloat(unit) * qty : null;
    }

    if (p.priceType === 'fixed') {
      const vp = p.variantPrices ?? {};
      if (Object.keys(variants).length && Object.keys(vp).length) {
        const sorted = Object.fromEntries(
          Object.entries(variants).sort(([a],[b]) => a.localeCompare(b))
        );
        const key = JSON.stringify(sorted);
        const unit = vp[key] ?? Object.values(vp)[0] ?? null;
        return unit ? parseFloat(unit) * qty : null;
      }
      const unit = p.price ?? p.flatPrice ?? null;
      return unit ? parseFloat(unit) * qty : null;
    }

    return null;
  }

  function getUnitPrice(p, qty, variants) {
    const tiers = getTiers(p);

    if (p.priceType === 'tiered' && tiers.length) {
      const tier = tiers.find(t => {
        const min = parseInt(t.minQty) || 0;
        const max = t.maxQty !== null && t.maxQty !== ''
          ? parseInt(t.maxQty) : Infinity;
        return qty >= min && qty <= max;
      });
      if (!tier) return null;
      const prices = tier.prices || {};
      if (Object.keys(variants).length && Object.keys(prices).length > 1) {
        const sorted = Object.fromEntries(
          Object.entries(variants).sort(([a],[b]) => a.localeCompare(b))
        );
        const key = JSON.stringify(sorted);
        return parseFloat(prices[key] ?? Object.values(prices)[0]) || null;
      }
      return parseFloat(prices['__base__']
        ?? Object.values(prices)[0]) || null;
    }

    if (p.priceType === 'fixed') {
      const vp = p.variantPrices ?? {};
      if (Object.keys(variants).length && Object.keys(vp).length) {
        const sorted = Object.fromEntries(
          Object.entries(variants).sort(([a],[b]) => a.localeCompare(b))
        );
        const key = JSON.stringify(sorted);
        return parseFloat(vp[key] ?? Object.values(vp)[0]) || null;
      }
      return parseFloat(p.price ?? p.flatPrice) || null;
    }

    return null;
  }

  function getPriceRange(p) {
    const tiers = getTiers(p);
    if (p.priceType === 'inquiry') return null;
    if (p.priceType === 'tiered' && tiers.length) {
      const all = tiers.flatMap(t =>
        Object.values(t.prices || {})
          .map(v => parseFloat(v))
          .filter(v => v > 0)
      );
      if (!all.length) return null;
      const min = Math.min(...all);
      const max = Math.max(...all);
      return { min, max };
    }
    if (p.priceType === 'fixed') {
      const vp = p.variantPrices ?? {};
      if (Object.keys(vp).length) {
        const all = Object.values(vp)
          .map(v => parseFloat(v)).filter(v => v > 0);
        if (!all.length) return null;
        return { min: Math.min(...all), max: Math.max(...all) };
      }
      const u = parseFloat(p.price ?? p.flatPrice);
      return u > 0 ? { min: u, max: u } : null;
    }
    return null;
  }

  function formatPeso(n) {
    if (n == null) return '—';
    return `₱${Number(n).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  // Design upload
  async function handleDesignUpload(file) {
    if (!file || !token) return;
    if (file.size > 10 * 1024 * 1024) {
      setSubmitError('File too large. Maximum size is 10MB.');
      return;
    }
    setUploadingDesign(true);
    const form = new FormData();
    form.append('design', file);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/order-requests/upload-design`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }, 30000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setDesignUrl(data.url);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setUploadingDesign(false);
    }
  }

  // Submit order request
  async function handleSubmit() {
    if (!token) {
      router.push('/shop/login');
      return;
    }
    if (!product) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/order-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: product.id ?? product._id,
          quantity,
          selectedVariants,
          designUrl: designUrl || null,
          designNotes: designNotes || null,
        }),
      }, 15000);
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.message || 'Submission failed.');
        return;
      }
      setSubmitSuccess(true);
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Computed values
  const totalPrice = product
    ? computePrice(product, quantity, selectedVariants)
    : null;
  const unitPrice = product
    ? getUnitPrice(product, quantity, selectedVariants)
    : null;
  const priceRange = product ? getPriceRange(product) : null;
  const tiers = product ? getTiers(product) : [];

  return (
    <div style={{ padding: '2rem 1rem',
      maxWidth: '1100px', margin: '0 auto' }}>

      {/* Back button */}
      <button
        onClick={() => router.back()}
        style={{
          background: 'none', border: 'none',
          color: 'var(--gray)', cursor: 'pointer',
          display: 'flex', alignItems: 'center',
          gap: '0.375rem', fontSize: '0.875rem',
          marginBottom: '1.5rem', padding: 0,
        }}>
        <svg width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Back to Products
      </button>

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', gap: '2rem',
          flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 400px' }}>
            <div style={{ aspectRatio: '1/1',
              background: 'var(--dark2)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          </div>
          <div style={{ flex: '1 1 360px',
            display: 'flex', flexDirection: 'column',
            gap: '1rem' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                height: i === 0 ? '32px' : '16px',
                background: 'var(--dark2)',
                borderRadius: '6px',
                width: i === 1 ? '60%' : '100%',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{ textAlign: 'center',
          padding: '4rem 2rem',
          color: 'var(--gray)' }}>
          <p style={{ fontSize: '1rem',
            color: '#ef4444', marginBottom: '1rem' }}>
            {error}
          </p>
          <button onClick={() => router.back()}
            style={{ background: 'var(--gold)',
              color: '#000', border: 'none',
              borderRadius: '8px',
              padding: '0.625rem 1.25rem',
              fontWeight: 700, cursor: 'pointer' }}>
            Go Back
          </button>
        </div>
      )}

      {/* SUCCESS STATE */}
      {submitSuccess && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '1rem',
        }}>
          <div style={{
            background: 'var(--dark)',
            border: '1px solid var(--border)',
            borderRadius: '16px', padding: '2.5rem',
            maxWidth: '420px', width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            </div>
            <h2 style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '1.25rem', fontWeight: 700,
              color: 'var(--white)',
              marginBottom: '0.75rem' }}>
              Order Request Submitted!
            </h2>
            <p style={{ color: 'var(--gray)',
              fontSize: '0.9rem',
              marginBottom: '1.5rem',
              lineHeight: 1.6 }}>
              We received your request. Our team will
              review it and confirm the final price
              shortly. Check your Order History for
              updates.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem',
              justifyContent: 'center' }}>
              <button
                onClick={() => router.push(
                  '/shop/profile?tab=orders')}
                style={{
                  background: 'var(--gold)', color: '#000',
                  border: 'none', borderRadius: '8px',
                  padding: '0.625rem 1.25rem',
                  fontWeight: 700, cursor: 'pointer',
                  fontSize: '0.875rem',
                }}>
                View My Orders
              </button>
              <button
                onClick={() => router.back()}
                style={{
                  background: 'var(--dark2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.625rem 1.25rem',
                  color: 'var(--gray)', cursor: 'pointer',
                  fontSize: '0.875rem',
                }}>
                Back to Shop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT DETAIL */}
      {!loading && !error && product && (
        <div style={{ display: 'flex', gap: '2.5rem',
          flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* LEFT — Images */}
          <div style={{ flex: '1 1 400px',
            maxWidth: '520px' }}>

            {/* Main image */}
            <div style={{ position: 'relative',
              aspectRatio: '1/1',
              background: 'var(--dark2)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              marginBottom: '0.75rem' }}>
              {flashSale && (
                <div style={{
                  position: 'absolute',
                  top: '0.75rem', left: '0.75rem',
                  zIndex: 2,
                  background: flashSale.discountType ===
                    'percentage' ? '#ef4444' : 'var(--gold)',
                  color: flashSale.discountType ===
                    'percentage' ? '#fff' : '#000',
                  fontWeight: 800, fontSize: '0.8rem',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '999px',
                }}>
                  {flashSale.discountType === 'percentage'
                    ? `${flashSale.discountValue}% OFF`
                    : `₱${flashSale.discountValue} OFF`}
                </div>
              )}
              {(() => {
                const imgs = [
                  ...(product.thumbnail
                    ? [product.thumbnail] : []),
                  ...(product.images || []),
                ].filter(Boolean);
                const src = imgs[activeImage];
                return src ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={src} alt={product.subCategoryName}
                    style={{ width: '100%', height: '100%',
                      objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--gray)', fontSize: '2rem',
                  }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.3}}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  </div>
                );
              })()}
            </div>

            {/* Thumbnail strip */}
            {(() => {
              const imgs = [
                ...(product.thumbnail
                  ? [product.thumbnail] : []),
                ...(product.images || []),
              ].filter(Boolean);
              return imgs.length > 1 && (
                <div style={{ display: 'flex',
                  gap: '0.5rem', flexWrap: 'wrap' }}>
                  {imgs.map((img, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <button key={i}
                      onClick={() => setActiveImage(i)}
                      style={{
                        width: '60px', height: '60px',
                        borderRadius: '8px',
                        overflow: 'hidden', padding: 0,
                        border: activeImage === i
                          ? '2px solid var(--gold)'
                          : '2px solid var(--border)',
                        cursor: 'pointer', background: 'none',
                        flexShrink: 0,
                      }}>
                      <img src={img} alt=""
                        style={{ width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block' }} />
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* RIGHT — Info + Order Form */}
          <div style={{ flex: '1 1 360px',
            display: 'flex', flexDirection: 'column',
            gap: '1.25rem' }}>

            {/* Category breadcrumb */}
            <div style={{ fontSize: '0.8rem',
              color: 'var(--gray)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em' }}>
              {product.category}
            </div>

            {/* Product name */}
            <h1 style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '1.75rem', fontWeight: 800,
              color: 'var(--white)', margin: 0,
              lineHeight: 1.2 }}>
              {product.subCategoryName
                || product.name || 'Product'}
            </h1>

            {/* Price display */}
            <div>
              {product.priceType === 'inquiry' ? (
                <div style={{ display: 'flex',
                  alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem',
                    color: 'var(--gold)', fontWeight: 700 }}>
                    Price upon inquiry
                  </span>
                </div>
              ) : flashSale?.discountedPrice != null ? (
                <div style={{ display: 'flex',
                  alignItems: 'center', gap: '0.75rem',
                  flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.75rem',
                    fontWeight: 800, color: 'var(--gold)' }}>
                    {formatPeso(flashSale.discountedPrice)}
                  </span>
                  <span style={{ fontSize: '1rem',
                    color: 'var(--gray)',
                    textDecoration: 'line-through' }}>
                    {formatPeso(flashSale.originalPrice)}
                  </span>
                  <span style={{ fontSize: '0.8rem',
                    color: '#4ade80', fontWeight: 700 }}>
                    Flash Sale
                  </span>
                </div>
              ) : totalPrice != null ? (
                <div>
                  <div style={{ fontSize: '1.75rem',
                    fontWeight: 800, color: 'var(--gold)' }}>
                    {formatPeso(totalPrice)}
                  </div>
                  {unitPrice != null && quantity > 1 && (
                    <div style={{ fontSize: '0.82rem',
                      color: 'var(--gray)',
                      marginTop: '0.25rem' }}>
                      {formatPeso(unitPrice)} per item
                    </div>
                  )}
                </div>
              ) : priceRange ? (
                <div style={{ fontSize: '1.5rem',
                  fontWeight: 800, color: 'var(--gold)' }}>
                  {formatPeso(priceRange.min)}
                  {priceRange.max !== priceRange.min
                    && ` – ${formatPeso(priceRange.max)}`}
                  <span style={{ fontSize: '0.8rem',
                    color: 'var(--gray)',
                    fontWeight: 400 }}> per item</span>
                </div>
              ) : null}
            </div>

            {/* Description */}
            {product.description && (
              <p style={{ color: 'var(--gray)',
                fontSize: '0.9rem', lineHeight: 1.6,
                margin: 0 }}>
                {product.description}
              </p>
            )}

            {/* Divider */}
            <div style={{ borderTop:
              '1px solid var(--border)' }} />

            {/* Stock badge */}
            <div>
              {product.stockStatus === 'upon-order' ? (
                <span style={{ fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#60a5fa',
                  background: 'rgba(96,165,250,0.12)',
                  border: '1px solid rgba(96,165,250,0.3)',
                  borderRadius: '999px',
                  padding: '0.25rem 0.75rem' }}>
                  Upon Order
                </span>
              ) : product.stockStatus === 'out-of-stock' ? (
                <span style={{ fontSize: '0.8rem',
                  fontWeight: 700, color: '#ef4444',
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '999px',
                  padding: '0.25rem 0.75rem' }}>
                  Out of Stock
                </span>
              ) : product.stockStatus === 'low-stock' ? (
                <span style={{ fontSize: '0.8rem',
                  fontWeight: 700, color: '#f59e0b',
                  background: 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '999px',
                  padding: '0.25rem 0.75rem' }}>
                  Low Stock — {product.stock} pcs left
                </span>
              ) : (
                <span style={{ fontSize: '0.8rem',
                  fontWeight: 700, color: '#4ade80',
                  background: 'rgba(74,222,128,0.12)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: '999px',
                  padding: '0.25rem 0.75rem' }}>
                  In Stock
                </span>
              )}
            </div>

            {/* Variants */}
            {product.variantGroups?.length > 0 && (
              product.variantGroups.map(group => (
                <div key={group.id}>
                  <div style={{ fontSize: '0.8rem',
                    fontWeight: 600, color: 'var(--gray)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '0.5rem' }}>
                    {group.name}
                  </div>
                  <div style={{ display: 'flex',
                    gap: '0.5rem', flexWrap: 'wrap' }}>
                    {group.options?.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedVariants(
                          prev => ({
                            ...prev,
                            [group.id]: opt.value,
                          })
                        )}
                        style={{
                          padding: '0.4rem 0.875rem',
                          borderRadius: '8px', cursor: 'pointer',
                          fontSize: '0.875rem', fontWeight: 600,
                          border: selectedVariants[group.id]
                            === opt.value
                            ? '2px solid var(--gold)'
                            : '1px solid var(--border)',
                          background: selectedVariants[group.id]
                            === opt.value
                            ? 'rgba(212,168,67,0.12)'
                            : 'var(--dark2)',
                          color: selectedVariants[group.id]
                            === opt.value
                            ? 'var(--gold)'
                            : 'var(--white)',
                          transition: 'all 0.15s',
                        }}>
                        {opt.value}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}

            {/* Tiered pricing table */}
            {product.priceType === 'tiered'
              && tiers.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem',
                  fontWeight: 600, color: 'var(--gray)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '0.625rem' }}>
                  Price Tiers
                </div>
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px', overflow: 'hidden' }}>
                  {tiers.map((tier, i) => {
                    const isActive = (() => {
                      const min = parseInt(tier.minQty) || 0;
                      const max = tier.maxQty !== null
                        && tier.maxQty !== ''
                        ? parseInt(tier.maxQty) : Infinity;
                      return quantity >= min
                        && quantity <= max;
                    })();
                    const prices = tier.prices || {};
                    const unitP = (() => {
                      if (Object.keys(selectedVariants).length
                        && Object.keys(prices).length > 1) {
                        const sorted = Object.fromEntries(
                          Object.entries(selectedVariants)
                            .sort(([a],[b]) =>
                              a.localeCompare(b))
                        );
                        const key = JSON.stringify(sorted);
                        return parseFloat(
                          prices[key]
                          ?? Object.values(prices)[0]
                        ) || null;
                      }
                      return parseFloat(
                        prices['__base__']
                        ?? Object.values(prices)[0]
                      ) || null;
                    })();
                    return (
                      <div key={tier.id} style={{
                        padding: '0.625rem 1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: i < tiers.length - 1
                          ? '1px solid var(--border)' : 'none',
                        background: isActive
                          ? 'rgba(212,168,67,0.08)' : '',
                      }}>
                        <span style={{
                          fontSize: '0.8rem',
                          color: isActive
                            ? 'var(--gold)' : 'var(--gray)',
                          fontWeight: isActive ? 700 : 400,
                        }}>
                          {tier.minQty}–{tier.maxQty || '∞'} pcs
                          {isActive && ' ← your qty'}
                        </span>
                        <span style={{
                          fontSize: '0.875rem', fontWeight: 700,
                          color: isActive
                            ? 'var(--gold)' : 'var(--white)',
                        }}>
                          {unitP
                            ? `${formatPeso(unitP)} / pc`
                            : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity input */}
            <div>
              <div style={{ fontSize: '0.8rem',
                fontWeight: 600, color: 'var(--gray)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem' }}>
                Quantity
              </div>
              <div style={{ display: 'flex',
                alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => setQuantity(
                    q => Math.max(1, q - 1))}
                  style={{
                    width: '36px', height: '36px',
                    borderRadius: '8px', border:
                      '1px solid var(--border)',
                    background: 'var(--dark2)',
                    color: 'var(--white)', cursor: 'pointer',
                    fontSize: '1.25rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                  }}>−</button>
                <input
                  type="number"
                  value={quantity}
                  min={1}
                  onChange={e => setQuantity(
                    Math.max(1,
                      parseInt(e.target.value) || 1))}
                  onKeyDown={e => ['e','E','+','-']
                    .includes(e.key) && e.preventDefault()}
                  style={{
                    width: '64px', textAlign: 'center',
                    padding: '0.5rem',
                    background: 'var(--dark2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--white)',
                    fontSize: '0.95rem', fontWeight: 700,
                  }}
                />
                <button
                  onClick={() => setQuantity(q => q + 1)}
                  style={{
                    width: '36px', height: '36px',
                    borderRadius: '8px', border:
                      '1px solid var(--border)',
                    background: 'var(--dark2)',
                    color: 'var(--white)', cursor: 'pointer',
                    fontSize: '1.25rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                  }}>+</button>
              </div>
            </div>

            {/* Design upload */}
            <div>
              <div style={{ fontSize: '0.8rem',
                fontWeight: 600, color: 'var(--gray)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem' }}>
                Upload Your Design
                <span style={{ color: 'var(--gray)',
                  fontWeight: 400,
                  textTransform: 'none',
                  letterSpacing: 0,
                  fontSize: '0.75rem',
                  marginLeft: '0.4rem' }}>
                  (optional)
                </span>
              </div>

              {designUrl ? (
                <div style={{ display: 'flex',
                  alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(74,222,128,0.08)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: '8px' }}>
                  <svg width="16" height="16"
                    viewBox="0 0 24 24" fill="none"
                    stroke="#4ade80" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  <span style={{ fontSize: '0.85rem',
                    color: '#4ade80', fontWeight: 600 }}>
                    Design uploaded
                  </span>
                  <button
                    onClick={() => setDesignUrl('')}
                    style={{ marginLeft: 'auto',
                      background: 'none', border: 'none',
                      color: 'var(--gray)',
                      cursor: 'pointer',
                      fontSize: '0.8rem' }}>
                    Remove
                  </button>
                </div>
              ) : (
                <label style={{
                  display: 'block',
                  padding: '1rem',
                  border: `2px dashed ${uploadingDesign
                    ? 'var(--gold)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  textAlign: 'center',
                  cursor: uploadingDesign
                    ? 'wait' : 'pointer',
                  color: 'var(--gray)',
                  fontSize: '0.85rem',
                  transition: 'border-color 0.2s',
                }}>
                  {uploadingDesign
                    ? 'Uploading...'
                    : 'Click to upload design file'}
                  <div style={{ fontSize: '0.75rem',
                    marginTop: '0.25rem',
                    color: 'var(--gray)', opacity: 0.7 }}>
                    JPG, PNG, PDF, AI, PSD, SVG (max 10MB)
                  </div>
                  <input type="file" style={{ display: 'none' }}
                    accept=".jpg,.jpeg,.png,.pdf,.ai,.psd,.svg"
                    disabled={uploadingDesign}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleDesignUpload(f);
                    }}
                  />
                </label>
              )}
            </div>

            {/* Design notes */}
            <div>
              <div style={{ fontSize: '0.8rem',
                fontWeight: 600, color: 'var(--gray)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.5rem' }}>
                Notes / Instructions
                <span style={{ color: 'var(--gray)',
                  fontWeight: 400,
                  textTransform: 'none',
                  letterSpacing: 0,
                  fontSize: '0.75rem',
                  marginLeft: '0.4rem' }}>
                  (optional)
                </span>
              </div>
              <textarea
                value={designNotes}
                onChange={e => setDesignNotes(e.target.value)}
                maxLength={1000}
                placeholder="e.g. Print on front only, use white ink..."
                style={{
                  width: '100%', minHeight: '80px',
                  padding: '0.625rem 0.875rem',
                  background: 'var(--dark2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  lineHeight: 1.5,
                }}
              />
            </div>

            {/* Submit error */}
            {submitError && (
              <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px', color: '#ef4444',
                fontSize: '0.85rem',
              }}>
                {submitError}
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={submitting || uploadingDesign
                || product.stockStatus === 'out-of-stock'}
              style={{
                background: submitting
                  ? 'rgba(212,168,67,0.5)'
                  : product.stockStatus === 'out-of-stock'
                  ? 'rgba(107,114,128,0.3)'
                  : 'var(--gold)',
                color: product.stockStatus === 'out-of-stock'
                  ? 'var(--gray)' : '#000',
                border: 'none', borderRadius: '10px',
                padding: '0.875rem 1.5rem',
                fontWeight: 800, fontSize: '1rem',
                cursor: submitting || uploadingDesign
                  || product.stockStatus === 'out-of-stock'
                  ? 'not-allowed' : 'pointer',
                width: '100%',
                fontFamily: "'Outfit', sans-serif",
              }}>
              {submitting
                ? 'Submitting...'
                : product.stockStatus === 'out-of-stock'
                ? 'Out of Stock'
                : token
                ? (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'6px',flexShrink:0}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Place Order</>)
                : (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'6px',flexShrink:0}}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Login to Order</>)}
            </button>

            {/* Guest hint */}
            {!token && (
              <p style={{ textAlign: 'center',
                fontSize: '0.8rem', color: 'var(--gray)',
                margin: 0 }}>
                You need to{' '}
                <button
                  onClick={() => router.push('/shop/login')}
                  style={{ background: 'none', border: 'none',
                    color: 'var(--gold)', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 700,
                    padding: 0 }}>
                  log in
                </button>
                {' '}to submit an order request.
              </p>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
