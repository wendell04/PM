'use client';

/* eslint-disable @next/next/no-img-element */

/**
 * ADD PRODUCT PAGE — UPDATED (Made-to-Order toggle added)
 *
 * Changes from previous version:
 * 1. InventoryVariantCards now has per-variant "Allow Made-to-Order" toggle
 *    - When ON: storefront stock input is UNCAPPED (orders can exceed inventory)
 *    - System shows split: on-hand vs. for production
 *    - Status badge changes from "OUT OF STOCK" → "UPON ORDER"
 *    - Global toggle in header to apply MTO to all variants at once
 * 2. formData initial state now includes variantMadeToOrder: {}
 * 3. newProduct in handleSubmit now includes variantMadeToOrder
 * 4. Improved card design — better visual hierarchy, smoother toggles
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Reusable Number Input Component ───────────────────────────────────────────
function NumberInput({ value, onChange, min = 0, max, placeholder, className, disabled, step }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  const handleKeyDown = (e) => {
    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
  };
  const handleWheel = (e) => { e.target.blur(); e.preventDefault(); };
  return (
    <input type="number" className={className} value={value} onChange={handleChange}
      onKeyDown={handleKeyDown} onWheel={handleWheel} min={min} max={max}
      placeholder={placeholder} disabled={disabled} step={step} />
  );
}

// ── Inventory Helper (LocalStorage) ─────────────────────────────────────────
import { getInventoryList } from '../../inventory-old/page';

// ─── Category Product Selector (Two-Step Dropdown) ──────────────────────────
function CategoryProductSelector({ inventoryList, selectedCategory, onCategoryChange, selectedProduct, onProductChange, linkedProductIds }) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const categoryRef = useRef(null);
  const productRef = useRef(null);

  const categories = useMemo(() => {
    const cats = new Set();
    inventoryList.filter(i => i.isActive !== false).forEach(i => cats.add(i.category));
    return Array.from(cats).sort();
  }, [inventoryList]);

  const extractBaseProductName = useCallback((fullName) => {
    if (!fullName) return '';
    const patterns = [
      /\s+\/\s*[A-Za-z]+$/i, /\s+[A-Za-z]+\s*\/\s*\d+oz.*$/i,
      /\s+[A-Za-z]+\s*\/\s*\d+ml.*$/i, /\s+\d+oz\s*\/.*$/i,
      /\s+\d+ml\s*\/.*$/i, /\s+\d+oz$/i, /\s+\d+ml$/i,
    ];
    let name = fullName;
    for (const p of patterns) {
      const m = name.match(p);
      if (m) { name = name.substring(0, m.index).trim(); break; }
    }
    const materialPattern = /\s+(Cotton|Polyester|Linen|Wool|Silk|Nylon|Canvas|Vinyl|Paper|Plastic|Metal|Wood|Glass|Ceramic|White|Black|Red|Blue|Green|Yellow|Orange|Purple|Pink|Gray|Grey|Navy|Brown|Beige)$/i;
    const m = name.match(materialPattern);
    if (m) name = name.substring(0, m.index).trim();
    return name;
  }, []);

  const productsByCategory = useMemo(() => {
    if (!selectedCategory) return [];
    const items = inventoryList.filter(i =>
      i.isActive !== false && i.category === selectedCategory && !linkedProductIds.has(i.id)
    );
    const productMap = new Map();
    items.forEach(item => {
      const baseName = item.masterlistProductName || extractBaseProductName(item.name);
      if (!productMap.has(baseName)) productMap.set(baseName, { baseName, items: [], totalStock: 0 });
      const product = productMap.get(baseName);
      product.items.push(item);
      product.totalStock += item.stockQty || 0;
    });
    return Array.from(productMap.values()).map(p => ({
      name: p.baseName, items: p.items, totalStock: p.totalStock, variantCount: p.items.length
    }));
  }, [inventoryList, selectedCategory, linkedProductIds, extractBaseProductName]);

  useEffect(() => {
    const handler = (e) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target)) setCategoryOpen(false);
      if (productRef.current && !productRef.current.contains(e.target)) setProductOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCategorySelect = (cat) => { onCategoryChange(cat); onProductChange(''); setCategoryOpen(false); };
  const handleProductSelect = (baseProductName) => {
    const product = productsByCategory.find(p => p.name === baseProductName);
    if (product && product.items.length > 0) onProductChange(product.items[0].id);
    setProductOpen(false);
  };

  const selectedProductName = useMemo(() => {
    if (!selectedProduct) return '';
    const item = inventoryList.find(i => i.id === selectedProduct);
    return item ? (item.masterlistProductName || extractBaseProductName(item.name)) : '';
  }, [selectedProduct, inventoryList, extractBaseProductName]);

  const dropdownStyle = {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
    background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: '240px', overflowY: 'auto'
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
      <div ref={categoryRef} style={{ position: 'relative' }}>
        <label className="form-label">Product Category</label>
        <button type="button" onClick={() => setCategoryOpen(!categoryOpen)} className="form-select"
          style={{ background: 'var(--dark2)', border: selectedCategory ? '1px solid var(--gold)' : '1px solid var(--border)', borderRadius: '8px', padding: '0.875rem 1rem', color: selectedCategory ? 'var(--white)' : 'var(--gray)', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left' }}>
          {selectedCategory || 'Select a Category...'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform 0.2s', transform: categoryOpen ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {categoryOpen && (
          <div style={dropdownStyle}>
            {categories.map((cat, i) => (
              <button key={i} type="button" onClick={() => handleCategorySelect(cat)}
                style={{ width: '100%', padding: '0.75rem 1rem', background: selectedCategory === cat ? 'rgba(212,168,67,0.12)' : 'transparent', border: 'none', borderBottom: i < categories.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', color: selectedCategory === cat ? 'var(--gold)' : 'var(--gray-light)', fontSize: '0.875rem', fontWeight: selectedCategory === cat ? 600 : 400, cursor: 'pointer', textAlign: 'left' }}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={productRef} style={{ position: 'relative' }}>
        <label className="form-label">Product Variants</label>
        <button type="button" onClick={() => setProductOpen(!productOpen)} disabled={!selectedCategory} className="form-select"
          style={{ background: 'var(--dark2)', border: selectedProduct ? '1px solid var(--gold)' : '1px solid var(--border)', borderRadius: '8px', padding: '0.875rem 1rem', color: selectedProduct ? 'var(--white)' : 'var(--gray)', fontSize: '0.9rem', cursor: selectedCategory ? 'pointer' : 'not-allowed', opacity: selectedCategory ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left' }}>
          {selectedProductName || 'Select a Product...'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform 0.2s', transform: productOpen ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {productOpen && (
          <div style={dropdownStyle}>
            {productsByCategory.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>No available products</div>
            ) : (
              productsByCategory.map((product, i) => (
                <button key={i} type="button" onClick={() => handleProductSelect(product.name)}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: selectedProductName === product.name ? 'rgba(212,168,67,0.12)' : 'transparent', border: 'none', borderBottom: i < productsByCategory.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', color: selectedProductName === product.name ? 'var(--gold)' : 'var(--gray-light)', fontSize: '0.875rem', fontWeight: selectedProductName === product.name ? 600 : 400, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{product.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                        {product.variantCount} variant{product.variantCount !== 1 ? 's' : ''} · {product.totalStock} total stocks
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Combobox ──────────────────────────────────────────────────────────────────
function Combobox({ value, onChange, options, placeholder, label, required }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value || '');
  const ref = useRef(null);
  useEffect(() => { setInputVal(value || ''); }, [value]);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const filtered = options.filter(o => o.toLowerCase().includes((inputVal || '').toLowerCase()));
  const showAdd = inputVal && !options.find(o => o.toLowerCase() === inputVal.toLowerCase());
  const select = (val) => { setInputVal(val); onChange(val); setOpen(false); };
  return (
    <div ref={ref} className="combobox-root">
      {label && <label className="form-label">{label} {required && <span className="required">*</span>}</label>}
      <div className="combobox-field">
        <input type="text" className="form-input" value={inputVal} placeholder={placeholder} required={required}
          onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
        <button type="button" className="combobox-toggle" onClick={() => setOpen(o => !o)}>{open ? '▲' : '▼'}</button>
      </div>
      {open && (filtered.length > 0 || showAdd) && (
        <div className="combobox-menu">
          {filtered.map((opt, i) => <button key={i} type="button" className={`combobox-item${opt === value ? ' active' : ''}`} onClick={() => select(opt)}>{opt}</button>)}
          {showAdd && <button type="button" className="combobox-item combobox-add" onClick={() => select(inputVal)}><span>+</span> Add "{inputVal}"</button>}
        </div>
      )}
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────────
function comboLabel(combo) { return Object.values(combo).join(' / '); }
const sanitizeNumber = (val) => {
  if (val === '') return '';
  const num = parseFloat(val);
  return isNaN(num) || num < 0 ? '0' : val;
};

// ─── InventoryVariantCards — with Made-to-Order toggle ────────────────────────
// 
// LOGIC:
//   MTO OFF (default): storefront stock is capped at inventory stock.
//     - Badge: IN STOCK / LOW STOCK / OUT OF STOCK
//   MTO ON: storefront stock can exceed inventory stock.
//     - Excess = "for production" qty (backorder/made-to-order)
//     - Badge: UPON ORDER (with on-hand + to-produce split)
//
function InventoryVariantCards({ inventoryList, selectedProduct, formData, setFormData }) {
  const variants = useMemo(() => {
    if (!selectedProduct) return [];
    const selectedItem = inventoryList.find(i => i.id === selectedProduct);
    if (!selectedItem) return [];
    const productName = selectedItem.masterlistProductName || selectedItem.name;
    return inventoryList.filter(i =>
      i.isActive !== false &&
      i.category === selectedItem.category &&
      (i.masterlistProductName === productName || i.name.startsWith(productName))
    );
  }, [inventoryList, selectedProduct]);

  const getStorefrontStock = (variant) => {
    const key = variant.sku || variant.id;
    if (formData.variantStorefrontStock && formData.variantStorefrontStock[key] !== undefined) {
      return formData.variantStorefrontStock[key];
    }
    return variant.stockQty || 0;
  };

  const setStorefrontStock = (variant, value) => {
    const key = variant.sku || variant.id;
    const inventoryStock = variant.stockQty || 0;
    const isMTO = getMTO(variant);
    const parsed = parseInt(value) || 0;
    const numValue = isMTO ? Math.max(0, parsed) : Math.min(Math.max(0, parsed), inventoryStock);
    setFormData(prev => ({
      ...prev,
      variantStorefrontStock: { ...prev.variantStorefrontStock, [key]: numValue }
    }));
  };

  const getMTO = (variant) => {
    const key = variant.sku || variant.id;
    return !!(formData.variantMadeToOrder && formData.variantMadeToOrder[key]);
  };

  const setMTO = (variant, value) => {
    const key = variant.sku || variant.id;
    const inventoryStock = variant.stockQty || 0;
    setFormData(prev => {
      const updatedMTO = { ...prev.variantMadeToOrder, [key]: value };
      let updatedStorefront = { ...prev.variantStorefrontStock };
      if (!value) {
        const current = updatedStorefront[key] !== undefined ? updatedStorefront[key] : inventoryStock;
        updatedStorefront[key] = Math.min(current, inventoryStock);
      }
      return { ...prev, variantMadeToOrder: updatedMTO, variantStorefrontStock: updatedStorefront };
    });
  };

  const allMTO = variants.length > 0 && variants.every(v => getMTO(v));
  const someMTO = variants.some(v => getMTO(v));

  const toggleAllMTO = () => {
    const newVal = !allMTO;
    variants.forEach(v => setMTO(v, newVal));
  };

  if (!selectedProduct || variants.length === 0) return null;

  const totalStorefrontStock = variants.reduce((sum, v) => sum + getStorefrontStock(v), 0);
  const totalInventoryStock = variants.reduce((sum, v) => sum + (v.stockQty || 0), 0);
  const totalForProduction = Math.max(0, totalStorefrontStock - totalInventoryStock);
  const anyMTO = variants.some(v => getMTO(v));

  const getStatus = (variant) => {
    const storefrontStock = getStorefrontStock(variant);
    const inventoryStock = variant.stockQty || 0;
    const isMTO = getMTO(variant);
    if (isMTO && storefrontStock > inventoryStock) {
      const forProd = storefrontStock - inventoryStock;
      return { label: 'UPON ORDER', sublabel: `${inventoryStock} on-hand · ${forProd} to produce`, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', dot: '#f59e0b' };
    }
    if (storefrontStock === 0 && !isMTO) return { label: 'OUT OF STOCK', sublabel: null, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', dot: '#ef4444' };
    if (storefrontStock === 0 && isMTO) return { label: 'UPON ORDER', sublabel: 'Made to order', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', dot: '#f59e0b' };
    if (storefrontStock <= 10) return { label: 'LOW STOCK', sublabel: null, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', dot: '#f59e0b' };
    return { label: 'IN STOCK', sublabel: null, color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.25)', dot: '#4ade80' };
  };

  return (
    <div style={{ marginTop: '0.25rem' }}>

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1.25rem', paddingBottom: '0.875rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div>
          <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.12em' }}>
            VARIANT STOCK SUMMARY
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            {variants.length} variant{variants.length !== 1 ? 's' : ''} linked
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {/* Global MTO toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Made-to-Order (All)
            </span>
            <button type="button" onClick={toggleAllMTO} style={{
              position: 'relative', width: '36px', height: '20px', borderRadius: '10px',
              border: 'none', cursor: 'pointer',
              background: allMTO ? '#D4A843' : someMTO ? 'rgba(212,168,67,0.4)' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.2s', flexShrink: 0, padding: 0,
            }}>
              <span style={{
                position: 'absolute', top: '3px', left: allMTO ? '19px' : '3px',
                width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }} />
            </button>
          </div>

          {/* Totals */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
              {anyMTO ? 'Total (incl. production)' : 'Storefront Total'}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D4A843', lineHeight: 1.1 }}>
              {totalStorefrontStock} pcs
            </div>
            {totalStorefrontStock !== totalInventoryStock && (
              <div style={{ fontSize: '0.62rem', color: '#6b7280', marginTop: '0.2rem' }}>
                {totalForProduction > 0
                  ? `${totalInventoryStock} on-hand · ${totalForProduction} to produce`
                  : `Inventory: ${totalInventoryStock} pcs`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── VARIANT CARDS GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.75rem' }}>
        {variants.map((item) => {
          const status = getStatus(item);
          const variantLabel = item.variantCombo
            ? Object.values(item.variantCombo).join(' / ')
            : (item.name.replace(item.masterlistProductName || '', '').trim() || item.name);
          const storefrontStock = getStorefrontStock(item);
          const inventoryStock = item.stockQty || 0;
          const isMTO = getMTO(item);
          const isCustomized = storefrontStock !== inventoryStock;
          const forProduction = isMTO ? Math.max(0, storefrontStock - inventoryStock) : 0;

          return (
            <div key={item.id}
              style={{
                background: isMTO ? 'rgba(212,168,67,0.04)' : 'rgba(0,0,0,0.25)',
                border: `1px solid ${isMTO ? 'rgba(212,168,67,0.25)' : status.border}`,
                borderRadius: '12px', padding: '1rem',
                display: 'flex', flexDirection: 'column', gap: '0',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isMTO ? 'rgba(212,168,67,0.07)' : 'rgba(0,0,0,0.35)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isMTO ? 'rgba(212,168,67,0.04)' : 'rgba(0,0,0,0.25)'; }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.9rem' }}>{variantLabel}</div>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: status.dot, flexShrink: 0, marginTop: '4px', boxShadow: `0 0 6px ${status.dot}80` }} />
              </div>

              {/* SKU */}
              <div style={{ fontSize: '0.65rem', color: '#4b5563', fontFamily: 'monospace', letterSpacing: '0.05em', marginBottom: '0.875rem' }}>
                {item.sku}
              </div>

              {/* Stock Input */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem', display: 'block', letterSpacing: '0.08em' }}>
                  Storefront Availability
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    value={storefrontStock}
                    onChange={(e) => setStorefrontStock(item, e.target.value)}
                    min="0"
                    max={isMTO ? undefined : inventoryStock}
                    style={{
                      flex: 1, background: 'rgba(0,0,0,0.35)',
                      border: `1.5px solid ${isCustomized || isMTO ? '#D4A843' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '7px', padding: '0.5rem 0.65rem',
                      color: isCustomized || isMTO ? '#D4A843' : '#E5E2E1',
                      fontSize: '1rem', fontWeight: 800, outline: 'none', transition: 'border-color 0.15s',
                    }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>pcs</span>
                </div>

                {/* Stock breakdown */}
                {isMTO && storefrontStock > inventoryStock ? (
                  <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <div style={{ fontSize: '0.62rem', color: '#4ade80', fontWeight: 600 }}>✓ {inventoryStock} pcs on-hand</div>
                    <div style={{ fontSize: '0.62rem', color: '#f59e0b', fontWeight: 600 }}>⚙ {forProduction} pcs for production</div>
                  </div>
                ) : isCustomized && !isMTO ? (
                  <div style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: '0.3rem' }}>
                    Inventory: {inventoryStock} pcs · Reserved: {inventoryStock - storefrontStock} pcs
                  </div>
                ) : (
                  <div style={{ fontSize: '0.62rem', color: '#4b5563', marginTop: '0.3rem' }}>
                    Inventory: {inventoryStock} pcs
                  </div>
                )}
              </div>

              {/* MTO Toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 'auto',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.65rem', color: isMTO ? '#f59e0b' : '#6b7280', fontWeight: 700, transition: 'color 0.2s' }}>
                    Made-to-Order
                  </div>
                  <div style={{ fontSize: '0.58rem', color: '#4b5563', marginTop: '0.1rem', lineHeight: 1.3 }}>
                    {isMTO ? 'Orders can exceed stock' : 'Capped at inventory'}
                  </div>
                </div>
                <button type="button" onClick={() => setMTO(item, !isMTO)} style={{
                  position: 'relative', width: '34px', height: '19px', borderRadius: '10px',
                  border: 'none', cursor: 'pointer',
                  background: isMTO ? '#D4A843' : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.2s', flexShrink: 0, padding: 0, marginLeft: '0.75rem',
                }}>
                  <span style={{
                    position: 'absolute', top: '2.5px', left: isMTO ? '17px' : '2.5px',
                    width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
                    transition: 'left 0.18s cubic-bezier(.4,0,.2,1)', boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  }} />
                </button>
              </div>

              {/* Status Badge */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.6rem' }}>
                <span style={{
                  fontSize: '0.58rem', fontWeight: 800, padding: '0.18rem 0.5rem', borderRadius: '5px',
                  background: status.bg, color: status.color, border: `1px solid ${status.border}`,
                  textTransform: 'uppercase', letterSpacing: '0.06em'
                }}>
                  {status.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop: '1rem', padding: '0.6rem 1rem',
        background: anyMTO ? 'rgba(245,158,11,0.06)' : 'transparent',
        border: anyMTO ? '1px solid rgba(245,158,11,0.15)' : '1px solid transparent',
        borderRadius: '8px', transition: 'all 0.3s',
      }}>
        {anyMTO ? (
          <p style={{ fontSize: '0.65rem', color: '#f59e0b', margin: 0, fontWeight: 600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ⚙ Made-to-Order enabled — orders exceeding stock will be split into on-hand + for production
          </p>
        ) : (
          <p style={{ fontSize: '0.65rem', color: '#4b5563', margin: 0, fontWeight: 600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Set lower storefront stock to reserve inventory for walk-in customers
          </p>
        )}
      </div>
    </div>
  );
}

// ─── VariantGroupingCheckboxes ─────────────────────────────────────────────────
function VariantGroupingCheckboxes({ variantGroups, groupChecks, onGroupChecksChange }) {
  if (variantGroups.length < 2) return null;
  const [g1, g2] = variantGroups;

  const toggle = (primaryVal, secondaryVal) => {
    const current = groupChecks[primaryVal] || new Set();
    const next = new Set(current);
    next.has(secondaryVal) ? next.delete(secondaryVal) : next.add(secondaryVal);
    onGroupChecksChange({ ...groupChecks, [primaryVal]: next });
  };

  const toggleAll = (primaryVal) => {
    const current = groupChecks[primaryVal] || new Set();
    const allVals = g2.options.map(o => o.value);
    const allChecked = allVals.every(v => current.has(v));
    onGroupChecksChange({ ...groupChecks, [primaryVal]: allChecked ? new Set() : new Set(allVals) });
  };

  return (
    <div className="vgc-wrapper">
      <div className="vgc-hint">Merge Variant with the same price example: Small-red, Small-yellow, Small-green into Small (Red,Yellow, Green)</div>
      <div className="vgc-rows">
        {g1.options.map(p => {
          const checked = groupChecks[p.value] || new Set();
          const allChecked = g2.options.length > 0 && g2.options.every(o => checked.has(o.value));
          const someChecked = g2.options.some(o => checked.has(o.value));
          return (
            <div key={p.id} className="vgc-row">
              <span className="vgc-primary-badge">{p.value}</span>
              <span className="vgc-arrow"></span>
              <span className="vgc-g2-name">{g2.name || 'V2'}:</span>
              <label className="vgc-check-label vgc-all-label">
                <input type="checkbox" className="vgc-checkbox" checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={() => toggleAll(p.value)} />
                <span className="vgc-check-text">(all)</span>
              </label>
              {g2.options.map(s => (
                <label key={s.id} className="vgc-check-label">
                  <input type="checkbox" className="vgc-checkbox" checked={checked.has(s.value)} onChange={() => toggle(p.value, s.value)} />
                  <span className="vgc-check-text">{s.value}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── buildColumnGroups ──────────────────────────────────────────────────────────
function buildColumnGroups(variantGroups, combinations, groupChecks) {
  if (variantGroups.length === 0) return [];
  if (variantGroups.length === 1) {
    const g = variantGroups[0];
    return g.options.map(opt => {
      const combo = combinations.find(c => c.combo[g.id] === opt.value);
      return { key: opt.value, primaryVal: null, secondaryVals: [opt.value], label: opt.value, comboIds: combo ? [combo.id] : [], isMerged: false };
    });
  }
  const [g1, g2] = variantGroups;
  const cols = [];
  g1.options.forEach(p => {
    const checked = groupChecks[p.value] || new Set();
    const checkedArr = g2.options.filter(s => checked.has(s.value));
    const uncheckedArr = g2.options.filter(s => !checked.has(s.value));
    if (checkedArr.length >= 2) {
      const comboIds = checkedArr.map(s => combinations.find(c => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value)).filter(Boolean).map(c => c.id);
      cols.push({ key: `${p.value}::${checkedArr.map(s => s.value).join('|')}`, primaryVal: p.value, secondaryVals: checkedArr.map(s => s.value), label: checkedArr.map(s => s.value).join(' · '), comboIds, isMerged: true });
    }
    if (checkedArr.length === 1) {
      const s = checkedArr[0];
      const combo = combinations.find(c => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value);
      cols.push({ key: `${p.value}::${s.value}`, primaryVal: p.value, secondaryVals: [s.value], label: s.value, comboIds: combo ? [combo.id] : [], isMerged: false });
    }
    uncheckedArr.forEach(s => {
      const combo = combinations.find(c => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value);
      cols.push({ key: `${p.value}::${s.value}`, primaryVal: p.value, secondaryVals: [s.value], label: s.value, comboIds: combo ? [combo.id] : [], isMerged: false });
    });
  });
  return cols;
}

function getColumnPrice(comboIds, prices) {
  if (!comboIds.length) return '';
  const vals = comboIds.map(id => prices[id] || '');
  const nonEmpty = vals.find(v => v !== '');
  return nonEmpty !== undefined ? nonEmpty : '';
}

// ─── SmartPricingTable ─────────────────────────────────────────────────────────
function SmartPricingTable({ tiers, variantGroups, combinations, groupChecks, onPriceChange, updateTierRange, removeTier, mode }) {
  const hasVariants = variantGroups.length > 0 && combinations.length > 0;
  const columnGroups = buildColumnGroups(variantGroups, combinations, groupChecks);

  if (!hasVariants) {
    return (
      <div className="tier-table-wrap">
        <table className="tier-table">
          <thead>
            <tr>
              {mode === 'tiered' && <><th>Tier</th><th>Min Qty</th><th>Max Qty</th></>}
              <th>Price (₱)</th>
              {mode === 'tiered' && <th></th>}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, idx) => (
              <tr key={tier.id}>
                {mode === 'tiered' && (
                  <>
                    <td><span className="tier-badge">Tier {idx + 1}</span></td>
                    <td><NumberInput className="tier-input" value={tier.minQty ?? ''} placeholder="" min={0} onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'minQty', v); }} /></td>
                    <td><NumberInput className="tier-input" value={tier.maxQty ?? ''} placeholder="∞" min={0} onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'maxQty', v); }} /></td>
                  </>
                )}
                <td>
                  <div className="tier-price-cell">
                    <span className="peso">₱</span>
                    <NumberInput className="tier-input" value={tier.prices['__base__'] || ''} onChange={e => onPriceChange(tier.id, '__base__', sanitizeNumber(e.target.value))} placeholder="0" min={0} step="0.01" />
                  </div>
                </td>
                {mode === 'tiered' && <td>{tiers.length > 1 && <button type="button" className="btn-remove-tier" onClick={() => removeTier(tier.id)}>Remove</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="tier-table-wrap">
      <table className="tier-table smart-tier-table">
        <thead>
          <tr>
            {mode === 'tiered' && (<><th>Tier</th><th>Min Qty</th><th>Max Qty</th></>)}
            {columnGroups.map(cg => {
              const fullLabel = cg.primaryVal ? `${cg.primaryVal} / ${cg.label}` : cg.label;
              return (
                <th key={cg.key} className={`tier-variant-header${cg.isMerged ? ' tier-header-merged' : ''}`}
                  title={cg.isMerged ? `Merged: ${cg.primaryVal} / ${cg.secondaryVals.join(', ')} — same price` : ''}>
                  {cg.isMerged ? <span className="tier-merged-label">{fullLabel} <span className="tier-merged-badge">same ₱</span></span> : fullLabel}
                </th>
              );
            })}
            {mode === 'tiered' && <th></th>}
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, idx) => (
            <tr key={tier.id}>
              {mode === 'tiered' && (
                <>
                  <td><span className="tier-badge">Tier {idx + 1}</span></td>
                  <td><NumberInput className="tier-input" value={tier.minQty ?? ''} placeholder="1" min={0} onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'minQty', v); }} /></td>
                  <td><NumberInput className="tier-input" value={tier.maxQty ?? ''} placeholder="∞" min={0} onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'maxQty', v); }} /></td>
                </>
              )}
              {columnGroups.map(cg => {
                const colPrice = getColumnPrice(cg.comboIds, tier.prices);
                return (
                  <td key={cg.key} className={cg.isMerged ? 'smart-cell-merged' : ''}>
                    <div className="tier-price-cell">
                      <span className="peso">₱</span>
                      <NumberInput className="tier-input" value={colPrice}
                        onChange={e => { const newVal = sanitizeNumber(e.target.value); cg.comboIds.forEach(cid => onPriceChange(tier.id, cid, newVal)); }}
                        placeholder="0" min={0} step="0.01" title={cg.isMerged ? `Editing all: ${cg.secondaryVals.join(', ')}` : cg.label} />
                    </div>
                  </td>
                );
              })}
              {mode === 'tiered' && <td>{tiers.length > 1 && <button type="button" className="btn-remove-tier" onClick={() => removeTier(tier.id)}>Remove</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Product Preview Modal ─────────────────────────────────────────────────────
function ProductPreviewModal({ product, onClose }) {
  const allTierPrices = product.tiers.flatMap(t =>
    Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0)
  );
  const tierMinP = allTierPrices.length ? Math.min(...allTierPrices) : null;
  const tierMaxP = allTierPrices.length ? Math.max(...allTierPrices) : null;

  const fixedPricesArray = Object.values(product.variantPrices || {}).map(p => parseFloat(p)).filter(p => p > 0);
  const fixedMinP = fixedPricesArray.length ? Math.min(...fixedPricesArray) : null;
  const fixedMaxP = fixedPricesArray.length ? Math.max(...fixedPricesArray) : null;

  let displayMin = null, displayMax = null;
  if (product.priceType === 'fixed') {
    if (fixedPricesArray.length > 0) { displayMin = fixedMinP; displayMax = fixedMaxP; }
    else if (product.price) { displayMin = parseFloat(product.price); displayMax = displayMin; }
  } else if (product.priceType === 'tiered') {
    displayMin = tierMinP; displayMax = tierMaxP;
  }

  const variantGroups = product.variantGroups || [];
  const combinations = product.combinations || [];
  const hasCombinations = combinations.length > 0;

  const inventoryVariants = product.inventoryVariants || [];
  const totalStock = inventoryVariants.reduce((s, v) => s + (v.stockQty || 0), 0);

  const getStockBadge = (stockQty) => {
    if (stockQty === 0) return { label: 'Out of Stock', color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' };
    if (stockQty <= 10) return { label: 'Low Stock', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' };
    return { label: 'In Stock', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)' };
  };

  const sectionLabel = { fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '0.75rem' };
  const sectionBox = { padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)' };

  return (
    <div className="preview-overlay">
      <div className="preview-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px', width: '95%' }}>
        <div className="preview-modal-header">
          <div>
            <h3 className="preview-modal-title">Storefront Preview</h3>
            <p className="preview-modal-subtitle">Ganito makikita ng customer ang product</p>
          </div>
          <button type="button" className="preview-close" onClick={onClose}>×</button>
        </div>

        <div className="preview-modal-body" style={{ padding: 0, overflowY: 'auto', maxHeight: '72vh' }}>
          <div style={sectionBox}>
            <p style={sectionLabel}>Product Card</p>
            <div className="preview-card-wrap">
              <div className="preview-product-card">
                <div className="preview-card-image">
                  {product.thumbnail
                    ? <img src={product.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div className="preview-no-image">No Thumbnail</div>
                  }
                  {product.priceType === 'inquiry' && <span className="preview-inquiry-badge">For Inquiry</span>}
                </div>
                <div className="preview-card-info">
                  <p className="preview-card-category">{product.category}</p>
                  <h4 className="preview-card-name">{product.subCategoryName || product.productName || product.category}</h4>
                  <p className="preview-card-desc">{product.description || '—'}</p>
                  <div className="preview-card-footer">
                    <div>
                      {product.priceType === 'inquiry' ? (
                        <span className="preview-price-inquiry">For Inquiry</span>
                      ) : displayMin ? (
                        <span className="preview-price">
                          ₱{displayMin.toLocaleString()}
                          {displayMax !== displayMin ? ` – ₱${displayMax.toLocaleString()}` : ''}
                          <span className="preview-price-unit"> per item</span>
                        </span>
                      ) : (
                        <span className="preview-price-tbd">Price TBD</span>
                      )}
                    </div>
                    <button type="button" className="preview-add-btn">+ Add</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {variantGroups.length > 0 && (
            <div style={sectionBox}>
              <p style={sectionLabel}>Variants ({combinations.length} combination{combinations.length !== 1 ? 's' : ''})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {variantGroups.map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9ca3af', minWidth: '80px', textAlign: 'right', flexShrink: 0 }}>{g.name}:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {g.options.map(opt => (
                        <span key={opt.id} style={{ padding: '0.2rem 0.65rem', background: g.isLocked ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.08)', border: g.isLocked ? '1px solid rgba(212,168,67,0.35)' : '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', fontSize: '0.78rem', color: g.isLocked ? '#D4A843' : '#E5E2E1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          {opt.image && <img src={opt.image} alt={opt.value} style={{ width: '14px', height: '14px', borderRadius: '2px', objectFit: 'cover' }} />}
                          {opt.value}
                          {g.isLocked && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                        </span>
                      ))}
                    </div>
                    {g.isLocked && <span style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 600, opacity: 0.8 }}>(stockable)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {product.priceType === 'tiered' && product.tiers.length > 0 && (
            <div style={sectionBox}>
              <p style={sectionLabel}>Pricing Tiers</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {product.tiers.map((tier, i) => {
                  const tierPrices = Object.entries(tier.prices).filter(([, v]) => v && parseFloat(v) > 0);
                  return (
                    <div key={tier.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.65rem 0.875rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px' }}>
                      <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(212,168,67,0.2)', border: '1px solid rgba(212,168,67,0.4)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#D4A843', whiteSpace: 'nowrap', flexShrink: 0 }}>Tier {i + 1}</span>
                      <span style={{ fontSize: '0.82rem', color: '#9ca3af', flexShrink: 0, marginTop: '0.05rem' }}>{tier.minQty || '?'} – {tier.maxQty || '∞'} pcs</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', flex: 1, justifyContent: 'flex-end' }}>
                        {hasCombinations ? (tierPrices.length > 0 ? tierPrices.map(([comboId, price]) => {
                          const combo = combinations.find(c => String(c.id) === String(comboId));
                          return (<span key={comboId} style={{ padding: '0.15rem 0.55rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '0.72rem', color: '#E5E2E1', fontWeight: 500 }}><span style={{ color: '#9ca3af' }}>{combo?.label || comboId}: </span><strong style={{ color: '#D4A843' }}>₱{parseFloat(price).toLocaleString()}</strong></span>);
                        }) : <span style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>No prices set</span>) : (tier.prices['__base__'] ? <strong style={{ color: '#D4A843', fontSize: '0.9rem' }}>₱{parseFloat(tier.prices['__base__']).toLocaleString()}</strong> : <span style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>No price set</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {product.priceType === 'fixed' && hasCombinations && (
            <div style={sectionBox}>
              <p style={sectionLabel}>Variant Combinations & Prices ({combinations.length})</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
                {combinations.map(combo => {
                  const price = (product.variantPrices || {})[combo.id];
                  const hasPrice = price && parseFloat(price) > 0;
                  return (
                    <div key={combo.id} style={{ padding: '0.6rem 0.75rem', background: hasPrice ? 'rgba(212,168,67,0.06)' : 'rgba(0,0,0,0.2)', border: hasPrice ? '1px solid rgba(212,168,67,0.2)' : '1px solid rgba(255,255,255,0.06)', borderRadius: '7px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.4rem' }}>
                        {Object.entries(combo.combo).map(([groupId, val]) => {
                          const grp = variantGroups.find(g => String(g.id) === String(groupId));
                          return <span key={groupId} style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '10px', background: grp?.isLocked ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.08)', color: grp?.isLocked ? '#D4A843' : '#E5E2E1', border: grp?.isLocked ? '1px solid rgba(212,168,67,0.3)' : '1px solid rgba(255,255,255,0.1)' }}>{val}</span>;
                        })}
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: hasPrice ? '#D4A843' : '#6b7280' }}>{hasPrice ? `₱${parseFloat(price).toLocaleString()}` : 'No price'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {product.priceType === 'tiered' && hasCombinations && product.tiers.length > 0 && (
            <div style={sectionBox}>
              <p style={sectionLabel}>Full Price Matrix ({combinations.length} variants × {product.tiers.length} tiers)</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#6b7280', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>Variant</th>
                      {product.tiers.map((tier, i) => <th key={tier.id} style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#D4A843', fontWeight: 700, fontSize: '0.65rem', whiteSpace: 'nowrap' }}>Tier {i + 1}<br /><span style={{ color: '#6b7280', fontWeight: 400 }}>{tier.minQty || '?'}–{tier.maxQty || '∞'}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {combinations.map((combo, ci) => (
                      <tr key={combo.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: ci % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
                            {Object.entries(combo.combo).map(([groupId, val]) => {
                              const grp = variantGroups.find(g => String(g.id) === String(groupId));
                              return <span key={groupId} style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.35rem', borderRadius: '8px', background: grp?.isLocked ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.08)', color: grp?.isLocked ? '#D4A843' : '#E5E2E1' }}>{val}</span>;
                            })}
                          </div>
                        </td>
                        {product.tiers.map(tier => {
                          const price = tier.prices[combo.id];
                          return <td key={tier.id} style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: price && parseFloat(price) > 0 ? '#D4A843' : '#4b5563' }}>{price && parseFloat(price) > 0 ? `₱${parseFloat(price).toLocaleString()}` : '—'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ ...sectionBox, borderBottom: 'none' }}>
            <p style={sectionLabel}>Availability</p>
            {inventoryVariants.length > 0 ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.6rem' }}>
                  {inventoryVariants.map((v, i) => {
                    const badge = getStockBadge(v.stockQty);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.7rem', background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: '20px', fontSize: '0.75rem' }}>
                        <span style={{ color: '#E5E2E1', fontWeight: 600 }}>{v.variantLabel}</span>
                        <span style={{ color: '#6b7280' }}>·</span>
                        <span style={{ color: badge.color, fontWeight: 700 }}>{v.stockQty} pcs</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                  Total inventory stock: <strong style={{ color: '#D4A843' }}>{totalStock} pcs</strong>
                </div>
              </>
            ) : (
              <span className="preview-stock-badge upon-order">Upon Order / Supplied</span>
            )}
          </div>
        </div>

        <div className="preview-modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>Close Preview</button>
        </div>
      </div>
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────────────
function DuplicateProductModal({ isOpen, onClose, category, subCategoryName }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay"><div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2 className="modal-title modal-title-warning">Duplicate Product Detected</h2><button className="modal-close" onClick={onClose}>×</button></div>
      <div className="modal-body"><p className="delete-confirm-text">Product <strong>"{category} - {subCategoryName || '(No sub-category)'}"</strong> already exists!</p><p className="delete-confirm-warning" style={{ marginTop: '0.75rem' }}>Please edit the existing product in the Product Listing instead.</p></div>
      <div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Close</button></div>
    </div></div>
  );
}

function SuccessModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay"><div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2 className="modal-title modal-title-success">Product Added Successfully!</h2><button className="modal-close" onClick={onClose}>×</button></div>
      <div className="modal-body"><p className="delete-confirm-text">Your product has been saved to the catalog.</p></div>
      <div className="modal-actions"><button type="button" className="btn-primary" onClick={onClose}>Done</button></div>
    </div></div>
  );
}

function PriceErrorModal({ isOpen, onClose, message }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay"><div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2 className="modal-title modal-title-warning">Price Required</h2><button className="modal-close" onClick={onClose}>×</button></div>
      <div className="modal-body"><p className="delete-confirm-text">{message}</p></div>
      <div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Close</button></div>
    </div></div>
  );
}

function InventoryErrorModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay"><div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2 className="modal-title modal-title-warning">Product Required</h2><button className="modal-close" onClick={onClose}>×</button></div>
      <div className="modal-body">
        <p className="delete-confirm-text">Please select a <strong>Product / Blank Item</strong> from the inventory first.</p>
        <p className="delete-confirm-warning" style={{ marginTop: '0.75rem' }}>This ensures that your product is linked to the correct material and stock levels.</p>
      </div>
      <div className="modal-actions"><button type="button" className="btn-primary" onClick={onClose}>OK</button></div>
    </div></div>
  );
}

function ConfirmSaveProductModal({ isOpen, onClose, onConfirm, product }) {
  if (!isOpen || !product) return null;
  let priceInfo = '';
  if (product.priceType === 'inquiry') priceInfo = 'For Inquiry';
  else if (product.priceType === 'fixed') {
    if (product.variantPrices) {
      const prices = Object.values(product.variantPrices).map(p => parseFloat(p)).filter(p => p > 0);
      const minP = prices.length ? Math.min(...prices) : 0; const maxP = prices.length ? Math.max(...prices) : 0;
      priceInfo = `₱${minP}${maxP !== minP ? ` – ₱${maxP}` : ''}`;
    } else if (product.price) priceInfo = `₱${product.price}`;
  } else if (product.priceType === 'tiered' && product.tiers) {
    const allPrices = product.tiers.flatMap(t => Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0));
    const minP = allPrices.length ? Math.min(...allPrices) : 0; const maxP = allPrices.length ? Math.max(...allPrices) : 0;
    priceInfo = `₱${minP}${maxP !== minP ? ` – ₱${maxP}` : ''} (tiered)`;
  }

  return (
    <div className="modal-overlay"><div className="modal-content" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2 className="modal-title modal-title-success">Confirm Save Product</h2><button className="modal-close" onClick={onClose}>×</button></div>
      <div className="modal-body">
        <p className="delete-confirm-text" style={{ marginBottom: '1.5rem' }}>Please review the product details before saving to your catalog.</p>
        <div className="confirm-summary" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.25rem' }}>
          {product.thumbnail && <div style={{ marginBottom: '1rem', textAlign: 'center' }}><img src={product.thumbnail} alt="Product thumbnail" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} /></div>}
          <div className="confirm-row" style={{ marginBottom: '0.75rem' }}><span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Product:</span><span style={{ fontWeight: '600', color: 'var(--white)' }}>{product.category} {product.subCategoryName ? `- ${product.subCategoryName}` : ''}</span></div>
          {product.description && <div className="confirm-row" style={{ marginBottom: '0.75rem' }}><span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Description:</span><span style={{ color: 'var(--white)' }}>{product.description.length > 100 ? product.description.substring(0, 100) + '...' : product.description}</span></div>}
          <div className="confirm-row" style={{ marginBottom: '0.75rem' }}><span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Price:</span><span style={{ color: '#facc15', fontWeight: '600' }}>{priceInfo}</span></div>
          {product.variantGroups?.length > 0 && <div className="confirm-row" style={{ marginBottom: '0.75rem' }}><span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Variants:</span><span style={{ color: 'var(--white)' }}>{product.variantGroups.length} group(s) ({product.combinations?.length || 0} combinations)</span></div>}
          {product.images?.length > 0 && <div className="confirm-row" style={{ marginBottom: '0.75rem' }}><span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Images:</span><span style={{ color: 'var(--white)' }}>{product.images.length} image{product.images.length > 1 ? 's' : ''}</span></div>}
        </div>
        <p style={{ marginTop: '1rem', color: 'var(--gray)', fontSize: '0.875rem' }}>Click "Confirm Save" to add this product to your catalog.</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={onConfirm}>Confirm Save</button>
      </div>
    </div></div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AddProductsPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    category: '',
    subCategoryCode: '',
    subCategoryName: '',
    productName: '',
    description: '',
    priceType: 'fixed',
    trackInventory: true,
    stock: '',
    inventoryId: '',
    variantStorefrontStock: {},
    variantMadeToOrder: {},        // ← NEW: per-variant MTO toggle state
  });

  const [fixedPrice, setFixedPrice] = useState('');
  const [fixedPriceVariants, setFixedPriceVariants] = useState({});
  const [tiers, setTiers] = useState([{ id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } }]);
  const [variantGroups, setVariantGroups] = useState([]);
  const [optionInputs, setOptionInputs] = useState({});
  const [combinations, setCombinations] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [variantWarning, setVariantWarning] = useState('');
  const [groupChecks, setGroupChecks] = useState({});
  const [thumbnail, setThumbnail] = useState(null);
  const [images, setImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragOverThumb, setDragOverThumb] = useState(false);
  const [savedCategories, setSavedCategories] = useState([]);
  const [savedSubCategories, setSavedSubCategories] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPriceErrorModal, setShowPriceErrorModal] = useState(false);
  const [priceErrorMessage, setPriceErrorMessage] = useState('');
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);
  const [pendingNewProduct, setPendingNewProduct] = useState(null);
  const [showInventoryErrorModal, setShowInventoryErrorModal] = useState(false);
  const [inventoryList, setInventoryList] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    setSavedCategories(JSON.parse(localStorage.getItem('customCategories') || '[]'));
    setSavedSubCategories(JSON.parse(localStorage.getItem('subCategories') || '{}'));
    const inventory = getInventoryList();
    setInventoryList(inventory);
  }, []);

  const linkedProductIds = useMemo(() => {
    if (typeof window === 'undefined') return new Set();
    const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    return new Set(allProducts.map(p => p.inventoryId).filter(id => id));
  }, []);

  const hasVariants = combinations.length > 0;

  const selectedInventoryVariants = useMemo(() => {
    if (!formData.inventoryId) return [];
    const selectedItem = inventoryList.find(i => i.id === formData.inventoryId);
    if (!selectedItem) return [];
    const productName = selectedItem.masterlistProductName || selectedItem.name;
    return inventoryList.filter(i =>
      i.isActive !== false &&
      i.category === selectedItem.category &&
      (i.masterlistProductName === productName || i.name.startsWith(productName))
    ).map(i => ({
      ...i,
      variantLabel: i.variantCombo ? Object.values(i.variantCombo).join(' / ') : i.name
    }));
  }, [formData.inventoryId, inventoryList]);

  const totalInventoryStock = useMemo(() =>
    selectedInventoryVariants.reduce((sum, v) => sum + (v.stockQty || 0), 0),
    [selectedInventoryVariants]
  );

  const handleInventoryChange = (inventoryId) => {
    const selectedItem = inventoryId ? inventoryList.find(inv => inv.id === inventoryId) : null;

    setFormData(prev => ({
      ...prev,
      inventoryId,
      category: selectedItem ? selectedItem.category : '',
      subCategoryName: selectedItem ? (selectedItem.masterlistProductName || selectedItem.name) : '',
      subCategoryCode: selectedItem ? (selectedItem.masterlistProductName || selectedItem.name).split(' ').filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase().slice(0, 8) : '',
      trackInventory: selectedItem ? !selectedItem.isOnDemand : true,
      stock: '',
      variantStorefrontStock: {},
      variantMadeToOrder: {},        // ← reset MTO state on product change
    }));

    // ── GET VARIANT TYPES FROM INVENTORY (not directly from Masterlist) ──
    // Inventory items already have variantTypes populated when created from Masterlist
    // Products should ALWAYS get variants from Inventory, ensuring proper sync
    if (selectedItem && selectedItem.variantTypes && selectedItem.variantTypes.length > 0) {
      const autoGroups = selectedItem.variantTypes.slice(0, 3).map((vt, idx) => ({
        id: idx + 1,
        name: vt.name,
        isStockable: vt.stockable !== false,
        isLocked: vt.stockable !== false,
        options: vt.options.map((opt, optIdx) => ({ id: optIdx + 1, value: opt, image: null }))
      }));
      setVariantGroups(autoGroups);
      const stockableGroups = autoGroups.filter(g => g.isStockable !== false);
      if (stockableGroups.length > 0) {
        const combos = cartesian(stockableGroups);
        setCombinations(combos.map((combo, idx) => ({ id: idx + 1, combo, label: comboLabel(combo) })));
      } else {
        setCombinations([]);
      }
    } else {
      setVariantGroups([]);
      setCombinations([]);
      setGroupChecks({});
    }

    if (!inventoryId) {
      setFixedPrice('');
      setFixedPriceVariants({});
      setTiers(prev => prev.map(t => ({ ...t, prices: { '__base__': '' } })));
      setVariantGroups([]);
      setCombinations([]);
      setGroupChecks({});
    }
  };

  const cartesian = (groups) => {
    const filled = groups.filter(g => g.options.length > 0);
    if (!filled.length) return [];
    return filled.reduce((acc, g) => {
      if (!acc.length) return g.options.map(o => ({ [g.id]: o.value }));
      return acc.flatMap(ex => g.options.map(o => ({ ...ex, [g.id]: o.value })));
    }, []);
  };

  const rebuildAll = (groups) => {
    const stockableGroups = groups.filter(g => g.isStockable !== false);
    const combos = cartesian(stockableGroups);
    if (groups.length >= 2) {
      const g1 = groups[0];
      setGroupChecks(prev => {
        const next = {};
        g1.options.forEach(o => { next[o.value] = prev[o.value] instanceof Set ? prev[o.value] : new Set(); });
        return next;
      });
    } else {
      setGroupChecks({});
    }
    if (combos.length === 0) {
      setCombinations([]);
      setTiers(prev => prev.map(t => ({ ...t, prices: { '__base__': t.prices['__base__'] || '' } })));
      return;
    }
    const newCombos = combos.map(combo => ({ id: JSON.stringify(combo), combo, label: comboLabel(combo) }));
    setCombinations(newCombos);
    setTiers(prev => prev.map(t => {
      const p = {};
      newCombos.forEach(c => { p[c.id] = t.prices[c.id] !== undefined ? t.prices[c.id] : ''; });
      return { ...t, prices: p };
    }));
  };

  const addGroup = () => {
    if (variantGroups.length >= 3) return;
    if (variantGroups.length >= 1) {
      const firstGroup = variantGroups[0];
      if (!firstGroup.name.trim() || firstGroup.options.length === 0) {
        setVariantWarning('Please fill in Variant 1 name and add at least 1 option before adding another variant!');
        setTimeout(() => setVariantWarning(''), 4000);
        return;
      }
    }
    setVariantWarning('');
    const g = { id: Date.now(), name: '', isStockable: false, isLocked: false, options: [] };
    setVariantGroups(prev => [...prev, g]);
    setOptionInputs(prev => ({ ...prev, [g.id]: '' }));
    setFixedPriceVariants({});
  };

  const removeGroup = (gid) => {
    const group = variantGroups.find(g => g.id === gid);
    if (group?.isLocked) return;
    const u = variantGroups.filter(g => g.id !== gid);
    setVariantGroups(u);
    setDuplicateWarning('');
    setFixedPriceVariants({});
    rebuildAll(u);
  };

  const updateGroupName = (gid, name) => setVariantGroups(variantGroups.map(g => g.id === gid ? { ...g, name } : g));

  const addOption = (gid) => {
    const group = variantGroups.find(g => g.id === gid);
    if (group?.isLocked) return;
    const val = (optionInputs[gid] || '').trim();
    if (!val) return;
    if (group && group.options.some(o => o.value.toLowerCase() === val.toLowerCase())) {
      setDuplicateWarning(`"${val}" already exists in this variant!`);
      setTimeout(() => setDuplicateWarning(''), 3000);
      return;
    }
    const u = variantGroups.map(g =>
      g.id === gid ? { ...g, options: [...g.options, { id: Date.now(), value: val, image: null }] } : g
    );
    setVariantGroups(u);
    setOptionInputs(prev => ({ ...prev, [gid]: '' }));
    rebuildAll(u);
  };

  const removeOption = (gid, oid) => {
    const group = variantGroups.find(g => g.id === gid);
    if (group?.isLocked) return;
    const u = variantGroups.map(g => g.id === gid ? { ...g, options: g.options.filter(o => o.id !== oid) } : g);
    setVariantGroups(u);
    rebuildAll(u);
  };

  const handleOptionImageUpload = (gid, oid, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setVariantGroups(prev => prev.map(g =>
        g.id === gid ? { ...g, options: g.options.map(o => o.id === oid ? { ...o, image: e.target.result } : o) } : g
      ));
    };
    reader.readAsDataURL(file);
  };

  const removeOptionImage = (gid, oid) => {
    setVariantGroups(prev => prev.map(g =>
      g.id === gid ? { ...g, options: g.options.map(o => o.id === oid ? { ...o, image: null } : o) } : g
    ));
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const emptyPrices = hasVariants ? combinations.reduce((acc, c) => ({ ...acc, [c.id]: '' }), {}) : { '__base__': '' };
    setTiers(prev => [...prev, { id: Date.now(), minQty: last ? (parseInt(last.maxQty) || 0) + 1 : 1, maxQty: '', prices: emptyPrices }]);
  };

  const removeTier = (id) => setTiers(tiers.filter(t => t.id !== id));
  const updateTierRange = (id, field, val) => setTiers(tiers.map(t => t.id === id ? { ...t, [field]: val } : t));
  const updateTierPrice = (tierId, priceKey, val) => setTiers(tiers.map(t => t.id === tierId ? { ...t, prices: { ...t.prices, [priceKey]: val } } : t));

  const updateTierPriceWithMerge = (tierId, priceKey, val) => {
    const combo = combinations.find(c => c.id === priceKey);
    if (combo && variantGroups.length >= 2) {
      const primaryVal = combo.combo[variantGroups[0].id];
      const checkedSet = groupChecks[primaryVal];
      if (checkedSet && checkedSet.size > 1) {
        const comboIdsForThisGroup = combinations.filter(c => c.combo[variantGroups[0].id] === primaryVal && checkedSet.has(c.combo[variantGroups[1].id])).map(c => c.id);
        setTiers(tiers.map(t => {
          if (t.id !== tierId) return t;
          const newPrices = { ...t.prices };
          comboIdsForThisGroup.forEach(cid => { newPrices[cid] = val; });
          return { ...t, prices: newPrices };
        }));
        return;
      }
    }
    updateTierPrice(tierId, priceKey, val);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hasVariants || tiers.length === 0) return;
    setTiers(prevTiers => prevTiers.map(tier => {
      const newPrices = { ...tier.prices }; let changed = false;
      Object.entries(groupChecks).forEach(([primaryVal, checkedSet]) => {
        if (checkedSet.size <= 1) return;
        const comboIdsForThisGroup = combinations.filter(c => c.combo[variantGroups[0]?.id] === primaryVal && checkedSet.has(c.combo[variantGroups[1]?.id])).map(c => c.id);
        if (comboIdsForThisGroup.length <= 1) return;
        const firstPrice = comboIdsForThisGroup.map(id => newPrices[id]).find(p => p !== '' && p !== undefined) || '';
        comboIdsForThisGroup.forEach(id => { if (newPrices[id] !== firstPrice) { newPrices[id] = firstPrice; changed = true; } });
      });
      return changed ? { ...tier, prices: newPrices } : tier;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupChecks]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hasVariants) return;
    setFixedPriceVariants(prev => {
      const newPrices = { ...prev }; let changed = false;
      Object.entries(groupChecks).forEach(([primaryVal, checkedSet]) => {
        if (checkedSet.size <= 1) return;
        const comboIdsForThisGroup = combinations.filter(c => c.combo[variantGroups[0]?.id] === primaryVal && checkedSet.has(c.combo[variantGroups[1]?.id])).map(c => c.id);
        if (comboIdsForThisGroup.length <= 1) return;
        const firstPrice = comboIdsForThisGroup.map(id => newPrices[id]).find(p => p !== '' && p !== undefined) || '';
        comboIdsForThisGroup.forEach(id => { if (newPrices[id] !== firstPrice) { newPrices[id] = firstPrice; changed = true; } });
      });
      return changed ? newPrices : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupChecks]);

  const updateFixedPriceWithMerge = (comboId, val) => {
    const combo = combinations.find(c => c.id === comboId);
    if (combo && variantGroups.length >= 2) {
      const primaryVal = combo.combo[variantGroups[0].id];
      const checkedSet = groupChecks[primaryVal];
      if (checkedSet && checkedSet.size > 1) {
        const comboIdsForThisGroup = combinations.filter(c => c.combo[variantGroups[0].id] === primaryVal && checkedSet.has(c.combo[variantGroups[1].id])).map(c => c.id);
        setFixedPriceVariants(prev => { const newPrices = { ...prev }; comboIdsForThisGroup.forEach(cid => { newPrices[cid] = val; }); return newPrices; });
        return;
      }
    }
    setFixedPriceVariants(prev => ({ ...prev, [comboId]: val }));
  };

  const createImageObj = (file) => ({ file, preview: URL.createObjectURL(file), id: Date.now() + Math.random() });
  const handleThumbnailUpload = (files) => { const file = files[0]; if (!file) return; setThumbnail(createImageObj(file)); };
  const handleThumbnailDrop = (e) => { e.preventDefault(); setDragOverThumb(false); if (e.dataTransfer.files?.length) handleThumbnailUpload(e.dataTransfer.files); };
  const handleImageUpload = (files) => setImages(prev => [...prev, ...Array.from(files).map(createImageObj)]);
  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleImageUpload(e.dataTransfer.files); };
  const removeImage = (id) => setImages(images.filter(img => img.id !== id));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.inventoryId) { setShowInventoryErrorModal(true); return; }

    if (formData.priceType === 'fixed') {
      if (hasVariants) {
        const allPricesFilled = Object.values(fixedPriceVariants).every(p => p !== '' && p !== null && parseFloat(p) > 0);
        if (!allPricesFilled) { setPriceErrorMessage('Please enter prices for all variants, or set price type to "For Inquiry".'); setShowPriceErrorModal(true); return; }
      } else {
        if (!fixedPrice || parseFloat(fixedPrice) <= 0) { setPriceErrorMessage('Please enter a price.'); setShowPriceErrorModal(true); return; }
      }
    } else if (formData.priceType === 'tiered') {
      const allTiersFilled = tiers.every(tier => Object.values(tier.prices).every(p => p !== '' && p !== null && parseFloat(p) > 0));
      if (!allTiersFilled) { setPriceErrorMessage('Please enter prices for all items in the pricing tiers.'); setShowPriceErrorModal(true); return; }
    }

    const existingProducts = JSON.parse(localStorage.getItem('products') || '[]');
    const isDuplicate = existingProducts.some(p => p.category === formData.category && p.subCategoryName === formData.subCategoryName);
    if (isDuplicate) { setShowDuplicateModal(true); return; }

    const newProduct = {
      id: Date.now(),
      inventoryId: formData.inventoryId || null,
      category: formData.category,
      subCategoryCode: formData.subCategoryCode,
      subCategoryName: formData.subCategoryName,
      description: formData.description,
      priceType: formData.priceType,
      ...(formData.priceType === 'fixed'
        ? hasVariants ? { variantPrices: fixedPriceVariants } : { price: fixedPrice }
        : { tiers }
      ),
      variantGroups,
      combinations,
      thumbnail: thumbnail?.preview || null,
      images: images.map(img => img.preview),
      trackInventory: selectedInventoryVariants.length > 0,
      stock: totalInventoryStock,
      inventoryVariants: selectedInventoryVariants.map(v => ({
        variantLabel: v.variantLabel,
        stockQty: v.stockQty,
        sku: v.sku,
        // ← NEW: persist MTO setting per variant
        madeToOrder: !!(formData.variantMadeToOrder && formData.variantMadeToOrder[v.sku || v.id]),
        storefrontStock: formData.variantStorefrontStock?.[v.sku || v.id] ?? v.stockQty,
      })),
      variantMadeToOrder: formData.variantMadeToOrder,   // ← NEW
      variantStorefrontStock: formData.variantStorefrontStock,
      createdAt: new Date().toISOString(),
    };

    setPendingNewProduct(newProduct);
    setShowConfirmSaveModal(true);
  };

  const handleConfirmSave = () => {
    if (!pendingNewProduct) return;
    if (formData.category && !savedCategories.includes(formData.category)) {
      const updated = [...savedCategories, formData.category];
      setSavedCategories(updated);
      localStorage.setItem('customCategories', JSON.stringify(updated));
    }
    if (formData.category && formData.subCategoryName) {
      const existingSubs = savedSubCategories[formData.category] || [];
      if (!existingSubs.includes(formData.subCategoryName)) {
        const updatedSubs = { ...savedSubCategories, [formData.category]: [...existingSubs, formData.subCategoryName] };
        setSavedSubCategories(updatedSubs);
        localStorage.setItem('subCategories', JSON.stringify(updatedSubs));
      }
    }
    const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    allProducts.push({ ...pendingNewProduct, id: crypto.randomUUID(), isPublished: false, createdAt: new Date().toISOString() });
    localStorage.setItem('pmp_products', JSON.stringify(allProducts));
    setShowConfirmSaveModal(false);
    setPendingNewProduct(null);
    setShowSuccessModal(true);
    setTimeout(() => {
      setShowSuccessModal(false);
      setFormData({
        category: '', subCategoryCode: '', subCategoryName: '', productName: '',
        description: '', priceType: 'fixed', trackInventory: true, stock: '',
        inventoryId: '', variantStorefrontStock: {}, variantMadeToOrder: {},
      });
      setFixedPrice(''); setFixedPriceVariants({});
      setTiers([{ id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } }]);
      setVariantGroups([]); setCombinations([]);
      setThumbnail(null); setImages([]);
      router.push('/dashboard/business/products');
    }, 1500);
  };

  const allPrices = tiers.flatMap(t => Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0));
  const minP = allPrices.length ? Math.min(...allPrices) : null;
  const maxP = allPrices.length ? Math.max(...allPrices) : null;
  const fixedPricesArray = hasVariants ? Object.values(fixedPriceVariants).map(p => parseFloat(p)).filter(p => p > 0) : [];
  const fixedMinP = fixedPricesArray.length ? Math.min(...fixedPricesArray) : null;
  const fixedMaxP = fixedPricesArray.length ? Math.max(...fixedPricesArray) : null;

  const previewProduct = {
    category: formData.category,
    subCategoryName: formData.subCategoryName,
    productName: formData.productName || formData.subCategoryName || formData.category,
    description: formData.description,
    priceType: formData.priceType,
    price: fixedPrice,
    variantPrices: fixedPriceVariants,
    tiers,
    variantGroups,
    combinations,
    thumbnail: thumbnail?.preview || null,
    trackInventory: selectedInventoryVariants.length > 0,
    stock: totalInventoryStock,
    inventoryVariants: selectedInventoryVariants.map(v => ({
      variantLabel: v.variantLabel || (v.variantCombo ? Object.values(v.variantCombo).join(' / ') : v.name),
      stockQty: v.stockQty || 0,
      sku: v.sku
    })),
  };

  const editableGroupCount = variantGroups.filter(g => !g.isLocked).length;
  const lockedGroupCount = variantGroups.filter(g => g.isLocked).length;
  const maxGroupsAllowed = 3;

  return (
    <div>
      {showPreview && <ProductPreviewModal product={previewProduct} onClose={() => setShowPreview(false)} />}
      <DuplicateProductModal isOpen={showDuplicateModal} onClose={() => setShowDuplicateModal(false)} category={formData.category} subCategoryName={formData.subCategoryName} />
      <SuccessModal isOpen={showSuccessModal} onClose={() => { setShowSuccessModal(false); router.push('/dashboard/business/products'); }} />
      <PriceErrorModal isOpen={showPriceErrorModal} onClose={() => setShowPriceErrorModal(false)} message={priceErrorMessage} />
      <InventoryErrorModal isOpen={showInventoryErrorModal} onClose={() => setShowInventoryErrorModal(false)} />
      <ConfirmSaveProductModal isOpen={showConfirmSaveModal} onClose={() => { setShowConfirmSaveModal(false); setPendingNewProduct(null); }} onConfirm={handleConfirmSave} product={pendingNewProduct} />

      <div className="page-header">
        <h1 className="page-title">Add New Product</h1>
        <p className="page-subtitle">I-setup ang category, sub-category, variants, at tiered pricing.</p>
      </div>

      <form className="product-form" onSubmit={handleSubmit}>

        {/* ── PRODUCT SECTION ── */}
        <div className="form-section">
          <h2 className="form-section-title">Product</h2>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <CategoryProductSelector
              inventoryList={inventoryList}
              selectedCategory={selectedCategory}
              onCategoryChange={(cat) => { setSelectedCategory(cat); setFormData(prev => ({ ...prev, category: cat, inventoryId: '', subCategoryName: '' })); }}
              selectedProduct={formData.inventoryId}
              onProductChange={handleInventoryChange}
              linkedProductIds={linkedProductIds}
            />
            <p className="form-hint">
              {inventoryList.filter(i => i.isActive !== false).length === 0
                ? 'Add items to your inventory first before creating products.'
                : selectedCategory
                  ? `Select a product from "${selectedCategory}" category.`
                  : 'Select a category first, then choose a product to auto-fill details.'
              }
              {formData.inventoryId && (() => {
                const selected = inventoryList.find(inv => inv.id === formData.inventoryId);
                return selected?.isOnDemand ? ' This item is Upon Order - stock will be bypassed.' : '';
              })()}
            </p>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Materials, printing details, sizes, notes…" />
          </div>
        </div>

        {/* ── AVAILABILITY SECTION ── */}
        <div className="form-section">
          <h2 className="form-section-title">Availability</h2>

          {!formData.inventoryId ? (
            <p className="form-hint" style={{ marginBottom: '1rem', color: '#f87171' }}>
              Please select a Product first to see stock availability
            </p>
          ) : (() => {
            const inv = inventoryList.find(i => i.id === formData.inventoryId);
            if (inv?.isOnDemand) {
              return (
                <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', cursor: 'not-allowed', opacity: 0.7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.9rem' }}>Upon Order / Supplied</div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>This item is set as "Upon Order" in Inventory. Stock tracking is disabled.</p>
                </div>
              );
            } else {
              return (
                <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                      <line x1="12" y1="22.08" x2="12" y2="12"/>
                    </svg>
                    <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.9rem' }}>Track Stock</div>
                  </div>
                  <InventoryVariantCards
                    inventoryList={inventoryList}
                    selectedProduct={formData.inventoryId}
                    formData={formData}
                    setFormData={setFormData}
                  />
                </div>
              );
            }
          })()}
        </div>

        {/* ── VARIANTS SECTION ── */}
        <div className="form-section">
          <h2 className="form-section-title">Variants</h2>

          {!formData.category && (
            <p className="form-hint" style={{ marginBottom: '1rem', color: '#f87171' }}>
              Please Add Product Category first before setting Variants
            </p>
          )}

          {lockedGroupCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--gray)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '0.1rem' }}>
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <strong style={{ color: 'var(--gold)' }}>Auto-populated from Masterlist</strong><br />
                {lockedGroupCount} stockable variant type{lockedGroupCount !== 1 ? 's are' : ' is'} locked (tracked in inventory). You can add non-stockable variant types (e.g., "Panels", "Print Type") for pricing purposes.
              </div>
            </div>
          )}

          <div className="variant-groups">
            {variantGroups.map((group, gIdx) => (
              <div key={group.id} className="variant-group"
                style={{ opacity: !formData.category ? 0.5 : 1, pointerEvents: !formData.category ? 'none' : 'auto', border: group.isLocked ? '1px solid rgba(212,168,67,0.3)' : undefined, background: group.isLocked ? 'rgba(212,168,67,0.04)' : undefined }}>
                <div className="variant-group-header">
                  <span className="variant-group-label">VARIANT {gIdx + 1}</span>
                  {group.isLocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                      <span style={{ flex: 1, padding: '0.5rem 0.75rem', background: 'var(--dark2)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '6px', color: 'var(--gold)', fontSize: '0.875rem', fontWeight: 600 }}>{group.name}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '0.2rem 0.5rem', borderRadius: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Stockable · Locked
                      </span>
                    </div>
                  ) : (
                    <>
                      <input type="text" className="form-input" value={group.name} onChange={e => updateGroupName(group.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder={gIdx === 0 ? 'e.g. Finish, Size, Type…' : 'e.g. Color, Panels…'} required />
                      <button type="button" className="btn-remove-group" onClick={() => removeGroup(group.id)}>Remove</button>
                    </>
                  )}
                </div>

                <div className="variant-options">
                  {group.options.map(opt => (
                    <span key={opt.id} className="variant-chip-wrap">
                      {!group.isLocked && (
                        <label className="variant-chip-img-btn" title={opt.image ? 'Change image' : 'Add variant image'}>
                          {opt.image ? <img src={opt.image} alt={opt.value} className="variant-chip-img-preview" /> : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          )}
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleOptionImageUpload(group.id, opt.id, e.target.files[0]); }} />
                        </label>
                      )}
                      <span className="variant-chip" style={group.isLocked ? { background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.35)', color: '#D4A843', cursor: 'default' } : {}}>
                        {opt.value}
                        {group.isLocked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '0.3rem', color: '#D4A843' }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                        {!group.isLocked && opt.image && <button type="button" className="variant-chip-img-remove" onClick={() => removeOptionImage(group.id, opt.id)} title="Remove image">✕img</button>}
                        {!group.isLocked && <button type="button" className="variant-chip-remove" onClick={() => removeOption(group.id, opt.id)}>×</button>}
                      </span>
                    </span>
                  ))}
                  {!group.isLocked && (
                    <>
                      <input type="text" className="variant-option-input" value={optionInputs[group.id] || ''} onChange={e => setOptionInputs(prev => ({ ...prev, [group.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(group.id); } }} placeholder="Add option…" />
                      <button type="button" className="btn-add-option" onClick={() => addOption(group.id)}>+ Add</button>
                    </>
                  )}
                </div>

                {group.isLocked && <p className="form-hint" style={{ color: 'rgba(212,168,67,0.7)', fontSize: '0.72rem', marginTop: '0.4rem' }}>🔒 Locked — these variants are tracked in inventory. Edit them in the Item Masterlist.</p>}
                {duplicateWarning && !group.isLocked && <p className="duplicate-warning">{duplicateWarning}</p>}
                {group.options.length === 0 && !group.isLocked && <p className="form-hint">Type an option and press Enter or click + Add.</p>}
              </div>
            ))}
          </div>

          {variantGroups.length < maxGroupsAllowed && (
            <>
              <button type="button" className="add-variant-btn" onClick={addGroup} disabled={!formData.category} style={{ opacity: !formData.category ? 0.5 : 1, cursor: !formData.category ? 'not-allowed' : 'pointer' }}>
                {lockedGroupCount > 0 ? '+ Add Non-Stockable Variant' : 'Add Variant Type'}
                <span className="add-variant-max">(max {maxGroupsAllowed})</span>
              </button>
              {lockedGroupCount > 0 && <p className="form-hint" style={{ marginTop: '0.5rem' }}>Add non-stockable variants like "Panels", "Print Type" for pricing options without affecting inventory.</p>}
              {variantWarning && <p className="duplicate-warning" style={{ color: '#f87171', marginTop: '0.5rem' }}>{variantWarning}</p>}
            </>
          )}
        </div>

        {/* ── PRICING SECTION ── */}
        <div className="form-section">
          <h2 className="form-section-title">Pricing</h2>

          {!formData.inventoryId && (
            <p className="form-hint" style={{ marginBottom: '1rem', color: '#f87171' }}>
              Please select a Material / Blank Item first before setting Pricing
            </p>
          )}

          <div className="price-type-row" style={{ opacity: !formData.inventoryId ? 0.5 : 1, pointerEvents: !formData.inventoryId ? 'none' : 'auto' }}>
            {[{ val: 'fixed', label: 'Fixed Price' }, { val: 'tiered', label: 'Tier Price' }, { val: 'inquiry', label: 'For Inquiry' }].map(({ val, label }) => (
              <button key={val} type="button" className={`price-type-btn${formData.priceType === val ? ' selected' : ''}`} onClick={() => formData.inventoryId && setFormData(prev => ({ ...prev, priceType: val }))}>{label}</button>
            ))}
          </div>

          {formData.priceType === 'fixed' && (
            <>
              {hasVariants ? (fixedMinP !== null && <div className="price-preview"><p className="price-preview-value">₱{fixedMinP}{fixedMaxP !== fixedMinP ? ` – ₱${fixedMaxP}` : ''}<span className="price-preview-unit"> per item</span></p></div>) : (fixedPrice && <div className="price-preview"><p className="price-preview-value">₱{fixedPrice}<span className="price-preview-unit"> per item</span></p></div>)}
              {variantGroups.length >= 2 && combinations.length > 0 && <VariantGroupingCheckboxes variantGroups={variantGroups.filter(g => g.isStockable !== false)} groupChecks={groupChecks} onGroupChecksChange={setGroupChecks} />}
              {hasVariants ? (
                <SmartPricingTable tiers={[{ id: '__fixed__', minQty: null, maxQty: null, prices: fixedPriceVariants }]} variantGroups={variantGroups.filter(g => g.isStockable !== false)} combinations={combinations} groupChecks={groupChecks} onPriceChange={(_tierId, comboId, val) => updateFixedPriceWithMerge(comboId, val)} updateTierRange={() => {}} removeTier={() => {}} mode="fixed" />
              ) : (
                <div className="form-group">
                  <div className="tier-price-cell" style={{ opacity: !formData.inventoryId ? 0.5 : 1, pointerEvents: !formData.inventoryId ? 'none' : 'auto' }}>
                    <span className="peso">₱</span>
                    <NumberInput className="tier-input" value={fixedPrice || ''} onChange={e => formData.inventoryId && setFixedPrice(sanitizeNumber(e.target.value))} placeholder="0" min={0} step="0.01" disabled={!formData.inventoryId} />
                  </div>
                </div>
              )}
            </>
          )}

          {formData.priceType === 'tiered' && (
            <>
              {minP !== null && <div className="price-preview"><p className="price-preview-value">₱{minP}{maxP !== minP ? ` – ₱${maxP}` : ''}<span className="price-preview-unit"> per item</span></p><p className="price-preview-note">{hasVariants ? 'Pinakamaba at pinakamataas na price sa lahat ng variants at tiers' : 'Auto-calculated from tiers below'}</p></div>}
              {variantGroups.length >= 2 && combinations.length > 0 && <VariantGroupingCheckboxes variantGroups={variantGroups.filter(g => g.isStockable !== false)} groupChecks={groupChecks} onGroupChecksChange={setGroupChecks} />}
              <div style={{ opacity: !formData.inventoryId ? 0.5 : 1, pointerEvents: !formData.inventoryId ? 'none' : 'auto' }}>
                <SmartPricingTable tiers={tiers} variantGroups={variantGroups.filter(g => g.isStockable !== false)} combinations={combinations} groupChecks={groupChecks} onPriceChange={updateTierPriceWithMerge} updateTierRange={updateTierRange} removeTier={removeTier} mode="tiered" />
              </div>
              <button type="button" className="add-tier-btn" onClick={addTier} disabled={!formData.inventoryId} style={{ opacity: !formData.inventoryId ? 0.5 : 1, cursor: !formData.inventoryId ? 'not-allowed' : 'pointer' }}>Add Price Tier</button>
            </>
          )}

          {formData.priceType === 'inquiry' && (
            <div style={{ padding: '1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', marginTop: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--gray)', margin: 0 }}>Price will be "For Inquiry" — customers must contact you for pricing.</p>
            </div>
          )}
        </div>

        {/* ── IMAGES SECTION ── */}
        <div className="form-section">
          <div className="images-row">
            <div className="images-col">
              <h2 className="form-section-title">Thumbnail</h2>
              {thumbnail ? (
                <div className="thumbnail-preview-wrap">
                  <div className="thumbnail-preview">
                    <img src={thumbnail.preview} alt="Thumbnail" />
                    <button type="button" className="image-remove-btn" onClick={() => setThumbnail(null)}>×</button>
                  </div>
                </div>
              ) : (
                <div className={`image-upload-area${dragOverThumb ? ' drag-over' : ''}`} onDrop={handleThumbnailDrop} onDragOver={e => { e.preventDefault(); setDragOverThumb(true); }} onDragLeave={() => setDragOverThumb(false)} onClick={() => document.getElementById('thumbnailInput').click()}>
                  <div className="image-upload-text"><strong>Click to upload thumbnail</strong> or drag and drop</div>
                  <div className="image-upload-hint">Standard size: 200x200px - 800x800px — PNG, JPG</div>
                  <input id="thumbnailInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleThumbnailUpload(e.target.files); }} />
                </div>
              )}
            </div>
            <div className="images-col">
              <h2 className="form-section-title">Product Gallery</h2>
              <div className={`image-upload-area${dragOver ? ' drag-over' : ''}`} onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onClick={() => document.getElementById('imageInput').click()}>
                <div className="image-upload-text"><strong>Click to upload</strong> or drag and drop</div>
                <div className="image-upload-hint">PNG, JPG, GIF</div>
                <input id="imageInput" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleImageUpload(e.target.files); }} />
              </div>
              {images.length > 0 && (
                <div className="image-preview-grid">
                  {images.map(img => (
                    <div key={img.id} className="image-preview-item">
                      <img src={img.preview} alt="Preview" />
                      <button type="button" className="image-remove-btn" onClick={() => removeImage(img.id)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── ACTIONS ── */}
        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={() => router.back()}>Cancel</button>
          <button type="button" className="btn-preview" onClick={() => setShowPreview(true)}>Preview</button>
          <button type="submit" className="btn-submit">Save Product</button>
        </div>

      </form>
    </div>
  );
}