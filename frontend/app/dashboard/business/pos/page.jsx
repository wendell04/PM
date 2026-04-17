'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPosProducts, submitWalkInOrder } from '@/lib/posApi';

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

// ── Styles ───────────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  backgroundColor: 'var(--dark)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--white)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
};

const btnGold = {
  padding: '10px 20px',
  backgroundColor: 'var(--gold)',
  color: '#000',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const btnGhost = {
  padding: '8px 14px',
  backgroundColor: 'var(--border)',
  color: 'var(--white)',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function PosPage() {
  const { token } = useAuth();

  // Products
  const [products, setProducts]       = useState([]);
  const [prodLoading, setProdLoading] = useState(true);
  const [search, setSearch]           = useState('');

  // Cart
  const [cart, setCart]               = useState([]); // { product, variantId, variantName, qty, unitPrice }

  // Variant picker modal
  const [variantModal, setVariantModal]   = useState(null); // product to pick variant for
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [variantQty, setVariantQty]       = useState(1);

  // Customer info
  const [customerName, setCustomerName]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes]                 = useState('');

  // Submit
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [receipt, setReceipt]         = useState(null); // success receipt data

  // ── Load products ──────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    if (!token) return;
    setProdLoading(true);
    try {
      const data = await fetchPosProducts(token, search);
      // Exclude inquiry-only products
      setProducts(data.filter(p => p.priceType !== 'inquiry'));
    } catch {
      setProducts([]);
    } finally {
      setProdLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    const t = setTimeout(loadProducts, 300);
    return () => clearTimeout(t);
  }, [loadProducts]);

  // ── Add to cart ────────────────────────────────────────────────────────────
  function handleAddProduct(product) {
    const variants = getVariantOptions(product);
    if (variants.length > 0) {
      setSelectedVariant(variants[0]);
      setVariantQty(1);
      setVariantModal(product);
      return;
    }
    // No variants — add directly with qty 1
    const price = resolvePrice(product, 1, null);
    if (price === null) return; // inquiry product slipped through
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
    const key = `${product._id}__${variantId ?? ''}`;
    setCart(prev => {
      const existing = prev.find(c => c.key === key);
      if (existing) {
        return prev.map(c => c.key === key
          ? { ...c, qty: c.qty + qty }
          : c
        );
      }
      return [...prev, { key, product, variantId, variantName, qty, unitPrice }];
    });
  }

  function updateQty(key, delta) {
    setCart(prev => prev
      .map(c => c.key === key ? { ...c, qty: Math.max(1, c.qty + delta) } : c)
    );
  }

  function setQtyDirect(key, val) {
    const n = parseInt(val);
    if (isNaN(n) || n < 1) return;
    setCart(prev => prev.map(c => c.key === key ? { ...c, qty: n } : c));
  }

  function removeFromCart(key) {
    setCart(prev => prev.filter(c => c.key !== key));
  }

  function clearCart() {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setSubmitError(null);
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const total = cart.reduce((sum, c) => sum + c.unitPrice * c.qty, 0);

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!customerName.trim()) { setSubmitError('Customer name is required.'); return; }
    if (cart.length === 0)    { setSubmitError('Cart is empty.'); return; }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        customerName:  customerName.trim(),
        customerPhone: customerPhone.trim() || null,
        notes:         notes.trim() || null,
        items: cart.map(c => ({
          productId:   c.product._id,
          variantId:   c.variantId   ?? null,
          variantName: c.variantName ?? null,
          qty:         c.qty,
          unitPrice:   c.unitPrice,
        })),
      };

      const data = await submitWalkInOrder(token, payload);
      setReceipt(data.data);
      clearCart();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Receipt modal ──────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <div style={{ padding: '2rem', maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2.5rem 2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
          <h2 style={{ margin: '0 0 0.25rem', color: 'var(--white)', fontWeight: 700 }}>Order Recorded</h2>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--gray)', fontSize: '0.875rem' }}>Walk-in sale logged and inventory updated.</p>

          <div style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
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
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
                  <span>{item.productName}{item.variantName ? ` — ${item.variantName}` : ''} × {item.qty}</span>
                  <span>{formatPrice(item.lineTotal)}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => setReceipt(null)} style={{ ...btnGold, width: '100%' }}>
            New Sale
          </button>
        </div>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '1.5rem', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>POS / Walk-in</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--gray)' }}>Record in-person sales and update inventory instantly</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── LEFT: Product Picker ── */}
        <div>
          {/* Search */}
          <div style={{ marginBottom: '1rem' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              style={inputStyle}
            />
          </div>

          {/* Product Grid */}
          {prodLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>Loading products…</div>
          ) : products.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>No products found.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
              {products.map(product => {
                const price = resolvePrice(product, 1, null);
                const hasVariants = getVariantOptions(product).length > 0;
                const thumb = product.thumbnail || product.images?.[0];
                return (
                  <div
                    key={product._id}
                    onClick={() => handleAddProduct(product)}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    {/* Thumbnail */}
                    <div style={{ height: '120px', background: 'var(--dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {thumb
                        ? <img src={thumb} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: '2rem', opacity: 0.3 }}>🖨️</span>
                      }
                    </div>
                    {/* Info */}
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

        {/* ── RIGHT: Cart + Order ── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', position: 'sticky', top: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Cart</h3>

          {/* Cart items */}
          {cart.length === 0 ? (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>No items added yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', maxHeight: '280px', overflowY: 'auto' }}>
              {cart.map(c => (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'var(--dark)', borderRadius: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.product.name}
                    </div>
                    {c.variantName && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{c.variantName}</div>
                    )}
                    <div style={{ fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 700 }}>{formatPrice(c.unitPrice)}</div>
                  </div>
                  {/* Qty controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button onClick={() => updateQty(c.key, -1)} style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'var(--border)', border: 'none', color: 'var(--white)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <input
                      type="number"
                      value={c.qty}
                      onChange={e => setQtyDirect(c.key, e.target.value)}
                      style={{ width: '38px', textAlign: 'center', padding: '2px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--white)', fontSize: '0.8rem' }}
                    />
                    <button onClick={() => updateQty(c.key, 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'var(--border)', border: 'none', color: 'var(--white)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--white)', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                    {formatPrice(c.unitPrice * c.qty)}
                  </div>
                  <button onClick={() => removeFromCart(c.key)} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border)', marginBottom: '1rem' }}>
            <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Total</span>
            <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '1.1rem' }}>{formatPrice(total)}</span>
          </div>

          {/* Customer info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.3rem' }}>
                Customer Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Juan dela Cruz" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.3rem' }}>Phone (optional)</label>
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="e.g. 09171234567" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.3rem' }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for this sale…" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>

          {/* Error */}
          {submitError && (
            <div style={{ marginBottom: '0.75rem', padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '0.8rem' }}>
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={clearCart} disabled={submitting} style={{ ...btnGhost, flex: 1 }}>Clear</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || cart.length === 0 || !customerName.trim()}
              style={{
                ...btnGold,
                flex: 2,
                opacity: (submitting || cart.length === 0 || !customerName.trim()) ? 0.6 : 1,
                cursor: (submitting || cart.length === 0 || !customerName.trim()) ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Processing…' : `Charge ${formatPrice(total)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Variant Picker Modal ── */}
      {variantModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>{variantModal.name}</h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>Variant</label>
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
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>Quantity</label>
              <input type="number" min="1" value={variantQty} onChange={e => setVariantQty(Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} />
            </div>

            {selectedVariant && (
              <div style={{ marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--gray)' }}>
                Unit price: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{formatPrice(resolvePrice(variantModal, variantQty, selectedVariant.id) ?? selectedVariant.price)}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => { setVariantModal(null); setSelectedVariant(null); }} style={{ ...btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={confirmVariant} style={{ ...btnGold, flex: 2 }}>Add to Cart</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

