'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatPrice } from '../../../../src/utils/format';

// ── Integer Input (stock qty, min level, damaged qty) ─────────────────────────
// Blocks: e, E, +, -, . (integers only, no decimals)
// Blocks scroll wheel
function IntegerInput({ value, onChange, min = 0, max, placeholder, className, disabled, autoFocus, onBlur, onKeyDown }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) onChange({ ...e, target: { ...e.target, value: val } });
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
// Blocks: e, E, +, -, space. Allows digits + single decimal
function DecimalInput({ value, onChange, placeholder, className, disabled, style }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) onChange({ ...e, target: { ...e.target, value: val } });
  };
  const handleKeyDown = (e) => { if (['e', 'E', '+', '-', ' '].includes(e.key)) e.preventDefault(); };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };
  return (
    <input type="text" className={className} value={value} onChange={handleChange}
      onKeyDown={handleKeyDown} onWheel={handleWheel}
      placeholder={placeholder} disabled={disabled} inputMode="decimal" style={style} />
  );
}

// ── Local helper components (can be moved to separate files later) ───────────
// SupplierCombobox - assumes you have this in your codebase
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

// InfoModal - simple info modal component
function InfoModal({ isOpen, onClose, title, message, titleClass = 'modal-title-warning' }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
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

// AddSupplierQuickModal - quick add supplier modal
function AddSupplierQuickModal({ isOpen, onClose, onAdd, categories, existingSuppliers }) {
  const [form, setForm] = useState({ name: '', contact: '', phone: '', address: '', email: '', categories: [] });
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    if (isOpen) setForm({ name: '', contact: '', phone: '', address: '', email: '', categories: [] });
  }, [isOpen]);

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
// WIZARD-STYLE INVENTORY MODAL
// ══════════════════════════════════════════════════════════════════════════════
// Design: 3-Step Wizard (SELECT PRODUCT → PICK VARIANTS → STOCK ENTRY + INVOICE)
// EDIT MODE: Simple form (name/category locked, min stock editable)
//
// SKU duplicate fix: variant options that share first 3 letters get index suffix
//   e.g. "With Box" + "With Ribbon" → WIT-1, WIT-2 instead of WIT, WIT
//
// onSave receives array of items (one per variant combo)
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

  // ── ADD mode step (1=select product, 2=pick variants, 3=stock+invoice) ───────
  const [step, setStep] = useState(1);

  // Step 1
  const [search, setSearch] = useState('');
  const [selectedML, setSelectedML] = useState(null); // { catId, catName, prodId, prodName, variantTypes[] }

  // Step 2 — variant checkboxes { typeName: { optionVal: bool } }
  const [varChecks, setVarChecks] = useState({});

  // Step 3+4 combined
  // stockRows: [{ comboKey, comboLabel, comboMap, qty, damaged, unitCost }]
  const [stockRows, setStockRows] = useState([]);
  const [applyAllCost, setApplyAllCost] = useState('');
  const [invoice, setInvoice] = useState({
    supplierId: 'unspecified', supplierName: 'General Merchandise',
    invoiceNumber: '', deliveryDate: new Date().toISOString().split('T')[0],
    notes: '', receiptImage: null, costMode: 'unit', // 'unit' | 'total'
    totalInvoiceAmount: '',
  });

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
      setSelectedML(null);
      setVarChecks({});
      setStockRows([]);
      setApplyAllCost('');
      setInvoice({ supplierId: 'unspecified', supplierName: 'General Merchandise', invoiceNumber: '', deliveryDate: new Date().toISOString().split('T')[0], notes: '', receiptImage: null, costMode: 'unit', totalInvoiceAmount: '' });
    }
  }, [isOpen, item]);

  // ── Masterlist entries (flat list, filtered, no existing dupes) ──────────────
  const mlEntries = useMemo(() => {
    const existing = inventory.filter(i => i.isActive !== false).map(i => `${i.name.toLowerCase()}||${i.category.toLowerCase()}`);
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

  // ── SKU generation with duplicate-suffix fix ─────────────────────────────────
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
    const varParts = Object.entries(comboMap).map(([typeName, optVal]) => {
      const allOpts = allOptionsPerType[typeName] || [optVal];
      const prefixMap = buildPrefixMap(allOpts);
      return prefixMap[optVal] || optVal.substring(0, 3).toUpperCase();
    });
    return `${catP}-${prodP}-${varParts.join('-')}`;
  };

  // ── Generate stock rows from checked variants ────────────────────────────────
  const generateRows = (ml, checks) => {
    if (!ml) return [];
    if (!ml.variantTypes || ml.variantTypes.length === 0) {
      return [{ comboKey: '__base__', comboLabel: ml.prodName, comboMap: {}, qty: '', damaged: '', unitCost: '' }];
    }
    const tracked = ml.variantTypes.filter(vt => vt.isTracked !== false);
    if (tracked.length === 0) {
      return [{ comboKey: '__base__', comboLabel: ml.prodName, comboMap: {}, qty: '', damaged: '', unitCost: '' }];
    }
    const selectedPerType = {};
    tracked.forEach(vt => {
      selectedPerType[vt.name] = vt.options.filter(o => (checks[vt.name] || {})[o]);
    });
    const hasAny = Object.values(selectedPerType).some(a => a.length > 0);
    if (!hasAny) return [];

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
      return { comboKey: key, comboLabel: label, comboMap: combo, sku, qty: '', damaged: '', unitCost: '' };
    });
  };

  // ── Derived totals ────────────────────────────────────────────────────────────
  const totalGood = stockRows.reduce((s, r) => s + Math.max(0, (parseInt(r.qty) || 0) - (parseInt(r.damaged) || 0)), 0);
  const totalReceived = stockRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  const totalDamaged = stockRows.reduce((s, r) => s + (parseInt(r.damaged) || 0), 0);
  const wastePct = totalReceived > 0 ? ((totalDamaged / totalReceived) * 100).toFixed(1) : '0.0';

  const computedUnitCost = useMemo(() => {
    if (invoice.costMode === 'unit') return null;
    const totalAmt = parseFloat(invoice.totalInvoiceAmount) || 0;
    return totalGood > 0 ? totalAmt / totalGood : 0;
  }, [invoice.costMode, invoice.totalInvoiceAmount, totalGood]);

  const totalInvoiceValue = useMemo(() => {
    if (invoice.costMode === 'total') return parseFloat(invoice.totalInvoiceAmount) || 0;
    return stockRows.reduce((s, r) => {
      const good = Math.max(0, (parseInt(r.qty) || 0) - (parseInt(r.damaged) || 0));
      return s + good * (parseFloat(r.unitCost) || 0);
    }, 0);
  }, [invoice.costMode, invoice.totalInvoiceAmount, stockRows]);

  // ── Validation ────────────────────────────────────────────────────────────────
  const step1Valid = !!selectedML;
  const step2Valid = () => {
    if (!selectedML?.variantTypes?.length) return true;
    return generateRows(selectedML, varChecks).length > 0;
  };
  const step3Valid = () => {
    if (stockRows.length === 0) return false;
    return stockRows.every(r => {
      const q = parseInt(r.qty) || 0;
      const d = parseInt(r.damaged) || 0;
      return q > 0 && d < q;
    }) &&
    invoice.invoiceNumber.trim() &&
    invoice.deliveryDate &&
    (invoice.costMode === 'total'
      ? (parseFloat(invoice.totalInvoiceAmount) || 0) > 0
      : stockRows.every(r => (parseFloat(r.unitCost) || 0) > 0)
    );
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!step3Valid()) {
      setInfoModal({ title: 'Validation Error', message: 'Please complete all required fields (qty, cost, invoice number, delivery date).' });
      return;
    }
    const allOptionsPerType = {};
    (selectedML.variantTypes || []).forEach(vt => { allOptionsPerType[vt.name] = vt.options; });

    const items = stockRows.map(row => {
      const qty = parseInt(row.qty) || 0;
      const dmg = parseInt(row.damaged) || 0;
      const good = qty - dmg;
      const unitCost = invoice.costMode === 'total' ? (computedUnitCost || 0) : (parseFloat(row.unitCost) || 0);
      const d = new Date(invoice.deliveryDate);
      const batchId = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
      const itemName = row.comboMap && Object.keys(row.comboMap).length > 0
        ? `${selectedML.prodName} ${row.comboLabel}`
        : selectedML.prodName;
      const sku = row.sku || genComboSKU(selectedML.catName, selectedML.prodName, row.comboMap, allOptionsPerType);
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
        category: selectedML.catName,
        variantCombo: row.comboMap,
        stockQty: good, damagedQty: dmg, minStockLevel: 10,
        averageCost: unitCost, lastUnitCost: unitCost,
        lastSupplierId: batch.supplierId, lastSupplierName: invoice.supplierName,
        batches: [batch], isActive: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
    });

    onSave(items);
    onClose();
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
  const hasVariants = (selectedML?.variantTypes || []).length > 0;
  const previewRows = step === 2 ? generateRows(selectedML, varChecks) : [];

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: step === 3 ? '960px' : '680px', width: '94%', maxHeight: '94vh', display: 'flex', flexDirection: 'column', transition: 'max-width 0.3s ease' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '1.25rem 1.5rem 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>Inventory Management</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--white)', margin: 0 }}>Add New Inventory Item</h2>
              {selectedML && (
                <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '0.3rem' }}>
                  Selected: <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{selectedML.catName} / {selectedML.prodName}</span>
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '1.5rem' }}>
            {(hasVariants ? [
              { num: 1, label: 'SELECT PRODUCT' },
              { num: 2, label: 'PICK VARIANTS' },
              { num: 3, label: 'STOCK ENTRY' },
            ] : [
              { num: 1, label: 'SELECT PRODUCT' },
              { num: 3, label: 'STOCK ENTRY' },
            ]).map((s, idx, arr) => (
              <React.Fragment key={s.num}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700,
                    background: step > s.num ? '#4ade80' : step === s.num ? 'var(--gold)' : 'rgba(255,255,255,0.08)',
                    color: step > s.num ? '#000' : step === s.num ? '#000' : 'var(--gray)',
                    border: step === s.num ? '2px solid var(--gold)' : '2px solid transparent',
                  }}>
                    {step > s.num
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      : idx + 1}
                  </div>
                  <span style={{ fontSize: '0.6rem', letterSpacing: '0.06em', fontWeight: 700, color: step === s.num ? 'var(--gold)' : step > s.num ? '#4ade80' : 'var(--gray)', whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
                {idx < arr.length - 1 && (
                  <div style={{ flex: 1, height: '2px', background: step > s.num ? '#4ade80' : 'rgba(255,255,255,0.08)', margin: '0 0.5rem', marginBottom: '1.2rem' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── STEP 1: Select Product ─────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.5rem 1.5rem' }}>
            <div style={{ position: 'relative', marginBottom: '0.875rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search categories or products..."
                style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              {filteredML.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>
                  {mlEntries.length === 0 ? 'Masterlist is empty. Add products in Item Masterlist first.' : `No results for "${search}"`}
                </div>
              ) : filteredML.map((e, idx) => {
                const isSelected = selectedML?.prodId === e.prodId && selectedML?.catId === e.catId;
                return (
                  <button key={`${e.catId}-${e.prodId}`} type="button"
                    onClick={() => { setSelectedML(e); setVarChecks({}); setStockRows([]); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.875rem 1rem', background: isSelected ? 'rgba(212,168,67,0.12)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      border: 'none', borderBottom: idx < filteredML.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: isSelected ? 'var(--gold)' : 'var(--white)', fontSize: '0.9rem' }}>{e.prodName}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.15rem' }}>{e.catName}</div>
                      {e.variantTypes.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.35rem' }}>
                          {e.variantTypes.map((vt, i) => (
                            <span key={i} style={{ fontSize: '0.62rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                              {vt.name}: {vt.options.join(', ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: '0.75rem' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {!selectedML && (
              <p style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '0.875rem', textAlign: 'center' }}>
                Select a product above to begin. Product Name and Category will be auto-filled.
              </p>
            )}
          </div>
        )}

        {/* ── STEP 2: Pick Variants ─────────────────────────────────────── */}
        {step === 2 && selectedML && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.5rem 1.5rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--gray)', marginBottom: '1.25rem' }}>
              Select which variants you are receiving in this delivery.
            </p>
            {selectedML.variantTypes.map((vt, ti) => (
              <div key={ti} style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{vt.name}</span>
                  {!vt.isTracked && <span style={{ fontSize: '0.62rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>add-on only</span>}
                  <button type="button" onClick={() => {
                    const allChecked = vt.options.every(o => (varChecks[vt.name] || {})[o]);
                    const updated = { ...varChecks, [vt.name]: {} };
                    if (!allChecked) vt.options.forEach(o => { updated[vt.name][o] = true; });
                    setVarChecks(updated);
                  }} style={{ fontSize: '0.7rem', color: 'var(--gold)', background: 'none', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '4px', padding: '0.15rem 0.5rem', cursor: 'pointer' }}>
                    {vt.options.every(o => (varChecks[vt.name] || {})[o]) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.65rem' }}>
                  {vt.options.map((opt, oi) => {
                    const checked = !!(varChecks[vt.name] || {})[opt];
                    return (
                      <button key={oi} type="button" onClick={() => {
                        const updated = { ...varChecks, [vt.name]: { ...(varChecks[vt.name] || {}), [opt]: !checked } };
                        setVarChecks(updated);
                      }} style={{
                        position: 'relative', padding: '1rem 0.75rem', borderRadius: '10px', border: `2px solid ${checked ? 'var(--gold)' : 'rgba(255,255,255,0.1)'}`,
                        background: checked ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.03)',
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                      }}>
                        {checked && (
                          <div style={{ position: 'absolute', top: '6px', right: '6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        )}
                        <div style={{ fontSize: '0.875rem', fontWeight: checked ? 700 : 500, color: checked ? 'var(--gold)' : 'var(--white)', marginTop: '0.25rem' }}>{opt}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {previewRows.length > 0 && (
              <div style={{ padding: '0.875rem 1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '8px' }}>
                <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
                  {previewRows.length} combination{previewRows.length !== 1 ? 's' : ''} selected
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {previewRows.map((r, i) => (
                    <span key={i} style={{ fontSize: '0.73rem', color: 'var(--white)', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{r.comboLabel}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Stock Entry + Invoice (side by side) ──────────────── */}
        {step === 3 && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, minHeight: 0 }}>

            {/* LEFT — Stock Entry */}
            <div style={{ padding: '1rem 1.25rem 1.5rem', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.9rem' }}>Step 3: Stock Entry</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>{stockRows.length} Variant{stockRows.length !== 1 ? 's' : ''} Selected</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px 72px', gap: 0, padding: '0.4rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px 6px 0 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase' }}>Variant Name</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>Qty Recv.</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>Damaged</span>
              </div>

              <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 6px 6px', overflow: 'hidden', marginBottom: '0.875rem' }}>
                {stockRows.map((row, idx) => {
                  const q = parseInt(row.qty) || 0;
                  const d = parseInt(row.damaged) || 0;
                  const good = Math.max(0, q - d);
                  const hasErr = q > 0 && d >= q;
                  return (
                    <div key={row.comboKey} style={{
                      display: 'grid', gridTemplateColumns: '1fr 88px 72px',
                      padding: '0.6rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: hasErr ? 'rgba(248,113,113,0.05)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.82rem' }}>{row.comboLabel || selectedML?.prodName}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>SKU: {row.sku || '—'}</div>
                        {q > 0 && !hasErr && (
                          <div style={{ fontSize: '0.65rem', color: d > 0 ? '#f59e0b' : '#4ade80', marginTop: '0.1rem' }}>
                            {good} pcs usable{d > 0 ? ` · ${d} dmg` : ''}
                          </div>
                        )}
                        {hasErr && <div style={{ fontSize: '0.65rem', color: '#f87171' }}>Damaged must be less than qty</div>}
                      </div>
                      <div style={{ paddingLeft: '0.35rem' }}>
                        <IntegerInput className="form-input" value={row.qty}
                          onChange={e => setStockRows(prev => prev.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))}
                          min={1} placeholder="0" style={{ textAlign: 'center', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ paddingLeft: '0.35rem' }}>
                        <IntegerInput className="form-input" value={row.damaged}
                          onChange={e => setStockRows(prev => prev.map((r, i) => i === idx ? { ...r, damaged: e.target.value } : r))}
                          min={0} placeholder="0" style={{ textAlign: 'center', fontSize: '0.85rem' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '0.875rem', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Total Effective Qty</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#4ade80' }}>{totalGood} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>units</span></div>
                </div>
                <div style={{ padding: '0.875rem', background: 'rgba(248,113,113,0.06)', border: `1px solid ${parseFloat(wastePct) > 0 ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Stock Wastage</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: parseFloat(wastePct) > 0 ? '#f87171' : 'var(--gray)' }}>{wastePct}<span style={{ fontSize: '0.75rem', fontWeight: 500 }}>%</span></div>
                </div>
              </div>
            </div>

            {/* RIGHT — Invoice Details */}
            <div style={{ padding: '1rem 1.25rem 1.5rem', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(217,119,6,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.9rem' }}>Step 4: Invoice Details</div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Supplier</label>
                <SupplierCombobox value={invoice.supplierId} supplierName={invoice.supplierName}
                  onChange={(id, name) => setInvoice(p => ({ ...p, supplierId: id, supplierName: name }))}
                  suppliers={suppliers} itemCategory={selectedML?.catName || ''} onAddNew={() => setShowAddSupplier(true)} />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ fontSize: '0.7rem', margin: 0 }}>Cost Input Mode</label>
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                    {[['unit', 'Unit Cost'], ['total', 'Total Amount']].map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setInvoice(p => ({ ...p, costMode: val }))}
                        style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: invoice.costMode === val ? 'var(--gold)' : 'transparent', color: invoice.costMode === val ? '#000' : 'var(--gray)', transition: 'all 0.15s' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {invoice.costMode === 'unit' ? (
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div className="tier-price-cell" style={{ flex: 1 }}>
                        <span className="peso">₱</span>
                        <DecimalInput className="tier-input" value={applyAllCost}
                          onChange={e => setApplyAllCost(e.target.value)}
                          placeholder="0.00" style={{ width: '100%' }} />
                      </div>
                      <button type="button" onClick={() => {
                        setStockRows(prev => prev.map(r => ({ ...r, unitCost: applyAllCost })));
                      }} style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', color: 'var(--gold)', borderRadius: '6px', padding: '0 0.75rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Apply to all
                      </button>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', padding: '0.35rem 0.6rem', background: 'rgba(0,0,0,0.2)', fontSize: '0.62rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase' }}>
                        <span>Variant</span><span style={{ textAlign: 'center' }}>Unit Cost</span><span style={{ textAlign: 'center' }}>Subtotal</span>
                      </div>
                      {stockRows.map((row, idx) => {
                        const good = Math.max(0, (parseInt(row.qty) || 0) - (parseInt(row.damaged) || 0));
                        const cost = parseFloat(row.unitCost) || 0;
                        return (
                          <div key={row.comboKey} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', padding: '0.5rem 0.6rem', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--white)', fontWeight: 500 }}>{row.comboLabel || selectedML?.prodName}</span>
                            <div style={{ paddingLeft: '0.25rem' }}>
                              <div className="tier-price-cell">
                                <span className="peso" style={{ fontSize: '0.75rem' }}>₱</span>
                                <DecimalInput className="tier-input" value={row.unitCost}
                                  onChange={e => setStockRows(prev => prev.map((r, i) => i === idx ? { ...r, unitCost: e.target.value } : r))}
                                  placeholder="0.00" style={{ width: '100%' }} />
                              </div>
                            </div>
                            <span style={{ textAlign: 'center', fontSize: '0.78rem', color: good * cost > 0 ? '#facc15' : 'var(--gray)', fontWeight: 600 }}>
                              {good * cost > 0 ? `₱${formatPrice(good * cost)}` : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ padding: '1rem', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>Total Invoice Amount (₱)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.25rem', color: '#d97706', fontWeight: 700 }}>₱</span>
                        <input type="text" value={invoice.totalInvoiceAmount}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            if (/^\d*\.?\d{0,2}$/.test(val)) setInvoice(p => ({ ...p, totalInvoiceAmount: val }));
                          }}
                          placeholder="0.00"
                          style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--white)', background: 'none', border: 'none', outline: 'none', flex: 1, width: '100%' }} />
                      </div>
                      {computedUnitCost > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                          Auto-computed Unit Cost: <strong style={{ color: '#d97706' }}>₱{formatPrice(computedUnitCost)}</strong> each
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>Invoice / OR Number <span className="required">*</span></label>
                  <input type="text" className="form-input" value={invoice.invoiceNumber}
                    onChange={e => setInvoice(p => ({ ...p, invoiceNumber: e.target.value.slice(0, 50) }))}
                    placeholder="INV-2026-001" maxLength={50} />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>Delivery Date <span className="required">*</span></label>
                  <input type="date" className="form-input" value={invoice.deliveryDate}
                    onChange={e => setInvoice(p => ({ ...p, deliveryDate: e.target.value }))} />
                </div>
              </div>

              {totalInvoiceValue > 0 && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '8px', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Total Invoice Value</span>
                  <span style={{ fontWeight: 800, color: '#facc15', fontSize: '1rem' }}>₱{formatPrice(totalInvoiceValue)}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Notes <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
                <textarea className="form-textarea" value={invoice.notes}
                  onChange={e => setInvoice(p => ({ ...p, notes: e.target.value.slice(0, 300) }))}
                  placeholder="e.g., Some items had minor packaging damage..." maxLength={300} rows={2} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Proof of Purchase <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.875rem', border: '2px dashed var(--border)', borderRadius: '8px', background: 'rgba(0,0,0,0.1)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--gray)' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{invoice.receiptImage ? 'Receipt uploaded' : 'Click to upload receipt'}</span>
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
                    <img src={invoice.receiptImage} alt="Receipt" style={{ maxHeight: '120px', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border)', display: 'block' }} />
                    <button type="button" onClick={() => setInvoice(p => ({ ...p, receiptImage: null }))}
                      style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', color: '#fff', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer navigation ───────────────────────────────────────────── */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s === 3 ? (hasVariants ? 2 : 1) : s - 1)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Back
              </button>
            )}
            <button type="button" onClick={onClose}
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--gray)', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              {step === 3 ? 'Discard' : 'Cancel'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {step === 3 && totalInvoiceValue > 0 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                Total: <strong style={{ color: '#facc15' }}>₱{formatPrice(totalInvoiceValue)}</strong>
              </span>
            )}
            {step < 3 ? (
              <button type="button"
                disabled={step === 1 ? !step1Valid : !step2Valid()}
                onClick={() => {
                  if (step === 1) {
                    if (!hasVariants) {
                      setStockRows(generateRows(selectedML, {}));
                      setStep(3);
                    } else {
                      setStep(2);
                    }
                  } else if (step === 2) {
                    const rows = generateRows(selectedML, varChecks);
                    setStockRows(rows);
                    setStep(3);
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: step1Valid || step2Valid() ? 'var(--gold)' : 'rgba(212,168,67,0.3)', border: 'none', color: step1Valid || step2Valid() ? '#000' : 'var(--gray)', borderRadius: '8px', padding: '0.6rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, cursor: step1Valid || step2Valid() ? 'pointer' : 'not-allowed' }}>
                Next
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            ) : (
              <button type="button" disabled={!step3Valid()}
                onClick={handleSubmit}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: step3Valid() ? 'var(--gold)' : 'rgba(212,168,67,0.3)', border: 'none', color: step3Valid() ? '#000' : 'var(--gray)', borderRadius: '8px', padding: '0.6rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, cursor: step3Valid() ? 'pointer' : 'not-allowed' }}>
                Save Item
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title || ''} message={infoModal?.message || ''} />
      <AddSupplierQuickModal isOpen={showAddSupplier} onClose={() => setShowAddSupplier(false)}
        onAdd={(data) => { const s = onAddSupplier(data); setInvoice(p => ({ ...p, supplierId: s.id, supplierName: s.name })); }}
        categories={categories} existingSuppliers={suppliers} />
    </div>
  );
}
