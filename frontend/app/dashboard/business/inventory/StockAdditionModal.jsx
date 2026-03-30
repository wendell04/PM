'use client';

import React, { useState, useEffect, useRef } from 'react';
import { formatPrice } from '../../../../src/utils/format';

// ── Integer Input (stock qty, min level, damaged qty) ─────────────────────────
function IntegerInput({ value, onChange, min = 0, max, placeholder, className, disabled, autoFocus, onBlur, onKeyDown, qtyValue }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      const numVal = val === '' ? 0 : parseInt(val, 10);
      if (max !== undefined && numVal > max) return;
      if (numVal < min) return;
      if (qtyValue !== undefined) {
        const qty = parseInt(qtyValue) || 0;
        if (numVal > qty) return;
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

// ── Decimal Input (max 2 decimal places) ───────────────────────────────────────
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

// ── Comma-formatted Number Input ────────────────────────────────────────────────
function CommaNumberInput({ value, onChange, placeholder, className, style, max = 999999999.99 }) {
  const handleChange = (e) => {
    const val = e.target.value.replace(/,/g, '');
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      const numVal = parseFloat(val) || 0;
      if (numVal <= max) {
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
            <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: '0.5rem' }}>(Local Market / Various Market Vendors)</span>
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

// ── AddSupplierQuickModal ──────────────────────────────────────────────────────
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

// ── Stock Addition Modal (+) — Enhanced with Invoice Details & Variants ────────
export default function StockAdditionModal({ isOpen, onClose, onConfirm, item, suppliers, categories, onAddSupplier, masterlist }) {
  const [supplierId, setSupplierId] = useState('unspecified');
  const [supplierName, setSupplierName] = useState('General Merchandise');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [unitCost, setUnitCost] = useState('');
  const [costMode, setCostMode] = useState('unit');
  const [totalInvoiceAmount, setTotalInvoiceAmount] = useState('');
  const [applyAllCost, setApplyAllCost] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [receiptImage, setReceiptImage] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  
  // Variant state
  const [stockRows, setStockRows] = useState([]);
  const [baseProduct, setBaseProduct] = useState(null);

  const genBatchId = () => { const d=new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`; };

  // Extract base product name from variant name
  const extractBaseProductName = (variantName) => {
    // Remove variant suffixes like " - White / 11oz" or " (White / 11oz)"
    const match = variantName.match(/^(.+?)(?:\s*[-–—]\s*|\s*\()\w/);
    return match ? match[1] : variantName;
  };

  // Find product in masterlist and generate all variants
  useEffect(() => {
    if (!isOpen || !item || !masterlist) return;
    
    // Extract base product name from the item
    const baseName = extractBaseProductName(item.name);
    
    // Find in masterlist
    let foundProduct = null;
    let foundCategory = null;
    for (const cat of masterlist) {
      const prod = cat.products?.find(p => p.name.toLowerCase() === baseName.toLowerCase());
      if (prod) {
        foundProduct = prod;
        foundCategory = cat;
        break;
      }
    }
    
    if (!foundProduct) {
      // No masterlist entry, use single item
      setBaseProduct(null);
      setStockRows([{
        comboKey: '__base__',
        comboLabel: item.name,
        comboMap: {},
        sku: item.sku,
        qty: '',
        damaged: '',
        unitCost: ''
      }]);
      return;
    }

    setBaseProduct({ ...foundProduct, categoryName: foundCategory.name });

    // Generate all variant combinations
    const variantTypes = foundProduct.variantTypes || [];
    if (variantTypes.length === 0) {
      setStockRows([{
        comboKey: '__base__',
        comboLabel: foundProduct.name,
        comboMap: {},
        sku: item.sku,
        qty: '',
        damaged: '',
        unitCost: ''
      }]);
      return;
    }
    
    // Generate SKU prefix map for each variant type
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
    
    // Generate combo SKU
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
    
    // Generate all combinations
    const selectedPerType = {};
    variantTypes.forEach(vt => {
      selectedPerType[vt.name] = vt.options;
    });
    
    const cross = (types) => {
      if (types.length === 0) return [{}];
      const [first, ...rest] = types;
      const opts = selectedPerType[first.name] || [];
      if (opts.length === 0) return cross(rest);
      return opts.flatMap(o => cross(rest).map(r => ({ [first.name]: o, ...r })));
    };
    
    const combos = cross(variantTypes);
    const allOptionsPerType = {};
    variantTypes.forEach(vt => { allOptionsPerType[vt.name] = vt.options; });
    
    const rows = combos.map(combo => {
      const label = Object.values(combo).join(' / ');
      const key = Object.entries(combo).map(([k, v]) => `${k}:${v}`).join('|');
      const sku = genComboSKU(foundCategory.name, foundProduct.name, combo, allOptionsPerType);
      return {
        comboKey: key,
        comboLabel: label,
        comboMap: combo,
        sku,
        qty: '',
        damaged: '',
        unitCost: ''
      };
    });
    
    setStockRows(rows);
  }, [isOpen, item, masterlist]);

  useEffect(() => {
    if (isOpen && item) {
      // Reset all invoice-related states
      setInvoiceNumber('');
      setCostMode('unit');
      setTotalInvoiceAmount('');
      setApplyAllCost('');
      setReceiptImage(null);
      setDeliveryDate(new Date().toISOString().split('T')[0]);
      setSupplierId(item.lastSupplierId||'unspecified');
      setSupplierName(item.lastSupplierName||'General Merchandise');
      setShowConfirm(false);
      setPending(null);
    }
  }, [isOpen, item]);

  // Computed values from all stock rows
  const totalReceived = stockRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  const totalDamaged = stockRows.reduce((s, r) => s + (parseInt(r.damaged) || 0), 0);
  const totalGood = totalReceived - totalDamaged;

  const computedUnitCost = costMode === 'total' && totalReceived > 0
    ? (parseFloat(totalInvoiceAmount.replace(/,/g, '')) || 0) / totalReceived
    : 0;

  const totalInvoiceValue = costMode === 'total'
    ? (parseFloat(totalInvoiceAmount.replace(/,/g, '')) || 0)
    : stockRows.reduce((s, r) => {
        const qty = parseInt(r.qty) || 0;
        return s + qty * (parseFloat(r.unitCost) || 0);
      }, 0);
  
  // Compute effective and damaged values for footer breakdown
  // Effective = good qty × unit cost (what goes into inventory)
  const effectiveValue = costMode === 'total'
    ? totalGood * (computedUnitCost || 0)
    : stockRows.reduce((s, r) => {
        const good = Math.max(0, (parseInt(r.qty) || 0) - (parseInt(r.damaged) || 0));
        return s + good * (parseFloat(r.unitCost) || 0);
      }, 0);
  
  // Damaged = damaged qty × unit cost (loss)
  const damagedValue = costMode === 'total'
    ? totalDamaged * (computedUnitCost || 0)
    : stockRows.reduce((s, r) => {
        const damaged = parseInt(r.damaged) || 0;
        return s + damaged * (parseFloat(r.unitCost) || 0);
      }, 0);
  
  // Build damaged breakdown string (e.g., "2×35.00=70.00  2×40.00=80.00")
  const damagedBreakdown = totalDamaged > 0
    ? stockRows
        .filter(r => (parseInt(r.damaged) || 0) > 0)
        .map(r => {
          const d = parseInt(r.damaged) || 0;
          // In total mode, use computed unit cost; in unit mode, use per-variant costs
          const cost = costMode === 'total' ? (computedUnitCost || 0) : (parseFloat(r.unitCost) || 0);
          return `${d}×${formatPrice(cost)}=${formatPrice(d * cost)}`;
        })
        .join('  ')
    : '';

  const handleSubmit = () => {
    // Validate: at least one variant has qty > 0
    const rowsWithQty = stockRows.filter(r => (parseInt(r.qty) || 0) > 0);
    if (rowsWithQty.length === 0) {
      setInfoModal({ title: 'Validation Error', message: 'Please enter quantity for at least one variant.' });
      return;
    }

    // Validate: damaged < qty for each row
    for (const row of rowsWithQty) {
      const q = parseInt(row.qty) || 0;
      const d = parseInt(row.damaged) || 0;
      if (d >= q) {
        setInfoModal({ title: 'Validation Error', message: `Damaged quantity must be less than received for "${row.comboLabel}".` });
        return;
      }
    }

    // Validate cost - check per-variant unit costs in unit mode
    if (costMode === 'unit') {
      const hasUnitCost = rowsWithQty.some(r => (parseFloat(r.unitCost) || 0) > 0);
      if (!hasUnitCost) {
        setInfoModal({ title: 'Validation Error', message: 'Please enter unit cost for at least one variant.' });
        return;
      }
    } else {
      const totalAmt = parseFloat(totalInvoiceAmount.replace(/,/g, '')) || 0;
      if (!totalAmt || totalAmt <= 0) {
        setInfoModal({ title: 'Validation Error', message: 'Please enter the total invoice amount.' });
        return;
      }
    }

    if (!invoiceNumber.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter the invoice/OR number.' }); return; }
    if (!deliveryDate) { setInfoModal({ title: 'Validation Error', message: 'Please enter the delivery date.' }); return; }

    // Create items array for all variants with qty > 0
    const items = rowsWithQty.map(row => {
      const q = parseInt(row.qty) || 0;
      const d = parseInt(row.damaged) || 0;
      const goodQty = q - d;
      const cost = costMode === 'total' ? (computedUnitCost || 0) : (parseFloat(row.unitCost) || 0);
      const batchId = genBatchId();

      const itemName = row.comboMap && Object.keys(row.comboMap).length > 0
        ? `${baseProduct?.name || item.name} ${row.comboLabel}`
        : (baseProduct?.name || item.name);

      return {
        id: crypto.randomUUID(),
        sku: row.sku || item.sku,
        name: itemName.trim(),
        category: baseProduct?.categoryName || item.category,
        variantCombo: row.comboMap,
        stockQty: goodQty,
        damagedQty: d,
        averageCost: cost,
        lastUnitCost: cost,
        lastSupplierId: supplierId === 'unspecified' ? null : supplierId,
        lastSupplierName: supplierName,
        batches: [{
          batchId,
          supplierId: supplierId === 'unspecified' ? null : supplierId,
          supplierName,
          invoiceNumber,
          dateReceived: deliveryDate,
          originalQty: q,
          goodQty,
          damagedQty: d,
          remainingQty: goodQty,
          unitCost: cost,
          totalCost: goodQty * cost,
          receiptImage,
          movements: [{ type: 'received', quantity: goodQty, remainingAfter: goodQty, reason: 'Initial stock addition', createdAt: new Date().toISOString() }],
          status: 'active'
        }],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
    
    setPending(items);
    setShowConfirm(true);
  };

  if (!isOpen || !item) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '1100px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, background: '#0E0E0E', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div style={{ padding: '1.5rem 2rem', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#131313' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.62rem', color: '#D4A843', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.35rem', fontWeight: 600 }}>Inventory Management</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E5E2E1', margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Restock Item</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.4rem' }}>
                {item.category} · Current stock: <strong style={{ color: '#D4A843' }}>{item.stockQty} pcs</strong>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', color: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444'; }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* 2-Column Layout */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>

          {/* LEFT PANEL — Stock Entry */}
          <div style={{ padding: '1.5rem 2rem', overflowY: 'auto', background: '#0E0E0E' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                  <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Stock Entry</div>
                <div style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 600 }}>{stockRows.length} Variant{stockRows.length !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* Variant Table */}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '1.25rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Variant Name</th>
                    <th style={{ padding: '0.875rem 0.75rem', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '140px' }}>Qty Received</th>
                    <th style={{ padding: '0.875rem 0.75rem', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '120px' }}>Damaged</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row, idx) => {
                    const q = parseInt(row.qty) || 0;
                    const d = parseInt(row.damaged) || 0;
                    const hasErr = q > 0 && d >= q;
                    return (
                      <tr key={row.comboKey} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div>
                              <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{row.comboLabel || (baseProduct?.name || item.name)}</div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>SKU: {row.sku || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                          <IntegerInput className="form-input" value={row.qty}
                            onChange={e => setStockRows(prev => prev.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))}
                            min={0} max={99999} placeholder="0" style={{ textAlign: 'center', width: '80px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: q > 0 ? '#D4A843' : 'var(--gray)', fontWeight: 700, padding: '0.5rem' }} />
                        </td>
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                          <IntegerInput className="form-input" value={row.damaged}
                            onChange={e => setStockRows(prev => prev.map((r, i) => i === idx ? { ...r, damaged: e.target.value } : r))}
                            min={0} max={99999} placeholder="0" qtyValue={row.qty}
                            style={{ textAlign: 'center', width: '80px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: d > 0 ? '#F87171' : 'var(--gray)', fontWeight: 600, padding: '0.5rem' }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
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

          {/* RIGHT PANEL — Invoice Details */}
          <div style={{ padding: '1.5rem 2rem', background: '#131313', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Invoice Details</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Supplier */}
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Supplier</label>
                <SupplierCombobox value={supplierId} supplierName={supplierName} onChange={(id, name) => { setSupplierId(id); setSupplierName(name); }}
                  suppliers={suppliers} itemCategory={item.category} onAddNew={() => setShowAddSupplier(true)} />
              </div>

              {/* Invoice Number & Delivery Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Invoice / OR Number <span style={{ color: '#D4A843' }}>*</span></label>
                  <input type="text" className="form-input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value.slice(0, 50))}
                    placeholder="INV-2024-001" maxLength={50}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', padding: '0.625rem 0.75rem', width: '100%', fontSize: '0.85rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Delivery Date <span style={{ color: '#D4A843' }}>*</span></label>
                  <input type="date" className="form-input" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', padding: '0.625rem 0.75rem', width: '100%', fontSize: '0.85rem' }} />
                </div>
              </div>

              {/* Cost Input Mode Toggle */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#D4A843', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost Input Mode</span>
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '3px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {[['unit', 'Unit Cost'], ['total', 'Total Amount']].map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setCostMode(val)}
                        style={{
                          padding: '0.4rem 0.85rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer',
                          background: costMode === val ? '#D4A843' : 'transparent',
                          color: costMode === val ? '#000' : 'var(--gray)',
                          transition: 'all 0.15s', textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {costMode === 'total' ? (
                  <div style={{ padding: '1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '10px' }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem', fontWeight: 700, letterSpacing: '0.08em' }}>Total Invoice Amount</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.5rem', color: '#D4A843', fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>₱</span>
                      <CommaNumberInput value={totalInvoiceAmount} onChange={e => setTotalInvoiceAmount(e.target.value)} placeholder="0.00"
                        style={{ fontSize: '1.5rem', fontWeight: 800, color: '#E5E2E1', flex: 1, fontFamily: 'Plus Jakarta Sans, sans-serif' }} />
                    </div>
                    {computedUnitCost > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                        Auto-computed Unit Cost: <strong style={{ color: '#D4A843' }}>{formatPrice(computedUnitCost)}</strong> each
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.06)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.9rem', color: '#D4A843', fontWeight: 700 }}>₱</span>
                        <DecimalInput value={applyAllCost} onChange={e => setApplyAllCost(e.target.value)} placeholder="0.00" max={999999.99}
                          style={{ flex: 1, background: 'none', border: 'none', color: 'var(--white)', fontSize: '0.9rem', outline: 'none' }} />
                      </div>
                      <button type="button" onClick={() => {
                        setStockRows(prev => prev.map(r => ({ ...r, unitCost: applyAllCost })));
                        setApplyAllCost('');
                      }}
                        style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', color: '#D4A843', borderRadius: '8px', padding: '0 0.85rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Apply to all
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Invoice Table - Shows variants with qty > 0 */}
              {stockRows.some(r => (parseInt(r.qty) || 0) > 0) && (
                <div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Invoice Details</div>
                  <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', fontSize: '0.6rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <span>Variant</span><span style={{ textAlign: 'center' }}>Unit Cost</span><span style={{ textAlign: 'center' }}>Subtotal</span>
                    </div>
                    {stockRows.filter(r => (parseInt(r.qty) || 0) > 0).map((row, idx) => {
                      const qty = parseInt(row.qty) || 0;
                      const good = Math.max(0, qty - (parseInt(row.damaged) || 0));
                      // In total mode, use computed unit cost; in unit mode, use per-variant costs
                      const cost = costMode === 'total' ? (computedUnitCost || 0) : (parseFloat(row.unitCost) || 0);
                      const subtotal = qty * cost;  // Total qty (including damaged)
                      const originalIndex = stockRows.findIndex(r => r.comboKey === row.comboKey);
                      return (
                        <div key={row.comboKey} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '0.625rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--white)', fontWeight: 500 }}>{row.comboLabel}</span>
                          {costMode === 'unit' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.06)', padding: '0.35rem 0.5rem', borderRadius: '6px', justifyContent: 'center' }}>
                              <span style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 700 }}>₱</span>
                              <DecimalInput 
                                value={row.unitCost} 
                                onChange={e => setStockRows(prev => prev.map((r, i) => i === originalIndex ? { ...r, unitCost: e.target.value } : r))} 
                                placeholder="0.00" 
                                max={999999.99} 
                                style={{ width: '50px', background: 'none', border: 'none', color: 'var(--white)', fontSize: '0.8rem', textAlign: 'center', outline: 'none' }} 
                              />
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
              )}

              {/* Upload Receipt */}
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  Proof of Purchase / Receipt <span style={{ fontWeight: 400, color: 'var(--gray)' }}>(Optional)</span>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1.25rem', border: '2px dashed rgba(255,255,255,0.15)', borderRadius: '10px', background: 'rgba(0,0,0,0.15)', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#D4A843'; e.currentTarget.style.background = 'rgba(212,168,67,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'rgba(0,0,0,0.15)'; }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--gray)' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600 }}>{receiptImage ? 'Receipt uploaded' : 'Upload Receipt Image'}</span>
                  <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray)' }}>JPG, PNG or PDF up to 5MB</span>
                  <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) { setInfoModal({ title: 'File Too Large', message: 'Receipt must be under 5MB.' }); return; }
                      const reader = new FileReader();
                      reader.onload = ev => setReceiptImage(ev.target.result);
                      reader.readAsDataURL(file);
                    }} />
                </label>
                {receiptImage && (
                  <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                    <img src={receiptImage} alt="Receipt" style={{ maxHeight: '100px', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'block' }} />
                    <button type="button" onClick={() => setReceiptImage(null)}
                      style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', color: '#fff', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 2rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#131313' }}>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--gray)', borderRadius: '8px', padding: '0.625rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; }}>
            Cancel
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {totalInvoiceValue > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--gray)' }}>Effective: <strong style={{ color: '#FACC15' }}>{formatPrice(effectiveValue)}</strong></span>
                {totalDamaged > 0 && damagedBreakdown && (
                  <span style={{ color: 'var(--gray)' }}>Damaged: <strong style={{ color: '#FACC15' }}>{damagedBreakdown}</strong></span>
                )}
                <span style={{ color: 'var(--gray)' }}>Receipt Total: <strong style={{ color: '#FACC15' }}>{formatPrice(totalInvoiceValue)}</strong></span>
              </div>
            )}
            <button type="button"
              disabled={stockRows.every(r => !(parseInt(r.qty) || 0) > 0) || !invoiceNumber.trim() || !deliveryDate || (costMode === 'unit' ? !stockRows.some(r => (parseInt(r.qty) || 0) > 0 && (parseFloat(r.unitCost) || 0) > 0) : (!totalInvoiceAmount || parseFloat(totalInvoiceAmount.replace(/,/g, '')) <= 0))}
              onClick={handleSubmit}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: (stockRows.every(r => !(parseInt(r.qty) || 0) > 0) || !invoiceNumber.trim() || !deliveryDate || (costMode === 'unit' ? !stockRows.some(r => (parseInt(r.qty) || 0) > 0 && (parseFloat(r.unitCost) || 0) > 0) : (!totalInvoiceAmount || parseFloat(totalInvoiceAmount.replace(/,/g, '')) <= 0))) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)',
                border: 'none',
                color: (stockRows.every(r => !(parseInt(r.qty) || 0) > 0) || !invoiceNumber.trim() || !deliveryDate || (costMode === 'unit' ? !stockRows.some(r => (parseInt(r.qty) || 0) > 0 && (parseFloat(r.unitCost) || 0) > 0) : (!totalInvoiceAmount || parseFloat(totalInvoiceAmount.replace(/,/g, '')) <= 0))) ? 'var(--gray)' : '#000',
                borderRadius: '8px', padding: '0.625rem 1.25rem', fontSize: '0.85rem', fontWeight: 700,
                cursor: (stockRows.every(r => !(parseInt(r.qty) || 0) > 0) || !invoiceNumber.trim() || !deliveryDate || (costMode === 'unit' ? !stockRows.some(r => (parseInt(r.qty) || 0) > 0 && (parseFloat(r.unitCost) || 0) > 0) : (!totalInvoiceAmount || parseFloat(totalInvoiceAmount.replace(/,/g, '')) <= 0))) ? 'not-allowed' : 'pointer',
                boxShadow: (stockRows.every(r => !(parseInt(r.qty) || 0) > 0) || !invoiceNumber.trim() || !deliveryDate || (costMode === 'unit' ? !stockRows.some(r => (parseInt(r.qty) || 0) > 0 && (parseFloat(r.unitCost) || 0) > 0) : (!totalInvoiceAmount || parseFloat(totalInvoiceAmount.replace(/,/g, '')) <= 0))) ? 'none' : '0 0 16px rgba(212,168,67,0.3)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                const isValid = stockRows.some(r => (parseInt(r.qty) || 0) > 0) && invoiceNumber.trim() && deliveryDate && (costMode === 'unit' ? stockRows.some(r => (parseInt(r.qty) || 0) > 0 && (parseFloat(r.unitCost) || 0) > 0) : (totalInvoiceAmount && parseFloat(totalInvoiceAmount.replace(/,/g, '')) > 0));
                if (isValid) { e.currentTarget.style.transform = 'scale(1.02)'; }
              }}>
              Add Stock
            </button>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && pending && Array.isArray(pending) && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title modal-title-success">Confirm Stock Addition</h2>
              <button className="modal-close" onClick={() => setShowConfirm(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="confirm-summary">
                <div className="confirm-row"><span className="confirm-label">Variants:</span><span className="confirm-value" style={{ color: '#4ade80', fontWeight: 700 }}>{pending.length}</span></div>
                <div className="confirm-row"><span className="confirm-label">Total Good Qty:</span><span className="confirm-value" style={{ color: '#4ade80', fontWeight: 700 }}>+{pending.reduce((s, i) => s + i.stockQty, 0)} pcs</span></div>
                {pending.some(i => i.damagedQty > 0) && (
                  <div className="confirm-row"><span className="confirm-label">Total Damaged:</span><span className="confirm-value" style={{ color: '#f87171' }}>−{pending.reduce((s, i) => s + i.damagedQty, 0)} pcs</span></div>
                )}
                <div className="confirm-row"><span className="confirm-label">Supplier:</span><span className="confirm-value">{supplierName}</span></div>
                <div className="confirm-row"><span className="confirm-label">Unit Cost:</span><span className="confirm-value">₱{formatPrice(unitCost || computedUnitCost)}</span></div>
                <div className="confirm-row"><span className="confirm-label">Total Value:</span><span className="confirm-value" style={{ color: '#facc15', fontWeight: 700 }}>₱{formatPrice(totalInvoiceValue)}</span></div>
                <div className="confirm-row"><span className="confirm-label">Invoice:</span><span className="confirm-value">{invoiceNumber}</span></div>
              </div>
              <p className="confirm-hint" style={{ marginTop: '1rem', color: '#facc15' }}>This will create or update inventory items and create batch records.</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => { onConfirm(pending); setShowConfirm(false); setPending(null); onClose(); }}>Confirm Addition</button>
            </div>
          </div>
        </div>
      )}

      <AddSupplierQuickModal isOpen={showAddSupplier} onClose={() => setShowAddSupplier(false)}
        onAdd={(data) => { const s = onAddSupplier(data); setSupplierId(s.id); setSupplierName(s.name); }}
        categories={categories} 
        existingSuppliers={suppliers}
        itemCategory={item?.category}  // Auto-link supplier to product category
      />
      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title||''} message={infoModal?.message||''} />
    </div>
  );
}
