'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';

// ── LocalStorage Keys ──────────────────────────────────────────────────────────
const MATERIALS_KEY = 'pmp_materials';
const VENDORS_KEY = 'pmp_vendors';
const BOM_KEY = 'pmp_bom';
const CATEGORIES_KEY = 'pmp_material_categories';
const ALLOWED_CATEGORIES = ['Raw Material', 'Packaging'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMaterials() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(MATERIALS_KEY) || '[]'); }
  catch { return []; }
}
function saveMaterials(data) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MATERIALS_KEY, JSON.stringify(data));
}
function getVendors() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(VENDORS_KEY) || '[]'); }
  catch { return []; }
}
function saveVendors(data) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VENDORS_KEY, JSON.stringify(data));
}
function getBOMs() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(BOM_KEY) || '[]'); }
  catch { return []; }
}
function saveBOMs(data) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BOM_KEY, JSON.stringify(data));
}
// Always return only the two allowed categories — ignore localStorage
function getCategories() { return [...ALLOWED_CATEGORIES]; }
function saveCategories() { /* no-op — categories are fixed */ }
function addCategory() { return [...ALLOWED_CATEGORIES]; }

// ── SKU Generation ────────────────────────────────────────────────────────────
// Format: {CAT}-{PRODUCT}-{VARIANTS}-{SEQ}
// Examples: MUG-INN-0001, MUG-CER-WHT-11OZ-0001, MUG-CER-BLK-15OZ-0002

const SKU_SEQ_KEY = 'pmp_sku_sequences';

function getSKUSequences() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(SKU_SEQ_KEY) || '{}'); }
  catch { return {}; }
}
function saveSKUSequences(data) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SKU_SEQ_KEY, JSON.stringify(data));
}

function getNextSequence(key) {
  const seqs = getSKUSequences();
  const next = (seqs[key] || 0) + 1;
  seqs[key] = next;
  saveSKUSequences(seqs);
  return next;
}

// Get 3-letter prefix from a string
function getPrefix(str, len = 3) {
  return str.replace(/[^A-Za-z0-9]/g, '').substring(0, len).toUpperCase() || 'XXX';
}

// Get short code from variant option (e.g., "White" → "WHT", "11oz" → "11OZ")
function getVariantCode(opt) {
  const cleaned = opt.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (/^\d/.test(cleaned)) {
    // Starts with number (e.g., "11oz") → keep full alphanumeric
    return cleaned;
  }
  return cleaned.substring(0, 3);
}

// Generate SKU for standalone material (no variants)
function genAutoSKU(category, productName, existingMaterials) {
  const catP = getPrefix(category);
  const prodP = getPrefix(productName);
  const baseKey = `${catP}-${prodP}`;

  // Count existing materials with same base key to determine sequence
  const existingCount = (existingMaterials || []).filter(m =>
    m.sku && m.sku.startsWith(baseKey + '-') && !m.parentId
  ).length;

  const seq = getNextSequence(baseKey);
  const finalSeq = Math.max(seq, existingCount + 1);
  return `${baseKey}-${String(finalSeq).padStart(4, '0')}`;
}

// Generate SKU for a variant combination
function genComboSKU(category, productName, comboMap, allOptionsPerType, existingMaterials) {
  const catP = getPrefix(category);
  const prodP = getPrefix(productName);

  if (!comboMap || Object.keys(comboMap).length === 0) {
    return genAutoSKU(category, productName, existingMaterials);
  }

  // Build variant part from combo
  const varParts = Object.entries(comboMap).map(([typeName, optVal]) => {
    return getVariantCode(optVal);
  });

  const baseKey = `${catP}-${prodP}-${varParts.join('-')}`;

  // Count existing variants with same base key
  const existingCount = (existingMaterials || []).filter(m =>
    m.sku && m.sku.startsWith(baseKey + '-') && m.parentId
  ).length;

  const seq = getNextSequence(baseKey);
  const finalSeq = Math.max(seq, existingCount + 1);
  return `${baseKey}-${String(finalSeq).padStart(4, '0')}`;
}

// Generate all variant SKUs for a product
function generateVariantSKUs(category, productName, variantTypes, existingMaterials) {
  const tracked = (variantTypes || []).filter(vt => vt.isStockable !== false && vt.options.length > 0);

  if (tracked.length === 0) {
    const sku = genAutoSKU(category, productName, existingMaterials);
    return [{ comboKey: '__base__', comboLabel: productName, comboMap: {}, sku, variantName: productName }];
  }

  const selectedPerType = {};
  tracked.forEach(vt => { selectedPerType[vt.name] = vt.options; });

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

  return combos.map((combo, idx) => {
    const label = Object.values(combo).join(' / ');
    const key = Object.entries(combo).map(([k, v]) => `${k}:${v}`).join('|');
    const sku = genComboSKU(category, productName, combo, allOptionsPerType, existingMaterials);
    return { comboKey: key, comboLabel: label, comboMap: combo, sku, variantName: Object.values(combo).join(' ') };
  });
}

// ── Status Badge ───────────────────────────────────────────────────────────────
function StatusBadge({ stock, minStock, procurementType }) {
  if (procurementType === 'on-demand') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        On-Demand
      </span>
    );
  }
  if (stock === 0) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Out of Stock
      </span>
    );
  }
  if (stock < (minStock || 10)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Low Stock
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>
      Healthy
    </span>
  );
}

function CategoryBadge({ category }) {
  const colors = {
    'RAW MATERIAL': { bg: 'rgba(99,102,241,0.1)', color: '#818cf8', border: 'rgba(99,102,241,0.2)' },
    'CONSUMABLE': { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.2)' },
    'FINISHED GOODS': { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', border: 'rgba(34,197,94,0.2)' },
    'PACKAGING': { bg: 'rgba(168,85,247,0.1)', color: '#a855f7', border: 'rgba(168,85,247,0.2)' },
  };
  const key = (category || '').toUpperCase();
  const c = colors[key] || { bg: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: 'rgba(255,255,255,0.1)' };
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {category}
    </span>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '0.6rem 0.75rem', fontSize: '0.72rem', color: '#E5E2E1', whiteSpace: 'nowrap',
          zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', lineHeight: 1.5,
        }}>
          {text}
          <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', border: '5px solid transparent', borderTopColor: '#1a1a1a' }}></span>
        </span>
      )}
    </span>
  );
}

// ── Integer Input ──────────────────────────────────────────────────────────────
function IntegerInput({ value, onChange, min = 0, max, placeholder, style, disabled }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      const num = val === '' ? 0 : parseInt(val, 10);
      if (max !== undefined && num > max) return;
      if (num < min) return;
      onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  const handleKeyDown = (e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };
  return (
    <input type="text" value={value} inputMode="numeric" pattern="[0-9]*" placeholder={placeholder} disabled={disabled} style={style}
      onChange={handleChange} onKeyDown={handleKeyDown} onWheel={handleWheel} />
  );
}

// ── Decimal Input ──────────────────────────────────────────────────────────────
function DecimalInput({ value, onChange, placeholder, style, disabled, max = 9999999.99 }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      const num = parseFloat(val) || 0;
      if (num <= max) onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  const handleKeyDown = (e) => { if (['e', 'E', '+', '-', ' '].includes(e.key)) e.preventDefault(); };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };
  return (
    <input type="text" value={value} inputMode="decimal" placeholder={placeholder} disabled={disabled} style={style}
      onChange={handleChange} onKeyDown={handleKeyDown} onWheel={handleWheel} />
  );
}

// ── Info Modal ─────────────────────────────────────────────────────────────────
function InfoModal({ isOpen, onClose, title, message }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ fontSize: '1rem' }}>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem 2rem', fontSize: '0.875rem', color: '#E5E2E1', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {message}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ──────────────────────────────────────────────────────────────
function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmClass = 'btn-danger' }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ fontSize: '1rem' }}>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem 2rem', fontSize: '0.875rem', color: '#E5E2E1', lineHeight: 1.6 }}>
          {message}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className={confirmClass} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Material Details Modal (Read-only) ─────────────────────────────────────────
function MaterialDetailsModal({ material, vendors, onClose }) {
  if (!material) return null;
  const vendor = vendors.find(v => v.id === material.preferredVendorId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title" style={{ fontSize: '1.1rem' }}>{material.name}</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.2rem' }}>{material.sku || '—'}</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem 2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Category</div>
              <CategoryBadge category={material.category} />
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Unit of Measure</div>
              <div style={{ fontSize: '0.95rem', color: '#E5E2E1', fontWeight: 600 }}>{material.uom || 'pcs'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Current Stock</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: material.stockQty === 0 ? '#ef4444' : '#E5E2E1' }}>{material.stockQty || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Minimum Stock</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#E5E2E1' }}>{material.minStock || 10}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Base Cost</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#D4A843' }}>₱{(material.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Preferred Vendor</div>
              <div style={{ fontSize: '0.95rem', color: vendor ? '#3b82f6' : 'var(--gray)', fontWeight: 600 }}>{vendor?.name || '—'}</div>
            </div>
          </div>
          {material.procurementType === 'on-demand' && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(129,140,248,0.08)', borderRadius: '8px', border: '1px solid rgba(129,140,248,0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span style={{ fontSize: '0.8rem', color: '#818cf8', fontWeight: 600 }}>On-Demand (Make to Order)</span>
            </div>
          )}
          {material.variantTypes && material.variantTypes.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Variant Types</div>
              {material.variantTypes.map((vt, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: '#E5E2E1', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--gray)' }}>{vt.name}:</span> {vt.options.join(', ')}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MATERIAL MASTER TAB
// ══════════════════════════════════════════════════════════════════════════════
function MaterialMasterTab({ itemCategories, materials, onMaterialsChange }) {
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [procurementFilter, setProcurementFilter] = useState('');
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMaterial, setEditMaterial] = useState(null);
  const [viewMaterial, setViewMaterial] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  useEffect(() => {
    setVendors(getVendors());
  }, []);

  const groupedMaterials = useMemo(() => {
    const parents = materials.filter(m => m.hasVariants && !m.parentId);
    const childrenMap = new Map();
    const standalone = materials.filter(m => !m.hasVariants && !m.parentId);
    materials.filter(m => m.parentId).forEach(child => {
      if (!childrenMap.has(child.parentId)) childrenMap.set(child.parentId, []);
      childrenMap.get(child.parentId).push(child);
    });
    return { parents, childrenMap, standalone };
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase();
    const result = [];
    for (const m of groupedMaterials.standalone) {
      const matchSearch = !q || m.name.toLowerCase().includes(q) || (m.sku || '').toLowerCase().includes(q);
      const matchCat = !categoryFilter || m.category === categoryFilter;
      const matchProc = !procurementFilter || m.procurementType === procurementFilter;
      if (matchSearch && matchCat && matchProc) result.push({ type: 'standalone', item: m });
    }
    for (const parent of groupedMaterials.parents) {
      const matchSearch = !q || parent.name.toLowerCase().includes(q) || (parent.sku || '').toLowerCase().includes(q);
      const matchCat = !categoryFilter || parent.category === categoryFilter;
      const matchProc = !procurementFilter || parent.procurementType === procurementFilter;
      if (matchSearch && matchCat && matchProc) {
        const children = (groupedMaterials.childrenMap.get(parent.id) || []).filter(c => {
          if (!q) return true;
          return c.name.toLowerCase().includes(q) || (c.sku || '').toLowerCase().includes(q);
        });
        result.push({ type: 'parent', item: parent, children });
      }
    }
    return result;
  }, [materials, search, categoryFilter, procurementFilter, groupedMaterials]);

  const toggleExpand = (id) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Material',
      message: 'Are you sure you want to delete this material? Children will also be deleted. This action cannot be undone.',
      onConfirm: () => {
        const updated = materials.filter(m => m.id !== id && m.parentId !== id);
        onMaterialsChange(updated);
        saveMaterials(updated);
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
      },
    });
  };

  const handleSave = (material, children) => {
    let updated;
    if (editMaterial) {
      // Update existing
      updated = materials.map(m => {
        if (m.id === editMaterial.id) return { ...m, ...material, updatedAt: new Date().toISOString() };
        if (children && children.some(c => c.parentId === m.id)) {
          // Handle children update if needed, but for now just update parent
          return m;
        }
        return m;
      });
      // Remove old children if updating variants
      if (editMaterial.hasVariants) {
        updated = updated.filter(m => m.parentId !== editMaterial.id);
      }
      if (children && children.length > 0) updated = [...updated, ...children];
    } else {
      // Add new
      const parentId = material.id || `mat-${Date.now()}`;
      updated = [...materials, material];
      if (children && children.length > 0) updated = [...updated, ...children];
    }
    onMaterialsChange(updated);
    saveMaterials(updated);
    setShowAddModal(false);
    setEditMaterial(null);
  };

  const totalMaterials = materials.filter(m => !m.parentId).length;
  const lowStockCount = materials.filter(m => !m.parentId && m.procurementType !== 'on-demand' && m.stockQty < (m.minStock || 10)).length;
  const outOfStockCount = materials.filter(m => !m.parentId && m.procurementType !== 'on-demand' && m.stockQty === 0).length;
  const onDemandCount = materials.filter(m => !m.parentId && m.procurementType === 'on-demand').length;

  // SVG icons
  const EditIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
  const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>;
  const EyeIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

  return (
    <div>
      {/* Summary Cards */}
      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{totalMaterials}</span>
            <span className="summary-label">Total Materials</span>
          </div>
        </div>
        <div className="summary-card summary-card-warning">
          <div className="summary-content">
            <span className="summary-value">{lowStockCount}</span>
            <span className="summary-label">Low Stock</span>
          </div>
        </div>
        <div className="summary-card summary-card-danger">
          <div className="summary-content">
            <span className="summary-value">{outOfStockCount}</span>
            <span className="summary-label">Out of Stock</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(129,140,248,0.08)', borderColor: 'rgba(129,140,248,0.3)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#818cf8' }}>{onDemandCount}</span>
            <span className="summary-label" style={{ color: '#818cf8' }}>On-Demand</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="inventory-toolbar" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ maxWidth: '280px' }}>
            <span className="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </span>
            <input className="search-input" placeholder="Filter materials..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>x</button>}
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{
            padding: '0.5rem 0.75rem', background: 'var(--dark2)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--white)', fontSize: '0.8rem', cursor: 'pointer', minWidth: '140px'
          }}>
            <option value="" style={{ background: 'var(--dark)', color: 'var(--white)' }}>All Categories</option>
            {itemCategories.map(c => <option key={c} value={c} style={{ background: 'var(--dark)', color: 'var(--white)' }}>{c}</option>)}
          </select>
          <select value={procurementFilter} onChange={e => setProcurementFilter(e.target.value)} style={{
            padding: '0.5rem 0.75rem', background: 'var(--dark2)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--white)', fontSize: '0.8rem', cursor: 'pointer', minWidth: '130px'
          }}>
            <option value="" style={{ background: 'var(--dark)', color: 'var(--white)' }}>All Procurement</option>
            <option value="stock" style={{ background: 'var(--dark)', color: 'var(--white)' }}>Stock (MTS)</option>
            <option value="on-demand" style={{ background: 'var(--dark)', color: 'var(--white)' }}>On-Demand (MTO)</option>
          </select>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add Material
        </button>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--dark)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', width: '40px' }}></th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>SKU / Name</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Category</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Stock</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Base Cost</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Status</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMaterials.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                  {materials.length === 0 ? 'No materials yet. Click "Add Material" to get started.' : 'No materials match your filters.'}
                </td>
              </tr>
            ) : (
              filteredMaterials.map((row) => {
                if (row.type === 'standalone') {
                  const m = row.item;
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                      onClick={() => setViewMaterial(m)}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '0.875rem 1rem' }}></td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.875rem' }}>{m.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.15rem' }}>{m.sku || '—'}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}><CategoryBadge category={m.category} /></td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: m.procurementType === 'on-demand' ? '#818cf8' : m.stockQty === 0 ? '#ef4444' : m.stockQty < (m.minStock || 10) ? '#f59e0b' : '#E5E2E1' }}>
                        {m.stockQty} {m.uom || 'pcs'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: '#E5E2E1' }}>P{(m.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}><StatusBadge stock={m.stockQty} minStock={m.minStock} procurementType={m.procurementType} /></td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                          <button onClick={() => { setEditMaterial(m); setShowAddModal(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray)' }} title="Edit"><EditIcon /></button>
                          <button onClick={() => setViewMaterial(m)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray)' }} title="View Details"><EyeIcon /></button>
                          <button onClick={() => handleDelete(m.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: '#f87171' }} title="Delete"><TrashIcon /></button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const parent = row.item;
                const children = row.children || [];
                const isExpanded = expandedParents.has(parent.id);
                const parentStock = children.reduce((s, c) => s + (c.stockQty || 0), 0);

                return (
                  <React.Fragment key={parent.id}>
                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)', background: 'rgba(212,168,67,0.02)', cursor: 'pointer' }}
                      onClick={() => setViewMaterial(parent)}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,168,67,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = isExpanded ? 'rgba(212,168,67,0.02)' : 'rgba(212,168,67,0.02)'}
                    >
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); toggleExpand(parent.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? '#D4A843' : 'var(--gray)', padding: '0' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                            <path d="M9 18l6-6-6-6"/>
                          </svg>
                        </button>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.875rem' }}>{parent.name}</span>
                          {children.length > 0 && (
                            <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>Has Variants</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.15rem' }}>{parent.sku || '—'}</div>
                        {parent.variantTypes && parent.variantTypes.length > 0 && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
                            {parent.variantTypes.map(vt => `${vt.name}: ${vt.options.join(', ')}`).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}><CategoryBadge category={parent.category} /></td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: parent.procurementType === 'on-demand' ? '#818cf8' : parentStock === 0 ? '#ef4444' : parentStock < (parent.minStock || 10) ? '#f59e0b' : '#E5E2E1' }}>
                        {parentStock} {parent.uom || 'pcs'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: '#E5E2E1' }}>P{(parent.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}><StatusBadge stock={parentStock} minStock={parent.minStock} procurementType={parent.procurementType} /></td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                          <button onClick={() => { setEditMaterial(parent); setShowAddModal(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray)' }}><EditIcon /></button>
                          <button onClick={() => setViewMaterial(parent)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray)' }}><EyeIcon /></button>
                          <button onClick={() => handleDelete(parent.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: '#f87171' }}><TrashIcon /></button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && children.map(child => (
                      <tr key={child.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.15)', cursor: 'pointer' }}
                        onClick={() => setViewMaterial(child)}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.25)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.15)'}
                      >
                        <td style={{ padding: '0.75rem 1rem 0.75rem 2.5rem' }}>
                          <div style={{ width: '16px', height: '1px', background: 'rgba(212,168,67,0.3)', marginBottom: '4px' }}></div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem 0.75rem 2.5rem' }}>
                          <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.825rem' }}>{child.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>{child.sku || '—'}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><CategoryBadge category={child.category} /></td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: child.stockQty === 0 ? '#ef4444' : child.stockQty < (child.minStock || 10) ? '#f59e0b' : '#E5E2E1' }}>
                          {child.stockQty} {child.uom || 'pcs'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#E5E2E1' }}>P{(child.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><StatusBadge stock={child.stockQty} minStock={child.minStock} procurementType={child.procurementType} /></td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                            <button onClick={() => setViewMaterial(child)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray)' }}><EyeIcon /></button>
                            <button onClick={() => handleDelete(child.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: '#f87171' }}><TrashIcon /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <MaterialFormModal
          itemCategories={itemCategories}
          vendors={vendors}
          materials={materials}
          editMaterial={editMaterial}
          onClose={() => { setShowAddModal(false); setEditMaterial(null); }}
          onSave={handleSave}
        />
      )}
      {viewMaterial && (
        <MaterialDetailsModal
          material={viewMaterial}
          vendors={vendors}
          onClose={() => setViewMaterial(null)}
        />
      )}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Delete"
        confirmClass="btn-danger"
      />
    </div>
  );
}

// ── Material Form Modal ────────────────────────────────────────────────────────
function MaterialFormModal({ itemCategories, vendors, materials, editMaterial, onClose, onSave }) {
  const [form, setForm] = useState({
    name: '', category: itemCategories[0] || '', uom: 'pcs',
    minStock: '', baseCost: '',
    procurementType: 'stock', allowBackorder: false,
    preferredVendorId: '',
    hasVariants: false, variantTypes: [],
  });
  const [previewSKUs, setPreviewSKUs] = useState([]);
  const [variantTypeInput, setVariantTypeInput] = useState('');
  const [variantOptionInputs, setVariantOptionInputs] = useState({});

  // Populate form when editing
  useEffect(() => {
    if (editMaterial) {
      setForm({
        name: editMaterial.name || '',
        category: editMaterial.category || itemCategories[0] || '',
        uom: editMaterial.uom || 'pcs',
        minStock: editMaterial.minStock !== undefined ? String(editMaterial.minStock) : '',
        baseCost: editMaterial.baseCost !== undefined ? String(editMaterial.baseCost) : '',
        procurementType: editMaterial.procurementType || 'stock',
        allowBackorder: editMaterial.allowBackorder || false,
        preferredVendorId: editMaterial.preferredVendorId || '',
        hasVariants: editMaterial.hasVariants || false,
        variantTypes: editMaterial.variantTypes || [],
      });
    } else {
      // Reset for add mode
      setForm({
        name: '', category: itemCategories[0] || '', uom: 'pcs',
        minStock: '', baseCost: '',
        procurementType: 'stock', allowBackorder: false,
        preferredVendorId: '',
        hasVariants: false, variantTypes: [],
      });
    }
  }, [editMaterial, itemCategories]);

  useEffect(() => {
    if (form.procurementType === 'on-demand') {
      setForm(p => ({ ...p, allowBackorder: false }));
    }
  }, [form.procurementType]);

  useEffect(() => {
    if (form.hasVariants && form.name && form.variantTypes.length > 0 && form.variantTypes.every(vt => vt.options.length > 0)) {
      setPreviewSKUs(generateVariantSKUs(form.category, form.name, form.variantTypes, materials));
    } else if (!form.hasVariants && form.name) {
      const sku = genAutoSKU(form.category, form.name, materials);
      setPreviewSKUs([{ sku, variantName: form.name, comboMap: {} }]);
    } else {
      setPreviewSKUs([]);
    }
  }, [form.name, form.category, form.hasVariants, form.variantTypes, materials]);

  // Variant Type actions (old inventory style)
  const addVariantType = () => {
    const name = variantTypeInput.trim();
    if (!name) return;
    if (form.variantTypes.some(vt => vt.name.toLowerCase() === name.toLowerCase())) return;
    const newVt = {
      id: `vt-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      name,
      options: [],
      isStockable: true,
    };
    setForm(p => ({ ...p, variantTypes: [...p.variantTypes, newVt] }));
    setVariantTypeInput('');
  };

  const removeVariantType = (idx) => {
    setForm(p => ({ ...p, variantTypes: p.variantTypes.filter((_, i) => i !== idx) }));
    setVariantOptionInputs(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const addVariantOption = (typeIdx) => {
    const option = (variantOptionInputs[typeIdx] || '').trim();
    if (!option) return;
    const updated = [...form.variantTypes];
    if (updated[typeIdx].options.some(o => o.toLowerCase() === option.toLowerCase())) return;
    updated[typeIdx].options.push(option);
    setForm(p => ({ ...p, variantTypes: updated }));
    setVariantOptionInputs(prev => ({ ...prev, [typeIdx]: '' }));
  };

  const removeVariantOption = (typeIdx, optIdx) => {
    const updated = [...form.variantTypes];
    updated[typeIdx].options.splice(optIdx, 1);
    setForm(p => ({ ...p, variantTypes: updated }));
  };

  const toggleStockable = (typeIdx) => {
    const updated = [...form.variantTypes];
    updated[typeIdx] = { ...updated[typeIdx], isStockable: !updated[typeIdx].isStockable };
    setForm(p => ({ ...p, variantTypes: updated }));
  };

  // Calculate total combinations
  const getTotalCombinations = () => {
    if (form.variantTypes.length === 0) return 0;
    const stockableTypes = form.variantTypes.filter(vt => vt.isStockable !== false);
    if (stockableTypes.length === 0) return 0;
    return stockableTypes.reduce((total, vt) => {
      if (vt.options.length === 0) return total;
      return total * vt.options.length;
    }, 1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const minStock = form.minStock === '' ? 10 : parseInt(form.minStock) || 10;
    const baseCost = form.baseCost === '' ? 0 : parseFloat(form.baseCost) || 0;

    const parentId = editMaterial ? editMaterial.id : `mat-${Date.now()}`;
    const existingSku = editMaterial ? editMaterial.sku : null;

    // Generate SKU using new consistent format
    const autoSku = existingSku || genAutoSKU(form.category, form.name, materials);

    if (form.hasVariants && previewSKUs.length > 0) {
      const catP = getPrefix(form.category);
      const prodP = getPrefix(form.name);
      const parent = {
        id: parentId, name: form.name,
        sku: `${catP}-${prodP}-0000`,
        category: form.category, uom: form.uom,
        stockQty: editMaterial ? editMaterial.stockQty : 0,
        minStock, baseCost,
        procurementType: form.procurementType,
        allowBackorder: form.procurementType === 'stock' ? form.allowBackorder : false,
        preferredVendorId: form.preferredVendorId,
        hasVariants: true, variantTypes: form.variantTypes, parentId: null,
        createdAt: editMaterial ? editMaterial.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const children = previewSKUs.map((skuInfo, idx) => ({
        id: editMaterial ? `mat-${Date.now()}-${idx}` : `mat-${Date.now()}-${idx}`,
        name: `${form.name} - ${skuInfo.variantName}`,
        sku: skuInfo.sku, category: form.category, uom: form.uom,
        stockQty: 0, minStock, baseCost,
        procurementType: form.procurementType,
        allowBackorder: form.procurementType === 'stock' ? form.allowBackorder : false,
        preferredVendorId: form.preferredVendorId,
        hasVariants: false, variantTypes: [], parentId: parentId,
        variantCombo: skuInfo.comboMap,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }));
      onSave(parent, children);
    } else {
      onSave({
        id: parentId, name: form.name,
        sku: autoSku,
        category: form.category, uom: form.uom,
        stockQty: editMaterial ? editMaterial.stockQty : 0,
        minStock, baseCost,
        procurementType: form.procurementType,
        allowBackorder: form.procurementType === 'stock' ? form.allowBackorder : false,
        preferredVendorId: form.preferredVendorId,
        hasVariants: false, variantTypes: [], parentId: null,
        createdAt: editMaterial ? editMaterial.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, []);
    }
  };

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none'
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">{editMaterial ? 'Edit Material' : 'Add Material'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Name */}
            <div>
              <label className="form-label">Name <span className="required">*</span></label>
              <input type="text" style={inputStyle} value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value.slice(0, 100) }))}
                placeholder="e.g., Inner Color Mug" required maxLength={100} />
            </div>

            {/* Category + Unit */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Item / Material Category</label>
                <select style={inputStyle} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {itemCategories.length === 0 ? (
                    <option value="" style={{ background: 'var(--dark)', color: 'var(--gray)' }}>Add a vendor first to see categories</option>
                  ) : (
                    itemCategories.map(c => <option key={c} value={c} style={{ background: 'var(--dark)', color: 'var(--white)' }}>{c}</option>)
                  )}
                </select>
              </div>
              <div>
                <label className="form-label">
                  Unit
                  {editMaterial && editMaterial.stockQty > 0 && (
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginLeft: '0.5rem', fontWeight: 600 }}>
                      (Locked: Stock exists)
                    </span>
                  )}
                </label>
                <select
                  style={{ ...inputStyle, opacity: editMaterial && editMaterial.stockQty > 0 ? 0.5 : 1, cursor: editMaterial && editMaterial.stockQty > 0 ? 'not-allowed' : 'pointer' }}
                  value={form.uom}
                  onChange={e => setForm(p => ({ ...p, uom: e.target.value }))}
                  disabled={editMaterial && editMaterial.stockQty > 0}
                >
                  <option value="pcs">Pieces</option>
                  <option value="bottle">Bottle</option>
                  <option value="liter">Liter</option>
                  <option value="kg">Kilogram</option>
                  <option value="meter">Meter</option>
                  <option value="roll">Roll</option>
                  <option value="box">Box</option>
                </select>
              </div>
            </div>

            {/* Base Cost + Min Stock — empty by default */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Base Cost (P)</label>
                <DecimalInput style={inputStyle} value={form.baseCost}
                  onChange={e => setForm(p => ({ ...p, baseCost: e.target.value }))}
                  placeholder="0.00" />
              </div>
              <div>
                <label className="form-label">Min Stock</label>
                <IntegerInput style={inputStyle} value={form.minStock}
                  onChange={e => setForm(p => ({ ...p, minStock: e.target.value }))}
                  min={0} placeholder="10" />
              </div>
            </div>

            {/* Procurement Type */}
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Procurement Type
                <Tooltip text={
                  form.procurementType === 'stock'
                    ? 'Stock: Items kept in inventory. Enable backorder to allow sales when stock hits zero.'
                    : 'On-Demand: Items sourced only after a customer order is placed. Always purchasable regardless of stock level.'
                }>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ cursor: 'help' }}>
                    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </Tooltip>
              </label>
              <select style={inputStyle} value={form.procurementType} onChange={e => setForm(p => ({ ...p, procurementType: e.target.value }))}>
                <option value="stock">Stock (Make to Stock)</option>
                <option value="on-demand">On-Demand (Make to Order)</option>
              </select>
              {form.procurementType === 'on-demand' && (
                <div style={{ fontSize: '0.72rem', color: '#818cf8', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Always purchasable — no stock limit enforced
                </div>
              )}
            </div>

            {/* Allow Backorder — ONLY for Stock type */}
            {form.procurementType === 'stock' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                <input type="checkbox" id="allowBackorder" checked={form.allowBackorder}
                  onChange={e => setForm(p => ({ ...p, allowBackorder: e.target.checked }))}
                  style={{ width: '16px', height: '16px', accentColor: '#D4A843' }} />
                <label htmlFor="allowBackorder" style={{ fontSize: '0.85rem', color: '#E5E2E1', cursor: 'pointer', fontWeight: 600 }}>
                  Allow Backorder
                </label>
                <Tooltip text="Allow customers to purchase even when stock reaches zero. Orders will be fulfilled once restocked.">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ cursor: 'help' }}>
                    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </Tooltip>
              </div>
            )}

            {/* Preferred Vendor */}
            <div>
              <label className="form-label">Preferred Vendor</label>
              <select style={inputStyle} value={form.preferredVendorId} onChange={e => setForm(p => ({ ...p, preferredVendorId: e.target.value }))}>
                <option value="">Select a vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.5rem 0' }}></div>

            {/* Has Variants */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input type="checkbox" id="hasVariants" checked={form.hasVariants}
                onChange={e => setForm(p => ({ ...p, hasVariants: e.target.checked, variantTypes: e.target.checked ? p.variantTypes : [] }))}
                style={{ width: '16px', height: '16px', accentColor: '#D4A843' }} />
              <label htmlFor="hasVariants" style={{ fontSize: '0.85rem', color: '#E5E2E1', cursor: 'pointer', fontWeight: 600 }}>This material has variants (e.g., Size, Color)</label>
            </div>

            {/* Variant Types — Old Inventory Style */}
            {form.hasVariants && form.name.trim() && (
              <div>
                <label className="form-label">
                  Variant Types
                  <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional — e.g., Capacity, Color, Size)</span>
                </label>
                <p className="form-hint" style={{ marginBottom: '1rem' }}>
                  Define product variations. All variant types will be included in SKU generation and stock tracking.
                </p>

                {/* Variant Types List */}
                {form.variantTypes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                    {form.variantTypes.map((vt, typeIdx) => (
                      <div key={vt.id} style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem' }}>
                        {/* Variant Type Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--gray)', background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
                              Type {typeIdx + 1}
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.9rem' }}>{vt.name}</span>

                            {/* Stockable Checkbox */}
                            <label style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              marginLeft: '0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                              color: vt.isStockable !== false ? 'var(--gold, #D4A843)' : 'var(--gray)',
                              fontWeight: 600,
                              background: vt.isStockable !== false ? 'rgba(212,168,67,0.12)' : 'rgba(100,100,100,0.12)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '20px',
                              border: vt.isStockable !== false ? '1px solid rgba(212,168,67,0.3)' : '1px solid rgba(100,100,100,0.3)'
                            }}
                            title={vt.isStockable !== false ? 'Stockable - Will create inventory items' : 'Not Stockable - For pricing/options only'}
                            >
                              <input
                                type="checkbox"
                                checked={vt.isStockable !== false}
                                onChange={() => toggleStockable(typeIdx)}
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  cursor: 'pointer',
                                  accentColor: 'var(--gold, #D4A843)'
                                }}
                              />
                              {vt.isStockable !== false ? 'Stockable' : 'Not Stockable'}
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeVariantType(typeIdx)}
                            style={{
                              background: '#7f1d1d',
                              border: '1px solid #ef4444',
                              color: '#fca5a5',
                              borderRadius: '6px',
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Remove Type
                          </button>
                        </div>

                        {/* Variant Options Chips */}
                        {vt.options.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                            {vt.options.map((opt, optIdx) => (
                              <span key={optIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', background: 'rgba(100,100,100,0.12)', border: '1px solid rgba(100,100,100,0.35)', borderRadius: '20px', fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>
                                {opt}
                                <button type="button" onClick={() => removeVariantOption(typeIdx, optIdx)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Add Option Input */}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            style={{ ...inputStyle, flex: 1, padding: '0.5rem 0.65rem', fontSize: '0.8rem' }}
                            value={variantOptionInputs[typeIdx] || ''}
                            onChange={e => setVariantOptionInputs(prev => ({ ...prev, [typeIdx]: e.target.value.slice(0, 40) }))}
                            placeholder={`Add option to ${vt.name}...`}
                            maxLength={40}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariantOption(typeIdx); } }}
                          />
                          <button type="button" className="btn-primary" onClick={() => addVariantOption(typeIdx)}
                            style={{ padding: '0 1rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            + Add
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Variant Type Input */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input
                    type="text"
                    style={{ ...inputStyle, flex: 1 }}
                    value={variantTypeInput}
                    onChange={e => setVariantTypeInput(e.target.value.slice(0, 40))}
                    placeholder="Variant Type name (e.g., Capacity, Color, Size)..."
                    maxLength={40}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariantType(); } }}
                  />
                  <button type="button" className="btn-primary" onClick={addVariantType}
                    style={{ padding: '0 1rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    + Add Variant Type
                  </button>
                </div>

                {/* Combination Preview */}
                {form.variantTypes.length > 0 && getTotalCombinations() > 0 && (
                  <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: 'var(--gold)' }}>Total Combinations:</strong>
                        <span style={{ color: 'var(--white)', marginLeft: '0.5rem', fontWeight: 600 }}>
                          {getTotalCombinations()} unique SKU{getTotalCombinations() !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                        {form.variantTypes.map(vt => `${vt.options.length} ${vt.name}`).join(' × ')}
                      </div>
                    </div>
                  </div>
                )}

                <p className="form-hint">
                  {form.variantTypes.length === 0
                    ? 'No variant types — item will be stocked as a single product.'
                    : `${form.variantTypes.length} variant type(s) defined. Each combination will be a unique SKU in inventory.`}
                </p>
              </div>
            )}
          </div>
          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save Material</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Vendor Details Modal (Read-only) ───────────────────────────────────────────
function VendorDetailsModal({ vendor, onClose }) {
  if (!vendor) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title" style={{ fontSize: '1.1rem' }}>{vendor.name}</h2>
            {vendor.itemsSupplied && vendor.itemsSupplied.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
                {vendor.itemsSupplied.map((item, i) => (
                  <span key={i} style={{ fontSize: '0.65rem', color: '#D4A843', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>{item}</span>
                ))}
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem 2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {vendor.contact && (
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Contact Person</div>
                <div style={{ fontSize: '0.95rem', color: '#E5E2E1', fontWeight: 600 }}>{vendor.contact}</div>
              </div>
            )}
            {vendor.email && (
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Email</div>
                <div style={{ fontSize: '0.95rem', color: '#3b82f6', fontWeight: 600 }}>{vendor.email}</div>
              </div>
            )}
            {vendor.phone && (
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Phone</div>
                <div style={{ fontSize: '0.95rem', color: '#E5E2E1', fontWeight: 600 }}>{vendor.phone}</div>
              </div>
            )}
            {vendor.address && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Address</div>
                <div style={{ fontSize: '0.95rem', color: '#E5E2E1', fontWeight: 600 }}>{vendor.address}</div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VENDOR MASTER TAB — Card Layout
// ══════════════════════════════════════════════════════════════════════════════
function VendorMasterTab({ materials, onVendorsChange }) {
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [viewVendor, setViewVendor] = useState(null);
  const [infoModal, setInfoModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  useEffect(() => {
    setVendors(getVendors());
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vendors.filter(v => !q || v.name.toLowerCase().includes(q) || (v.contact || '').toLowerCase().includes(q) || (v.category || '').toLowerCase().includes(q));
  }, [vendors, search]);

  const handleDelete = (id) => {
    // Check if vendor is referenced by any material
    const linkedMaterials = materials.filter(m => m.preferredVendorId === id);
    if (linkedMaterials.length > 0) {
      const names = linkedMaterials.map(m => `• ${m.name}`).join('\n');
      setInfoModal({
        isOpen: true,
        title: 'Cannot Delete Vendor',
        message: `This vendor is currently linked to the following materials:\n\n${names}\n\nPlease update or delete these materials first.`,
      });
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Delete Vendor',
      message: 'Are you sure you want to delete this vendor? This action cannot be undone.',
      onConfirm: () => {
        const updated = vendors.filter(v => v.id !== id);
        setVendors(updated);
        saveVendors(updated);
        if (onVendorsChange) onVendorsChange(updated);
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
      },
    });
  };

  const handleSave = (vendor) => {
    let updated;
    if (editVendor) {
      updated = vendors.map(v => v.id === editVendor.id ? { ...v, ...vendor } : v);
    } else {
      updated = [...vendors, { ...vendor, id: `vendor-${Date.now()}`, createdAt: new Date().toISOString() }];
    }
    setVendors(updated);
    saveVendors(updated);
    if (onVendorsChange) onVendorsChange(updated);
    setShowAddModal(false);
    setEditVendor(null);
  };

  const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>;
  const EyeIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
  const EditIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;

  return (
    <div>
      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{vendors.length}</span>
            <span className="summary-label">Total Vendors</span>
          </div>
        </div>
      </div>

      <div className="inventory-toolbar" style={{ marginBottom: '1.5rem' }}>
        <div className="search-wrapper" style={{ maxWidth: '300px' }}>
          <span className="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input className="search-input" placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}>x</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {filtered.map(v => (
          <div key={v.id} style={{
            background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '12px',
            padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
            transition: 'border-color 0.2s', cursor: 'pointer',
          }}
            onClick={() => setViewVendor(v)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--dark)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', fontWeight: 800, color: '#3b82f6', flexShrink: 0,
              }}>
                {v.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem' }}>{v.name}</div>
                {v.itemsSupplied && v.itemsSupplied.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.3rem' }}>
                    {v.itemsSupplied.slice(0, 3).map((item, i) => (
                      <span key={i} style={{ fontSize: '0.6rem', color: '#D4A843', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.15)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontWeight: 600 }}>{item}</span>
                    ))}
                    {v.itemsSupplied.length > 3 && (
                      <span style={{ fontSize: '0.6rem', color: 'var(--gray)' }}>+{v.itemsSupplied.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.825rem' }}>
              {v.contact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#E5E2E1' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {v.contact}
                </div>
              )}
              {v.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {v.email}
                </div>
              )}
              {v.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                  {v.phone}
                </div>
              )}
              {v.address && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {v.address}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setViewVendor(v)} style={{
                flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--gray)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
              }}><EyeIcon /> View</button>
              <button onClick={() => { setEditVendor(v); setShowAddModal(true); }} style={{
                flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--gray)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
              }}><EditIcon /> Edit</button>
              <button onClick={() => handleDelete(v.id)} style={{
                padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px', color: '#f87171', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><TrashIcon /></button>
            </div>
          </div>
        ))}

        <div onClick={() => setShowAddModal(true)} style={{
          background: 'transparent', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '12px',
          padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '0.75rem', cursor: 'pointer', minHeight: '200px',
          transition: 'border-color 0.2s, background 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'; e.currentTarget.style.background = 'rgba(212,168,67,0.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
          <span style={{ fontSize: '0.875rem', color: 'var(--gray)', fontWeight: 600 }}>Add New Vendor</span>
        </div>
      </div>

      {showAddModal && (
        <VendorFormModal vendor={editVendor} allVendors={vendors} onClose={() => { setShowAddModal(false); setEditVendor(null); }} onSave={handleSave} />
      )}
      {viewVendor && (
        <VendorDetailsModal
          vendor={viewVendor}
          onClose={() => setViewVendor(null)}
        />
      )}
      <InfoModal
        isOpen={infoModal.isOpen}
        onClose={() => setInfoModal({ isOpen: false, title: '', message: '' })}
        title={infoModal.title}
        message={infoModal.message}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Delete"
        confirmClass="btn-danger"
      />
    </div>
  );
}

function VendorFormModal({ vendor, allVendors, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', contact: '', itemsSupplied: [], email: '', phone: '', address: '' });
  const [itemInput, setItemInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Collect all unique items from all vendors
  const allKnownItems = useMemo(() => {
    const items = new Set();
    (allVendors || []).forEach(v => {
      (v.itemsSupplied || []).forEach(item => items.add(item));
    });
    return [...items].sort();
  }, [allVendors]);

  // Filter suggestions based on current input
  const suggestions = useMemo(() => {
    if (!itemInput.trim()) return allKnownItems;
    return allKnownItems.filter(i => i.toLowerCase().includes(itemInput.toLowerCase()));
  }, [itemInput, allKnownItems]);

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name || '', contact: vendor.contact || '', itemsSupplied: vendor.itemsSupplied || [],
        email: vendor.email || '', phone: vendor.phone || '', address: vendor.address || '',
      });
    }
  }, [vendor]);

  const addItem = (item) => {
    const trimmed = (item || itemInput).trim();
    if (!trimmed) return;
    if (form.itemsSupplied.some(i => i.toLowerCase() === trimmed.toLowerCase())) return;
    setForm(p => ({ ...p, itemsSupplied: [...p.itemsSupplied, trimmed] }));
    setItemInput('');
    setShowSuggestions(false);
  };

  const removeItem = (idx) => {
    setForm(p => ({ ...p, itemsSupplied: p.itemsSupplied.filter((_, i) => i !== idx) }));
  };

  const handleItemKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
    if (e.key === 'Backspace' && itemInput === '' && form.itemsSupplied.length > 0) {
      removeItem(form.itemsSupplied.length - 1);
    }
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/[^0-9+]/g, '');
    if (val.startsWith('+63')) {
      val = '+63' + val.slice(3).replace(/[^0-9]/g, '').slice(0, 10);
    } else if (val.startsWith('0')) {
      val = '0' + val.slice(1).replace(/[^0-9]/g, '').slice(0, 10);
    } else if (val.startsWith('63')) {
      val = '+63' + val.slice(2).replace(/[^0-9]/g, '').slice(0, 10);
    } else {
      val = val.replace(/[^0-9]/g, '').slice(0, 11);
      if (val.length > 0 && !val.startsWith('0')) val = '0' + val;
    }
    setForm(p => ({ ...p, phone: val }));
  };

  const handleSubmit = (e) => { e.preventDefault(); if (!form.name.trim()) return; onSave({ ...form }); };
  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{vendor ? 'Edit Vendor' : 'Add New Vendor'}</h2>
          <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">Company Name <span className="required">*</span></label>
              <input type="text" style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value.slice(0, 100) }))} placeholder="e.g., Global Garments Inc." required maxLength={100} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Contact Person</label>
                <input type="text" style={inputStyle} value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value.slice(0, 80) }))} placeholder="Juan Dela Cruz" maxLength={80} />
              </div>
              <div style={{ position: 'relative' }}>
                <label className="form-label">Items Supplied</label>
                <div style={{
                  ...inputStyle, display: 'flex', flexWrap: 'wrap', gap: '0.35rem',
                  padding: '0.4rem 0.5rem', minHeight: '42px', alignItems: 'center', cursor: 'text',
                }} onClick={() => document.getElementById('itemInput')?.focus()}>
                  {form.itemsSupplied.map((item, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      fontSize: '0.72rem', color: '#D4A843', background: 'rgba(212,168,67,0.1)',
                      border: '1px solid rgba(212,168,67,0.2)', padding: '0.15rem 0.5rem',
                      borderRadius: '4px', fontWeight: 600,
                    }}>
                      {item}
                      <button type="button" onClick={() => removeItem(i)} style={{
                        background: 'none', border: 'none', color: '#D4A843', cursor: 'pointer',
                        padding: 0, lineHeight: 1, fontSize: '0.85rem',
                      }}>×</button>
                    </span>
                  ))}
                  <input
                    id="itemInput"
                    type="text"
                    value={itemInput}
                    onChange={e => { setItemInput(e.target.value.slice(0, 40)); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onKeyDown={handleItemKeyDown}
                    placeholder={form.itemsSupplied.length === 0 ? 'Type or select...' : 'Add more...'}
                    style={{
                      background: 'none', border: 'none', outline: 'none', color: '#E5E2E1',
                      fontSize: '0.8rem', flex: 1, minWidth: '80px', padding: '0.15rem 0',
                    }}
                  />
                </div>
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: '#1a1a1a', border: '1px solid var(--border)', borderRadius: '8px',
                    maxHeight: '160px', overflowY: 'auto', marginTop: '0.25rem',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    {suggestions.filter(s => !form.itemsSupplied.some(i => i.toLowerCase() === s.toLowerCase())).map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => addItem(item)}
                        style={{
                          display: 'block', width: '100%', padding: '0.5rem 0.75rem',
                          background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                          color: '#E5E2E1', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,168,67,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Email</label>
                <input type="email" style={inputStyle} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value.slice(0, 100) }))} placeholder="vendor@email.com" maxLength={100} />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input type="text" style={inputStyle} value={form.phone} onChange={handlePhoneChange} placeholder="09xx-xxx-xxxx" maxLength={15} inputMode="tel" />
              </div>
            </div>
            <div>
              <label className="form-label">Address</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value.slice(0, 200) }))} placeholder="Full address" maxLength={200} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{vendor ? 'Save Changes' : 'Save Vendor'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BOM TAB
// ══════════════════════════════════════════════════════════════════════════════
function BOMTab() {
  const [boms, setBOMs] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editBOM, setEditBOM] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  useEffect(() => {
    setBOMs(getBOMs());
    setMaterials(getMaterials());
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return boms.filter(b => !q || b.productName.toLowerCase().includes(q) || (b.sku || '').toLowerCase().includes(q));
  }, [boms, search]);

  const handleDelete = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete BOM',
      message: 'Are you sure you want to delete this BOM? This action cannot be undone.',
      onConfirm: () => {
        const updated = boms.filter(b => b.id !== id);
        setBOMs(updated);
        saveBOMs(updated);
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
      },
    });
  };

  const handleSave = (bom) => {
    let updated;
    if (editBOM) {
      updated = boms.map(b => b.id === bom.id ? bom : b);
    } else {
      updated = [...boms, { ...bom, id: `bom-${Date.now()}`, createdAt: new Date().toISOString() }];
    }
    setBOMs(updated);
    saveBOMs(updated);
    setShowAddModal(false);
    setEditBOM(null);
  };

  const EditIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
  const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>;

  return (
    <div>
      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{boms.length}</span>
            <span className="summary-label">Total BOMs</span>
          </div>
        </div>
      </div>

      <div className="inventory-toolbar" style={{ marginBottom: '1rem' }}>
        <div className="search-wrapper" style={{ maxWidth: '300px' }}>
          <span className="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input className="search-input" placeholder="Search BOMs..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}>x</button>}
        </div>
        <button className="btn-primary" onClick={() => { setEditBOM(null); setShowAddModal(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add BOM
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--dark)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Product</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Components</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Cost</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                {boms.length === 0 ? 'No BOMs yet. Click "Add BOM" to define product recipes.' : 'No BOMs match your search.'}
              </td></tr>
            ) : (
              filtered.map(b => {
                const totalCost = (b.components || []).reduce((sum, c) => {
                  const mat = materials.find(m => m.id === c.materialId);
                  return sum + ((mat?.baseCost || 0) * (c.qty || 1));
                }, 0);
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#E5E2E1' }}>{b.productName}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{b.sku || '—'}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#E5E2E1' }}>{(b.components || []).length} items</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#D4A843' }}>P{totalCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                        <button onClick={() => { setEditBOM(b); setShowAddModal(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray)' }}><EditIcon /></button>
                        <button onClick={() => handleDelete(b.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: '#f87171' }}><TrashIcon /></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <BOMFormModal bom={editBOM} materials={materials} onClose={() => { setShowAddModal(false); setEditBOM(null); }} onSave={handleSave} />
      )}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Delete"
        confirmClass="btn-danger"
      />
    </div>
  );
}

function BOMFormModal({ bom, materials, onClose, onSave }) {
  const [form, setForm] = useState({ productName: '', sku: '', components: [] });
  useEffect(() => {
    if (bom) setForm({ productName: bom.productName || '', sku: bom.sku || '', components: bom.components || [] });
  }, [bom]);
  const addComponent = () => setForm(p => ({ ...p, components: [...p.components, { materialId: '', qty: 1 }] }));
  const removeComponent = (idx) => setForm(p => ({ ...p, components: p.components.filter((_, i) => i !== idx) }));
  const updateComponent = (idx, field, value) => setForm(p => {
    const comps = [...p.components];
    comps[idx] = { ...comps[idx], [field]: value };
    return { ...p, components: comps };
  });
  const handleSubmit = (e) => { e.preventDefault(); if (!form.productName.trim()) return; onSave({ ...bom, ...form }); };
  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{bom ? 'Edit BOM' : 'Add BOM'}</h2>
          <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <div><label className="form-label">Product Name <span className="required">*</span></label><input type="text" style={inputStyle} value={form.productName} onChange={e => setForm(p => ({ ...p, productName: e.target.value.slice(0, 100) }))} placeholder="Custom Mug 11oz" required maxLength={100} /></div>
              <div><label className="form-label">SKU</label><input type="text" style={inputStyle} value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value.replace(/[^A-Za-z0-9\-]/g, '').slice(0, 50) }))} placeholder="Auto" maxLength={50} /></div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Components / Recipe</label>
                <button type="button" onClick={addComponent} style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '6px', padding: '0.3rem 0.75rem', color: '#D4A843', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>+ Add Component</button>
              </div>
              {form.components.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)' }}>No components added yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {form.components.map((comp, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 36px', gap: '0.5rem', alignItems: 'center' }}>
                      <select style={inputStyle} value={comp.materialId} onChange={e => updateComponent(idx, 'materialId', e.target.value)}>
                        <option value="">Select material...</option>
                        {materials.filter(m => !m.parentId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <IntegerInput style={inputStyle} value={comp.qty} onChange={e => updateComponent(idx, 'qty', e.target.value)} min={0} placeholder="1" />
                      <button type="button" onClick={() => removeComponent(idx)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: '#f87171', fontSize: '0.8rem' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{bom ? 'Save Changes' : 'Add BOM'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState('materials');
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    setVendors(getVendors());
    setMaterials(getMaterials());
  }, []);

  // Collect all unique items from all vendors' itemsSupplied
  const itemCategories = useMemo(() => {
    const items = new Set();
    vendors.forEach(v => {
      (v.itemsSupplied || []).forEach(item => items.add(item));
    });
    return [...items].sort();
  }, [vendors]);

  const tabStyle = (tab) => ({
    padding: '0.625rem 1.25rem',
    fontSize: '0.825rem',
    fontWeight: 700,
    cursor: 'pointer',
    borderRadius: '8px',
    border: 'none',
    background: activeTab === tab ? 'var(--gold)' : 'transparent',
    color: activeTab === tab ? '#000' : 'var(--gray)',
    transition: 'all 0.15s',
  });

  return (
    <div className="page-content-wrapper">
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Master Data</h1>
            <p className="page-subtitle">Manage materials, vendors, and bill of materials.</p>
          </div>
          <Link href="/dashboard/business/inventory-old" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', padding: '0.5rem 1rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Old Inventory
          </Link>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '0.25rem', width: 'fit-content' }}>
          <button style={tabStyle('materials')} onClick={() => setActiveTab('materials')}>Material Master</button>
          <button style={tabStyle('vendors')} onClick={() => setActiveTab('vendors')}>Vendor Master</button>
          <button style={tabStyle('bom')} onClick={() => setActiveTab('bom')}>BOM</button>
        </div>
      </div>

      {activeTab === 'materials' && <MaterialMasterTab itemCategories={itemCategories} materials={materials} onMaterialsChange={setMaterials} />}
      {activeTab === 'vendors' && <VendorMasterTab materials={materials} onVendorsChange={setVendors} />}
      {activeTab === 'bom' && <BOMTab />}
    </div>
  );
}
