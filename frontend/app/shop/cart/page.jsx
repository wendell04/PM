'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
const CARD = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 };
const MICRO_LABEL = {
  display: 'block', fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em',
  textTransform: 'uppercase', color: '#6b7280',
};

// ── Login Required Modal ──────────────────────────────────────────────────────
function LoginRequiredModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div style={{ ...CARD, padding: 20, width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p style={{ fontSize: '1rem', fontWeight: 800, margin: '10px 0 4px' }}>Please log in or register</p>
          <p style={{ fontSize: '.82rem', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
            You need an account to place orders, so we can process it and keep you updated.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onClose(); openAuthModalWithRedirect('/shop/checkout'); }}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}
          >
            Log in
          </button>
          <button
            onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'register' } })); }}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#111827', color: '#fff', fontWeight: 800, fontSize: '.85rem', cursor: 'pointer' }}
          >
            Register
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const router = useRouter();
  const { cartItems, isCartLoading, updateQty, removeFromCart, bulkRemove } = useCart();
  const { token } = useAuth();

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
  const removeTimerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/public/settings`)
      .then(r => r.json())
      .then(d => { if (alive) setStoreDesignFee(Number(d?.data?.designRequestFee) || 0); })
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
        if (!item.trackInventory || item.stockStatus === 'upon-order') return 99;
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

  // Order-level DP: if ANY selected item requires DP, apply the highest DP% to the full order total
  const dpPercent = selectedCartItems
    .filter(i => i.requiresDownpayment)
    .reduce((max, i) => Math.max(max, i.downpaymentPercent ?? 50), 0);
  const dpRequired = dpPercent > 0;
  const dpAmountDue = dpRequired ? Math.round(selectedTotal * dpPercent / 100 * 100) / 100 : selectedTotal;
  const dpRemaining = dpRequired ? Math.round((selectedTotal - dpAmountDue) * 100) / 100 : 0;

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
        };
      }),
      notes,
      fromCart: true,
    };

    try {
      sessionStorage.setItem('checkout_payload', JSON.stringify(payload));
      router.push('/shop/checkout');
    } finally {
      setIsCheckingOut(false);
    }
  }

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (!isCartLoading && enrichedCart.length === 0) {
    return (
      <div className="shop-container" style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        <p style={{ fontWeight: 700, margin: '10px 0 6px' }}>Your cart is empty</p>
        <p style={{ color: '#6b7280', fontSize: '.88rem', marginBottom: 16 }}>Browse the shop and add something you like.</p>
        <Link href="/shop" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>Browse products &rarr;</Link>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="shop-container" style={{ maxWidth: 980, margin: '0 auto', padding: '1.25rem 1rem 4rem' }}>
        <Link href="/shop" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: '.82rem', fontWeight: 600, textDecoration: 'none', marginBottom: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Continue shopping
        </Link>

        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Shopping cart</h1>
        <p style={{ color: '#6b7280', fontSize: '.86rem', margin: '4px 0 18px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderBottom: '1px solid #e5e7eb' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedItems.size === enrichedCart.length && enrichedCart.length > 0}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, accentColor: '#111827', cursor: 'pointer' }}
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

                return (
                  <div
                    key={item.lineId ?? idx}
                    style={{
                      display: 'flex', gap: 12, padding: '14px 0',
                      borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none',
                      opacity: isRemoving ? 0 : 1,
                      transform: isRemoving ? 'translateX(-16px)' : 'none',
                      transition: 'opacity .25s, transform .25s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectItem(idx)}
                      style={{ width: 16, height: 16, accentColor: '#111827', cursor: 'pointer', marginTop: 4, flexShrink: 0 }}
                    />

                    <Link
                      href={`/shop/products/${item.product._id}`}
                      style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {item.product.images?.[0]
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={item.product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ color: '#9ca3af', fontSize: '.6rem' }}>No image</span>}
                    </Link>

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {/* Name and line total share a row, so the eye pairs them directly. */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Link
                            href={`/shop/products/${item.product._id}`}
                            style={{ fontWeight: 700, fontSize: '.9rem', lineHeight: 1.35, color: '#111827', textDecoration: 'none' }}
                          >
                            {item.product.name}
                            {item.variantName && (
                              <span style={{ fontWeight: 500, color: '#6b7280' }}> - {item.variantName}</span>
                            )}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 }}>
                            <span style={{ color: '#6b7280', fontSize: '.76rem' }}>
                              {item.qty} &times; {formatPeso(item.unitPrice)}
                            </span>
                            {item.requiresDownpayment && (
                              <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 7px', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Downpayment
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
                              <span style={{ width: 34, height: 34, borderRadius: 7, overflow: 'hidden', background: '#fff', border: '1px solid #bbf7d0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {IMAGE_RE.test(designHref)
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  ? <img src={designHref} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
                              </span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: '.76rem', fontWeight: 700, color: '#166534' }}>
                                  {fileCount} file{fileCount === 1 ? '' : 's'} attached
                                </span>
                                <span style={{ display: 'block', fontSize: '.7rem', color: '#166534', opacity: .8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {fileCount > 1
                                    ? item.designFiles.map(f => f.name || fileNameFromUrl(f.url)).join(', ')
                                    : (item.designName || fileNameFromUrl(designHref))}
                                </span>
                              </span>
                            </a>
                          ) : (
                            <span style={{ fontSize: '.76rem', fontWeight: 700, color: settled ? '#166534' : '#92400e', marginRight: 'auto' }}>
                              {choice?.uploading ? 'Uploading your design...'
                                : isReq ? 'We will design this for you'
                                : 'This item still needs artwork'}
                            </span>
                          )}

                          {!hasDesign && (
                            <>
                              <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                                padding: '5px 11px', borderRadius: 999, fontSize: '.74rem', fontWeight: 700,
                                background: isUpload ? '#111827' : '#fff',
                                color: isUpload ? '#fff' : '#111827',
                                border: `1px solid ${isUpload ? '#111827' : '#d1d5db'}`,
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
                                    background: isReq ? '#111827' : '#fff',
                                    color: isReq ? '#fff' : '#111827',
                                    border: `1px solid ${isReq ? '#111827' : '#d1d5db'}`,
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
                        <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 9, overflow: 'hidden', background: '#fff' }}>
                          <button
                            onClick={() => updateQty(item.lineId, item.qty - 1)}
                            disabled={item.qty <= (item.minOrderQty || 1)}
                            style={{ width: 30, height: 30, border: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 700, cursor: item.qty <= (item.minOrderQty || 1) ? 'not-allowed' : 'pointer', opacity: item.qty <= (item.minOrderQty || 1) ? 0.35 : 1 }}
                          >
                            &minus;
                          </button>
                          <span style={{ minWidth: 40, textAlign: 'center', fontSize: '.85rem', fontWeight: 700, borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', lineHeight: '30px' }}>
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
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#9ca3af', fontSize: '.76rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
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
                <span style={{ color: '#6b7280' }}>Selected items</span>
                <span>{selectedCartItems.length} of {enrichedCart.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                <span style={{ color: '#6b7280' }}>Subtotal</span>
                <span>{formatPeso(selectedBaseTotal)}</span>
              </div>
              {selectedDesignFee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '.8rem' }}>
                  <span style={{ color: '#6b7280' }}>
                    Design fee
                    <span style={{ display: 'block', fontSize: '.7rem', opacity: .8 }}>
                      Charged once, however many products the artwork goes on
                    </span>
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>{formatPeso(selectedDesignFee)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '.8rem' }}>
                <span style={{ color: '#6b7280' }}>Shipping</span>
                <span style={{ color: '#6b7280', textAlign: 'right' }}>Calculated at checkout</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', marginTop: 10, paddingTop: 10 }}>
              <span style={{ fontWeight: 800, fontSize: '.9rem' }}>Total</span>
              <span style={{ fontWeight: 900, fontSize: '1.05rem' }}>{formatPeso(selectedTotal)}</span>
            </div>

            {dpRequired && (
              <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 10, background: '#f9fafb', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '.76rem', fontWeight: 800 }}>{dpPercent}% downpayment required</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                  <span style={{ color: '#6b7280' }}>Due now</span>
                  <span style={{ fontWeight: 700 }}>{formatPeso(dpAmountDue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: '#6b7280' }}>
                  <span>Balance on completion</span>
                  <span>{formatPeso(dpRemaining)}</span>
                </div>
                <span style={{ fontSize: '.72rem', color: '#6b7280', lineHeight: 1.5, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
                  Your cart contains custom items, so production starts once the downpayment clears.
                </span>
              </div>
            )}

            {/* A zero total next to a priced item reads as a bug rather than a prompt. */}
            {selectedItems.size === 0 && (
              <p style={{ marginTop: 10, marginBottom: 0, fontSize: '.76rem', color: '#6b7280', lineHeight: 1.5 }}>
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
                style={{ width: '100%', padding: '9px 11px', border: '1px solid #d1d5db', borderRadius: 9, fontSize: '.84rem', fontFamily: 'inherit', resize: 'vertical', background: '#fff' }}
              />
              <span style={{ display: 'block', textAlign: 'right', fontSize: '.7rem', color: '#9ca3af' }}>{notes.length}/500</span>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={selectedItems.size === 0 || isCheckingOut}
              style={{
                width: '100%', marginTop: 10, padding: '11px 12px', borderRadius: 10, border: 'none',
                background: '#111827', color: '#fff', fontWeight: 800, fontSize: '.88rem',
                cursor: (selectedItems.size === 0 || isCheckingOut) ? 'not-allowed' : 'pointer',
                opacity: (selectedItems.size === 0 || isCheckingOut) ? 0.5 : 1,
              }}
            >
              {isCheckingOut ? 'Preparing checkout...' : `Check out (${selectedItems.size})`}
            </button>

            <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 0', fontSize: '.74rem', color: '#6b7280' }}>
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
