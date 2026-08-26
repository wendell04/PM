'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { fetchProducts } from '@/lib/productApi';
import { submitWalkInOrder, fetchProductAvailability } from '@/lib/posApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import { S, CustomSelect, SearchBar, EmptyState } from '../inventory-v2/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Input ceilings. A counter sale that needs more than these is a quotation, not a walk-in, and an
// uncapped number field is how a slipped keypress becomes a 900,000-piece order.
const MAX_LINE_QTY   = 9999;
const MAX_NAME_LEN   = 100;
const MAX_NOTES_LEN  = 500;
const MAX_TENDERED   = 1000000;

// ── Price resolver ───────────────────────────────────────────────────────────
// Mirrors App\Services\PriceResolver, which the walk-in endpoint validates against: send a price it
// disagrees with by more than a peso and the sale is rejected outright.
//
// A tier in this catalogue carries a `prices` MAP keyed by variant, not a single `price`:
//   { minQty: 1, maxQty: 10, prices: { 'mug-cw': 80, 'mug-ic': 85 } }
// The previous version only understood the single-price shape, so it read `tier.price` as undefined
// and returned null for every product in the catalogue - which is why the grid showed "-" throughout
// and nothing could be added to the cart.
function resolvePrice(product, qty = 1, variantId = null) {
  if (variantId && product.variantPrices && product.variantPrices[variantId] != null) {
    const p = parseFloat(product.variantPrices[variantId]);
    if (!isNaN(p)) return p;
  }

  const tiers = product.priceTiers ?? product.tiers ?? [];
  if (tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0));
    let matched = null;
    for (const tier of sorted) {
      const min = parseInt(tier.minQty) || 1;
      const max = (tier.maxQty !== null && tier.maxQty !== '' && tier.maxQty !== undefined)
        ? parseInt(tier.maxQty) : Infinity;
      if (qty >= min && qty <= max) { matched = tier; break; }
    }
    if (!matched) matched = sorted[sorted.length - 1];

    if (matched) {
      if (matched.prices && typeof matched.prices === 'object') {
        if (variantId && matched.prices[variantId] != null) {
          const p = parseFloat(matched.prices[variantId]);
          if (!isNaN(p)) return p;
        }
        // No variant chosen yet: quote the cheapest option, the "from" price a shop would show.
        const vals = Object.values(matched.prices).map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
        if (vals.length) return Math.min(...vals);
      } else if (matched.price != null) {
        const p = parseFloat(matched.price);
        if (!isNaN(p)) return p;
      }
    }
  }

  if (product.price != null)     { const p = parseFloat(product.price);     if (!isNaN(p)) return p; }
  if (product.flatPrice != null) { const p = parseFloat(product.flatPrice); if (!isNaN(p)) return p; }
  return null;
}

function formatPrice(n) {
  if (n == null || isNaN(n)) return '—';
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Keep a money field to digits and a single decimal point, capped at `max`. Returning '' for an
 * empty field matters: a cashier must be able to clear an amount and start over, which a field that
 * snaps back to 0 will not allow.
 */
function sanitiseAmount(raw, max = Infinity) {
  let s = String(raw).replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  if (s === '' || s === '.') return s === '.' ? '0.' : '';
  const [whole, dec] = s.split('.');
  if (dec !== undefined && dec.length > 2) s = `${whole}.${dec.slice(0, 2)}`;
  const n = parseFloat(s);
  if (!isNaN(n) && n > max) return String(Math.max(0, Math.floor(max * 100) / 100));
  return s;
}

// ── Variant helpers ──────────────────────────────────────────────────────────
// Variants are identified by id in the price data ('mug-cw') but named in `combinations`
// ('Ceramic White'). Reading only `variantPrices` missed every tier-priced product, so the cashier
// was never offered a choice and the sale fell back to the cheapest option silently.
function getVariantOptions(product, qty = 1) {
  const labelFor = (id) => {
    const combo = (product.combinations ?? []).find(c => String(c.id ?? c._id) === String(id));
    return combo?.name ?? combo?.label ?? id;
  };

  const ids = new Set();
  if (product.variantPrices) Object.keys(product.variantPrices).forEach(k => ids.add(k));
  (product.priceTiers ?? product.tiers ?? []).forEach(t => {
    if (t.prices) Object.keys(t.prices).forEach(k => ids.add(k));
  });
  if (ids.size === 0) return [];

  return Array.from(ids).map(id => ({
    id,
    label: labelFor(id),
    price: resolvePrice(product, qty, id),
  })).sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Derived from the shared tokens rather than hand-rolled, so the POS matches Orders, Inventory and
// the rest instead of being the one screen with its own radius, surface and button weight. Cards
// start unpadded because every use here supplies its own.
const inputStyle = S.input;
const cardStyle  = { ...S.card, padding: 0 };
const btnGold    = { ...S.btnPrimary, justifyContent: 'center' };
const btnGhost   = { ...S.btnGhost,   justifyContent: 'center' };

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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={`sk-${i}`} style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ height: '90px', background: 'var(--dark2)' }} />
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

  // What kind of transaction this is. 'collected' is a counter sale finished on the spot;
  // 'production' is work taken in (Messenger, phone, walk-in enquiry) that still has to be made and
  // therefore joins the same pipeline an online order uses.
  const [saleType,    setSaleType]    = useState('collected');
  const [paymentMode, setPaymentMode] = useState('full');
  const [amountPaid,  setAmountPaid]  = useState('');
  const [fulfillment, setFulfillment] = useState('collected');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountTendered, setAmountTendered] = useState('');

  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [receipt, setReceipt] = useState(null);

  // Every overlay in this app locks the page behind it; the POS modals were the exception.

  const loadProducts = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setProdError(null);
    try {
      const data = await fetchProducts(token);
      const list = Array.isArray(data) ? data : [];
      // Inquiry-priced services (T-Shirt Printing and the like) are kept, not dropped. They have no
      // catalogue price, so they are only offered in "To produce" mode where the agreed price is
      // typed in and the materials are picked by hand - the same shape the quotation uses.
      setAllProducts(list.filter(p => !p.isArchived));
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

  const isService = (p) => p.priceType === 'inquiry';

  const products = useMemo(() => {
    // A service has no price to ring up, so it has no place at the counter. It appears only when
    // taking in an order, where the agreed price is entered by hand.
    const base = saleType === 'production' ? allProducts : allProducts.filter(p => !isService(p));
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(p => {
      const name = (p.name || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      return name.includes(q) || cat.includes(q);
    });
  }, [allProducts, search, saleType]);

  // How many of each variant the materials on hand can actually make, keyed by product id. Fetched
  // when a product is picked rather than for the whole grid, so the counter stays fast.
  const [availability, setAvailability] = useState({});
  const [availLoading, setAvailLoading] = useState(false);

  const loadAvailability = useCallback(async (product) => {
    const pid = String(product.id || product._id);
    if (availability[pid]) return availability[pid];
    setAvailLoading(true);
    try {
      const data = await fetchProductAvailability(token, pid);
      const map = {};
      (data.variants ?? []).forEach(v => { map[v.variantId] = v.canBuild; });
      const entry = { map, hasBom: !!data.hasBom };
      setAvailability(prev => ({ ...prev, [pid]: entry }));
      return entry;
    } catch {
      return { map: {}, hasBom: false };
    } finally { setAvailLoading(false); }
  }, [token, availability]);

  /** Units still makeable for a variant. null means nothing constrains it (bought per order). */
  function buildableFor(product, variantId) {
    const pid = String(product.id || product._id);
    const entry = availability[pid];
    if (!entry || !entry.hasBom) return null;
    const v = entry.map[variantId ?? Object.keys(entry.map)[0]];
    return v === undefined ? null : v;
  }

  // ── Service lines (quotation-priced products with no recipe) ──────────────
  const [serviceModal, setServiceModal] = useState(null);
  const [svcPrice, setSvcPrice] = useState('');
  const [svcQty, setSvcQty] = useState(1);
  const [svcMaterials, setSvcMaterials] = useState([]);   // [{ inventoryId, name, uom, qty, stockQty }]
  const [matSearch, setMatSearch] = useState('');
  const [inventoryList, setInventoryList] = useState([]);

  // After the state it reads. Declared above them, `serviceModal` was still in its temporal dead
  // zone on first render and threw, which is what took the whole POS page down.
  useLockBodyScroll(!!variantModal || !!serviceModal || showPreview || !!receipt);

  // Master Data, loaded once, so a service can be linked to what it really consumes.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchWithTimeout(`${API_URL}/api/admin/inventory`, { headers: { Authorization: `Bearer ${token}` } }, 15000)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return;
        const list = d.data ?? (Array.isArray(d) ? d : []);
        setInventoryList(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const matResults = useMemo(() => {
    const q = matSearch.trim().toLowerCase();
    if (!q) return [];
    return inventoryList.filter(i => {
      const chosen = svcMaterials.some(m => m.inventoryId === String(i.id ?? i._id));
      if (chosen) return false;
      return `${i.name ?? ''} ${i.sku ?? ''} ${i.category ?? ''}`.toLowerCase().includes(q);
    }).slice(0, 8);
  }, [matSearch, inventoryList, svcMaterials]);

  function addMaterial(inv) {
    setSvcMaterials(prev => [...prev, {
      inventoryId: String(inv.id ?? inv._id),
      name: inv.name ?? 'Material',
      uom: inv.uom ?? '',
      qty: 1,
      stockQty: Number(inv.stockQty ?? 0),
    }]);
    setMatSearch('');
  }

  function confirmService() {
    if (!serviceModal) return;
    const price = parseFloat(String(svcPrice).replace(/,/g, ''));
    if (isNaN(price) || price <= 0) { setSubmitError('Enter the agreed price for this service.'); return; }
    const qty = Number(svcQty) || 1;
    addToCart(serviceModal, null, null, qty, price, svcMaterials);
    setServiceModal(null); setSvcPrice(''); setSvcQty(1); setSvcMaterials([]); setMatSearch('');
  }

  async function handleAddProduct(product) {
    setSubmitError(null);

    // A quotation-priced service: the price was agreed elsewhere and the materials are not in a
    // recipe, so both are captured here rather than guessed.
    if (isService(product)) {
      setServiceModal(product);
      setSvcPrice(''); setSvcQty(1); setSvcMaterials([]); setMatSearch('');
      return;
    }

    const variants = getVariantOptions(product, 1);
    if (variants.length > 0) {
      setSelectedVariant(variants[0]);
      setVariantQty(1);
      setVariantModal(product);
      loadAvailability(product);
      return;
    }
    const price = resolvePrice(product, 1, null);
    if (price === null) {
      setSubmitError(`"${product.name}" has no price set. Add one in Products before selling it.`);
      return;
    }
    // Check before it reaches the cart: selling stock that is not there is the one mistake a counter
    // screen must not let through.
    const entry = await loadAvailability(product);
    const canBuild = entry?.hasBom ? entry.map[Object.keys(entry.map)[0]] : null;
    const already = cart.find(c => c.key === `${product.id || product._id}__`)?.qty ?? 0;
    if (canBuild !== null && canBuild !== undefined && already + 1 > canBuild) {
      setSubmitError(`Only ${canBuild} of "${product.name}" can be made with the materials on hand.`);
      return;
    }
    addToCart(product, null, null, 1, price);
  }

  function confirmVariant() {
    if (!variantModal || !selectedVariant) return;
    const qty = Number(variantQty) || 1;
    const price = resolvePrice(variantModal, qty, selectedVariant.id);
    if (price === null) {
      setSubmitError(`No price is set for that option of "${variantModal.name}".`);
      return;
    }
    const canBuild = buildableFor(variantModal, selectedVariant.id);
    const already = cart.find(c => c.key === `${variantModal.id || variantModal._id}__${selectedVariant.id}`)?.qty ?? 0;
    if (canBuild !== null && already + qty > canBuild) {
      setSubmitError(`Only ${canBuild} of ${selectedVariant.label} can be made with the materials on hand${already ? ` (${already} already in the cart)` : ''}.`);
      return;
    }
    addToCart(variantModal, selectedVariant.id, selectedVariant.label, qty, price);
    setVariantModal(null);
    setSelectedVariant(null);
    setVariantQty(1);
  }

  function addToCart(product, variantId, variantName, qty, unitPrice, materials = null) {
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
      return [...prev, { key, product, variantId, variantName, qty, unitPrice, materials }];
    });
  }

  function updateQty(key, delta) {
    setCart(prev => prev.map(c => {
      if (c.key !== key) return c;
      const newQty = Math.min(MAX_LINE_QTY, Math.max(1, c.qty + delta));
      const price = resolvePrice(c.product, newQty, c.variantId);
      return { ...c, qty: newQty, unitPrice: price ?? c.unitPrice };
    }));
  }

  function setQtyDirect(key, val) {
    // Blank is allowed while typing so the field can be cleared; it settles back to 1 on blur.
    if (String(val).trim() === '') {
      setCart(prev => prev.map(c => (c.key === key ? { ...c, qtyDraft: '' } : c)));
      return;
    }
    const n = parseInt(String(val).replace(/[^\d]/g, ''), 10);
    if (isNaN(n)) return;
    const clamped = Math.min(MAX_LINE_QTY, Math.max(1, n));
    setCart(prev => prev.map(c => {
      if (c.key !== key) return c;
      const price = resolvePrice(c.product, clamped, c.variantId);
      return { ...c, qty: clamped, qtyDraft: undefined, unitPrice: price ?? c.unitPrice };
    }));
  }

  function commitQty(key) {
    setCart(prev => prev.map(c => (c.key === key && c.qtyDraft === '' ? { ...c, qtyDraft: undefined } : c)));
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
    setSaleType('collected');
    setPaymentMode('full');
    setAmountPaid('');
    setFulfillment('collected');
    setCustomerPhone('');
    setDeliveryAddress('');
    setTargetDate('');
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

  // How much is changing hands right now, and what is left owing. A counter sale settles in full; an
  // order taken in may be a downpayment, or nothing yet.
  const paidNow = useMemo(() => {
    if (paymentMode === 'full')   return netTotal;
    if (paymentMode === 'unpaid') return 0;
    const n = parseFloat(String(amountPaid).replace(/,/g, ''));
    return isNaN(n) ? 0 : Math.min(netTotal, Math.max(0, n));
  }, [paymentMode, amountPaid, netTotal]);

  const balanceDue = Math.max(0, Math.round((netTotal - paidNow) * 100) / 100);

  const tenderNum = parseFloat(String(amountTendered).replace(/,/g, ''));
  // Change is against what is being collected now, not the order total - handing back the difference
  // from the full total on a downpayment would give away the balance.
  const changeDue = paymentMethod === 'cash' && !isNaN(tenderNum)
    ? Math.max(0, Math.round((tenderNum - paidNow) * 100) / 100)
    : 0;

  function openPreview() {
    setSubmitError(null);
    if (cart.length === 0) {
      setSubmitError('Cart is empty.');
      return;
    }
    // A service was priced by quotation and still has to be done; it cannot be a hand-it-over sale.
    const svc = cart.find(c => isService(c.product));
    if (saleType === 'collected' && svc) {
      setSubmitError(`"${svc.product.name}" is a quoted service and still has to be produced. Switch to "To produce", or remove it.`);
      return;
    }
    if (saleType === 'collected' && paymentMode !== 'full') {
      setSubmitError('Goods handed over must be settled in full. Choose "Order to produce" if the customer is only paying a deposit.');
      return;
    }
    if (paymentMode === 'downpayment' && paidNow <= 0) {
      setSubmitError('Enter the deposit amount being paid now.');
      return;
    }
    if (paidNow > 0 && paymentMethod === 'cash') {
      if (amountTendered.trim() === '' || isNaN(tenderNum) || tenderNum < paidNow) {
        setSubmitError(`Enter a cash amount that covers ${formatPrice(paidNow)}.`);
        return;
      }
    }
    if (fulfillment === 'delivery' && deliveryAddress.trim() === '') {
      setSubmitError('Enter the delivery address.');
      return;
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
      // Only service lines carry these; everything else is priced and consumed from its recipe.
      materials: c.materials?.length ? c.materials.map(m => ({
        inventoryId: m.inventoryId, name: m.name, qty: Number(m.qty) || 0,
      })) : undefined,
    }));

    const payload = {
      customerName: name,
      items,
      paymentMethod,
      discount: discountPeso,
      notes: notes.trim() || undefined,
      amountTendered: paymentMethod === 'cash' ? tenderNum : paidNow,
      saleType,
      paymentMode,
      amountPaid: paidNow,
      fulfillment,
      customerPhone: customerPhone.trim() || undefined,
      deliveryAddress: fulfillment === 'delivery' ? (deliveryAddress.trim() || undefined) : undefined,
      targetDate: saleType === 'production' && targetDate ? targetDate : undefined,
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
          <h2 style={{ margin: '0 0 0.25rem', color: 'var(--white)', fontWeight: 700 }}>
            {receipt.saleType === 'production' ? 'Order Booked' : 'Sale Recorded'}
          </h2>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--gray)', fontSize: '0.875rem' }}>
            {receipt.saleType === 'production'
              ? 'Materials reserved. The order is now in Orders, ready for a job order.'
              : 'Goods handed over, stock deducted and the sale recorded.'}
          </p>

          <div style={{ ...cardStyle, padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>Order Ref</span>
              <span style={{ color: 'var(--gold)', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.875rem' }}>#{receipt.orderRef}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>Total</span>
              <span style={{ color: 'var(--white)', fontWeight: 700, fontSize: '0.875rem' }}>{formatPrice(receipt.totalAmount)}</span>
            </div>
            {receipt.amountPaid != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>Paid</span>
                <span style={{ color: 'var(--st-green-fg)', fontWeight: 700, fontSize: '0.875rem' }}>{formatPrice(receipt.amountPaid)}</span>
              </div>
            )}
            {Number(receipt.balance) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>Balance to collect</span>
                <span style={{ color: 'var(--st-amber-fg)', fontWeight: 700, fontSize: '0.875rem' }}>{formatPrice(receipt.balance)}</span>
              </div>
            )}
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
    <div style={S.page}>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: '1.25rem', alignItems: 'stretch', height: 'calc(100vh - 150px)', minHeight: '520px' }} className="pos-grid">

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ marginBottom: '0.75rem', flexShrink: 0 }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by name or category…"
              style={{ width: '100%' }}
            />
          </div>

          {/* The scrollbar used to be hidden here, which left anyone without a working mouse wheel
              with no way to reach the rest of the catalogue. It is visible and draggable now. */}
          <div className="pos-scroll" style={{ flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
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
            <div style={{ ...cardStyle }}>
              <EmptyState message="No products match your search" sub="Try a different name or category." />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
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
                    <div style={{ height: '90px', background: 'var(--dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      {thumb
                        ? (typeof thumb === 'string' && thumb.includes('res.cloudinary.com')
                          ? <Image src={thumb} alt="" fill sizes="(max-width: 768px) 50vw, 200px" style={{ objectFit: 'cover' }} />
                          // eslint-disable-next-line @next/next/no-img-element
                          : <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                        : <IconPrintPlaceholder />}
                    </div>
                    <div style={{ padding: '0.5rem 0.6rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.2rem', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {product.name}
                      </div>
                      {/* A counter screen has to show money. Saying only "Select variant" left the
                          whole grid priceless - the cashier had to open each product to learn what
                          it costs. Variants differ, so the cheapest is quoted as a "from" price. */}
                      <div style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700 }}>
                        {isService(product)
                          ? 'Quoted price'
                          : price !== null
                            ? (hasVariants ? `from ${formatPrice(price)}` : formatPrice(price))
                            : 'No price set'}
                      </div>
                      {hasVariants && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '1px' }}>
                          Select variant
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        <div className="pos-cart pos-scroll" style={{ ...cardStyle, padding: '1.25rem', overflowY: 'auto', minHeight: 0 }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
            {saleType === 'collected' ? 'Counter Sale' : 'Order Taken In'}
          </h3>

          {/* What kind of transaction this is decides everything below it, so it comes first. */}
          <div style={{ display: 'flex', gap: '6px', padding: '3px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '0.5rem' }}>
            {[
              { v: 'collected',  label: 'Collected now', hint: 'Goods handed over' },
              { v: 'production', label: 'To produce',    hint: 'Still to be made' },
            ].map(t => {
              const on = saleType === t.v;
              return (
                <button key={t.v} type="button"
                  onClick={() => {
                    setSaleType(t.v);
                    setFulfillment(t.v === 'collected' ? 'collected' : 'pickup');
                    setPaymentMode(t.v === 'collected' ? 'full' : 'downpayment');
                    setAmountPaid('');
                  }}
                  style={{ flex: 1, padding: '7px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: on ? 'var(--gold)' : 'transparent', color: on ? 'var(--black)' : 'var(--gray)',
                    fontWeight: 700, fontSize: '0.75rem', lineHeight: 1.25 }}>
                  {t.label}
                  <div style={{ fontWeight: 500, fontSize: '0.65rem', opacity: on ? 0.75 : 0.85 }}>{t.hint}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.9rem', lineHeight: 1.5 }}>
            {saleType === 'collected'
              ? 'Stock is deducted and the sale is recorded straight away.'
              : 'Materials are reserved, not consumed. The order joins production and is invoiced as it completes.'}
          </div>

          {cart.length === 0 ? (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}><IconCartEmpty /></div>
              No items added yet.
            </div>
          ) : (
            <div className="pos-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', maxHeight: '280px', overflowY: 'auto', paddingRight: '6px' }}>
              {cart.map(c => (
                /* Two rows, not one. Cramming the name, stepper, line total and remove button into a
                   single row left the name about forty pixels wide - "W / Squ" was all you could
                   read. The name now owns its own line and the controls sit beneath it. */
                <div key={c.key} style={{ padding: '0.6rem 0.65rem', background: 'var(--dark)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)', lineHeight: 1.35 }}>
                        {c.product.name}
                      </div>
                      {c.variantName && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '1px' }}>{c.variantName}</div>
                      )}
                    </div>
                    <button type="button" onClick={() => removeFromCart(c.key)}
                      style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1.05rem', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                      aria-label={`Remove ${c.product?.name ?? 'item'}`}>×</button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <button type="button" onClick={() => updateQty(c.key, -1)} aria-label="Decrease quantity"
                        style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'var(--dark2)', border: '1px solid var(--border)', color: 'var(--white)', cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>-</button>
                      <input
                        inputMode="numeric"
                        value={c.qtyDraft !== undefined ? c.qtyDraft : c.qty}
                        onChange={e => setQtyDirect(c.key, e.target.value)}
                        onBlur={() => commitQty(c.key)}
                        aria-label={`Quantity for ${c.product?.name ?? 'item'}`}
                        /* Spread first: inputStyle carries width:100% and would otherwise override
                           the fixed width and blow the row apart. */
                        style={{ ...inputStyle, width: '52px', textAlign: 'center', padding: '3px 4px', fontSize: '0.8rem' }}
                      />
                      <button type="button" onClick={() => updateQty(c.key, 1)} aria-label="Increase quantity"
                        style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'var(--dark2)', border: '1px solid var(--border)', color: 'var(--white)', cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', flex: 1, minWidth: 0 }}>
                      x {formatPrice(c.unitPrice)}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--white)', fontWeight: 700, flexShrink: 0 }}>
                      {formatPrice(c.unitPrice * c.qty)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Subtotal</span>
            <span style={{ color: 'var(--white)', fontWeight: 600, fontSize: '0.95rem' }}>{formatPrice(subtotal)}</span>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Discount</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <CustomSelect
                value={discountMode}
                onChange={v => { setDiscountMode(v); setDiscountInput(''); }}
                options={[{ value: 'peso', label: 'Amount (₱)' }, { value: 'percent', label: 'Percent (%)' }]}
                style={{ flex: '0 0 128px' }}
              />
              <input
                inputMode="decimal"
                value={discountInput}
                onChange={e => setDiscountInput(sanitiseAmount(e.target.value, discountMode === 'percent' ? 100 : subtotal))}
                placeholder={discountMode === 'percent' ? 'e.g. 10' : '0.00'}
                style={{ ...inputStyle, flex: 1 }}
                disabled={cart.length === 0}
              />
            </div>
            {discountPeso > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                Discount applied: -{formatPrice(discountPeso)}
                {discountMode === 'percent' ? ` (${discountInput}% of ${formatPrice(subtotal)})` : ''}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 1rem', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Total</span>
            <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '1.1rem' }}>{formatPrice(netTotal)}</span>
          </div>

          {/* Settlement. A counter sale is always paid in full; an order taken in usually is not. */}
          {saleType === 'production' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Paying now</label>
              <CustomSelect
                value={paymentMode}
                onChange={v => { setPaymentMode(v); setAmountPaid(''); }}
                options={[
                  { value: 'downpayment', label: 'Deposit' },
                  { value: 'full',        label: 'Paid in full' },
                  { value: 'unpaid',      label: 'Nothing yet' },
                ]}
                style={{ width: '100%' }}
              />
              {paymentMode === 'downpayment' && (
                <input
                  inputMode="decimal"
                  value={amountPaid}
                  onChange={e => setAmountPaid(sanitiseAmount(e.target.value, netTotal))}
                  placeholder={netTotal > 0 ? `Half is ${(netTotal / 2).toFixed(2)}` : '0.00'}
                  style={{ ...inputStyle, marginTop: '0.5rem' }}
                />
              )}
              {balanceDue > 0 && (
                <div style={{ marginTop: '0.5rem', padding: '8px 10px', background: 'var(--st-amber-bg)', borderRadius: 8, fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--gray)' }}>Balance to collect</span>
                  <span style={{ color: 'var(--st-amber-fg)', fontWeight: 700 }}>{formatPrice(balanceDue)}</span>
                </div>
              )}
            </div>
          )}

          {/* How the goods reach the customer. */}
          {saleType === 'production' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Fulfilment</label>
              <CustomSelect
                value={fulfillment}
                onChange={setFulfillment}
                options={[
                  { value: 'pickup',   label: 'For pickup' },
                  { value: 'delivery', label: 'For delivery' },
                ]}
                style={{ width: '100%' }}
              />
              {fulfillment === 'delivery' && (
                <textarea
                  value={deliveryAddress}
                  maxLength={500}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Delivery address"
                  rows={2}
                  style={{ ...inputStyle, marginTop: '0.5rem', resize: 'vertical' }}
                />
              )}
              <label style={{ ...S.label, display: 'block', margin: '0.75rem 0 0.375rem' }}>Promised date (optional)</label>
              <input
                type="date"
                value={targetDate}
                min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)}
                onChange={e => setTargetDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Customer name (optional)</label>
              <input value={customerName} maxLength={MAX_NAME_LEN} onChange={e => setCustomerName(e.target.value)} placeholder="Defaults to Walk-in Customer" style={inputStyle} />
            </div>
            {saleType === 'production' && (
              <div>
                <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Contact number</label>
                <input
                  inputMode="tel"
                  value={customerPhone}
                  maxLength={40}
                  onChange={e => setCustomerPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''))}
                  placeholder="How to reach them about this order"
                  style={inputStyle}
                />
              </div>
            )}
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: '0.5rem' }}>Payment</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {[
                  { id: 'cash',         label: 'Cash',                sub: 'Physical cash at counter',    accent: 'var(--gold)',  accentBg: 'rgba(212,168,67,0.08)', logo: null },
                  { id: 'gcash',        label: 'GCash',               sub: 'QR scan or send money',       accent: '#0066FF',     accentBg: 'rgba(0,102,255,0.07)',  logo: '/logos/Gcash-Logo-1024x1024.png' },
                  { id: 'paymaya',      label: 'Maya',                sub: 'QR scan or send money',       accent: '#00B14F',     accentBg: 'rgba(0,177,79,0.07)',   logo: '/logos/maya logo.png' },
                  { id: 'card',         label: 'Credit / Debit Card', sub: 'Swipe or tap card on terminal', accent: '#9C7BE8',   accentBg: 'rgba(156,123,232,0.07)', logo: '/logos/credit-card.svg', filterImg: true },
                  { id: 'bank_transfer',label: 'Bank Transfer',       sub: 'Direct bank deposit / transfer', accent: 'var(--gray)', accentBg: 'rgba(120,120,120,0.07)', logo: null },
                ].map(opt => {
                  const isSel = paymentMethod === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setPaymentMethod(opt.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.625rem',
                        padding: '0.625rem 0.75rem', borderRadius: '10px', cursor: 'pointer',
                        border: `1px solid ${isSel ? opt.accent : 'var(--border)'}`,
                        background: isSel ? opt.accentBg : 'var(--dark)',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      {opt.logo
                        ? <img src={opt.logo} alt="" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0, filter: opt.filterImg ? 'grayscale(0.3) brightness(0.85)' : undefined }} />
                        : (
                          <div style={{ width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {opt.id === 'cash' ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isSel ? opt.accent : 'var(--gray)'} strokeWidth="2" strokeLinecap="round">
                                <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>
                              </svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isSel ? opt.accent : 'var(--gray)'} strokeWidth="2" strokeLinecap="round">
                                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                              </svg>
                            )}
                          </div>
                        )
                      }
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isSel ? opt.accent : 'var(--white)' }}>{opt.label}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--gray)', lineHeight: 1.3 }}>{opt.sub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {paymentMethod === 'cash' && (
              <div>
                <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Amount tendered</label>
                <input inputMode="decimal" value={amountTendered} onChange={e => setAmountTendered(sanitiseAmount(e.target.value, MAX_TENDERED))} placeholder={netTotal > 0 ? String(netTotal.toFixed(2)) : '0.00'} style={inputStyle} />
                {amountTendered !== '' && !isNaN(tenderNum) && (
                  <div style={{ marginTop: '0.375rem', fontSize: '0.8rem', color: 'var(--gray)' }}>
                    Change: <span style={{ color: 'var(--white)', fontWeight: 600 }}>{formatPrice(changeDue)}</span>
                  </div>
                )}
              </div>
            )}
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Notes (optional)</label>
              <textarea value={notes} maxLength={MAX_NOTES_LEN} onChange={e => setNotes(e.target.value)} placeholder="Any notes for this sale…" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              {notes.length > MAX_NOTES_LEN - 100 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textAlign: 'right', marginTop: '2px' }}>{notes.length}/{MAX_NOTES_LEN}</div>
              )}
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

      {serviceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="pos-scroll" style={{ ...cardStyle, padding: '1.5rem', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>{serviceModal.name}</h3>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Priced by quotation, so there is no catalogue price and no recipe. Enter what was agreed
              and pick what the job will actually consume.
            </p>

            <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Agreed price (per unit)</label>
            <input
              inputMode="decimal"
              value={svcPrice}
              onChange={e => setSvcPrice(sanitiseAmount(e.target.value, MAX_TENDERED))}
              placeholder="0.00"
              style={inputStyle}
            />

            <label style={{ ...S.label, display: 'block', margin: '0.9rem 0 0.375rem' }}>Quantity</label>
            <input
              inputMode="numeric"
              value={svcQty}
              onChange={e => {
                const raw = String(e.target.value).replace(/[^\d]/g, '');
                setSvcQty(raw === '' ? '' : Math.min(MAX_LINE_QTY, Math.max(1, parseInt(raw, 10))));
              }}
              onBlur={() => { if (svcQty === '' || svcQty < 1) setSvcQty(1); }}
              style={inputStyle}
            />

            <label style={{ ...S.label, display: 'block', margin: '0.9rem 0 0.375rem' }}>Materials this job consumes</label>
            <input
              value={matSearch}
              onChange={e => setMatSearch(e.target.value)}
              placeholder="Search Master Data, e.g. white t-shirt"
              style={inputStyle}
            />
            {matResults.length > 0 && (
              <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {matResults.map(inv => (
                  <button key={String(inv.id ?? inv._id)} type="button" onClick={() => addMaterial(inv)}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'var(--dark2)', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--white)', cursor: 'pointer', fontSize: '0.8rem' }}>
                    {inv.name}
                    <span style={{ color: 'var(--gray)', fontSize: '0.72rem', marginLeft: 6 }}>
                      {Number(inv.stockQty ?? 0)} {inv.uom ?? ''} on hand
                    </span>
                  </button>
                ))}
              </div>
            )}

            {svcMaterials.length > 0 && (
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                {svcMaterials.map((m, i) => {
                  const short = Number(m.qty) > Number(m.stockQty);
                  return (
                    <div key={m.inventoryId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: 'var(--dark2)', border: `1px solid ${short ? 'var(--st-red-fg)' : 'var(--border)'}`, borderRadius: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--white)' }}>{m.name}</div>
                        <div style={{ fontSize: '0.68rem', color: short ? 'var(--st-red-fg)' : 'var(--gray)' }}>
                          {Number(m.stockQty)} {m.uom} on hand{short ? ' - not enough' : ''}
                        </div>
                      </div>
                      <input
                        inputMode="decimal"
                        value={m.qty}
                        onChange={e => {
                          const v = sanitiseAmount(e.target.value, 999999);
                          setSvcMaterials(prev => prev.map((x, xi) => (xi === i ? { ...x, qty: v } : x)));
                        }}
                        style={{ ...inputStyle, width: '68px', textAlign: 'center', padding: '4px 6px', fontSize: '0.78rem' }}
                      />
                      <button type="button" onClick={() => setSvcMaterials(prev => prev.filter((_, xi) => xi !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                        aria-label={`Remove ${m.name}`}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
            {svcMaterials.length === 0 && (
              <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--gray)' }}>
                None linked yet. Without materials this job will not reduce any stock.
              </div>
            )}

            {svcPrice && (
              <div style={{ marginTop: '1rem', padding: '9px 11px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--gray)', fontWeight: 700 }}>Line total</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                  {formatPrice((parseFloat(svcPrice) || 0) * (Number(svcQty) || 1))}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="button" onClick={() => setServiceModal(null)} style={{ ...btnGhost, flex: 1 }}>Cancel</button>
              <button type="button" onClick={confirmService} style={{ ...btnGold, flex: 2 }}>Add to order</button>
            </div>
          </div>
        </div>
      )}

      {variantModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ ...cardStyle, padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>{variantModal.name}</h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Variant</label>
              <CustomSelect
                value={selectedVariant?.id ?? ''}
                onChange={v => {
                  const opt = getVariantOptions(variantModal, variantQty).find(o => o.id === v);
                  setSelectedVariant(opt ?? null);
                }}
                options={getVariantOptions(variantModal, variantQty).map(v => ({
                  value: v.id,
                  label: `${v.label} - ${formatPrice(v.price)}`,
                }))}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>Quantity</label>
              <input
                inputMode="numeric"
                value={variantQty}
                onChange={e => {
                  const raw = String(e.target.value).replace(/[^\d]/g, '');
                  setVariantQty(raw === '' ? '' : Math.min(MAX_LINE_QTY, Math.max(1, parseInt(raw, 10))));
                }}
                onBlur={() => { if (variantQty === '' || variantQty < 1) setVariantQty(1); }}
                style={inputStyle}
              />
            </div>

            {selectedVariant && (
              <div style={{ marginBottom: '1.25rem', padding: '10px 12px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--gray)' }}>
                  <span>Unit price at {variantQty || 1} pc{(variantQty || 1) > 1 ? 's' : ''}</span>
                  <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                    {formatPrice(resolvePrice(variantModal, Number(variantQty) || 1, selectedVariant.id))}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--gray)', fontWeight: 700 }}>Line total</span>
                  <span style={{ color: 'var(--white)', fontWeight: 700 }}>
                    {formatPrice((resolvePrice(variantModal, Number(variantQty) || 1, selectedVariant.id) ?? 0) * (Number(variantQty) || 1))}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: 6 }}>
                  Bulk pricing applies automatically as the quantity crosses each tier.
                </div>
              </div>
            )}

            {/* What the materials on hand actually allow. Silence here would let the counter promise
                stock that does not exist. */}
            {selectedVariant && (() => {
              if (availLoading) {
                return <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '1rem' }}>Checking materials…</div>;
              }
              const canBuild = buildableFor(variantModal, selectedVariant.id);
              if (canBuild === null) {
                return (
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '1rem' }}>
                    Made to order - materials are bought per job, so there is no stock limit.
                  </div>
                );
              }
              const short = (Number(variantQty) || 1) > canBuild;
              return (
                <div style={{ marginBottom: '1rem', padding: '8px 10px', borderRadius: 8,
                  background: canBuild === 0 || short ? 'var(--st-red-bg)' : 'var(--st-green-bg)',
                  color: canBuild === 0 || short ? 'var(--st-red-fg)' : 'var(--st-green-fg)',
                  fontSize: '0.75rem', fontWeight: 600 }}>
                  {canBuild === 0
                    ? 'Out of materials - none can be made right now.'
                    : short
                      ? `Only ${canBuild} can be made with the materials on hand.`
                      : `${canBuild} can be made with the materials on hand.`}
                </div>
              );
            })()}

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

            {/* Settlement, stated plainly. A deposit that reads as "paid" is how a balance goes
                uncollected, so the amount owing is shown as prominently as the amount taken. */}
            <div style={{ padding: '10px 12px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: '1rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--gray)' }}>Paying now</span>
                <strong style={{ color: 'var(--st-green-fg)' }}>{formatPrice(paidNow)}</strong>
              </div>
              {balanceDue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--gray)' }}>Balance to collect</span>
                  <strong style={{ color: 'var(--st-amber-fg)' }}>{formatPrice(balanceDue)}</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray)' }}>Method</span>
                <strong style={{ color: 'var(--white)' }}>{{ cash: 'Cash', gcash: 'GCash', paymaya: 'Maya', card: 'Credit / Debit Card', bank_transfer: 'Bank Transfer' }[paymentMethod] ?? paymentMethod}</strong>
              </div>
              {paymentMethod === 'cash' && paidNow > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: 'var(--gray)' }}>Tendered / change</span>
                  <span style={{ color: 'var(--white)' }}>{formatPrice(tenderNum)} / {formatPrice(changeDue)}</span>
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '1rem', lineHeight: 1.6 }}>
              <div>Customer: <strong style={{ color: 'var(--white)' }}>{customerName.trim() || 'Walk-in Customer'}</strong>{customerPhone.trim() ? ` · ${customerPhone.trim()}` : ''}</div>
              <div>
                {saleType === 'collected'
                  ? 'Goods handed over now. Stock is deducted and the sale is recorded.'
                  : `To produce · ${fulfillment === 'delivery' ? 'for delivery' : 'for pickup'}${targetDate ? ` · promised ${targetDate}` : ''}. Materials are reserved; the order enters production.`}
              </div>
              {saleType === 'production' && fulfillment === 'delivery' && deliveryAddress.trim() && (
                <div>Deliver to: {deliveryAddress.trim()}</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => { setShowPreview(false); }} disabled={submitting} style={{ ...btnGhost, flex: 1 }}>Back</button>
              <button type="button" onClick={confirmOrder} disabled={submitting} style={{ ...btnGold, flex: 2 }}>
                {submitting ? 'Processing…' : (saleType === 'collected' ? 'Confirm & charge' : 'Record order')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* A visible, draggable scrollbar. Hiding it looks tidy until someone's wheel stops working
           and half the catalogue becomes unreachable.
           The standard properties are scoped to browsers without ::-webkit-scrollbar: from Chrome
           121 setting scrollbar-width switches to the native scrollbar and makes Chrome ignore
           every pseudo-element rule below, arrows included. */
        @supports not selector(::-webkit-scrollbar) {
          .pos-scroll { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        }
        .pos-scroll::-webkit-scrollbar { width: 10px; }
        .pos-scroll::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
        .pos-scroll::-webkit-scrollbar-track { background: transparent; }
        .pos-scroll::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 6px;
          border: 3px solid transparent;
          background-clip: content-box;
          min-height: 40px;
        }
        .pos-scroll::-webkit-scrollbar-thumb:hover { background: var(--gray); background-clip: content-box; }

        /* The two-pane counter needs width. Below that the cart drops under the catalogue rather
           than squeezing both into columns too narrow to read. */
        @media (max-width: 1100px) {
          .pos-grid { grid-template-columns: minmax(0, 1fr) !important; height: auto !important; }
          .pos-cart { overflow-y: visible !important; }
        }
      `}</style>
    </div>
    </ErrorBoundary>
  );
}
