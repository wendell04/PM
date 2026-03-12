'use client';

import { formatNumber, formatPrice } from '../../../src/utils/format';

/**
 * ADD PRODUCT PAGE
 *
 * Current Status: LocalStorage (Browser-only, for testing)
 * ⚠️ TODO: MongoDB Integration - Replace LocalStorage with Database
 *
 * Features:
 * - Add/Edit products with category, sub-category
 * - Auto-fill from Inventory (Source of Truth)
 * - Fixed pricing or Tiered pricing
 * - Variant management (up to 2 variant groups)
 * - Smart pricing (merge variants with same price)
 * - Image upload (thumbnail + gallery)
 * - Product preview modal
 *
 * MongoDB Integration Steps:
 * 1. Create MongoDB collection: 'products'
 * 2. Replace LocalStorage calls with API endpoints:
 *    - GET /api/products - Fetch all products
 *    - POST /api/products - Add new product
 *    - PUT /api/products/:id - Update product
 *    - DELETE /api/products/:id - Delete product
 *    - GET /api/categories - Fetch categories
 *    - POST /api/categories - Add new category
 *    - GET /api/subcategories - Fetch subcategories
 *    - POST /api/subcategories - Add new subcategory
 * 3. Add API routes in app/api/products/route.js
 * 4. Add Mongoose schema in models/Product.js
 * 5. Remove LocalStorage references
 *
 * Data Relationships:
 * - Products reference Inventory items via inventoryId
 * - Categories can be separate collection or derived from products
 * - Subcategories stored in product documents
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

// ── Reusable Number Input Component ───────────────────────────────────────────
// Prevents negative values, e, E, -, +, and disables scroll wheel
function NumberInput({ value, onChange, min = 0, max, placeholder, className, disabled, step }) {
  const handleChange = (e) => {
    const val = e.target.value;
    // Allow empty string or valid non-negative number (with optional decimal)
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      onChange({ ...e, target: { ...e.target, value: val } });
    }
  };

  const handleKeyDown = (e) => {
    // Block e, E, +, -
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault();
    }
  };

  const handleWheel = (e) => {
    // Prevent scroll wheel from changing value
    e.target.blur();
    e.preventDefault();
  };

  return (
    <input
      type="number"
      className={className}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
      step={step}
    />
  );
}

// ── Inventory Helper (LocalStorage)
// ⚠️ TODO: MongoDB - Replace with API call: GET /api/inventory
import { getInventoryList } from './inventory/page';

// ── TODO (MongoDB): Replace with API imports
// CURRENT: LocalStorage helpers (browser-only)
// FUTURE: API functions for MongoDB
// import { getCategories, saveCategory, saveSubCategory, saveProduct } from '@/lib/productStorage';

// ─── Combobox ──────────────────────────────────────────────────────────────────
function Combobox({ value, onChange, options, placeholder, label, required }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value || '');
  const ref = useRef(null);

  useEffect(() => { setInputVal(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.toLowerCase().includes((inputVal || '').toLowerCase())
  );
  const showAdd = inputVal && !options.find(o => o.toLowerCase() === inputVal.toLowerCase());
  const select = (val) => { setInputVal(val); onChange(val); setOpen(false); };

  return (
    <div ref={ref} className="combobox-root">
      {label && (
        <label className="form-label">
          {label} {required && <span className="required">*</span>}
        </label>
      )}
      <div className="combobox-field">
        <input
          type="text"
          className="form-input"
          value={inputVal}
          placeholder={placeholder}
          required={required}
          onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        <button type="button" className="combobox-toggle" onClick={() => setOpen(o => !o)}>
          {open ? '▲' : '▼'}
        </button>
      </div>
      {open && (filtered.length > 0 || showAdd) && (
        <div className="combobox-menu">
          {filtered.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={`combobox-item${opt === value ? ' active' : ''}`}
              onClick={() => select(opt)}
            >
              {opt}
            </button>
          ))}
          {showAdd && (
            <button
              type="button"
              className="combobox-item combobox-add"
              onClick={() => select(inputVal)}
            >
              <span>+</span> Add "{inputVal}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inventory Combobox (for Material/Blank Item) ─────────────────────────────
// NEW: Only shows active inventory items (isActive: true)
// EXCLUDES items already linked to products (1:1 relationship)
function InventoryCombobox({ value, onChange, inventoryList, placeholder, label }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const ref = useRef(null);

  // Get products already linked to inventory items
  const linkedProductIds = useMemo(() => {
    const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    return new Set(allProducts.map(p => p.inventoryId).filter(id => id));
  }, []);

  // Filter to only active items NOT already linked to products
  const availableInventoryList = inventoryList.filter(item => 
    item.isActive !== false && !linkedProductIds.has(item.id)
  );

  // Get display name for selected inventory item
  const getDisplayName = (id) => {
    const item = availableInventoryList.find(inv => inv.id === id) || inventoryList.find(inv => inv.id === id);
    if (!item) return '';
    return `${item.name} (${item.category}) - ${item.isOnDemand ? 'Upon Order' : `${item.stockQty} stocks`}`;
  };

  useEffect(() => {
    setInputVal(value ? getDisplayName(value) : '');
  }, [value, availableInventoryList]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = availableInventoryList.filter(item => {
    const displayName = `${item.name} (${item.category}) - ${item.isOnDemand ? 'Upon Order' : `${item.stockQty} stocks`}`;
    return displayName.toLowerCase().includes((inputVal || '').toLowerCase());
  });

  const select = (item) => {
    const displayName = `${item.name} (${item.category}) - ${item.isOnDemand ? 'Upon Order' : `${item.stockQty} stocks`}`;
    setInputVal(displayName);
    onChange(item.id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="combobox-root">
      {label && (
        <label className="form-label">
          {label}
        </label>
      )}
      <div className="combobox-field">
        <input
          type="text"
          className="form-input"
          value={inputVal}
          placeholder={placeholder}
          readOnly
          onFocus={() => setOpen(true)}
        />
        <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {value && (
            <button
              type="button"
              onClick={() => { setInputVal(''); onChange(''); setOpen(true); }}
              style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.25rem', lineHeight: '1' }}
              title="Clear selection"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
          <button type="button" className="combobox-toggle" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '0.72rem', padding: '0' }}>
            {open ? ' ' : ' '}
          </button>
        </div>
      </div>
      {open && (
        <div className="combobox-menu">
          {availableInventoryList.length === 0 && inventoryList.filter(i => i.isActive !== false).length > 0 ? (
            <div className="combobox-empty">
              <div className="combobox-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 9h18M9 21V9"/>
                </svg>
              </div>
              <p className="combobox-empty-title">All Items Already Used</p>
              <p className="combobox-empty-description">
                All inventory items are already linked to products. Add more items to your inventory first.
              </p>
              <a
                href="/dashboard/business/inventory"
                className="combobox-empty-button"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = '/dashboard/business/inventory';
                }}
              >
                Go to Inventory
              </a>
            </div>
          ) : availableInventoryList.length === 0 ? (
            <div className="combobox-empty">
              <div className="combobox-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 9h18M9 21V9"/>
                </svg>
              </div>
              <p className="combobox-empty-title">No Items in Inventory</p>
              <p className="combobox-empty-description">
                Add items to your inventory first before creating products.
              </p>
              <a
                href="/dashboard/business/inventory"
                className="combobox-empty-button"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = '/dashboard/business/inventory';
                }}
              >
                Go to Inventory
              </a>
            </div>
          ) : filtered.length === 0 ? (
            <div className="combobox-empty">
              <p className="combobox-empty-description">No available items found matching "{inputVal}"</p>
            </div>
          ) : (
            filtered.map((item, i) => {
              const displayName = `${item.name} (${item.category}) - ${item.isOnDemand ? 'Upon Order' : `${item.stockQty} stocks`}`;
              return (
                <button
                  key={i}
                  type="button"
                  className={`combobox-item${item.id === value ? ' active' : ''}`}
                  onClick={() => select(item)}
                >
                  {displayName}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────────
function comboLabel(combo) {
  return Object.values(combo).join(' / ');
}

const sanitizeNumber = (val) => {
  if (val === '') return '';
  const num = parseFloat(val);
  return isNaN(num) || num < 0 ? '0' : val;
};

// ─── NEW: VariantGroupingCheckboxes ───────────────────────────────────────────
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
    onGroupChecksChange({
      ...groupChecks,
      [primaryVal]: allChecked ? new Set() : new Set(allVals),
    });
  };

  return (
    <div className="vgc-wrapper">
      <div className="vgc-hint">
        Merge Variant with the same price example: Small-red, Small-yellow, Small-green into Small (Red,Yellow, Green)
      </div>
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
                <input
                  type="checkbox"
                  className="vgc-checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={() => toggleAll(p.value)}
                />
                <span className="vgc-check-text">(all)</span>
              </label>
              {g2.options.map(s => (
                <label key={s.id} className="vgc-check-label">
                  <input
                    type="checkbox"
                    className="vgc-checkbox"
                    checked={checked.has(s.value)}
                    onChange={() => toggle(p.value, s.value)}
                  />
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

// ─── NEW: buildColumnGroups ────────────────────────────────────────────────────
function buildColumnGroups(variantGroups, combinations, groupChecks) {
  if (variantGroups.length === 0) return [];

  if (variantGroups.length === 1) {
    const g = variantGroups[0];
    return g.options.map(opt => {
      const combo = combinations.find(c => c.combo[g.id] === opt.value);
      return {
        key: opt.value,
        primaryVal: null,
        secondaryVals: [opt.value],
        label: opt.value,
        comboIds: combo ? [combo.id] : [],
        isMerged: false,
      };
    });
  }

  const [g1, g2] = variantGroups;
  const cols = [];

  g1.options.forEach(p => {
    const checked = groupChecks[p.value] || new Set();
    const checkedArr = g2.options.filter(s => checked.has(s.value));
    const uncheckedArr = g2.options.filter(s => !checked.has(s.value));

    if (checkedArr.length >= 2) {
      const comboIds = checkedArr
        .map(s => combinations.find(c => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value))
        .filter(Boolean)
        .map(c => c.id);
      cols.push({
        key: `${p.value}::${checkedArr.map(s => s.value).join('|')}`,
        primaryVal: p.value,
        secondaryVals: checkedArr.map(s => s.value),
        label: checkedArr.map(s => s.value).join(' · '),
        comboIds,
        isMerged: true,
      });
    }

    if (checkedArr.length === 1) {
      const s = checkedArr[0];
      const combo = combinations.find(c => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value);
      cols.push({
        key: `${p.value}::${s.value}`,
        primaryVal: p.value,
        secondaryVals: [s.value],
        label: s.value,
        comboIds: combo ? [combo.id] : [],
        isMerged: false,
      });
    }

    uncheckedArr.forEach(s => {
      const combo = combinations.find(c => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value);
      cols.push({
        key: `${p.value}::${s.value}`,
        primaryVal: p.value,
        secondaryVals: [s.value],
        label: s.value,
        comboIds: combo ? [combo.id] : [],
        isMerged: false,
      });
    });
  });

  return cols;
}

// ─── NEW: getColumnPrice helper ───────────────────────────────────────────────
function getColumnPrice(comboIds, prices) {
  if (!comboIds.length) return '';
  const vals = comboIds.map(id => prices[id] || '');
  // Return first non-empty value, or empty if all are empty
  const nonEmpty = vals.find(v => v !== '');
  return nonEmpty !== undefined ? nonEmpty : '';
}

// ─── NEW: syncMergedPrices helper ─────────────────────────────────────────────
// Ensures all merged variants have the same price when editing
function syncMergedPrices(comboIds, currentPrices, newValue) {
  const updated = { ...currentPrices };
  comboIds.forEach(cid => {
    updated[cid] = newValue;
  });
  return updated;
}

// ─── NEW: SmartPricingTable ────────────────────────────────────────────────────
function SmartPricingTable({
  tiers,
  variantGroups,
  combinations,
  groupChecks,
  onPriceChange,
  updateTierRange,
  removeTier,
  mode,
}) {
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
                    <td>
                      <NumberInput
                        className="tier-input"
                        value={tier.minQty ?? ''}
                        placeholder=""
                        min={0}
                        onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'minQty', v); }}
                      />
                    </td>
                    <td>
                      <NumberInput
                        className="tier-input"
                        value={tier.maxQty ?? ''}
                        placeholder="∞"
                        min={0}
                        onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'maxQty', v); }}
                      />
                    </td>
                  </>
                )}
                <td>
                  <div className="tier-price-cell">
                    <span className="peso">₱</span>
                    <NumberInput
                      className="tier-input"
                      value={tier.prices['__base__'] || ''}
                      onChange={e => onPriceChange(tier.id, '__base__', sanitizeNumber(e.target.value))}
                      placeholder="0"
                      min={0}
                      step="0.01"
                    />
                  </div>
                </td>
                {mode === 'tiered' && (
                  <td>{tiers.length > 1 && <button type="button" className="btn-remove-tier" onClick={() => removeTier(tier.id)}>Remove</button>}</td>
                )}
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
            {mode === 'tiered' && (
              <>
                <th>Tier</th>
                <th>Min Qty</th>
                <th>Max Qty</th>
              </>
            )}

            {columnGroups.map(cg => {
              const fullLabel = cg.primaryVal ? `${cg.primaryVal} / ${cg.label}` : cg.label;
              return (
                <th
                  key={cg.key}
                  className={`tier-variant-header${cg.isMerged ? ' tier-header-merged' : ''}`}
                  title={cg.isMerged ? `Merged: ${cg.primaryVal} / ${cg.secondaryVals.join(', ')} — same price` : ''}
                >
                  {cg.isMerged
                    ? <span className="tier-merged-label">{fullLabel} <span className="tier-merged-badge">same ₱</span></span>
                    : fullLabel
                  }
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
                  <td>
                    <NumberInput
                      className="tier-input"
                      value={tier.minQty ?? ''}
                      placeholder="1"
                      min={0}
                      onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'minQty', v); }}
                    />
                  </td>
                  <td>
                    <NumberInput
                      className="tier-input"
                      value={tier.maxQty ?? ''}
                      placeholder="∞"
                      min={0}
                      onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'maxQty', v); }}
                    />
                  </td>
                </>
              )}

              {columnGroups.map(cg => {
                const colPrice = getColumnPrice(cg.comboIds, tier.prices);
                const isMerged = cg.isMerged;
                return (
                  <td key={cg.key} className={isMerged ? 'smart-cell-merged' : ''}>
                    <div className="tier-price-cell">
                      <span className="peso">₱</span>
                      <NumberInput
                        className="tier-input"
                        value={colPrice}
                        onChange={e => {
                          const newVal = sanitizeNumber(e.target.value);
                          // Update all combo IDs in the merged group
                          cg.comboIds.forEach(cid => {
                            onPriceChange(tier.id, cid, newVal);
                          });
                        }}
                        placeholder="0"
                        min={0}
                        step="0.01"
                        title={isMerged ? `Editing all: ${cg.secondaryVals.join(', ')}` : cg.label}
                      />
                    </div>
                  </td>
                );
              })}

              {mode === 'tiered' && (
                <td>{tiers.length > 1 && <button type="button" className="btn-remove-tier" onClick={() => removeTier(tier.id)}>Remove</button>}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Product Preview Modal ─────────────────────────────────────────────────────
function ProductPreviewModal({ product, onClose }) {
  const allPrices = product.tiers
    .flatMap(t => Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0));
  const minP = allPrices.length ? Math.min(...allPrices) : null;
  const maxP = allPrices.length ? Math.max(...allPrices) : null;

  // For fixed price with variants
  const fixedVariantPrices = product.variantPrices || {};
  const fixedPricesArray = Object.values(fixedVariantPrices).map(p => parseFloat(p)).filter(p => p > 0);
  const fixedMinP = fixedPricesArray.length ? Math.min(...fixedPricesArray) : null;
  const fixedMaxP = fixedPricesArray.length ? Math.max(...fixedPricesArray) : null;

  return (
    <div className="preview-overlay">
      <div className="preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3 className="preview-modal-title">Storefront Preview</h3>
          <p className="preview-modal-subtitle">Ganito makikita ng customer ang product</p>
          <button type="button" className="preview-close" onClick={onClose}>×</button>
        </div>

        <div className="preview-modal-body">

          <div className="preview-section">
            <p className="preview-section-label">Product Card</p>
            <div className="preview-card-wrap">
              <div className="preview-product-card">
                <div className="preview-card-image">
                  {product.thumbnail ? (
                    <img src={product.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="preview-no-image">No Thumbnail</div>
                  )}
                  {product.priceType === 'inquiry' && (
                    <span className="preview-inquiry-badge">For Inquiry</span>
                  )}
                </div>
                <div className="preview-card-info">
                  <p className="preview-card-category">
                    {product.category}
                  </p>
                  <h4 className="preview-card-name">{product.subCategoryName || product.productName || product.category}</h4>
                  <p className="preview-card-desc">{product.description || '—'}</p>
                  <div className="preview-card-footer">
                    <div>
                      {product.priceType === 'inquiry' ? (
                        <span className="preview-price-inquiry">For Inquiry</span>
                      ) : product.priceType === 'fixed' ? (
                        product.variantPrices && Object.keys(product.variantPrices).length > 0 ? (
                          <span className="preview-price">
                            {formatPrice(fixedMinP)}{fixedMaxP !== fixedMinP ? ` – ${formatPrice(fixedMaxP)}` : ''} <span className="preview-price-unit">per item</span>
                          </span>
                        ) : (
                          <span className="preview-price">
                            {formatPrice(product.price)} <span className="preview-price-unit">per item</span>
                          </span>
                        )
                      ) : minP ? (
                        <span className="preview-price">
                          {formatPrice(minP)}{maxP !== minP ? ` – ${formatPrice(maxP)}` : ''} <span className="preview-price-unit">per item</span>
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

          {product.priceType === 'tiered' && product.tiers.length > 0 && (
            <div className="preview-section">
              <p className="preview-section-label">Pricing Tiers</p>
              <div className="preview-tiers">
                {product.tiers.map((tier, i) => (
                  <div key={tier.id} className="preview-tier-row">
                    <span className="preview-tier-badge">Tier {i + 1}</span>
                    <span className="preview-tier-range">
                      {tier.minQty || '?'} – {tier.maxQty || '∞'} pcs
                    </span>
                    {product.combinations.length > 0 ? (
                      <div className="preview-tier-variants">
                        {product.combinations.map(c => (
                          <span key={c.id} className="preview-tier-variant-price">
                            {c.label}: {formatPrice(tier.prices[c.id])}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="preview-tier-price">{formatPrice(tier.prices['__base__'])}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {product.combinations.length > 0 && (
            <div className="preview-section">
              <p className="preview-section-label">Variants ({product.combinations.length} combinations)</p>
              <div className="preview-variants-wrap">
                {product.variantGroups.map(g => (
                  <div key={g.id} className="preview-variant-group">
                    <span className="preview-variant-group-name">{g.name || 'Unnamed'}:</span>
                    {g.options.map(o => (
                      <span key={o.id} className="preview-variant-chip">{o.value}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="preview-section">
            <p className="preview-section-label">Availability</p>
            <div className="preview-stock-status">
              {!product.trackInventory ? (
                <span className="preview-stock-badge upon-order">Upon Order / Supplied</span>
              ) : product.stock === 0 ? (
                <span className="preview-stock-badge out-of-stock">Out of Stock</span>
              ) : product.stock <= 10 ? (
                <span className="preview-stock-badge low-stock">Low Stock — {product.stock} pcs left</span>
              ) : (
                <span className="preview-stock-badge in-stock">In Stock — {product.stock} pcs</span>
              )}
            </div>
            {product.inventoryId && (
              <p className="form-hint" style={{ marginTop: '0.75rem' }}>
                🔗 Linked to Inventory: <strong>Item #{product.inventoryId.slice(0, 8)}</strong>
              </p>
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

// ── Duplicate Product Warning Modal ────────────────────────────────────────────
function DuplicateProductModal({ isOpen, onClose, category, subCategoryName }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">Duplicate Product Detected</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            Product <strong>"{category} - {subCategoryName || '(No sub-category)'}"</strong> already exists!
          </p>
          <p className="delete-confirm-warning" style={{ marginTop: '0.75rem' }}>
            Please edit the existing product in the Product Listing instead.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Success Modal ──────────────────────────────────────────────────────────────
function SuccessModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-success">Product Added Successfully!</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            Your product has been saved to the catalog.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stock Error Modal ──────────────────────────────────────────────────────────
function StockErrorModal({ isOpen, onClose, maxStock }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-danger">Invalid Stock Quantity</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            Cannot set higher Availability than Inventory stock (<strong>{maxStock} pcs</strong>).
          </p>
          <p className="delete-confirm-warning" style={{ marginTop: '0.75rem' }}>
            Please enter a value that is less than or equal to the available inventory.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Price Error Modal ──────────────────────────────────────────────────────────
function PriceErrorModal({ isOpen, onClose, message }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">Price Required</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            {message}
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inventory Error Modal ──────────────────────────────────────────────────────
function InventoryErrorModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">Product Required</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            Please select a <strong>Product / Blank Item</strong> from the inventory first.
          </p>
          <p className="delete-confirm-warning" style={{ marginTop: '0.75rem' }}>
            This ensures that your product is linked to the correct material and stock levels.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Save Product Modal ─────────────────────────────────────────────────
function ConfirmSaveProductModal({ isOpen, onClose, onConfirm, product }) {
  if (!isOpen || !product) return null;

  // Calculate total price info
  let priceInfo = '';
  if (product.priceType === 'inquiry') {
    priceInfo = 'For Inquiry';
  } else if (product.priceType === 'fixed') {
    if (product.variantPrices) {
      const prices = Object.values(product.variantPrices).map(p => parseFloat(p)).filter(p => p > 0);
      const minP = prices.length ? Math.min(...prices) : 0;
      const maxP = prices.length ? Math.max(...prices) : 0;
      priceInfo = `${formatPrice(minP)}${maxP !== minP ? ` – ${formatPrice(maxP)}` : ''}`;
    } else if (product.price) {
      priceInfo = formatPrice(product.price);
    }
  } else if (product.priceType === 'tiered' && product.tiers) {
    const allPrices = product.tiers.flatMap(t => Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0));
    const minP = allPrices.length ? Math.min(...allPrices) : 0;
    const maxP = allPrices.length ? Math.max(...allPrices) : 0;
    priceInfo = `${formatPrice(minP)}${maxP !== minP ? ` – ${formatPrice(maxP)}` : ''} (tiered)`;
  }

  // Stock info
  let stockInfo = '';
  if (!product.trackInventory) {
    stockInfo = 'Upon Order / Supplied';
  } else {
    stockInfo = `${product.stock || 0} pcs available`;
  }

  // Variant info
  const variantCount = product.variantGroups?.length || 0;
  const combinationCount = product.combinations?.length || 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-success">Confirm Save Product</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text" style={{ marginBottom: '1.5rem' }}>
            Please review the product details before saving to your catalog.
          </p>

          <div className="confirm-summary" style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1.25rem'
          }}>
            {/* Thumbnail Preview */}
            {product.thumbnail && (
              <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                <img
                  src={product.thumbnail}
                  alt="Product thumbnail"
                  style={{
                    width: '120px',
                    height: '120px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '1px solid var(--border)'
                  }}
                />
              </div>
            )}

            <div className="confirm-row" style={{ marginBottom: '0.75rem' }}>
              <span className="confirm-label" style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Product:</span>
              <span className="confirm-value" style={{ fontWeight: '600', color: 'var(--white)' }}>
                {product.category} {product.subCategoryName ? `- ${product.subCategoryName}` : ''}
              </span>
            </div>

            {product.description && (
              <div className="confirm-row" style={{ marginBottom: '0.75rem' }}>
                <span className="confirm-label" style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Description:</span>
                <span className="confirm-value" style={{ color: 'var(--white)' }}>
                  {product.description.length > 100 ? product.description.substring(0, 100) + '...' : product.description}
                </span>
              </div>
            )}

            <div className="confirm-row" style={{ marginBottom: '0.75rem' }}>
              <span className="confirm-label" style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Price:</span>
              <span className="confirm-value" style={{ color: '#facc15', fontWeight: '600' }}>
                {priceInfo}
              </span>
            </div>

            <div className="confirm-row" style={{ marginBottom: '0.75rem' }}>
              <span className="confirm-label" style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Stock:</span>
              <span className="confirm-value" style={{ color: 'var(--white)' }}>
                {stockInfo}
              </span>
            </div>

            {variantCount > 0 && (
              <div className="confirm-row" style={{ marginBottom: '0.75rem' }}>
                <span className="confirm-label" style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Variants:</span>
                <span className="confirm-value" style={{ color: 'var(--white)' }}>
                  {variantCount} group{variantCount > 1 ? 's' : ''} ({combinationCount} combinations)
                </span>
              </div>
            )}

            {product.images?.length > 0 && (
              <div className="confirm-row" style={{ marginBottom: '0.75rem' }}>
                <span className="confirm-label" style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>Images:</span>
                <span className="confirm-value" style={{ color: 'var(--white)' }}>
                  {product.images.length} image{product.images.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          <p className="confirm-hint" style={{
            marginTop: '1rem',
            color: 'var(--gray)',
            fontSize: '0.875rem'
          }}>
            Click "Confirm Save" to add this product to your catalog.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm}>
            Confirm Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AddProductsPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    category: '',
    subCategoryCode: '',    // auto-generated mula sa sub-category name initials e.g. VSW
    subCategoryName: '',    // ito na rin ang product display name sa storefront
    productName: '',
    description: '',
    priceType: 'fixed',
    trackInventory: true,
    stock: '',
    inventoryId: '',        // linked Inventory item ID (for "Source of Truth" materials)
  });

  const [fixedPrice, setFixedPrice] = useState('');
  const [fixedPriceVariants, setFixedPriceVariants] = useState({});
  const [tiers, setTiers] = useState([
    { id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } },
  ]);

  const [variantGroups, setVariantGroups] = useState([]);
  const [optionInputs, setOptionInputs] = useState({});
  const [combinations, setCombinations] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [variantWarning, setVariantWarning] = useState('');

  // ── NEW: groupChecks — defines which secondary options are grouped per primary
  // shape: { [primaryOptionValue]: Set<secondaryOptionValue> }
  // e.g. { 'S': Set{'Red','Yellow'}, 'M': Set{} }
  const [groupChecks, setGroupChecks] = useState({});

  const [thumbnail, setThumbnail] = useState(null);
  const [images, setImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragOverThumb, setDragOverThumb] = useState(false);

  const [savedCategories, setSavedCategories] = useState([]);
  const [savedSubCategories, setSavedSubCategories] = useState({});
  const [showPreview, setShowPreview] = useState(false);

  // ── NEW: Modal States ────────────────────────────────────────────────────────
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [pendingProductData, setPendingProductData] = useState(null);
  const [showStockErrorModal, setShowStockErrorModal] = useState(false);
  const [maxStockQty, setMaxStockQty] = useState(0);
  const [showPriceErrorModal, setShowPriceErrorModal] = useState(false);
  const [priceErrorMessage, setPriceErrorMessage] = useState('');
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);
  const [pendingNewProduct, setPendingNewProduct] = useState(null);
  const [showInventoryErrorModal, setShowInventoryErrorModal] = useState(false);

  // ── NEW: Inventory List State ────────────────────────────────────────────────
  const [inventoryList, setInventoryList] = useState([]);

  // ── TODO: MongoDB — palitan ng GET /api/categories at GET /api/subcategories ──
  // CURRENT: LocalStorage (browser-only, hindi persistent sa server)
  useEffect(() => {
    setSavedCategories(JSON.parse(localStorage.getItem('customCategories') || '[]'));
    setSavedSubCategories(JSON.parse(localStorage.getItem('subCategories') || '{}'));

    // Load Inventory List (Source of Truth for blank materials)
    const inventory = getInventoryList();
    setInventoryList(inventory);
  }, []);

  const hasVariants = combinations.length > 0;
  const subCatOptions = savedSubCategories[formData.category] || [];

  const handleCategoryChange = (val) => {
    setFormData(prev => ({
      ...prev,
      category: val,
      subCategoryCode: '',
      subCategoryName: '',
    }));
    setFixedPrice('');
    setFixedPriceVariants({});
    setVariantGroups([]);
    setCombinations([]);
    setOptionInputs({});
    setTiers([{ id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } }]);
  };

  // Auto-generate SKU code from sub-category initials e.g. "Vinyl Sticker Waterproof" → "VSW"
  const handleSubCategoryChange = (val) => {
    const autoCode = val
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 8);

    setFormData(prev => ({
      ...prev,
      subCategoryName: val,
      subCategoryCode: autoCode,
    }));
  };

  // ── NEW: Handle Inventory/Material Selection ─────────────────────────────────
  // Connects Add Product to Inventory "Source of Truth"
  const handleInventoryChange = (inventoryId) => {
    const selectedItem = inventoryId ? inventoryList.find(inv => inv.id === inventoryId) : null;

    setFormData(prev => ({
      ...prev,
      inventoryId: inventoryId,
      // Auto-set category and sub-category from inventory item (clear if no selection)
      category: selectedItem ? selectedItem.category : '',
      subCategoryName: selectedItem ? selectedItem.name : '',
      subCategoryCode: selectedItem ? selectedItem.name.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase().slice(0, 8) : '',
      // Auto-detect Upon Order status
      trackInventory: selectedItem ? !selectedItem.isOnDemand : true,
      // Auto-set stock from inventory if not upon order
      stock: selectedItem && !selectedItem.isOnDemand ? String(selectedItem.stockQty) : '',
    }));

    // Clear prices when inventory is removed to prevent "ghost" values
    if (!inventoryId) {
      setFixedPrice('');
      setFixedPriceVariants({});
      setTiers(prev => prev.map(t => ({
        ...t,
        prices: { '__base__': '' }
      })));
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
    const combos = cartesian(groups);

    // Reset groupChecks pag nagbabago ang G1 options
    if (groups.length >= 2) {
      const g1 = groups[0];
      setGroupChecks(prev => {
        const next = {};
        g1.options.forEach(o => {
          next[o.value] = prev[o.value] instanceof Set ? prev[o.value] : new Set();
        });
        return next;
      });
    } else {
      setGroupChecks({});
    }

    if (combos.length === 0) {
      setCombinations([]);
      setTiers(prev => prev.map(t => ({
        ...t,
        prices: { '__base__': t.prices['__base__'] || '' },
      })));
      return;
    }
    const newCombos = combos.map(combo => ({
      id: JSON.stringify(combo),
      combo,
      label: comboLabel(combo),
    }));
    setCombinations(newCombos);
    setTiers(prev => prev.map(t => {
      const p = {};
      newCombos.forEach(c => { p[c.id] = t.prices[c.id] !== undefined ? t.prices[c.id] : ''; });
      return { ...t, prices: p };
    }));
  };

  const addGroup = () => {
    if (variantGroups.length >= 2) return;
    
    // Pag 1st variant, check kung may name at options bago makapag-add ng 2nd
    if (variantGroups.length === 1) {
      const firstGroup = variantGroups[0];
      if (!firstGroup.name.trim() || firstGroup.options.length === 0) {
        setVariantWarning('Please fill in Variant 1 name and add at least 1 option before adding a 2nd variant!');
        setTimeout(() => setVariantWarning(''), 4000);
        return;
      }
    }
    
    setVariantWarning('');
    const g = { id: Date.now(), name: '', options: [] };
    setVariantGroups(prev => [...prev, g]);
    setOptionInputs(prev => ({ ...prev, [g.id]: '' }));
    setFixedPriceVariants({});
  };

  const removeGroup = (gid) => {
    const u = variantGroups.filter(g => g.id !== gid);
    setVariantGroups(u);
    setDuplicateWarning('');
    setFixedPriceVariants({});
    rebuildAll(u);
  };

  const updateGroupName = (gid, name) =>
    setVariantGroups(variantGroups.map(g => g.id === gid ? { ...g, name } : g));

  const addOption = (gid) => {
    const val = (optionInputs[gid] || '').trim();
    if (!val) return;
    
    // Check for duplicates in current group
    const group = variantGroups.find(g => g.id === gid);
    if (group && group.options.some(o => o.value.toLowerCase() === val.toLowerCase())) {
      setDuplicateWarning(`"${val}" already exists in this variant!`);
      setTimeout(() => setDuplicateWarning(''), 3000);
      return;
    }
    
    const u = variantGroups.map(g =>
      // image: null — pwedeng mag-upload ng preview photo per option (e.g. "With Box" → photo ng mug with box)
      g.id === gid ? { ...g, options: [...g.options, { id: Date.now(), value: val, image: null }] } : g
    );
    setVariantGroups(u);
    setOptionInputs(prev => ({ ...prev, [gid]: '' }));
    rebuildAll(u);
  };

  const removeOption = (gid, oid) => {
    const u = variantGroups.map(g =>
      g.id === gid ? { ...g, options: g.options.filter(o => o.id !== oid) } : g
    );
    setVariantGroups(u);
    rebuildAll(u);
  };

  // Upload image para sa isang specific variant option
  const handleOptionImageUpload = (gid, oid, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setVariantGroups(prev => prev.map(g =>
        g.id === gid
          ? { ...g, options: g.options.map(o => o.id === oid ? { ...o, image: e.target.result } : o) }
          : g
      ));
    };
    reader.readAsDataURL(file);
  };

  const removeOptionImage = (gid, oid) => {
    setVariantGroups(prev => prev.map(g =>
      g.id === gid
        ? { ...g, options: g.options.map(o => o.id === oid ? { ...o, image: null } : o) }
        : g
    ));
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const emptyPrices = hasVariants
      ? combinations.reduce((acc, c) => ({ ...acc, [c.id]: '' }), {})
      : { '__base__': '' };
    setTiers(prev => [...prev, {
      id: Date.now(),
      minQty: last ? (parseInt(last.maxQty) || 0) + 1 : 1,
      maxQty: '',
      prices: emptyPrices,
    }]);
  };

  const removeTier = (id) => setTiers(tiers.filter(t => t.id !== id));

  const updateTierRange = (id, field, val) =>
    setTiers(tiers.map(t => t.id === id ? { ...t, [field]: val } : t));

  const updateTierPrice = (tierId, priceKey, val) =>
    setTiers(tiers.map(t =>
      t.id === tierId ? { ...t, prices: { ...t.prices, [priceKey]: val } } : t
    ));

  // ── Update tier price with merged group sync ──
  const updateTierPriceWithMerge = (tierId, priceKey, val) => {
    // Find if this priceKey is part of a merged group
    const combo = combinations.find(c => c.id === priceKey);
    if (combo && variantGroups.length >= 2) {
      const primaryVal = combo.combo[variantGroups[0].id];
      const checkedSet = groupChecks[primaryVal];
      
      if (checkedSet && checkedSet.size > 1) {
        // This is a merged group - update ALL comboIds in this group
        const comboIdsForThisGroup = combinations
          .filter(c => c.combo[variantGroups[0].id] === primaryVal && checkedSet.has(c.combo[variantGroups[1].id]))
          .map(c => c.id);
        
        setTiers(tiers.map(t => {
          if (t.id !== tierId) return t;
          const newPrices = { ...t.prices };
          comboIdsForThisGroup.forEach(cid => {
            newPrices[cid] = val;
          });
          return { ...t, prices: newPrices };
        }));
        return;
      }
    }
    
    // Not merged - update single price
    updateTierPrice(tierId, priceKey, val);
  };

  // ── Sync tier prices when groupChecks change (merge/unmerge) ──
  useEffect(() => {
    if (!hasVariants || tiers.length === 0) return;

    setTiers(prevTiers => prevTiers.map(tier => {
      const newPrices = { ...tier.prices };
      let changed = false;

      Object.entries(groupChecks).forEach(([primaryVal, checkedSet]) => {
        if (checkedSet.size <= 1) return;

        const comboIdsForThisGroup = combinations
          .filter(c => c.combo[variantGroups[0]?.id] === primaryVal && checkedSet.has(c.combo[variantGroups[1]?.id]))
          .map(c => c.id);

        if (comboIdsForThisGroup.length <= 1) return;

        // Get first non-empty price from the group
        const firstPrice = comboIdsForThisGroup
          .map(id => newPrices[id])
          .find(p => p !== '' && p !== undefined) || '';

        // Sync all to the first price
        comboIdsForThisGroup.forEach(id => {
          if (newPrices[id] !== firstPrice) {
            newPrices[id] = firstPrice;
            changed = true;
          }
        });
      });

      return changed ? { ...tier, prices: newPrices } : tier;
    }));
  }, [groupChecks]);

  // ── Sync fixed prices when groupChecks change (merge/unmerge) ──
  useEffect(() => {
    if (!hasVariants) return;

    setFixedPriceVariants(prev => {
      const newPrices = { ...prev };
      let changed = false;

      Object.entries(groupChecks).forEach(([primaryVal, checkedSet]) => {
        if (checkedSet.size <= 1) return;

        const comboIdsForThisGroup = combinations
          .filter(c => c.combo[variantGroups[0]?.id] === primaryVal && checkedSet.has(c.combo[variantGroups[1]?.id]))
          .map(c => c.id);

        if (comboIdsForThisGroup.length <= 1) return;

        // Get first non-empty price from the group
        const firstPrice = comboIdsForThisGroup
          .map(id => newPrices[id])
          .find(p => p !== '' && p !== undefined) || '';

        // Sync all to the first price
        comboIdsForThisGroup.forEach(id => {
          if (newPrices[id] !== firstPrice) {
            newPrices[id] = firstPrice;
            changed = true;
          }
        });
      });

      return changed ? newPrices : prev;
    });
  }, [groupChecks]);

  // ── Update fixed price with merged group sync ──
  const updateFixedPriceWithMerge = (comboId, val) => {
    // Find if this comboId is part of a merged group
    const combo = combinations.find(c => c.id === comboId);
    if (combo && variantGroups.length >= 2) {
      const primaryVal = combo.combo[variantGroups[0].id];
      const checkedSet = groupChecks[primaryVal];
      
      if (checkedSet && checkedSet.size > 1) {
        // This is a merged group - update ALL comboIds in this group
        const comboIdsForThisGroup = combinations
          .filter(c => c.combo[variantGroups[0].id] === primaryVal && checkedSet.has(c.combo[variantGroups[1].id]))
          .map(c => c.id);
        
        setFixedPriceVariants(prev => {
          const newPrices = { ...prev };
          comboIdsForThisGroup.forEach(cid => {
            newPrices[cid] = val;
          });
          return newPrices;
        });
        return;
      }
    }
    
    // Not merged - update single price
    setFixedPriceVariants(prev => ({ ...prev, [comboId]: val }));
  };

  // ── Image upload handlers ──
  // ── TODO: MongoDB + Cloudinary/S3 — palitan ng permanent file upload ──
  // CURRENT: LocalStorage blob: URL (temporary, browser-only)
  const createImageObj = (file) => ({
    file,
    preview: URL.createObjectURL(file),
    id: Date.now() + Math.random(),
  });

  // Open cropper when thumbnail is uploaded
  const handleThumbnailUpload = (files) => {
    const file = files[0];
    if (!file) return;
    setThumbnail(createImageObj(file));
  };

  const handleThumbnailDrop = (e) => {
    e.preventDefault();
    setDragOverThumb(false);
    if (e.dataTransfer.files?.length) handleThumbnailUpload(e.dataTransfer.files);
  };

  const handleImageUpload = (files) =>
    setImages(prev => [...prev, ...Array.from(files).map(createImageObj)]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleImageUpload(e.dataTransfer.files);
  };

  const removeImage = (id) => setImages(images.filter(img => img.id !== id));

  const getStockStatus = (stock, trackInventory) => {
    if (!trackInventory) return { label: 'Upon Order', class: 'upon-order' };
    const s = parseInt(stock) || 0;
    if (s === 0) return { label: 'Out of Stock', class: 'out-of-stock' };
    if (s <= 10) return { label: `Low Stock (${s} pcs)`, class: 'low-stock' };
    return { label: `In Stock (${s} pcs)`, class: 'in-stock' };
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // ──────────────────────────────────────────────────────────────
    // VALIDATION: Require Inventory Item (Source of Truth)
    // ──────────────────────────────────────────────────────────────
    if (!formData.inventoryId) {
      setShowInventoryErrorModal(true);
      return;
    }

    // ──────────────────────────────────────────────────────────────
    // VALIDATION: Require stock value for tracked inventory
    // ──────────────────────────────────────────────────────────────
    const selectedItem = inventoryList.find(inv => inv.id === formData.inventoryId);
    if (selectedItem && !selectedItem.isOnDemand && (!formData.stock || formData.stock === '' || parseInt(formData.stock) < 0)) {
      setPriceErrorMessage('Please enter available stock for storefront.');
      setShowPriceErrorModal(true);
      return;
    }

    // ───────────────────────────────────────────────────────�������──────
    // VALIDATION: Check for empty prices (unless "For Inquiry")
    // ──────────────────────────────────────────────────────────────
    if (formData.priceType === 'fixed') {
      if (hasVariants) {
        // Check if ALL variants have prices
        const allPricesFilled = Object.values(fixedPriceVariants).every(p => p !== '' && p !== null && p !== undefined && parseFloat(p) > 0);
        if (!allPricesFilled) {
          setPriceErrorMessage('Please enter prices for all variants, or set price type to "For Inquiry".');
          setShowPriceErrorModal(true);
          return;
        }
      } else {
        // No variants - check fixed price
        if (!fixedPrice || parseFloat(fixedPrice) <= 0) {
          setPriceErrorMessage('Please enter a price.');
          setShowPriceErrorModal(true);
          return;
        }
      }
    } else if (formData.priceType === 'tiered') {
      // Check if ALL tier prices are filled
      const allTiersFilled = tiers.every(tier =>
        Object.values(tier.prices).every(p => p !== '' && p !== null && p !== undefined && parseFloat(p) > 0)
      );
      if (!allTiersFilled) {
        setPriceErrorMessage('Please enter prices for all items in the pricing tiers.');
        setShowPriceErrorModal(true);
        return;
      }
    }
    // If priceType === 'inquiry', no price validation needed

    // ──────────────────────────────────────────────────────────────
    // TODO: MongoDB Validation — Check for duplicate product
    // CURRENT: LocalStorage check (browser-only)
    // FUTURE: Replace with API call: GET /api/products/check-duplicate
    //
    // Example MongoDB query:
    // const existingProduct = await Product.findOne({
    //   category: formData.category,
    //   subCategoryName: formData.subCategoryName
    // });
    // ���─────────────────────────────────────────────────────────────
    const existingProducts = JSON.parse(localStorage.getItem('products') || '[]');
    const isDuplicate = existingProducts.some(
      p => p.category === formData.category && p.subCategoryName === formData.subCategoryName
    );

    if (isDuplicate) {
      setShowDuplicateModal(true);
      return;
    }

    // ──────────────────────────────────────────────────────────────
    // TODO: MongoDB — Save Category if new
    // CURRENT: LocalStorage (browser-only, hindi persistent sa server)
    // FUTURE: Replace with POST /api/categories
    // ──────────────────────────────────────────────────────────────
    if (formData.category && !savedCategories.includes(formData.category)) {
      const updated = [...savedCategories, formData.category];
      setSavedCategories(updated);
      localStorage.setItem('customCategories', JSON.stringify(updated));
    }

    // ─────────────────────────────────────────────���─��──────────────
    // TODO: MongoDB — Save Sub-Category if new
    // CURRENT: LocalStorage (browser-only, hindi persistent sa server)
    // FUTURE: Replace with POST /api/subcategories
    // ────────────────────��─────────────────────────────────────────
    if (formData.category && formData.subCategoryName) {
      const existingSubs = savedSubCategories[formData.category] || [];
      if (!existingSubs.includes(formData.subCategoryName)) {
        const updatedSubs = {
          ...savedSubCategories,
          [formData.category]: [...existingSubs, formData.subCategoryName],
        };
        setSavedSubCategories(updatedSubs);
        localStorage.setItem('subCategories', JSON.stringify(updatedSubs));
      }
    }

    // ──────────────────────────────────────────────────────────────
    // TODO: MongoDB — Stock Quantity & Status
    // CURRENT: Calculated locally, stored in LocalStorage
    // FUTURE: Send to MongoDB, stock updates via API
    // - stock: Current quantity (from input field)
    // - trackInventory: true = Track Stock, false = Upon Order
    // - stockStatus: Auto-calculated (in-stock, low-stock, out-of-stock, upon-order)
    // ──────────────────────────────────────────────────────────────
    const stockVal = formData.trackInventory ? parseInt(formData.stock) || 0 : null;
    const stockStatus = getStockStatus(stockVal, formData.trackInventory);

    // ──────────────────────────────────────────────────────────────
    // TODO: MongoDB — Complete Product Document
    // This is the full product object that will be saved to MongoDB
    // FUTURE: POST /api/products with this exact structure
    // ──────────────────────────────────────────────────────────────
    const newProduct = {
      id: Date.now(),                        // TODO: MongoDB will auto-generate _id
      inventoryId: formData.inventoryId || null,  // Linked Inventory item (Source of Truth)
      category: formData.category,           // Product Category (e.g., "Mugs")
      subCategoryCode: formData.subCategoryCode,  // Auto-generated code (e.g., "CER")
      subCategoryName: formData.subCategoryName,  // Sub-category name (e.g., "Ceramic")
      description: formData.description,     // Product description/materials
      priceType: formData.priceType,         // 'fixed' or 'tiered'

      // ── Pricing: Fixed or Tiered ──
      ...(formData.priceType === 'fixed'
        ? hasVariants
          ? { variantPrices: fixedPriceVariants }  // Prices per variant combination
          : { price: fixedPrice }                  // Single fixed price
        : { tiers }                                // Tiered pricing (qty-based)
      ),

      // ── Variants ──
      variantGroups: variantGroups,          // Variant definitions (e.g., Color, Size)
      combinations: combinations,            // All variant combinations

      // ── Images (currently blob: URLs, will be Cloudinary/S3 URLs) ──
      thumbnail: thumbnail?.preview || null, // Main product thumbnail
      images: images.map(img => img.preview), // Gallery images

      // ── Inventory/Stock ──
      trackInventory: formData.trackInventory,  // true = Track Stock, false = Upon Order
      stock: stockVal,                          // Current stock quantity
      stockStatus: stockStatus.class,           // Status pill class

      // ── Metadata ──
      createdAt: new Date().toISOString(),      // Product creation timestamp
    };

    // ──────────────────────────────────────────────────────────────
    // Show Confirmation Modal before saving
    // ──────────────────────────────────────────────────────────────
    setPendingNewProduct(newProduct);
    setShowConfirmSaveModal(true);
  };

  // Confirm the save action (after user clicks "Confirm" in modal)
  const handleConfirmSave = () => {
    if (!pendingNewProduct) return;

    // Save categories and subcategories
    if (pendingNewProduct.category && !savedCategories.includes(pendingNewProduct.category)) {
      const updated = [...savedCategories, pendingNewProduct.category];
      setSavedCategories(updated);
      localStorage.setItem('customCategories', JSON.stringify(updated));
    }

    if (pendingNewProduct.category && pendingNewProduct.subCategoryName) {
      const existingSubs = savedSubCategories[pendingNewProduct.category] || [];
      if (!existingSubs.includes(pendingNewProduct.subCategoryName)) {
        const updatedSubs = {
          ...savedSubCategories,
          [pendingNewProduct.category]: [...existingSubs, pendingNewProduct.subCategoryName],
        };
        setSavedSubCategories(updatedSubs);
        localStorage.setItem('subCategories', JSON.stringify(updatedSubs));
      }
    }

    // ──────────────────────────────────────────────────────────────
    // Save Product to LocalStorage (or MongoDB in future)
    // ──────────────────────────────────────────────────────────────
    const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');

    // CREATE new product
    const newProduct = {
      ...pendingNewProduct,
      id: crypto.randomUUID(),
      isPublished: false,  // Default to unpublished
      createdAt: new Date().toISOString(),
    };
    allProducts.push(newProduct);
    localStorage.setItem('pmp_products', JSON.stringify(allProducts));

    // Close modal and show success
    setShowConfirmSaveModal(false);
    setPendingNewProduct(null);
    setShowSuccessModal(true);

    // Reset form after success
    setTimeout(() => {
      setShowSuccessModal(false);
      // Reset form fields
      setFormData({
        category: '',
        subCategoryCode: '',
        subCategoryName: '',
        productName: '',
        description: '',
        priceType: 'fixed',
        trackInventory: true,
        stock: '',
        inventoryId: '',
      });
      setFixedPrice('');
      setFixedPriceVariants({});
      setTiers([{ id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } }]);
      setVariantGroups([]);
      setCombinations([]);
      setThumbnail(null);
      setImages([]);
      // Redirect to Product List
      router.push('/dashboard/business/products');
    }, 1500);
  };

  const allPrices = tiers
    .flatMap(t => Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0));
  const minP = allPrices.length ? Math.min(...allPrices) : null;
  const maxP = allPrices.length ? Math.max(...allPrices) : null;

  // Fixed price with variants - calculate min/max from variant prices
  const fixedPricesArray = hasVariants
    ? Object.values(fixedPriceVariants).map(p => parseFloat(p)).filter(p => p > 0)
    : [];
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
    trackInventory: formData.trackInventory,
    stock: formData.trackInventory ? parseInt(formData.stock) || 0 : null,
  };

  return (
    <div>
      {showPreview && (
        <ProductPreviewModal
          product={previewProduct}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Duplicate Product Modal */}
      <DuplicateProductModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        category={formData.category}
        subCategoryName={formData.subCategoryName}
      />

      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          router.push('/dashboard/business/products');
        }}
      />

      {/* Stock Error Modal */}
      <StockErrorModal
        isOpen={showStockErrorModal}
        onClose={() => setShowStockErrorModal(false)}
        maxStock={maxStockQty}
      />

      {/* Price Error Modal */}
      <PriceErrorModal
        isOpen={showPriceErrorModal}
        onClose={() => setShowPriceErrorModal(false)}
        message={priceErrorMessage}
      />

      {/* Inventory Error Modal */}
      <InventoryErrorModal
        isOpen={showInventoryErrorModal}
        onClose={() => setShowInventoryErrorModal(false)}
      />

      {/* Confirm Save Product Modal */}
      <ConfirmSaveProductModal
        isOpen={showConfirmSaveModal}
        onClose={() => {
          setShowConfirmSaveModal(false);
          setPendingNewProduct(null);
        }}
        onConfirm={handleConfirmSave}
        product={pendingNewProduct}
      />

      <div className="page-header">
        <h1 className="page-title">Add New Product</h1>
        <p className="page-subtitle">
          I-setup ang category, sub-category, variants, at tiered pricing.
        </p>
      </div>

      <form className="product-form" onSubmit={handleSubmit}>

        {/* ────────────────────────────────────────────────────────────── */}
        {/* PRODUCT SECTION — Basic Info */}
        {/* MongoDB Fields: category, subCategoryCode, subCategoryName, description */}
        {/* ────────────────────────────────────────────────────────────── */}
        <div className="form-section">
          <h2 className="form-section-title">Product</h2>

          {/* ── NEW: Material/Inventory Dropdown (Source of Truth) ─────────────── */}
          {/* Links product to Inventory item for automatic stock management */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <InventoryCombobox
              label="Product / Blank Item"
              value={formData.inventoryId}
              onChange={handleInventoryChange}
              inventoryList={inventoryList}
              placeholder="Select a Product from inventory..."
            />
            <p className="form-hint">
              {inventoryList.filter(i => i.isActive !== false).length === 0
                ? 'Add items to your inventory first before creating products.'
                : 'Select a material to auto-fill category, sub-category, and stock.'
              }
              {formData.inventoryId && (() => {
                const selected = inventoryList.find(inv => inv.id === formData.inventoryId);
                return selected?.isOnDemand
                  ? ' This item is Upon Order - stock will be bypassed.'
                  : ` Current stock: ${selected?.stockQty} pcs (Min: ${selected?.minStockLevel})`;
              })()}
            </p>
          </div>

          {/* Row 1: Category | Sub-category */}
          <div className="category-row">

            {/* ── Category: Main product category (e.g., "Mugs", "T-Shirt") ── */}
            {/* Auto-filled from Material selection, read-only */}
            <div className="form-group">
              <label className="form-label">
                Category
                {formData.inventoryId && (
                  <span className="form-label-sub"> (from Material)</span>
                )}
              </label>
              <input
                type="text"
                className="form-input"
                value={formData.category}
                readOnly
                placeholder="Select a Product"
                style={{ cursor: formData.inventoryId ? 'not-allowed' : 'default', opacity: formData.inventoryId ? 0.7 : 1 }}
              />
            </div>

            {/* ── Sub-category: Product variant/type (e.g., "Ceramic", "DTF") ── */}
            {/* Auto-filled from Material selection, read-only */}
            <div className="form-group">
              <label className="form-label">
                Sub-category
                {formData.inventoryId && (
                  <span className="form-label-sub"> (from Material)</span>
                )}
              </label>
              <input
                type="text"
                className="form-input"
                value={formData.subCategoryName}
                readOnly
                placeholder="Select a Product"
                style={{ cursor: formData.inventoryId ? 'not-allowed' : 'default', opacity: formData.inventoryId ? 0.7 : 1 }}
              />
            </div>

          </div>

          {/* ── Description: Product details, materials, sizes, notes ── */}
          {/* TODO: MongoDB — will be saved to 'description' field */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Materials, printing details, sizes, notes…"
            />
          </div>

          {/* ── Product ID: Auto-generated from category + sub-category ── */}
          {/* Format: [Category] - [Sub-category] or just [Category] if no sub-category */}
          {/* TODO: MongoDB — This is for display only, not stored in DB */}
          {formData.category && (
            <div className="sku-preview">
              <span className="sku-label">Product ID:</span>
              <span className="sku-value">
                [{formData.category}]{formData.subCategoryName ? `- [${formData.subCategoryName}]` : ''}
              </span>
            </div>
          )}
        </div>

        {/* ── Availability ── */}
        <div className="form-section">
          <h2 className="form-section-title">Availability</h2>

          {!formData.inventoryId ? (
            <p className="form-hint" style={{ marginBottom: '1rem', color: '#f87171' }}>
              Please select a Material / Blank Item first before setting Availability
            </p>
          ) : (() => {
            const inv = inventoryList.find(i => i.id === formData.inventoryId);
            if (inv?.isOnDemand) {
              // Upon Order item - show only Upon Order card (non-toggleable)
              return (
                <div className="availability-card selected" style={{ cursor: 'not-allowed', opacity: 0.7 }}>
                  <div className="availability-title">Upon Order / Supplied</div>
                  <div className="availability-desc">
                    This item is set as "Upon Order" in Inventory. Stock tracking is disabled.
                  </div>
                </div>
              );
            } else {
              // Has stock - show only Track Stock card (non-toggleable, auto-selected)
              return (
                <div className="availability-card selected" style={{ cursor: 'not-allowed', opacity: 0.7 }}>
                  <div className="availability-title">Track Stock</div>
                  <div className="availability-desc">
                    Enter Storefront Availability, Stock is tracked from Inventory ({inv.stockQty} pcs available)
                  </div>
                  <div className="stock-qty-input-wrap" onClick={e => e.stopPropagation()}>
                    <label className="form-label">
                      Available Storefront Stock <span className="required">*</span>
                    </label>
                    <NumberInput
                      className="form-input"
                      value={formData.stock}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || parseInt(val) >= 0) {
                          if (parseInt(val) > inv.stockQty) {
                            setMaxStockQty(inv.stockQty);
                            setShowStockErrorModal(true);
                            return;
                          }
                          setFormData(prev => ({ ...prev, stock: val }));
                        }
                      }}
                      placeholder="0"
                      min={0}
                      max={inv.stockQty}
                      required
                    />
                    {parseInt(formData.stock) > 0 && (
                      <p className="form-hint" style={{ marginTop: '0.5rem', color: 'var(--gray)' }}>
                        {inv.stockQty - parseInt(formData.stock)} pcs remaining in Inventory for this product
                      </p>
                    )}
                  </div>
                </div>
              );
            }
          })()}
        </div>

        {/* ── Variants ── */}
        <div className="form-section">
          <h2 className="form-section-title">Variants</h2>

          {!formData.category && (
            <p className="form-hint" style={{ marginBottom: '1rem', color: '#f87171' }}>
              Please Add Product Category first before setting Variants
            </p>
          )}

          <div className="variant-groups">
            {variantGroups.map((group, gIdx) => (
              <div key={group.id} className="variant-group" style={{ opacity: !formData.category ? 0.5 : 1, pointerEvents: !formData.category ? 'none' : 'auto' }}>
                <div className="variant-group-header">
                  <span className="variant-group-label">VARIANT {gIdx + 1}</span>
                  <input
                    type="text"
                    className="form-input"
                    value={group.name}
                    onChange={e => updateGroupName(group.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                    placeholder={gIdx === 0 ? 'e.g. Finish, Size, Type…' : 'e.g. Color, Size…'}
                    required
                  />
                  <button type="button" className="btn-remove-group" onClick={() => removeGroup(group.id)}>Remove</button>
                </div>
                <div className="variant-options">
                  {group.options.map(opt => (
                    <span key={opt.id} className="variant-chip-wrap">
                      {/* Image upload button per option — para makita ng customer kung ano itsura ng variant */}
                      <label className="variant-chip-img-btn" title={opt.image ? 'Change image' : 'Add variant image'}>
                        {opt.image
                          ? <img src={opt.image} alt={opt.value} className="variant-chip-img-preview" />
                          : <span className="variant-chip-img-placeholder">🖼️</span>
                        }
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => { if (e.target.files?.[0]) handleOptionImageUpload(group.id, opt.id, e.target.files[0]); }}
                        />
                      </label>
                      <span className="variant-chip">
                        {opt.value}
                        {opt.image && (
                          <button type="button" className="variant-chip-img-remove" onClick={() => removeOptionImage(group.id, opt.id)} title="Remove image">✕img</button>
                        )}
                        <button type="button" className="variant-chip-remove" onClick={() => removeOption(group.id, opt.id)}>×</button>
                      </span>
                    </span>
                  ))}
                  <input
                    type="text"
                    className="variant-option-input"
                    value={optionInputs[group.id] || ''}
                    onChange={e => setOptionInputs(prev => ({ ...prev, [group.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(group.id); } }}
                    placeholder="Add option…"
                  />
                  <button type="button" className="btn-add-option" onClick={() => addOption(group.id)}>+ Add</button>
                </div>
                {duplicateWarning && (
                  <p className="duplicate-warning">{duplicateWarning}</p>
                )}
                {group.options.length === 0 && (
                  <p className="form-hint">Type an option and press Enter or click + Add.</p>
                )}
              </div>
            ))}
          </div>

          {variantGroups.length < 2 && (
            <>
              <button
                type="button"
                className="add-variant-btn"
                onClick={addGroup}
                disabled={!formData.category}
                style={{ opacity: !formData.category ? 0.5 : 1, cursor: !formData.category ? 'not-allowed' : 'pointer' }}
              >
                Add Variant Type
                <span className="add-variant-max">(max 2)</span>
              </button>
              {variantWarning && (
                <p className="duplicate-warning" style={{ color: '#f87171', marginTop: '0.5rem' }}>
                  {variantWarning}
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Pricing ── */}
        <div className="form-section">
          <h2 className="form-section-title">Pricing</h2>

          {!formData.inventoryId && (
            <p className="form-hint" style={{ marginBottom: '1rem', color: '#f87171' }}>
              Please select a Material / Blank Item first before setting Pricing
            </p>
          )}

          <div className="price-type-row" style={{ opacity: !formData.inventoryId ? 0.5 : 1, pointerEvents: !formData.inventoryId ? 'none' : 'auto' }}>
            {[
              { val: 'fixed',   label: 'Fixed Price' },
              { val: 'tiered',  label: 'Tier Price' },
              { val: 'inquiry', label: 'For Inquiry' },
            ].map(({ val, label }) => (
              <button
                key={val}
                type="button"
                className={`price-type-btn${formData.priceType === val ? ' selected' : ''}`}
                onClick={() => formData.inventoryId && setFormData(prev => ({ ...prev, priceType: val }))}
              >
                {label}
              </button>
            ))}
          </div>

          {formData.priceType === 'fixed' && (
            <>
              {hasVariants ? (
                fixedMinP !== null && (
                  <div className="price-preview">
                    <p className="price-preview-value">
                      {formatPrice(fixedMinP)}{fixedMaxP !== fixedMinP ? ` – ${formatPrice(fixedMaxP)}` : ''}
                      <span className="price-preview-unit"> per item</span>
                    </p>
                  </div>
                )
              ) : (
                fixedPrice && (
                  <div className="price-preview">
                    <p className="price-preview-value">
                      {formatPrice(fixedPrice)}
                      <span className="price-preview-unit"> per item</span>
                    </p>
                  </div>
                )
              )}

              {/* ── NEW: Grouping checkboxes — only when 2 variant groups exist */}
              {variantGroups.length >= 2 && combinations.length > 0 && (
                <VariantGroupingCheckboxes
                  variantGroups={variantGroups}
                  groupChecks={groupChecks}
                  onGroupChecksChange={setGroupChecks}
                />
              )}

              {/* ── NEW: SmartPricingTable for fixed pricing */}
              {hasVariants ? (
                <SmartPricingTable
                  tiers={[{ id: '__fixed__', minQty: null, maxQty: null, prices: fixedPriceVariants }]}
                  variantGroups={variantGroups}
                  combinations={combinations}
                  groupChecks={groupChecks}
                  onPriceChange={(_tierId, comboId, val) => {
                    // Update all merged variants with the same price
                    updateFixedPriceWithMerge(comboId, val);
                  }}
                  updateTierRange={() => {}}
                  removeTier={() => {}}
                  mode="fixed"
                />
              ) : (
                <div className="form-group">
                  <div className="tier-price-cell" style={{ opacity: !formData.inventoryId ? 0.5 : 1, pointerEvents: !formData.inventoryId ? 'none' : 'auto' }}>
                    <span className="peso">₱</span>
                    <NumberInput
                      className="tier-input"
                      value={fixedPrice || ''}
                      onChange={e => formData.inventoryId && setFixedPrice(sanitizeNumber(e.target.value))}
                      placeholder="0"
                      min={0}
                      step="0.01"
                      disabled={!formData.inventoryId}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {formData.priceType === 'tiered' && (
            <>
              {minP !== null && (
                <div className="price-preview">
                  <p className="price-preview-value">
                    {formatPrice(minP)}{maxP !== minP ? ` – ${formatPrice(maxP)}` : ''}
                    <span className="price-preview-unit"> per item</span>
                  </p>
                  <p className="price-preview-note">
                    {hasVariants
                      ? 'Pinakamaba at pinakamataas na price sa lahat ng variants at tiers'
                      : 'Auto-calculated from tiers below'}
                  </p>
                </div>
              )}

              {/* ── NEW: Grouping checkboxes for tiered + variants */}
              {variantGroups.length >= 2 && combinations.length > 0 && (
                <VariantGroupingCheckboxes
                  variantGroups={variantGroups}
                  groupChecks={groupChecks}
                  onGroupChecksChange={setGroupChecks}
                />
              )}

              {/* ── NEW: SmartPricingTable for tiered pricing */}
              <div style={{ opacity: !formData.inventoryId ? 0.5 : 1, pointerEvents: !formData.inventoryId ? 'none' : 'auto' }}>
                <SmartPricingTable
                  tiers={tiers}
                  variantGroups={variantGroups}
                  combinations={combinations}
                  groupChecks={groupChecks}
                  onPriceChange={updateTierPriceWithMerge}
                  updateTierRange={updateTierRange}
                  removeTier={removeTier}
                  mode="tiered"
                />
              </div>

              <button type="button" className="add-tier-btn" onClick={addTier} disabled={!formData.inventoryId} style={{ opacity: !formData.inventoryId ? 0.5 : 1, cursor: !formData.inventoryId ? 'not-allowed' : 'pointer' }}>
                Add Price Tier
              </button>
            </>
          )}
        </div>

        {/* ── Thumbnail + Gallery side by side ── */}
        <div className="form-section">
          <div className="images-row">

            {/* Left: Thumbnail — 1 image lang, main display sa product card */}
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
                <div
                  className={`image-upload-area${dragOverThumb ? ' drag-over' : ''}`}
                  onDrop={handleThumbnailDrop}
                  onDragOver={e => { e.preventDefault(); setDragOverThumb(true); }}
                  onDragLeave={() => setDragOverThumb(false)}
                  onClick={() => document.getElementById('thumbnailInput').click()}
                >
                  <div className="image-upload-text"><strong>Click to upload thumbnail</strong> or drag and drop</div>
                  <div className="image-upload-hint">Standard size: 200x200px - 800x800px — PNG, JPG</div>
                  <input
                    id="thumbnailInput"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.length) handleThumbnailUpload(e.target.files); }}
                  />
                </div>
              )}
            </div>

            {/* Right: Gallery — multiple images para sa product detail page */}
            <div className="images-col">
              <h2 className="form-section-title">Product Gallery</h2>
              <div
                className={`image-upload-area${dragOver ? ' drag-over' : ''}`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => document.getElementById('imageInput').click()}
              >
                <div className="image-upload-text"><strong>Click to upload</strong> or drag and drop</div>
                <div className="image-upload-hint">PNG, JPG, GIF</div>
                <input
                  id="imageInput"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.length) handleImageUpload(e.target.files); }}
                />
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

        {/* ── Actions ── */}
        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={() => router.back()}>Cancel</button>
          <button type="button" className="btn-preview" onClick={() => setShowPreview(true)}>
            Preview
          </button>
          <button type="submit" className="btn-submit">Save Product</button>
        </div>

      </form>
    </div>
  );
}