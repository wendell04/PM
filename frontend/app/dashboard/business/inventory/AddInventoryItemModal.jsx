'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatPrice } from '../../../../src/utils/format';

// ── Integer Input (stock qty, min level, damaged qty) ─────────────────────────
function IntegerInput({ value, onChange, min = 0, max, placeholder, className, disabled, autoFocus, onBlur, onKeyDown, qtyValue }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      const numVal = val === '' ? 0 : parseInt(val, 10);
      if (max !== undefined && numVal > max) return;
      if (numVal < min) return;
      // If this is a damaged input, check against qty
      if (qtyValue !== undefined) {
        const qty = parseInt(qtyValue) || 0;
        if (numVal > qty) return; // Damaged cannot exceed qty
      }
      onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  const handleKeyDown = (e) => {
    if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
    if (onKeyDown) onKeyDown(e);
  };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };
  return (
    <input type="text" className={className} value={value} onChange={handleChange}
      onKeyDown={handleKeyDown} onWheel={handleWheel} onBlur={onBlur}
      min={min} max={max} placeholder={placeholder} disabled={disabled} autoFocus={autoFocus}
      inputMode="numeric" pattern="[0-9]*" />
  );
}

// ── Decimal Input (unit cost, selling price — max 2 decimal places) ───────────
function DecimalInput({ value, onChange, placeholder, className, disabled, style, max = 999999.99 }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      const numVal = parseFloat(val) || 0;
      if (numVal <= max) {
        onChange({ ...e, target: { ...e.target, value: val } });
      }
    }
  };
  const handleKeyDown = (e) => { if (['e', 'E', '+', '-', ' '].includes(e.key)) e.preventDefault(); };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };
  return (
    <input type="text" className={className} value={value} onChange={handleChange}
      onKeyDown={handleKeyDown} onWheel={handleWheel}
      placeholder={placeholder} disabled={disabled} inputMode="decimal" style={style} />
  );
}

// ── Comma-formatted Number Input (for invoice amounts) ────────────────────────
function CommaNumberInput({ value, onChange, placeholder, className, style, max = 999999999.99 }) {
  const handleChange = (e) => {
    const val = e.target.value.replace(/,/g, '');
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      const numVal = parseFloat(val) || 0;
      if (numVal <= max) {
        // Format with commas but preserve what user typed
        const parts = val.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const formatted = parts.join('.');
        onChange({ ...e, target: { ...e.target, value: formatted } });
      }
    }
  };
  const handleKeyDown = (e) => { if (['e', 'E', '+', '-', ' '].includes(e.key)) e.preventDefault(); };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };
  return (
    <input type="text" className={className} value={value} onChange={handleChange}
      onKeyDown={handleKeyDown} onWheel={handleWheel}
      placeholder={placeholder} inputMode="decimal"
      style={{ ...style, background: 'transparent', border: 'none', outline: 'none', minWidth: 0 }} />
  );
}

// ── SupplierCombobox ──────────────────────────────────────────────────────────
function SupplierCombobox({ value, supplierName, onChange, suppliers, itemCategory, onAddNew }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = suppliers.filter(s =>
    !s.categories || s.categories.length === 0 || s.categories.includes(itemCategory)
  );
  const display = value === 'unspecified' ? 'General Merchandise' : (supplierName || 'General Merchandise');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="combobox-field" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
        <input type="text" className="form-input" value={display} readOnly style={{ cursor: 'pointer' }} />
        <button type="button" className="combobox-toggle">{open ? '▲' : '▼'}</button>
      </div>
      {open && (
        <div className="combobox-menu" style={{ maxHeight: '200px', overflowY: 'auto' }}>
          <button type="button" className={`combobox-item${value==='unspecified'?' active':''}`}
            onClick={() => { onChange('unspecified', 'General Merchandise'); setOpen(false); }}>
            General Merchandise
            <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: '0.5rem' }}>Local Market / Various Market Vendors</span>
          </button>
          {filtered.map(s => (
            <button key={s.id} type="button" className={`combobox-item${value===s.id?' active':''}`}
              onClick={() => { onChange(s.id, s.name); setOpen(false); }}>
              {s.name}
              {s.categories?.length > 0
                ? <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: '0.5rem' }}>({s.categories.join(', ')})</span>
                : <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: '0.5rem' }}>(General)</span>
              }
            </button>
          ))}
          <button type="button" className="combobox-item combobox-add" onClick={() => { setOpen(false); onAddNew(); }}>
            <span>+</span> Add New Supplier...
          </button>
        </div>
      )}
    </div>
  );
}

// ── InfoModal ─────────────────────────────────────────────────────────────────
function InfoModal({ isOpen, onClose, title, message, titleClass = 'modal-title-warning' }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className={`modal-title ${titleClass}`}>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body"><p className="delete-confirm-text">{message}</p></div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

// ── AddSupplierQuickModal ─────────────────────────────────────────────────────
function AddSupplierQuickModal({ isOpen, onClose, onAdd, categories, existingSuppliers, itemCategory }) {
  const [form, setForm] = useState({ name: '', contact: '', phone: '', address: '', email: '', categories: [] });
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setForm({ 
        name: '', 
        contact: '', 
        phone: '', 
        address: '', 
        email: '', 
        categories: itemCategory ? [itemCategory] : []  // Auto-link to product category
      });
    }
  }, [isOpen, itemCategory]);

  const handlePhoneChange = (e) => {
    const val = e.target.value.replace(/[^0-9-]/g, '').slice(0, 15);
    setForm(p => ({ ...p, phone: val }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter a supplier name.' }); return; }
    if (!form.contact.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter a contact person.' }); return; }
    if (existingSuppliers.some(s => s.name.toLowerCase() === form.name.trim().toLowerCase())) {
      setInfoModal({ title: 'Duplicate Supplier', message: `"${form.name.trim()}" already exists.` }); return;
    }
    onAdd({ ...form, name: form.name.trim(), contact: form.contact.trim(), address: form.address.trim() });
    onClose();
  };

  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add New Supplier</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Supplier Name <span className="required">*</span></label>
            <input type="text" className="form-input" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value.slice(0, 80) }))}
              placeholder="e.g., SanRoque Trading" autoFocus maxLength={80} />
          </div>
          <div className="form-group">
            <label className="form-label">Contact Person <span className="required">*</span></label>
            <input type="text" className="form-input" value={form.contact}
              onChange={e => setForm(p => ({ ...p, contact: e.target.value.slice(0, 60) }))}
              placeholder="e.g., Juan Dela Cruz" maxLength={60} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value.slice(0, 100) }))}
              placeholder="e.g., supplier@email.com" maxLength={100} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input type="text" className="form-input" value={form.phone}
                onChange={handlePhoneChange}
                placeholder="09xx-xxx-xxxx" maxLength={15} inputMode="tel" />
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input type="text" className="form-input" value={form.address}
                onChange={e => setForm(p => ({ ...p, address: e.target.value.slice(0, 100) }))}
                placeholder="e.g., Marikina City" maxLength={100} />
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSubmit}>Add Supplier</button>
        </div>
      </div>
      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title||''} message={infoModal?.message||''} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WIZARD-STYLE INVENTORY MODAL - 3 STEPS
// ══════════════════════════════════════════════════════════════════════════════
// Step 1: General Info (Select Product from Masterlist)
// Step 2: Stock Entry (all variants shown, enter qty)
// Step 3: Invoice Details (supplier, invoice #, cost, receipt)
// 
// Navigation: Free to navigate between steps
// Validation: Only when clicking Save Item
// Step Indicator: Shows checkmark when step requirements are met
// ══════════════════════════════════════════════════════════════════════════════

export default function AddInventoryItemModal({
  isOpen,
  onClose,
  onSave,
  item,
  categories,
  inventory,
  suppliers,
  onAddSupplier,
  masterlist
}) {
  // ── EDIT mode state ──────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({ minStockLevel: 10 });

  // ── ADD mode step (1=select product, 2=stock entry, 3=invoice) ───────────────
  const [step, setStep] = useState(1);

  // Step 1
  const [search, setSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Step 2 - Stock Entry (per product)
  const [stockRowsByProduct, setStockRowsByProduct] = useState({});
  const [applyAllCost, setApplyAllCost] = useState('');
  const [applyAllMinStock, setApplyAllMinStock] = useState('10');

  // Step 3 - Invoice
  const [invoice, setInvoice] = useState({
    supplierId: 'unspecified', supplierName: 'General Merchandise',
    invoiceNumber: '', deliveryDate: new Date().toISOString().split('T')[0],
    notes: '', receiptImage: null, costMode: 'unit',
    totalInvoiceAmount: '',
  });

  // Per-product cost mode and total amount
  const [productCostModes, setProductCostModes] = useState({}); // { prodId: 'unit' | 'total' }
  const [productTotalAmounts, setProductTotalAmounts] = useState({}); // { prodId: '1000.00' }

  const [infoModal, setInfoModal] = useState(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  // ── Reset on open ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    if (item) {
      setEditForm({ minStockLevel: item.minStockLevel ?? 10 });
    } else {
      setStep(1);
      setSearch('');
      setSelectedProducts([]);
      setStockRowsByProduct({});
      setApplyAllCost('');
      setExpandedCategories(new Set(masterlist.map(c => c.name))); // Expand all by default
      setInvoice({ supplierId: 'unspecified', supplierName: 'General Merchandise', invoiceNumber: '', deliveryDate: new Date().toISOString().split('T')[0], notes: '', receiptImage: null, costMode: 'unit', totalInvoiceAmount: '' });
      setProductCostModes({});
      setProductTotalAmounts({});
    }
  }, [isOpen, item, masterlist]);

  // ── Expanded categories state ───────────────────────────────────────────────
  const [expandedCategories, setExpandedCategories] = useState(new Set());

  // ── Masterlist entries ───────────────────────────────────────────────────────
  const mlEntries = useMemo(() => {
    const existing = inventory.filter(i => i.isActive !== false).map(i => `${(i.name || '').toLowerCase()}||${(i.category || '').toLowerCase()}`);
    const entries = [];
    (masterlist || []).forEach(cat => {
      (cat.products || []).forEach(prod => {
        entries.push({ catId: cat.id, catName: cat.name, prodId: prod.id, prodName: prod.name, variantTypes: prod.variantTypes || [] });
      });
    });
    return entries;
  }, [masterlist, inventory]);

  const filteredML = useMemo(() => {
    if (!search.trim()) return mlEntries;
    const q = search.toLowerCase();
    return mlEntries.filter(e => e.prodName.toLowerCase().includes(q) || e.catName.toLowerCase().includes(q));
  }, [mlEntries, search]);

  // ── Group by category ────────────────────────────────────────────────────────
  const groupedByCategory = useMemo(() => {
    const groups = {};
    filteredML.forEach(e => {
      if (!groups[e.catName]) {
        groups[e.catName] = { catName: e.catName, products: [] };
      }
      groups[e.catName].products.push(e);
    });
    return Object.values(groups);
  }, [filteredML]);

  const toggleCategory = (catName) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catName)) {
        next.delete(catName);
      } else {
        next.add(catName);
      }
      return next;
    });
  };

  // ── SKU generation ───────────────────────────────────────────────────────────
  const buildPrefixMap = (options) => {
    const raw = options.map(o => o.replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase() || 'VAR');
    const countMap = {};
    raw.forEach(p => { countMap[p] = (countMap[p] || 0) + 1; });
    const seenMap = {};
    return options.reduce((acc, opt, i) => {
      const p = raw[i];
      if (countMap[p] > 1) {
        seenMap[p] = (seenMap[p] || 0) + 1;
        acc[opt] = `${p}${seenMap[p]}`;
      } else {
        acc[opt] = p;
      }
      return acc;
    }, {});
  };

  const genComboSKU = (catName, prodName, comboMap, allOptionsPerType) => {
    const catP = catName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'ITM';
    const prodP = prodName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'XXX';
    
    // If no variant types, generate simple SKU with year and sequence
    if (!comboMap || Object.keys(comboMap).length === 0) {
      const year = new Date().getFullYear();
      const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return `${catP}-${prodP}-${year}-${seq}`;
    }
    
    const varParts = Object.entries(comboMap).map(([typeName, optVal]) => {
      const allOpts = allOptionsPerType[typeName] || [optVal];
      const prefixMap = buildPrefixMap(allOpts);
      return prefixMap[optVal] || optVal.substring(0, 3).toUpperCase();
    });
    return `${catP}-${prodP}-${varParts.join('-')}`;
  };

  // ── Generate all stock rows from product ─────────────────────────────────────
  const generateRows = (ml) => {
    if (!ml) return [];
    if (!ml.variantTypes || ml.variantTypes.length === 0) {
      // No variant types - generate simple SKU
      const catP = ml.catName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'ITM';
      const prodP = ml.prodName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'XXX';
      const year = new Date().getFullYear();
      const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const sku = `${catP}-${prodP}-${year}-${seq}`;
      
      return [{ 
        comboKey: '__base__', 
        comboLabel: ml.prodName, 
        comboMap: {}, 
        sku,  // Generate SKU for products without variants
        qty: '', 
        damaged: '', 
        unitCost: '', 
        minStockLevel: '10' 
      }];
    }
    // All variant types are tracked now (no isTracked filter)
    const tracked = ml.variantTypes;
    if (tracked.length === 0) {
      return [{ comboKey: '__base__', comboLabel: ml.prodName, comboMap: {}, qty: '', damaged: '', unitCost: '', minStockLevel: '10' }];
    }
    const selectedPerType = {};
    tracked.forEach(vt => {
      selectedPerType[vt.name] = vt.options;
    });

    const cross = (types) => {
      if (types.length === 0) return [{}];
      const [first, ...rest] = types;
      const opts = selectedPerType[first.name] || [];
      if (opts.length === 0) return cross(rest);
      return opts.flatMap(o => cross(rest).map(r => ({ [first.name]: o, ...r })));
    };
    const combos = cross(tracked);
    const allOptionsPerType = {};
    tracked.forEach(vt => { allOptionsPerType[vt.name] = vt.options; });

    return combos.map(combo => {
      const label = Object.values(combo).join(' / ');
      const key = Object.entries(combo).map(([k, v]) => `${k}:${v}`).join('|');
      const sku = genComboSKU(ml.catName, ml.prodName, combo, allOptionsPerType);
      return { comboKey: key, comboLabel: label, comboMap: combo, sku, qty: '', damaged: '', unitCost: '', minStockLevel: '10' };
    });
  };

  // ── Derived totals (computed from all products) ─────────────────────────────
  const totalReceived = selectedProducts.reduce((sum, p) => {
    const rows = stockRowsByProduct[p.prodId] || [];
    return sum + rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  }, 0);
  
  const totalDamaged = selectedProducts.reduce((sum, p) => {
    const rows = stockRowsByProduct[p.prodId] || [];
    return sum + rows.reduce((s, r) => s + (parseInt(r.damaged) || 0), 0);
  }, 0);
  
  const totalGood = totalReceived - totalDamaged;

  const totalInvoiceValue = useMemo(() => {
    if (invoice.costMode === 'total') {
      return parseFloat(invoice.totalInvoiceAmount.replace(/,/g, '')) || 0;
    }
    // Sum of per-product subtotals (each product can be unit or total mode)
    return selectedProducts.reduce((sum, p) => {
      const rows = stockRowsByProduct[p.prodId] || [];
      const rowsWithQty = rows.filter(r => (parseInt(r.qty) || 0) > 0);
      if (rowsWithQty.length === 0) return sum;
      
      const productCostMode = productCostModes[p.prodId] || 'unit';
      const productTotalAmt = productTotalAmounts[p.prodId] || '';
      
      if (productCostMode === 'total' && productTotalAmt) {
        return sum + (parseFloat(productTotalAmt.replace(/,/g, '')) || 0);
      }
      
      // Unit mode: sum of qty × unitCost
      return sum + rowsWithQty.reduce((s, r) => {
        const qty = parseInt(r.qty) || 0;
        return s + qty * (parseFloat(r.unitCost) || 0);
      }, 0);
    }, 0);
  }, [invoice.costMode, invoice.totalInvoiceAmount, selectedProducts, stockRowsByProduct, productCostModes, productTotalAmounts]);

  // Compute effective and damaged values for footer breakdown
  // Effective = good qty × unit cost (what goes into inventory)
  const effectiveValue = useMemo(() => {
    if (invoice.costMode === 'total') {
      const totalAmt = parseFloat(invoice.totalInvoiceAmount.replace(/,/g, '')) || 0;
      const unitCost = totalReceived > 0 ? totalAmt / totalReceived : 0;
      return totalGood * unitCost;
    }
    // For unit cost mode, sum up effective value per variant across all products
    return selectedProducts.reduce((sum, p) => {
      const rows = stockRowsByProduct[p.prodId] || [];
      return sum + rows.reduce((s, r) => {
        const good = Math.max(0, (parseInt(r.qty) || 0) - (parseInt(r.damaged) || 0));
        return s + good * (parseFloat(r.unitCost) || 0);
      }, 0);
    }, 0);
  }, [invoice.costMode, invoice.totalInvoiceAmount, totalReceived, totalGood, selectedProducts, stockRowsByProduct]);

  // Damaged = damaged qty × unit cost (loss)
  const damagedValue = useMemo(() => {
    if (invoice.costMode === 'total') {
      const totalAmt = parseFloat(invoice.totalInvoiceAmount.replace(/,/g, '')) || 0;
      const unitCost = totalReceived > 0 ? totalAmt / totalReceived : 0;
      return totalDamaged * unitCost;
    }
    // For unit cost mode, sum up damaged value per variant across all products
    return selectedProducts.reduce((sum, p) => {
      const rows = stockRowsByProduct[p.prodId] || [];
      return sum + rows.reduce((s, r) => {
        const damaged = parseInt(r.damaged) || 0;
        return s + damaged * (parseFloat(r.unitCost) || 0);
      }, 0);
    }, 0);
  }, [invoice.costMode, invoice.totalInvoiceAmount, totalReceived, totalDamaged, selectedProducts, stockRowsByProduct]);

  // Build damaged breakdown string (e.g., "2×35.00=70.00  2×40.00=80.00")
  const damagedBreakdown = useMemo(() => {
    if (totalDamaged <= 0) return '';
    // In total mode, use computed unit cost; in unit mode, use per-variant costs
    const totalAmt = parseFloat(invoice.totalInvoiceAmount.replace(/,/g, '')) || 0;
    const cost = invoice.costMode === 'total' && totalReceived > 0 ? (totalAmt / totalReceived) : null;
    
    const parts = selectedProducts.flatMap(p => {
      const rows = stockRowsByProduct[p.prodId] || [];
      return rows
        .filter(r => (parseInt(r.damaged) || 0) > 0)
        .map(r => {
          const d = parseInt(r.damaged) || 0;
          const c = cost !== null ? cost : (parseFloat(r.unitCost) || 0);
          return `${d}×${formatPrice(c)}=${formatPrice(d * c)}`;
        });
    });
    return parts.join('  ');
  }, [selectedProducts, stockRowsByProduct, totalDamaged, totalReceived, invoice.costMode, invoice.totalInvoiceAmount]);

  // ── Validation for step indicator (visual only) ──────────────────────────────
  const step1Valid = selectedProducts.length > 0;

  const step2Valid = () => {
    if (selectedProducts.length === 0) return false;
    // Check if at least one product has rows with qty > 0
    return selectedProducts.some(p => {
      const rows = stockRowsByProduct[p.prodId] || [];
      return rows.some(r => (parseInt(r.qty) || 0) > 0);
    });
  };

  const step3Valid = () => {
    const hasInvoice = invoice.invoiceNumber.trim() && invoice.deliveryDate;
    if (!hasInvoice) return false;
    
    // Check cost for all products
    const allProductsHaveCost = selectedProducts.every(p => {
      const rows = stockRowsByProduct[p.prodId] || [];
      const rowsWithQty = rows.filter(r => (parseInt(r.qty) || 0) > 0);
      if (rowsWithQty.length === 0) return true; // Skip products without qty
      
      const productCostMode = productCostModes[p.prodId] || 'unit';
      const productTotalAmt = productTotalAmounts[p.prodId] || '';
      
      if (productCostMode === 'total') {
        return (parseFloat(productTotalAmt.replace(/,/g, '')) || 0) > 0;
      }
      // Unit mode: at least one variant must have cost
      return rowsWithQty.some(r => (parseFloat(r.unitCost) || 0) > 0);
    });
    
    return hasInvoice && allProductsHaveCost;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!step1Valid) {
      setInfoModal({ title: 'Validation Error', message: 'Please select at least one product from the masterlist.' });
      return;
    }
    if (!step2Valid()) {
      setInfoModal({ title: 'Validation Error', message: 'Please enter quantity for at least one variant.' });
      return;
    }
    if (!step3Valid()) {
      setInfoModal({ title: 'Validation Error', message: 'Please complete all required invoice fields (invoice number, delivery date, and cost).' });
      return;
    }

    // Build items array from all selected products
    const allItems = selectedProducts.flatMap(product => {
      const rows = stockRowsByProduct[product.prodId] || [];
      const rowsWithQty = rows.filter(r => (parseInt(r.qty) || 0) > 0);

      // Get product-level cost mode
      const productCostMode = productCostModes[product.prodId] || 'unit';
      const productTotalAmt = productTotalAmounts[product.prodId] || '';
      
      // Compute product-level unit cost for total mode
      let productUnitCost = 0;
      if (productCostMode === 'total' && productTotalAmt) {
        const productTotalQty = rowsWithQty.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
        const totalAmt = parseFloat(productTotalAmt.replace(/,/g, '')) || 0;
        productUnitCost = productTotalQty > 0 ? totalAmt / productTotalQty : 0;
      }

      return rowsWithQty.map(row => {
        const qty = parseInt(row.qty) || 0;
        const dmg = parseInt(row.damaged) || 0;
        const good = qty - dmg;

        // Compute unit cost based on product mode
        const unitCost = productCostMode === 'total' ? productUnitCost : (parseFloat(row.unitCost) || 0);

        const d = new Date(invoice.deliveryDate);
        const batchId = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
        const itemName = row.comboMap && Object.keys(row.comboMap).length > 0
          ? `${product.prodName} ${row.comboLabel}`
          : product.prodName;
        const sku = row.sku || genComboSKU(product.catName, product.prodName, row.comboMap, {});

        const batch = {
          batchId,
          supplierId: invoice.supplierId === 'unspecified' ? null : invoice.supplierId,
          supplierName: invoice.supplierName,
          invoiceNumber: invoice.invoiceNumber,
          dateReceived: invoice.deliveryDate,
          originalQty: qty, goodQty: good, damagedQty: dmg,
          remainingQty: good, unitCost, totalCost: good * unitCost,
          notes: invoice.notes || '',
          receiptImage: invoice.receiptImage || null,
          movements: [{ type: 'received', quantity: good, remainingAfter: good, reason: 'Initial stock addition', createdAt: new Date().toISOString() }],
          status: 'active',
        };

        return {
          id: crypto.randomUUID(), sku,
          name: itemName.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
          masterlistProductName: product.prodName,
          category: product.catName,
          variantCombo: row.comboMap,
          stockQty: good, damagedQty: dmg, minStockLevel: parseInt(row.minStockLevel) || 10,
          averageCost: unitCost, lastUnitCost: unitCost,
          lastSupplierId: batch.supplierId, lastSupplierName: invoice.supplierName,
          batches: [batch], isActive: true,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
      });
    });

    onSave(allItems);
  };

  if (!isOpen) return null;

  // ── EDIT MODE ────────────────────────────────────────────────────────────────
  if (item) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', width: '90%' }}>
          <div className="modal-header">
            <div>
              <h2 className="modal-title">Edit Inventory Item</h2>
              <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.2rem', fontFamily: 'monospace' }}>SKU: {item.sku || '—'}</div>
            </div>
            <button className="modal-close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="modal-body">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Product Name <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginLeft: '0.4rem' }}>Locked</span></label>
                <input type="text" className="form-input" value={item.name} readOnly style={{ opacity: 0.55, cursor: 'not-allowed' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Category</label>
                <input type="text" className="form-input" value={item.category} readOnly style={{ opacity: 0.55, cursor: 'not-allowed' }} />
              </div>
            </div>
            {item.variantCombo && Object.keys(item.variantCombo).length > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {Object.entries(item.variantCombo).map(([k, v]) => (
                  <span key={k} style={{ fontSize: '0.72rem', color: 'var(--gold)', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{k}: {v}</span>
                ))}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Min. Stock Level</label>
              <IntegerInput className="form-input" value={editForm.minStockLevel}
                onChange={e => setEditForm(p => ({ ...p, minStockLevel: e.target.value }))} min={0} placeholder="10" />
              <p className="form-hint">Low stock alert triggers below this number.</p>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => {
              onSave([{ ...item, minStockLevel: parseInt(editForm.minStockLevel) || 10, updatedAt: new Date().toISOString() }]);
              onClose();
            }}>Update Item</button>
          </div>
        </div>
        <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title || ''} message={infoModal?.message || ''} />
      </div>
    );
  }

  // ── ADD MODE ─────────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay">
      {/* Mobile responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .step-2-grid, .step-3-grid {
            grid-template-columns: 1fr !important;
          }
          .step-panel-left, .step-panel-right {
            padding: 1rem !important;
          }
        }
      `}</style>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '1100px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, background: '#0E0E0E', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{ padding: '1.5rem 2rem', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#131313' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.62rem', color: '#D4A843', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.35rem', fontWeight: 600 }}>Inventory Management</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E5E2E1', margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Add New Inventory Item</h2>
              {selectedProducts.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  Selected: <span style={{ color: '#D4A843', fontWeight: 600 }}>{selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', color: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444'; }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative', paddingLeft: '2rem', paddingRight: '2rem' }}>
            <div style={{ position: 'absolute', top: '14px', left: 'calc(16.67%)', width: 'calc(33.33%)', height: '2px', background: 'rgba(255,255,255,0.08)', zIndex: 0, borderRadius: '2px', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(16.67%)', width: step1Valid ? 'calc(33.33%)' : '0%', height: '2px', background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)', zIndex: 1, borderRadius: '2px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: step1Valid ? '0 0 12px rgba(212,168,67,0.4)' : 'none', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(50%)', width: 'calc(33.33%)', height: '2px', background: 'rgba(255,255,255,0.08)', zIndex: 0, borderRadius: '2px', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(50%)', width: step2Valid() ? 'calc(33.33%)' : '0%', height: '2px', background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)', zIndex: 1, borderRadius: '2px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: step2Valid() ? '0 0 12px rgba(212,168,67,0.4)' : 'none', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(83.33%)', width: 'calc(33.33%)', height: '2px', background: 'rgba(255,255,255,0.08)', zIndex: 0, borderRadius: '2px', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(83.33%)', width: step3Valid() ? 'calc(33.33%)' : '0%', height: '2px', background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)', zIndex: 1, borderRadius: '2px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: step3Valid() ? '0 0 12px rgba(212,168,67,0.4)' : 'none', transform: 'translateX(-50%)' }} />


            {[
              { num: 1, label: 'General Info' },
              { num: 2, label: 'Stock Entry' },
              { num: 3, label: 'Invoice' },
            ].map((s) => {
              const isComplete = s.num === 1 ? step1Valid : s.num === 2 ? step2Valid() : step3Valid();
              const isCurrent = step === s.num;
              return (
                <div key={s.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', flex: 1, position: 'relative', zIndex: 2 }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isComplete ? 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)' : isCurrent ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
                    color: isComplete ? '#000' : isCurrent ? '#D4A843' : 'var(--gray)',
                    border: isCurrent ? '2px solid #D4A843' : '2px solid transparent',
                    transition: 'all 0.3s ease',
                    boxShadow: isCurrent ? '0 0 16px rgba(212,168,67,0.4)' : 'none',
                    transform: isCurrent ? 'scale(1.08)' : 'scale(1)',
                  }}>
                    {isComplete
                      ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )
                      : <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{s.num}</span>
                    }
                  </div>
                  <span style={{ fontSize: '0.6rem', letterSpacing: '0.12em', fontWeight: 600, color: isComplete || isCurrent ? '#D4A843' : 'var(--gray)', textTransform: 'uppercase', fontFamily: 'Manrope, sans-serif' }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STEP 1: Select Product ─────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search categories or products..."
                style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Selected products summary */}
            {selectedProducts.length > 0 && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize: '0.75rem', color: '#D4A843', fontWeight: 600 }}>
                    {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <button
                  onClick={() => { setSelectedProducts([]); setStockRowsByProduct({}); }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '4px' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                >
                  Clear All
                </button>
              </div>
            )}

            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              {groupedByCategory.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>
                  {mlEntries.length === 0 ? 'Masterlist is empty. Add products in Item Masterlist first.' : `No results for "${search}"`}
                </div>
              ) : groupedByCategory.map((group, catIdx) => {
                const isExpanded = expandedCategories.has(group.catName);
                return (
                  <div key={group.catName}>
                    {/* Category Header */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(group.catName)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.875rem 1rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer', textAlign: 'left',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none', color: 'var(--gray)' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' }}>{group.catName}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '0.1rem' }}>
                            {group.products.length} product{group.products.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Products under this category */}
                    {isExpanded && group.products.map((e, idx) => {
                      const isSelected = selectedProducts.some(p => p.prodId === e.prodId && p.catId === e.catId);
                      return (
                        <button key={`${e.catId}-${e.prodId}`} type="button"
                          onClick={() => {
                            const exists = selectedProducts.findIndex(p => p.prodId === e.prodId && p.catId === e.catId);
                            if (exists >= 0) {
                              // Deselect - remove from array
                              const newSelected = selectedProducts.filter((_, i) => i !== exists);
                              setSelectedProducts(newSelected);
                              const newRows = { ...stockRowsByProduct };
                              delete newRows[e.prodId];
                              setStockRowsByProduct(newRows);
                            } else {
                              // Select - add to array
                              setSelectedProducts([...selectedProducts, e]);
                              setStockRowsByProduct({
                                ...stockRowsByProduct,
                                [e.prodId]: generateRows(e)
                              });
                            }
                          }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.75rem 1rem 0.75rem 2.5rem',
                            background: isSelected ? 'rgba(212,168,67,0.12)' : idx % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'transparent',
                            border: 'none', borderBottom: idx < group.products.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                            cursor: 'pointer', textAlign: 'left',
                          }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: isSelected ? '#D4A843' : 'var(--white)', fontSize: '0.85rem' }}>{e.prodName}</div>
                            {e.variantTypes.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.35rem' }}>
                                {e.variantTypes.map((vt, i) => (
                                  <span key={i} style={{ fontSize: '0.6rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                                    {vt.name}: {vt.options.slice(0, 3).join(', ')}{vt.options.length > 3 ? '...' : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {isSelected ? (
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#D4A843', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          ) : (
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0, marginLeft: '0.5rem' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {selectedProducts.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '0.875rem', textAlign: 'center' }}>
                Select one or more products above to begin. All variant combinations will be shown automatically.
              </p>
            )}
          </div>
        )}

        {/* ── STEP 2: Stock Entry ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="step-2-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>

            {/* LEFT — Stock Entry Table */}
            <div className="step-panel-left" style={{ padding: '1.5rem 2rem', overflowY: 'auto', background: '#0E0E0E' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Step 2: Stock Entry</div>
                  <div style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 600 }}>{selectedProducts.length} Product{selectedProducts.length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              {/* Multiple tables - one per product */}
              {selectedProducts.map((product, pIdx) => {
                const rows = stockRowsByProduct[product.prodId] || [];
                const totalProductQty = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
                const totalProductDamaged = rows.reduce((s, r) => s + (parseInt(r.damaged) || 0), 0);
                
                return (
                  <div key={product.prodId} style={{ marginBottom: pIdx < selectedProducts.length - 1 ? '2rem' : '1.25rem' }}>
                    {/* Product Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                          <path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{product.catName} / {product.prodName}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{rows.length} Variant{rows.length !== 1 ? 's' : ''} {totalProductQty > 0 && `• ${totalProductQty} pcs`}</div>
                      </div>
                    </div>

                    {/* Variant Table for this product */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '1rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Variant Name</th>
                            <th style={{ padding: '0.875rem 0.75rem', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '120px' }}>Min Stock Level</th>
                            <th style={{ padding: '0.875rem 0.75rem', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '140px' }}>Qty Received</th>
                            <th style={{ padding: '0.875rem 0.75rem', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '120px' }}>Damaged</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => {
                            const q = parseInt(row.qty) || 0;
                            const d = parseInt(row.damaged) || 0;
                            const existingItem = inventory.find(i => i.sku === row.sku);
                            const hasExistingMinStock = existingItem?.minStockLevel;

                            return (
                              <tr key={row.comboKey} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '1rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div>
                                      <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{row.comboLabel || product.prodName}</div>
                                      <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>SKU: {row.sku || '—'}</div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                                  {hasExistingMinStock ? (
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray)' }}>
                                      {existingItem.minStockLevel}
                                    </span>
                                  ) : (
                                    <IntegerInput
                                      value={row.minStockLevel}
                                      onChange={e => {
                                        const newRows = [...rows];
                                        newRows[idx] = { ...row, minStockLevel: e.target.value };
                                        setStockRowsByProduct({ ...stockRowsByProduct, [product.prodId]: newRows });
                                      }}
                                      min={1} max={9999} placeholder="10"
                                      className="form-input"
                                      style={{
                                        textAlign: 'center',
                                        width: '80px',
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        color: '#E5E2E1',
                                        fontWeight: 600,
                                        padding: '0.5rem'
                                      }}
                                    />
                                  )}
                                </td>
                                <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                                  <IntegerInput className="form-input" value={row.qty}
                                    onChange={e => {
                                      const newRows = [...rows];
                                      newRows[idx] = { ...row, qty: e.target.value };
                                      setStockRowsByProduct({ ...stockRowsByProduct, [product.prodId]: newRows });
                                    }}
                                    min={0} max={99999} placeholder="0" style={{ textAlign: 'center', width: '80px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: q > 0 ? '#D4A843' : 'var(--gray)', fontWeight: 700, padding: '0.5rem' }} />
                                </td>
                                <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                                  <IntegerInput className="form-input" value={row.damaged}
                                    onChange={e => {
                                      const newRows = [...rows];
                                      newRows[idx] = { ...row, damaged: e.target.value };
                                      setStockRowsByProduct({ ...stockRowsByProduct, [product.prodId]: newRows });
                                    }}
                                    min={0} max={99999} placeholder="0" qtyValue={row.qty}
                                    style={{ textAlign: 'center', width: '80px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: d > 0 ? '#F87171' : 'var(--gray)', fontWeight: 600, padding: '0.5rem' }} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>Total Effective Qty</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#E5E2E1', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{totalGood} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span></div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>Stock Wastage - Damaged Upon Arrival</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F87171', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{totalDamaged} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span></div>
                </div>
              </div>
            </div>

            {/* RIGHT — Invoice Details Preview */}
            <div className="step-panel-right" style={{ padding: '1.5rem 2rem', background: '#131313', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Invoice Preview</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>Go to Step 3 to fill details</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.5, pointerEvents: 'none' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Supplier</label>
                  <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.625rem 0.75rem', color: 'var(--gray)', fontSize: '0.85rem' }}>Select in Step 3</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Invoice Number</label>
                    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.625rem 0.75rem', color: 'var(--gray)', fontSize: '0.85rem' }}>Required</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Delivery Date</label>
                    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.625rem 0.75rem', color: 'var(--gray)', fontSize: '0.85rem' }}>Required</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2" style={{ margin: '0 auto 0.5rem' }}>
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4M12 8h.01"/>
                </svg>
                <div style={{ fontSize: '0.75rem', color: '#D4A843', fontWeight: 600 }}>
                  Navigate to Step 3 to complete invoice details
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Invoice Details ───────────────────────────────────── */}
        {step === 3 && (
          <div className="step-3-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>

            {/* LEFT — Stock Summary (read-only preview) */}
            <div className="step-panel-left" style={{ padding: '1.5rem 2rem', overflowY: 'auto', background: '#0E0E0E' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Stock Summary</div>
                  <div style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 600 }}>{selectedProducts.length} Product{selectedProducts.length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              {/* Multiple stock summaries - one per product */}
              {selectedProducts.map((product, pIdx) => {
                const rows = stockRowsByProduct[product.prodId] || [];
                const rowsWithQty = rows.filter(r => (parseInt(r.qty) || 0) > 0);
                const productTotalQty = rowsWithQty.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
                const productTotalDamaged = rowsWithQty.reduce((s, r) => s + (parseInt(r.damaged) || 0), 0);
                const productTotalGood = productTotalQty - productTotalDamaged;
                
                if (rowsWithQty.length === 0) return null;
                
                return (
                  <div key={product.prodId} style={{ marginBottom: pIdx < selectedProducts.length - 1 ? '1.5rem' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                          <path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{product.catName} / {product.prodName}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--gray)' }}>{rowsWithQty.length} variant{rowsWithQty.length !== 1 ? 's' : ''} with qty</div>
                      </div>
                    </div>

                    {/* Read-only table for this product */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '0.75rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th style={{ padding: '0.625rem 0.75rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Variant</th>
                            <th style={{ padding: '0.625rem 0.5rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '60px' }}>Qty</th>
                            <th style={{ padding: '0.625rem 0.5rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '60px' }}>Dmg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowsWithQty.map((row, idx) => {
                            const q = parseInt(row.qty) || 0;
                            const d = parseInt(row.damaged) || 0;
                            return (
                              <tr key={row.comboKey} style={{ borderBottom: idx < rowsWithQty.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                                <td style={{ padding: '0.625rem 0.75rem' }}>
                                  <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.75rem' }}>{row.comboLabel || product.prodName}</div>
                                  <div style={{ fontSize: '0.55rem', color: 'var(--gray)', fontFamily: 'monospace' }}>SKU: {row.sku || '—'}</div>
                                </td>
                                <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center', color: '#D4A843', fontWeight: 700 }}>{q}</td>
                                <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center', color: d > 0 ? '#F87171' : 'var(--gray)', fontWeight: 600 }}>{d}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Product summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase' }}>Good</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4ade80' }}>{productTotalGood} <span style={{ fontSize: '0.6rem' }}>pcs</span></div>
                      </div>
                      <div style={{ padding: '0.5rem', background: 'rgba(248,113,113,0.06)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase' }}>Damaged</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#F87171' }}>{productTotalDamaged} <span style={{ fontSize: '0.6rem' }}>pcs</span></div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Overall Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>Total Effective Qty</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#E5E2E1', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{totalGood} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span></div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>Damaged</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F87171', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{totalDamaged} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span></div>
                </div>
              </div>
            </div>

            {/* RIGHT — Invoice Details (editable) */}
            <div className="step-panel-right" style={{ padding: '1.5rem 2rem', background: '#131313', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Step 3: Invoice Details</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Supplier Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Supplier</label>
                  <SupplierCombobox value={invoice.supplierId} supplierName={invoice.supplierName}
                    onChange={(id, name) => setInvoice(p => ({ ...p, supplierId: id, supplierName: name }))}
                    suppliers={suppliers} itemCategory="" onAddNew={() => setShowAddSupplier(true)} />
                </div>

                {/* Invoice Number & Delivery Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Invoice / OR Number</label>
                    <input type="text" className="form-input" value={invoice.invoiceNumber}
                      onChange={e => setInvoice(p => ({ ...p, invoiceNumber: e.target.value.slice(0, 50) }))}
                      placeholder="INV-2024-001" maxLength={50}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', padding: '0.625rem 0.75rem', width: '100%', fontSize: '0.85rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Delivery Date</label>
                    <input type="date" className="form-input" value={invoice.deliveryDate}
                      onChange={e => setInvoice(p => ({ ...p, deliveryDate: e.target.value }))}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', padding: '0.625rem 0.75rem', width: '100%', fontSize: '0.85rem' }} />
                  </div>
                </div>

                {/* Cost Input Mode Toggle - Global */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#D4A843', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost Input Mode</span>
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '3px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {[['unit', 'Unit Cost'], ['total', 'Total Amount']].map(([val, label]) => (
                        <button key={val} type="button" onClick={() => setInvoice(p => ({ ...p, costMode: val }))}
                          style={{
                            padding: '0.4rem 0.85rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer',
                            background: invoice.costMode === val ? '#D4A843' : 'transparent',
                            color: invoice.costMode === val ? '#000' : 'var(--gray)',
                            transition: 'all 0.15s',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Global Total Amount Input (when mode is 'total') */}
                  {invoice.costMode === 'total' && (
                    <div style={{ padding: '1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '10px', marginBottom: '1.5rem' }}>
                      <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem', fontWeight: 700, letterSpacing: '0.08em' }}>Total Invoice Amount</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.5rem', color: '#D4A843', fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>₱</span>
                        <CommaNumberInput value={invoice.totalInvoiceAmount}
                          onChange={e => setInvoice(p => ({ ...p, totalInvoiceAmount: e.target.value }))}
                          placeholder="0.00"
                          style={{ fontSize: '1.5rem', fontWeight: 800, color: '#E5E2E1', flex: 1, fontFamily: 'Plus Jakarta Sans, sans-serif' }} />
                      </div>
                      {totalReceived > 0 && (parseFloat(invoice.totalInvoiceAmount.replace(/,/g, '')) || 0) > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                          Auto-computed Unit Cost: <strong style={{ color: '#D4A843' }}>{formatPrice((parseFloat(invoice.totalInvoiceAmount.replace(/,/g, '')) || 0) / totalReceived)}</strong> each
                        </div>
                      )}
                    </div>
                  )}

                  {/* Per-product cost inputs (when mode is 'unit') */}
                  {invoice.costMode === 'unit' && (
                    <div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.06)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.9rem', color: '#D4A843', fontWeight: 700 }}>₱</span>
                          <DecimalInput value={applyAllCost} onChange={e => setApplyAllCost(e.target.value)} placeholder="0.00" max={999999.99} style={{ flex: 1, background: 'none', border: 'none', color: 'var(--white)', fontSize: '0.9rem', outline: 'none' }} />
                        </div>
                        <button type="button" onClick={() => {
                          // Apply to all variants across all products
                          const newRowsByProduct = {};
                          Object.keys(stockRowsByProduct).forEach(prodId => {
                            newRowsByProduct[prodId] = stockRowsByProduct[prodId].map(r => ({ ...r, unitCost: applyAllCost }));
                          });
                          setStockRowsByProduct(newRowsByProduct);
                        }} style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', color: '#D4A843', borderRadius: '8px', padding: '0 0.85rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Apply to all
                        </button>
                      </div>
                      
                      {/* Multiple Invoice Tables - one per product */}
                      {selectedProducts.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {selectedProducts.map(product => {
                            const rows = stockRowsByProduct[product.prodId] || [];
                            const rowsWithQty = rows.filter(r => (parseInt(r.qty) || 0) > 0);
                            if (rowsWithQty.length === 0) return null;
                            
                            const productCostMode = productCostModes[product.prodId] || 'unit';
                            const productTotalAmt = productTotalAmounts[product.prodId] || '';
                            const productTotalQty = rowsWithQty.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
                            const productSubtotal = rowsWithQty.reduce((s, r) => {
                              const qty = parseInt(r.qty) || 0;
                              return s + qty * (parseFloat(r.unitCost) || 0);
                            }, 0);
                            const computedProductUnitCost = productTotalQty > 0 && productTotalAmt ? (parseFloat(productTotalAmt.replace(/,/g, '')) || 0) / productTotalQty : 0;
                            
                            return (
                              <div key={product.prodId}>
                                <div style={{ fontSize: '0.65rem', color: '#D4A843', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
                                  {product.catName} / {product.prodName}
                                </div>
                                <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                                  {/* Product-level cost mode toggle */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost Mode</span>
                                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '2px' }}>
                                      {[['unit', 'Unit'], ['total', 'Total']].map(([val, label]) => (
                                        <button key={val} type="button" onClick={() => setProductCostModes(p => ({ ...p, [product.prodId]: val }))}
                                          style={{
                                            padding: '0.25rem 0.5rem', fontSize: '0.6rem', fontWeight: 700, borderRadius: '4px', border: 'none', cursor: 'pointer',
                                            background: productCostMode === val ? '#D4A843' : 'transparent',
                                            color: productCostMode === val ? '#000' : 'var(--gray)',
                                            transition: 'all 0.15s',
                                          }}>
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  
                                  {productCostMode === 'total' ? (
                                    <div style={{ padding: '0.75rem', background: 'rgba(212,168,67,0.05)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Total Amount</label>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '1.1rem', color: '#D4A843', fontWeight: 800 }}>₱</span>
                                        <CommaNumberInput value={productTotalAmt}
                                          onChange={e => setProductTotalAmounts(p => ({ ...p, [product.prodId]: e.target.value }))}
                                          placeholder="0.00"
                                          style={{ fontSize: '1.1rem', fontWeight: 800, color: '#E5E2E1', flex: 1 }} />
                                      </div>
                                      {computedProductUnitCost > 0 && (
                                        <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                          Unit Cost: <strong style={{ color: '#D4A843' }}>{formatPrice(computedProductUnitCost)}</strong>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.06)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#D4A843', fontWeight: 700 }}>₱</span>
                                        <DecimalInput value={applyAllCost} onChange={e => setApplyAllCost(e.target.value)} placeholder="0.00" max={999999.99} style={{ flex: 1, background: 'none', border: 'none', color: 'var(--white)', fontSize: '0.8rem', outline: 'none' }} />
                                      </div>
                                      <button type="button" onClick={() => {
                                        const newRows = rows.map(r => ({ ...r, unitCost: applyAllCost }));
                                        setStockRowsByProduct({ ...stockRowsByProduct, [product.prodId]: newRows });
                                      }} style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', color: '#D4A843', borderRadius: '6px', padding: '0 0.65rem', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        Apply
                                      </button>
                                    </div>
                                  )}
                                  
                                  {/* Variant rows */}
                                  {rowsWithQty.map((row, idx) => {
                                    const qty = parseInt(row.qty) || 0;
                                    const cost = productCostMode === 'total' ? computedProductUnitCost : (parseFloat(row.unitCost) || 0);
                                    const subtotal = qty * cost;
                                    return (
                                      <div key={row.comboKey} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '0.625rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--white)', fontWeight: 500 }}>{row.comboLabel || product.prodName}</span>
                                        {productCostMode === 'unit' ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.06)', padding: '0.35rem 0.5rem', borderRadius: '6px', justifyContent: 'center' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 700 }}>₱</span>
                                            <DecimalInput value={row.unitCost} onChange={e => {
                                              const newRows = rows.map(r => r.comboKey === row.comboKey ? { ...r, unitCost: e.target.value } : r);
                                              setStockRowsByProduct({ ...stockRowsByProduct, [product.prodId]: newRows });
                                            }} placeholder="0.00" max={999999.99} style={{ width: '50px', background: 'none', border: 'none', color: 'var(--white)', fontSize: '0.8rem', textAlign: 'center', outline: 'none' }} />
                                          </div>
                                        ) : (
                                          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#D4A843', fontWeight: 600 }}>
                                            {formatPrice(cost)}
                                          </div>
                                        )}
                                        <span style={{ textAlign: 'center', fontSize: '0.8rem', color: subtotal > 0 ? '#FACC15' : 'var(--gray)', fontWeight: 600 }}>
                                          {subtotal > 0 ? formatPrice(subtotal) : '—'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                          No variants with quantity - go back to Step 2
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Optional Receipt Upload */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Proof of Purchase / Reciept <span style={{ fontWeight: 400, color: 'var(--gray)' }}>(Optional)</span></label>
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1.25rem', border: '2px dashed rgba(255,255,255,0.15)', borderRadius: '10px', background: 'rgba(0,0,0,0.15)', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#D4A843'; e.currentTarget.style.background = 'rgba(212,168,67,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'rgba(0,0,0,0.15)'; }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--gray)' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600 }}>{invoice.receiptImage ? 'Receipt uploaded' : 'Upload Receipt Image'}</span>
                    <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray)' }}>JPG, PNG or PDF up to 5MB</span>
                    <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) { setInfoModal({ title: 'File Too Large', message: 'Receipt must be under 5MB.' }); return; }
                        const reader = new FileReader();
                        reader.onload = ev => setInvoice(p => ({ ...p, receiptImage: ev.target.result }));
                        reader.readAsDataURL(file);
                      }} />
                  </label>
                  {invoice.receiptImage && (
                    <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                      <img src={invoice.receiptImage} alt="Receipt" style={{ maxHeight: '100px', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'block' }} />
                      <button type="button" onClick={() => setInvoice(p => ({ ...p, receiptImage: null }))}
                        style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', color: '#fff', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
                    </div>
                  )}
                </div>

                {/* Receipt Summary - Compare with actual receipt */}
                {selectedProducts.length > 0 && invoice.costMode === 'unit' && (
                  <div style={{ padding: '1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="8 6 5.5 9 3 6"/></svg>
                      <span style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Receipt Summary</span>
                    </div>
                    
                    {/* Per-product breakdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {selectedProducts.map(product => {
                        const rows = stockRowsByProduct[product.prodId] || [];
                        const rowsWithQty = rows.filter(r => (parseInt(r.qty) || 0) > 0);
                        if (rowsWithQty.length === 0) return null;
                        
                        const productCostMode = productCostModes[product.prodId] || 'unit';
                        const productTotalAmt = productTotalAmounts[product.prodId] || '';
                        const productTotalQty = rowsWithQty.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
                        
                        let productSubtotal = 0;
                        let displayUnitCost = null;
                        
                        if (productCostMode === 'total' && productTotalAmt) {
                          const totalAmt = parseFloat(productTotalAmt.replace(/,/g, '')) || 0;
                          productSubtotal = totalAmt;
                          displayUnitCost = productTotalQty > 0 ? totalAmt / productTotalQty : 0;
                        } else {
                          productSubtotal = rowsWithQty.reduce((s, r) => {
                            const qty = parseInt(r.qty) || 0;
                            return s + qty * (parseFloat(r.unitCost) || 0);
                          }, 0);
                          const unitCosts = rowsWithQty.map(r => parseFloat(r.unitCost) || 0);
                          const allSameCost = unitCosts.length > 0 && unitCosts.every(c => c === unitCosts[0]);
                          displayUnitCost = allSameCost ? unitCosts[0] : null;
                        }
                        
                        return (
                          <div key={product.prodId} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.7rem', color: '#E5E2E1', fontWeight: 600, marginBottom: '0.5rem' }}>
                              {product.prodName}
                              {productCostMode === 'total' && productTotalAmt && (
                                <span style={{ fontSize: '0.55rem', color: '#D4A843', marginLeft: '0.5rem', fontWeight: 600 }}>(Total: {formatPrice(productSubtotal)})</span>
                              )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.65rem' }}>
                              <div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase' }}>Total Qty</div>
                                <div style={{ color: '#D4A843', fontWeight: 700 }}>{productTotalQty} <span style={{ fontWeight: 400, color: 'var(--gray)' }}>pcs</span></div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase' }}>Unit Cost</div>
                                <div style={{ color: '#D4A843', fontWeight: 700 }}>
                                  {displayUnitCost !== null
                                    ? formatPrice(displayUnitCost)
                                    : <span style={{ fontSize: '0.6rem', color: 'var(--gray)' }}>Varies</span>
                                  }
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase' }}>Subtotal</div>
                                <div style={{ color: '#facc15', fontWeight: 700 }}>{formatPrice(productSubtotal)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Grand Total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderTop: '1px solid rgba(212,168,67,0.3)', marginTop: '0.75rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase' }}>Total Invoice Amount</span>
                      <span style={{ fontSize: '0.9rem', color: '#facc15', fontWeight: 800 }}>{formatPrice(totalInvoiceValue)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer navigation ───────────────────────────────────────────── */}
        <div style={{ padding: '1rem 2rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#131313' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--white)', borderRadius: '8px', padding: '0.625rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Back
              </button>
            )}
            <button type="button" onClick={onClose}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--gray)', borderRadius: '8px', padding: '0.625rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; }}>
              {step === 3 ? 'Discard' : 'Cancel'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {step === 3 && totalInvoiceValue > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--gray)' }}>Effective: <strong style={{ color: '#FACC15' }}>{formatPrice(effectiveValue)}</strong></span>
                {totalDamaged > 0 && damagedBreakdown && (
                  <span style={{ color: 'var(--gray)' }}>Damaged: <strong style={{ color: '#FACC15' }}>{damagedBreakdown}</strong></span>
                )}
                <span style={{ color: 'var(--gray)' }}>Receipt Total: <strong style={{ color: '#FACC15' }}>{formatPrice(totalInvoiceValue)}</strong></span>
              </div>
            )}
            {step < 3 ? (
              <button type="button"
                disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid())}
                onClick={() => setStep(s => s + 1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: ((step === 1 && !step1Valid) || (step === 2 && !step2Valid())) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)',
                  border: 'none',
                  color: ((step === 1 && !step1Valid) || (step === 2 && !step2Valid())) ? 'var(--gray)' : '#000',
                  borderRadius: '8px',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: ((step === 1 && !step1Valid) || (step === 2 && !step2Valid())) ? 'not-allowed' : 'pointer',
                  boxShadow: ((step === 1 && !step1Valid) || (step === 2 && !step2Valid())) ? 'none' : '0 0 16px rgba(212,168,67,0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => { if (step !== 2 || step2Valid()) { e.currentTarget.style.transform = 'scale(1.02)'; } }}>
                Next
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            ) : (
              <button type="button"
                disabled={!step3Valid()}
                onClick={handleSubmit}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  background: step3Valid() ? 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)' : 'rgba(255,255,255,0.1)', 
                  border: 'none', 
                  color: step3Valid() ? '#000' : 'var(--gray)', 
                  borderRadius: '8px', 
                  padding: '0.625rem 1.25rem', 
                  fontSize: '0.85rem', 
                  fontWeight: 700, 
                  cursor: step3Valid() ? 'pointer' : 'not-allowed', 
                  boxShadow: step3Valid() ? '0 0 16px rgba(212,168,67,0.3)' : 'none', 
                  transition: 'all 0.2s' 
                }}
                onMouseEnter={e => { if (step3Valid()) { e.currentTarget.style.transform = 'scale(1.02)'; } }}>
                Save Item
              </button>
            )}
          </div>
        </div>
      </div>

      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title || ''} message={infoModal?.message || ''} />
      <AddSupplierQuickModal isOpen={showAddSupplier} onClose={() => setShowAddSupplier(false)}
        onAdd={(data) => { const s = onAddSupplier(data); setInvoice(p => ({ ...p, supplierId: s.id, supplierName: s.name })); }}
        categories={categories}
        existingSuppliers={suppliers}
        itemCategory={selectedProducts.length > 0 ? selectedProducts[0].catName : ''}
      />
    </div>
  );
}
