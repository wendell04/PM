'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { fetchProducts } from '@/lib/productApi';
import { submitWalkInOrder } from '@/lib/posApi';
import ErrorBoundary from '@/components/ErrorBoundary';

// ── Price resolver (mirrors backend resolvePrice) ────────────────────────────
function resolvePrice(product, qty = 1, variantId = null) {
  if (variantId && product.variantPrices && product.variantPrices[variantId] != null) {
    return parseFloat(product.variantPrices[variantId]);
  }
  const tiers = product.priceTiers ?? [];
  if (tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => (a.minQty ?? 0) - (b.minQty ?? 0));
    let matched = null;
    for (const tier of sorted) {
      const min = parseInt(tier.minQty ?? 1);
      const max = tier.maxQty != null ? parseInt(tier.maxQty) : Infinity;
      if (qty >= min && qty <= max) { matched = parseFloat(tier.price); break; }
    }
    if (matched === null && sorted.length > 0) matched = parseFloat(sorted[sorted.length - 1].price);
    if (matched !== null) return matched;
  }
  if (product.price != null)     return parseFloat(product.price);
  if (product.flatPrice != null) return parseFloat(product.flatPrice);
  return null;
}

function formatPrice(n) {
  if (n == null) return '—';
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Variant helpers ──────────────────────────────────────────────────────────
function getVariantOptions(product) {
  if (!product.variantPrices || !Object.keys(product.variantPrices).length) return [];
  return Object.keys(product.variantPrices).map(key => ({
    id:    key,
    label: key,
    price: parseFloat(product.variantPrices[key]),
  }));
}

// ── Styles (design system) ───────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  backgroundColor: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: 'var(--white)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
};

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
};

const btnGold = {
  padding: '0.625rem 1rem',
  backgroundColor: 'var(--gold)',
  color: 'var(--black)',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const btnGhost = {
  padding: '0.625rem 1rem',
  backgroundColor: 'rgba(255,255,255,0.06)',
  color: 'var(--white)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

function IconSuccess() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="var(--gold)" strokeWidth="1.5" />
      <path d="M8 12l2.5 2.5L16 9" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPrintPlaceholder() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9V3h12v6" stroke="var(--gray)" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="4" y="9" width="16" height="10" rx="2" stroke="var(--gray)" strokeWidth="1.25" />
      <path d="M8 19v2h8v-2" stroke="var(--gray)" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconCartEmpty() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2" stroke="var(--gray)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1" fill="var(--gray)" />
      <circle cx="18" cy="20" r="1" fill="var(--gray)" />
    </svg>
  );
}

function ProductGridSkeleton() {
  const bar = { background: 'var(--dark2)', borderRadius: '4px', opacity: 0.85 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={`sk-${i}`} style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ height: '120px', background: 'var(--dark2)' }} />
          <div style={{ padding: '0.75rem' }}>
            <div style={{ height: '12px', ...bar, marginBottom: '0.5rem' }} />
            <div style={{ height: '10px', width: '60%', ...bar }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PosPage() {
  const { token, currentUser } = useAuth();

  const [allProducts, setAllProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [prodError, setProdError] = useState(null);
  const [search, setSearch] = useState('');

  const [cart, setCart] = useState([]);

  const [variantModal, setVariantModal] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [variantQty, setVariantQty] = useState(1);

  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');

  const [discountMode, setDiscountMode] = useState('peso');
  const [discountInput, setDiscountInput] = useState('');

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountTendered, setAmountTendered] = useState('');

  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const loadProducts = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setProdError(null);
    try {
      const data = await fetchProducts(token);
      const list = Array.isArray(data) ? data : [];
      setAllProducts(list.filter(p => p.priceType !== 'inquiry'));
    } catch (e) {
      setProdError(e.message || 'Failed to load products.');
      setAllProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter(p => {
      const name = (p.name || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      return name.includes(q) || cat.includes(q);
    });
  }, [allProducts, search]);

  function handleAddProduct(product) {
    const variants = getVariantOptions(product);
    if (variants.length > 0) {
      setSelectedVariant(variants[0]);
      setVariantQty(1);
      setVariantModal(product);
      return;
    }
    const price = resolvePrice(product, 1, null);
    if (price === null) return;
    addToCart(product, null, null, 1, price);
  }

  function confirmVariant() {
    if (!variantModal || !selectedVariant) return;
    const price = resolvePrice(variantModal, variantQty, selectedVariant.id);
    addToCart(variantModal, selectedVariant.id, selectedVariant.label, variantQty, price ?? selectedVariant.price);
    setVariantModal(null);
    setSelectedVariant(null);
    setVariantQty(1);
  }

  function addToCart(product, variantId, variantName, qty, unitPrice) {
    const key = `${product.id || product._id}__${variantId ?? ''}`;
    setCart(prev => {
      const existing = prev.find(c => c.key === key);
      if (existing) {
        const newQty = existing.qty + qty;
        const price = resolvePrice(product, newQty, variantId) ?? unitPrice;
        return prev.map(c =>
          c.key === key ? { ...c, qty: newQty, unitPrice: price } : c
        );
      }
      return [...prev, { key, product, variantId, variantName, qty, unitPrice }];
    });
  }

  function updateQty(key, delta) {
    setCart(prev => prev.map(c => {
      if (c.key !== key) return c;
      const newQty = Math.max(1, c.qty + delta);
      const price = resolvePrice(c.product, newQty, c.variantId);
      return { ...c, qty: newQty, unitPrice: price ?? c.unitPrice };
    }));
  }

  function setQtyDirect(key, val) {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1) return;
    setCart(prev => prev.map(c => {
      if (c.key !== key) return c;
      const price = resolvePrice(c.product, n, c.variantId);
      return { ...c, qty: n, unitPrice: price ?? c.unitPrice };
    }));
  }

  function removeFromCart(key) {
    setCart(prev => prev.filter(c => c.key !== key));
  }

  function clearCart() {
    setCart([]);
    setCustomerName('');
    setNotes('');
    setDiscountInput('');
    setAmountTendered('');
    setPaymentMethod('cash');
    setSubmitError(null);
    setShowPreview(false);
  }

  const subtotal = cart.reduce((sum, c) => sum + c.unitPrice * c.qty, 0);

  const discountPeso = useMemo(() => {
    const raw = parseFloat(String(discountInput).replace(/,/g, ''));
    if (isNaN(raw) || raw <= 0) return 0;
    if (discountMode === 'percent') {
      return Math.min(subtotal, Math.round((subtotal * raw) / 100 * 100) / 100);
    }
    return Math.min(subtotal, raw);
  }, [discountInput, discountMode, subtotal]);

  const netTotal = Math.max(0, Math.round((subtotal - discountPeso) * 100) / 100);

  const tenderNum = parseFloat(String(amountTendered).replace(/,/g, ''));
  const changeDue = paymentMethod === 'cash' && !isNaN(tenderNum)
    ? Math.max(0, Math.round((tenderNum - netTotal) * 100) / 100)
    : 0;

  function openPreview() {
    setSubmitError(null);
    if (cart.length === 0) {
      setSubmitError('Cart is empty.');
      return;
    }
    if (paymentMethod === 'cash') {
      if (amountTendered.trim() === '' || isNaN(tenderNum) || tenderNum < netTotal) {
        setSubmitError('Enter a cash amount tendered that covers the total.');
        return;
      }
    }
    setShowPreview(true);
  }

  async function confirmOrder() {
    setSubmitting(true);
    setSubmitError(null);
    const name = customerName.trim() || 'Walk-in Customer';
    const items = cart.map(c => ({
      productId: String(c.product.id || c.product._id),
      name: c.product.name,
      quantity: c.qty,
      price: c.unitPrice,
      variantId: c.variantId ?? undefined,
      variantLabel: c.variantName ?? undefined,
    }));

    const payload = {
      customerName: name,
      items,
      paymentMethod,
      discount: discountPeso,
      notes: notes.trim() || undefined,
      amountTendered: paymentMethod === 'cash' ? tenderNum : netTotal,
    };

    try {
      const data = await submitWalkInOrder(token, payload);
      const payloadData = data.data ?? data;
      setReceipt(payloadData);
      clearCart();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <div style={{ padding: '2rem', maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
        <div style={{ ...cardStyle, padding: '2.5rem 2rem' }}>
          <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}><IconSuccess /></div>
          <h2 style={{ margin: '0 0 0.25rem', color: 'var(--white)', fontWeight: 700 }}>Order Recorded</h2>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--gray)', fontSize: '0.875rem' }}>Walk-in sale logged and inventory updated.</p>

          <div style={{ ...cardStyle, padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>Order Ref</span>
              <span style={{ color: 'var(--gold)', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.875rem' }}>#{receipt.orderRef}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>Total</span>
              <span style={{ color: 'var(--white)', fontWeight: 700, fontSize: '0.875rem' }}>{formatPrice(receipt.totalAmount)}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              {(receipt.items ?? []).map((item, i) => (
                <div key={`${item.productId ?? 'line'}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
                  <span>{item.productName}{item.variantName ? ` — ${item.variantName}` : ''} × {item.qty}</span>
                  <span>{formatPrice(item.lineTotal)}</span>
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={() => setReceipt(null)} style={{ ...btnGold, width: '100%' }}>
            New Sale
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div style={{ padding: '1.5rem', maxWidth: '1300px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title">Point of Sale</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--gray)' }}>
          Record in-person sales and update inventory instantly
          {currentUser?.name ? ` | ${currentUser.name}` : ''}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>

        <div>
          <div style={{ marginBottom: '1rem' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or category…"
              style={inputStyle}
              aria-label="Search products"
            />
          </div>

          {isLoading ? (
            <ProductGridSkeleton />
          ) : prodError ? (
            <div style={{ ...cardStyle, padding: '2rem', textAlign: 'center', color: 'var(--gray)' }}>
              {prodError}
              <div style={{ marginTop: '1rem' }}>
                <button type="button" onClick={loadProducts} style={btnGhost}>Retry</button>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div style={{ ...cardStyle, padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
              No products match your search.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
              {products.map(product => {
                const price = resolvePrice(product, 1, null);
                const hasVariants = getVariantOptions(product).length > 0;
                const thumb = product.thumbnail || product.images?.[0];
                return (
                  <div
                    key={String(product.id || product._id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAddProduct(product); } }}
                    onClick={() => handleAddProduct(product)}
                    style={{
                      ...cardStyle,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                  >
                    <div style={{ height: '120px', background: 'var(--dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      {thumb
                        ? (typeof thumb === 'string' && thumb.includes('res.cloudinary.com')
                          ? <Image src={thumb} alt="" fill sizes="(max-width: 768px) 50vw, 200px" style={{ objectFit: 'cover' }} />
                          : <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                        : <IconPrintPlaceholder />}
                    </div>
                    <div style={{ padding: '0.75rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {product.name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 700 }}>
                        {hasVariants ? 'Select variant' : (price !== null ? formatPrice(price) : '—')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, padding: '1.25rem', position: 'sticky', top: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Cart</h3>

          {cart.length === 0 ? (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}><IconCartEmpty /></div>
              No items added yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', maxHeight: '280px', overflowY: 'auto' }}>
              {cart.map(c => (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.product.name}
                    </div>
                    {c.variantName && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{c.variantName}</div>
                    )}
                    <div style={{ fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 700 }}>{formatPrice(c.unitPrice)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => updateQty(c.key, -1)} style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--white)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <input
                      type="number"
                      min={1}
                      value={c.qty}
                      onChange={e => setQtyDirect(c.key, e.target.value)}
                      style={{ width: '42px', textAlign: 'center', padding: '0.25rem', ...inputStyle, fontSize: '0.8rem' }}
                    />
                    <button type="button" onClick={() => updateQty(c.key, 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--white)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--white)', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                    {formatPrice(c.unitPrice * c.qty)}
                  </div>
                  <button type="button" onClick={() => removeFromCart(c.key)} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', lineHeight: 1 }} aria-label="Remove">×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Subtotal</span>
            <span style={{ color: 'var(--white)', fontWeight: 600, fontSize: '0.95rem' }}>{formatPrice(subtotal)}</span>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.375rem' }}>Discount</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <select value={discountMode} onChange={e => setDiscountMode(e.target.value)} style={{ ...inputStyle, flex: '0 0 110px' }}>
                <option value="peso">Amount (₱)</option>
                <option value="percent">Percent (%)</option>
              </select>
              <input
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
                placeholder={discountMode === 'percent' ? 'e.g. 10' : '0.00'}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
            {discountPeso > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Discount applied: −{formatPrice(discountPeso)}</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 1rem', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Total</span>
            <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '1.1rem' }}>{formatPrice(netTotal)}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.375rem' }}>Customer name (optional)</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Defaults to Walk-in Customer" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.375rem' }}>Payment</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setPaymentMethod('cash')} style={{ ...btnGhost, flex: 1, borderColor: paymentMethod === 'cash' ? 'var(--gold)' : 'var(--border)', borderWidth: '1px' }}>Cash</button>
                <button type="button" onClick={() => setPaymentMethod('gcash')} style={{ ...btnGhost, flex: 1, borderColor: paymentMethod === 'gcash' ? 'var(--gold)' : 'var(--border)', borderWidth: '1px' }}>GCash</button>
              </div>
            </div>
            {paymentMethod === 'cash' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.375rem' }}>Amount tendered</label>
                <input value={amountTendered} onChange={e => setAmountTendered(e.target.value)} placeholder="0.00" style={inputStyle} />
                {amountTendered !== '' && !isNaN(tenderNum) && (
                  <div style={{ marginTop: '0.375rem', fontSize: '0.8rem', color: 'var(--gray)' }}>
                    Change: <span style={{ color: 'var(--white)', fontWeight: 600 }}>{formatPrice(changeDue)}</span>
                  </div>
                )}
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.375rem' }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for this sale…" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>

          {submitError && (
            <div style={{ marginBottom: '0.75rem', padding: '0.625rem 0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', color: 'rgba(239,68,68,1)', fontSize: '0.8rem' }}>
              {submitError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={clearCart} disabled={submitting} style={{ ...btnGhost, flex: 1 }}>Clear</button>
            <button
              type="button"
              onClick={openPreview}
              disabled={submitting || cart.length === 0}
              style={{
                ...btnGold,
                flex: 2,
                opacity: (submitting || cart.length === 0) ? 0.6 : 1,
                cursor: (submitting || cart.length === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              Review &amp; pay
            </button>
          </div>
        </div>
      </div>

      {variantModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ ...cardStyle, padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>{variantModal.name}</h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.375rem' }}>Variant</label>
              <select
                value={selectedVariant?.id ?? ''}
                onChange={e => {
                  const v = getVariantOptions(variantModal).find(o => o.id === e.target.value);
                  setSelectedVariant(v ?? null);
                }}
                style={inputStyle}
              >
                {getVariantOptions(variantModal).map(v => (
                  <option key={v.id} value={v.id}>{v.label} — {formatPrice(v.price)}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.375rem' }}>Quantity</label>
              <input type="number" min="1" value={variantQty} onChange={e => setVariantQty(Math.max(1, parseInt(e.target.value, 10) || 1))} style={inputStyle} />
            </div>

            {selectedVariant && (
              <div style={{ marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--gray)' }}>
                Unit price:{' '}
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                  {formatPrice(resolvePrice(variantModal, variantQty, selectedVariant.id) ?? selectedVariant.price)}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => { setVariantModal(null); setSelectedVariant(null); }} style={{ ...btnGhost, flex: 1 }}>Cancel</button>
              <button type="button" onClick={confirmVariant} style={{ ...btnGold, flex: 2 }}>Add to Cart</button>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ ...cardStyle, padding: '2rem', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>Receipt preview</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--gray)' }}>Confirm this walk-in sale before charging.</p>

            <div style={{ ...cardStyle, padding: '1rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
              {cart.map(c => (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--gray)' }}>
                  <span>
                    {c.product.name}
                    {c.variantName ? ` — ${c.variantName}` : ''} × {c.qty}
                  </span>
                  <span style={{ color: 'var(--white)', fontWeight: 600 }}>{formatPrice(c.unitPrice * c.qty)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--gray)' }}>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discountPeso > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--gray)' }}>Discount</span>
                    <span>−{formatPrice(discountPeso)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--gold)', fontSize: '1rem' }}>
                  <span>Total</span>
                  <span>{formatPrice(netTotal)}</span>
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '1rem' }}>
              <div>Payment: <strong style={{ color: 'var(--white)' }}>{paymentMethod === 'cash' ? 'Cash' : 'GCash'}</strong></div>
              {paymentMethod === 'cash' && (
                <div style={{ marginTop: '0.35rem' }}>
                  Tendered: {formatPrice(tenderNum)} | Change: {formatPrice(changeDue)}
                </div>
              )}
              <div style={{ marginTop: '0.35rem' }}>
                Customer: {customerName.trim() || 'Walk-in Customer'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => { setShowPreview(false); }} disabled={submitting} style={{ ...btnGhost, flex: 1 }}>Back</button>
              <button type="button" onClick={confirmOrder} disabled={submitting} style={{ ...btnGold, flex: 2 }}>
                {submitting ? 'Processing…' : 'Confirm & charge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
