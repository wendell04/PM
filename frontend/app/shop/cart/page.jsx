'use client';
import NoImage from '@/components/NoImage';
import { fileExtLabel } from '@/lib/shopUtils';
import { cloudinaryThumb } from '@/lib/cloudinaryImage';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useCart } from '../layout';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import { uploadDesignFile } from '@/lib/orderRequestApi';
import { formatPeso } from '@/lib/shopUtils';
import '@/app/shop/shop.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Mirrors layout's openAuthModalWithRedirect - cart cannot import shop layout, so we dispatch the same event.
function openAuthModalWithRedirect(returnPath) {
  window.dispatchEvent(new CustomEvent('pmp_open_auth', {
    detail: { type: 'login', returnPath },
  }));
}

// A PDF or an AI file has no thumbnail, so the strip falls back to an icon and the name.
const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
// Must stay in step with the server's mimes rule on /api/order-requests/upload-design.
const ACCEPTED_RE = /\.(jpe?g|png|webp|pdf|ai|psd|svg)$/i;
const ACCEPTED_LABEL = 'JPG, PNG, WEBP, PDF, AI, PSD or SVG';

function fileNameFromUrl(url) {
  try {
    const name = decodeURIComponent(new URL(url, 'http://x').pathname.split('/').pop() || '');
    return name || 'design file';
  } catch {
    return 'design file';
  }
}

// Same card language as the quote checkout: white surface, hairline border, quiet labels.
const CARD = { background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 };
const MICRO_LABEL = {
  display: 'block', fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em',
  textTransform: 'uppercase', color: 'var(--gray)',
};

// ── Login Required Modal ──────────────────────────────────────────────────────
function LoginRequiredModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div style={{ ...CARD, padding: 20, width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p style={{ fontSize: '1rem', fontWeight: 800, margin: '10px 0 4px' }}>Please log in or register</p>
          <p style={{ fontSize: '.82rem', color: 'var(--gray)', lineHeight: 1.6, margin: 0 }}>
            You need an account to place orders, so we can process it and keep you updated.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onClose(); openAuthModalWithRedirect('/shop/checkout'); }}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--dark)', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}
          >
            Log in
          </button>
          <button
            onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'register' } })); }}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none', background: 'var(--white)', color: 'var(--dark)', fontWeight: 800, fontSize: '.85rem', cursor: 'pointer' }}
          >
            Register
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  // Which cart lines have their attachment list expanded. Keyed by line, so opening one
  // does not open every other multi-file item on the page.
  const [openFiles, setOpenFiles] = useState({});
  const router = useRouter();
  const { cartItems, isCartLoading, updateQty, removeFromCart, bulkRemove } = useCart();
  const { token } = useAuth();
  const [hasAddress, setHasAddress] = useState(null);   // null = unknown / not signed in
  const [addrDismissed, setAddrDismissed] = useState(false);

  // Does this shopper already have somewhere to send things to? Signed out, the question does not
  // arise - they will be asked to sign in before checkout anyway.
  useEffect(() => {
    if (!token) { setHasAddress(null); return; }
    let cancelled = false;
    fetchWithTimeout(`${API_URL}/api/addresses`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }, 10000)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return;
        const list = Array.isArray(d?.data) ? d.data : (d?.data?.addresses ?? d?.addresses ?? []);
        setHasAddress(list.length > 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const [selectedItems, setSelectedItems] = useState(new Set());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  // designChoices: { [lineId]: { mode: 'upload'|'request'|null, file: File|null, url: string|null, uploading: boolean } }
  const [designChoices, setDesignChoices] = useState({});
  // Store-level design fee, so the cart quotes the same number checkout will charge.
  const [storeDesignFee, setStoreDesignFee] = useState(0);
  // ...and the shipping mode, because "Calculated at checkout" is only true for two of the three.
  const [shippingMode, setShippingMode] = useState(null);
  const removeTimerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/public/settings`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        setStoreDesignFee(Number(d?.data?.designRequestFee) || 0);
        setShippingMode(d?.data?.shippingMode ?? 'courier_booked');
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const setDesignChoice = (lineId, patch) =>
    setDesignChoices(prev => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));

  async function handleDesignFileSelect(lineId, file) {
    if (!file) return;
    // Checked by extension, not MIME type: browsers report .ai as application/pdf and .psd
    // as octet-stream, so a MIME whitelist silently rejected the formats the server accepts.
    if (!ACCEPTED_RE.test(file.name)) { setError(`Design must be one of: ${ACCEPTED_LABEL}.`); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Design file must be under 10 MB.'); return; }
    setError(null);
    setDesignChoice(lineId, { mode: 'upload', file, url: null, uploading: !!token });
    if (token) {
      try {
        const { url, name } = await uploadDesignFile(token, file);
        setDesignChoice(lineId, { url, name, uploading: false });
      } catch {
        setDesignChoice(lineId, { mode: null, file: null, url: null, uploading: false });
        setError('Upload failed. Please try again.');
      }
    }
  }

  // currentMode is the effective mode - it may have come from the line itself rather than
  // from a local pick, and without it an already-requested line could never be un-picked.
  function handleRequestDesign(lineId, currentMode) {
    setDesignChoices(prev => ({
      ...prev,
      [lineId]: currentMode === 'request'
        ? { mode: null, file: null, url: null, uploading: false }
        : { mode: 'request', file: null, url: null, uploading: false },
    }));
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
        allowCOD:            item.allowCOD ?? true,
      },
      stockCap: (() => {
        // 'upon-order' is set by the made-to-order flag and says nothing about supply; the
        // checkout still refuses on real materials. Cap on what can be built.
        if (!item.trackInventory) return 99;
        if (item.variantId && item.product?.variantAvailableQty?.[item.variantId] != null)
          return Math.max(item.product.variantAvailableQty[item.variantId], 1);
        if (item.product?.canProduce != null) return Math.max(item.product.availableQty ?? 0, 1);
        if (item.variantId && item.product?.variantStock?.[item.variantId] != null)
          return Math.max(Number(item.product.variantStock[item.variantId]), 1);
        return Math.max(item.product?.availableQty ?? item.stock ?? 99, 1);
      })(),
    };
  }), [cartItems]);

  const toggleSelectItem = (key) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(key)) newSelected.delete(key);
    else newSelected.add(key);
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === enrichedCart.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(enrichedCart.map((_, i) => i)));
  };

  const selectedCartItems = enrichedCart.filter((_, i) => selectedItems.has(i));
  const selectedBaseTotal = selectedCartItems.reduce((sum, i) => sum + i.lineTotal, 0);
  // ONE design fee for the order - the same rule checkout applies. The fee buys the
  // artwork, so one artwork across a mug and a totebag is still a single piece of work.
  // Summing each line and multiplying by quantity charged it once per piece.
  const designLines = selectedCartItems.filter(i => (designChoices[i.lineId]?.mode ?? i.designMode) === 'request');
  const selectedDesignFee = designLines.length > 0
    ? Math.max(storeDesignFee, ...designLines.map(i => Number(i.designFee) || 0))
    : 0;
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
    }, 250);
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    const lineIds = Array.from(selectedItems).map(i => enrichedCart[i].lineId);
    await bulkRemove(lineIds);
    setSelectedItems(new Set());
  };

  // Per-line "due now" preview - the same rule checkout applies, so cart and checkout agree. Every
  // made-to-order line pays its own DP% (upload AND request alike); a ready-made / no-DP line pays full.
  // The design fee is separate. Shipping is added at checkout.
  const lineDpPct = (i) => {
    const pct = Number(i.downpaymentPercent ?? 0);
    const requires = !!i.requiresDownpayment || pct > 0;
    return requires ? (pct > 0 ? pct : 50) : 0;
  };
  const goodsDueNow = selectedCartItems.reduce((sum, i) => {
    const pct = lineDpPct(i);
    return sum + (pct > 0 ? Math.round(i.lineTotal * pct / 100 * 100) / 100 : i.lineTotal);
  }, 0);
  const dpAmountDue = Math.round((goodsDueNow + selectedDesignFee) * 100) / 100;
  const dpRemaining = Math.round((selectedTotal - dpAmountDue) * 100) / 100;
  const dpRequired  = dpRemaining > 0;
  // Show a single "X%" only when EVERY selected line shares the same DP% (> 0). If percents differ, or a
  // full-paid/ready-made line is mixed in, "due now" is not a flat percent of the total - show no %.
  const allPcts    = selectedCartItems.map(i => lineDpPct(i));
  const dpPercent  = allPcts.length && allPcts.every(p => p === allPcts[0] && p > 0) ? allPcts[0] : null;

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

    const customWithNoDesign = selectedCartItems.filter(i => {
      if (!i.isCustom) return false;
      if (i.designUrl) return false; // already has design from product page
      const choice = designChoices[i.lineId];
      // The configurator may have already settled this, so its designMode counts too.
      if ((choice?.mode ?? i.designMode) === 'request') return false;
      return !choice?.url;
    });
    if (customWithNoDesign.length > 0) {
      setError(`Please attach a design or request design service for: ${customWithNoDesign.map(i => i.product.name).join(', ')}`);
      return;
    }

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

    const latestChoices = { ...designChoices };

    const payload = {
      items: selectedCartItems.map(i => {
        const choice = latestChoices[i.lineId];
        const designUrl = choice?.url ?? i.designUrl ?? null;
        const designRequested = (choice?.mode ?? i.designMode) === 'request';
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
            allowCOD:            i.allowCOD ?? i.product.allowCOD ?? true,
          },
          variantId:       i.variantId   ?? null,
          variantName:     i.variantName ?? null,
          qty:             i.qty,
          // The design fee is NOT folded into the unit price. Checkout adds it once for
          // the whole order; adding it here too charged it a second time, per piece.
          unitPrice:       i.unitPrice,
          isCustom:        i.isCustom    ?? false,
          designUrl:       designUrl,
          designName:      choice?.name ?? i.designName ?? null,
          designFiles:     i.designFiles ?? null,
          designNotes:     i.designNotes ?? null,
          designRequested: designRequested,
          designMode:      choice?.mode ?? i.designMode ?? null,
          designFee:       designRequested ? designFee : null,
          // Carry the T&C acceptance (accepted per mode on the product page) to checkout for proof.
          termsVersion:    i.termsVersion ?? null,
          termsSnapshot:   i.termsSnapshot ?? null,
          termsAgreedAt:   i.termsAgreedAt ?? null,
        };
      }),
      notes,
      fromCart: true,
    };

    try {
      sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
      // Remember exactly which lines are being bought. On success only these leave the cart -
      // emptying the whole thing threw away items the customer had deliberately left unticked.
      sessionStorage.setItem('checkout_line_ids', JSON.stringify(selectedCartItems.map(i => i.lineId).filter(Boolean)));
      router.push('/shop/checkout');
    } finally {
      setIsCheckingOut(false);
    }
  }

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (!isCartLoading && enrichedCart.length === 0) {
    return (
      <div className="shop-container" style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1rem', fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ textAlign: 'center', padding: '5rem 1.5rem', border: '1px dashed rgba(212,168,67,0.15)', borderRadius: '16px', background: 'rgba(212,168,67,0.02)' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 20px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,67,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)', marginBottom: '8px' }}>Your cart is empty</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '24px', lineHeight: 1.6 }}>Browse the shop and add something you like.</div>
          <Link href="/shop" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '8px', background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}>
            Browse products
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="shop-container" style={{ maxWidth: 980, margin: '0 auto', padding: '1.25rem 1rem 4rem' }}>
        <Link href="/shop" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--gray)', fontSize: '.82rem', fontWeight: 600, textDecoration: 'none', marginBottom: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Continue shopping
        </Link>

        {hasAddress === false && !addrDismissed && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fffbeb',
            border: '1px solid #fcd34d', borderRadius: 10, padding: '11px 13px', marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2"
              style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.86rem', fontWeight: 700, color: '#92400e' }}>Add your delivery address</div>
              <div style={{ fontSize: '.8rem', color: '#92400e', marginTop: 2, lineHeight: 1.5 }}>
                You can save it now instead of at checkout - it also lets us quote you a delivery
                fee while we are still talking about your order.
              </div>
              <Link href="/shop/profile?tab=addresses"
                style={{ display: 'inline-block', marginTop: 8, fontSize: '.8rem', fontWeight: 700,
                  color: '#92400e', textDecoration: 'underline' }}>
                Add address
              </Link>
            </div>
            <button type="button" onClick={() => setAddrDismissed(true)} aria-label="Dismiss"
              style={{ background: 'none', border: 'none', color: '#b45309', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 2 }}>
              &times;
            </button>
          </div>
        )}

        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Shopping cart</h1>
        <p style={{ color: 'var(--gray)', fontSize: '.86rem', margin: '4px 0 18px' }}>
          {enrichedCart.length} item{enrichedCart.length !== 1 ? 's' : ''} saved. Tick what you want to check out now.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 12px', borderRadius: 10, fontSize: '.84rem', marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div className="cart-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 16, alignItems: 'start' }}>
          {/* LEFT - items */}
          <section style={{ ...CARD, padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedItems.size === enrichedCart.length && enrichedCart.length > 0}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, accentColor: 'var(--white)', cursor: 'pointer' }}
                />
                <span style={{ ...MICRO_LABEL, display: 'inline' }}>Select all ({enrichedCart.length})</span>
              </label>
              {selectedItems.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#b91c1c', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                  Remove ({selectedItems.size})
                </button>
              )}
            </div>

            <div style={{ padding: '0 14px' }}>
              {enrichedCart.map((item, idx) => {
                const isRemoving = removingId === item.lineId;
                const isSelected = selectedItems.has(idx);
                const choice = designChoices[item.lineId];
                const mode = choice?.mode ?? item.designMode;
                const isUpload = mode === 'upload';
                const isReq = mode === 'request';
                const hasDesign = !!item.designUrl;
                const settled = hasDesign || isUpload || isReq;
                const designHref = item.designUrl ?? choice?.url ?? null;
                const fileCount = item.designFiles?.length || (designHref ? 1 : 0);

                // The same expression React uses to tell these rows apart. lineId is not guaranteed -
                // the key falls back to the index for a reason - and keying the expander on lineId
                // alone would put every such row under `undefined`, so one chevron would open them
                // all. That is the bug the review just found here; this is the half of it left over.
                const fileKey = item.lineId ?? idx;
                return (
                  <div
                    key={fileKey}
                    style={{
                      display: 'flex', gap: 12, padding: '14px 0',
                      borderTop: idx > 0 ? '1px solid var(--dark2)' : 'none',
                      opacity: isRemoving ? 0 : 1,
                      transform: isRemoving ? 'translateX(-16px)' : 'none',
                      transition: 'opacity .25s, transform .25s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectItem(idx)}
                      style={{ width: 16, height: 16, accentColor: 'var(--white)', cursor: 'pointer', marginTop: 4, flexShrink: 0 }}
                    />

                    <Link
                      href={`/shop/products/${item.product._id}`}
                      style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', background: 'var(--dark2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {item.product.images?.[0]
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={item.product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <NoImage size={22} />}
                    </Link>

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {/* Name and line total share a row, so the eye pairs them directly. */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Link
                            href={`/shop/products/${item.product._id}`}
                            style={{ fontWeight: 700, fontSize: '.9rem', lineHeight: 1.35, color: 'var(--white)', textDecoration: 'none' }}
                          >
                            {item.product.name}
                            {item.variantName && (
                              <span style={{ fontWeight: 500, color: 'var(--gray)' }}> - {item.variantName}</span>
                            )}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 }}>
                            <span style={{ color: 'var(--gray)', fontSize: '.76rem' }}>
                              {item.qty} &times; {formatPeso(item.unitPrice)}
                            </span>
                            {/* Per-line deposit indicator: exact % for a downpayment item, or "Pay in full"
                                for a ready-made / no-deposit item (e.g. Scrunchie) - so the total is clear. */}
                            {lineDpPct(item) > 0 ? (
                              <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 7px', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                {lineDpPct(item)}% deposit
                              </span>
                            ) : (
                              <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 999, padding: '1px 7px', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Pay in full
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '.92rem', whiteSpace: 'nowrap' }}>
                          {formatPeso(item.lineTotal)}
                        </div>
                      </div>

                      {/* Artwork state gets the full row width - squeezed into the name column it
                          wrapped onto three lines and read as an error. */}
                      {item.isCustom && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                          padding: '7px 9px', borderRadius: 9,
                          background: settled ? '#f0fdf4' : '#fffbeb',
                          border: `1px solid ${settled ? '#bbf7d0' : '#fde68a'}`,
                        }}>
                          {designHref ? (
                            /* The customer needs to see WHAT they attached, not just that they did. */
                            <a
                              href={designHref} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginRight: 'auto', textDecoration: 'none' }}
                            >
                              <span style={{ width: 34, height: 34, borderRadius: 7, overflow: 'hidden', background: 'var(--dark)', border: '1px solid #bbf7d0', flexShrink: 0,
                                display: (fileCount > 1 && openFiles[fileKey]) ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {IMAGE_RE.test(designHref)
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  ? <img src={cloudinaryThumb(designHref, 96)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
                              </span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.76rem', fontWeight: 700, color: '#166534' }}>
                                  {fileCount} file{fileCount === 1 ? '' : 's'} attached
                                  {fileCount > 1 && (
                                    /* The summary line named the first file and cut the rest off mid-word,
                                       so a customer with five attachments could see one and had no way to
                                       check the others without leaving the cart. */
                                    <span
                                      role="button" tabIndex={0}
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenFiles(p => ({ ...p, [fileKey]: !p[fileKey] })); }}
                                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpenFiles(p => ({ ...p, [fileKey]: !p[fileKey] })); } }}
                                      title={openFiles[fileKey] ? 'Hide the file list' : 'Show all files'}
                                      style={{ display: 'inline-flex', cursor: 'pointer', color: '#166534', opacity: .75 }}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                        style={{ transform: openFiles[fileKey] ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>
                                        <polyline points="6 9 12 15 18 9" />
                                      </svg>
                                    </span>
                                  )}
                                </span>
                                {(fileCount <= 1 || !openFiles[fileKey]) ? (
                                  <span style={{ display: 'block', fontSize: '.7rem', color: '#166534', opacity: .8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {fileCount > 1
                                      ? item.designFiles.map(f => f.name || fileNameFromUrl(f.url)).join(', ')
                                      : (item.designName || fileNameFromUrl(designHref))}
                                  </span>
                                ) : (
                                  /* Each file its own row and its own link - the collapsed line is one
                                     anchor covering all of them, which opens only the first. */
                                  <span style={{ display: 'block', marginTop: 4 }}>
                                    {item.designFiles.map((f, fi) => (
                                      <a
                                        key={fi}
                                        href={f.url} target="_blank" rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0',
                                          textDecoration: 'none', minWidth: 0 }}
                                      >
                                        {/* Its own tile per row. One shared icon beside a stack of names says
                                            nothing about which file is which - and when four of five are
                                            artwork, the thumbnail IS the identifying detail. */}
                                        <span style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden',
                                          background: 'var(--dark)', border: '1px solid #bbf7d0', flexShrink: 0,
                                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          {IMAGE_RE.test(f.url)
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            ? <img src={cloudinaryThumb(f.url, 80)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            : <span style={{ fontSize: '7.5px', fontWeight: 800, color: '#166534', letterSpacing: '.02em' }}>{fileExtLabel(f.url, 'FILE')}</span>}
                                        </span>
                                        <span style={{ fontSize: '.7rem', color: '#166534', opacity: .9,
                                          textDecoration: 'underline', overflow: 'hidden',
                                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {f.name || fileNameFromUrl(f.url)}
                                        </span>
                                      </a>
                                    ))}
                                  </span>
                                )}
                              </span>
                            </a>
                          ) : (
                            <span style={{ fontSize: '.76rem', fontWeight: 700, color: settled ? '#166534' : '#92400e', marginRight: 'auto' }}>
                              {choice?.uploading ? 'Uploading your design...'
                                : isReq ? 'We will design this for you'
                                : 'This item still needs artwork'}
                            </span>
                          )}

                          {item.designNotes && (
                            <span style={{ display: 'block', width: '100%', order: 99, marginTop: 6,
                              fontSize: '.72rem', color: 'var(--gray-light)', lineHeight: 1.5,
                              borderTop: '1px dashed var(--border)', paddingTop: 6 }}>
                              <strong style={{ color: 'var(--white)' }}>Your instructions: </strong>
                              {item.designNotes}
                            </span>
                          )}

                          {!hasDesign && (
                            <>
                              <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                                padding: '5px 11px', borderRadius: 999, fontSize: '.74rem', fontWeight: 700,
                                background: isUpload ? 'var(--white)' : 'var(--dark)',
                                color: isUpload ? 'var(--dark)' : 'var(--white)',
                                border: `1px solid ${isUpload ? 'var(--white)' : 'var(--border)'}`,
                              }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                {isUpload ? 'Replace file' : 'Upload file'}
                                <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.ai,.psd,.svg" style={{ display: 'none' }} onChange={e => handleDesignFileSelect(item.lineId, e.target.files?.[0])} />
                              </label>
                              {item.designFee > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestDesign(item.lineId, mode)}
                                  style={{
                                    padding: '5px 11px', borderRadius: 999, fontSize: '.74rem', fontWeight: 700, cursor: 'pointer',
                                    background: isReq ? 'var(--white)' : 'var(--dark)',
                                    color: isReq ? 'var(--dark)' : 'var(--white)',
                                    border: `1px solid ${isReq ? 'var(--white)' : 'var(--border)'}`,
                                  }}
                                >
                                  Request design
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', background: 'var(--dark)' }}>
                          <button
                            onClick={() => updateQty(item.lineId, item.qty - 1)}
                            disabled={item.qty <= (item.minOrderQty || 1)}
                            style={{ width: 30, height: 30, border: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 700, cursor: item.qty <= (item.minOrderQty || 1) ? 'not-allowed' : 'pointer', opacity: item.qty <= (item.minOrderQty || 1) ? 0.35 : 1 }}
                          >
                            &minus;
                          </button>
                          <span style={{ minWidth: 40, textAlign: 'center', fontSize: '.85rem', fontWeight: 700, borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', lineHeight: '30px' }}>
                            {item.qty}
                          </span>
                          <button
                            onClick={() => updateQty(item.lineId, Math.min(item.qty + 1, item.stockCap))}
                            disabled={item.qty >= item.stockCap}
                            style={{ width: 30, height: 30, border: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 700, cursor: item.qty >= item.stockCap ? 'not-allowed' : 'pointer', opacity: item.qty >= item.stockCap ? 0.35 : 1 }}
                          >
                            +
                          </button>
                        </div>

                        <button
                          onClick={() => handleRemoveItem(item.lineId, idx)}
                          title="Remove item"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--gray)', fontSize: '.76rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* RIGHT - order summary */}
          <aside style={{ ...CARD, position: 'sticky', top: 16 }}>
            <span style={{ ...MICRO_LABEL, marginBottom: 10 }}>Order summary</span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                <span style={{ color: 'var(--gray)' }}>Selected items</span>
                <span>{selectedCartItems.length} of {enrichedCart.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                <span style={{ color: 'var(--gray)' }}>Subtotal</span>
                <span>{formatPeso(selectedBaseTotal)}</span>
              </div>
              {selectedDesignFee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '.8rem' }}>
                  <span style={{ color: 'var(--gray)' }}>
                    Design fee
                    <span style={{ display: 'block', fontSize: '.7rem', opacity: .8 }}>
                      Charged once, however many products the artwork goes on
                    </span>
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>{formatPeso(selectedDesignFee)}</span>
                </div>
              )}
              {/* Under Courier Booked there is nothing to calculate at checkout either - the fee is
                  quoted after the order, once a courier is actually booked. Promising a figure at
                  checkout that never appears there is the kind of small lie a customer notices. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '.8rem' }}>
                <span style={{ color: 'var(--gray)' }}>Shipping</span>
                <span style={{ color: 'var(--gray)', textAlign: 'right' }}>
                  {shippingMode === 'courier_booked' ? 'Arranged after order' : 'Calculated at checkout'}
                </span>
              </div>
              {shippingMode === 'courier_booked' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, padding: '9px 11px', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 8 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                    <rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                  </svg>
                  <span style={{ fontSize: '.72rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                    Delivery is not included in this total. We book a third-party courier after your
                    order is confirmed and send you the fee in chat - usually paid in cash to the rider
                    or the seller. It can vary with the size of your order.
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
              <span style={{ fontWeight: 800, fontSize: '.9rem' }}>Total</span>
              <span style={{ fontWeight: 900, fontSize: '1.05rem' }}>{formatPeso(selectedTotal)}</span>
            </div>

            {/* A cart with a design request pays the design fee alone - the goods are paid after the
                proof is approved. Quoting a deposit here contradicted the checkout that follows and
                showed the customer a figure they were never going to be charged. */}
            {designLines.length > 0 ? (
              <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 10, background: 'var(--dark2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '.76rem', fontWeight: 800 }}>You pay the design fee first</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                  <span style={{ color: 'var(--gray)' }}>Due now</span>
                  <span style={{ fontWeight: 700 }}>{formatPeso(selectedDesignFee)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: 'var(--gray)' }}>
                  <span>After you approve the proof</span>
                  <span>{formatPeso(Math.max(0, selectedTotal - selectedDesignFee))} + delivery</span>
                </div>
                <span style={{ fontSize: '.72rem', color: 'var(--gray)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  The design fee is non-refundable - it pays for the designer&apos;s time. You see the artwork before you pay for the goods.
                </span>
              </div>
            ) : dpRequired && (
              <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 10, background: 'var(--dark2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '.76rem', fontWeight: 800 }}>{dpPercent ? `${dpPercent}% downpayment required` : 'Downpayment required'}</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                  <span style={{ color: 'var(--gray)' }}>Due now (excl. shipping)</span>
                  <span style={{ fontWeight: 700 }}>{formatPeso(dpAmountDue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: 'var(--gray)' }}>
                  <span>Balance later</span>
                  <span>{formatPeso(dpRemaining)}</span>
                </div>
                <span style={{ fontSize: '.72rem', color: 'var(--gray)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  Due now is the deposit on your items (ready-made items in full). The remaining balance is collected before delivery.
                </span>
              </div>
            )}

            {/* A zero total next to a priced item reads as a bug rather than a prompt. */}
            {selectedItems.size === 0 && (
              <p style={{ marginTop: 10, marginBottom: 0, fontSize: '.76rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                Tick an item to include it - the total updates as you select.
              </p>
            )}

            <div style={{ marginTop: 12 }}>
              <label style={{ ...MICRO_LABEL, marginBottom: 6 }}>Order notes (optional)</label>
              <textarea
                rows={3}
                maxLength={500}
                placeholder="Colour preferences, deadlines, special instructions..."
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 500))}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 9, fontSize: '.84rem', fontFamily: 'inherit', resize: 'vertical', background: 'var(--dark)' }}
              />
              <span style={{ display: 'block', textAlign: 'right', fontSize: '.7rem', color: 'var(--gray)' }}>{notes.length}/500</span>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={selectedItems.size === 0 || isCheckingOut}
              style={{
                width: '100%', marginTop: 10, padding: '11px 12px', borderRadius: 10, border: 'none',
                background: 'var(--white)', color: 'var(--dark)', fontWeight: 800, fontSize: '.88rem',
                cursor: (selectedItems.size === 0 || isCheckingOut) ? 'not-allowed' : 'pointer',
                opacity: (selectedItems.size === 0 || isCheckingOut) ? 0.5 : 1,
              }}
            >
              {isCheckingOut ? 'Preparing checkout...' : `Check out (${selectedItems.size})`}
            </button>

            <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 0', fontSize: '.74rem', color: 'var(--gray)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              Delivery address is chosen at checkout.
            </p>
          </aside>
        </div>

        <LoginRequiredModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />

        <style jsx>{`
          @media (max-width: 820px) {
            .cart-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
