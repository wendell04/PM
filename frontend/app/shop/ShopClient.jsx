'use client';
import { optionGroupsOf, selectedOptionList, optionsUnitAdd, optionsOrderAdd, withOptionSuffix, unansweredOptionGroups, optionKey, groupKey } from '@/lib/shopUtils';
import NoImage from '@/components/NoImage';
import { PLAIN_OR_CUSTOM_ENABLED } from '@/lib/featureFlags';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from './layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { getStorefrontBanners } from '@/lib/bannerUtils';
import './shop.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const toSlug = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ─── Price Helper ─────────────────────────────────────────────────────────────
function getDisplayPrice(product) {
  const fmt = (n) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const mode = product.priceType || product.pricingMode || 'fixed';
  const tiers = product.priceTiers || product.tiers;
  if (mode === 'inquiry') return 'Price on request';
  if (mode === 'fixed') {
    if (product.variantPrices && Object.keys(product.variantPrices).length > 0) {
      const prices = Object.values(product.variantPrices).map(p => parseFloat(p)).filter(p => p > 0);
      if (!prices.length) return 'Price on request';
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
    }
    const p = parseFloat(product.flatPrice || product.price);
    if (p > 0) return fmt(p);
    return 'Price on request';
  }
  if (mode === 'tiered' && tiers?.length) {
    const allPrices = tiers.flatMap(t =>
      Object.values(t.prices || {}).map(p => parseFloat(p)).filter(p => p > 0)
    );
    if (!allPrices.length) return 'Price on request';
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  }
  const fallback = parseFloat(product.flatPrice || product.price);
  if (fallback > 0) return fmt(fallback);
  return 'Price on request';
}

// ─── Quick View Modal ─────────────────────────────────────────────────────────
function QuickViewModal({ product, flashSale, onClose, onToast }) {
  const moq = product.minOrderQty || 1;
  const [selOpts, setSelOpts] = useState({});
  const [selVars, setSelVars] = useState(() => {
    const init = {};
    (product.variantGroups || []).forEach(g => {
      if (g.options?.length) {
        const o = g.options[0];
        init[g.id] = typeof o === 'string' ? o : (o.value ?? o.label ?? '');
      }
    });
    return init;
  });
  const [qty, setQty] = useState(moq);
  const [qtyInput, setQtyInput] = useState(String(moq));
  const [thumbIdx, setThumbIdx] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [reviewsAvg, setReviewsAvg] = useState(null);
  const [reviewsTotalCount, setReviewsTotalCount] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const { addToCart } = useCart();
  const router = useRouter();

  const images = (() => {
    const seen = new Set(); const out = [];
    const add = u => { if (u && !seen.has(u)) { seen.add(u); out.push(u); } };
    add(product.thumbnail);
    (product.images || []).forEach(add);
    Object.values(product.variantImageUrls || {}).forEach(add);
    return out;
  })();

  const resolveCombo = (vars) => {
    if (!product.combinations?.length) return null;
    const byCombo = product.combinations.find(c =>
      c.combo && Object.keys(vars).every(k => c.combo[k] === vars[k])
    );
    if (byCombo) return byCombo;
    const vals = Object.values(vars).filter(v => v != null && v !== '');
    if (!vals.length) return product.combinations[0] ?? null;
    if (vals.length === 1) return product.combinations.find(c => c.name === vals[0]) ?? null;
    return product.combinations.find(c => c.name === vals.join(' / ')) ?? null;
  };

  const getTiers = () => product.priceTiers ?? product.tiers ?? [];
  const getTierForQty = (q) => {
    const tiers = getTiers(); if (!tiers.length) return null;
    const sorted = [...tiers].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0));
    let match = sorted[sorted.length - 1];
    for (const t of sorted) {
      const min = parseInt(t.minQty) || 0;
      const max = t.maxQty != null && t.maxQty !== '' ? parseInt(t.maxQty) : Infinity;
      if (q >= min && q <= max) { match = t; break; }
    }
    return match;
  };

  const fmt = n => n == null ? '—' : `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const mode = product.priceType || product.pricingMode || 'fixed';
  // Nothing preselected here either, and the quick view refuses to add until the choice is made -
  // otherwise the one door that skipped the question would be the fastest door in the shop.
  const optGroups    = optionGroupsOf(product);
  const optUnitAdd   = optionsUnitAdd(product, selOpts);
  const optOrderAdd  = optionsOrderAdd(product, selOpts);
  const chosenOpts   = selectedOptionList(product, selOpts);
  const optsPending  = unansweredOptionGroups(product, selOpts).length > 0;
  const optsPrompt   = optsPending
    ? `Choose ${unansweredOptionGroups(product, selOpts).map(g => g.name).join(' and ')}`
    : null;

  const combo = resolveCombo(selVars);
  const comboId = combo?.id ?? null;

  const unitPrice = (() => {
    if (mode === 'tiered') {
      const tier = getTierForQty(qty);
      if (!tier) return null;
      // Old format: tier.price is a single flat value
      if (tier.price != null) return parseFloat(tier.price) || null;
      const prices = tier.prices ?? {};
      if (comboId && prices[comboId] != null) return parseFloat(prices[comboId]) || null;
      const vals = Object.values(prices).map(v => parseFloat(v)).filter(v => v > 0);
      return vals.length ? Math.min(...vals) : null;
    }
    if (mode === 'fixed') {
      const vp = product.variantPrices ?? {};
      if (comboId && vp[comboId]) return parseFloat(vp[comboId]) || null;
      return parseFloat(product.flatPrice || product.price) || null;
    }
    return null;
  })();

  const priceRange = (() => {
    const tiers = getTiers();
    if (mode === 'tiered' && tiers.length) {
      const all = tiers.flatMap(t => {
        if (t.price != null) return [parseFloat(t.price)].filter(v => v > 0);
        return Object.values(t.prices || {}).map(v => parseFloat(v)).filter(v => v > 0);
      });
      if (!all.length) return null;
      return { min: Math.min(...all), max: Math.max(...all) };
    }
    if (mode === 'fixed') {
      const vp = product.variantPrices ?? {};
      if (Object.keys(vp).length) {
        const all = Object.values(vp).map(v => parseFloat(v)).filter(v => v > 0);
        if (!all.length) return null;
        return { min: Math.min(...all), max: Math.max(...all) };
      }
      const u = parseFloat(product.flatPrice || product.price);
      return u > 0 ? { min: u, max: u } : null;
    }
    return null;
  })();

  const effectiveUnit = flashSale && unitPrice ? Math.max(0,
    flashSale.discountType === 'percentage' ? unitPrice * (1 - flashSale.discountValue / 100) : unitPrice - flashSale.discountValue
  ) : unitPrice;

  const isOOS = (() => {
    // Availability comes from what can actually be built, not from the made-to-order flag.
    // A product genuinely bought per order has on-demand materials, which canProduce already
    // skips - so it stays available truthfully rather than by assertion.
    if (!product.trackInventory) return false;
    if (comboId != null && product.variantAvailableQty?.[comboId] != null) return Number(product.variantAvailableQty[comboId]) === 0;
    if (product.availableQty != null) return Number(product.availableQty) === 0;
    if (comboId != null && product.variantStock?.[comboId] != null) return Number(product.variantStock[comboId]) === 0;
    return false;
  })();

  const maxQty = (() => {
    if (!product.trackInventory) return 9999;
    if (comboId != null && product.variantBackorder?.[comboId]) return 9999;
    if (comboId != null && product.variantAvailableQty?.[comboId] != null) return Math.max(Number(product.variantAvailableQty[comboId]), 0);
    if (product.availableQty != null) return Math.max(Number(product.availableQty), 0);
    if (comboId != null && product.variantStock?.[comboId] != null) return Math.max(Number(product.variantStock[comboId]), 0);
    return product.stock != null ? Math.max(Number(product.stock), 0) : 9999;
  })();

  // What can really be built right now, ignoring the pre-order allowance. availableQty goes
  // to 9999 once pre-order is on, so it can no longer answer "how many are ready today".
  const readyNow = (() => {
    if (comboId != null && product.variantCanProduce?.[comboId] != null) return Number(product.variantCanProduce[comboId]);
    if (product.canProduce != null) return Number(product.canProduce);
    if (comboId != null && product.variantStock?.[comboId] != null) return Number(product.variantStock[comboId]);
    return product.stock != null ? Number(product.stock) : null;
  })();

  const displayStock = (() => {
    if (product.isMadeToOrder) return null;
    if (product.stockStatus === 'upon-order') return { label: 'Upon Order', type: 'gold' };
    // Sold out on the shelf but still orderable, because the shop said it can restock.
    if (product.allowPreorder && readyNow != null && readyNow <= 0) return { label: 'Pre-order', type: 'gold' };
    if (isOOS) return { label: 'Out of Stock', type: 'red' };
    if (comboId != null && product.variantAvailableQty?.[comboId] != null) {
      const n = Number(product.variantAvailableQty[comboId]);
      if (n <= 10) return { label: `Only ${n} left!`, type: 'gold' };
      return { label: `${n} units available`, type: 'gold' };
    }
    if (product.availableQty != null && Number(product.availableQty) > 0) {
      const n = Number(product.availableQty);
      return { label: n <= 10 ? `Only ${n} left!` : `${n} units available`, type: 'gold' };
    }
    return { label: 'In Stock', type: 'gold' };
  })();

  const buildCart = () => {
    const baseLabel = combo
      ? (combo.label || combo.name || Object.values(selVars).join(', ') || null)
      : (Object.values(selVars).filter(Boolean).join(', ') || null);
    const variantLabel = withOptionSuffix(baseLabel, product, selOpts);
    const basePrice = ((comboId && product.variantPrices?.[comboId])
      ? parseFloat(product.variantPrices[comboId])
      : parseFloat(product.flatPrice || product.price || 0)) + optUnitAdd;
    const effectivePrice = flashSale ? Math.max(0, flashSale.discountType === 'percentage'
      ? basePrice * (1 - flashSale.discountValue / 100)
      : basePrice - flashSale.discountValue) : basePrice;
    const variantImg = comboId ? (product.variantImageUrls ?? {})[comboId] : null;
    const productForCart = {
      ...product,
      flatPrice: effectivePrice,
      price: effectivePrice,
      ...(variantImg ? { thumbnail: variantImg } : {}),
    };
    return { productForCart, comboId, variantLabel };
  };

  const handleAdd = () => {
    if (isOOS) return;
    const { productForCart, comboId: cid, variantLabel } = buildCart();
    addToCart(productForCart, qty, cid, variantLabel, flashSale?._id ?? null);
    onClose();
  };
  const handleCheckout = () => {
    if (isOOS) return;
    const { productForCart, comboId: cid, variantLabel } = buildCart();
    // Direct checkout (Buy Now): straight to checkout with only this item — do NOT add it to the
    // cart. The selected variant's image goes first so the checkout thumbnail matches the choice.
    const variantImg = cid ? (product.variantImageUrls?.[cid] ?? product.variantImageUrls?.[String(cid)] ?? null) : null;
    const payload = {
      items: [{
        product: {
          _id:                 product._id ?? product.id,
          name:                product.name || product.subCategoryName,
          images: [
            ...(variantImg ? [variantImg] : []),
            ...(product.thumbnail ? [product.thumbnail] : []),
            ...(product.images || []),
          ].filter(Boolean),
          stock:               product.stock ?? null,
          trackInventory:      product.trackInventory ?? false,
          stockStatus:         product.stockStatus ?? null,
          minOrderQty:         product.minOrderQty ?? null,
          requiresDownpayment: product.requiresDownpayment ?? false,
          downpaymentPercent:  product.downpaymentPercent ?? null,
        },
        variantId:   cid,
        variantName: variantLabel,
        qty,
        unitPrice:   productForCart.flatPrice,
        ...(flashSale?._id ? { flashSaleId: String(flashSale._id) } : {}),
        designUrl:   null,
        designNotes: null,
      }],
      notes: '',
      designUrl: null,
    };
    sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
    onClose();
    router.push('/shop/checkout');
  };

  const hasGroups = product.variantGroups?.length > 0;
  const productId = product._id || product.id;

  // Lock the page behind the modal so it can't scroll while the quick-view is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!productId) return;
    setReviewsLoading(true);
    fetchWithTimeout(`${API_URL}/api/products/${productId}/reviews?page=1&per_page=5`, {}, 10000)
      .then(data => {
        if (!data) return;
        const d = data.data ?? data;
        setReviews(d.reviews ?? []);
        setReviewsAvg(d.avgRating ?? null);
        setReviewsTotalCount(d.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [productId]);

  return (
    <div className="shop-qv-backdrop" onClick={onClose}>
      <div className="shop-qv-modal" onClick={e => e.stopPropagation()}>
        <button className="shop-qv-close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="shop-qv-body">
          {/* Left: large main image + horizontal thumbnail row at bottom */}
          <div className="shop-qv-left">
            <div className="shop-qv-main-img">
              {images.length > 0 ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={images[thumbIdx] || images[0]} alt={product.name || ''} />
              ) : (
                <div className="shop-qv-no-img">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="shop-qv-thumbs-row">
                {images.slice(0, 6).map((img, i) => (
                  <button key={i} className={`shop-qv-thumb${thumbIdx === i ? ' active' : ''}`} onClick={() => setThumbIdx(i)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: details — mirrors product page layout */}
          <div className="shop-qv-details">
            {/* Category + badges row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              {(product.category || product.categoryName) && (
                <div className="shop-qv-category">{product.category || product.categoryName}</div>
              )}
              {/* "Customizable" is true of a both-ways product, but on its own it reads as a
                  requirement - as though the only way to buy this is to design something. */}
              {product.isCustom && (
                <span className="shop-qv-badge customizable">
                  {(PLAIN_OR_CUSTOM_ENABLED && (product.allowPlainPurchase ?? false)) ? 'PLAIN OR CUSTOM' : 'PRINT TO ORDER'}
                </span>
              )}
            </div>

            {/* Name */}
            <h2 className="shop-qv-title">{product.name || product.subCategoryName || 'Product'}</h2>

            {/* Price */}
            <div className="shop-qv-price">
              {mode === 'inquiry' ? (
                <span className="shop-qv-price-main">Price upon inquiry</span>
              ) : flashSale && effectiveUnit != null ? (
                <>
                  <span className="shop-qv-price-main">{fmt(effectiveUnit)}</span>
                  <span className="shop-qv-price-orig">{fmt(unitPrice)}</span>
                  {mode === 'tiered' && <span style={{ fontSize: '0.78rem', color: '#888' }}> / pc</span>}
                </>
              ) : unitPrice != null ? (
                <>
                  <span className="shop-qv-price-main">
                    {fmt(unitPrice)}{mode === 'tiered' && <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#888' }}> / pc</span>}
                  </span>
                  {qty > 1 && mode !== 'inquiry' && (
                    <span style={{ fontSize: '0.82rem', color: '#888' }}>Total: <b style={{ color: '#D4A843' }}>{fmt(unitPrice * qty)}</b></span>
                  )}
                </>
              ) : priceRange ? (
                <span className="shop-qv-price-main">
                  {fmt(priceRange.min)}{priceRange.max !== priceRange.min && ` – ${fmt(priceRange.max)}`}
                  <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#888' }}> / pc</span>
                </span>
              ) : (
                <span className="shop-qv-price-main">Price on request</span>
              )}
            </div>

            {/* Description */}
            {product.description && <p className="shop-qv-desc">{product.description}</p>}

            <div className="shop-qv-divider" />

            {/* Stock badge */}
            {displayStock && (
              <div style={{ display: 'flex' }}>
                <span className={`shop-qv-stock-badge${displayStock.type === 'red' ? ' oos' : ''}`}>
                  {displayStock.label}
                </span>
              </div>
            )}

            {/* Variant groups (product page style) */}
            {hasGroups && product.variantGroups.map((group, gi) => (
              <div key={group.id ?? group.name ?? gi} className="shop-qv-section">
                <div className="shop-qv-section-label">{group.name}</div>
                <div className="shop-qv-variants">
                  {group.options?.map((opt, oi) => {
                    const optVal = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? String(opt));
                    const optKey = typeof opt === 'string' ? opt : (opt.id ?? oi);
                    const isSelected = selVars[group.id] === optVal;
                    return (
                      <button
                        key={optKey}
                        className={`shop-qv-variant-btn${isSelected ? ' active' : ''}`}
                        onClick={() => {
                          const next = { ...selVars, [group.id]: optVal };
                          setSelVars(next);
                          const c = product.combinations?.find(cb => cb.name === optVal);
                          const varImg = c?.id ? (product.variantImageUrls ?? {})[c.id] : null;
                          const idx = varImg ? images.indexOf(varImg) : -1;
                          if (idx >= 0) setThumbIdx(idx);
                        }}
                      >
                        {optVal}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Options - the same picker language as the variants above; what differs is behind the
                screen, where these touch neither stock nor the bill of materials. */}
            {optGroups.map((group, gi) => (
              <div key={groupKey(group, gi)} className="shop-qv-section">
                <div className="shop-qv-section-label">{group.name}</div>
                <div className="shop-qv-variants">
                  {group.options.map((opt, oi) => {
                    const gk = groupKey(group, gi);
                    const ok = optionKey(opt, oi);
                    return (
                      <button
                        key={ok}
                        className={`shop-qv-variant-btn${selOpts[gk] === ok ? ' active' : ''}`}
                        onClick={() => setSelOpts(p => ({ ...p, [gk]: ok }))}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {optsPrompt && (
              <p style={{ margin: '0 0 .25rem', fontSize: '.78rem', fontWeight: 600, color: 'var(--gold)' }}>
                {optsPrompt}
              </p>
            )}

            {/* Quantity */}
            {!isOOS && (
              <div className="shop-qv-section">
                <div className="shop-qv-qty-row">
                  <div className="shop-qv-section-label">Quantity</div>
                  {moq > 1 && <span className="shop-qv-moq">Min. {moq} pcs</span>}
                </div>
                <div className="shop-qv-qty">
                  <button disabled={qty <= moq} onClick={() => { const n = Math.max(moq, qty - 1); setQty(n); setQtyInput(String(n)); }}>−</button>
                  <input
                    type="text" inputMode="numeric" value={qtyInput}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setQtyInput(raw);
                      if (!raw) return;
                      const v = parseInt(raw, 10);
                      if (!isNaN(v) && v >= moq) { const c = Math.min(v, maxQty); setQty(c); if (String(c) !== raw) setQtyInput(String(c)); }
                    }}
                    onBlur={() => {
                      const v = parseInt(qtyInput, 10);
                      const c = isNaN(v) || v < moq ? moq : Math.min(v, maxQty);
                      setQty(c); setQtyInput(String(c));
                    }}
                  />
                  <button disabled={qty >= maxQty} onClick={() => { const n = Math.min(maxQty, qty + 1); setQty(n); setQtyInput(String(n)); }}>+</button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {/* A product can offer BOTH routes. Showing only "Customize" here would hide the plain
                purchase the shop has deliberately switched on - the same half-answer the PDP used to
                give. `allowPlainPurchase` is undefined on older products, where a custom product was
                customise-only. */}
            {PLAIN_OR_CUSTOM_ENABLED && product.isCustom && (product.allowPlainPurchase ?? false) && mode !== 'inquiry' ? (
              <>
                <Link
                  href={(() => {
                    const qs = new URLSearchParams({ qty: String(qty) });
                    Object.entries(selVars || {}).forEach(([g, v]) => { if (v) qs.set(`v_${g}`, String(v)); });
                    Object.entries(selOpts || {}).forEach(([g, v]) => { if (v) qs.set(`o_${g}`, String(v)); });
                    return `/shop/products/${product.slug || toSlug(product.name)}/order?${qs.toString()}`;
                  })()}
                  className="shop-qv-btn-cart"
                >
                  Customize This Product
                </Link>
                <button className="shop-qv-btn-checkout" disabled={isOOS || optsPending} onClick={handleAdd}
                  style={{ opacity: isOOS ? 0.5 : 1, cursor: isOOS ? 'not-allowed' : 'pointer' }}>
                  {isOOS ? 'Out of Stock' : 'Buy it plain'}
                </button>
              </>
            ) : mode === 'inquiry' ? (
              /* Checked BEFORE isCustom, not after. A price-on-request service has no price, no
                 usable quantity and no variant, so the fixed-price order form has nothing to work
                 with - an inquiry is a conversation. The PDP opens the chat itself; ?inquire=1 tells
                 it to do that on arrival, so this is one press rather than two. */
              <Link
                href={`/shop/products/${product.slug || toSlug(product.name)}?inquire=1`}
                className="shop-qv-btn-cart"
                onClick={onClose}
              >
                Ask about this
              </Link>
            ) : product.isCustom ? (
              /* Straight to the order form, not the product page. Sending someone to the PDP made
                 them press the same button a second time - and it silently dropped the variant and
                 quantity they had already chosen here, so they had to pick both again. The query
                 carries them across exactly as the PDP's own button does. */
              <Link
                href={(() => {
                  const qs = new URLSearchParams({ qty: String(qty) });
                  Object.entries(selVars || {}).forEach(([g, v]) => { if (v) qs.set(`v_${g}`, String(v)); });
                  return `/shop/products/${product.slug || toSlug(product.name)}/order?${qs.toString()}`;
                })()}
                className="shop-qv-btn-cart"
              >
                Customize This Product
              </Link>
            ) : mode === 'inquiry' ? (
              // Price-on-request items can't be bought at a fixed price — send to the PDP to inquire,
              // never show Add to Cart / Checkout (would let the item be bought at ₱0).
              <Link href={`/shop/products/${product.slug || toSlug(product.name)}`} className="shop-qv-btn-cart" onClick={onClose}>
                Inquire / Get a Quote
              </Link>
            ) : (
              <>
                <button className="shop-qv-btn-cart" disabled={isOOS} onClick={handleAdd}
                  style={{ opacity: isOOS ? 0.5 : 1, cursor: isOOS ? 'not-allowed' : 'pointer' }}>
                  {isOOS ? 'Out of Stock' : 'Add to Cart'}
                </button>
                <button className="shop-qv-btn-checkout" disabled={isOOS} onClick={handleCheckout}
                  style={{ opacity: isOOS ? 0.5 : 1, cursor: isOOS ? 'not-allowed' : 'pointer' }}>
                  Checkout
                </button>
              </>
            )}

            {/* Pricing accordion — tiered products only */}
            {mode === 'tiered' && getTiers().length > 0 && (
              <>
                <div>
                  <button className="shop-qv-reviews-toggle" onClick={() => setShowPricing(p => !p)}>
                    <span>Pricing</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      {showPricing ? <line x1="5" y1="12" x2="19" y2="12"/> : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                    </svg>
                  </button>
                  {showPricing && (
                    <div style={{ marginTop: '10px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '0.77rem', color: '#888', lineHeight: 1.5 }}>Price per piece depends on quantity ordered.</p>
                      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '6px 14px', background: 'var(--dark2)', fontSize: '0.65rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          <span>Quantity</span><span style={{ textAlign: 'right' }}>Unit Price</span>
                        </div>
                        {[...getTiers()].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0)).map((tier, i, arr) => {
                          const isLast = i === arr.length - 1;
                          const min = parseInt(tier.minQty) || 0;
                          const max = tier.maxQty != null && tier.maxQty !== '' ? parseInt(tier.maxQty) : Infinity;
                          const isActive = qty >= min && (isLast || qty <= max);
                          const tierPrice = (() => {
                            if (tier.price != null) return parseFloat(tier.price) || null;
                            const prices = tier.prices ?? {};
                            if (comboId && prices[comboId] != null) return parseFloat(prices[comboId]) || null;
                            const vals = Object.values(prices).map(v => parseFloat(v)).filter(v => v > 0);
                            return vals.length ? Math.min(...vals) : null;
                          })();
                          return (
                            <div key={tier.id ?? i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '9px 14px', borderTop: '1px solid var(--border)', background: isActive ? 'rgba(212,168,67,0.07)' : 'var(--dark)' }}>
                              <span style={{ fontSize: '0.82rem', color: isActive ? '#b8922f' : '#333', fontWeight: isActive ? 700 : 500, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                {`${tier.minQty}${tier.maxQty ? `–${tier.maxQty}` : '+'} pcs`}
                                {isActive && <span style={{ fontSize: '0.6rem', background: 'rgba(212,168,67,0.15)', color: '#b8922f', padding: '1px 6px', borderRadius: '999px', fontWeight: 700, textTransform: 'uppercase' }}>Your qty</span>}
                              </span>
                              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: isActive ? '#b8922f' : '#333', textAlign: 'right' }}>
                                {tierPrice ? `${fmt(tierPrice)} / pc` : '—'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Reviews accordion */}
            <div>
              <button className="shop-qv-reviews-toggle" onClick={() => setShowReviews(p => !p)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Reviews
                  {reviewsTotalCount > 0 && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#000', background: '#D4A843', padding: '1px 7px', borderRadius: '999px' }}>
                      {reviewsTotalCount}
                    </span>
                  )}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  {showReviews
                    ? <line x1="5" y1="12" x2="19" y2="12"/>
                    : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                </svg>
              </button>
              {showReviews && (
                <div className="shop-qv-reviews">
                  {reviewsAvg !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
                      {[1,2,3,4,5].map(s => (
                        <svg key={s} width="13" height="13" viewBox="0 0 24 24"
                          fill={s <= Math.round(reviewsAvg) ? '#D4A843' : 'none'}
                          stroke="#D4A843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                      ))}
                      <span style={{ fontWeight: 700, color: '#D4A843', fontSize: '0.85rem' }}>{reviewsAvg}</span>
                      <span style={{ fontSize: '0.78rem', color: '#888' }}>({reviewsTotalCount} {reviewsTotalCount === 1 ? 'review' : 'reviews'})</span>
                    </div>
                  )}
                  {reviewsLoading && <div style={{ fontSize: '0.8rem', color: '#999' }}>Loading reviews…</div>}
                  {!reviewsLoading && reviews.length === 0 && (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#999' }}>No reviews yet.</p>
                  )}
                  {reviews.map((r, i) => (
                    <div key={i} className="shop-qv-review-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <div className="shop-qv-avatar">{(r.customerName || 'C').charAt(0).toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111' }}>{r.customerName || 'Customer'}</div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {[1,2,3,4,5].map(s => (
                              <svg key={s} width="9" height="9" viewBox="0 0 24 24"
                                fill={s <= r.rating ? '#D4A843' : 'none'}
                                stroke="#D4A843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                            ))}
                          </div>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#aaa' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#555', lineHeight: 1.55 }}>{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product, onAddToCart, onQuickView, flashSale }) {
  // Declared here because the card needs it too. The stock badge below asked for `mode` while only
  // QuickViewModal defined one, which threw a ReferenceError and took the whole /shop page down.
  const mode = product.priceType || product.pricingMode || 'fixed';
  const [hovered, setHovered] = useState(false);
  const hasImage = product.thumbnail || product.images?.length > 0;
  const { cartItems } = useCart();
  const cartQty = cartItems
    .filter(item => item.productId === (product._id || product.id))
    .reduce((sum, item) => sum + (item.qty || 0), 0);

  // Flash sale countdown
  const EXPIRY_THRESHOLD = 24 * 3600 * 1000; // show timer only within 24h
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    if (!flashSale?.endDate) return;
    const calc = () => {
      const diff = new Date(flashSale.endDate) - Date.now();
      if (diff <= 0) { setTimeLeft('Ended'); return; }
      if (diff > EXPIRY_THRESHOLD) { setTimeLeft(''); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [flashSale?.endDate]);


  return (
    <Link href={`/shop/products/${product.slug || toSlug(product.name)}`} className="shop-product-card-link">
      <div
        className={`shop-product-card ${hovered ? 'hovered' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Image area */}
        <div className="shop-product-image-area">
          {hasImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.thumbnail || product.images[0]}
              alt={product.subCategoryName || product.name || 'Product'}
              className="shop-product-image"
            />
          ) : (
            <div className="shop-product-no-image">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <div>No image</div>
            </div>
          )}

          {/* Stock image badge — top left */}
          {(() => {
            // Price-on-request items are quoted, not stocked. "IN STOCK" on one is a claim about a
            // shelf that does not exist, and it sits directly beside "Price on request".
            if (mode === 'inquiry') return null;
            if (product.isMadeToOrder) return (
              <div className="shop-stock-img-badge in-stock">In Stock</div>
            );
            const totalStock = (() => {
              // BOM-computed (from computeAvailability on the API)
              const vaq = product.variantAvailableQty;
              if (vaq && Object.keys(vaq).length > 0) {
                return Object.values(vaq).reduce((s, v) => s + (Number(v) || 0), 0);
              }
              if (product.availableQty != null) return Number(product.availableQty);
              // Manual stock fallback
              const vs = product.variantStock;
              if (vs && Object.keys(vs).length > 0) {
                return Object.values(vs).reduce((s, v) => s + (Number(v) || 0), 0);
              }
              return product.stock ?? null;
            })();
            const hasAnyBackorder = product.variantBackorder && Object.values(product.variantBackorder).some(v => !!v);
            if (!hasAnyBackorder && totalStock === 0) return (
              <div className="shop-stock-img-badge out-stock">Out of Stock</div>
            );
            if (totalStock != null && totalStock <= 10) return (
              <div className="shop-stock-img-badge low-stock">{totalStock} pcs left</div>
            );
            if (totalStock != null) return (
              <div className="shop-stock-img-badge in-stock">{totalStock} pcs</div>
            );
            return (
              <div className="shop-stock-img-badge in-stock">In Stock</div>
            );
          })()}

          {/* Customizable badge */}
          {product.isCustom && (
            <div className="shop-custom-badge">
              {(PLAIN_OR_CUSTOM_ENABLED && (product.allowPlainPurchase ?? false)) ? 'Plain or custom' : 'Print to order'}
            </div>
          )}

          {/* Flash sale badge */}
          {flashSale && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'linear-gradient(135deg, var(--red) 0%, var(--red-dark) 100%)',
              color: 'var(--white)',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              zIndex: 2,
            }}>
              {flashSale.discountType === 'percentage'
                ? `${flashSale.discountValue}% OFF`
                : `₱${flashSale.discountValue} OFF`}
            </div>
          )}

          {/* MOQ hover badge */}
          {(product.minOrderQty ?? 1) > 1 && (
            <div className="shop-moq-badge">
              MOQ {product.minOrderQty} pcs
            </div>
          )}

          {/* Quick View trigger — circle + button */}
          <button
            className="shop-quick-view-btn"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickView(product); }}
            aria-label="Quick view"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="7" y1="1" x2="7" y2="13"/><line x1="1" y1="7" x2="13" y2="7"/>
            </svg>
          </button>
        </div>

        {/* Info */}
        <div className="shop-product-info">
          <h3 className="shop-product-name">
            {product.name || product.subCategoryName || 'Unnamed Product'}
          </h3>

          <p className="shop-product-description">
            {product.description || ''}
          </p>


          <div className="shop-product-footer">
            {flashSale && flashSale.discountedPrice != null ? (
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{
                  fontSize: '0.75rem',
                  color: 'var(--gray)',
                  textDecoration: 'line-through',
                  lineHeight: 1,
                }}>
                  ₱{parseFloat(flashSale.originalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--red)',
                  lineHeight: 1,
                }}>
                  ₱{parseFloat(flashSale.discountedPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </span>
            ) : (
              <span className="shop-product-price">
                {getDisplayPrice(product)}
              </span>
            )}

            {product.variantGroups?.length > 0 && (
              <span className="shop-product-variants">
                {product.combinations?.length || product.variantGroups.length} variant{(product.combinations?.length || product.variantGroups.length) !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {flashSale && timeLeft && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              marginTop: '0.5rem',
              padding: '0.375rem 0.75rem',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '6px',
              fontSize: '0.72rem',
              color: 'var(--red)',
              fontWeight: 600,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Ends in {timeLeft}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShopClient({
  initialProducts = [],
  initialCollections = [],
  initialBanners = [],
  initialFlashSales = {},
  initialCollection = null,
}) {
  const [products, setProducts]       = useState(initialProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading]         = useState(initialProducts.length === 0);
  const [error, setError]             = useState(null);
  const [category, setCategory]       = useState('All');
  const [toast, setToast]             = useState(null);
  const [availability, setAvailability] = useState('all');
  const [sortBy, setSortBy]             = useState('featured');
  const [priceMin, setPriceMin]         = useState(0);
  const [priceMax, setPriceMax]         = useState(Infinity);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [mobileSheet, setMobileSheet]   = useState(null);
  const [sortOpen, setSortOpen]         = useState(false);
  const [showMoreCols, setShowMoreCols] = useState(false);
  const [banners, setBanners]         = useState(initialBanners);
  const [currentSlide, setCurrentSlide]   = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [flashSales, setFlashSales]   = useState(initialFlashSales);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickFlashSale, setQuickFlashSale]   = useState(null);
  const [quickVariant, setQuickVariant] = useState(null);
  const [quickQty, setQuickQty]         = useState(1);
  const [productType, setProductType]   = useState('');
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [collections, setCollections]   = useState(initialCollections);
  const { addToCart } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedSlugs, setSelectedSlugs] = useState(() =>
    initialCollection ? new Set([initialCollection]) : new Set()
  );
  const [colCache, setColCache]           = useState({});
  const [colLoadingSet, setColLoadingSet] = useState(new Set());

  useEffect(() => {
    const handleSearch = (e) => setSearchQuery(e.detail?.query ?? '');
    window.addEventListener('pmp_search', handleSearch);
    return () => window.removeEventListener('pmp_search', handleSearch);
  }, []);

  // Someone who pressed Enter in the navbar search on another page arrives here with ?q= - the event
  // above never reached this component, because it was not mounted when the event fired.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [searchParams]);

  // Read logged-in user for greeting
  const [shopUser, setShopUser] = useState(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('auth_user');
      setShopUser(raw ? JSON.parse(raw) : null);
    } catch { setShopUser(null); }
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const carouselRef = useRef(null);
  const autoplayRef = useRef(null);
  const sortDropdownRef = useRef(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  useEffect(() => {
    if (!initialProducts.length) loadProducts();
    if (!initialBanners.length) loadBanners();
    if (!Object.keys(initialFlashSales).length) loadFlashSales();
    if (!initialCollections.length) loadCollections();
  }, []);

  async function loadFlashSales() {
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/storefront/flash-sales`,
        {},
        30000
      );
      if (!res.ok) return;
      const data = await res.json();
      const sales = Array.isArray(data?.data) ? data.data : [];
      // Build productId → flashSale lookup map
      const map = {};
      sales.forEach(sale => {
        if (sale.productId) map[sale.productId] = sale;
      });
      setFlashSales(map);
    } catch {
      // Non-fatal — shop works without flash sale data
    }
  }

  /**
   * Load all active banners from backend API
   */
  async function loadBanners() {
    try {
      const data = await getStorefrontBanners('shop');
      const banners = Array.isArray(data) ? data : [];
      const sorted = banners.sort((a, b) => (a.order || 0) - (b.order || 0));
      setBanners(sorted);
    } catch (err) {
      console.error('Failed to load banners:', err);
      setBanners([]);
    }
  }

  // Auto-play carousel
  useEffect(() => {
    if (banners.length === 0) return;
    if (!isAutoPlaying || banners.length <= 1) return;

    autoplayRef.current = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % banners.length);
    }, 5000); // Change every 5 seconds

    return () => {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current);
      }
    };
  }, [isAutoPlaying, banners.length]);

  // Navigate carousel
  const goToSlide = (index) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const nextSlide = () => {
    setCurrentSlide(prev => (prev + 1) % banners.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const prevSlide = () => {
    setCurrentSlide(prev => (prev - 1 + banners.length) % banners.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/products?slim=true`, {}, 30000);
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      const products = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setProducts(products);
      try { sessionStorage.setItem('pmp_products_cache', JSON.stringify(products)); } catch {}
    } catch (err) {
      setError(err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadCollections() {
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/storefront/collections`, {}, 15000);
      if (!res.ok) return;
      const data = await res.json();
      setCollections(Array.isArray(data?.data) ? data.data : []);
    } catch {}
  }

  // Pre-load cache for collection slug that came from URL on mount
  useEffect(() => {
    const col = searchParams.get('collection');
    if (!col) return;
    setColLoadingSet(s => { const n = new Set(s); n.add(col); return n; });
    fetchWithTimeout(`${API_URL}/api/storefront/collections/${col}?per_page=60`, {}, 20000)
      .then(r => r.json())
      .then(data => setColCache(c => ({ ...c, [col]: data?.data?.products ?? [] })))
      .catch(() => {})
      .finally(() => setColLoadingSet(s => { const n = new Set(s); n.delete(col); return n; }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleCol = async (col) => {
    if (!col) { setSelectedSlugs(new Set()); setCategory('All'); setSearchQuery(''); return; }
    const slug = col.slug;
    const next = new Set(selectedSlugs);
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
      if (!colCache[slug]) {
        setColLoadingSet(s => { const n = new Set(s); n.add(slug); return n; });
        try {
          const res = await fetchWithTimeout(`${API_URL}/api/storefront/collections/${slug}?per_page=60`, {}, 20000);
          if (res.ok) {
            const data = await res.json();
            setColCache(c => ({ ...c, [slug]: data?.data?.products ?? [] }));
          }
        } catch {}
        setColLoadingSet(s => { const n = new Set(s); n.delete(slug); return n; });
      }
    }
    setSelectedSlugs(next);
    setCategory('All');
    setSearchQuery('');
  };

  const applyFlashDiscount = (price, sale) => {
    if (!sale || price <= 0) return price;
    if (sale.discountType === 'percentage') return Math.max(0, price * (1 - sale.discountValue / 100));
    if (sale.discountType === 'fixed') return Math.max(0, price - sale.discountValue);
    return price;
  };

  const handleAddToCart = (product, flashSale) => {
    const hasVariants = (product.combinations?.length > 0) || (product.variantGroups?.length > 0);
    const moq = product.minOrderQty || 1;
    if (hasVariants) {
      setQuickAddProduct(product);
      setQuickFlashSale(flashSale || null);
      setQuickVariant(null);
      setQuickQty(moq);
      return;
    }
    const basePrice = product.flatPrice || product.price || 0;
    const effectivePrice = applyFlashDiscount(basePrice, flashSale);
    const productToAdd = effectivePrice !== basePrice
      ? { ...product, flatPrice: effectivePrice, price: effectivePrice }
      : product;
    addToCart(productToAdd, moq, null, null, flashSale?._id ?? null);
    setToast({ message: `${product.subCategoryName || product.name} added to cart!`, type: 'success' });
    setTimeout(() => setToast(null), 2000);
  };

  // Derived values
  const getProductPrice = (p) => {
    const flat = parseFloat(p.flatPrice || p.price);
    if (flat > 0) return flat;
    const vp = Object.values(p.variantPrices || {}).map(v => parseFloat(v)).filter(v => v > 0);
    if (vp.length) return Math.min(...vp);
    const tiers = p.priceTiers ?? p.tiers ?? [];
    if (tiers.length) {
      const all = tiers.flatMap(t => t.price != null ? [parseFloat(t.price)] : Object.values(t.prices || {}).map(Number)).filter(v => v > 0);
      if (all.length) return Math.min(...all);
    }
    return 0;
  };
  const getProductMaxPrice = (p) => {
    const flat = parseFloat(p.flatPrice || p.price);
    if (flat > 0) return flat;
    const vp = Object.values(p.variantPrices || {}).map(v => parseFloat(v)).filter(v => v > 0);
    if (vp.length) return Math.max(...vp);
    const tiers = p.priceTiers ?? p.tiers ?? [];
    if (tiers.length) {
      const all = tiers.flatMap(t => t.price != null ? [parseFloat(t.price)] : Object.values(t.prices || {}).map(Number)).filter(v => v > 0);
      if (all.length) return Math.max(...all);
    }
    return 0;
  };
  const allPrices = products.map(p => getProductMaxPrice(p)).filter(v => v > 0);
  const priceRangeMax = allPrices.length ? Math.max(...allPrices) : 500;
  const priceFilterActive = priceMin > 0 || priceMax < Infinity;
  const fullProductMap = Object.fromEntries(products.map(p => [p._id || p.id, p]));
  const baseProducts = selectedSlugs.size === 0
    ? products
    : (() => {
        const seen = new Set();
        const out = [];
        for (const slug of selectedSlugs) {
          for (const p of (colCache[slug] ?? [])) {
            const id = p._id || p.id;
            if (!seen.has(id)) { seen.add(id); out.push(fullProductMap[id] ?? p); }
          }
        }
        return out;
      })();
  const isBaseLoading = selectedSlugs.size > 0
    ? [...selectedSlugs].some(s => !colCache[s])
    : loading;
  const activeFilterCount = (availability !== 'all' ? 1 : 0) + selectedSlugs.size + (priceFilterActive ? 1 : 0) + (productType ? 1 : 0);

  const inStockCount = products.filter(p => {
    if (p.isMadeToOrder) return true;
    const vaq = p.variantAvailableQty;
    if (vaq && Object.keys(vaq).length > 0)
      return Object.values(vaq).reduce((s, v) => s + (Number(v) || 0), 0) > 0;
    const qty = p.availableQty ?? p.stock;
    return qty == null || Number(qty) > 0;
  }).length;
  const outStockCount = products.length - inStockCount;

  const filtered = baseProducts
    .filter(p => {
      if (searchQuery && !p.name?.toLowerCase().includes(searchQuery.toLowerCase()) && !p.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (availability === 'in-stock') {
        if (p.isMadeToOrder) return true;
        const vaq = p.variantAvailableQty;
        if (vaq && Object.keys(vaq).length > 0) {
          const t = Object.values(vaq).reduce((s, v) => s + (Number(v) || 0), 0);
          if (t <= 0) return false;
        } else if (p.availableQty != null) {
          if (Number(p.availableQty) <= 0) return false;
        } else if (p.stock != null) {
          if (Number(p.stock) <= 0) return false;
        }
      }
      if (availability === 'out-of-stock') {
        if (p.isMadeToOrder) return false;
        const vaq = p.variantAvailableQty;
        if (vaq && Object.keys(vaq).length > 0) {
          const t = Object.values(vaq).reduce((s, v) => s + (Number(v) || 0), 0);
          if (t > 0) return false;
        } else if (p.availableQty != null) {
          if (Number(p.availableQty) > 0) return false;
        } else if (p.stock != null) {
          if (Number(p.stock) > 0) return false;
        }
      }
      if (productType === 'customizable' && !p.isCustom) return false;
      if (productType === 'ready-made' && p.isCustom) return false;
      const minPrice = getProductPrice(p);
      const maxPrice = getProductMaxPrice(p);
      if (priceMin > 0 && maxPrice > 0 && maxPrice < priceMin) return false;
      if (priceMax < Infinity && minPrice > priceMax) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'price-asc') return getProductPrice(a) - getProductPrice(b);
      if (sortBy === 'price-desc') return getProductPrice(b) - getProductPrice(a);
      if (sortBy === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      return 0;
    });

  return (
    <ErrorBoundary>
      <div>
        {/* Hero Carousel - Dynamic from Banner Management */}
        {banners.length > 0 && (
          <div className="shop-carousel-container">
            <div className="shop-carousel-track">
              {banners.map((banner, index) => (
                <div
                  key={banner.id}
                  className={`shop-carousel-slide ${index === currentSlide ? 'active' : ''}`}
                  style={{ opacity: index === currentSlide ? 1 : 0 }}
                >
                  {banner.image ? (
                    <Image
                      src={banner.image}
                      alt={banner.headline}
                      className="shop-carousel-bg-image"
                      fill
                      unoptimized
                      style={{ objectFit: 'cover', objectPosition: 'center center' }}
                    />
                  ) : (
                    <div className="shop-carousel-bg-image shop-carousel-placeholder">
                      <NoImage size={40} />
                    </div>
                  )}
                  {/* Only show overlay if there's text to protect */}
                  {(banner.headline || banner.subtext) && (
                    <div className="shop-carousel-overlay" />
                  )}

                  <div className="shop-carousel-content">
                    <div className="shop-carousel-text">
                      {banner.headline && (
                        <h2 className="shop-carousel-title">{banner.headline}</h2>
                      )}
                      {banner.subtext && (
                        <p className="shop-carousel-description">{banner.subtext}</p>
                      )}
                      {banner.ctaLabel && (
                        <Link href={banner.ctaLink || '/shop'} className="shop-carousel-cta">
                          {banner.ctaLabel}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Carousel Navigation - Only show if multiple banners */}
            {banners.length > 1 && (
              <>
                <button className="shop-carousel-nav shop-carousel-prev" onClick={prevSlide}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
              </button>
              <button className="shop-carousel-nav shop-carousel-next" onClick={nextSlide}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </>
          )}

          {/* Carousel Dots - Only show if multiple banners */}
          {banners.length > 1 && (
            <div className="shop-carousel-dots">
              {banners.map((_, index) => (
                <button
                  key={index}
                  className={`shop-carousel-dot ${index === currentSlide ? 'active' : ''}`}
                  onClick={() => goToSlide(index)}
                  title={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Mobile: Filter pill (sort is inside the filter sheet) ── */}
      <div className="mobile-filter-bar">
        <div className="mobile-filter-bar-pills">
          <button
            className={`mobile-action-pill${activeFilterCount > 0 || sortBy !== 'featured' ? ' active' : ''}`}
            onClick={() => setMobileSheet('all')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/>
            </svg>
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            {sortBy !== 'featured' && <span style={{fontSize:'0.72rem',opacity:0.75,marginLeft:3}}>· {sortBy === 'newest' ? 'Newest' : sortBy === 'price-asc' ? 'Price ↑' : 'Price ↓'}</span>}
          </button>
        </div>
        {activeFilterCount > 0 && (
          <div className="mobile-active-chips">
            {availability === 'in-stock' && (
              <span className="mobile-active-chip">In Stock <button onClick={() => setAvailability('all')} aria-label="Remove"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></span>
            )}
            {availability === 'out-of-stock' && (
              <span className="mobile-active-chip">Out of Stock <button onClick={() => setAvailability('all')} aria-label="Remove"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></span>
            )}
            {[...selectedSlugs].map(slug => {
              const col = collections.find(c => c.slug === slug);
              return (
                <span key={slug} className="mobile-active-chip">{col?.title || slug} <button onClick={() => handleToggleCol(col || { slug })} aria-label="Remove"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></span>
              );
            })}
            {productType && (
              <span className="mobile-active-chip">{productType === 'customizable' ? 'Customizable' : 'Ready Made'} <button onClick={() => setProductType('')} aria-label="Remove"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></span>
            )}
            {priceFilterActive && (
              <span className="mobile-active-chip">₱{priceMin.toLocaleString()}–{priceMax < Infinity ? `₱${priceMax.toLocaleString()}` : 'Any'} <button onClick={() => { setPriceMin(0); setPriceMax(Infinity); }} aria-label="Remove"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></span>
            )}
            <button className="mobile-active-clear" onClick={() => { setAvailability('all'); setSelectedSlugs(new Set()); setPriceMin(0); setPriceMax(Infinity); setProductType(''); }}>Clear all</button>
          </div>
        )}
      </div>

      {/* Sidebar + Grid layout */}
      <div className="shop-body">

        {/* ── Mobile filter toggle (desktop only, hidden on mobile) ── */}
        <button className="shop-filter-toggle" onClick={() => setSidebarOpen(o => !o)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/>
          </svg>
          Filters
        </button>

        {/* ── Sidebar ── */}
        <aside className={`shop-sidebar${sidebarOpen ? ' open' : ''}`}>

          {/* Sidebar header */}
          <div className="shop-sidebar-head">
            <span className="shop-sidebar-head-title">
              Filters
              {activeFilterCount > 0 && (
                <span className="shop-sidebar-head-badge">{activeFilterCount}</span>
              )}
            </span>
            {activeFilterCount > 0 && (
              <button
                className="shop-sidebar-head-clear"
                onClick={() => { setAvailability('all'); setSelectedSlugs(new Set()); setPriceMin(0); setPriceMax(Infinity); setProductType(''); }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Availability */}
          <div className="shop-filter-section">
            <div className="shop-filter-title">Availability</div>
            {[
              { val: 'in-stock',     label: 'In Stock',     count: inStockCount },
              { val: 'out-of-stock', label: 'Out of Stock', count: outStockCount },
            ].map(opt => {
              const isActive = availability === opt.val;
              return (
                <button
                  key={opt.val}
                  className={`shop-filter-check-item${isActive ? ' active' : ''}`}
                  onClick={() => setAvailability(isActive ? 'all' : opt.val)}
                >
                  <span className="shop-filter-check-box">
                    {isActive && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </span>
                  <span className="shop-filter-check-label">{opt.label}</span>
                  <span className="shop-filter-col-count">{opt.count}</span>
                </button>
              );
            })}
          </div>

          {/* Product Type */}
          <div className="shop-filter-section">
            <div className="shop-filter-title">Product Type</div>
            {[
              { val: 'customizable', label: 'Customizable', count: products.filter(p => p.isCustom).length },
              { val: 'ready-made',   label: 'Ready Made',   count: products.filter(p => !p.isCustom).length },
            ].map(opt => {
              const isActive = productType === opt.val;
              return (
                <button
                  key={opt.val}
                  className={`shop-filter-check-item${isActive ? ' active' : ''}`}
                  onClick={() => setProductType(isActive ? '' : opt.val)}
                >
                  <span className="shop-filter-check-box">
                    {isActive && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </span>
                  <span className="shop-filter-check-label">{opt.label}</span>
                  <span className="shop-filter-col-count">{opt.count}</span>
                </button>
              );
            })}
          </div>

          {/* Collections */}
          {collections.length > 0 && (
            <div className="shop-filter-section">
              <div className="shop-filter-title">Collections</div>
              {[{ _id: '__all__', slug: null, title: 'All Products', productCount: products.length }, ...collections]
                .slice(0, showMoreCols ? undefined : 6)
                .map((col, idx) => {
                  const isAll = col.slug === null;
                  const isActive = isAll ? selectedSlugs.size === 0 : selectedSlugs.has(col.slug);
                  return (
                    <button
                      key={col._id || col.slug || String(idx)}
                      className={`shop-filter-check-item${isActive ? ' active' : ''}`}
                      onClick={() => handleToggleCol(isAll ? null : col)}
                    >
                      <span className="shop-filter-check-box">
                        {isActive && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </span>
                      <span className="shop-filter-check-label">{col.title}</span>
                      {(col.productCount > 0 || isAll) && (
                        <span className="shop-filter-col-count">{col.productCount}</span>
                      )}
                    </button>
                  );
                })
              }
              {collections.length + 1 > 6 && (
                <button className="shop-filter-show-more" onClick={() => setShowMoreCols(o => !o)}>
                  {showMoreCols
                    ? 'Show less'
                    : `Show ${collections.length - 5} more`}
                </button>
              )}
            </div>
          )}

          {/* Price Range */}
          <div className="shop-filter-section">
            <div className="shop-filter-title">Price Range</div>
            <div className="shop-range-wrap">
              <div className="shop-range-hint">The highest price is ₱{priceRangeMax.toLocaleString()}</div>
              <div className="shop-range-track-wrap">
                <div className="shop-range-track-bg" />
                <div
                  className="shop-range-track-fill"
                  style={{
                    left: `${(priceMin / priceRangeMax) * 100}%`,
                    width: `${((Math.min(priceMax === Infinity ? priceRangeMax : priceMax, priceRangeMax) - priceMin) / priceRangeMax) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  className="shop-range-thumb"
                  min={0} max={priceRangeMax} step={1}
                  value={priceMin}
                  onChange={e => {
                    const v = Math.min(Number(e.target.value), (priceMax === Infinity ? priceRangeMax : priceMax) - 1);
                    setPriceMin(Math.max(0, v));
                  }}
                />
                <input
                  type="range"
                  className="shop-range-thumb"
                  min={0} max={priceRangeMax} step={1}
                  value={priceMax === Infinity ? priceRangeMax : priceMax}
                  onChange={e => {
                    const v = Math.max(Number(e.target.value), priceMin + 1);
                    setPriceMax(v >= priceRangeMax ? Infinity : v);
                  }}
                />
              </div>
              <div className="shop-range-inputs">
                <div className="shop-range-field">
                  <span>₱</span>
                  <input
                    type="number" min={0} max={(priceMax === Infinity ? priceRangeMax : priceMax) - 1}
                    value={priceMin}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (!isNaN(v) && v >= 0) setPriceMin(Math.min(v, (priceMax === Infinity ? priceRangeMax : priceMax) - 1));
                    }}
                  />
                </div>
                <div className="shop-range-field">
                  <span>₱</span>
                  <input
                    type="number" min={priceMin + 1} max={priceRangeMax}
                    value={priceMax === Infinity ? priceRangeMax : priceMax}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (!isNaN(v)) setPriceMax(v >= priceRangeMax ? Infinity : Math.max(v, priceMin + 1));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              className="shop-filter-clear-btn"
              onClick={() => { setAvailability('all'); setSelectedSlugs(new Set()); setPriceMin(0); setPriceMax(Infinity); setProductType(''); }}
            >
              Clear all filters
            </button>
          )}
        </aside>

        {/* Mobile sidebar backdrop */}
        {sidebarOpen && <div className="shop-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

        {/* ── Main content ── */}
        <div className="shop-main">

          {/* Sort bar + active chips (unified toolbar) */}
          <div className="shop-sort-bar">
            <div className="shop-sort-bar-left">
              {activeFilterCount > 0 ? (
                <>
                  {availability === 'in-stock' && (
                    <span className="shop-active-chip">
                      In Stock
                      <button onClick={() => setAvailability('all')} aria-label="Remove">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </span>
                  )}
                  {availability === 'out-of-stock' && (
                    <span className="shop-active-chip">
                      Out of Stock
                      <button onClick={() => setAvailability('all')} aria-label="Remove">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </span>
                  )}
                  {[...selectedSlugs].map(slug => {
                    const col = collections.find(c => c.slug === slug);
                    return (
                      <span key={slug} className="shop-active-chip collection">
                        {col?.title || slug}
                        <button onClick={() => handleToggleCol(col || { slug })} aria-label="Remove">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </span>
                    );
                  })}
                  {productType && (
                    <span className="shop-active-chip">
                      {productType === 'customizable' ? 'Customizable' : 'Ready Made'}
                      <button onClick={() => setProductType('')} aria-label="Remove">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </span>
                  )}
                  {priceFilterActive && (
                    <span className="shop-active-chip">
                      ₱{priceMin.toLocaleString()} – {priceMax < Infinity ? `₱${priceMax.toLocaleString()}` : 'Any'}
                      <button onClick={() => { setPriceMin(0); setPriceMax(Infinity); }} aria-label="Remove">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </span>
                  )}
                  <button
                    className="shop-active-clear"
                    onClick={() => { setAvailability('all'); setSelectedSlugs(new Set()); setPriceMin(0); setPriceMax(Infinity); setProductType(''); }}
                  >
                    Clear all
                  </button>
                </>
              ) : (
                <span className="shop-sort-count">
                  {isBaseLoading ? '' : `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`}
                  {selectedSlugs.size === 1 && (() => { const col = collections.find(c => c.slug === [...selectedSlugs][0]); return col ? ` in "${col.title}"` : ''; })()}
                  {selectedSlugs.size > 1 ? ` across ${selectedSlugs.size} collections` : ''}
                </span>
              )}
            </div>
            <div className="shop-sort-controls">
              <span className="shop-sort-label">Sort by</span>
              <div className="shop-sort-dropdown" ref={sortDropdownRef}>
                <button
                  className={`shop-sort-trigger${sortOpen ? ' open' : ''}`}
                  onClick={() => setSortOpen(o => !o)}
                >
                  <span>{{
                    featured: 'Featured',
                    newest: 'Newest',
                    'price-asc': 'Price: Low → High',
                    'price-desc': 'Price: High → Low',
                  }[sortBy] || 'Featured'}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {sortOpen && (
                  <div className="shop-sort-menu">
                    {[
                      { value: 'featured',    label: 'Featured' },
                      { value: 'newest',      label: 'Newest' },
                      { value: 'price-asc',   label: 'Price: Low → High' },
                      { value: 'price-desc',  label: 'Price: High → Low' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        className={`shop-sort-option${sortBy === opt.value ? ' active' : ''}`}
                        onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                      >
                        {sortBy === opt.value && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Grid */}
          {isBaseLoading ? (
            <div className="shop-products-grid shop-products-grid-loading">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="shop-product-skeleton" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="shop-empty-state">
              <div className="shop-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <h3 className="shop-empty-title">No products found</h3>
              <p className="shop-empty-description">Try adjusting your filters to find what you&apos;re looking for.</p>
              <button
                onClick={() => { setAvailability('all'); setSelectedSlugs(new Set()); setPriceMin(0); setPriceMax(Infinity); setProductType(''); setSortBy('featured'); }}
                className="shop-clear-filters-btn"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="shop-products-grid">
              {filtered.map((product, idx) => (
                <ProductCard
                  key={product._id || product.id || String(idx)}
                  product={product}
                  onAddToCart={handleAddToCart}
                  onQuickView={p => setQuickViewProduct(p)}
                  flashSale={flashSales[product._id] ?? flashSales[product.id] ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Add Modal */}
      {quickAddProduct && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setQuickAddProduct(null)}
        >
          <div
            style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'flex-start' }}>
              {(quickAddProduct.thumbnail || quickAddProduct.images?.[0]) && (
                <img
                  src={quickAddProduct.thumbnail || quickAddProduct.images[0]}
                  alt=""
                  style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)', lineHeight: 1.3, marginBottom: '4px' }}>
                  {quickAddProduct.subCategoryName || quickAddProduct.name}
                </div>
                {quickAddProduct.isCustom && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, background: '#D4A843', color: '#000', padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Customizable
                  </span>
                )}
              </div>
              <button
                onClick={() => setQuickAddProduct(null)}
                style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Variant picker */}
            {quickAddProduct.combinations?.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                  Select Variant
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {quickAddProduct.combinations.map((combo, cIdx) => {
                    const isSelected = quickVariant?.id === combo.id;
                    const comboLabel = combo.name || combo.label || Object.values(combo.combo || {}).join(' / ') || 'Variant';
                    const variantQty = quickAddProduct.variantStock?.[combo.id] != null
                      ? Number(quickAddProduct.variantStock[combo.id])
                      : null;
                    const isOOS = quickAddProduct.trackInventory && variantQty != null && variantQty === 0;
                    const price = (() => {
                      if (quickAddProduct.priceType === 'fixed') {
                        const p = quickAddProduct.variantPrices?.[combo.id];
                        return p ? parseFloat(p) : null;
                      }
                      if (quickAddProduct.priceType === 'tiered') {
                        const tiers = quickAddProduct.priceTiers ?? [];
                        if (!tiers.length) return null;
                        const sorted = [...tiers].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0));
                        let match = sorted[sorted.length - 1];
                        for (const t of sorted) {
                          const min = parseInt(t.minQty) || 0;
                          const max = t.maxQty !== null && t.maxQty !== '' ? parseInt(t.maxQty) : Infinity;
                          if (quickQty >= min && quickQty <= max) { match = t; break; }
                        }
                        const p = match?.prices?.[combo.id];
                        return p ? parseFloat(p) : null;
                      }
                      return null;
                    })();
                    return (
                      <button
                        key={combo.id || combo.name || String(cIdx)}
                        disabled={isOOS}
                        onClick={() => {
                          if (isOOS) return;
                          setQuickVariant(combo);
                          const unlimited = !quickAddProduct.trackInventory || !!quickAddProduct.variantBackorder?.[combo.id];
                          if (!unlimited) {
                            const vqty = quickAddProduct.variantStock?.[combo.id];
                            const cap = vqty != null ? Number(vqty) : (quickAddProduct.availableQty ?? quickAddProduct.stock ?? 9999);
                            setQuickQty(q => Math.min(q, Math.max(quickAddProduct.minOrderQty || 1, cap)));
                          }
                        }}
                        style={{
                          padding: '7px 14px', borderRadius: '8px',
                          cursor: isOOS ? 'not-allowed' : 'pointer',
                          border: `1px solid ${isOOS ? 'rgba(239,68,68,0.3)' : isSelected ? 'var(--gold)' : 'var(--border)'}`,
                          background: isOOS ? 'rgba(239,68,68,0.06)' : isSelected ? 'rgba(212,168,67,0.12)' : 'var(--dark)',
                          color: isOOS ? 'rgba(239,68,68,0.6)' : isSelected ? 'var(--gold)' : 'var(--white)',
                          fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500,
                          opacity: isOOS ? 0.6 : 1,
                          transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                        }}
                      >
                        <span style={{ textDecoration: isOOS ? 'line-through' : 'none' }}>{comboLabel}</span>
                        {price != null && !isOOS && (() => {
                          const saleP = quickFlashSale ? applyFlashDiscount(price, quickFlashSale) : price;
                          return saleP !== price ? (
                            <span style={{ fontSize: '0.7rem' }}>
                              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>₱{saleP.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                              {' '}
                              <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>₱{price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>₱{price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          );
                        })()}
                        {isOOS && (
                          <span style={{ fontSize: '0.65rem', color: 'rgba(239,68,68,0.8)' }}>Out of stock</span>
                        )}
                        {!isOOS && variantQty != null && variantQty <= 10 && (
                          <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>{variantQty} left</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            {(() => {
              const hasVariants = quickAddProduct.combinations?.length > 0;
              const unlimited = !quickAddProduct.trackInventory;
              const effectiveMaxQty = (() => {
                if (unlimited) return 9999;
                if (hasVariants && !quickVariant) return 9999;
                if (quickVariant && quickAddProduct.variantBackorder?.[quickVariant.id]) return 9999;
                if (quickVariant) {
                  const vqty = quickAddProduct.variantStock?.[quickVariant.id];
                  return vqty != null ? Number(vqty) : (quickAddProduct.stock ?? 9999);
                }
                return quickAddProduct.stock ?? 9999;
              })();
              const stockLabel = (() => {
                if (!quickAddProduct.trackInventory) return null;
                if (quickAddProduct.isMadeToOrder || quickAddProduct.stockStatus === 'upon-order') return { text: 'Made to Order', color: 'var(--gold)' };
                if (hasVariants && !quickVariant) return null;
                if (quickVariant && quickAddProduct.variantBackorder?.[quickVariant.id]) return { text: 'Pre-order', color: 'var(--gold)' };
                if (effectiveMaxQty < 9999) {
                  const color = effectiveMaxQty <= 5 ? '#ef4444' : effectiveMaxQty <= 10 ? '#f59e0b' : 'var(--gray)';
                  return { text: `${effectiveMaxQty} in stock`, color };
                }
                return null;
              })();
              return (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Quantity
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {stockLabel && (
                        <span style={{ fontSize: '0.7rem', color: stockLabel.color, fontWeight: 500 }}>
                          {stockLabel.text}
                        </span>
                      )}
                      {quickAddProduct.minOrderQty > 1 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 600 }}>
                          Min. {quickAddProduct.minOrderQty} pcs
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                      onClick={() => setQuickQty(q => Math.max(quickAddProduct.minOrderQty || 1, q - 1))}
                      style={{ width: '38px', height: '38px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px 0 0 8px', cursor: 'pointer', color: 'var(--white)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={quickQty}
                      onChange={e => {
                        const val = parseInt(e.target.value) || (quickAddProduct.minOrderQty || 1);
                        setQuickQty(Math.min(Math.max(quickAddProduct.minOrderQty || 1, val), effectiveMaxQty));
                      }}
                      style={{ width: '64px', height: '38px', background: 'var(--dark)', border: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', color: 'var(--white)', textAlign: 'center', fontSize: '0.95rem', outline: 'none' }}
                    />
                    <button
                      onClick={() => setQuickQty(q => Math.min(effectiveMaxQty, q + 1))}
                      style={{ width: '38px', height: '38px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 0', cursor: 'pointer', color: 'var(--white)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Action */}
            {(() => {
              const needsVariant = quickAddProduct.combinations?.length > 0 && !quickVariant;
              return (
                <button
                  disabled={needsVariant}
                  onClick={() => {
                    const variantId = quickVariant?.id || null;
                    const variantLabel = quickVariant
                      ? (quickVariant.name || quickVariant.label || Object.values(quickVariant.combo || {}).join(' / ') || null)
                      : null;
                    let productForCart = quickAddProduct;
                    if (quickFlashSale) {
                      const basePrice = variantId && quickAddProduct.variantPrices?.[variantId]
                        ? parseFloat(quickAddProduct.variantPrices[variantId])
                        : (quickAddProduct.flatPrice || quickAddProduct.price || 0);
                      const discounted = applyFlashDiscount(basePrice, quickFlashSale);
                      if (discounted !== basePrice) {
                        productForCart = { ...quickAddProduct, flatPrice: discounted, price: discounted };
                      }
                    }
                    addToCart(productForCart, quickQty, variantId, variantLabel, quickFlashSale?._id ?? null);
                    setToast({ message: `${quickAddProduct.subCategoryName || quickAddProduct.name} added to cart!`, type: 'success' });
                    setTimeout(() => setToast(null), 2000);
                    setQuickAddProduct(null);
                    setQuickFlashSale(null);
                  }}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                    background: needsVariant ? 'rgba(212,168,67,0.35)' : 'var(--gold)',
                    color: '#000', fontWeight: 700, fontSize: '0.9rem',
                    cursor: needsVariant ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {needsVariant ? 'Select a variant first' : 'Add to Cart'}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Quick View Modal */}
      {quickViewProduct && (
        <QuickViewModal
          product={quickViewProduct}
          flashSale={flashSales[quickViewProduct._id] ?? flashSales[quickViewProduct.id] ?? null}
          onClose={() => setQuickViewProduct(null)}
          onToast={(msg) => { setToast({ message: msg, type: 'success' }); setTimeout(() => setToast(null), 2000); }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`shop-toast ${toast.type}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>{toast.message}</span>
        </div>
      )}

      {/* ── Mobile filter bottom sheet ── */}
      {mobileSheet && (
        <>
          <div className="mobile-sheet-backdrop" onClick={() => setMobileSheet(null)} />
          <div className="mobile-sheet">
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-header">
              <span className="mobile-sheet-title">
                {mobileSheet === 'all' && 'Filters & Sort'}
                {mobileSheet === 'availability' && 'Availability'}
                {mobileSheet === 'type' && 'Product Type'}
                {mobileSheet === 'collections' && 'Collections'}
                {mobileSheet === 'price' && 'Price Range'}
              </span>
              <button className="mobile-sheet-close" onClick={() => setMobileSheet(null)} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="mobile-sheet-body">

              {/* Sort */}
              {mobileSheet === 'all' && (
                <div className="mobile-sheet-section" style={{padding:0}}>
                  <div className="mobile-sheet-section-title" style={{padding:'12px 20px 8px'}}>Sort by</div>
                  {[
                    { value: 'featured',   label: 'Featured' },
                    { value: 'newest',     label: 'Newest' },
                    { value: 'price-asc',  label: 'Price: Low → High' },
                    { value: 'price-desc', label: 'Price: High → Low' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      className={`mobile-sort-option${sortBy === opt.value ? ' active' : ''}`}
                      onClick={() => setSortBy(opt.value)}
                    >
                      {opt.label}
                      {sortBy === opt.value && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Availability */}
              {(mobileSheet === 'all' || mobileSheet === 'availability') && (
                <div className="mobile-sheet-section">
                  {mobileSheet === 'all' && <div className="mobile-sheet-section-title">Availability</div>}
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'in-stock', label: 'In Stock' },
                    { value: 'out-of-stock', label: 'Out of Stock' },
                  ].map(opt => (
                    <label key={opt.value} className="mobile-sheet-option">
                      <input
                        type="radio"
                        name="mobile-availability"
                        checked={availability === opt.value}
                        onChange={() => setAvailability(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}

              {/* Product Type */}
              {(mobileSheet === 'all' || mobileSheet === 'type') && (
                <div className="mobile-sheet-section">
                  {mobileSheet === 'all' && <div className="mobile-sheet-section-title">Product Type</div>}
                  {[
                    { value: '', label: 'All Types' },
                    { value: 'customizable', label: 'Customizable' },
                    { value: 'ready-made', label: 'Ready Made' },
                  ].map(opt => (
                    <label key={opt.value || 'all'} className="mobile-sheet-option">
                      <input
                        type="radio"
                        name="mobile-producttype"
                        checked={productType === opt.value}
                        onChange={() => setProductType(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}

              {/* Collections */}
              {(mobileSheet === 'all' || mobileSheet === 'collections') && collections.length > 0 && (
                <div className="mobile-sheet-section">
                  {mobileSheet === 'all' && <div className="mobile-sheet-section-title">Collections</div>}
                  {collections.map(col => (
                    <label key={col.slug} className="mobile-sheet-option">
                      <input
                        type="checkbox"
                        checked={selectedSlugs.has(col.slug)}
                        onChange={() => handleToggleCol(col)}
                      />
                      {col.title}
                    </label>
                  ))}
                </div>
              )}

              {/* Price Range */}
              {(mobileSheet === 'all' || mobileSheet === 'price') && (
                <div className="mobile-sheet-section">
                  {mobileSheet === 'all' && <div className="mobile-sheet-section-title">Price Range</div>}
                  <div className="mobile-sheet-price-label">
                    <span>₱{priceMin.toLocaleString()}</span>
                    <span>{priceMax < Infinity ? `₱${priceMax.toLocaleString()}` : 'Any'}</span>
                  </div>
                  <input
                    type="range" className="shop-range-slider"
                    min={0} max={priceRangeMax} step={1}
                    value={priceMin}
                    onChange={e => {
                      const v = Math.min(Number(e.target.value), (priceMax === Infinity ? priceRangeMax : priceMax) - 1);
                      setPriceMin(v);
                    }}
                  />
                  <input
                    type="range" className="shop-range-slider"
                    min={0} max={priceRangeMax} step={1}
                    value={priceMax === Infinity ? priceRangeMax : priceMax}
                    onChange={e => {
                      const v = Math.max(Number(e.target.value), priceMin + 1);
                      setPriceMax(v >= priceRangeMax ? Infinity : v);
                    }}
                  />
                  <div className="mobile-sheet-price-inputs">
                    <div className="shop-range-field">
                      <span>₱</span>
                      <input
                        type="number" min={0} max={(priceMax === Infinity ? priceRangeMax : priceMax) - 1}
                        value={priceMin}
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (!isNaN(v) && v >= 0) setPriceMin(Math.min(v, (priceMax === Infinity ? priceRangeMax : priceMax) - 1));
                        }}
                      />
                    </div>
                    <div className="shop-range-field">
                      <span>₱</span>
                      <input
                        type="number" min={priceMin + 1} max={priceRangeMax}
                        value={priceMax === Infinity ? priceRangeMax : priceMax}
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (!isNaN(v)) setPriceMax(v >= priceRangeMax ? Infinity : Math.max(v, priceMin + 1));
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}


            </div>
            <div className="mobile-sheet-footer">
              {activeFilterCount > 0 && (
                <button
                  className="mobile-sheet-clear"
                  onClick={() => { setAvailability('all'); setSelectedSlugs(new Set()); setPriceMin(0); setPriceMax(Infinity); setProductType(''); setSortBy('featured'); }}
                >
                  Clear all
                </button>
              )}
              <button className="mobile-sheet-apply" onClick={() => setMobileSheet(null)}>
                {activeFilterCount > 0 ? `Show results (${filtered.length})` : 'Apply'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
    </ErrorBoundary>
  );
}