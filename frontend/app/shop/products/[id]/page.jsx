'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/context/CartContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { submitOrderRequest, uploadDesignFile } from '@/lib/orderRequestApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'http://127.0.0.1:8000';

function applyFlashDiscount(price, sale) {
  if (!sale || price <= 0) return price;
  if (sale.discountType === 'percentage') return Math.max(0, price * (1 - sale.discountValue / 100));
  if (sale.discountType === 'fixed') return Math.max(0, price - sale.discountValue);
  return price;
}

export default function ProductDetailPage() {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [flashSale, setFlashSale] = useState(null);

  const params = useParams();
  const router = useRouter();
  const { token, currentUser } = useAuth();
  const { addToCart } = useCart();
  const [addedToCart, setAddedToCart] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showTiers, setShowTiers] = useState(false);
  const [showFormats, setShowFormats] = useState(false);
  const [showReviews, setShowReviews] = useState(false);

  // ── Reviews state ─────────────────────────────────
  const [reviews, setReviews]               = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsPage, setReviewsPage]       = useState(1);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(1);
  const [reviewsAvg, setReviewsAvg]         = useState(null);
  const [reviewsTotalCount, setReviewsTotalCount] = useState(0);

  // ── Design modals state ──
  const [showRequestModal, setShowRequestModal] = useState(false);  // legacy / request-design modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [reqDesignFile, setReqDesignFile] = useState(null);
  const [reqFileKey, setReqFileKey] = useState(0);
  const [reqDesignNotes, setReqDesignNotes] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqSuccess, setReqSuccess] = useState(false);
  const [reqType, setReqType] = useState('upload'); // 'upload' | 'request'
  const [customTcAccepted, setCustomTcAccepted] = useState(false);
  const [recommendations, setRecommendations] = useState([]);

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

        const moq = p.minOrderQty || 1;
        setQuantity(moq);
        setQuantityInput(String(moq));

        if (p.variantGroups?.length) {
          const initial = {};
          p.variantGroups.forEach(g => {
            if (g.options?.length) {
              const o = g.options[0];
              initial[g.id] = typeof o === 'string' ? o : (o.value ?? o.label ?? '');
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

  // Recommendations — stale-while-revalidate with shuffle
  useEffect(() => {
    if (!id) return;
    let active = true;
    const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
    const apply = (list) => {
      const pool = list.filter(p => String(p._id || p.id) !== String(id));
      if (active && pool.length) setRecommendations(shuffle(pool).slice(0, 6));
    };
    let hasCache = false;
    try {
      const cached = sessionStorage.getItem('pmp_products_cache');
      if (cached) { apply(JSON.parse(cached)); hasCache = true; }
    } catch {}
    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/products`, {}, 10000);
        if (!res.ok || !active) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        try { sessionStorage.setItem('pmp_products_cache', JSON.stringify(list)); } catch {}
        if (!hasCache && active) apply(list);
      } catch {}
    })();
    return () => { active = false; };
  }, [id]);

  // Helpers
  function getTiers(p) {
    return p?.priceTiers ?? p?.tiers ?? [];
  }

  function getTierForQty(p, qty) {
    const tiers = getTiers(p);
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

  function getPriceFromTier(tier, comboId) {
    const prices = tier?.prices ?? {};
    if (comboId && prices[comboId] !== undefined) return parseFloat(prices[comboId]) || null;
    const vals = Object.values(prices).map(v => parseFloat(v)).filter(v => v > 0);
    return vals.length ? Math.min(...vals) : null;
  }

  function computePrice(p, qty, variants) {
    if (p.priceType === 'tiered') {
      const tier = getTierForQty(p, qty);
      const comboId = resolveCombo(variants)?.id ?? null;
      const unit = getPriceFromTier(tier, comboId);
      return unit != null ? unit * qty : null;
    }
    if (p.priceType === 'fixed') {
      const vp = p.variantPrices ?? {};
      const comboId = resolveCombo(variants)?.id ?? null;
      const unit = (comboId && vp[comboId]) ? parseFloat(vp[comboId]) : parseFloat(p.price ?? p.flatPrice) || null;
      return unit != null ? unit * qty : null;
    }
    return null;
  }

  function getUnitPrice(p, qty, variants) {
    if (p.priceType === 'tiered') {
      const tier = getTierForQty(p, qty);
      const comboId = resolveCombo(variants)?.id ?? null;
      return getPriceFromTier(tier, comboId);
    }
    if (p.priceType === 'fixed') {
      const vp = p.variantPrices ?? {};
      const comboId = resolveCombo(variants)?.id ?? null;
      if (comboId && vp[comboId]) return parseFloat(vp[comboId]) || null;
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

  // Resolve combination from selectedVariants → { id, name, bomId, ... }
  function resolveCombo(variants) {
    if (!product?.combinations?.length) return null;
    // Old format: explicit combo map per combination
    const byCombo = product.combinations.find(c =>
      c.combo && Object.keys(variants).every(k => c.combo[k] === variants[k])
    );
    if (byCombo) return byCombo;
    // New format: match by name
    const vals = Object.values(variants).filter(v => v != null && v !== '' && v !== undefined);
    if (vals.length === 0) return product.combinations[0] ?? null;
    if (vals.length === 1) return product.combinations.find(c => c.name === vals[0]) ?? null;
    const joined = vals.join(' / ');
    return product.combinations.find(c => c.name === joined) ?? null;
  }

  function resolveVariantName(variants) {
    if (!variants || Object.keys(variants).length === 0) return null;
    const combo = resolveCombo(variants);
    if (combo?.label) return combo.label;
    return Object.values(variants).join(', ');
  }

  function resolveCombinationId(variants) {
    return resolveCombo(variants)?.id ?? null;
  }

  // Add to cart — stays on page
  async function handleAddToCart() {
    if (!token) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }));
      return;
    }
    if (!product) return;
    try {
      const comboId = resolveCombinationId(selectedVariants);
      const basePrice = unitPrice ?? product.flatPrice ?? product.price ?? 0;
      const effectivePrice = flashSale
        ? applyFlashDiscount(basePrice, flashSale)
        : basePrice;
      await addToCart(
        { ...product, flatPrice: effectivePrice, thumbnail: variantImage ?? product.thumbnail },
        quantity,
        comboId,
        resolveVariantName(selectedVariants),
        flashSale ? (flashSale.id ?? flashSale._id ?? null) : null,
        null
      );
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2500);
    } catch (err) {
      console.error('[handleAddToCart]', err);
    }
  }

  // ── Design submit (shared by upload + request flows) ──────────────
  async function handleDesignSubmit(type) {
    if (!token) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', {
        detail: { type: 'login', returnPath: window.location.pathname },
      }));
      return;
    }
    if (!product) return;
    if (type === 'upload' && !reqDesignFile) {
      setReqError('Please select a design file to upload.');
      return;
    }
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
        designType:       type,
        designFee:        type === 'request' ? (product.designFee ?? 0) : 0,
      });
      setReqSuccess(true);
    } catch (err) {
      setReqError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setReqSubmitting(false);
    }
  }

  function resetDesignState() {
    setReqDesignFile(null);
    setReqFileKey(k => k + 1);
    setReqDesignNotes('');
    setReqError('');
    setReqSuccess(false);
    setReqSubmitting(false);
  }

  function closeUploadModal() { setShowUploadModal(false); resetDesignState(); }
  function closeRequestModal() { setShowRequestModal(false); resetDesignState(); }


  // Add to cart then redirect to checkout
  async function handleAddToCartAndCheckout() {
    if (!token) {
      window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }));
      return;
    }
    if (!product) return;
    try {
      const basePrice = unitPrice ?? product.flatPrice ?? product.price ?? 0;
      const resolvedPrice = flashSale ? applyFlashDiscount(basePrice, flashSale) : basePrice;
      const comboId = resolveCombinationId(selectedVariants);
      const fsId = flashSale ? (flashSale.id ?? flashSale._id ?? null) : null;
      await addToCart(
        { ...product, flatPrice: resolvedPrice },
        quantity,
        comboId,
        resolveVariantName(selectedVariants),
        fsId,
        null
      );
      const payload = {
        items: [{
          product: {
            _id:                  product._id ?? product.id,
            name:                 product.name || product.subCategoryName,
            images: [
              ...(product.thumbnail ? [product.thumbnail] : []),
              ...(product.images || []),
            ].filter(Boolean),
            stock:                product.stock ?? null,
            trackInventory:       product.trackInventory ?? false,
            stockStatus:          product.stockStatus ?? null,
            minOrderQty:          product.minOrderQty ?? null,
            requiresDownpayment:  product.requiresDownpayment ?? false,
            downpaymentPercent:   product.downpaymentPercent ?? null,
            downpaymentMinQty:    product.downpaymentMinQty ?? null,
          },
          variantId:    comboId,
          variantName:  resolveVariantName(selectedVariants),
          qty:          quantity,
          unitPrice:    resolvedPrice,
          ...(fsId ? { flashSaleId: String(fsId) } : {}),
          designUrl:    null,
          designNotes:  null,
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

  const effectiveMinQty = product?.minOrderQty || 1;

  const effectiveMaxQty = (() => {
    if (!product?.trackInventory || product?.isMadeToOrder || product?.stockStatus === 'upon-order') return 9999;
    const comboId = resolveCombinationId(selectedVariants);
    // Multi-variant BOM: use live per-variant availableQty from server
    if (product?.variantAvailableQty && comboId != null && product.variantAvailableQty[comboId] != null) {
      return Math.max(product.variantAvailableQty[comboId], 0);
    }
    // No combo selected yet but variant stock data exists — use max so product isn't shown as OOS before selection
    if (product?.variantAvailableQty && comboId == null) {
      const vals = Object.values(product.variantAvailableQty).map(v => Number(v) || 0);
      if (vals.length > 0) return Math.max(...vals);
    }
    // Single BOM product
    if (product?.canProduce != null) return Math.max(product.availableQty ?? 0, 0);
    // Variant product (no BOM)
    if (comboId != null && product?.variantBackorder?.[comboId]) return 9999;
    if (comboId != null && product?.variantStock?.[comboId] != null) {
      return Math.max(Number(product.variantStock[comboId]), 0);
    }
    return Math.max(product?.availableQty ?? product?.stock ?? 0, 0);
  })();

  const isOutOfStock = effectiveMaxQty === 0 && !product?.isMadeToOrder;

  // Computed values
  const totalPrice = product
    ? computePrice(product, quantity, selectedVariants)
    : null;
  const unitPrice = product
    ? getUnitPrice(product, quantity, selectedVariants)
    : null;
  const priceRange = product ? getPriceRange(product) : null;
  const tiers = product ? getTiers(product) : [];
  const sortedTiers = [...tiers].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0));

  const activeComboId = product ? resolveCombinationId(selectedVariants) : null;
  const variantImage = (() => {
    if (!activeComboId || !product?.variantImageUrls) return null;
    return product.variantImageUrls[activeComboId]
      ?? product.variantImageUrls[String(activeComboId)]
      ?? null;
  })();
  // Stable image list — order never changes when switching variants
  const displayImages = (() => {
    if (!product) return [];
    const seen = new Set();
    const result = [];
    const add = (url) => { if (url && typeof url === 'string' && !seen.has(url)) { seen.add(url); result.push(url); } };
    add(product.thumbnail);
    (product.images || []).forEach(add);
    Object.values(product.variantImageUrls || {}).forEach(add);
    return result;
  })();

  return (
    <>
    <div style={{ padding: '2rem 1rem',
      maxWidth: '1100px', margin: '0 auto' }}>

      {/* Back button */}
      <button
        onClick={() => router.push('/shop')}
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
        <div style={{
          background: 'var(--dark2)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '1.25rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display: 'flex', gap: '1.75rem',
            flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* LEFT — Images + Pricing below */}
          <div style={{ flex: '1 1 320px', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Image row: thumbnails + main */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {/* Vertical thumbnail strip — max 5, 5th shows +N if more */}
              {displayImages.length > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, width: '64px' }}>
                  {displayImages.slice(0, 5).map((img, i) => {
                    const isOverflowSlot = i === 4 && displayImages.length > 5;
                    const remaining = displayImages.length - 5;
                    const isActive = activeImage === i || (i === 4 && activeImage >= 4);
                    return (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <button key={i} onClick={() => setActiveImage(i)}
                        style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', padding: 0, border: isActive ? '2px solid var(--gold)' : '2px solid var(--border)', cursor: 'pointer', background: 'var(--dark2)', flexShrink: 0, transition: 'border-color 0.15s' }}>
                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        {isOverflowSlot && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>
                            +{remaining}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Main image with carousel arrows */}
              <div style={{ flex: 1, position: 'relative', aspectRatio: '1/1', background: 'var(--dark2)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {/* Prev arrow */}
                {activeImage > 0 && (
                  <button onClick={() => setActiveImage(p => p - 1)}
                    style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 4, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                )}
                {/* Next arrow */}
                {activeImage < displayImages.length - 1 && (
                  <button onClick={() => setActiveImage(p => p + 1)}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 4, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                )}
                {/* Click to open lightbox */}
                <div onClick={() => { if (displayImages.length > 0) { setLightboxIndex(activeImage); setLightboxOpen(true); } }}
                  style={{ position: 'absolute', inset: 0, cursor: 'zoom-in', zIndex: 1 }} />
                {flashSale && (
                  <div style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 3, background: flashSale.discountType === 'percentage' ? '#ef4444' : 'var(--gold)', color: flashSale.discountType === 'percentage' ? '#fff' : '#000', fontWeight: 800, fontSize: '0.8rem', padding: '0.3rem 0.75rem', borderRadius: '999px' }}>
                    {flashSale.discountType === 'percentage' ? `${flashSale.discountValue}% OFF` : `₱${flashSale.discountValue} OFF`}
                  </div>
                )}
                {product.isCustom && (
                  <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 3, background: '#D4A843', color: '#000', fontSize: '0.65rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Customizable
                  </div>
                )}
                {displayImages[activeImage] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={displayImages[activeImage]} alt={product.subCategoryName} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', zIndex: 0 }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', zIndex: 0 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing — Trove style: header with borderBottom, table in own container */}
            {product.priceType === 'tiered' && tiers.length > 0 && (
              <div>
                <button
                  onClick={() => setShowTiers(p => !p)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', padding: '0 0 0.75rem 0', color: 'var(--white)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Pricing</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    {showTiers
                      ? <line x1="5" y1="12" x2="19" y2="12"/>
                      : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                  </svg>
                </button>
                {showTiers && (
                  <>
                    <p style={{ margin: '0.6rem 0 0.75rem', fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.55 }}>
                      Price per piece depends on how many you order. The more you buy, the lower the unit price. If your quantity exceeds the last tier, the last tier price still applies.
                    </p>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.025)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        <span>Quantity</span>
                        <span style={{ textAlign: 'right' }}>Unit Price</span>
                      </div>
                      {sortedTiers.map((tier, i) => {
                        const isLastTier = i === sortedTiers.length - 1;
                        const isActive = (() => {
                          const min = parseInt(tier.minQty) || 0;
                          if (isLastTier) return quantity >= min;
                          const max = tier.maxQty !== null && tier.maxQty !== '' ? parseInt(tier.maxQty) : Infinity;
                          return quantity >= min && quantity <= max;
                        })();
                        const unitP = getPriceFromTier(tier, resolveCombinationId(selectedVariants));
                        return (
                          <div key={tier.id ?? i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0.625rem 1rem', borderTop: '1px solid var(--border)', background: isActive ? 'rgba(212,168,67,0.07)' : '' }}>
                            <span style={{ fontSize: '0.825rem', color: isActive ? 'var(--gold)' : 'var(--white)', fontWeight: isActive ? 700 : 500, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {`${tier.minQty}${tier.maxQty ? `–${tier.maxQty}` : '+'} pcs`}
                              {isActive && <span style={{ fontSize: '0.58rem', background: 'rgba(212,168,67,0.18)', color: 'var(--gold)', padding: '1px 6px', borderRadius: '999px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your qty</span>}
                            </span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: isActive ? 'var(--gold)' : 'var(--white)', textAlign: 'right' }}>
                              {unitP ? `${formatPeso(unitP)} / pc` : '—'}
                            </span>
                          </div>
                        );
                      })}
                      {(() => {
                        const lastTier = sortedTiers[sortedTiers.length - 1];
                        const lastUnitP = lastTier ? getPriceFromTier(lastTier, resolveCombinationId(selectedVariants)) : null;
                        if (!lastUnitP) return null;
                        const overflowThreshold = lastTier.maxQty ? parseInt(lastTier.maxQty) : parseInt(lastTier.minQty);
                        return (
                          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--gray)', fontStyle: 'italic' }}>
                            Any qty above {overflowThreshold} gets the same price of {formatPeso(lastUnitP)} / pc.
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Reviews accordion */}
            <div>
              <button
                onClick={() => setShowReviews(p => !p)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', padding: '0 0 0.75rem 0', color: 'var(--white)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Reviews</span>
                  {reviewsTotalCount > 0 && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#000', background: 'var(--gold)', padding: '1px 7px', borderRadius: '999px' }}>
                      {reviewsTotalCount}
                    </span>
                  )}
                </div>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  {showReviews
                    ? <line x1="5" y1="12" x2="19" y2="12"/>
                    : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                </svg>
              </button>
              {showReviews && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {reviewsAvg !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ display: 'flex', gap: '2px' }}>
                        {[1,2,3,4,5].map(s => (
                          <svg key={s} width="14" height="14" viewBox="0 0 24 24"
                            fill={s <= Math.round(reviewsAvg) ? 'var(--gold)' : 'none'}
                            stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                        ))}
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--gold)' }}>{reviewsAvg}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>({reviewsTotalCount} {reviewsTotalCount === 1 ? 'review' : 'reviews'})</span>
                    </div>
                  )}
                  {reviews.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {reviews.map((r, i) => (
                        <div key={i} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>
                              {(r.customerName || 'C').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--white)' }}>{r.customerName || 'Customer'}</div>
                              <div style={{ display: 'flex', gap: '2px', marginTop: '1px' }}>
                                {[1,2,3,4,5].map(s => (
                                  <svg key={s} width="10" height="10" viewBox="0 0 24 24"
                                    fill={s <= r.rating ? 'var(--gold)' : 'none'}
                                    stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                  </svg>
                                ))}
                              </div>
                            </div>
                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--gray)' }}>
                              {r.created_at ? new Date(r.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--gray)', lineHeight: 1.55 }}>{r.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {reviewsLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[1,2].map(i => (
                        <div key={i} style={{ height: '70px', background: 'var(--dark2)', borderRadius: '10px', border: '1px solid var(--border)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      ))}
                    </div>
                  )}
                  {!reviewsLoading && reviews.length === 0 && reviewsTotalCount === 0 && (
                    <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--gray)' }}>No reviews yet.</p>
                  )}
                  {!reviewsLoading && reviewsPage < reviewsTotalPages && (
                    <button
                      onClick={() => setReviewsPage(p => p + 1)}
                      style={{ width: '100%', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark2)', color: 'var(--gray)', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Load More Reviews
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Info + Order Form */}
          <div style={{ flex: '1 1 360px',
            display: 'flex', flexDirection: 'column',
            gap: '1.25rem' }}>

            {/* Category breadcrumb + reviews */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {product.category}
              </div>
              {reviewsAvg !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} width="13" height="13" viewBox="0 0 24 24"
                      fill={s <= Math.round(reviewsAvg) ? 'var(--gold)' : 'none'}
                      stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  ))}
                  <span style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 700, marginLeft: '2px' }}>{reviewsAvg}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>({reviewsTotalCount})</span>
                </div>
              )}
            </div>

            {/* Product name */}
            <h1 style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '1.75rem', fontWeight: 800,
              color: 'var(--white)', margin: 0,
              lineHeight: 1.2 }}>
              {product.name || product.subCategoryName || 'Product'}
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
              ) : flashSale != null && unitPrice != null ? (
                <div style={{ display: 'flex',
                  alignItems: 'center', gap: '0.75rem',
                  flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.75rem',
                    fontWeight: 800, color: 'var(--gold)' }}>
                    {formatPeso(applyFlashDiscount(unitPrice, flashSale))}
                  </span>
                  <span style={{ fontSize: '1rem',
                    color: 'var(--gray)',
                    textDecoration: 'line-through' }}>
                    {formatPeso(unitPrice)}
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
                    {product.priceType === 'tiered' && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)', fontWeight: 400 }}> / pc</span>
                    )}
                  </div>
                  {quantity > 1 && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                      Total: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{formatPeso(unitPrice * quantity)}</span>
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

            {/* Stock badge — hidden for Made to Order */}
            {!product.isMadeToOrder && (() => {
              const LOW = 10;
              const comboId = resolveCombinationId(selectedVariants);
              const variantQty = comboId != null && product?.variantAvailableQty?.[comboId] != null
                ? Number(product.variantAvailableQty[comboId])
                : null;
              const displayQty = variantQty ?? product.availableQty ?? null;

              const BADGE_GOLD = { color: '#b8922f', background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.35)' };

              if (product.stockStatus === 'upon-order') {
                return (
                  <div style={{ display: 'flex' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, ...BADGE_GOLD, borderRadius: '999px', padding: '0.25rem 0.75rem' }}>
                      Upon Order
                    </span>
                  </div>
                );
              }
              if (isOutOfStock) {
                return (
                  <div style={{ display: 'flex' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '999px', padding: '0.25rem 0.75rem' }}>
                      Out of Stock
                    </span>
                  </div>
                );
              }
              if (displayQty != null && displayQty > 0 && displayQty <= LOW) {
                return (
                  <div>
                    <div style={{ display: 'flex' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, ...BADGE_GOLD, borderRadius: '999px', padding: '0.25rem 0.75rem' }}>
                        Only {displayQty} left!
                      </span>
                    </div>
                    <div style={{ marginTop: '0.5rem', height: '4px', background: 'rgba(212,168,67,0.15)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (displayQty / LOW) * 100)}%`, background: '#d4a843', borderRadius: '2px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              }
              return (
                <div style={{ display: 'flex' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, ...BADGE_GOLD, borderRadius: '999px', padding: '0.25rem 0.75rem' }}>
                    {displayQty != null && displayQty > 0 ? `${displayQty} units available` : 'In Stock'}
                  </span>
                </div>
              );
            })()}


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
                    {group.options?.map((opt, oi) => {
                      const optVal = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? String(opt));
                      const optKey = typeof opt === 'string' ? opt : (opt.id ?? oi);
                      const isSelected = selectedVariants[group.id] === optVal;
                      return (
                        <button
                          key={optKey}
                          onClick={() => {
                            setSelectedVariants(prev => ({ ...prev, [group.id]: optVal }));
                            const combo = product?.combinations?.find(c => c.name === optVal);
                            const varImg = combo?.id ? (product?.variantImageUrls ?? {})[combo.id] : null;
                            const idx = varImg ? displayImages.indexOf(varImg) : -1;
                            setActiveImage(idx >= 0 ? idx : 0);
                          }}
                          style={{
                            padding: '0.4rem 0.875rem',
                            borderRadius: '8px', cursor: 'pointer',
                            fontSize: '0.875rem', fontWeight: 600,
                            border: isSelected ? '2px solid var(--gold)' : '1px solid var(--border)',
                            background: isSelected ? 'var(--gold)' : 'var(--dark2)',
                            color: isSelected ? '#000' : 'var(--white)',
                            transition: 'all 0.15s',
                          }}>
                          {optVal}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}


            {/* Quantity input — hidden when out of stock */}
            {!isOutOfStock && <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Quantity
                </div>
                {effectiveMinQty > 1 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 600 }}>
                    Min. {effectiveMinQty} pcs
                  </span>
                )}
              </div>
              <div style={{ display: 'flex',
                alignItems: 'center', gap: '0.5rem' }}>
                <button
                  disabled={quantity <= effectiveMinQty}
                  onClick={() => {
                    const next = Math.max(effectiveMinQty, quantity - 1);
                    setQuantity(next);
                    setQuantityInput(String(next));
                  }}
                  style={{
                    width: '36px', height: '36px',
                    borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'var(--dark2)',
                    color: quantity <= effectiveMinQty ? 'var(--gray)' : 'var(--white)',
                    cursor: quantity <= effectiveMinQty ? 'not-allowed' : 'pointer',
                    opacity: quantity <= effectiveMinQty ? 0.4 : 1,
                    fontSize: '1.25rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                  }}>−</button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={quantityInput}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setQuantityInput(raw);
                    if (raw === '') return;
                    const v = parseInt(raw, 10);
                    if (!isNaN(v) && v >= effectiveMinQty) {
                      const clamped = Math.min(v, effectiveMaxQty);
                      setQuantity(clamped);
                      if (String(clamped) !== raw) setQuantityInput(String(clamped));
                    }
                  }}
                  onBlur={() => {
                    const v = parseInt(quantityInput, 10);
                    const clamped = isNaN(v) || v < effectiveMinQty ? effectiveMinQty : Math.min(v, effectiveMaxQty);
                    setQuantity(clamped);
                    setQuantityInput(String(clamped));
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
                  onClick={() => {
                    const next = Math.min(quantity + 1, effectiveMaxQty);
                    setQuantity(next);
                    setQuantityInput(String(next));
                  }}
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
            </div>}

            {/* Design format download — filtered to selected variant */}
            {product.isCustom && product.designFormats?.length > 0 && (() => {
              const formats = product.designFormats.filter(fmt =>
                fmt.bomId == null || String(fmt.bomId) === String(activeComboId)
              );
              if (!formats.length) return null;
              return (
                <div style={{ background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                    Design Template{formats.length > 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {formats.map((fmt, i) => {
                      const ext = (fmt.ext || fmt.name?.split('.').pop() || '').toUpperCase();
                      const extColors = { AI: '#f97316', PSD: '#3b82f6', PDF: '#ef4444', SVG: '#22c55e', PNG: '#a855f7', JPG: '#60a5fa', JPEG: '#60a5fa' };
                      const extColor = extColors[ext] || '#9ca3af';
                      return (
                        <div key={fmt.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#000', background: extColor, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', flexShrink: 0 }}>
                            {ext || 'FILE'}
                          </span>
                          <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fmt.name}
                          </span>
                          <a href={fmt.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            {token ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {product.isCustom ? (
                  /* Custom product — goes to order form, not cart */
                  <>
                    <button
                      onClick={() => !isOutOfStock && router.push(`/shop/products/${id}/order`)}
                      disabled={isOutOfStock}
                      style={{
                        background: isOutOfStock ? 'rgba(107,114,128,0.3)' : 'var(--gold)',
                        color: isOutOfStock ? 'var(--gray)' : '#000',
                        border: 'none', borderRadius: '10px', padding: '0.875rem 1.5rem',
                        fontWeight: 800, fontSize: '1rem',
                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                        width: '100%', fontFamily: "'Outfit', sans-serif",
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}>
                      {isOutOfStock ? 'Out of Stock' : 'Place Custom Order'}
                    </button>
                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--gray)', margin: 0, lineHeight: 1.5 }}>
                      Custom orders are fulfilled separately. You&apos;ll upload or request a design on the next step.
                    </p>
                  </>
                ) : (
                  /* Regular product — Add to Cart + Checkout */
                  <>
                    <button
                      onClick={handleAddToCart}
                      disabled={isOutOfStock}
                      style={{
                        background: isOutOfStock
                          ? 'rgba(107,114,128,0.3)'
                          : addedToCart ? 'rgba(74,222,128,0.85)' : 'var(--gold)',
                        color: isOutOfStock ? 'var(--gray)' : addedToCart ? '#fff' : '#000',
                        border: 'none',
                        borderRadius: '10px', padding: '0.875rem 1.5rem',
                        fontWeight: 800, fontSize: '1rem',
                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                        width: '100%', fontFamily: "'Outfit', sans-serif",
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        transition: 'opacity 0.15s',
                      }}>
                      {isOutOfStock ? 'Out of Stock' : addedToCart ? 'Added to Cart!' : 'Add to Cart'}
                    </button>
                    <button
                      onClick={handleAddToCartAndCheckout}
                      disabled={isOutOfStock}
                      style={{
                        background: isOutOfStock ? 'rgba(107,114,128,0.3)' : 'var(--gold)',
                        color: isOutOfStock ? 'var(--gray)' : '#000',
                        border: 'none', borderRadius: '10px', padding: '0.875rem 1.5rem',
                        fontWeight: 800, fontSize: '1rem',
                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                        width: '100%', fontFamily: "'Outfit', sans-serif",
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        opacity: 0.85,
                      }}>
                      {isOutOfStock ? 'Out of Stock' : 'Checkout'}
                    </button>
                  </>
                )}

              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login', returnPath: window.location.pathname } }))}
                  style={{
                    background: 'var(--gold)', color: '#000',
                    border: 'none', borderRadius: '10px', padding: '0.875rem 1.5rem',
                    fontWeight: 800, fontSize: '1rem', cursor: 'pointer',
                    width: '100%', fontFamily: "'Outfit', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Login to Order
                </button>
                <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--gray)', margin: 0 }}>
                  You need to log in to place an order.
                </p>
              </div>
            )}
          </div>
          </div>

        </div>
      )}

      {/* ── Design Formats ────────────────────────────── */}
      {product?.isCustom && product?.designFormats?.length > 0 && (
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowFormats(p => !p)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', padding: '0 0 0.75rem 0', color: 'var(--white)', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Design Formats</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#000', background: 'var(--gold)', padding: '1px 7px', borderRadius: '999px' }}>
                {product.designFormats.length}
              </span>
            </div>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
              {showFormats
                ? <line x1="5" y1="12" x2="19" y2="12"/>
                : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
            </svg>
          </button>
          {showFormats && (
            <>
              <p style={{ margin: '0.6rem 0 0.875rem', fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.55 }}>
                Download the template files below before uploading your design. Use these as a guide for sizing, bleed areas, and placement.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {product.designFormats.map((fmt, i) => {
                  const ext = (fmt.ext || fmt.name?.split('.').pop() || '').toLowerCase();
                  const extColor = { ai: '#f97316', psd: '#3b82f6', pdf: '#ef4444', svg: '#22c55e', png: '#a855f7', jpg: '#60a5fa', jpeg: '#60a5fa' }[ext] || '#9ca3af';
                  const matchedCombo = fmt.bomId == null ? null : product.combinations?.find(c => String(c.id) === String(fmt.bomId));
                  const variantLabel = matchedCombo
                    ? (matchedCombo.name || matchedCombo.label || Object.values(matchedCombo.combo || {}).join(' / ') || null)
                    : null;
                  return (
                    <div key={fmt.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#000', background: extColor, padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', flexShrink: 0, letterSpacing: '0.04em' }}>
                        {ext.toUpperCase() || 'FILE'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fmt.name}
                        </div>
                        {variantLabel && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '2px' }}>{variantLabel}</div>
                        )}
                      </div>
                      <a
                        href={fmt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download
                      </a>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Recommendations ───────────────────────────── */}
      {recommendations.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray)', margin: '0 0 1rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            You may also like
          </h2>
          <div className="rec-grid">
            {recommendations.map(rec => {
              const recId = rec._id || rec.id;
              const mode = rec.priceType || rec.pricingMode || 'fixed';
              const recPrice = (() => {
                if (mode === 'inquiry') return 'Price on request';
                const tiers = rec.priceTiers ?? rec.tiers ?? [];
                if (mode === 'tiered' && tiers.length) {
                  const all = tiers.flatMap(t => t.price != null ? [parseFloat(t.price)] : Object.values(t.prices||{}).map(Number)).filter(v => v > 0);
                  if (!all.length) return 'Price on request';
                  const [mn, mx] = [Math.min(...all), Math.max(...all)];
                  return mn === mx ? formatPeso(mn) : `${formatPeso(mn)} – ${formatPeso(mx)}`;
                }
                const vp = Object.values(rec.variantPrices||{}).map(Number).filter(v => v > 0);
                if (vp.length) { const [mn, mx] = [Math.min(...vp), Math.max(...vp)]; return mn === mx ? formatPeso(mn) : `${formatPeso(mn)} – ${formatPeso(mx)}`; }
                const price = parseFloat(rec.flatPrice || rec.price);
                return price > 0 ? formatPeso(price) : 'Price on request';
              })();
              return (
                <a key={recId} href={`/shop/products/${recId}`} className="rec-card">
                  <div className="rec-img">
                    {rec.thumbnail || rec.images?.[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={rec.thumbnail || rec.images[0]} alt={rec.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '8px 8px 10px' }}>
                    <div className="rec-name">
                      {rec.name || rec.subCategoryName || 'Product'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 600 }}>
                      {recPrice}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .rec-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px;
        }
        .rec-card {
          text-decoration: none;
          display: block;
          border-radius: 12px;
          background: var(--dark2);
          border: 1px solid var(--border);
          overflow: hidden;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .rec-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          border-color: rgba(212,168,67,0.35);
        }
        .rec-img {
          aspect-ratio: 1/1;
          overflow: hidden;
          background: var(--dark2);
        }
        .rec-img img { transition: transform 0.22s ease; }
        .rec-card:hover .rec-img img { transform: scale(1.04); }
        .rec-name {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--white);
          margin-bottom: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          min-height: 2.4em;
          line-height: 1.2;
        }
        @media (max-width: 900px) {
          .rec-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 540px) {
          .rec-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* ── Upload Design Modal ─────────────────────────────────────────── */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={closeUploadModal}>
          <div style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '16px', maxWidth: '460px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>Upload Your Design</h2>
              <button onClick={closeUploadModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: '0.25rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {reqSuccess ? (
              <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h3 style={{ margin: '0 0 0.5rem', color: 'var(--white)', fontSize: '1.1rem' }}>Design Uploaded!</h3>
                <p style={{ margin: '0 0 1.5rem', color: 'var(--gray)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  Your design file has been sent to us. We&apos;ll review it and reach out via chat if we need any clarifications.
                </p>
                <button onClick={() => { closeUploadModal(); router.push('/shop/orders-history'); }}
                  style={{ background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', padding: '0.75rem 1.5rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                  Track My Orders
                </button>
              </div>
            ) : (
              <div style={{ padding: '1.5rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Summary</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>{product?.subCategoryName || product?.name} &bull; Qty {quantity}</div>
                  {totalPrice != null && <div style={{ fontSize: '0.85rem', color: 'var(--gold)', marginTop: '0.2rem', fontWeight: 600 }}>₱{Number(totalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>}
                </div>
                <div style={{ background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'rgba(147,197,253,0.9)', lineHeight: 1.5 }}>
                  No design fee — your file goes directly to our team. We&apos;ll print it as-is and message you if there are any issues.
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.375rem', fontWeight: 600 }}>
                    Design File <span style={{ color: '#ef4444' }}>*</span> <span style={{ fontWeight: 400 }}>(jpg, png, pdf, svg · max 10MB)</span>
                  </label>
                  <input key={reqFileKey} type="file" accept=".jpg,.jpeg,.png,.pdf,.svg,.ai,.psd"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) { setReqDesignFile(null); return; }
                      if (f.size > 10 * 1024 * 1024) { setReqError('File must be under 10MB.'); e.target.value = ''; return; }
                      setReqError(''); setReqDesignFile(f);
                    }}
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.85rem', cursor: 'pointer' }} />
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.375rem', fontWeight: 600 }}>Notes <span style={{ fontWeight: 400 }}>(optional)</span></label>
                  <textarea value={reqDesignNotes} onChange={e => setReqDesignNotes(e.target.value)} rows={3} maxLength={500}
                    placeholder="Colors, placement, size notes..."
                    style={{ width: '100%', padding: '0.625rem 0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.85rem', resize: 'vertical', fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box' }} />
                </div>
                {reqError && <div style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{reqError}</div>}
                <button onClick={() => handleDesignSubmit('upload')} disabled={reqSubmitting || !reqDesignFile}
                  style={{ width: '100%', background: reqSubmitting || !reqDesignFile ? 'rgba(255,255,255,0.08)' : 'var(--gold)', color: reqSubmitting || !reqDesignFile ? 'var(--gray)' : '#000', border: 'none', borderRadius: '10px', padding: '0.875rem', fontWeight: 800, fontSize: '0.95rem', cursor: reqSubmitting || !reqDesignFile ? 'not-allowed' : 'pointer', fontFamily: "'Outfit', sans-serif" }}>
                  {reqSubmitting ? 'Uploading…' : 'Submit Design'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Request Design Modal ─────────────────────────────────────────── */}
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
                  onClick={() => { closeRequestModal(); router.push('/shop/orders-history'); }}
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
                      <span> &bull; {resolveVariantName(selectedVariants)}</span>
                    )}
                  </div>
                  {totalPrice != null && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--gold)', marginTop: '0.25rem', fontWeight: 600 }}>
                      Suggested: ₱{Number(totalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>

                {/* Design fee callout */}
                <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.78rem', color: '#D4A843', fontWeight: 700, marginBottom: '0.2rem' }}>Design Service Fee: ₱{designRequestFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(212,168,67,0.75)', lineHeight: 1.5 }}>
                    Our team will create a design for you. We&apos;ll send a proof via chat — you approve before anything gets printed.
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.375rem', fontWeight: 600 }}>
                    Reference / Inspiration <span style={{ fontWeight: 400 }}>(optional — jpg, png, pdf · max 10MB)</span>
                  </label>
                  <input
                    key={reqFileKey}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gold)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {reqDesignFile.name} ({(reqDesignFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                      <button
                        type="button"
                        onClick={() => { setReqDesignFile(null); setReqFileKey(k => k + 1); }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--gray)', fontSize: '1rem', lineHeight: 1,
                          padding: '0 0.25rem', flexShrink: 0,
                        }}
                        title="Remove file"
                      >×</button>
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
                    onClick={() => handleDesignSubmit('request')}
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
                    {reqSubmitting ? 'Submitting…' : `Request Design (+₱${designRequestFee})`}
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
      const imgs = displayImages;
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
            position: 'fixed', inset: 0, zIndex: 9999,
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
