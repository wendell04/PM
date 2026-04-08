'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import CustomDropdown from '@/app/components/CustomDropdown';

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

// ── Batch Management Helpers ─────────────────────────────────────────────────
// Generate unique batch ID: YYYYMMDD-TIMESTAMP-SEQ
function generateBatchId() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${dateStr}-${timestamp}-${seq}`;
}

// Compute total stock from batches (sum of remainingQty)
function computeStockFromBatches(batches) {
  if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
  return batches.reduce((sum, b) => sum + ((b.remainingQty || b.goodQty || b.qtyGood || 0)), 0);
}

// Compute FIFO cost = unit cost of the OLDEST active batch (next batch to be issued)
function computeAveCostFromBatches(batches) {
  if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
  const oldest = [...batches]
    .filter(b => (b.remainingQty || 0) > 0)
    .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))[0];
  return oldest ? (oldest.unitCost || 0) : 0;
}

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

// Get 2-letter prefix from a string: 1st letter of each word (up to 2 words)
// Examples: "Canvas Totebags" → "CT", "T-Shirts" → "TS", "Totebag" → "TO"
function getPrefix(str) {
  const words = str.replace(/[^A-Za-z0-9\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  // Single word → first 2 letters
  const cleaned = words[0] || '';
  return cleaned.substring(0, 2).toUpperCase() || 'XX';
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
    // Sort entries by key name for consistent combo keys across sessions
    const key = Object.entries(combo).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}:${v}`).join('|');
    const sku = genComboSKU(category, productName, combo, allOptionsPerType, existingMaterials);
    return { comboKey: key, comboLabel: label, comboMap: combo, sku, variantName: Object.values(combo).join(' ') };
  });
}

function CategoryBadge({ category }) {
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
    <div className="modal-overlay">
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
    <div className="modal-overlay">
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

  // Compute stock from batches if available
  const stockFromBatches = material.batches && Array.isArray(material.batches) && material.batches.length > 0
    ? material.batches.reduce((sum, b) => sum + ((b.remainingQty || b.goodQty || b.qtyGood || 0)), 0)
    : null;
  const displayStock = stockFromBatches !== null ? stockFromBatches : (material.stockQty || 0);

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title" style={{ fontSize: '1.1rem' }}>{material.name}</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.2rem' }}>{material.sku || '—'}</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem 2rem', maxHeight: '60vh', overflowY: 'auto' }}>
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
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#22c55e' }}>{displayStock} {material.uom || 'pcs'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Base Cost (AVE)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#D4A843' }}>₱{(material.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Preferred Vendor</div>
              <div style={{ fontSize: '0.95rem', color: vendor ? '#3b82f6' : 'var(--gray)', fontWeight: 600 }}>{vendor?.name || '—'}</div>
            </div>
          </div>

          {/* Batch Details Section */}
          {material.batches && material.batches.length > 0 && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                Batches ({material.batches.length})
              </div>
              {material.batches.sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived)).map((batch, idx) => (
                <div key={batch.batchId} style={{
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  marginBottom: idx < material.batches.length - 1 ? '0.5rem' : '0',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#E5E2E1', fontWeight: 600, fontFamily: 'monospace' }}>{batch.batchId}</div>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px',
                      background: batch.status === 'exhausted' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                      color: batch.status === 'exhausted' ? '#ef4444' : '#22c55e',
                      border: `1px solid ${batch.status === 'exhausted' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                    }}>
                      {batch.status === 'exhausted' ? 'Exhausted' : `${batch.remainingQty || 0} remaining`}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.7rem' }}>
                    <div><span style={{ color: 'var(--gray)' }}>Vendor:</span> <span style={{ color: '#E5E2E1' }}>{batch.vendorName || '—'}</span></div>
                    <div><span style={{ color: 'var(--gray)' }}>Received:</span> <span style={{ color: '#E5E2E1' }}>{new Date(batch.dateReceived).toLocaleDateString('en-PH')}</span></div>
                    <div><span style={{ color: 'var(--gray)' }}>Good Qty:</span> <span style={{ color: '#22c55e' }}>{batch.qtyGood || 0} {material.uom || 'pcs'}</span></div>
                    <div><span style={{ color: 'var(--gray)' }}>Unit Cost:</span> <span style={{ color: '#D4A843', fontFamily: 'monospace' }}>₱{(batch.unitCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    {batch.poNumber && <div><span style={{ color: 'var(--gray)' }}>PO:</span> <span style={{ color: '#3b82f6', fontFamily: 'monospace' }}>{batch.poNumber}</span></div>}
                    {batch.grNumber && <div><span style={{ color: 'var(--gray)' }}>GR:</span> <span style={{ color: '#3b82f6', fontFamily: 'monospace' }}>{batch.grNumber}</span></div>}
                  </div>
                </div>
              ))}
            </div>
          )}

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
function MaterialMasterTab({ itemCategories, materials, onMaterialsChange, onVendorsChange }) {
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMaterial, setEditMaterial] = useState(null);
  const [viewMaterial, setViewMaterial] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showCategoryInput, setShowCategoryInput] = useState(false);

  useEffect(() => {
    setVendors(getVendors());
  }, []);

  // ── Batch Helper: Compute stock from batches ──────────────────────────────
  const getStockQty = (material) => {
    if (material.batches && Array.isArray(material.batches) && material.batches.length > 0) {
      return material.batches.reduce((sum, b) => sum + ((b.remainingQty || b.goodQty || b.qtyGood || 0)), 0);
    }
    return material.stockQty || 0;
  };

  // Handler to add a new category
  const handleAddCategory = () => {
    setShowCategoryInput(true);
    setNewCategoryInput('');
  };

  const handleSaveCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) { setShowCategoryInput(false); return; }
    if (itemCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setShowCategoryInput(false);
      return;
    }
    // Add to all vendors' itemsSupplied
    const updatedVendors = vendors.map(v => ({
      ...v,
      itemsSupplied: v.itemsSupplied.includes(trimmed) ? v.itemsSupplied : [...(v.itemsSupplied || []), trimmed],
    }));
    setVendors(updatedVendors);
    saveVendors(updatedVendors);
    if (onVendorsChange) onVendorsChange(updatedVendors);
    setShowCategoryInput(false);
    setNewCategoryInput('');
  };

  // Handler to open vendor add modal
  const handleAddVendor = () => {
    setShowAddModal(false);
    setEditMaterial(null);
    setShowVendorModal(true);
  };

  const handleSaveVendorFromMaterial = (vendor) => {
    const updated = [...vendors, { ...vendor, id: `vendor-${Date.now()}`, createdAt: new Date().toISOString() }];
    setVendors(updated);
    saveVendors(updated);
    if (onVendorsChange) onVendorsChange(updated);
    setShowVendorModal(false);
    // Re-open material modal
    setShowAddModal(true);
  };

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
      if (matchSearch && matchCat) result.push({ type: 'standalone', item: m });
    }
    for (const parent of groupedMaterials.parents) {
      const matchSearch = !q || parent.name.toLowerCase().includes(q) || (parent.sku || '').toLowerCase().includes(q);
      const matchCat = !categoryFilter || parent.category === categoryFilter;
      if (matchSearch && matchCat) {
        const children = (groupedMaterials.childrenMap.get(parent.id) || []).filter(c => {
          if (!q) return true;
          return c.name.toLowerCase().includes(q) || (c.sku || '').toLowerCase().includes(q);
        });
        result.push({ type: 'parent', item: parent, children });
      }
    }
    return result;
  }, [search, categoryFilter, groupedMaterials]);

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

  const handleSave = (material, children, oldChildIds = []) => {
    let updated;
    if (editMaterial) {
      // Update existing
      updated = materials.map(m => {
        if (m.id === editMaterial.id) return { ...m, ...material, updatedAt: new Date().toISOString() };
        return m;
      });
      // Remove old children if updating variants
      if (editMaterial.hasVariants) {
        updated = updated.filter(m => m.parentId !== editMaterial.id);
      }
      // Also remove any old children that were deleted (no longer in new children list)
      if (oldChildIds.length > 0) {
        updated = updated.filter(m => !oldChildIds.includes(m.id));
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

  const totalMaterials = materials.filter(m => !m.parentId && !m.hasVariants).length + materials.filter(m => m.parentId).length;

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
          <CustomDropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: '', label: 'All Categories' },
              ...itemCategories.map(c => ({ value: c, label: c })),
            ]}
            placeholder="All Categories"
            style={{ minWidth: '140px' }}
          />
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
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Base Cost</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMaterials.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                  {materials.length === 0 ? 'No materials yet. Click "Add Material" to get started.' : 'No materials match your filters.'}
                </td>
              </tr>
            ) : (
              filteredMaterials.map((row) => {
                if (row.type === 'standalone') {
                  const m = row.item;
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '0.875rem 1rem' }}></td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.875rem' }}>{m.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.15rem' }}>{m.sku || '—'}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}><CategoryBadge category={m.category} /></td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: '#E5E2E1' }}>₱{(m.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
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

                return (
                  <React.Fragment key={parent.id}>
                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)', background: 'rgba(212,168,67,0.02)', cursor: 'pointer' }}
                      onClick={() => toggleExpand(parent.id)}
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
                            <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700, background: 'rgba(212,168,67,0.15)', color: '#D4A843', flexShrink: 0 }}>Has Variants</span>
                          )}
                        </div>
                        {parent.variantTypes && parent.variantTypes.length > 0 && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
                            {parent.variantTypes.map(vt => `${vt.name}: ${vt.options.join(', ')}`).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}><CategoryBadge category={parent.category} /></td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: '#E5E2E1' }}>
                        {parent.hasVariants && children.length > 0 ? (() => {
                          const costs = children.map(c => c.baseCost || 0).filter(c => c > 0);
                          const min = Math.min(...costs);
                          const max = Math.max(...costs);
                          if (min === max) return `P${min.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E5E2E1' }}>
                                ₱{min.toLocaleString('en-PH', { minimumFractionDigits: 2 })} – ₱{max.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </span>
                              <span style={{ fontSize: '0.6rem', color: 'var(--gray)' }}>{children.length} variants</span>
                            </div>
                          );
                        })() : `P${(parent.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                          <button onClick={() => { setEditMaterial(parent); setShowAddModal(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray)' }}><EditIcon /></button>
                          <button onClick={() => setViewMaterial(parent)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: 'var(--gray)' }}><EyeIcon /></button>
                          <button onClick={() => handleDelete(parent.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', color: '#f87171' }}><TrashIcon /></button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && children.map(child => (
                      <tr key={child.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.15)' }}
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
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#E5E2E1' }}>₱{(child.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
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
          onAddCategory={handleAddCategory}
          onAddVendor={handleAddVendor}
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

      {/* Category Input Modal */}
      {showCategoryInput && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Add New Category</h2>
              <button className="modal-close" onClick={() => { setShowCategoryInput(false); setNewCategoryInput(''); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <label className="form-label">Category Name</label>
              <input
                type="text"
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none' }}
                value={newCategoryInput}
                onChange={e => setNewCategoryInput(e.target.value.slice(0, 50))}
                placeholder="e.g., Mugs, Packaging..."
                maxLength={50}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory(); }}
              />
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => { setShowCategoryInput(false); setNewCategoryInput(''); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveCategory}>Add Category</button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Add Modal (from Material form) */}
      {showVendorModal && (
        <VendorFormModal
          vendor={null}
          allVendors={vendors}
          materials={materials}
          onClose={() => { setShowVendorModal(false); setShowAddModal(true); }}
          onSave={handleSaveVendorFromMaterial}
        />
      )}
    </div>
  );
}

// ── Material Form Modal ────────────────────────────────────────────────────────
function MaterialFormModal({ itemCategories, vendors, materials, editMaterial, onClose, onSave, onAddCategory, onAddVendor }) {
  const [form, setForm] = useState({
    name: '', category: itemCategories[0] || '', uom: 'pcs',
    minStock: '', baseCost: '',
    procurementType: 'stock', allowBackorder: false,
    preferredVendorId: '',
    hasVariants: false, variantTypes: [],
  });
  const [previewSKUs, setPreviewSKUs] = useState([]);
  const [variantCosts, setVariantCosts] = useState({});
  const [variantTypeInput, setVariantTypeInput] = useState('');
  const [variantOptionInputs, setVariantOptionInputs] = useState({});
  const [variantTypeRemoveModal, setVariantTypeRemoveModal] = useState(false);
  const [variantTutorialOpen, setVariantTutorialOpen] = useState(false);
  const [errors, setErrors] = useState({});

  // Find which variant options are locked (used by existing child materials with stock)
  const lockedOptions = useMemo(() => {
    if (!editMaterial || !editMaterial.hasVariants) return {};
    const locked = {};
    // Find all child materials of this parent
    const children = materials.filter(m => m.parentId === editMaterial.id);
    children.forEach(child => {
      if (child.variantCombo) {
        Object.entries(child.variantCombo).forEach(([typeName, optionVal]) => {
          const key = `${typeName}::${optionVal}`;
          locked[key] = true;
        });
      }
    });
    return locked;
  }, [editMaterial, materials]);

  // Check if a variant type has any locked options
  const hasLockedOptions = (typeIdx) => {
    if (!editMaterial || !editMaterial.hasVariants) return false;
    const vt = form.variantTypes[typeIdx];
    if (!vt) return false;
    return vt.options.some(opt => lockedOptions[`${vt.name}::${opt}`]);
  };

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
      // Populate variantCosts from existing children
      if (editMaterial.hasVariants) {
        const costs = {};
        const children = materials.filter(m => m.parentId === editMaterial.id);
        children.forEach(child => {
          if (child.variantCombo) {
            // Sort entries by key name to match the sorted comboKey from generateVariantSKUs
            const key = Object.entries(child.variantCombo).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}:${v}`).join('|');
            costs[key] = String(child.baseCost || 0);
          }
        });
        setVariantCosts(costs);
      } else {
        setVariantCosts({});
      }
    } else {
      // Reset for add mode
      setForm({
        name: '', category: itemCategories[0] || '', uom: 'pcs',
        minStock: '', baseCost: '',
        procurementType: 'stock', allowBackorder: false,
        preferredVendorId: '',
        hasVariants: false, variantTypes: [],
      });
      setVariantCosts({});
    }
  }, [editMaterial, itemCategories, materials]);

  // Get items supplied by the selected vendor — each with {name, uom}
  const vendorItems = useMemo(() => {
    if (!form.preferredVendorId) return [];
    const selectedVendor = vendors.find(v => v.id === form.preferredVendorId);
    if (!selectedVendor) return [];
    // Normalize: handle old string format and new object format
    return (selectedVendor.itemsSupplied || []).map(item => {
      if (typeof item === 'string') return { name: item, uom: 'pcs' };
      return item;
    });
  }, [form.preferredVendorId, vendors]);

  useEffect(() => {
    if (form.procurementType === 'on-demand') {
      setForm(p => ({ ...p, allowBackorder: false }));
    }
  }, [form.procurementType]);

  // When vendor changes, clear category if it's not in the vendor's items
  useEffect(() => {
    const vendorItemNames = vendorItems.map(i => i.name);
    if (vendorItemNames.length > 0 && form.category && !vendorItemNames.includes(form.category)) {
      setForm(p => ({ ...p, category: '', uom: 'pcs' }));
    }
  }, [vendorItems, form.category]);

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

  // Reset variantCosts on fresh add, or when switching from non-variant to variant mode
  useEffect(() => {
    if (!editMaterial) {
      setVariantCosts({});
    }
  }, [editMaterial]);

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
    const newErrors = {};
    if (!form.preferredVendorId) newErrors.vendor = 'Please select a vendor';
    if (!form.category) newErrors.category = 'Please select a category';
    if (!form.name.trim()) newErrors.name = 'Please enter an item name';
    // Validate variant types when variants are enabled
    if (form.hasVariants) {
      if (form.variantTypes.length === 0) {
        newErrors.variantTypes = 'At least one variant type is required.';
      } else {
        const emptyType = form.variantTypes.find(vt => vt.options.length === 0);
        if (emptyType) newErrors.variantTypes = `"${emptyType.name}" must have at least one option.`;
      }
    }
    // Validate variant costs when variants are enabled
    if (form.hasVariants && previewSKUs.length > 0) {
      const missingCost = previewSKUs.some(sku => {
        const cost = variantCosts[sku.comboKey];
        return cost === undefined || cost === '' || parseFloat(cost) === 0;
      });
      if (missingCost) newErrors.variantCost = 'All combinations must have a cost.';
    }
    // Validate base cost when no variants
    if (!form.hasVariants && (!form.baseCost || parseFloat(form.baseCost) === 0)) {
      newErrors.baseCost = 'Base cost is required.';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const minStock = form.minStock === '' ? 10 : parseInt(form.minStock) || 10;
    const baseCost = form.baseCost === '' ? 0 : parseFloat(form.baseCost) || 0;

    const parentId = editMaterial ? editMaterial.id : `mat-${Date.now()}`;
    const existingSku = editMaterial ? editMaterial.sku : null;
    // Preserve existing batches when editing, or initialize empty array for new materials
    const existingBatches = editMaterial ? (editMaterial.batches || []) : [];

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
        batches: existingBatches,  // ← NEW: Batch tracking array
        createdAt: editMaterial ? editMaterial.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // When editing, find existing children by variantCombo to preserve ID and SKU
      const existingChildren = editMaterial && editMaterial.hasVariants
        ? materials.filter(m => m.parentId === editMaterial.id)
        : [];
      const children = previewSKUs.map((skuInfo, idx) => {
        const comboCost = variantCosts[skuInfo.comboKey];
        const childCost = comboCost !== undefined && comboCost !== '' ? parseFloat(comboCost) || baseCost : baseCost;
        // Find matching existing child by variantCombo
        const existingChild = existingChildren.find(ec => {
          if (!ec.variantCombo) return false;
          const ecEntries = Object.entries(ec.variantCombo).sort((a, b) => a[0].localeCompare(b[0]));
          const newEntries = Object.entries(skuInfo.comboMap).sort((a, b) => a[0].localeCompare(b[0]));
          return ecEntries.length === newEntries.length && ecEntries.every((e, i) => e[0] === newEntries[i][0] && e[1] === newEntries[i][1]);
        });
        // Preserve child's existing batches when editing
        const childBatches = existingChild ? (existingChild.batches || []) : [];
        return {
          id: existingChild ? existingChild.id : `mat-${Date.now()}-${idx}`,
          name: `${form.name} - ${skuInfo.variantName}`,
          sku: existingChild ? existingChild.sku : skuInfo.sku,
          category: form.category, uom: form.uom,
          stockQty: existingChild ? (existingChild.stockQty || 0) : 0,
          minStock, baseCost: childCost,
          procurementType: form.procurementType,
          allowBackorder: form.procurementType === 'stock' ? form.allowBackorder : false,
          preferredVendorId: form.preferredVendorId,
          hasVariants: false, variantTypes: [], parentId: parentId,
          variantCombo: skuInfo.comboMap,
          batches: childBatches,  // ← NEW: Batch tracking array
          createdAt: existingChild ? existingChild.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });
      // Pass the IDs of old children to delete so handleSave can also clean up BOM and other references
      const oldChildIds = existingChildren.map(ec => ec.id).filter(id => !children.some(c => c.id === id));
      onSave(parent, children, oldChildIds);
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
        batches: existingBatches,  // ← NEW: Batch tracking array
        createdAt: editMaterial ? editMaterial.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, []);
    }
  };

  // Determine which fields are locked
  const noVendor = !form.preferredVendorId;
  const noCategory = !form.category;
  const noName = !form.name || form.name.trim() === '';

  // Item Name + Category are locked until vendor is selected
  const nameFieldsLocked = noVendor || noCategory;
  // Base Cost, Min Stock, Variants, Unit are locked until vendor + category + name are filled
  const fieldsLocked = noVendor || noCategory || noName;

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none'
  };
  const lockedStyle = { ...inputStyle, opacity: 0.35, cursor: 'not-allowed' };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">{editMaterial ? 'Edit Material' : 'Add Material'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* 1. Preferred Vendor — ALWAYS VISIBLE */}
            <div>
              <label className="form-label">
                Preferred Vendor <span className="required">*</span>
              </label>
              <div style={{ border: errors.vendor ? '1px solid #ef4444' : 'none', borderRadius: '8px' }}>
                <CustomDropdown
                  value={form.preferredVendorId}
                  onChange={(val) => {
                    if (val === '__add__') {
                      onAddVendor?.();
                    } else {
                      setForm(p => ({ ...p, preferredVendorId: val, category: '' }));
                      if (errors.vendor) setErrors(e => ({ ...e, vendor: '' }));
                    }
                  }}
                  options={[
                    { value: '', label: 'Select a vendor' },
                    ...vendors.map(v => ({ value: v.id, label: v.name })),
                    { value: '__add__', label: '+ Add New Vendor...' },
                  ]}
                  placeholder="Select a vendor..."
                />
              </div>
              {errors.vendor && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.2rem', display: 'block' }}>{errors.vendor}</span>}
              {vendors.length === 0 && !errors.vendor && (
                <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '0.3rem' }}>
                  ⚠ Add a vendor first in the Vendor Master tab
                </div>
              )}
            </div>

            {/* 2. Category + Item Name — unlocks when vendor is selected */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Item / Material Category</label>
                <div style={{ border: errors.category ? '1px solid #ef4444' : 'none', borderRadius: '8px' }}>
                  <CustomDropdown
                    value={form.category}
                    onChange={(val) => {
                      // Auto-fill unit from vendor's item definition
                      const selectedItem = vendorItems.find(i => i.name === val);
                      const autoUom = selectedItem ? (selectedItem.uom || 'pcs') : 'pcs';
                      setForm(p => ({ ...p, category: val, name: '', uom: autoUom }));
                      if (errors.category) setErrors(e => ({ ...e, category: '' }));
                    }}
                    options={vendorItems.map(item => ({ value: item.name, label: item.name }))}
                    placeholder={!form.preferredVendorId ? 'Select vendor first...' : vendorItems.length === 0 ? 'No items from this vendor' : 'Select category...'}
                    disabled={!form.preferredVendorId || vendorItems.length === 0}
                  />
                </div>
                {errors.category && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.2rem', display: 'block' }}>{errors.category}</span>}
              </div>
              <div>
                <label className="form-label">
                  Item Name <span className="required">*</span>
                </label>
                <input type="text"
                  style={{
                    ...(nameFieldsLocked ? lockedStyle : inputStyle),
                    borderColor: errors.name ? '#ef4444' : undefined,
                  }}
                  value={form.name}
                  onChange={e => {
                    setForm(p => ({ ...p, name: e.target.value.slice(0, 100) }));
                    if (errors.name) setErrors(e2 => ({ ...e2, name: '' }));
                  }}
                  placeholder={noVendor ? 'Select vendor first...' : noCategory ? 'Select category first...' : 'e.g., Inner Color Mug'}
                  required maxLength={100}
                  disabled={nameFieldsLocked} />
                {errors.name && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.2rem', display: 'block' }}>{errors.name}</span>}
              </div>
            </div>

            {/* Lock message when fields are locked */}
            {(nameFieldsLocked || fieldsLocked) && (
              <div style={{ padding: '0.75rem', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                  {!form.preferredVendorId
                    ? 'Select a vendor to unlock the form'
                    : !form.category
                    ? 'Select a category to unlock the Item Name field'
                    : !form.name || form.name.trim() === ''
                    ? 'Enter an item name to unlock the remaining fields'
                    : ''}
                </span>
              </div>
            )}

            {/* 3. All other fields — locked until both vendor AND category are selected */}
            <div style={{ opacity: fieldsLocked ? 0.4 : 1, pointerEvents: fieldsLocked ? 'none' : 'auto' }}>

              {/* Unit */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">
                  Unit
                  {editMaterial && (editMaterial.stockQty > 0 || editMaterial.hasVariants) && (
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginLeft: '0.5rem', fontWeight: 600 }}>(Locked: Cannot change when stock or variants exist)</span>
                  )}
                </label>
                <CustomDropdown
                  value={form.uom}
                  onChange={(val) => setForm(p => ({ ...p, uom: val }))}
                  options={[
                    { value: 'pcs', label: 'Pieces' },
                    { value: 'bottle', label: 'Bottle' },
                    { value: 'liter', label: 'Liter' },
                    { value: 'kg', label: 'Kilogram' },
                    { value: 'meter', label: 'Meter' },
                    { value: 'roll', label: 'Roll' },
                    { value: 'box', label: 'Box' },
                  ]}
                  placeholder="Select unit..."
                  disabled={editMaterial && (editMaterial.stockQty > 0 || editMaterial.hasVariants)}
                />
              </div>

              {/* Base Cost + Min Stock */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="form-label">
                    Base Cost {!form.hasVariants && <span className="required">*</span>}
                    {form.hasVariants && <span style={{ fontSize: '0.65rem', color: 'var(--gray)', fontWeight: 400, marginLeft: '0.5rem' }}>(Set per combination below)</span>}
                  </label>
                  <DecimalInput style={form.hasVariants ? { ...inputStyle, opacity: 0.4, cursor: 'not-allowed' } : inputStyle} value={form.baseCost}
                    onChange={e => { if (!form.hasVariants) setForm(p => ({ ...p, baseCost: e.target.value })); }}
                    placeholder="0.00" disabled={form.hasVariants} />
                  {!form.hasVariants && errors.baseCost && <span style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.2rem', display: 'block' }}>{errors.baseCost}</span>}
                </div>
                <div>
                  <label className="form-label">Min Stock</label>
                  <IntegerInput style={inputStyle} value={form.minStock}
                    onChange={e => setForm(p => ({ ...p, minStock: e.target.value }))}
                    min={0} max={999999} placeholder="10" />
                </div>
              </div>

              {/* TODO: Re-enable for future inventory management */}
              {/*
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
                <CustomDropdown
                  value={form.procurementType}
                  onChange={(val) => setForm(p => ({ ...p, procurementType: val }))}
                  options={[
                    { value: 'stock', label: 'Stock (Make to Stock)' },
                    { value: 'on-demand', label: 'On-Demand (Make to Order)' },
                  ]}
                  placeholder="Select type..."
                />
              </div>
              */}

              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.5rem 0' }}></div>

              {/* Has Variants */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <input type="checkbox" id="hasVariants" checked={form.hasVariants}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(p => ({
                      ...p,
                      hasVariants: checked,
                      variantTypes: checked ? p.variantTypes : [],
                      baseCost: checked ? '' : p.baseCost,
                    }));
                  }}
                  style={{ width: '16px', height: '16px', accentColor: '#D4A843' }}
                  disabled={editMaterial && editMaterial.hasVariants} />
                <label htmlFor="hasVariants" style={{ fontSize: '0.85rem', color: editMaterial && editMaterial.hasVariants ? 'var(--gray)' : '#E5E2E1', cursor: editMaterial && editMaterial.hasVariants ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  This material has variants (e.g., Size, Color)
                  {editMaterial && editMaterial.hasVariants && (
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', marginLeft: '0.5rem', fontWeight: 600 }}>(Locked: Variant types exist)</span>
                  )}
                </label>
              </div>

            {/* Variant Types — Old Inventory Style */}
            {form.hasVariants && form.name.trim() && (
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Variant Types <span className="required">*</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.25rem' }}>(e.g., Capacity, Color, Size)</span>
                  <button type="button" onClick={() => setVariantTutorialOpen(true)}
                    style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#D4A843', fontSize: '0.65rem', fontWeight: 800, lineHeight: 1, flexShrink: 0 }}
                    title="How to add variant types">
                    ?
                  </button>
                </label>
                <p className="form-hint" style={{ marginBottom: '1rem' }}>
                  {editMaterial && editMaterial.hasVariants && <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>Cannot uncheck: variant types already exist</span>}
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
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (hasLockedOptions(typeIdx)) {
                                setVariantTypeRemoveModal(true);
                              } else {
                                removeVariantType(typeIdx);
                              }
                            }}
                            style={{
                              background: hasLockedOptions(typeIdx) ? 'rgba(100,100,100,0.15)' : '#7f1d1d',
                              border: `1px solid ${hasLockedOptions(typeIdx) ? 'rgba(100,100,100,0.3)' : '#ef4444'}`,
                              color: hasLockedOptions(typeIdx) ? 'rgba(255,255,255,0.3)' : '#fca5a5',
                              borderRadius: '6px',
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: hasLockedOptions(typeIdx) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Remove Type
                          </button>
                        </div>

                        {/* Variant Options Chips */}
                        {vt.options.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                            {vt.options.map((opt, optIdx) => {
                              const isLocked = lockedOptions[`${vt.name}::${opt}`];
                              return (
                                <span key={optIdx} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                  padding: '0.25rem 0.6rem',
                                  background: isLocked ? 'rgba(212,168,67,0.08)' : 'rgba(100,100,100,0.12)',
                                  border: `1px solid ${isLocked ? 'rgba(212,168,67,0.3)' : 'rgba(100,100,100,0.35)'}`,
                                  borderRadius: '20px',
                                  fontSize: '0.8rem',
                                  color: isLocked ? '#D4A843' : '#9ca3af',
                                  fontWeight: 500
                                }}>
                                  {opt}
                                  {isLocked ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                                    </svg>
                                  ) : (
                                    <button type="button" onClick={() => removeVariantOption(typeIdx, optIdx)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                    </button>
                                  )}
                                </span>
                              );
                            })}
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
                {errors.variantTypes && <span style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.2rem', display: 'block', marginBottom: '0.75rem' }}>{errors.variantTypes}</span>}

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

                {/* Per-Combination Cost Table */}
                {form.hasVariants && (
                  <div style={{ marginTop: '1rem' }}>
                    <label className="form-label">Cost Per Combination <span className="required">*</span></label>
                    <p className="form-hint" style={{ marginBottom: '0.75rem' }}>
                      Set individual cost for each variant combination.
                      {errors.variantCost && <span style={{ color: 'var(--red)', marginLeft: '0.5rem', fontWeight: 600 }}>{errors.variantCost}</span>}
                    </p>
                    {previewSKUs.length === 0 ? (
                      <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{ marginBottom: '0.35rem' }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <p style={{ fontSize: '0.8rem', color: '#f59e0b', margin: 0 }}>Add variant types above to see cost fields for each combination.</p>
                      </div>
                    ) : (
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase', width: '30px' }}>#</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Combination</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase', width: '120px' }}>Cost (₱)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewSKUs.map((skuInfo, idx) => {
                            const cost = variantCosts[skuInfo.comboKey] || '';
                            return (
                              <tr key={skuInfo.sku || idx} style={{ borderBottom: idx < previewSKUs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--gray)', fontSize: '0.75rem' }}>{idx + 1}</td>
                                <td style={{ padding: '0.5rem 0.75rem', color: '#E5E2E1', fontSize: '0.8rem' }}>
                                  <div>{skuInfo.variantName}</div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>{skuInfo.sku}</div>
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                  <input
                                    type="text" inputMode="decimal"
                                    style={{ ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.8rem', textAlign: 'right', width: '100px' }}
                                    value={cost}
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                        setVariantCosts(prev => ({ ...prev, [skuInfo.comboKey]: val }));
                                      }
                                    }}
                                    onKeyDown={e => ['e', 'E', '+', ' ', '-'].includes(e.key) && e.preventDefault()}
                                    placeholder="0.00"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    )}
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
          </div>
          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save Material</button>
          </div>
        </form>
      </div>

      {/* Variant Type Remove Error Modal */}
      {variantTypeRemoveModal && (
        <div className="modal-overlay" onClick={() => setVariantTypeRemoveModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#f59e0b' }}>Cannot Remove Variant Type</h2>
              <button className="modal-close" onClick={() => setVariantTypeRemoveModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <p style={{ color: '#E5E2E1', fontSize: '0.9rem', lineHeight: 1.6 }}>
                This variant type has options that are used by active inventory items. Remove all options first or archive the linked inventory items.
              </p>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={() => setVariantTypeRemoveModal(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Variant Types Tutorial Modal */}
      {variantTutorialOpen && (
        <div className="modal-overlay" onClick={() => setVariantTutorialOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '95%' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" style={{ fontSize: '1.1rem' }}>How to Add Variant Types</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.1rem' }}>
                  Learn how to create materials with multiple variants such as Size, Color, Capacity
                </p>
              </div>
              <button className="modal-close" onClick={() => setVariantTutorialOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem', maxHeight: '65vh', overflowY: 'auto' }}>

              {/* Step 1 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#D4A843', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '0.08em' }}>Step 1: Add a Variant Type</div>
                <div style={{ marginBottom: '0.5rem', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', padding: '1rem' }}>
                  <img src="/tutorials/Tutorial.png" alt="Add Variant Type" style={{ width: '100%', display: 'block' }}
                    onError={e => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                  <div style={{ display: 'none', padding: '1rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                    Type the variant type name and click Add Variant Type
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5, margin: 0 }}>
                  Type the name of the variant type (e.g., "Size", "Color", "Type") in the input field, then click the gold <strong style={{ color: '#D4A843' }}>+ Add Variant Type</strong> button.
                </p>
              </div>

              {/* Step 2 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#D4A843', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '0.08em' }}>Step 2: Add Options to the Type</div>
                <div style={{ marginBottom: '0.5rem', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', padding: '1rem' }}>
                  <img src="/tutorials/Tutorial2.png" alt="Add Options" style={{ width: '100%', display: 'block' }}
                    onError={e => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                  <div style={{ display: 'none', padding: '1rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                    Type each option and click Add
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5, margin: 0 }}>
                  Type each option value in the input field (e.g., "Small 10x12", "Medium 12x14") and click the <strong style={{ color: '#D4A843' }}>+ Add</strong> button. Each option appears as a removable chip. You can add multiple options to a single type.
                </p>
              </div>

              {/* Step 3 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#D4A843', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '0.08em' }}>Step 3: Add More Types (Optional)</div>
                <div style={{ marginBottom: '0.5rem', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', padding: '1rem' }}>
                  <img src="/tutorials/Tutorial3.png" alt="Multiple Types" style={{ width: '100%', display: 'block' }}
                    onError={e => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                  <div style={{ display: 'none', padding: '1rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                    Add more variant types for combinations
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5, margin: 0 }}>
                  Repeat Step 1 to add another variant type. In the example shown, there are two types: <strong style={{ color: '#E5E2E1' }}>Type</strong> (Plain, W Zipper and Pocket) and <strong style={{ color: '#E5E2E1' }}>Size</strong> (Small 10x12, Medium 12x14, Large 14x16). Multiple types create a cross-combination of all options.
                </p>
              </div>

              {/* Step 4 */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#D4A843', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '0.08em' }}>Step 4: Result - Each Combination Gets a Unique SKU</div>
                <div style={{ marginBottom: '0.5rem', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', padding: '1rem' }}>
                  <img src="/tutorials/Tutorial4.png" alt="Final Result" style={{ width: '100%', display: 'block' }}
                    onError={e => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                  <div style={{ display: 'none', padding: '1rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                    Each variant combination gets its own SKU
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5, margin: 0 }}>
                  After saving, the parent material expands to show all variant children. Each combination gets its own unique SKU. In the example, 2 types x 3 sizes = <strong style={{ color: '#D4A843' }}>6 SKUs</strong>:
                </p>
              </div>

              {/* SKU Example */}
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.8 }}>
                CT-TO-PLA-SMA-0003<br/>
                CT-TO-PLA-MED-0002<br/>
                CT-TO-PLA-LAR-0001<br/>
                CT-TO-WZI-SMA-0003<br/>
                CT-TO-WZI-MED-0002<br/>
                CT-TO-WZI-LAR-0001
              </div>

              {/* Cost per combination note */}
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: '#D4A843', fontWeight: 700, marginBottom: '0.35rem' }}>Cost Per Combination</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5, margin: 0 }}>
                  Each variant combination has its own cost field. After adding types and options, a table of all combinations appears below. Click each row to set its specific unit cost.
                </p>
              </div>

              {/* Important Note */}
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, marginBottom: '0.25rem' }}>Important</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5, margin: 0 }}>
                  Once a variant has stock, its type and options become locked. You cannot rename or remove them without first clearing the stock from those items.
                </p>
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={() => setVariantTutorialOpen(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vendor Catalog Modal — matches screenshot design ──────────────────────
function VendorCatalogModal({ vendor, materials, onClose }) {
  const [expandedItems, setExpandedItems] = useState(new Set());

  useEffect(() => {
    if (vendor) setExpandedItems(new Set());
  }, [vendor]);

  // Load purchase data
  const grs = useMemo(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('pmp_goods_receipts') || '[]'); } catch { return []; }
  }, []);

  const pos = useMemo(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('pmp_purchase_orders') || '[]'); } catch { return []; }
  }, []);

  const stockIns = useMemo(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('pmp_stock_in_log') || '[]'); } catch { return []; }
  }, []);

  if (!vendor) return null;

  // Build vendor's PO IDs
  const vendorPOs = pos.filter(p => p.vendorId === vendor.id);
  const vendorPOIds = new Set(vendorPOs.map(p => p.id));

  // Collect all purchase batches from this vendor (GR + manual stock-in)
  const allBatches = useMemo(() => {
    const batches = [];
    // From Goods Receipts (PO-based)
    grs.forEach(gr => {
      if (vendorPOIds.has(gr.poId)) {
        (gr.items || []).forEach(item => {
          batches.push({
            materialId: item.materialId,
            materialName: item.materialName,
            sku: item.sku || '',
            uom: item.uom || 'pcs',
            unitCost: item.unitCost || 0,
            qty: item.receivedQty || 0,
            totalCost: (item.receivedQty || 0) * (item.unitCost || 0),
            dateReceived: gr.receivedDate || gr.createdAt,
            poNumber: gr.poNumber || '',
            grNumber: gr.grNumber || '',
            invoiceNumber: gr.invoiceNo || '',
          });
        });
      }
    });
    // From manual stock-in
    stockIns.forEach(si => {
      if (si.vendorId === vendor.id || si.vendorName === vendor.name) {
        batches.push({
          materialId: si.materialId,
          materialName: si.materialName,
          sku: si.sku || '',
          uom: si.uom || 'pcs',
          unitCost: si.unitCost || 0,
          qty: si.receivedQty || si.goodQty || 0,
          totalCost: si.totalCost || (si.receivedQty || 0) * (si.unitCost || 0),
          dateReceived: si.dateReceived,
          poNumber: si.poNumber || '',
          grNumber: si.grNumber || '',
          invoiceNumber: si.referenceNo || '',
        });
      }
    });
    return batches;
  }, [grs, pos, stockIns, vendorPOIds, vendor]);

  // Group batches by material
  const groupedByMaterial = useMemo(() => {
    const map = new Map();
    allBatches.forEach(b => {
      if (!map.has(b.materialId)) {
        map.set(b.materialId, {
          materialId: b.materialId,
          materialName: b.materialName,
          sku: b.sku || '',
          uom: b.uom || 'pcs',
          priceHistory: [],
          totalSpent: 0,
          totalQty: 0,
        });
      }
      const item = map.get(b.materialId);
      item.priceHistory.push(b);
      item.totalSpent += b.totalCost;
      item.totalQty += b.qty;
    });
    // Sort each material's history by date (oldest first for trend calc)
    map.forEach(item => {
      item.priceHistory.sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));
    });
    return [...map.values()].sort((a, b) => a.materialName.localeCompare(b.materialName));
  }, [allBatches]);

  // Summary stats
  const totalSpent = allBatches.reduce((s, b) => s + b.totalCost, 0);
  const totalBatches = allBatches.length;
  const totalItems = allBatches.reduce((s, b) => s + b.qty, 0);

  const toggleExpand = (materialId) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(materialId) ? next.delete(materialId) : next.add(materialId);
      return next;
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '700px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">{vendor.name} — Catalog</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
              Purchase history & per-batch pricing from this supplier.
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.875rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Total Spent</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#facc15' }}>₱{totalSpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            </div>
            <div style={{ padding: '0.875rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Purchases</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gold)' }}>{totalBatches} batch{totalBatches !== 1 ? 'es' : ''}</div>
            </div>
            <div style={{ padding: '0.875rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Items Received</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>{totalItems} pcs</div>
            </div>
          </div>

          {groupedByMaterial.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontStyle: 'italic' }}>
              No purchase history yet from this supplier.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {groupedByMaterial.map(item => {
                const isExpanded = expandedItems.has(item.materialId);
                const latest = item.priceHistory[item.priceHistory.length - 1];
                const prev = item.priceHistory.length >= 2 ? item.priceHistory[item.priceHistory.length - 2] : null;
                const priceChange = prev ? latest.unitCost - prev.unitCost : 0;
                const isUp = priceChange > 0;

                return (
                  <div key={item.materialId} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }} onClick={() => toggleExpand(item.materialId)}>

                    {/* Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.95rem' }}>{item.materialName}</div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--gray)' }}>
                          {item.sku && <span style={{ fontFamily: 'monospace' }}>{item.sku}</span>}
                          <span>{item.priceHistory.length} purchase{item.priceHistory.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {priceChange !== 0 && (
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 700,
                            color: isUp ? '#f87171' : '#4ade80',
                            display: 'flex', alignItems: 'center', gap: '0.2rem',
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              {isUp
                                ? <path d="M18 15l-6-6-6 6"/>
                                : <path d="M6 9l6 6 6-6"/>
                              }
                            </svg>
                            ₱{Math.abs(priceChange).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D4A843', fontFamily: 'monospace' }}>
                            ₱{(latest?.unitCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase' }}>Latest Price</div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', color: 'var(--gray)' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </div>
                    </div>

                    {/* Expanded: Price History Table */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.15)' }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <th style={{ padding: '0.5rem 1rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>Date</th>
                              <th style={{ padding: '0.5rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>Qty</th>
                              <th style={{ padding: '0.5rem 1rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>Unit Cost</th>
                              <th style={{ padding: '0.5rem 1rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>Total</th>
                              <th style={{ padding: '0.5rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>Ref</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...item.priceHistory].reverse().map((ph, idx) => {
                              const prevEntry = idx < item.priceHistory.length - 1 ? item.priceHistory[item.priceHistory.length - 1 - idx - 1] : null;
                              const change = prevEntry ? ph.unitCost - prevEntry.unitCost : 0;
                              const isUp = change > 0;
                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                  <td style={{ padding: '0.5rem 1rem', color: '#E5E2E1', fontSize: '0.78rem' }}>
                                    {new Date(ph.dateReceived).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </td>
                                  <td style={{ padding: '0.5rem 1rem', textAlign: 'center', color: '#D4A843', fontWeight: 600 }}>{ph.qty}</td>
                                  <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#E5E2E1' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                      ₱{ph.unitCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                      {change !== 0 && (
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: isUp ? '#f87171' : '#4ade80' }}>
                                          {isUp ? '↑' : '↓'}₱{Math.abs(change).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: '0.5rem 1rem', textAlign: 'right', color: '#facc15', fontWeight: 600, fontFamily: 'monospace' }}>
                                    ₱{(ph.qty * ph.unitCost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td style={{ padding: '0.5rem 1rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                                    {ph.poNumber || ph.grNumber || ph.invoiceNumber || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ flexShrink: 0, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Vendor Details Modal (Read-only) ───────────────────────────────────────────
function VendorDetailsModal({ vendor, materials, onClose }) {
  if (!vendor) return null;

  // Find materials matching this vendor's categories
  const vendorCategories = vendor.itemsSupplied || [];
  const catalogMaterials = materials.filter(m =>
    vendorCategories.includes(m.category) && (!m.hasVariants || m.parentId)
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {vendor.contact && (
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Contact Person{(Array.isArray(vendor.contact) ? vendor.contact : [vendor.contact]).length > 1 ? 's' : ''}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {(Array.isArray(vendor.contact) ? vendor.contact : [vendor.contact]).map((c, i) => (
                    <div key={i} style={{ fontSize: '0.95rem', color: '#E5E2E1', fontWeight: 600 }}>{c}</div>
                  ))}
                </div>
              </div>
            )}
            {vendor.email && (
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Email{(Array.isArray(vendor.email) ? vendor.email : [vendor.email]).length > 1 ? 's' : ''}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {(Array.isArray(vendor.email) ? vendor.email : [vendor.email]).map((em, i) => (
                    <div key={i} style={{ fontSize: '0.95rem', color: '#3b82f6', fontWeight: 600 }}>{em}</div>
                  ))}
                </div>
              </div>
            )}
            {vendor.phone && (
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Phone{(Array.isArray(vendor.phone) ? vendor.phone : [vendor.phone]).length > 1 ? 's' : ''}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {(Array.isArray(vendor.phone) ? vendor.phone : [vendor.phone]).map((ph, i) => (
                    <div key={i} style={{ fontSize: '0.95rem', color: '#E5E2E1', fontWeight: 600 }}>{ph}</div>
                  ))}
                </div>
              </div>
            )}
            {vendor.address && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>Address</div>
                <div style={{ fontSize: '0.95rem', color: '#E5E2E1', fontWeight: 600 }}>{vendor.address}</div>
              </div>
            )}
          </div>

          {/* Available Materials / Catalog */}
          {catalogMaterials.length > 0 && (
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem', letterSpacing: '0.08em' }}>
                Available Materials ({catalogMaterials.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {catalogMaterials.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.625rem 0.75rem', background: 'rgba(255,255,255,0.02)',
                    borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.825rem' }}>{m.name}</div>
                      {m.sku && <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{m.sku}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>{getStockQty(m)} {m.uom || 'pcs'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#D4A843', fontFamily: 'monospace' }}>₱{(m.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions" style={{ flexShrink: 0, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VENDOR MASTER TAB — Card Layout with Catalog
// ══════════════════════════════════════════════════════════════════════════════
function VendorMasterTab({ materials, onVendorsChange }) {
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [viewVendor, setViewVendor] = useState(null);
  const [catalogVendor, setCatalogVendor] = useState(null);
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
        <button className="btn-primary" onClick={() => { setEditVendor(null); setShowAddModal(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add New Supplier
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {filtered.map(v => {
          const activeMaterials = materials.filter(m => m.preferredVendorId === v.id && !m.parentId);
          return (
            <div key={v.id} style={{
              background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '14px',
              padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
              transition: 'border-color 0.2s',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', fontWeight: 800, color: '#D4A843', flexShrink: 0,
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1.05rem' }}>{v.name}</div>
                    {v.category && (
                      <span style={{
                        display: 'inline-block', fontSize: '0.6rem', color: 'var(--gray)',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        padding: '0.15rem 0.5rem', borderRadius: '4px', marginTop: '0.25rem',
                        textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em',
                      }}>
                        {v.category}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditVendor(v); setShowAddModal(true); }} style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '0.35rem', cursor: 'pointer', color: 'var(--gray)',
                  }}><EditIcon /></button>
                  <button onClick={() => handleDelete(v.id)} style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: '6px', padding: '0.35rem', cursor: 'pointer', color: '#f87171',
                  }}><TrashIcon /></button>
                </div>
              </div>

              {/* Contact Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem' }}>
                {/* Contact Persons */}
                {(Array.isArray(v.contact) ? v.contact : v.contact ? [v.contact] : []).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#E5E2E1' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    {c}
                  </div>
                ))}
                {/* Phones */}
                {(Array.isArray(v.phone) ? v.phone : v.phone ? [v.phone] : []).map((ph, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#E5E2E1' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                    {ph}
                  </div>
                ))}
                {/* Emails */}
                {(Array.isArray(v.email) ? v.email : v.email ? [v.email] : []).map((em, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {em}
                  </div>
                ))}
              </div>

              {/* Items Supplied — individual boxes */}
              {(v.itemsSupplied || []).length > 0 && (
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
                    Items Supplied ({v.itemsSupplied.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {(v.itemsSupplied || []).map((item, i) => {
                      const name = typeof item === 'string' ? item : item.name;
                      const uom = typeof item === 'string' ? 'pcs' : (item.uom || 'pcs');
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                          padding: '0.4rem 0.6rem',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '6px',
                        }}>
                          <span style={{ fontSize: '0.78rem', color: '#E5E2E1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {name}
                          </span>
                          <span style={{
                            fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase',
                            background: 'rgba(255,255,255,0.04)', padding: '0.1rem 0.35rem', borderRadius: '4px',
                            fontWeight: 600, flexShrink: 0,
                          }}>
                            {uom}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer: Active Materials + View Catalog */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Active Materials
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#E5E2E1' }}>
                    {activeMaterials.length}
                  </div>
                </div>
                <button
                  onClick={() => setCatalogVendor(v)}
                  style={{
                    background: 'none', border: 'none', color: '#D4A843',
                    fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                  }}
                >
                  View Catalog
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </button>
              </div>
            </div>
          );
        })}

        {/* Add New Vendor Card */}
        <div onClick={() => { setEditVendor(null); setShowAddModal(true); }} style={{
          background: 'transparent', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '14px',
          padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '0.75rem', cursor: 'pointer', minHeight: '240px',
          transition: 'border-color 0.2s, background 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'; e.currentTarget.style.background = 'rgba(212,168,67,0.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
          <span style={{ fontSize: '0.875rem', color: 'var(--gray)', fontWeight: 600 }}>Add New Supplier</span>
        </div>
      </div>

      {showAddModal && (
        <VendorFormModal vendor={editVendor} allVendors={vendors} materials={materials} onClose={() => { setShowAddModal(false); setEditVendor(null); }} onSave={handleSave} />
      )}
      {viewVendor && (
        <VendorDetailsModal
          vendor={viewVendor}
          materials={materials}
          onClose={() => setViewVendor(null)}
        />
      )}
      {catalogVendor && (
        <VendorCatalogModal
          vendor={catalogVendor}
          materials={materials}
          onClose={() => setCatalogVendor(null)}
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

function VendorFormModal({ vendor, allVendors, materials, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', contact: [], itemsSupplied: [], email: [], phone: [], address: '' });
  const [itemNameInput, setItemNameInput] = useState('');
  const [itemUomInput, setItemUomInput] = useState('pcs');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errors, setErrors] = useState({});
  const [newContact, setNewContact] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Check if this vendor has linked materials
  const linkedMaterials = useMemo(() => {
    if (!vendor) return [];
    return (materials || []).filter(m => m.preferredVendorId === vendor.id);
  }, [vendor, materials]);

  const hasLinkedMaterials = linkedMaterials.length > 0;

  // Get items that are actually used by linked materials (from their categories)
  const usedItems = useMemo(() => {
    if (!hasLinkedMaterials) return [];
    const items = new Set();
    linkedMaterials.forEach(m => {
      if (m.category) items.add(m.category);
    });
    return [...items];
  }, [linkedMaterials, hasLinkedMaterials]);

  // Collect all unique items from all vendors — normalize to {name, uom} objects
  const allKnownItems = useMemo(() => {
    const items = [];
    const seen = new Set();
    (allVendors || []).forEach(v => {
      (v.itemsSupplied || []).forEach(item => {
        const name = typeof item === 'string' ? item : item.name;
        if (!seen.has(name)) {
          seen.add(name);
          items.push(name);
        }
      });
    });
    return items.sort();
  }, [allVendors]);

  // Filter suggestions based on current input
  const suggestions = useMemo(() => {
    if (!itemNameInput.trim()) return allKnownItems;
    return allKnownItems.filter(i => i.toLowerCase().includes(itemNameInput.toLowerCase()));
  }, [itemNameInput, allKnownItems]);

  // Normalize itemsSupplied to {name, uom} objects
  const normalizeItems = (items) => {
    return (items || []).map(item => {
      if (typeof item === 'string') return { name: item, uom: 'pcs' };
      return item;
    });
  };

  // Normalize single values to arrays for backwards compatibility
  const normalizeToArray = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim()) return [val.trim()];
    return [];
  };

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name || '',
        contact: normalizeToArray(vendor.contact),
        itemsSupplied: normalizeItems(vendor.itemsSupplied),
        email: normalizeToArray(vendor.email),
        phone: normalizeToArray(vendor.phone),
        address: vendor.address || '',
      });
    }
  }, [vendor]);

  const addItem = () => {
    const trimmed = itemNameInput.trim();
    if (!trimmed) return;
    if (form.itemsSupplied.some(i => i.name.toLowerCase() === trimmed.toLowerCase())) return;
    setForm(p => ({ ...p, itemsSupplied: [...p.itemsSupplied, { name: trimmed, uom: itemUomInput }] }));
    setItemNameInput('');
    setItemUomInput('pcs');
    setShowSuggestions(false);
  };

  const removeItem = (idx) => {
    const itemToRemove = form.itemsSupplied[idx];
    if (usedItems.includes(itemToRemove.name)) return;
    setForm(p => ({ ...p, itemsSupplied: p.itemsSupplied.filter((_, i) => i !== idx) }));
  };

  const handleItemKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
    if (e.key === 'Backspace' && itemNameInput === '' && form.itemsSupplied.length > 0) {
      const lastItem = form.itemsSupplied[form.itemsSupplied.length - 1];
      if (!usedItems.includes(lastItem.name)) {
        removeItem(form.itemsSupplied.length - 1);
      }
    }
  };

  const handlePhoneInputChange = (val) => {
    let cleaned = val.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+63')) {
      cleaned = '+63' + cleaned.slice(3).replace(/[^0-9]/g, '').slice(0, 10);
    } else if (cleaned.startsWith('0')) {
      cleaned = '0' + cleaned.slice(1).replace(/[^0-9]/g, '').slice(0, 10);
    } else if (cleaned.startsWith('63')) {
      cleaned = '+63' + cleaned.slice(2).replace(/[^0-9]/g, '').slice(0, 10);
    } else {
      cleaned = cleaned.replace(/[^0-9]/g, '').slice(0, 11);
      if (cleaned.length > 0 && !cleaned.startsWith('0')) cleaned = '0' + cleaned;
    }
    setNewPhone(cleaned);
  };

  const addContact = () => {
    const trimmed = newContact.trim();
    if (!trimmed) return;
    if (form.contact.includes(trimmed)) return;
    setForm(p => ({ ...p, contact: [...p.contact, trimmed] }));
    setNewContact('');
  };

  const removeContact = (idx) => {
    setForm(p => ({ ...p, contact: p.contact.filter((_, i) => i !== idx) }));
  };

  const addEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    if (form.email.includes(trimmed)) return;
    setForm(p => ({ ...p, email: [...p.email, trimmed] }));
    setNewEmail('');
  };

  const removeEmail = (idx) => {
    setForm(p => ({ ...p, email: p.email.filter((_, i) => i !== idx) }));
  };

  const addPhone = () => {
    const trimmed = newPhone.trim();
    if (!trimmed) return;
    if (form.phone.includes(trimmed)) return;
    setForm(p => ({ ...p, phone: [...p.phone, trimmed] }));
    setNewPhone('');
  };

  const removePhone = (idx) => {
    setForm(p => ({ ...p, phone: p.phone.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Company name is required';
    if (form.itemsSupplied.length === 0) newErrors.items = 'Add at least one item';
    if (form.contact.length === 0) newErrors.contact = 'Add at least one contact person';
    if (form.email.length === 0) newErrors.email = 'Add at least one email';
    if (form.phone.length === 0) newErrors.phone = 'Add at least one phone number';
    if (!form.address.trim()) newErrors.address = 'Address is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    onSave({ ...form });
  };
  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none' };
  const lockedInputStyle = { ...inputStyle, opacity: 0.5, cursor: 'not-allowed', background: 'rgba(255,255,255,0.03)' };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{vendor ? 'Edit Vendor' : 'Add New Vendor'}</h2>
          <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">
                Company Name <span className="required">*</span>
                {hasLinkedMaterials && (
                  <span style={{ fontSize: '0.65rem', color: '#f59e0b', marginLeft: '0.5rem', fontWeight: 600 }}>
                    (Locked: {linkedMaterials.length} material{linkedMaterials.length > 1 ? 's' : ''} linked)
                  </span>
                )}
              </label>
              <input
                type="text"
                style={hasLinkedMaterials ? lockedInputStyle : { ...inputStyle, borderColor: errors.name ? '#ef4444' : undefined }}
                value={form.name}
                onChange={e => {
                  setForm(p => ({ ...p, name: e.target.value.slice(0, 100) }));
                  if (errors.name) setErrors(er => ({ ...er, name: '' }));
                }}
                placeholder="e.g., Global Garments Inc."
                required
                maxLength={100}
                readOnly={hasLinkedMaterials}
              />
              {errors.name && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.2rem', display: 'block' }}>{errors.name}</span>}
            </div>

            {/* Items Supplied — each item has name + required unit */}
            <div>
              <label className="form-label">
                Items Supplied <span className="required">*</span>
                {hasLinkedMaterials && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--gray)', marginLeft: '0.5rem', fontWeight: 400 }}>
                    (Locked items cannot be removed)
                  </span>
                )}
              </label>
              {errors.items && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: '0.3rem', display: 'block' }}>{errors.items}</span>}
              {/* Existing items as cards */}
              {form.itemsSupplied.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {form.itemsSupplied.map((item, i) => {
                    const isUsed = usedItems.includes(item.name);
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        background: isUsed ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isUsed ? 'rgba(212,168,67,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: '8px',
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.82rem', color: '#E5E2E1', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase' }}>
                            {item.uom || 'pcs'}
                          </span>
                        </div>
                        {!isUsed ? (
                          <button type="button" onClick={() => removeItem(i)} style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '6px', padding: '0.2rem 0.4rem', cursor: 'pointer', color: '#f87171',
                            display: 'flex', alignItems: 'center', lineHeight: 1, fontSize: '0.7rem',
                          }}>✕</button>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Add new item row */}
              <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
                <input
                  type="text"
                  style={{ ...inputStyle, flex: 2 }}
                  value={itemNameInput}
                  onChange={e => { setItemNameInput(e.target.value.slice(0, 60)); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onKeyDown={handleItemKeyDown}
                  placeholder="Item name..."
                  maxLength={60}
                />
                <select
                  style={{ ...inputStyle, flex: 1, minWidth: '100px' }}
                  value={itemUomInput}
                  onChange={e => setItemUomInput(e.target.value)}
                >
                  <option value="pcs">Pieces</option>
                  <option value="bottle">Bottle</option>
                  <option value="liter">Liter</option>
                  <option value="kg">Kilogram</option>
                  <option value="meter">Meter</option>
                  <option value="roll">Roll</option>
                  <option value="box">Box</option>
                  <option value="pack">Pack</option>
                  <option value="set">Set</option>
                </select>
                <button type="button" className="btn-primary" onClick={addItem}
                  style={{ padding: '0 1rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  + Add
                </button>
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: '#1a1a1a', border: '1px solid var(--border)', borderRadius: '8px',
                    maxHeight: '160px', overflowY: 'auto', marginTop: '0.25rem',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    {suggestions.filter(s => !form.itemsSupplied.some(i => i.name.toLowerCase() === s.toLowerCase())).map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => setItemNameInput(name)}
                        style={{
                          display: 'block', width: '100%', padding: '0.5rem 0.75rem',
                          background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                          color: '#E5E2E1', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,168,67,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Contact Persons */}
            <div>
              <label className="form-label">Contact Person <span className="required">*</span></label>
              {form.contact.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {form.contact.map((c, idx) => (
                    <span key={idx} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.75rem',
                    }}>
                      {c}
                      <button type="button" onClick={() => removeContact(idx)} style={{
                        background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, display: 'flex',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" style={inputStyle} value={newContact} onChange={e => setNewContact(e.target.value.slice(0, 80))} placeholder="Juan Dela Cruz" maxLength={80}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addContact(); } }} />
                <button type="button" onClick={addContact} style={{
                  background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '6px',
                  padding: '0.5rem 0.75rem', color: '#D4A843', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>+ Add</button>
              </div>
              {errors.contact && <p style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.25rem' }}>{errors.contact}</p>}
            </div>

            {/* Emails */}
            <div>
              <label className="form-label">Email <span className="required">*</span></label>
              {form.email.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {form.email.map((em, idx) => (
                    <span key={idx} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.75rem',
                    }}>
                      {em}
                      <button type="button" onClick={() => removeEmail(idx)} style={{
                        background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, display: 'flex',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="email" style={inputStyle} value={newEmail} onChange={e => setNewEmail(e.target.value.slice(0, 100))} placeholder="vendor@email.com" maxLength={100}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }} />
                <button type="button" onClick={addEmail} style={{
                  background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '6px',
                  padding: '0.5rem 0.75rem', color: '#D4A843', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>+ Add</button>
              </div>
              {errors.email && <p style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.25rem' }}>{errors.email}</p>}
            </div>

            {/* Phone Numbers */}
            <div>
              <label className="form-label">Phone <span className="required">*</span></label>
              {form.phone.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {form.phone.map((ph, idx) => (
                    <span key={idx} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.75rem',
                    }}>
                      {ph}
                      <button type="button" onClick={() => removePhone(idx)} style={{
                        background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, display: 'flex',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" style={inputStyle} value={newPhone} onChange={e => handlePhoneInputChange(e.target.value)} placeholder="09xx-xxx-xxxx" maxLength={15} inputMode="tel"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhone(); } }} />
                <button type="button" onClick={addPhone} style={{
                  background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '6px',
                  padding: '0.5rem 0.75rem', color: '#D4A843', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>+ Add</button>
              </div>
              {errors.phone && <p style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.25rem' }}>{errors.phone}</p>}
            </div>

            <div>
              <label className="form-label">Address <span className="required">*</span></label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value.slice(0, 200) }))} placeholder="Full address" maxLength={200} />
              {errors.address && <p style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.25rem' }}>{errors.address}</p>}
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
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#D4A843' }}>₱{totalCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
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
  const [errors, setErrors] = useState({});
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
  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!form.productName.trim()) newErrors.productName = 'Product name is required';
    if (form.components.length === 0) newErrors.components = 'Add at least one component';
    const emptyComponent = form.components.some(c => !c.materialId);
    if (emptyComponent) newErrors.material = 'Please select a material for all components';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    onSave({ ...bom, ...form });
  };
  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none' };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{bom ? 'Edit BOM' : 'Add BOM'}</h2>
          <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Product Name <span className="required">*</span></label>
                <input type="text" style={{ ...inputStyle, borderColor: errors.productName ? '#ef4444' : undefined }} value={form.productName} onChange={e => { setForm(p => ({ ...p, productName: e.target.value.slice(0, 100) })); if (errors.productName) setErrors(er => ({ ...er, productName: '' })); }} placeholder="Custom Mug 11oz" required maxLength={100} />
                {errors.productName && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.2rem', display: 'block' }}>{errors.productName}</span>}
              </div>
              <div><label className="form-label">SKU</label><input type="text" style={inputStyle} value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value.replace(/[^A-Za-z0-9\-]/g, '').slice(0, 50) }))} placeholder="Auto" maxLength={50} /></div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <label className="form-label" style={{ margin: 0 }}>Components / Recipe <span className="required">*</span></label>
                  {errors.material && <span style={{ fontSize: '0.72rem', color: '#ef4444', display: 'block' }}>{errors.material}</span>}
                  {errors.components && <span style={{ fontSize: '0.72rem', color: '#ef4444', display: 'block' }}>{errors.components}</span>}
                </div>
                <button type="button" onClick={addComponent} style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '6px', padding: '0.3rem 0.75rem', color: '#D4A843', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>+ Add Component</button>
              </div>
              {form.components.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)' }}>No components added yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {form.components.map((comp, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 36px', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ border: errors.material ? '1px solid #ef4444' : 'none', borderRadius: '8px' }}>
                        <CustomDropdown
                          value={comp.materialId}
                          onChange={(val) => {
                            updateComponent(idx, 'materialId', val);
                            if (errors.material) setErrors(er => ({ ...er, material: '' }));
                          }}
                          options={[
                            { value: '', label: 'Select material...' },
                            ...materials.filter(m => !m.parentId).map(m => ({ value: m.id, label: m.name })),
                          ]}
                          placeholder="Select material..."
                        />
                      </div>
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

  // Collect all unique item names from all vendors' itemsSupplied
  const itemCategories = useMemo(() => {
    const items = new Set();
    vendors.forEach(v => {
      (v.itemsSupplied || []).forEach(item => {
        // itemsSupplied contains objects { name, uom }, extract the name
        const itemName = typeof item === 'string' ? item : item.name;
        if (itemName) items.add(itemName);
      });
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

      {activeTab === 'materials' && <MaterialMasterTab itemCategories={itemCategories} materials={materials} onMaterialsChange={setMaterials} onVendorsChange={setVendors} />}
      {activeTab === 'vendors' && <VendorMasterTab materials={materials} onVendorsChange={setVendors} />}
      {activeTab === 'bom' && <BOMTab />}
    </div>
  );
}
