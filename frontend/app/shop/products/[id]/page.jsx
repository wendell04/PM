'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/context/CartContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { submitOrderRequest, uploadDesignFile } from '@/lib/orderRequestApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'http://127.0.0.1:8000';

export default function ProductDetailPage() {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [flashSale, setFlashSale] = useState(null);

  const params = useParams();
  const router = useRouter();
  const { token, currentUser } = useAuth();
  const { addToCart } = useCart();
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const [addedToCart, setAddedToCart] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // ── Reviews state ─────────────────────────────────
  const [reviews, setReviews]               = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsPage, setReviewsPage]       = useState(1);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(1);
  const [reviewsAvg, setReviewsAvg]         = useState(null);
  const [reviewsTotalCount, setReviewsTotalCount] = useState(0);

  // ── Custom order request modal state ──
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqDesignFile, setReqDesignFile] = useState(null);
  const [reqDesignNotes, setReqDesignNotes] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqSuccess, setReqSuccess] = useState(false);

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

  // Reset review state when product changes
  useEffect(() => {
    setReviews([]);
    setReviewsPage(1);
    setReviewsAvg(null);
    setReviewsTotalCount(0);
    setReviewsTotalPages(1);
  }, [id]);

  // Fetch reviews
  useEffect(() => {
    if (!id) return;
    setReviewsLoading(true);
    fetchWithTimeout(
      `${API_URL}/api/products/${id}/reviews?page=${reviewsPage}&per_page=5`,
      {},
      10000
    ).then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const d = data.data ?? data;
        setReviews(prev => reviewsPage === 1 ? (d.reviews ?? []) : [...prev, ...(d.reviews ?? [])]);
        setReviewsAvg(d.avgRating ?? null);
        setReviewsTotalCount(d.total ?? 0);
        setReviewsTotalPages(d.totalPages ?? 1);
      })
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [id, reviewsPage]);

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

  // Design upload removed — users attach design files at checkout via FormData.
  // Legacy order-request submit removed — flow is cart + checkout.

  // Serialize { [group.id]: value } → "group: value, group: value" or null
  function resolveVariantName(variants) {
    if (!variants || Object.keys(variants).length === 0) return null;
    return Object.entries(variants)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }

  // Add to cart — stays on page
  async function handleAddToCart() {
    if (!token) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }));
      return;
    }
    if (!product) return;
    try {
      await addToCart(
        {
          ...product,
          flatPrice: unitPrice ?? product.flatPrice ?? product.price ?? 0,
        },
        quantity,
        null,
        resolveVariantName(selectedVariants)
      );
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2500);
    } catch (err) {
      console.error('[handleAddToCart]', err);
    }
  }

  // ── Custom order request submit ──────────────────────────────────
  async function handleRequestSubmit() {
    if (!token) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', {
        detail: { type: 'login', returnPath: window.location.pathname },
      }));
      return;
    }
    if (!product) return;
    setReqSubmitting(true);
    setReqError('');
    try {
      let designUrl = null;
      if (reqDesignFile) {
        const uploaded = await uploadDesignFile(token, reqDesignFile);
        designUrl = uploaded.url;
      }
      await submitOrderRequest(token, {
        productId:        product._id ?? product.id,
        quantity,
        selectedVariants,
        designUrl,
        designNotes:      reqDesignNotes.trim() || null,
        isCustom:         true,
      });
      setReqSuccess(true);
    } catch (err) {
      setReqError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setReqSubmitting(false);
    }
  }

  function closeRequestModal() {
    setShowRequestModal(false);
    setReqDesignFile(null);
    setReqDesignNotes('');
    setReqError('');
    setReqSuccess(false);
    setReqSubmitting(false);
  }

  // Add to cart then redirect to checkout
  async function handleAddToCartAndCheckout() {
    if (!token) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }));
      return;
    }
    if (!product) return;
    try {
      const resolvedPrice = unitPrice ?? product.flatPrice ?? product.price ?? 0;
      await addToCart(
        {
          ...product,
          flatPrice: resolvedPrice,
        },
        quantity,
        null,
        resolveVariantName(selectedVariants)
      );
      // Write checkout_payload so checkout page can read it
      const payload = {
        items: [{
          product: {
            _id:            product._id ?? product.id,
            name:           product.subCategoryName || product.name,
            images: [
              ...(product.thumbnail ? [product.thumbnail] : []),
              ...(product.images || []),
            ].filter(Boolean),
            stock:          product.stock ?? null,
            trackInventory: product.trackInventory ?? false,
            stockStatus:    product.stockStatus ?? null,
          },
          variantId:   null,
          variantName: resolveVariantName(selectedVariants),
          qty:         quantity,
          unitPrice:   resolvedPrice,
          designUrl:   null,
        }],
        notes:     '',
        designUrl: null,
      };
      sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
      router.push('/shop/checkout');
    } catch (err) {
      console.error('[handleAddToCartAndCheckout]', err);
    }
  }

  const effectiveMaxQty = product?.trackInventory && product?.stockStatus !== 'upon-order'
    ? Math.max(product.stock ?? 99, 1)
    : 99;

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
    <>
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

      {/* order-request success overlay removed — flow now uses cart + checkout */}

      {/* PRODUCT DETAIL */}
      {!loading && !error && product && (
        <div style={{ display: 'flex', gap: '2.5rem',
          flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* LEFT — Images */}
          <div style={{ flex: '1 1 400px',
            maxWidth: '520px' }}>

            {/* Main image */}
            <div
              onClick={() => {
                const imgs = [
                  ...(product.thumbnail ? [product.thumbnail] : []),
                  ...(product.images || []),
                ].filter(Boolean);
                if (imgs.length > 0) { setLightboxIndex(activeImage); setLightboxOpen(true); }
              }}
              style={{ position: 'relative',
                aspectRatio: '1/1',
                background: 'var(--dark2)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                marginBottom: '0.75rem',
                cursor: 'zoom-in',
              }}>
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
                        position: 'relative',
                        border: activeImage === i
                          ? '2px solid var(--gold)'
                          : '2px solid var(--border)',
                        cursor: 'pointer', background: 'none',
                        flexShrink: 0,
                      }}>
                      <Image src={img} alt=""
                        fill
                        style={{ objectFit: 'cover' }}
                        unoptimized />
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
              ) : unitPrice != null ? (
                <div>
                  <div style={{ fontSize: '1.75rem',
                    fontWeight: 800, color: 'var(--gold)' }}>
                    {formatPeso(unitPrice)}
                  </div>
                  {quantity > 1 && (
                    <div style={{ fontSize: '0.82rem',
                      color: 'var(--gray)',
                      marginTop: '0.25rem' }}>
                      Total: {formatPeso(unitPrice * quantity)}
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
                    fontWeight: 400 }}> / pc</span>
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
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={quantity}
                  onChange={e => {
                    const v = parseInt(e.target.value.replace(/\D/g, '')) || 1;
                    setQuantity(Math.min(Math.max(1, v), effectiveMaxQty));
                  }}
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
                  onClick={() => setQuantity(q => Math.min(q + 1, effectiveMaxQty))}
                  disabled={quantity >= effectiveMaxQty}
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

            {/* Action buttons */}
            {token ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* Add to Cart */}
                <button
                  onClick={handleAddToCart}
                  onMouseEnter={() => setHoveredBtn('cart')}
                  onMouseLeave={() => setHoveredBtn(null)}
                  disabled={product.stockStatus === 'out-of-stock'}
                  style={{
                    background: product.stockStatus === 'out-of-stock'
                      ? 'rgba(107,114,128,0.3)'
                      : addedToCart
                      ? 'rgba(74,222,128,0.2)'
                      : hoveredBtn === 'cart'
                      ? 'rgba(212,168,67,0.25)'
                      : 'rgba(212,168,67,0.15)',
                    color: product.stockStatus === 'out-of-stock'
                      ? 'var(--gray)'
                      : addedToCart
                      ? '#4ade80'
                      : 'var(--gold)',
                    border: product.stockStatus === 'out-of-stock'
                      ? '1px solid rgba(107,114,128,0.3)'
                      : '1px solid var(--gold)',
                    borderRadius: '10px',
                    padding: '0.875rem 1.5rem',
                    fontWeight: 800, fontSize: '1rem',
                    cursor: product.stockStatus === 'out-of-stock'
                      ? 'not-allowed' : 'pointer',
                    width: '100%',
                    fontFamily: "'Outfit', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {product.stockStatus === 'out-of-stock' ? 'Out of Stock' : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        strokeLinejoin="round" style={{ marginRight: '6px', flexShrink: 0 }}>
                        {addedToCart ? (
                          <polyline points="20 6 9 17 4 12"/>
                        ) : (
                          <>
                            <circle cx="9" cy="21" r="1"/>
                            <circle cx="20" cy="21" r="1"/>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                          </>
                        )}
                      </svg>
                      {addedToCart ? 'Added to Cart!' : 'Add to Cart'}
                    </>
                  )}
                </button>

                {/* Proceed to Checkout */}
                <button
                  onClick={handleAddToCartAndCheckout}
                  onMouseEnter={() => setHoveredBtn('checkout')}
                  onMouseLeave={() => setHoveredBtn(null)}
                  disabled={product.stockStatus === 'out-of-stock'}
                  style={{
                    background: product.stockStatus === 'out-of-stock'
                      ? 'rgba(107,114,128,0.3)'
                      : hoveredBtn === 'checkout'
                      ? 'var(--gold-hover, #e6b800)'
                      : 'var(--gold)',
                    color: product.stockStatus === 'out-of-stock'
                      ? 'var(--gray)' : '#000',
                    border: 'none', borderRadius: '10px',
                    padding: '0.875rem 1.5rem',
                    fontWeight: 800, fontSize: '1rem',
                    cursor: product.stockStatus === 'out-of-stock'
                      ? 'not-allowed' : 'pointer',
                    width: '100%',
                    fontFamily: "'Outfit', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {product.stockStatus === 'out-of-stock' ? 'Out of Stock'
                    : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                          strokeLinejoin="round" style={{ marginRight: '6px', flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        Proceed to Checkout
                      </>
                    )}
                </button>

              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }))}
                  style={{
                    background: 'var(--gold)',
                    color: '#000',
                    border: 'none', borderRadius: '10px',
                    padding: '0.875rem 1.5rem',
                    fontWeight: 800, fontSize: '1rem',
                    cursor: 'pointer',
                    width: '100%',
                    fontFamily: "'Outfit', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    strokeLinejoin="round" style={{ marginRight: '6px', flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Login to Order
                </button>
                <p style={{ textAlign: 'center', fontSize: '0.8rem',
                  color: 'var(--gray)', margin: 0 }}>
                  You need to log in to add items to your cart.
                </p>
              </div>
            )}

            <button
              onClick={() => {
                if (!token) {
                  window.dispatchEvent(new CustomEvent('pmp_open_auth', {
                    detail: { type: 'login', returnPath: window.location.pathname },
                  }));
                  return;
                }
                setShowRequestModal(true);
              }}
              style={{
                width: '100%',
                marginTop: '0.75rem',
                padding: '0.75rem 1.5rem',
                background: 'transparent',
                border: '1px solid var(--gold)',
                borderRadius: '8px',
                color: 'var(--gold)',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Request Custom Order
            </button>
          </div>
        </div>
      )}

      {/* ── Customer Reviews ──────────────────────────── */}
      {(reviewsTotalCount > 0 || reviewsLoading) && (
        <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--white)' }}>
              Customer Reviews
            </h2>
            {reviewsAvg !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '2px' }}>
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} width="16" height="16" viewBox="0 0 24 24"
                      fill={s <= Math.round(reviewsAvg) ? 'var(--gold)' : 'none'}
                      stroke="var(--gold)" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  ))}
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold)' }}>
                  {reviewsAvg}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                  ({reviewsTotalCount} {reviewsTotalCount === 1 ? 'review' : 'reviews'})
                </span>
              </div>
            )}
          </div>

          {reviews.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {reviews.map((r, i) => (
                <div key={i} style={{
                  padding: '16px',
                  background: 'var(--dark2)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: 'rgba(212,168,67,0.15)',
                      border: '1px solid rgba(212,168,67,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)',
                      flexShrink: 0,
                    }}>
                      {(r.customerName || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--white)' }}>
                        {r.customerName || 'Customer'}
                      </div>
                      <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
                        {[1,2,3,4,5].map(s => (
                          <svg key={s} width="12" height="12" viewBox="0 0 24 24"
                            fill={s <= r.rating ? 'var(--gold)' : 'none'}
                            stroke="var(--gold)" strokeWidth="1.5"
                            strokeLinecap="round" strokeLinejoin="round"
                          >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                        ))}
                      </div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--gray)' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                    {r.comment}
                  </p>
                </div>
              ))}
            </div>
          )}

          {reviewsLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              {[1,2].map(i => (
                <div key={i} style={{
                  height: '80px', background: 'var(--dark2)', borderRadius: '10px',
                  border: '1px solid var(--border)', animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
          )}

          {!reviewsLoading && reviewsPage < reviewsTotalPages && (
            <button
              onClick={() => setReviewsPage(p => p + 1)}
              style={{
                marginTop: '16px', width: '100%',
                padding: '10px 20px', borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--dark2)',
                color: 'var(--gray)', fontSize: '0.875rem',
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              Load More Reviews
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {showRequestModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={closeRequestModal}
        >
          <div
            style={{
              background: 'var(--dark)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
            }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>
                Request Custom Order
              </h2>
              <button onClick={closeRequestModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: '0.25rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {reqSuccess ? (
              <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'rgba(34,197,94,0.1)',
                  border: '2px solid var(--green)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1rem',
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 style={{ margin: '0 0 0.5rem', color: 'var(--white)', fontSize: '1.1rem' }}>
                  Request Submitted!
                </h3>
                <p style={{ margin: '0 0 1.5rem', color: 'var(--gray)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  Your custom order request has been sent. We&apos;ll review it and get back to you with a final price.
                </p>
                <button
                  onClick={() => { closeRequestModal(); router.push('/shop/orders'); }}
                  style={{
                    background: 'var(--gold)', color: 'var(--black)',
                    border: 'none', borderRadius: '8px',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >
                  Track My Requests
                </button>
              </div>
            ) : (
              <div style={{ padding: '1.5rem' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.875rem 1rem',
                  marginBottom: '1.25rem',
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Summary</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {product?.subCategoryName || product?.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
                    Qty: {quantity}
                    {selectedVariants && Object.keys(selectedVariants).length > 0 && (
                      <span> &bull; {Object.entries(selectedVariants).map(([k,v]) => `${k}: ${v}`).join(', ')}</span>
                    )}
                  </div>
                  {totalPrice != null && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--gold)', marginTop: '0.25rem', fontWeight: 600 }}>
                      Suggested: ₱{Number(totalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.375rem', fontWeight: 600 }}>
                    Design File <span style={{ fontWeight: 400 }}>(optional — jpg, png, pdf, ai, psd, svg · max 10MB)</span>
                  </label>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.ai,.psd,.svg"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) { setReqDesignFile(null); return; }
                      const ALLOWED_TYPES = [
                        'image/jpeg', 'image/png', 'application/pdf',
                        'image/svg+xml', 'image/webp',
                      ];
                      if (f.size > 10 * 1024 * 1024) {
                        setReqError('Design file must be under 10MB.');
                        e.target.value = '';
                        return;
                      }
                      if (!ALLOWED_TYPES.includes(f.type) && !f.name.match(/\.(ai|psd)$/i)) {
                        setReqError('Only JPG, PNG, PDF, AI, PSD, or SVG files are allowed.');
                        e.target.value = '';
                        return;
                      }
                      setReqError('');
                      setReqDesignFile(f);
                    }}
                    style={{
                      width: '100%', padding: '0.625rem 0.875rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--white)',
                      fontSize: '0.85rem', boxSizing: 'border-box',
                    }}
                  />
                  {reqDesignFile && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--gold)', marginTop: '0.25rem' }}>
                      {reqDesignFile.name} ({(reqDesignFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.375rem', fontWeight: 600 }}>
                    Design Notes <span style={{ fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    value={reqDesignNotes}
                    onChange={e => setReqDesignNotes(e.target.value)}
                    placeholder="Describe your design, colors, text, or any special requirements..."
                    maxLength={1000}
                    rows={4}
                    style={{
                      width: '100%', padding: '0.625rem 0.875rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--white)',
                      fontSize: '0.875rem', resize: 'vertical',
                      fontFamily: 'inherit', boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>

                {reqError && (
                  <div style={{
                    marginBottom: '1rem', padding: '0.625rem 0.875rem',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px', color: 'var(--red)', fontSize: '0.85rem',
                  }}>
                    {reqError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={closeRequestModal}
                    disabled={reqSubmitting}
                    style={{
                      flex: 1, padding: '0.75rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--gray)',
                      fontSize: '0.875rem', cursor: reqSubmitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestSubmit}
                    disabled={reqSubmitting}
                    style={{
                      flex: 2, padding: '0.75rem',
                      background: reqSubmitting ? 'rgba(212,168,67,0.4)' : 'var(--gold)',
                      border: 'none', borderRadius: '8px',
                      color: 'var(--black)',
                      fontSize: '0.875rem', fontWeight: 700,
                      cursor: reqSubmitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {reqSubmitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>

    {/* ── Image Lightbox ───────────────────────────────────────────── */}
    {lightboxOpen && (() => {
      const imgs = [
        ...(product?.thumbnail ? [product.thumbnail] : []),
        ...(product?.images || []),
      ].filter(Boolean);
      if (!imgs.length) return null;
      const prev = () => setLightboxIndex(i => (i - 1 + imgs.length) % imgs.length);
      const next = () => setLightboxIndex(i => (i + 1) % imgs.length);
      const handleKey = (e) => {
        if (e.key === 'ArrowLeft') prev();
        if (e.key === 'ArrowRight') next();
        if (e.key === 'Escape') setLightboxOpen(false);
      };
      return (
        <div
          onClick={() => setLightboxOpen(false)}
          onKeyDown={handleKey}
          tabIndex={-1}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'rgba(255,255,255,0.08)', border: 'none',
              borderRadius: '50%', width: '40px', height: '40px',
              color: '#fff', fontSize: '1.2rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>

          {/* Prev */}
          {imgs.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); prev(); }}
              style={{
                position: 'absolute', left: '1rem',
                background: 'rgba(255,255,255,0.08)', border: 'none',
                borderRadius: '50%', width: '44px', height: '44px',
                color: '#fff', fontSize: '1.3rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >‹</button>
          )}

          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgs[lightboxIndex]}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '90vh',
              objectFit: 'contain', borderRadius: '8px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              userSelect: 'none',
            }}
          />

          {/* Next */}
          {imgs.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); next(); }}
              style={{
                position: 'absolute', right: '1rem',
                background: 'rgba(255,255,255,0.08)', border: 'none',
                borderRadius: '50%', width: '44px', height: '44px',
                color: '#fff', fontSize: '1.3rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >›</button>
          )}

          {/* Dot indicators */}
          {imgs.length > 1 && (
            <div style={{
              position: 'absolute', bottom: '1.25rem', left: 0, right: 0,
              display: 'flex', justifyContent: 'center', gap: '6px',
            }}>
              {imgs.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setLightboxIndex(i); }}
                  style={{
                    width: i === lightboxIndex ? '20px' : '8px',
                    height: '8px', borderRadius: '4px',
                    background: i === lightboxIndex ? 'var(--gold)' : 'rgba(255,255,255,0.3)',
                    border: 'none', cursor: 'pointer',
                    transition: 'width 0.2s, background 0.2s', padding: 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      );
    })()}
    </>
  );
}
