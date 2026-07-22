'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { uploadDesignFile } from '../../lib/orderRequestApi';
import { S, ICONS, Modal, Field, CustomSelect, IntegerInput, DecimalInput } from '@/app/dashboard/business/inventory-v2/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const blankLine = () => ({ key: Math.random().toString(36).slice(2), productId: '', qty: '1', unitPrice: '', materials: [] });

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// Every numeric field gets a ceiling - an unbounded quantity is a typo waiting to become
// a stock movement. DecimalInput already caps money at 999,999.99.
const MAX_QTY = 100000;

// Mirrors ProductController::STANDALONE_VARIANT - the implicit single "variant" a
// standalone product is returned as, so the quote has one shape for every product.
const STANDALONE = '__standalone__';

/**
 * The price the owner already configured for this variant at this quantity: the matching
 * quantity break first, then the variant's own price, then the product's base price.
 * Module-level so it can be used while the line totals are being computed.
 */
const tierPriceOf = (line, variantId, qty) => {
  const n = parseInt(qty, 10) || 0;
  const hit = (line.priceTiers || []).find(t =>
    n >= (Number(t.minQty) || 0) &&
    (t.maxQty == null || t.maxQty === '' || n <= Number(t.maxQty)));
  const fromTier = hit?.prices?.[variantId] ?? hit?.prices?.__base__ ?? hit?.price;
  if (fromTier != null && fromTier !== '') return Number(fromTier) || 0;
  const v = (line.variants || []).find(x => x.variantId === variantId);
  return Number(v?.price ?? line.basePrice ?? 0) || 0;
};

const QuotationModal = ({ onClose, onSubmit, isSending, token, customerId, customerName }) => {
  // The customer's pinned address - so the delivery fee can be checked against a
  // courier (Lalamove etc.) before the quote is sent.
  const [addr, setAddr] = useState(null);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrPhone, setAddrPhone] = useState('');
  const [copied, setCopied] = useState(false);
  // Master Data materials, for lines whose product has no BOM (services).
  const [materialsList, setMaterialsList] = useState([]);
  const [matPickerFor, setMatPickerFor] = useState(null);
  const [matQuery, setMatQuery] = useState('');
  const [matScopeAll, setMatScopeAll] = useState(false);
  // Extras on a BOM product: the BOM says what a job ALWAYS uses, a quote can still add
  // what this particular job needs on top - DTF film, special packaging, a rush charge.
  const [extraPickerFor, setExtraPickerFor] = useState(null);
  // Quote against real catalog items so the request carries productIds, not typed strings.
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [lines, setLines] = useState([blankLine()]);
  const [form, setForm] = useState({
    designFee: '',
    deliveryFee: '',
    downPayment: '',
    expiresInDays: '7',
    note: '',
  });

  // Owner attaches the agreed artwork here; it rides the quote into the order and skips the
  // proof-approval gate (the design was already settled in chat).
  const [design, setDesign] = useState(null); // { url } once uploaded
  const [designName, setDesignName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout(`${API_URL}/api/products`, {}, 15000)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        const list = d ? (d.data ?? d.products ?? (Array.isArray(d) ? d : [])) : [];
        setProducts(list.filter(p => p?.name));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingProducts(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!customerId || !token) return;
    let cancelled = false;
    setAddrLoading(true);
    fetchWithTimeout(`${API_URL}/api/admin/customers/${customerId}/addresses`, {
      headers: { Authorization: `Bearer ${token}` },
    }, 15000)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d?.success) return;
        const list = Array.isArray(d.addresses) ? d.addresses : [];
        setAddr(list.find(a => a.is_default) ?? list[0] ?? null);
        setAddrPhone(d.customer?.phone || '');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAddrLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, token]);

  const addrLine = addr
    ? [addr.house_number, addr.street, addr.subdivision, addr.barangay, addr.city, addr.province, addr.zip]
        .filter(Boolean).join(', ')
    : '';
  const hasPin = addr && addr.lat != null && addr.lng != null;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchWithTimeout(`${API_URL}/api/admin/inventory`, {
      headers: { Authorization: `Bearer ${token}` },
    }, 15000)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return;
        const list = d.data ?? (Array.isArray(d) ? d : []);
        setMaterialsList(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const productOptions = useMemo(
    () => products.map(p => ({
      value: String(p.id ?? p._id),
      label: p.category ? `${p.name} - ${p.category}` : p.name,
    })),
    [products],
  );

  // A product with variants is quoted as one row per variant - a mug order can be
  // 10 ceramic at one price and 5 magic at another. The line's quantity is then the sum
  // of its rows, never typed by hand, so it can't disagree with what's being made.
  const priced = lines.map(l => {
    const hasVariants = (l.variants || []).length > 0;
    const rows = (l.rows || []).map(r => {
      const qty = parseInt(r.qty, 10) || 0;
      const v = (l.variants || []).find(x => x.variantId === r.variantId);
      // An empty price field means "use the price I already saved" - the tier price is
      // shown greyed in the field so it's clear what will be charged.
      const saved = tierPriceOf(l, r.variantId, qty);
      const unitPrice = String(r.unitPrice ?? '').trim() === '' ? saved : (parseFloat(r.unitPrice) || 0);
      return {
        // Keep exactly what was typed for the inputs - overwriting these with the parsed
        // numbers is what made the fields snap back to 0 and refuse to be cleared.
        ...r, qtyRaw: r.qty ?? '', priceRaw: r.unitPrice ?? '',
        qty, unitPrice, savedPrice: saved,
        lineTotal: Math.round(qty * unitPrice * 100) / 100,
        components: v?.components || [],
        canBuild: v?.canBuild,
      };
    });
    // Nothing to choose when there is only one option - whether the product is standalone
    // or a multi-variant product that happens to have a single variant. Only the LABEL
    // differs: a standalone row is named after the product itself.
    const singleOption = (l.variants || []).length === 1;
    const isStandalone = singleOption && l.variants[0].variantId === STANDALONE;
    // A service with no BOM is priced through its materials: "T-Shirt Printing" has no
    // price of its own, it costs whatever shirt it's printed on. A material left without
    // a price is a consumable - used, but not billed as its own line.
    const billed = (l.materials || [])
      .map(m => ({ ...m, q: Number(m.qty) || 0, p: parseFloat(m.unitPrice) || 0 }))
      .filter(m => m.p > 0 && m.q > 0);
    // The moment a service has materials, it is priced THROUGH them. Keeping a separate
    // header price alongside would let money be charged with no material behind it - the
    // line would show revenue and no cost, and the profit would be fiction.
    const pricedByMaterials = !hasVariants && (l.materials || []).length > 0;

    // Extras billed on top of the variant rows (a BOM product can still carry a one-off
    // charge for this job). They add money, not units - the piece count stays the rows'.
    const extrasTotal = hasVariants
      ? Math.round(billed.reduce((s, m) => s + m.q * m.p, 0) * 100) / 100
      : 0;

    const qty = hasVariants ? rows.reduce((s, r) => s + r.qty, 0)
      : pricedByMaterials ? billed.reduce((s, m) => s + m.q, 0)
      : (parseInt(l.qty, 10) || 0);
    const unitPrice = hasVariants || pricedByMaterials ? 0 : (parseFloat(l.unitPrice) || 0);
    const lineTotal = hasVariants ? Math.round((rows.reduce((s, r) => s + r.lineTotal, 0) + extrasTotal) * 100) / 100
      : pricedByMaterials ? Math.round(billed.reduce((s, m) => s + m.q * m.p, 0) * 100) / 100
      : Math.round(qty * unitPrice * 100) / 100;
    return { ...l, hasVariants, singleOption, isStandalone, rows, pricedByMaterials, billed, extrasTotal,
      qtyRaw: l.qty ?? '', priceRaw: l.unitPrice ?? '',
      qty, unitPrice, lineTotal };
  });

  const goodsTotal = priced.reduce((s, l) => s + l.lineTotal, 0);
  const designFee = parseFloat(form.designFee) || 0;
  const deliveryFee = parseFloat(form.deliveryFee) || 0;
  const total = Math.round((goodsTotal + designFee + deliveryFee) * 100) / 100;
  const downPayment = parseFloat(form.downPayment) || 0;
  const dpPct = total > 0 && downPayment > 0 ? Math.round((downPayment / total) * 100) : 0;

  // Shipping is collected for the courier, not earned - it stays out of profit, the same
  // way the Sales module treats it.
  // Every material a line will consume, already scaled to the quantity being quoted.
  const lineMaterials = (l) => l.hasVariants
    ? l.rows.flatMap(r => (r.components || []).map(c => ({ ...c, qty: round4((c.qtyPerUnit || 0) * r.qty) })))
    : (l.materials || []);

  const materialCost = priced.reduce(
    (s, l) => s + lineMaterials(l).reduce((ms, m) => ms + (Number(m.unitCost) || 0) * (Number(m.qty) || 0), 0), 0);
  const earnedRevenue = goodsTotal + designFee;
  const estProfit = Math.round((earnedRevenue - materialCost) * 100) / 100;
  const estMargin = earnedRevenue > 0 ? Math.round((estProfit / earnedRevenue) * 100) : 0;
  const anyMaterials = priced.some(l => lineMaterials(l).length > 0);
  const costlessMaterials = priced.flatMap(l => lineMaterials(l).filter(m => !Number(m.unitCost)));

  const fmt = (n) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const set = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

  const setLine = (key, patch) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines(ls => [...ls, blankLine()]);
  const removeLine = (key) => setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls));

  // Picking a product pulls in the materials its BOM says it consumes. A service with no
  // BOM (e.g. "T-Shirt Printing") simply comes back empty - the owner then searches Master
  // Data for the blank it will actually eat. Same UI either way.
  const toMaterials = (components, qty) => {
    const n = parseInt(qty, 10) || 1;
    return (components || []).map(c => ({
      inventoryId: c.inventoryId, name: c.name, uom: c.uom,
      qtyPerUnit: c.qtyPerUnit, qty: round4(c.qtyPerUnit * n),
      unitCost: c.unitCost, stockQty: c.stockQty, reservedQty: c.reservedQty,
      isOnDemand: c.isOnDemand, leadTimeDays: c.leadTimeDays,
    }));
  };

  const loadBom = async (key, productId, qty) => {
    if (!productId || !token) { setLine(key, { materials: [], variants: [], bomError: '' }); return; }
    setLine(key, { bomError: '' });
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/products/${productId}/bom-components`,
        { headers: { Authorization: `Bearer ${token}` } }, 15000,
      );
      if (!res.ok) { setLine(key, { bomError: "Couldn't load this item's materials. Retry." }); return; }
      const d = await res.json();
      const variants = d?.data?.variants ?? [];
      const single   = d?.data?.components ?? [];

      const tiers = d?.data?.priceTiers ?? [];
      const base  = Number(d?.data?.basePrice ?? 0);

      // Only one BOM (a standalone product, or a product with a single variant)? There is
      // nothing to choose - put the row in straight away. The price stays blank so the
      // configured price shows through as the placeholder.
      const auto = variants.length === 1 ? variants[0] : null;

      setLine(key, {
        variants,
        hasBom: !!d?.data?.hasBom,
        priceTiers: tiers,
        basePrice: base,
        rows: auto ? [{ variantId: auto.variantId, name: auto.name, qty: String(qty || 1), unitPrice: '' }] : [],
        // A service with no BOM keeps a flat, hand-picked material list on the line.
        pool: single,
        materials: variants.length ? [] : toMaterials(single, qty),
      });
    } catch {
      setLine(key, { bomError: "Couldn't load this item's materials. Retry." });
    }
  };

  const pickProduct = (line, productId) => {
    setLine(line.key, { productId, rows: [], materials: [], variants: [], pool: [], priceTiers: [], basePrice: 0 });
    loadBom(line.key, productId, line.qty);
  };

  // Leave the price field EMPTY by default: the configured price shows greyed in the
  // background and is what gets charged, so the owner types only when overriding.
  const addVariantRow = (line, v) => {
    if ((line.rows || []).some(r => r.variantId === v.variantId)) return;
    setLine(line.key, {
      rows: [...(line.rows || []), { variantId: v.variantId, name: v.name, qty: '1', unitPrice: '' }],
    });
    setMatPickerFor(null);
  };

  const setRowQty = (line, variantId, val) =>
    setLine(line.key, {
      rows: line.rows.map(r => r.variantId !== variantId ? r : { ...r, qty: val }),
    });

  const setRowPrice = (line, variantId, val) =>
    setLine(line.key, {
      rows: line.rows.map(r => r.variantId === variantId ? { ...r, unitPrice: val, priceTouched: true } : r),
    });

  const removeRow = (line, variantId) =>
    setLine(line.key, { rows: line.rows.filter(r => r.variantId !== variantId) });


  // Material quantities follow the line quantity - 15 mugs means 15 mug blanks.
  const setQty = (line, v) => {
    const n = parseInt(v, 10) || 0;
    setLine(line.key, {
      qty: v,
      materials: (line.materials || []).map(m => ({ ...m, qty: round4((m.qtyPerUnit || 0) * n) })),
    });
  };

  const addMaterial = (line, inv) => {
    if ((line.materials || []).some(m => m.inventoryId === String(inv.id ?? inv._id))) return;
    const n = parseInt(line.qty, 10) || 1;
    setLine(line.key, {
      materials: [...(line.materials || []), {
        inventoryId: String(inv.id ?? inv._id), name: inv.name, uom: inv.uom,
        qtyPerUnit: 1, qty: n, unitPrice: '',
        unitCost: Number(inv.lastUnitCost || inv.averageCost || inv.baseCost || 0),
        stockQty: Number(inv.stockQty || 0),
        isOnDemand: !!inv.isOnDemand, leadTimeDays: Number(inv.leadTimeDays || 0),
      }],
    });
    setMatPickerFor(null);
    setMatQuery('');
  };

  const setMaterialQty = (line, inventoryId, v) => {
    const n = parseInt(line.qty, 10) || 1;
    const total = parseFloat(v);
    setLine(line.key, {
      materials: line.materials.map(m => m.inventoryId === inventoryId
        ? { ...m, qty: v, qtyPerUnit: Number.isFinite(total) ? total / n : m.qtyPerUnit }
        : m),
    });
  };

  // A service has no BOM and no fixed price - "T-Shirt Printing" costs whatever the shirt
  // it's printed on costs. So each material carries its own selling price; leaving it
  // blank marks the material as a consumable that is used but not billed separately.
  const setMaterialPrice = (line, inventoryId, v) =>
    setLine(line.key, {
      materials: line.materials.map(m => m.inventoryId === inventoryId ? { ...m, unitPrice: v } : m),
    });

  const removeMaterial = (line, inventoryId) =>
    setLine(line.key, { materials: line.materials.filter(m => m.inventoryId !== inventoryId) });

  // MATERIAL | AVAILABLE | QTY | PRICE | TOTAL | remove. No "need per unit" column - for a
  // hand-listed material the quantity typed IS the need, so the two were the same number.
  const MAT_COLS = 'minmax(0,1fr) 58px 48px 58px 62px 16px';

  const renderMaterialRows = (l) => {
    const rows = l.materials || [];
    if (!rows.length) {
      // Not blocked: a pure-labour service (customer brings everything) genuinely has no
      // material. But a quote with no material has no cost either, so its profit is 100%
      // fiction - and that has to be impossible to miss rather than tucked away.
      return (
        <div style={{ fontSize: '11px', color: '#e0a852', padding: '8px 9px 2px', lineHeight: 1.45 }}>
          No materials - this line will show pure profit, which is only true if the customer
          supplies everything. Add what it consumes (e.g. the blank shirt).
        </div>
      );
    }
    return (
      <div style={{ padding: '2px 9px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: MAT_COLS, gap: '6px', padding: '4px 0 3px',
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--gray)' }}>
          <span>Material</span>
          <span style={{ textAlign: 'right' }}>Available</span>
          <span style={{ textAlign: 'right' }}>Qty</span>
          <span style={{ textAlign: 'right' }}>Price</span>
          <span style={{ textAlign: 'right' }}>Total</span>
          <span />
        </div>
        {rows.length === 0 && null}
        {rows.map(m => {
          const need      = Number(m.qty) || 0;
          const available = Math.max(0, (m.stockQty || 0) - (m.reservedQty || 0));
          // Bought-per-order materials still need buying - the shortfall is exactly the
          // purchase order, so it has to be shown for them too.
          const short     = available < need;
          const noCost    = !Number(m.unitCost);
          const price     = parseFloat(m.unitPrice) || 0;
          const billable  = price > 0;
          const rowTotal  = Math.round(need * price * 100) / 100;
          return (
            <div key={m.inventoryId}>
              <div style={{ display: 'grid', gridTemplateColumns: MAT_COLS, gap: '6px', alignItems: 'center', padding: '3px 0' }}>
                <span style={{ fontSize: '12px', color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--gray)', textAlign: 'right' }}>
                  {available} {m.uom}
                </span>
                {/* Capped inputs, not raw ones - a hand-typed material quantity ends up as a
                    stock reservation and a purchase, so it needs the same ceiling as the rest. */}
                <IntegerInput value={m.qty} max={MAX_QTY}
                  onChange={v => setMaterialQty(l, m.inventoryId, v)}
                  style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'right' }} />
                <DecimalInput value={m.unitPrice ?? ''} placeholder="0.00"
                  onChange={v => setMaterialPrice(l, m.inventoryId, v)}
                  style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'right' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: billable ? 'var(--white)' : 'var(--gray)', textAlign: 'right' }}>
                  {billable ? `₱${fmt(rowTotal)}` : 'cost only'}
                </span>
                <button type="button" onClick={() => removeMaterial(l, m.inventoryId)}
                  style={{ background: 'none', border: 'none', color: '#e05252', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>×</button>
              </div>
              {(short || m.isOnDemand || noCost) && (
                <div style={{ fontSize: '10px', paddingBottom: '3px', color: short || noCost ? '#e0a852' : 'var(--gray)' }}>
                  {short && `Buy ${round4(need - available)} more`}
                  {m.isOnDemand && `${short ? ' - ' : ''}Buy per order${m.leadTimeDays ? ` - ${m.leadTimeDays}d lead` : ''}`}
                  {noCost && `${short || m.isOnDemand ? ' - ' : ''}no cost set`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const matchingMaterials = (line) => {
    const q = matQuery.trim().toLowerCase();
    const taken = new Set((line.materials || []).map(m => m.inventoryId));
    return materialsList
      .filter(inv => !taken.has(String(inv.id ?? inv._id)))
      .filter(inv => !q
        || (inv.name || '').toLowerCase().includes(q)
        || (inv.sku || '').toLowerCase().includes(q)
        || (inv.category || '').toLowerCase().includes(q))
      .slice(0, 30);
  };

  const nameOf = (productId) => products.find(p => String(p.id ?? p._id) === String(productId))?.name ?? '';

  const handleDesignPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a remove
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const { url } = await uploadDesignFile(token, file);
      setDesign({ url });
      setDesignName(file.name);
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const linesValid = priced.every(l => l.productId && l.qty > 0 && (
    l.hasVariants ? l.rows.length > 0 && l.rows.every(r => r.qty > 0 && r.unitPrice > 0)
      : l.pricedByMaterials ? l.lineTotal > 0
      : l.unitPrice > 0));
  const noDupes = new Set(lines.map(l => l.productId)).size === lines.length;
  const canSubmit = linesValid && noDupes && !isSending && !uploading;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      // Each variant row becomes its own item - it has its own price, its own BOM and
      // its own stock movement, so the order should carry them apart.
      items: priced.flatMap(l => l.hasVariants
        ? l.rows.filter(r => r.qty > 0).map((r, idx) => ({
            productId: l.productId,
            // A standalone product has no real variant - don't invent one on the order.
            ...(r.variantId === STANDALONE ? {} : { variantId: r.variantId, variantName: r.name }),
            qty: r.qty,
            // Extras are charged once for the job, so they ride on the first row rather
            // than being multiplied across every variant.
            unitPrice: idx === 0 && r.qty > 0
              ? Math.round((r.unitPrice + (l.extrasTotal || 0) / r.qty) * 100) / 100
              : r.unitPrice,
            materials: [
              ...(r.components || [])
                .map(c => ({ inventoryId: c.inventoryId, qty: round4((c.qtyPerUnit || 0) * r.qty) })),
              ...(idx === 0
                ? (l.materials || [])
                    .filter(m => (Number(m.qty) || 0) > 0)
                    .map(m => ({ inventoryId: m.inventoryId, qty: Number(m.qty) }))
                : []),
            ].filter(m => m.qty > 0),
          }))
        : l.pricedByMaterials
          // Each priced material is its own sale line - a printed S and a printed L are
          // different money. Unpriced consumables ride along on the first one so their
          // cost is still recorded somewhere.
          ? l.billed.map((m, idx) => ({
              productId: l.productId,
              variantName: m.name,
              qty: m.q,
              unitPrice: m.p,
              materials: [
                { inventoryId: m.inventoryId, qty: m.q },
                ...(idx === 0
                  ? (l.materials || [])
                      .filter(x => !(parseFloat(x.unitPrice) > 0) && (Number(x.qty) || 0) > 0)
                      .map(x => ({ inventoryId: x.inventoryId, qty: Number(x.qty) }))
                  : []),
              ],
            }))
          : [{
              productId: l.productId,
              qty: l.qty,
              unitPrice: l.unitPrice,
              materials: (l.materials || [])
                .filter(m => (Number(m.qty) || 0) > 0)
                .map(m => ({ inventoryId: m.inventoryId, qty: Number(m.qty) })),
            }]),
      designFee,
      deliveryFee,
      downPayment,
      expiresInDays: Math.min(90, Math.max(1, parseInt(form.expiresInDays) || 7)),
      note: form.note.trim(),
      total,
      ...(design?.url ? { designUrl: design.url } : {}),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create Quotation"
      width={620}
      footer={
        <>
          <button type="button" onClick={onClose} style={S.btnGhost} disabled={isSending}>Cancel</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ ...S.btnPrimary, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5 }}
          >
            {isSending ? 'Sending…' : 'Send Quotation'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ ...S.label, textTransform: 'none', letterSpacing: 0, fontSize: '12px', color: 'var(--gray-light)' }}>
              Products / Services
            </span>
            <button type="button" onClick={addLine} style={S.btnSmGhost}>{ICONS.plus} Add item</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {priced.map((l, i) => (
              <div key={l.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'grid',
                  gridTemplateColumns: (l.hasVariants || l.pricedByMaterials) ? 'minmax(0,1fr) 28px' : 'minmax(0,1fr) 74px 96px 28px',
                  gap: '8px', alignItems: 'start' }}>
                  <CustomSelect
                    value={l.productId}
                    onChange={(v) => pickProduct(l, v)}
                    options={productOptions}
                    placeholder="Select a product / service…"
                    emptyLabel={loadingProducts ? 'Loading products…' : 'No products found'}
                    style={{ minWidth: 0 }}
                  />
                  {/* Quantity and price live on the variant rows when there are variants. */}
                  {/* Nothing can be quantified or priced before a product is chosen -
                      otherwise a total quietly builds up against no product at all. */}
                  {!l.hasVariants && !l.pricedByMaterials && (
                    <IntegerInput value={l.qtyRaw} max={MAX_QTY} disabled={!l.productId}
                      onChange={(v) => setQty(l, v)} placeholder="Qty" />
                  )}
                  {!l.hasVariants && !l.pricedByMaterials && (
                    <DecimalInput value={l.priceRaw} disabled={!l.productId}
                      onChange={(v) => setLine(l.key, { unitPrice: v })} />
                  )}
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    disabled={lines.length === 1}
                    title={lines.length === 1 ? 'A quote needs at least one item' : 'Remove item'}
                    style={{
                      background: 'none', border: 'none', padding: '8px 0',
                      color: lines.length === 1 ? 'var(--border)' : '#e05252',
                      cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex', justifyContent: 'center',
                    }}
                  >{ICONS.trash}</button>
                  {i === 0 && !l.hasVariants && !l.pricedByMaterials && (
                    <div style={{ gridColumn: '2 / 4', display: 'grid', gridTemplateColumns: '74px 96px', gap: '8px', marginTop: '-4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--gray)' }}>Qty (pcs)</span>
                      <span style={{ fontSize: '10px', color: 'var(--gray)' }}>Price / pc (&#8369;)</span>
                    </div>
                  )}
                </div>

                {l.productId && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', background: 'var(--dark2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray)' }}>
                        {l.hasVariants ? 'Variants ordered' : 'Materials used'}
                      </span>
                      <span style={{ display: 'flex', gap: '6px' }}>
                        {/* Only one option means nothing to add and nothing to remove, so
                            neither control is offered. */}
                        {!l.singleOption && (
                          <button type="button"
                            onClick={() => { setMatPickerFor(matPickerFor === l.key ? null : l.key); setMatQuery(''); setMatScopeAll(false); setExtraPickerFor(null); }}
                            style={{ ...S.btnSmGhost, padding: '3px 8px', fontSize: '11px' }}>
                            {matPickerFor === l.key ? 'Close' : (l.hasVariants ? '+ Add variant' : '+ Add material')}
                          </button>
                        )}
                        {l.hasVariants && (
                          <button type="button"
                            onClick={() => { setExtraPickerFor(extraPickerFor === l.key ? null : l.key); setMatQuery(''); setMatPickerFor(null); }}
                            style={{ ...S.btnSmGhost, padding: '3px 8px', fontSize: '11px' }}>
                            {extraPickerFor === l.key ? 'Close' : '+ Add extra'}
                          </button>
                        )}
                      </span>
                    </div>

                    {/* One row per variant: its own quantity and price, with the materials it
                        pulls in listed underneath - shared ones come along automatically. */}
                    {l.hasVariants && l.rows.map(r => {
                      const tier = r.savedPrice;
                      const belowTier = tier > 0 && r.unitPrice > 0 && r.unitPrice < tier;
                      const unitCost = (r.components || []).reduce((s, c) => s + (Number(c.unitCost) || 0) * (Number(c.qtyPerUnit) || 0), 0);
                      const belowCost = unitCost > 0 && r.unitPrice > 0 && r.unitPrice < unitCost;
                      return (
                        <div key={r.variantId} style={{ marginTop: '8px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px 68px 74px 16px', gap: '6px', alignItems: 'center' }}>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--white)', display: 'block',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.variantId === STANDALONE ? nameOf(l.productId) : r.name}
                              </span>
                              <span style={{ fontSize: '10px', fontWeight: 700,
                                color: r.canBuild == null ? 'var(--gray)'
                                  : r.canBuild >= r.qty ? '#4ade80'
                                  : r.canBuild > 0 ? '#e0a852' : '#e05252' }}>
                                {r.canBuild == null ? 'made to order' : `${r.canBuild} can build`}
                              </span>
                            </span>
                            <IntegerInput value={r.qtyRaw} max={MAX_QTY}
                              onChange={(v) => setRowQty(l, r.variantId, v)} />
                            {/* Empty shows the saved price greyed out - that's what will be
                                charged unless the owner types over it. */}
                            <DecimalInput value={r.priceRaw} placeholder={r.savedPrice ? fmt(r.savedPrice) : '0.00'}
                              onChange={(v) => setRowPrice(l, r.variantId, v)} />
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--white)', textAlign: 'right' }}>
                              &#8369;{fmt(r.lineTotal)}
                            </span>
                            {l.singleOption ? <span /> : (
                              <button type="button" onClick={() => removeRow(l, r.variantId)}
                                style={{ background: 'none', border: 'none', color: '#e05252', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>×</button>
                            )}
                          </div>

                          {(r.components || []).map(c => {
                            const need = round4((c.qtyPerUnit || 0) * r.qty);
                            // What's actually usable - stock already promised to other
                            // orders can't be spent twice. This is the same figure the
                            // "can build" count is derived from, so the two agree.
                            const available = Math.max(0, (c.stockQty || 0) - (c.reservedQty || 0));
                            // Shown for bought-per-order materials too: the shortfall is
                            // exactly what has to be purchased for this job.
                            const short = available < need;
                            return (
                              <div key={c.inventoryId} style={{ fontSize: '10px', color: short ? '#e0a852' : 'var(--gray)', paddingLeft: '2px', lineHeight: 1.5 }}>
                                {c.name} - {need} {c.uom} - {short
                                  ? `${available} available, buy ${round4(need - available)} more`
                                  : `${available} available`}
                                {c.isOnDemand && `${c.leadTimeDays ? ` - ${c.leadTimeDays}d lead` : ' - buy per order'}`}
                                {!Number(c.unitCost) && ' - no cost set'}
                              </div>
                            );
                          })}

                          {(belowTier || belowCost) && (
                            <div style={{ fontSize: '10.5px', marginTop: '2px', color: belowCost ? '#e05252' : '#e0a852' }}>
                              {belowCost
                                ? `Below material cost (₱${fmt(unitCost)}/pc) - you lose ₱${fmt((unitCost - r.unitPrice) * r.qty)} here`
                                : `Below your price list (₱${fmt(tier)}/pc) - ₱${fmt((tier - r.unitPrice) * r.qty)} less on this row`}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {l.hasVariants && l.rows.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px',
                        paddingTop: '6px', borderTop: '1px solid var(--border)', fontSize: '11.5px', fontWeight: 700, color: 'var(--white)' }}>
                        <span style={{ color: 'var(--gray)' }}>{l.qty} pcs</span>
                        <span>&#8369;{fmt(l.lineTotal)}</span>
                      </div>
                    )}

                    {l.hasVariants && l.rows.length === 0 && !l.bomError && (
                      <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '6px', lineHeight: 1.45 }}>
                        Add the variants the customer ordered - quantity and materials follow from there.
                      </div>
                    )}

                    {l.bomError && (
                      <div style={{ fontSize: '11px', color: '#e05252', marginTop: '6px' }}>
                        {l.bomError}{' '}
                        <button type="button" onClick={() => loadBom(l.key, l.productId, l.qty)}
                          style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', padding: 0, fontSize: '11px', fontWeight: 700 }}>
                          Retry
                        </button>
                      </div>
                    )}

                    {!l.hasVariants && renderMaterialRows(l)}

                    {/* Every peso on this line has to sit against a material, so at least
                        one of them needs a price before the quote can be sent. */}
                    {l.pricedByMaterials && l.lineTotal === 0 && (
                      <div style={{ fontSize: '11px', color: '#e0a852', marginTop: '4px' }}>
                        Set a price on at least one material - that is what this line charges for.
                      </div>
                    )}

                    {/* Extras sit apart from the BOM so it stays obvious which materials the
                        product always uses and which were added just for this job. */}
                    {l.hasVariants && (l.materials || []).length > 0 && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border)' }}>
                        <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray)' }}>
                          Extras for this job
                        </div>
                        {renderMaterialRows(l)}
                      </div>
                    )}

                    {extraPickerFor === l.key && (
                      <div style={{ marginTop: '6px' }}>
                        <input autoFocus value={matQuery} onChange={e => setMatQuery(e.target.value)}
                          placeholder="Search Master Data (e.g. DTF film)…"
                          style={{ ...S.input, padding: '5px 8px', fontSize: '12px' }} />
                        <div style={{ maxHeight: '132px', overflowY: 'auto', marginTop: '4px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                          {matchingMaterials(l).length === 0 ? (
                            <div style={{ padding: '8px', fontSize: '11px', color: 'var(--gray)', textAlign: 'center' }}>No materials found</div>
                          ) : matchingMaterials(l).map(inv => (
                            <button key={String(inv.id ?? inv._id)} type="button"
                              onClick={() => { addMaterial(l, inv); setExtraPickerFor(null); }}
                              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                                borderBottom: '1px solid var(--border)', padding: '6px 8px', cursor: 'pointer' }}>
                              <div style={{ fontSize: '12px', color: 'var(--white)' }}>{inv.name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--gray)' }}>
                                {[inv.category, inv.uom, inv.isOnDemand ? 'buy per order' : `${inv.stockQty ?? 0} in stock`].filter(Boolean).join(' · ')}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {matPickerFor === l.key && l.hasVariants && (
                      <div style={{ marginTop: '6px', border: '1px solid var(--border)', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                        {l.variants.filter(v => !l.rows.some(r => r.variantId === v.variantId)).length === 0 ? (
                          <div style={{ padding: '8px', fontSize: '11px', color: 'var(--gray)', textAlign: 'center' }}>
                            All variants are already on this quote
                          </div>
                        ) : l.variants.filter(v => !l.rows.some(r => r.variantId === v.variantId)).map(v => (
                          <button key={v.variantId} type="button" onClick={() => addVariantRow(l, v)}
                            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                              textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
                              padding: '7px 9px', cursor: 'pointer' }}>
                            <span style={{ fontSize: '12.5px', color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.name}
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 700, flexShrink: 0,
                              color: v.canBuild == null ? 'var(--gray)' : v.canBuild > 0 ? '#4ade80' : '#e05252' }}>
                              {v.canBuild == null ? 'made to order' : `${v.canBuild} can build`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {matPickerFor === l.key && !l.hasVariants && (() => {
                      // Default to just this product's own materials - a Scrunchie quote has
                      // no business listing tote bags. Everything else is one click away.
                      const scoped = !matScopeAll && (l.pool || []).length > 0;
                      const taken  = new Set((l.materials || []).map(m => m.inventoryId));
                      const list   = scoped
                        ? (l.pool || []).filter(c => !taken.has(c.inventoryId))
                        : matchingMaterials(l);
                      return (
                        <div style={{ marginTop: '6px' }}>
                          {scoped ? (
                            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                              color: 'var(--gray)', marginBottom: '4px' }}>
                              From this product&apos;s variants
                            </div>
                          ) : (
                            <input autoFocus value={matQuery} onChange={e => setMatQuery(e.target.value)}
                              placeholder="Search Master Data (e.g. t-shirt)…"
                              style={{ ...S.input, padding: '5px 8px', fontSize: '12px' }} />
                          )}
                          <div style={{ maxHeight: '132px', overflowY: 'auto', marginTop: '4px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                            {list.length === 0 ? (
                              <div style={{ padding: '8px', fontSize: '11px', color: 'var(--gray)', textAlign: 'center' }}>
                                {scoped ? 'All of this product’s materials are already added' : 'No materials found'}
                              </div>
                            ) : list.map(inv => {
                              const invId = String(inv.inventoryId ?? inv.id ?? inv._id);
                              return (
                                <button key={invId} type="button" onClick={() => addMaterial(l, inv)}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                                    borderBottom: '1px solid var(--border)', padding: '6px 8px', cursor: 'pointer' }}>
                                  <div style={{ fontSize: '12px', color: 'var(--white)' }}>{inv.name}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--gray)' }}>
                                    {[inv.category, inv.uom, inv.isOnDemand ? 'buy per order' : `${inv.stockQty ?? 0} in stock`].filter(Boolean).join(' · ')}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {(l.pool || []).length > 0 && (
                            <button type="button" onClick={() => { setMatScopeAll(v => !v); setMatQuery(''); }}
                              style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer',
                                padding: '5px 0 0', fontSize: '11px', fontWeight: 600 }}>
                              {scoped ? 'Search all Master Data instead →' : '← Back to this product’s materials'}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                  </div>
                )}
              </div>
            ))}
          </div>

          {!noDupes && (
            <p style={{ ...S.errText, marginTop: '6px' }}>The same product is listed twice - merge those lines instead.</p>
          )}
        </div>

        {/* Where this quote will be delivered - check it against a courier before pricing. */}
        {customerId && (
          <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--dark2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: '6px' }}>
              Deliver to{customerName ? ` - ${customerName}` : ''}
            </div>

            {addrLoading ? (
              <div style={{ fontSize: '12px', color: 'var(--gray)' }}>Loading address…</div>
            ) : !addr ? (
              <div style={{ fontSize: '12px', color: 'var(--gray)', lineHeight: 1.5 }}>
                No saved address yet - the customer will pin one at checkout. Leave the
                delivery fee blank if you can&apos;t price it yet.
              </div>
            ) : (
              <>
                <div style={{ fontSize: '12.5px', color: 'var(--white)', lineHeight: 1.5 }}>{addrLine}</div>
                {(addr.phone || addrPhone) && (
                  <div style={{ fontSize: '11.5px', color: 'var(--gray)', marginTop: '2px' }}>Phone: {addr.phone || addrPhone}</div>
                )}
                {addr.delivery_notes && (
                  <div style={{ fontSize: '11.5px', color: 'var(--gold)', marginTop: '4px', lineHeight: 1.45 }}>
                    Note: {addr.delivery_notes}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {hasPin ? (
                    <>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${addr.lat},${addr.lng}`} target="_blank" rel="noopener noreferrer"
                        style={{ ...S.btnSm, textDecoration: 'none' }}>Google Maps</a>
                      <a href={`https://waze.com/ul?ll=${addr.lat},${addr.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer"
                        style={{ ...S.btnGhost, padding: '5px 12px', fontSize: '12px', textDecoration: 'none' }}>Waze</a>
                      <button type="button"
                        onClick={() => { navigator.clipboard?.writeText(`${addr.lat},${addr.lng}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                        style={{ ...S.btnGhost, padding: '5px 12px', fontSize: '12px' }}>
                        {copied ? 'Copied' : 'Copy coords'}
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: '11.5px', color: 'var(--gray)' }}>No map pin saved - address text only.</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Design Fee (&#8369;)">
            <DecimalInput value={form.designFee} onChange={set('designFee')} />
          </Field>
          <Field label="Delivery Fee (&#8369;)">
            <DecimalInput value={form.deliveryFee} onChange={set('deliveryFee')} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <Field label={<>Downpayment (&#8369;, optional){dpPct > 0 ? ` - ${dpPct}%` : ''}</>}>
            <DecimalInput
              value={form.downPayment}
              onChange={set('downPayment')}
              placeholder="Leave blank for 50% default"
            />
          </Field>
          {/* Validity is price protection: material costs move, and an old quote accepted
              weeks later can be honoured at a loss. Short by default, 30 available for
              customers who need to run it through approval. */}
          <Field label="Quote valid for">
            <CustomSelect
              value={String(form.expiresInDays || '7')}
              onChange={set('expiresInDays')}
              options={[
                { value: '3',  label: '3 days - rush / volatile prices' },
                { value: '7',  label: '7 days' },
                { value: '15', label: '15 days' },
                { value: '30', label: '30 days - corporate approval' },
              ]}
            />
          </Field>
        </div>

        <Field label="Note (optional)">
          {/* Matches the server's own limit, so a long note is stopped here rather than
              rejected after the owner has written it. */}
          <textarea
            value={form.note}
            onChange={e => set('note')(e.target.value)}
            placeholder="Size, material, artwork details, turnaround…"
            rows={2}
            maxLength={1000}
            style={{ ...S.textarea, minHeight: '58px', fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: '10px', color: 'var(--gray)', textAlign: 'right', marginTop: '2px' }}>
            {form.note.length}/1000
          </div>
        </Field>

        <Field label="Design / Mockup (optional)">
          {design ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 10px' }}>
              <img src={design.url} alt="" style={{ width: 40, height: 40, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--gray-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{designName || 'Attached design'}</span>
              <button type="button" onClick={() => { setDesign(null); setDesignName(''); }} style={{ background: 'none', border: 'none', color: '#e05252', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>{ICONS.trash}</button>
            </div>
          ) : (
            <label style={{ ...S.btnGhost, display: 'inline-flex', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
              {ICONS.plus}
              {uploading ? 'Uploading…' : 'Attach design file'}
              <input type="file" accept="image/*,.pdf,.ai" onChange={handleDesignPick} disabled={uploading} style={{ display: 'none' }} />
            </label>
          )}
          {uploadError && <span style={S.errText}>{uploadError}</span>}
          <span style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '2px' }}>
            Attaching the agreed artwork sends it straight into production - no separate proof step for the customer.
          </span>
        </Field>

        <div style={{ ...S.note, padding: '12px 14px', fontSize: '13px', color: 'var(--gray-light)' }}>
          {priced.filter(l => l.productId).flatMap(l => l.hasVariants
            ? l.rows.map(r => (
                <div key={l.key + r.variantId} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nameOf(l.productId)} ({r.name}) - {r.qty} &times; &#8369;{fmt(r.unitPrice)}
                  </span>
                  <span style={{ flexShrink: 0 }}>&#8369;{fmt(r.lineTotal)}</span>
                </div>
              ))
            : l.pricedByMaterials
              ? l.billed.map(m => (
                  <div key={l.key + m.inventoryId} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nameOf(l.productId)} ({m.name}) - {m.q} &times; &#8369;{fmt(m.p)}
                    </span>
                    <span style={{ flexShrink: 0 }}>&#8369;{fmt(Math.round(m.q * m.p * 100) / 100)}</span>
                  </div>
                ))
              : [(
                  <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nameOf(l.productId)} - {l.qty} &times; &#8369;{fmt(l.unitPrice)}
                    </span>
                    <span style={{ flexShrink: 0 }}>&#8369;{fmt(l.lineTotal)}</span>
                  </div>
                )])}
          {designFee > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Design fee</span>
              <span>&#8369;{fmt(designFee)}</span>
            </div>
          )}
          {deliveryFee > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Delivery fee</span>
              <span>&#8369;{fmt(deliveryFee)}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: '1px solid rgba(212,168,67,0.3)', paddingTop: '8px', marginTop: '6px',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--gold)' }}>Total</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gold)' }}>&#8369;{fmt(total)}</span>
          </div>

          {/* Estimated, not final: on-demand stock isn't bought until the customer
              commits, so the real cost is only known after purchasing. */}
          <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '8px' }}>
            {!anyMaterials ? (
              <div style={{ fontSize: '11.5px', color: 'var(--gray)', lineHeight: 1.45 }}>
                No materials attached - profit won&apos;t be tracked for this quote.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Material cost (est.)</span>
                  <span>&#8369;{fmt(materialCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>Estimated profit</span>
                  <span style={{ fontWeight: 800, color: estProfit < 0 ? '#e05252' : '#4ade80' }}>
                    &#8369;{fmt(estProfit)} <span style={{ fontWeight: 600, fontSize: '11px' }}>({estMargin}%)</span>
                  </span>
                </div>
                {deliveryFee > 0 && (
                  <div style={{ fontSize: '10.5px', color: 'var(--gray)', marginTop: '3px' }}>
                    Delivery fee excluded - it goes to the courier, not to you.
                  </div>
                )}
                {costlessMaterials.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#e0a852', marginTop: '5px', lineHeight: 1.45 }}>
                    {costlessMaterials.length} material{costlessMaterials.length > 1 ? 's have' : ' has'} no cost set
                    - this profit is overstated. Set an expected cost in Master Data.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default QuotationModal;
