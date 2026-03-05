'use client';

/**
 * PRODUCT LIST PAGE - with Full Edit Modal
 * Edit modal now reuses the full Add Products form UI, pre-filled with existing product data.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

// ── Reusable Number Input ──────────────────────────────────────────────────────
function NumberInput({ value, onChange, min = 0, max, placeholder, className, disabled, step }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  return (
    <input
      type="number"
      className={className}
      value={value}
      onChange={handleChange}
      onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
      onWheel={e => { e.target.blur(); e.preventDefault(); }}
      min={min} max={max} placeholder={placeholder} disabled={disabled} step={step}
    />
  );
}

const sanitizeNumber = (val) => {
  if (val === '') return '';
  const num = parseFloat(val);
  return isNaN(num) || num < 0 ? '0' : val;
};

function comboLabel(combo) { return Object.values(combo).join(' / '); }

// ── Combobox ───────────────────────────────────────────────────────────────────
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
          onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} />
        <button type="button" className="combobox-toggle" onClick={() => setOpen(o => !o)}>{open ? '▲' : '▼'}</button>
      </div>
      {open && (filtered.length > 0 || showAdd) && (
        <div className="combobox-menu">
          {filtered.map((opt, i) => (
            <button key={i} type="button" className={`combobox-item${opt === value ? ' active' : ''}`} onClick={() => select(opt)}>{opt}</button>
          ))}
          {showAdd && (
            <button type="button" className="combobox-item combobox-add" onClick={() => select(inputVal)}>
              <span>+</span> Add "{inputVal}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── InventoryCombobox ──────────────────────────────────────────────────────────
function InventoryCombobox({ value, onChange, inventoryList, placeholder, label, currentProductId }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const ref = useRef(null);

  const linkedProductIds = useMemo(() => {
    const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    // Exclude current product's inventoryId from the "already linked" check
    return new Set(allProducts.filter(p => p.id !== currentProductId).map(p => p.inventoryId).filter(id => id));
  }, [currentProductId]);

  const availableInventoryList = inventoryList.filter(item =>
    item.isActive !== false && !linkedProductIds.has(item.id)
  );

  const getDisplayName = (id) => {
    const item = availableInventoryList.find(inv => inv.id === id) || inventoryList.find(inv => inv.id === id);
    if (!item) return '';
    return `${item.name} (${item.category}) - ${item.isOnDemand ? 'Upon Order' : `${item.stockQty} stocks`}`;
  };

  useEffect(() => { setInputVal(value ? getDisplayName(value) : ''); }, [value, availableInventoryList]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = availableInventoryList.filter(item => {
    const dn = `${item.name} (${item.category}) - ${item.isOnDemand ? 'Upon Order' : `${item.stockQty} stocks`}`;
    return dn.toLowerCase().includes((inputVal || '').toLowerCase());
  });

  const select = (item) => {
    const dn = `${item.name} (${item.category}) - ${item.isOnDemand ? 'Upon Order' : `${item.stockQty} stocks`}`;
    setInputVal(dn); onChange(item.id); setOpen(false);
  };

  return (
    <div ref={ref} className="combobox-root">
      {label && <label className="form-label">{label}</label>}
      <div className="combobox-field">
        <input type="text" className="form-input" value={inputVal} placeholder={placeholder} readOnly onFocus={() => setOpen(true)} />
        <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {value && (
            <button type="button" onClick={() => { setInputVal(''); onChange(''); setOpen(true); }}
              style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.25rem', lineHeight: '1' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
          <button type="button" className="combobox-toggle" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '0.72rem', padding: '0' }}>{open ? ' ' : ' '}</button>
        </div>
      </div>
      {open && (
        <div className="combobox-menu">
          {filtered.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--gray)', fontSize: '0.85rem', textAlign: 'center' }}>No available inventory items</div>
          ) : (
            filtered.map((item, i) => {
              const dn = `${item.name} (${item.category}) - ${item.isOnDemand ? 'Upon Order' : `${item.stockQty} stocks`}`;
              return (
                <button key={i} type="button" className={`combobox-item${item.id === value ? ' active' : ''}`} onClick={() => select(item)}>{dn}</button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── SmartPricingTable ──────────────────────────────────────────────────────────
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
            {mode === 'tiered' && <><th>Tier</th><th>Min Qty</th><th>Max Qty</th></>}
            {columnGroups.map(cg => {
              const fullLabel = cg.primaryVal ? `${cg.primaryVal} / ${cg.label}` : cg.label;
              return (
                <th key={cg.key} className={`tier-variant-header${cg.isMerged ? ' tier-header-merged' : ''}`}>
                  {cg.isMerged
                    ? <span className="tier-merged-label">{fullLabel} <span className="tier-merged-badge">same ₱</span></span>
                    : fullLabel}
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
                        placeholder="0" min={0} step="0.01" />
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

// ── VariantGroupingCheckboxes ──────────────────────────────────────────────────
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
      <div className="vgc-hint">Merge variants with the same price</div>
      <div className="vgc-rows">
        {g1.options.map(p => {
          const checked = groupChecks[p.value] || new Set();
          const allChecked = g2.options.length > 0 && g2.options.every(o => checked.has(o.value));
          const someChecked = g2.options.some(o => checked.has(o.value));
          return (
            <div key={p.id} className="vgc-row">
              <span className="vgc-primary-badge">{p.value}</span>
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

// ── EditProductModal — Full form reusing Add Products UI ──────────────────────
function EditProductModal({ product, inventoryList, onClose, onSave }) {
  const [formData, setFormData] = useState({
    category: product.category || '',
    subCategoryName: product.subCategoryName || '',
    subCategoryCode: product.subCategoryCode || '',
    description: product.description || '',
    priceType: product.priceType || 'fixed',
    trackInventory: product.trackInventory !== false,
    stock: product.stock !== null && product.stock !== undefined ? String(product.stock) : '',
    inventoryId: product.inventoryId || '',
  });

  const [fixedPrice, setFixedPrice] = useState(product.price || '');
  const [fixedPriceVariants, setFixedPriceVariants] = useState(product.variantPrices || {});
  const [tiers, setTiers] = useState(
    product.tiers && product.tiers.length > 0
      ? product.tiers
      : [{ id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } }]
  );

  const [variantGroups, setVariantGroups] = useState(product.variantGroups || []);
  const [combinations, setCombinations] = useState(product.combinations || []);
  const [optionInputs, setOptionInputs] = useState({});
  const [groupChecks, setGroupChecks] = useState({});
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [variantWarning, setVariantWarning] = useState('');

  const [thumbnail, setThumbnail] = useState(product.thumbnail ? { preview: product.thumbnail } : null);
  const [images, setImages] = useState((product.images || []).map((url, i) => ({ id: i, preview: url })));
  const [dragOver, setDragOver] = useState(false);
  const [dragOverThumb, setDragOverThumb] = useState(false);

  const [showStockErrorModal, setShowStockErrorModal] = useState(false);
  const [maxStockQty, setMaxStockQty] = useState(0);
  
  // ⭐ NEW: Confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState(null);

  const hasVariants = combinations.length > 0;

  // ── Sync tier prices when groupChecks change (merge/unmerge) ──────────────────
  // This is the KEY fix: when user checks/unchecks merge boxes, sync all prices in a group
  useEffect(() => {
    if (!hasVariants || tiers.length === 0 || variantGroups.length < 2) return;

    setTiers(prevTiers => prevTiers.map(tier => {
      const newPrices = { ...tier.prices };
      let changed = false;

      Object.entries(groupChecks).forEach(([primaryVal, checkedSet]) => {
        if (!(checkedSet instanceof Set) || checkedSet.size <= 1) return;

        const comboIdsForGroup = combinations
          .filter(c =>
            c.combo[variantGroups[0]?.id] === primaryVal &&
            checkedSet.has(c.combo[variantGroups[1]?.id])
          )
          .map(c => c.id);

        if (comboIdsForGroup.length <= 1) return;

        // Find first non-empty price in the group to use as the canonical value
        const firstPrice = comboIdsForGroup
          .map(id => newPrices[id])
          .find(p => p !== '' && p !== undefined) || '';

        comboIdsForGroup.forEach(id => {
          if (newPrices[id] !== firstPrice) {
            newPrices[id] = firstPrice;
            changed = true;
          }
        });
      });

      return changed ? { ...tier, prices: newPrices } : tier;
    }));
  }, [groupChecks]);

  // ── Sync fixed prices when groupChecks change ────────────────────────────────
  useEffect(() => {
    if (!hasVariants || variantGroups.length < 2) return;

    setFixedPriceVariants(prev => {
      const newPrices = { ...prev };
      let changed = false;

      Object.entries(groupChecks).forEach(([primaryVal, checkedSet]) => {
        if (!(checkedSet instanceof Set) || checkedSet.size <= 1) return;

        const comboIdsForGroup = combinations
          .filter(c =>
            c.combo[variantGroups[0]?.id] === primaryVal &&
            checkedSet.has(c.combo[variantGroups[1]?.id])
          )
          .map(c => c.id);

        if (comboIdsForGroup.length <= 1) return;

        const firstPrice = comboIdsForGroup
          .map(id => newPrices[id])
          .find(p => p !== '' && p !== undefined) || '';

        comboIdsForGroup.forEach(id => {
          if (newPrices[id] !== firstPrice) {
            newPrices[id] = firstPrice;
            changed = true;
          }
        });
      });

      return changed ? newPrices : prev;
    });
  }, [groupChecks]);

  // ── Inventory change handler ──
  const handleInventoryChange = (inventoryId) => {
    const selectedItem = inventoryId ? inventoryList.find(inv => inv.id === inventoryId) : null;
    setFormData(prev => ({
      ...prev,
      inventoryId,
      category: selectedItem ? selectedItem.category : '',
      subCategoryName: selectedItem ? selectedItem.name : '',
      subCategoryCode: selectedItem ? selectedItem.name.split(' ').filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase().slice(0, 8) : '',
      trackInventory: selectedItem ? !selectedItem.isOnDemand : true,
      stock: selectedItem && !selectedItem.isOnDemand ? String(selectedItem.stockQty) : '',
    }));
  };

  // ── Variant helpers ──
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
    if (variantGroups.length >= 2) return;
    if (variantGroups.length === 1) {
      const firstGroup = variantGroups[0];
      if (!firstGroup.name.trim() || firstGroup.options.length === 0) {
        setVariantWarning('Please fill in Variant 1 name and add at least 1 option first!');
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
    setFixedPriceVariants({});
    rebuildAll(u);
  };

  const updateGroupName = (gid, name) => setVariantGroups(variantGroups.map(g => g.id === gid ? { ...g, name } : g));

  const addOption = (gid) => {
    const val = (optionInputs[gid] || '').trim();
    if (!val) return;
    const group = variantGroups.find(g => g.id === gid);
    if (group && group.options.some(o => o.value.toLowerCase() === val.toLowerCase())) {
      setDuplicateWarning(`"${val}" already exists!`);
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
    const u = variantGroups.map(g => g.id === gid ? { ...g, options: g.options.filter(o => o.id !== oid) } : g);
    setVariantGroups(u);
    rebuildAll(u);
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const emptyPrices = hasVariants
      ? combinations.reduce((acc, c) => ({ ...acc, [c.id]: '' }), {})
      : { '__base__': '' };
    setTiers(prev => [...prev, { id: Date.now(), minQty: last ? (parseInt(last.maxQty) || 0) + 1 : 1, maxQty: '', prices: emptyPrices }]);
  };

  const removeTier = (id) => setTiers(tiers.filter(t => t.id !== id));
  const updateTierRange = (id, field, val) => setTiers(tiers.map(t => t.id === id ? { ...t, [field]: val } : t));

  // ── Merge-aware tier price update ────────────────────────────────────────────
  // When a priceKey belongs to a merged group, update ALL combos in that group
  const updateTierPrice = (tierId, priceKey, val) => {
    // Check if this combo is part of a merged group
    if (variantGroups.length >= 2 && priceKey !== '__base__') {
      const combo = combinations.find(c => c.id === priceKey);
      if (combo) {
        const primaryVal = combo.combo[variantGroups[0]?.id];
        const checkedSet = groupChecks[primaryVal];

        if (checkedSet instanceof Set && checkedSet.size > 1) {
          // Get all combo IDs in this merged group
          const mergedComboIds = combinations
            .filter(c =>
              c.combo[variantGroups[0]?.id] === primaryVal &&
              checkedSet.has(c.combo[variantGroups[1]?.id])
            )
            .map(c => c.id);

          if (mergedComboIds.includes(priceKey)) {
            // Update ALL combos in the merged group at once
            setTiers(prev => prev.map(t => {
              if (t.id !== tierId) return t;
              const newPrices = { ...t.prices };
              mergedComboIds.forEach(cid => { newPrices[cid] = val; });
              return { ...t, prices: newPrices };
            }));
            return;
          }
        }
      }
    }

    // Not merged — update single price
    setTiers(prev => prev.map(t =>
      t.id === tierId ? { ...t, prices: { ...t.prices, [priceKey]: val } } : t
    ));
  };

  // ── Merge-aware fixed price update ───────────────────────────────────────────
  const updateFixedPrice = (comboId, val) => {
    if (variantGroups.length >= 2) {
      const combo = combinations.find(c => c.id === comboId);
      if (combo) {
        const primaryVal = combo.combo[variantGroups[0]?.id];
        const checkedSet = groupChecks[primaryVal];

        if (checkedSet instanceof Set && checkedSet.size > 1) {
          const mergedComboIds = combinations
            .filter(c =>
              c.combo[variantGroups[0]?.id] === primaryVal &&
              checkedSet.has(c.combo[variantGroups[1]?.id])
            )
            .map(c => c.id);

          if (mergedComboIds.includes(comboId)) {
            setFixedPriceVariants(prev => {
              const next = { ...prev };
              mergedComboIds.forEach(cid => { next[cid] = val; });
              return next;
            });
            return;
          }
        }
      }
    }

    setFixedPriceVariants(prev => ({ ...prev, [comboId]: val }));
  };

  // ── Image helpers ──
  const createImageObj = (file) => ({ file, preview: URL.createObjectURL(file), id: Date.now() + Math.random() });
  const handleThumbnailUpload = (files) => { const file = files[0]; if (file) setThumbnail(createImageObj(file)); };
  const handleThumbnailDrop = (e) => { e.preventDefault(); setDragOverThumb(false); if (e.dataTransfer.files?.length) handleThumbnailUpload(e.dataTransfer.files); };
  const handleImageUpload = (files) => setImages(prev => [...prev, ...Array.from(files).map(createImageObj)]);
  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleImageUpload(e.dataTransfer.files); };
  const removeImage = (id) => setImages(images.filter(img => img.id !== id));

  // ── Price helpers ──
  const fixedPricesArray = hasVariants ? Object.values(fixedPriceVariants).map(p => parseFloat(p)).filter(p => p > 0) : [];
  const fixedMinP = fixedPricesArray.length ? Math.min(...fixedPricesArray) : null;
  const fixedMaxP = fixedPricesArray.length ? Math.max(...fixedPricesArray) : null;
  const allPrices = tiers.flatMap(t => Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0));
  const minP = allPrices.length ? Math.min(...allPrices) : null;
  const maxP = allPrices.length ? Math.max(...allPrices) : null;

  const handleSave = () => {
    const stockVal = formData.trackInventory ? parseInt(formData.stock) || 0 : null;
    const updatedProduct = {
      ...product,
      inventoryId: formData.inventoryId || null,
      category: formData.category,
      subCategoryCode: formData.subCategoryCode,
      subCategoryName: formData.subCategoryName,
      description: formData.description,
      priceType: formData.priceType,
      ...(formData.priceType === 'fixed'
        ? hasVariants ? { variantPrices: fixedPriceVariants, price: undefined } : { price: fixedPrice, variantPrices: undefined }
        : { tiers }
      ),
      variantGroups,
      combinations,
      thumbnail: thumbnail?.preview || null,
      images: images.map(img => img.preview),
      trackInventory: formData.trackInventory,
      stock: stockVal,
      updatedAt: new Date().toISOString(),
    };
    // ⭐ Show confirmation modal before saving
    setPendingSaveData(updatedProduct);
    setShowConfirmModal(true);
  };

  const handleConfirmSave = () => {
    if (pendingSaveData) {
      onSave(pendingSaveData);
      setShowConfirmModal(false);
      setPendingSaveData(null);
    }
  };

  const inv = inventoryList.find(i => i.id === formData.inventoryId);

  return (
    <div className="modal-overlay">
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--dark)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--gold) var(--dark2)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Modal Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          background: 'var(--dark)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.15rem', fontWeight: 700, color: 'var(--white)', margin: 0 }}>
              Edit Product
            </h2>
            <p style={{ color: 'var(--gray)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              {product.productName || product.subCategoryName || 'Product'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0', flex: 1 }}>
          <form className="product-form" style={{ background: 'transparent', border: 'none', padding: 0 }}
            onSubmit={e => { e.preventDefault(); handleSave(); }}>

            {/* ── PRODUCT SECTION ── */}
            <div className="form-section">
              <h2 className="form-section-title">Product</h2>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <InventoryCombobox
                  label="Product / Blank Item"
                  value={formData.inventoryId}
                  onChange={handleInventoryChange}
                  inventoryList={inventoryList}
                  placeholder="Select a Product from inventory..."
                  currentProductId={product.id}
                />
                <p className="form-hint">
                  {formData.inventoryId && inv
                    ? inv.isOnDemand
                      ? ' This item is Upon Order - stock tracking disabled.'
                      : ` Current stock: ${inv.stockQty} pcs (Min: ${inv.minStockLevel})`
                    : 'Select a material to auto-fill category, sub-category, and stock.'}
                </p>
              </div>

              <div className="category-row">
                <div className="form-group">
                  <label className="form-label">Category <span className="form-label-sub">(from Material)</span></label>
                  <input type="text" className="form-input" value={formData.category} readOnly
                    style={{ cursor: 'not-allowed', opacity: 0.7 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sub-category <span className="form-label-sub">(from Material)</span></label>
                  <input type="text" className="form-input" value={formData.subCategoryName} readOnly
                    style={{ cursor: 'not-allowed', opacity: 0.7 }} />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Materials, printing details, sizes, notes…" />
              </div>

              {formData.category && (
                <div className="sku-preview">
                  <span className="sku-label">Product ID:</span>
                  <span className="sku-value">[{formData.category}]{formData.subCategoryName ? `- [${formData.subCategoryName}]` : ''}</span>
                </div>
              )}
            </div>

            {/* ── AVAILABILITY ── */}
            <div className="form-section">
              <h2 className="form-section-title">Availability</h2>
              {!formData.inventoryId ? (
                <p className="form-hint" style={{ color: '#f87171' }}>Please select a Product / Blank Item first</p>
              ) : inv?.isOnDemand ? (
                <div className="availability-card selected" style={{ cursor: 'not-allowed', opacity: 0.7 }}>
                  <div className="availability-title">Upon Order / Supplied</div>
                  <div className="availability-desc">Stock tracking is disabled for this item.</div>
                </div>
              ) : (
                <div className="availability-card selected" style={{ cursor: 'not-allowed', opacity: 0.7 }}>
                  <div className="availability-title">Track Stock</div>
                  <div className="availability-desc">Stock is tracked from Inventory ({inv?.stockQty} pcs available)</div>
                  <div className="stock-qty-input-wrap" onClick={e => e.stopPropagation()}>
                    <label className="form-label">Available Stock <span className="required">*</span></label>
                    <NumberInput className="form-input" value={formData.stock}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || parseInt(val) >= 0) {
                          if (parseInt(val) > inv.stockQty) { setMaxStockQty(inv.stockQty); setShowStockErrorModal(true); return; }
                          setFormData(prev => ({ ...prev, stock: val }));
                        }
                      }}
                      placeholder="0" min={0} max={inv?.stockQty} required />
                    {parseInt(formData.stock) > 0 && inv && (
                      <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                        {inv.stockQty - parseInt(formData.stock)} pcs remaining in Inventory
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── VARIANTS ── */}
            <div className="form-section">
              <h2 className="form-section-title">Variants</h2>
              <div className="variant-groups">
                {variantGroups.map((group, gIdx) => (
                  <div key={group.id} className="variant-group">
                    <div className="variant-group-header">
                      <span className="variant-group-label">VARIANT {gIdx + 1}</span>
                      <input type="text" className="form-input" value={group.name}
                        onChange={e => updateGroupName(group.id, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                        placeholder={gIdx === 0 ? 'e.g. Finish, Size, Type…' : 'e.g. Color, Size…'} required />
                      <button type="button" className="btn-remove-group" onClick={() => removeGroup(group.id)}>Remove</button>
                    </div>
                    <div className="variant-options">
                      {group.options.map(opt => (
                        <span key={opt.id} className="variant-chip">
                          {opt.value}
                          <button type="button" className="variant-chip-remove" onClick={() => removeOption(group.id, opt.id)}>×</button>
                        </span>
                      ))}
                      <input type="text" className="variant-option-input"
                        value={optionInputs[group.id] || ''}
                        onChange={e => setOptionInputs(prev => ({ ...prev, [group.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(group.id); } }}
                        placeholder="Add option…" />
                      <button type="button" className="btn-add-option" onClick={() => addOption(group.id)}>+ Add</button>
                    </div>
                    {duplicateWarning && <p className="duplicate-warning">{duplicateWarning}</p>}
                  </div>
                ))}
              </div>
              {variantGroups.length < 2 && (
                <>
                  <button type="button" className="add-variant-btn" onClick={addGroup}>
                    Add Variant Type <span className="add-variant-max">(max 2)</span>
                  </button>
                  {variantWarning && <p className="duplicate-warning" style={{ color: '#f87171', marginTop: '0.5rem' }}>{variantWarning}</p>}
                </>
              )}
            </div>

            {/* ── PRICING ── */}
            <div className="form-section">
              <h2 className="form-section-title">Pricing</h2>

              <div className="price-type-row">
                {[{ val: 'fixed', label: 'Fixed Price' }, { val: 'tiered', label: 'Tier Price' }, { val: 'inquiry', label: 'For Inquiry' }].map(({ val, label }) => (
                  <button key={val} type="button" className={`price-type-btn${formData.priceType === val ? ' selected' : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, priceType: val }))}>{label}</button>
                ))}
              </div>

              {formData.priceType === 'fixed' && (
                <>
                  {hasVariants ? (
                    fixedMinP !== null && (
                      <div className="price-preview">
                        <p className="price-preview-value">₱{fixedMinP}{fixedMaxP !== fixedMinP ? ` – ₱${fixedMaxP}` : ''}<span className="price-preview-unit"> per item</span></p>
                      </div>
                    )
                  ) : (
                    fixedPrice && <div className="price-preview"><p className="price-preview-value">₱{fixedPrice}<span className="price-preview-unit"> per item</span></p></div>
                  )}
                  {variantGroups.length >= 2 && combinations.length > 0 && (
                    <VariantGroupingCheckboxes variantGroups={variantGroups} groupChecks={groupChecks} onGroupChecksChange={setGroupChecks} />
                  )}
                  {hasVariants ? (
                    <SmartPricingTable
                      tiers={[{ id: '__fixed__', minQty: null, maxQty: null, prices: fixedPriceVariants }]}
                      variantGroups={variantGroups} combinations={combinations} groupChecks={groupChecks}
                      onPriceChange={(_tierId, comboId, val) => updateFixedPrice(comboId, val)}
                      updateTierRange={() => {}} removeTier={() => {}} mode="fixed" />
                  ) : (
                    <div className="form-group">
                      <div className="tier-price-cell">
                        <span className="peso">₱</span>
                        <NumberInput className="tier-input" value={fixedPrice || ''}
                          onChange={e => setFixedPrice(sanitizeNumber(e.target.value))} placeholder="0" min={0} step="0.01" />
                      </div>
                    </div>
                  )}
                </>
              )}

              {formData.priceType === 'tiered' && (
                <>
                  {minP !== null && (
                    <div className="price-preview">
                      <p className="price-preview-value">₱{minP}{maxP !== minP ? ` – ₱${maxP}` : ''}<span className="price-preview-unit"> per item</span></p>
                    </div>
                  )}
                  {variantGroups.length >= 2 && combinations.length > 0 && (
                    <VariantGroupingCheckboxes variantGroups={variantGroups} groupChecks={groupChecks} onGroupChecksChange={setGroupChecks} />
                  )}
                  <SmartPricingTable tiers={tiers} variantGroups={variantGroups} combinations={combinations} groupChecks={groupChecks}
                    onPriceChange={updateTierPrice} updateTierRange={updateTierRange} removeTier={removeTier} mode="tiered" />
                  <button type="button" className="add-tier-btn" onClick={addTier}>Add Price Tier</button>
                </>
              )}

              {formData.priceType === 'inquiry' && (
                <div style={{ padding: '1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', color: 'var(--gold)', fontSize: '0.9rem' }}>
                  <span style={{ marginRight: '0.5rem' }}>ℹ</span> This product will be listed as "For Inquiry" — customers will contact you for pricing.
                </div>
              )}
            </div>

            {/* ── IMAGES ── */}
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
                    <div className={`image-upload-area${dragOverThumb ? ' drag-over' : ''}`}
                      onDrop={handleThumbnailDrop}
                      onDragOver={e => { e.preventDefault(); setDragOverThumb(true); }}
                      onDragLeave={() => setDragOverThumb(false)}
                      onClick={() => document.getElementById('editThumbnailInput').click()}>
                      <div className="image-upload-text"><strong>Click to upload thumbnail</strong> or drag and drop</div>
                      <div className="image-upload-hint">PNG, JPG — 200x200 to 800x800px</div>
                      <input id="editThumbnailInput" type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.length) handleThumbnailUpload(e.target.files); }} />
                    </div>
                  )}
                </div>
                <div className="images-col">
                  <h2 className="form-section-title">Product Gallery</h2>
                  <div className={`image-upload-area${dragOver ? ' drag-over' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => document.getElementById('editImageInput').click()}>
                    <div className="image-upload-text"><strong>Click to upload</strong> or drag and drop</div>
                    <div className="image-upload-hint">PNG, JPG, GIF</div>
                    <input id="editImageInput" type="file" accept="image/*" multiple style={{ display: 'none' }}
                      onChange={e => { if (e.target.files?.length) handleImageUpload(e.target.files); }} />
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
              <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-submit">Save Changes</button>
            </div>

          </form>
        </div>

        {/* Stock Error inline notice */}
        {showStockErrorModal && (
          <div style={{
            position: 'sticky', bottom: 0, left: 0, right: 0,
            background: 'rgba(196,30,58,0.95)', color: 'white',
            padding: '0.75rem 1.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: '1px solid var(--red)',
          }}>
            <span>⚠ Cannot exceed inventory stock ({maxStockQty} pcs)</span>
            <button onClick={() => setShowStockErrorModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
          </div>
        )}

        {/* ⭐ Confirmation Modal */}
        {showConfirmModal && (
          <div className="modal-overlay" style={{ zIndex: 2000 }}>
            <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title modal-title-success">Confirm Changes</h2>
                <button className="modal-close" onClick={() => setShowConfirmModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div className="modal-body">
                <p className="delete-confirm-text">
                  Save changes to <strong>{product.productName || product.subCategoryName}</strong>?
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowConfirmModal(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleConfirmSave}>Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ProductListPage ───────────────────────────────────────────────────────
export default function ProductListPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingProduct, setEditingProduct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  useEffect(() => {
    const storedProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    const storedInventory = JSON.parse(localStorage.getItem('pmp_inventory') || '[]');
    setProducts(storedProducts);
    setInventoryList(storedInventory);
    setIsLoaded(true);
  }, []);

  const filteredProducts = products.filter(product => {
    const matchesSearch =
      product.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.subCategoryName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesStatus = true;
    if (statusFilter === 'published') matchesStatus = product.isPublished === true;
    else if (statusFilter === 'unpublished') matchesStatus = product.isPublished !== true;
    return matchesSearch && matchesStatus;
  });

  const getInventoryItem = (inventoryId) => inventoryList.find(inv => inv.id === inventoryId);

  const getPriceRange = (product) => {
    if (!product.priceType) return '₱0';
    let minPrice = Infinity, maxPrice = 0;
    if (product.priceType === 'fixed') {
      if (product.variantPrices && Object.keys(product.variantPrices).length > 0) {
        const prices = Object.values(product.variantPrices).filter(p => p && p > 0);
        if (prices.length > 0) { minPrice = Math.min(...prices); maxPrice = Math.max(...prices); }
      } else if (product.price) {
        minPrice = parseFloat(product.price) || 0; maxPrice = minPrice;
      }
    } else if (product.priceType === 'tiered') {
      product.tiers?.forEach(tier => {
        Object.values(tier.prices || {}).forEach(price => {
          const p = parseFloat(price);
          if (p > 0) { minPrice = Math.min(minPrice, p); maxPrice = Math.max(maxPrice, p); }
        });
      });
    } else if (product.priceType === 'inquiry') {
      return 'For Inquiry';
    }
    if (minPrice === Infinity) minPrice = 0;
    if (minPrice === maxPrice) return `₱${minPrice.toFixed(2)}`;
    return `₱${minPrice.toFixed(2)} – ₱${maxPrice.toFixed(2)}`;
  };

  const getStockStatus = (product) => {
    const inv = getInventoryItem(product.inventoryId);
    if (!inv) return { text: 'No Link', class: 'stock-no-link' };
    if (inv.isOnDemand) return { text: 'Upon Order', class: 'stock-upon-order' };
    const available = parseInt(product.stock) || 0;
    const total = inv.stockQty || 0;
    if (available === 0) return { text: `${available} / ${total}`, class: 'stock-out' };
    if (available <= 10) return { text: `${available} / ${total}`, class: 'stock-low' };
    return { text: `${available} / ${total}`, class: 'stock-ok' };
  };

  const togglePublish = (productId) => {
    const updated = products.map(p => p.id === productId ? { ...p, isPublished: !p.isPublished, updatedAt: new Date().toISOString() } : p);
    setProducts(updated);
    localStorage.setItem('pmp_products', JSON.stringify(updated));
  };

  const handleEdit = (product) => { setEditingProduct(product); setShowEditModal(true); };

  const handleSaveEdit = (updatedProduct) => {
    const updated = products.map(p => p.id === updatedProduct.id ? updatedProduct : p);
    setProducts(updated);
    localStorage.setItem('pmp_products', JSON.stringify(updated));
    setShowEditModal(false);
    setEditingProduct(null);
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 3000);
  };

  const handleDelete = (product) => {
    // ⭐ Check if product has sales/orders
    const allOrders = JSON.parse(localStorage.getItem('pmp_orders') || '[]');
    const hasSales = allOrders.some(order => 
      order.productId === product.id || 
      order.items?.some(item => item.productId === product.id)
    );

    if (hasSales) {
      alert(`Cannot delete "${product.productName || product.subCategoryName}" - this product has sales history. Please archive it instead.`);
      return;
    }

    if (!confirm(`Delete "${product.productName || product.subCategoryName}"? This product will be permanently removed. This cannot be undone.`)) return;
    
    const updated = products.filter(p => p.id !== product.id);
    setProducts(updated);
    localStorage.setItem('pmp_products', JSON.stringify(updated));
  };

  const handleArchive = (product) => {
    // ⭐ Archive product (set as unpublished instead of deleting)
    const updated = products.map(p =>
      p.id === product.id ? { ...p, isArchived: true, isPublished: false } : p
    );
    setProducts(updated);
    localStorage.setItem('pmp_products', JSON.stringify(updated));
  };

  if (!isLoaded) {
    return (
      <div className="page-content-wrapper">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content-wrapper">
      {/* Save Success Toast */}
      {showSaveSuccess && (
        <div style={{
          position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 2000,
          background: '#facc15', color: 'black',
          padding: '0.875rem 1.5rem', borderRadius: '10px',
          fontWeight: 600, fontSize: '0.9rem',
          boxShadow: '0 8px 32px rgba(198, 177, 23, 0.3)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          animation: 'fadeIn 0.2s ease',
        }}>
          Product updated successfully!
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Product List</h1>
            <p className="page-subtitle">Manage your products and control what appears in your storefront.</p>
          </div>
          <button className="btn-primary" onClick={() => router.push('/dashboard/business')}>
            <span className="btn-icon">+</span> Add New Product
          </button>
        </div>

        <div className="inventory-summary">
          <div className={`summary-card${statusFilter === '' ? ' active' : ''}`} onClick={() => setStatusFilter('')} style={{ cursor: 'pointer' }}>
            <div className="summary-content">
              <span className="summary-value">{products.length}</span>
              <span className="summary-label">Total Products</span>
            </div>
          </div>
          <div className={`summary-card summary-card-success${statusFilter === 'published' ? ' active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'published' ? '' : 'published')} style={{ cursor: 'pointer' }}>
            <div className="summary-content">
              <span className="summary-value">{products.filter(p => p.isPublished === true).length}</span>
              <span className="summary-label">Published</span>
            </div>
          </div>
          <div className={`summary-card summary-card-warning${statusFilter === 'unpublished' ? ' active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'unpublished' ? '' : 'unpublished')} style={{ cursor: 'pointer' }}>
            <div className="summary-content">
              <span className="summary-value">{products.filter(p => p.isPublished !== true).length}</span>
              <span className="summary-label">Unpublished</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="inventory-toolbar">
        <div className="search-wrapper">
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input type="text" className="search-input" placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>}
        </div>
      </div>

      {/* Table */}
      <div className="inventory-table-wrapper">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <h3 className="empty-title">{searchQuery || statusFilter ? 'No products found' : 'No Products Yet'}</h3>
            <p className="empty-description">{searchQuery || statusFilter ? 'Try adjusting your search or filter.' : 'Get started by adding your first product.'}</p>
            {!searchQuery && !statusFilter && (
              <button className="btn-primary" onClick={() => router.push('/dashboard/business')}>Add First Product</button>
            )}
          </div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th className="table-col-name">Product</th>
                <th className="table-col-category">Category</th>
                <th className="table-col-stock">Price Range</th>
                <th className="table-col-min">Storefront / Total Stock</th>
                <th className="table-col-status">Status</th>
                <th className="table-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => {
                const inv = getInventoryItem(product.inventoryId);
                const stockStatus = getStockStatus(product);
                const priceRange = getPriceRange(product);
                return (
                  <tr key={product.id} className="inventory-table-row">
                    <td className="table-cell-name">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {product.thumbnail ? (
                          <img src={product.thumbnail} alt={product.productName || product.subCategoryName}
                            style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(100,100,100,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', fontSize: '1.25rem' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <path d="M3 9h18M9 21V9"/>
                          </svg>
                        </div>
                        )}
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--white)' }}>{product.productName || product.subCategoryName || 'Unnamed Product'}</div>
                          {inv && <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Linked: {inv.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="category-badge">{product.category || 'N/A'}</span>
                    </td>
                    <td className="table-cell-stock">
                      <span style={{ fontWeight: '600', color: product.priceType === 'inquiry' ? 'var(--primary)' : 'var(--gold)' }}>{priceRange}</span>
                    </td>
                    <td className="table-cell">
                      <span className={`stock-status-badge ${stockStatus.class}`}>{stockStatus.text}</span>
                    </td>
                    <td className="table-cell">
                      <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={product.isPublished === true} onChange={() => togglePublish(product.id)}
                          style={{ width: '40px', height: '20px', marginRight: '0.5rem', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                        <span style={{ fontSize: '0.875rem', color: product.isPublished ? 'var(--primary)' : 'var(--gray)' }}>
                          {product.isPublished ? 'Live' : 'Hidden'}
                        </span>
                      </label>
                    </td>
                    <td className="table-cell-actions">
                      <button className="btn-sm btn-primary" onClick={() => handleEdit(product)} title="Edit">Edit</button>
                      {(() => {
                        // Check if product has sales
                        const allOrders = JSON.parse(localStorage.getItem('pmp_orders') || '[]');
                        const hasSales = allOrders.some(order => 
                          order.productId === product.id || 
                          order.items?.some(item => item.productId === product.id)
                        );
                        
                        if (hasSales) {
                          // Show Archive button for products with sales
                          return (
                            <button 
                              className="btn-sm btn-secondary" 
                              onClick={() => handleArchive(product)} 
                              title="Archive"
                              style={{ background: 'var(--dark2)', borderColor: 'var(--border)' }}
                            >
                              Archive
                            </button>
                          );
                        } else {
                          // Show Delete button for products without sales
                          return (
                            <button className="btn-sm btn-danger" onClick={() => handleDelete(product)} title="Delete">Remove</button>
                          );
                        }
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Info Note */}
      <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(99,102,241,0.1)', border: '1px solid var(--primary)', borderRadius: '8px' }}>
        <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>
          <span style={{ marginRight: '0.5rem', fontWeight: 'bold' }}>ℹ</span> How it works:
        </div>
        <ul style={{ fontSize: '0.875rem', color: 'var(--gray)', lineHeight: '1.8', paddingLeft: '1.25rem' }}>
          <li><strong>Published:</strong> Product appears in your storefront</li>
          <li><strong>Hidden:</strong> Product is saved but not visible to customers</li>
          <li><strong>Stock (Available / Total):</strong> Shows storefront allocation vs total inventory</li>
          <li><strong>Edit:</strong> Opens full edit form — all attributes are editable</li>
        </ul>
      </div>

      {/* Full Edit Modal */}
      {showEditModal && editingProduct && (
        <EditProductModal
          product={editingProduct}
          inventoryList={inventoryList}
          onClose={() => { setShowEditModal(false); setEditingProduct(null); }}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}