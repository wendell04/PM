'use client';

/**
 * INVENTORY MANAGEMENT PAGE
 *
 * Current Status: LocalStorage (Browser-only, for testing)
 * ⚠️ TODO: MongoDB Integration
 *
 * ⚠️ IMPORTANT DESIGN DECISION:
 * Inventory = Physical stocked items ONLY.
 * "Upon Order / Non-Stocked" products are managed separately
 * in the Add Product page — NO inventory link required for those.
 * isOnDemand has been REMOVED from this module entirely.
 *
 * Changes from previous version:
 * - REMOVED: isOnDemand field and all Upon Order logic
 * - REMOVED: showConvertModal (Upon Order → In Stock conversion)
 * - REMOVED: "Upon Order" summary card and filter
 * - REMOVED: Stock Correction reason (all movements must have valid source document)
 * - REMOVED: window.__supplierInUse global — replaced with proper state
 * - FIXED: SKU generated ONCE on save, never regenerates on re-render
 * - FIXED: minStockLevel is now editable when editing an item
 * - FIXED: All alert() replaced with modals
 * - ADDED: Supplier categories[] — filtered per item category in dropdowns
 *
 * MongoDB Integration Steps:
 * 1. Create collection: 'inventory'
 * 2. Replace LocalStorage calls with API endpoints
 * 3. Add API routes in app/api/inventory/route.js
 * 4. Add Mongoose schema in models/Inventory.js
 * 5. Remove LocalStorage references
 *
 * MongoDB Document Shape:
 * {
 *   _id:              ObjectId,
 *   sku:              String (unique, indexed — generated ONCE, never changes),
 *   name:             String (Proper Case, required),
 *   category:         String (required),
 *   stockQty:         Number (good stock only, min: 0),
 *   damagedQty:       Number (total damaged, reference only),
 *   minStockLevel:    Number (reorder threshold, default: 10),
 *   averageCost:      Number (weighted moving average),
 *   lastUnitCost:     Number,
 *   lastSupplierId:   String | null,
 *   lastSupplierName: String,
 *   batches:          Array<Batch>,
 *   isActive:         Boolean (soft delete),
 *   deletedAt:        Date | null,
 *   createdAt:        Date,
 *   updatedAt:        Date,
 * }
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatNumber, formatPrice, formatSmart, formatPriceSmart } from '../../../../src/utils/format';

// ── Gold Scrollbar Style ──────────────────────────────────────────────────────
// Injected once via a side-effect — targets all scrollable elements in the page
if (typeof document !== 'undefined' && !document.getElementById('pmp-gold-scrollbar')) {
  const s = document.createElement('style');
  s.id = 'pmp-gold-scrollbar';
  s.textContent = `
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
    ::-webkit-scrollbar-thumb { background: var(--gold, #d4a843); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #e8bc50; }
    ::-webkit-scrollbar-corner { background: transparent; }
  `;
  document.head.appendChild(s);
}

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

// ── Formatted Integer Input (with comma separators) ────────────────────────────
// Displays: 1,000 | On focus: 1000 | On blur: 1,000
function FormattedIntegerInput({ value, onChange, min = 0, max, placeholder, className, disabled, autoFocus, onBlur, onKeyDown }) {
  const [displayValue, setDisplayValue] = useState(value || '');
  const [isFocused, setIsFocused] = useState(false);

  const formatWithCommas = (numStr) => {
    if (!numStr) return '';
    return numStr.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const removeCommas = (str) => str.replace(/,/g, '');

  useEffect(() => {
    if (!isFocused && value) {
      setDisplayValue(formatWithCommas(value));
    } else if (value !== undefined && value !== null) {
      setDisplayValue(value.toString());
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setDisplayValue(removeCommas(value || ''));
    if (autoFocus) autoFocus();
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    if (value) {
      setDisplayValue(formatWithCommas(value));
    }
    if (onBlur) onBlur(e);
  };

  const handleChange = (e) => {
    const rawValue = e.target.value.replace(/,/g, '');
    if (rawValue === '' || /^\d+$/.test(rawValue)) {
      onChange({ ...e, target: { ...e.target, value: rawValue } });
      setDisplayValue(rawValue);
    }
    if (onKeyDown) onKeyDown(e);
  };

  const handleKeyDown = (e) => {
    if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
    if (onKeyDown) onKeyDown(e);
  };

  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };

  return (
    <input type="text" className={className} value={displayValue} onChange={handleChange}
      onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyDown} onWheel={handleWheel}
      min={min} max={max} placeholder={placeholder} disabled={disabled}
      inputMode="numeric" pattern="[0-9]*" />
  );
}

// ── Formatted Decimal Input (with comma separators, smart decimals) ────────────
// Displays: 2,500.50 | On focus: 2500.50 | On blur: 2,500.50
// Smart: 2500.00 displays as 2,500 (no .00)
function FormattedDecimalInput({ value, onChange, placeholder, className, disabled, style }) {
  const [displayValue, setDisplayValue] = useState(value || '');
  const [isFocused, setIsFocused] = useState(false);

  const formatSmart = (numStr) => {
    if (!numStr) return '';
    const parsed = parseFloat(numStr);
    if (isNaN(parsed)) return '';
    
    if (Number.isInteger(parsed)) {
      return parsed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    const fixed = parsed.toFixed(2);
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    if (parts[1] === '00') return parts[0];
    
    const decimalPart = parts[1].replace(/0$/, '');
    if (decimalPart === '') return parts[0];
    
    return parts.join('.');
  };

  const removeCommas = (str) => str.replace(/,/g, '');

  useEffect(() => {
    if (!isFocused && value) {
      setDisplayValue(formatSmart(value));
    } else if (value !== undefined && value !== null) {
      setDisplayValue(value.toString());
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setDisplayValue(removeCommas(value || ''));
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (value) {
      setDisplayValue(formatSmart(value));
    }
  };

  const handleChange = (e) => {
    const rawValue = e.target.value.replace(/,/g, '');
    if (rawValue === '' || /^\d*\.?\d{0,2}$/.test(rawValue)) {
      onChange({ ...e, target: { ...e.target, value: rawValue } });
      setDisplayValue(rawValue);
    }
  };

  const handleKeyDown = (e) => { if (['e', 'E', '+', '-', ' '].includes(e.key)) e.preventDefault(); };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };

  return (
    <input type="text" className={className} value={displayValue} onChange={handleChange}
      onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyDown} onWheel={handleWheel}
      placeholder={placeholder} disabled={disabled} inputMode="decimal" style={style} />
  );
}

// ── LocalStorage Keys ──────────────────────────────────────────────────────────
// TODO: MongoDB — Remove all these keys when connecting to database
const INVENTORY_STORAGE_KEY = 'pmp_inventory';
const CATEGORIES_STORAGE_KEY = 'pmp_inventory_categories'; // DEPRECATED — categories now derived from masterlist
const SUPPLIERS_STORAGE_KEY = 'pmp_suppliers';
const STOCK_HISTORY_STORAGE_KEY = 'pmp_stock_history';
// ── Item Masterlist Storage ────────────────────────────────────────────────────
// TODO: MongoDB — Replace with 'masterlist' collection
// Single source of truth for: Categories → Products → Variants
// Replaces pmp_inventory_categories entirely
const MASTERLIST_STORAGE_KEY = 'pmp_masterlist';

// ── Inventory LocalStorage Helpers ────────────────────────────────────────────
// TODO: MongoDB — Replace getBanners() with: GET /api/inventory
// TODO: MongoDB — Replace saveBanners() with: PUT /api/inventory/:id
export function getInventoryList() {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(INVENTORY_STORAGE_KEY); return s ? JSON.parse(s) : []; }
  catch { return []; }
}
export function saveInventoryList(inventory) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(inventory)); }
  catch (e) { console.error('Error saving inventory:', e); }
}

// ── Category Helpers ───────────────────────────────────────────────────────────
// TODO: MongoDB — Replace with GET /api/categories and POST /api/categories
// No hardcoded default categories — admin adds their own
// TODO: MongoDB — Replace with GET /api/categories
export function getCategories() {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(CATEGORIES_STORAGE_KEY); return s ? JSON.parse(s) : []; }
  catch { return []; }
}
export function saveCategories(cats) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(cats)); }
  catch (e) { console.error('Error saving categories:', e); }
}

// ── Item Masterlist Helpers ────────────────────────────────────────────────────
// TODO: MongoDB — Replace with:
//   GET    /api/masterlist              → all categories + products + variants
//   POST   /api/masterlist/categories   → add category
//   PUT    /api/masterlist/categories/:id → edit category name
//   DELETE /api/masterlist/categories/:id → delete (block if has products)
//   POST   /api/masterlist/products     → add product under category
//   PUT    /api/masterlist/products/:id → edit product
//   DELETE /api/masterlist/products/:id → delete (block if linked to inventory)
//
// MongoDB Schema — masterlist collection:
// {
//   _id:      ObjectId,
//   name:     String (category name, unique, required),
//   products: [{
//     _id:      ObjectId,
//     name:     String (product name, required),
//     variants: [String] (optional, e.g. ['Small', 'Medium', 'Large'])
//   }],
//   createdAt: Date,
//   updatedAt: Date,
// }
export function getMasterlist() {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(MASTERLIST_STORAGE_KEY); return s ? JSON.parse(s) : []; }
  catch { return []; }
}
export function saveMasterlist(masterlist) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(MASTERLIST_STORAGE_KEY, JSON.stringify(masterlist)); }
  catch (e) { console.error('Error saving masterlist:', e); }
}
// Derive flat category list from masterlist (replaces getCategories() for inventory use)
// TODO: MongoDB — Replace with: GET /api/masterlist/categories (returns name[] only)
export function getCategoriesFromMasterlist() {
  return getMasterlist().map(c => c.name);
}

// ── Supplier Helpers ───────────────────────────────────────────────────────────
// TODO: MongoDB — Replace with GET /api/suppliers and POST /api/suppliers
//
// Supplier MongoDB Schema:
// {
//   _id: ObjectId,
//   name: String (required, unique),
//   contact: String, phone: String, address: String,
//   categories: Array<String>,  ← which categories this supplier supplies
//                                 empty = General (appears for all categories)
//   isActive: Boolean,
//   createdAt: Date,
// }
export function getSuppliers() {
  if (typeof window === 'undefined') return [];
  try { const s = localStorage.getItem(SUPPLIERS_STORAGE_KEY); return s ? JSON.parse(s) : []; }
  catch { return []; }
}
export function saveSuppliers(suppliers) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(suppliers)); }
  catch (e) { console.error('Error saving suppliers:', e); }
}
export function addSupplier(supplier) {
  const suppliers = getSuppliers();
  const newSupplier = { ...supplier, id: `supplier-${Date.now()}`, phone: supplier.phone || '', categories: supplier.categories || [], createdAt: new Date().toISOString() };
  suppliers.push(newSupplier);
  saveSuppliers(suppliers);
  return newSupplier;
}

// ── Stock History Helpers ──────────────────────────────────────────────────────
// TODO: MongoDB — Replace with GET /api/stock-history and POST /api/stock-history
export function getStockHistory(inventoryId = null) {
  if (typeof window === 'undefined') return [];
  try {
    const s = localStorage.getItem(STOCK_HISTORY_STORAGE_KEY);
    const h = s ? JSON.parse(s) : [];
    return inventoryId ? h.filter(e => e.inventoryId === inventoryId) : h;
  } catch { return []; }
}
export function saveStockHistory(history) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STOCK_HISTORY_STORAGE_KEY, JSON.stringify(history)); }
  catch (e) { console.error('Error saving stock history:', e); }
}
export function addStockHistory(entry) {
  const history = getStockHistory();
  const newEntry = { ...entry, id: `history-${Date.now()}`, remainingQty: entry.quantity, createdAt: new Date().toISOString() };
  history.push(newEntry);
  saveStockHistory(history);
  return newEntry;
}

// FIFO: Deduct from specific batch
// TODO: MongoDB — Replace with PUT /api/inventory/:id/deduct-batch
export function deductStockFromBatch(inventoryId, batchId, qty) {
  const history = getStockHistory(inventoryId);
  const idx = history.findIndex(h => h.batchId === batchId);
  if (idx === -1) return { success: false, error: 'Batch not found' };
  const batch = history[idx];
  const available = batch.remainingQty || batch.quantity;
  if (available < qty) return { success: false, error: `Insufficient. Available: ${available}, Requested: ${qty}` };
  const updated = [...history];
  updated[idx] = { ...batch, remainingQty: available - qty };
  saveStockHistory(updated);
  return { success: true, deducted: qty };
}

// ── SKU Generator ──────────────────────────────────────────────────────────────
// IMPORTANT: Called ONCE on item creation. Result stored in DB and never changes.
// TODO: MongoDB — Replace random seq with auto-increment per category+product combo
// Format: [CAT3]-[PROD3]-[YEAR]-[SEQ4]  e.g. MUG-CER-2026-0001
//   CAT3  = first 3 letters of category  (Mugs → MUG, T-Shirt → TSH)
//   PROD3 = first 3 letters of product name (Ceramic → CER, Magic Mug → MAG)
//   YEAR  = current year
//   SEQ4  = random 4-digit sequence (TODO: replace with DB auto-increment)
function generateSKU(category, productName) {
  const catPrefix = (category || 'ITM').replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'ITM';
  const prodPrefix = (productName || 'XXX').replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'XXX';
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${catPrefix}-${prodPrefix}-${year}-${seq}`;
}

// ── Reusable Modal Components ──────────────────────────────────────────────────
// Replaces ALL alert() calls — no native browser dialogs anywhere

// Generic info/error modal
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

// Generic confirm modal
function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmClass = 'btn-primary', children }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body">
          {message && <p className="delete-confirm-text">{message}</p>}
          {children}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className={confirmClass} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Batch Details Modal ────────────────────────────────────────────────────────
function BatchDetailsModal({ batch, item, isOpen, onClose }) {
  if (!isOpen || !batch || !item) return null;
  const movements = batch.movements || [];
  const sorted = [...movements].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const totalReceived = movements.filter(m => m.type === 'received').reduce((s, m) => s + m.quantity, 0);
  const totalSold = movements.filter(m => m.type === 'sold').reduce((s, m) => s + Math.abs(m.quantity), 0);
  const totalDamaged = movements.filter(m => m.type === 'damaged').reduce((s, m) => s + Math.abs(m.quantity), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">{batch.batchId} — Batch Details</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {/* Header info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '1.5rem' }}>
            {[['Supplier', batch.supplierName||'N/A'], ['Invoice', batch.invoiceNumber||'N/A'],
              ['Date Received', new Date(batch.dateReceived).toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})],
              ['Item', `${item.name} (${item.category})`]
            ].map(([l,v]) => (
              <div key={l}>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{l}</div>
                <div style={{ fontWeight: 600, color: 'var(--white)' }}>{v}</div>
              </div>
            ))}
          </div>
          {/* Stock summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[['Original', `${batch.originalQty} pcs`, 'var(--white)'],
              ['Good Stock', `${batch.goodQty||batch.originalQty} pcs`, '#4ade80'],
              ['Damaged', `${batch.damagedQty||0} pcs`, '#f87171'],
              ['Unit Cost', `${formatPrice(batch.unitCost)}`, 'var(--gold)'],
            ].map(([l,v,c]) => (
              <div key={l} style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{l}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          {/* Movements */}
          {sorted.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--white)' }}>Movement History</h3>
              <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '2px solid var(--border)' }}>
                      {['Date','Type','Qty','Remaining','Notes'].map(h => (
                        <th key={h} style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.75rem' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>{new Date(m.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                            background: m.type==='received'?'rgba(74,222,128,0.15)':m.type==='sold'?'rgba(99,102,241,0.15)':'rgba(248,113,113,0.15)',
                            color: m.type==='received'?'#4ade80':m.type==='sold'?'#6366f1':'#f87171' }}>
                            {m.type}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600, color: m.quantity>0?'#4ade80':'#f87171' }}>{m.quantity>0?'+':''}{m.quantity}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: '#facc15', fontWeight: 600 }}>{m.remainingAfter} pcs</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>{m.reason||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', padding: '1rem', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '8px' }}>
            {[['Total Received',`${totalReceived} pcs`,'#4ade80'],['Total Sold',`${totalSold} pcs`,'#6366f1'],
              ['Total Damaged',`${totalDamaged} pcs`,'#f87171'],['Return Credit',`${formatPrice(totalDamaged*batch.unitCost)}`,'#d97706'],
            ].map(([l,v,c]) => (
              <div key={l}>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>{l}</div>
                <div style={{ fontWeight: 600, color: c, fontSize: '1rem' }}>{v}</div>
              </div>
            ))}
          </div>
          {batch.notes?.trim() && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', textTransform: 'uppercase', color: '#6366f1' }}>Notes / Remarks</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--white)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{batch.notes}</p>
            </div>
          )}
          {batch.receiptImage && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--gold)' }}>Receipt / Invoice Image</h3>
              <img src={batch.receiptImage} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', display: 'block' }} />
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Inventory Expand Row ───────────────────────────────────────────────────────
// FIX: Reads from item.batches directly (single source of truth).
// Previously read from stock history (getStockHistory) which caused empty rows
// when batches were stored on the item but not in history, or vice versa.
function InventoryExpandRow({ item, colSpan }) {
  // Read directly from item.batches — this is always up-to-date
  // item.batches is updated by handleStockAddition in the main component
  const batches = useMemo(() => {
    return (item.batches || []).sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));
  }, [item.batches]);

  const totalValue = batches.reduce((sum, b) => sum + (b.remainingQty * b.unitCost), 0);
  const totalRemaining = batches.reduce((sum, b) => sum + (b.remainingQty || 0), 0);

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: 'rgba(99,102,241,0.03)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '0.75rem 1.25rem 1.25rem' }}>

          {/* Summary strip */}
          {batches.length > 0 && (
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', padding: '0.6rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                <strong style={{ color: 'var(--white)' }}>{batches.length}</strong> batch{batches.length !== 1 ? 'es' : ''}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                Remaining: <strong style={{ color: '#4ade80' }}>{totalRemaining} pcs</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                Stock Value: <strong style={{ color: 'var(--gold)' }}>{formatPrice(totalValue)}</strong>
              </span>

            </div>
          )}

          {batches.length > 0 ? (
            <div style={{
              maxHeight: batches.length <= 3 ? 'none' : '220px',
              overflowY: batches.length <= 3 ? 'visible' : 'auto',
              border: '1px solid var(--border)', borderRadius: '6px',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Batch ID', align: 'left' },
                      { label: 'Date Received', align: 'center' },
                      { label: 'Supplier', align: 'center' },
                      { label: 'Invoice / OR', align: 'center' },
                      { label: 'Original', align: 'center' },
                      { label: 'Good', align: 'center' },
                      { label: 'Damaged', align: 'center' },
                      { label: 'Remaining', align: 'center' },
                      { label: 'Unit Cost', align: 'center' },
                      { label: 'Batch Value', align: 'center' },
                      { label: '', align: 'center' },
                    ].map(h => (
                      <th key={h.label} style={{ padding: '0.6rem 0.75rem', textAlign: h.align, color: 'var(--gray)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'rgba(18,18,18,0.97)', zIndex: 2, borderBottom: '2px solid var(--border)' }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch, idx) => {
                    const isDepleted = (batch.remainingQty || 0) === 0;
                    const batchValue = (batch.remainingQty || 0) * (batch.unitCost || 0);
                    const damagedQty = batch.damagedQty || 0;
                    const goodQty = batch.goodQty ?? (batch.originalQty - damagedQty);

                    return (
                      <tr key={batch.batchId} style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        background: isDepleted ? 'rgba(0,0,0,0.15)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                        opacity: isDepleted ? 0.6 : 1,
                      }}>
                        {/* Batch ID */}
                        <td style={{ padding: '0.7rem 0.75rem' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: isDepleted ? 'var(--gray)' : 'var(--white)', fontSize: '0.75rem' }}>
                            {batch.batchId}
                          </span>
                          {isDepleted && (
                            <div style={{ fontSize: '0.62rem', color: '#f87171', marginTop: '0.15rem', fontWeight: 600 }}>DEPLETED</div>
                          )}
                        </td>

                        {/* Date */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {new Date(batch.dateReceived).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>

                        {/* Supplier */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', color: 'var(--white)', fontSize: '0.8rem' }}>
                          {batch.supplierName || 'General Merchandise'}
                        </td>

                        {/* Invoice */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.78rem' }}>
                          {batch.invoiceNumber
                            ? <span style={{ fontFamily: 'monospace', color: 'var(--white)', fontWeight: 600 }}>{batch.invoiceNumber}</span>
                            : <span style={{ color: 'var(--gray)', fontStyle: 'italic' }}>N/A</span>
                          }
                        </td>

                        {/* Original */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', color: 'var(--white)', fontSize: '0.8rem' }}>
                          {batch.originalQty} pcs
                        </td>

                        {/* Good */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gold)' }}>
                          {goodQty} pcs
                        </td>

                        {/* Damaged */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
                          {damagedQty > 0
                            ? <span style={{ color: '#f87171' }}>{damagedQty} pcs</span>
                            : <span style={{ color: 'var(--gray)' }}>—</span>
                          }
                        </td>

                        {/* Remaining */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                          <span style={{ color: isDepleted ? '#f87171' : 'rgb(250,204,21)' }}>
                            {batch.remainingQty || 0} pcs
                          </span>
                        </td>

                        {/* Unit Cost — FIX: no extra ₱ prefix, formatPrice handles display */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', color: 'var(--gold)', fontSize: '0.8rem', fontWeight: 600 }}>
                          {formatPrice(batch.unitCost || 0)}
                        </td>

                        {/* Batch Value */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', color: isDepleted ? 'var(--gray)' : '#facc15', fontSize: '0.8rem', fontWeight: 600 }}>
                          {formatPrice(batchValue)}
                        </td>

                        {/* View Details */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center' }}>
                          <button
                            onClick={() => window.dispatchEvent(new CustomEvent('openBatchDetails', { detail: { batch, item } }))}
                            style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', borderRadius: '4px', padding: '0.2rem 0.6rem', color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--gold)'; e.currentTarget.style.color = '#000'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,168,67,0.15)'; e.currentTarget.style.color = 'var(--gold)'; }}
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>
              No batch records yet.
              <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic' }}>
                Use the <strong style={{ color: 'var(--white)' }}>+</strong> button to add stock with supplier invoice tracking.
              </span>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
// ── Supplier Combobox (filtered by category) ───────────────────────────────────
// Shows: suppliers whose categories[] includes item's category
//      + suppliers with empty categories[] (General — supplies everything)
//      + always shows "General Merchandise" at top
// TODO: MongoDB — replace filter with API: GET /api/suppliers?category=Mugs
function SupplierCombobox({ value, supplierName, onChange, suppliers, itemCategory, onAddNew }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Filter: General suppliers (no categories) OR suppliers that serve this category
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

// ══════════════════════════════════════════════════════════════════════════════
// ── Item Masterlist Modal ──────────────────────────────────────────────────────
// Manages the 3-level product hierarchy: Category → Product → Variants[]
// This is the "Material Master" equivalent (SAP Fiori style).
//
// Rules:
//  - Cannot delete Category if has products
//  - Cannot delete Product if linked to active inventory items
//  - Variants are optional (some products have no variants e.g. "Ceramic White Mug")
//  - Categories derived from masterlist replace pmp_inventory_categories
//
// TODO: MongoDB — Each CRUD action below maps to its own API endpoint.
// See getMasterlist() helper above for full API mapping.
// ══════════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────────
// ── Variant Grouping Checkboxes (for Masterlist Pricing) ───────────────────────
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

// ─── buildColumnGroups ──────────────────────────────────────────────────────────
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

// ─── getColumnPrice helper ─────────────────────────────────────────────────────
function getColumnPrice(comboIds, prices) {
  if (!comboIds.length) return '';
  const vals = comboIds.map(id => prices[id] || '');
  const nonEmpty = vals.find(v => v !== '');
  return nonEmpty !== undefined ? nonEmpty : '';
}

// ─── syncMergedPrices helper ───────────────────────────────────────────────────
function syncMergedPrices(comboIds, currentPrices, newValue) {
  const updated = { ...currentPrices };
  comboIds.forEach(cid => {
    updated[cid] = newValue;
  });
  return updated;
}

// ─── SmartPricingTable ─────────────────────────────────────────────────────────
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
                      <IntegerInput
                        className="tier-input"
                        value={tier.minQty ?? ''}
                        placeholder=""
                        min={0}
                        onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'minQty', v); }}
                      />
                    </td>
                    <td>
                      <IntegerInput
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
                    <IntegerInput
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
                    <IntegerInput
                      className="tier-input"
                      value={tier.minQty ?? ''}
                      placeholder="1"
                      min={0}
                      onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'minQty', v); }}
                    />
                  </td>
                  <td>
                    <IntegerInput
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
                      <IntegerInput
                        className="tier-input"
                        value={colPrice}
                        onChange={e => {
                          const newVal = sanitizeNumber(e.target.value);
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

// ───────────────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ItemMasterlistModal({ isOpen, onClose, masterlist, onSave, inventory }) {
  const [localList, setLocalList] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [expandedProds, setExpandedProds] = useState(new Set()); // NEW: For SKU combinations view
  const [infoModal, setInfoModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  // ── Add/Edit form state ────────────────────────────────────────────────────
  // mode: null | 'add-cat' | 'edit-cat' | 'add-prod' | 'edit-prod'
  const [formMode, setFormMode] = useState(null);
  const [formCatId, setFormCatId] = useState(null);   // which category context
  const [formProdId, setFormProdId] = useState(null); // which product (for edit)
  const [formName, setFormName] = useState('');
  const [formVariantTypes, setFormVariantTypes] = useState([]); // NEW: Multi-dimensional variant types
  const [variantTypeInput, setVariantTypeInput] = useState(''); // Current variant type name
  const [variantOptionInputs, setVariantOptionInputs] = useState({}); // Per-type option inputs (fixes bug)
  const [editingLinked, setEditingLinked] = useState(false); // true when editing a product linked to inventory
  
  // Pricing state (Fixed/Tiered/Inquiry)
  const [priceType, setPriceType] = useState('fixed'); // 'fixed' | 'tiered' | 'inquiry'
  const [fixedPrice, setFixedPrice] = useState('');
  const [priceTiers, setPriceTiers] = useState([]);
  const [tierInput, setTierInput] = useState({ min: '', max: '', price: '' });
  const [groupChecks, setGroupChecks] = useState({}); // For variant grouping in pricing
  
  // Helper to create new variant type with isTracked default
  const createVariantType = (name, options = [], isTracked = true) => ({
    id: `vt-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    name,
    options,
    isTracked
  });

  useEffect(() => {
    if (isOpen) {
      setLocalList(masterlist.map(c => ({ ...c, products: (c.products||[]).map(p => ({ ...p })) })));
      setSearch('');
      setFormMode(null);
      setExpandedCats(new Set(masterlist.map(c => c.id))); // expand all by default
    }
  }, [isOpen, masterlist]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

  // Generate all SKU combinations from variant types
  const generateSkuCombinations = (variantTypes, categoryName, productName) => {
    if (!variantTypes || variantTypes.length === 0) return [];

    // Filter only tracked variant types for SKU generation
    const trackedTypes = variantTypes.filter(vt => vt.isTracked);
    
    // If no tracked types, return empty (no SKU needed for non-tracked items)
    if (trackedTypes.length === 0) return [];

    const combinations = [[]];
    for (const variantType of trackedTypes) {
      const newCombinations = [];
      for (const combo of combinations) {
        for (const option of variantType.options) {
          newCombinations.push([...combo, option]);
        }
      }
      combinations.length = 0;
      combinations.push(...newCombinations);
    }

    // Format as SKU objects
    return combinations.map(combo => {
      const skuSuffix = combo.map(opt => opt.substring(0, 3).toUpperCase()).join('-');
      const variantName = combo.join(' - ');
      const catPrefix = categoryName.substring(0, 3).toUpperCase();
      const prodPrefix = productName.substring(0, 3).toUpperCase();
      return {
        sku: `${catPrefix}-${prodPrefix}-${skuSuffix}`,  // MUG-CER-WHT-11O
        name: `${productName} ${variantName}`,
        category: categoryName,
        variants: combo,
        isTracked: true  // This is a stockable SKU
      };
    });
  };

  const getLinkedInventoryCount = (catName, prodName) =>
    inventory.filter(i => i.isActive !== false && i.category === catName && i.name === prodName).length;

  const getCatProductCount = (catId) =>
    (localList.find(c => c.id === catId)?.products || []).length;

  // Returns total linked inventory items across ALL products in this category
  // Used to lock Edit + Delete on category level
  const getCatLinkedCount = (cat) =>
    (cat.products || []).reduce((sum, prod) => sum + getLinkedInventoryCount(cat.name, prod.name), 0);

  // ── Category actions ───────────────────────────────────────────────────────
  const startAddCat = () => {
    setFormMode('add-cat'); setFormCatId(null);
    setFormName(''); setFormVariants([]); setVariantInput('');
  };

  const startEditCat = (cat) => {
    // Block edit if any product in this category is linked to active inventory
    // TODO: MongoDB — GET /api/inventory/count?category=:name
    const catLinked = getCatLinkedCount(cat);
    if (catLinked > 0) {
      setInfoModal({
        title: 'Cannot Edit Category',
        message: `"${cat.name}" is referenced by ${catLinked} active inventory item(s). Remove or re-link those inventory items first before renaming this category.`
      });
      return;
    }
    setFormMode('edit-cat'); setFormCatId(cat.id);
    setFormName(cat.name); setFormVariants([]); setVariantInput('');
  };

  const handleDeleteCat = (cat) => {
    // TODO: MongoDB — DELETE /api/masterlist/categories/:id
    // Block if linked to active inventory items (checked first — stricter condition)
    const catLinked = getCatLinkedCount(cat);
    if (catLinked > 0) {
      setInfoModal({
        title: 'Cannot Delete Category',
        message: `"${cat.name}" is referenced by ${catLinked} active inventory item(s). Remove or re-link those inventory items first.`
      });
      return;
    }
    // Block if has products (no inventory link but still has products)
    const prodCount = getCatProductCount(cat.id);
    if (prodCount > 0) {
      setInfoModal({ title: 'Cannot Delete Category', message: `"${cat.name}" has ${prodCount} product(s). Remove all products first before deleting this category.` });
      return;
    }
    setConfirmModal({
      title: 'Delete Category',
      message: `Permanently delete category "${cat.name}"?`,
      confirmLabel: 'Delete', confirmClass: 'btn-danger',
      onConfirm: () => {
        const updated = localList.filter(c => c.id !== cat.id);
        setLocalList(updated); onSave(updated);
        setConfirmModal(null);
      }
    });
  };

  // ── Product actions ────────────────────────────────────────────────────────
  const startAddProd = (catId) => {
    setFormMode('add-prod'); setFormCatId(catId);
    setFormProdId(null); setFormName(''); 
    setFormVariantTypes([]); 
    setVariantTypeInput(''); 
    setVariantOptionInputs({});
  };

  const startEditProd = (catId, prod) => {
    // TODO: MongoDB — GET /api/inventory/count?category=:catName&name=:prodName
    // If linked: allow edit but lock name (variant types still editable)
    const cat = localList.find(c => c.id === catId);
    const linkedCount = cat ? getLinkedInventoryCount(cat.name, prod.name) : 0;
    setEditingLinked(linkedCount > 0);
    setFormMode('edit-prod'); setFormCatId(catId); setFormProdId(prod.id);
    setFormName(prod.name); 
    // Load existing variant types or convert old variants format
    if (prod.variantTypes && Array.isArray(prod.variantTypes)) {
      setFormVariantTypes([...prod.variantTypes]);
    } else if (prod.variants && Array.isArray(prod.variants)) {
      // Convert old single variants array to variantTypes format
      setFormVariantTypes([{
        id: genId(),
        name: 'Options',
        options: [...prod.variants]
      }]);
    } else {
      setFormVariantTypes([]);
    }
    
    // Load pricing
    setPriceType(prod.priceType || 'fixed');
    setFixedPrice(prod.flatPrice || '');
    setPriceTiers(prod.priceTiers || []);
    
    setVariantTypeInput('');
    setVariantOptionInputs({});
    setTierInput({ min: '', max: '', price: '' });
  };

  const handleDeleteProd = (cat, prod) => {
    // TODO: MongoDB — DELETE /api/masterlist/products/:id
    // Block if linked to active inventory items
    const linkedCount = getLinkedInventoryCount(cat.name, prod.name);
    if (linkedCount > 0) {
      setInfoModal({ title: 'Cannot Delete Product', message: `"${prod.name}" is linked to ${linkedCount} active inventory item(s). Remove those inventory items first.` });
      return;
    }
    setConfirmModal({
      title: 'Delete Product',
      message: `Delete "${prod.name}" from ${cat.name}?`,
      confirmLabel: 'Delete', confirmClass: 'btn-danger',
      onConfirm: () => {
        const updated = localList.map(c => c.id !== cat.id ? c : { ...c, products: c.products.filter(p => p.id !== prod.id) });
        setLocalList(updated); onSave(updated);
        setConfirmModal(null);
      }
    });
  };

  // ── Variant Type actions (multi-dimensional variants) ─────────────────────
  // Add new variant type (e.g., "Capacity", "Color")
  const addVariantType = () => {
    const name = variantTypeInput.trim();
    if (!name) return;
    if (formVariantTypes.some(vt => vt.name.toLowerCase() === name.toLowerCase())) {
      setInfoModal({ title: 'Duplicate Variant Type', message: `"${name}" already exists.` });
      return;
    }
    const newVariantType = createVariantType(name, [], true);  // Default to tracked
    setFormVariantTypes(prev => [...prev, newVariantType]);
    setVariantTypeInput('');
  };

  const removeVariantType = (index) => {
    setFormVariantTypes(prev => prev.filter((_, i) => i !== index));
  };

  // Add option to variant type (e.g., "11oz" to "Capacity")
  const addVariantOption = (typeIndex) => {
    const option = (variantOptionInputs[typeIndex] || '').trim();
    if (!option) return;
    const updated = [...formVariantTypes];
    if (updated[typeIndex].options.some(o => o.toLowerCase() === option.toLowerCase())) {
      setInfoModal({ title: 'Duplicate Option', message: `"${option}" already exists in ${updated[typeIndex].name}.` }); 
      return;
    }
    updated[typeIndex].options.push(option);
    setFormVariantTypes(updated);
    // Clear only this type's input
    setVariantOptionInputs(prev => ({ ...prev, [typeIndex]: '' }));
  };

  const removeVariantOption = (typeIndex, optionIndex) => {
    const updated = [...formVariantTypes];
    updated[typeIndex].options.splice(optionIndex, 1);
    setFormVariantTypes(updated);
  };

  // Calculate total combinations
  const getTotalCombinations = () => {
    if (formVariantTypes.length === 0) return 0;
    return formVariantTypes.reduce((total, vt) => {
      if (vt.options.length === 0) return total;
      return total * vt.options.length;
    }, 1);
  };

  // ── Form submit ────────────────────────────────────────────────────────────
  const handleFormSubmit = () => {
    if (!formName.trim()) {
      setInfoModal({ title: 'Validation Error', message: 'Please enter a name.' }); return;
    }
    let updated = [...localList];

    if (formMode === 'add-cat') {
      // TODO: MongoDB — POST /api/masterlist/categories { name }
      const isDup = localList.some(c => c.name.toLowerCase() === formName.trim().toLowerCase());
      if (isDup) { setInfoModal({ title: 'Duplicate', message: `Category "${formName.trim()}" already exists.` }); return; }
      updated = [...localList, { id: genId(), name: formName.trim(), products: [], createdAt: new Date().toISOString() }];
      setExpandedCats(prev => new Set([...prev, updated[updated.length-1].id]));

    } else if (formMode === 'edit-cat') {
      // TODO: MongoDB — PUT /api/masterlist/categories/:id { name }
      const isDup = localList.some(c => c.name.toLowerCase() === formName.trim().toLowerCase() && c.id !== formCatId);
      if (isDup) { setInfoModal({ title: 'Duplicate', message: `Category "${formName.trim()}" already exists.` }); return; }
      updated = localList.map(c => c.id !== formCatId ? c : { ...c, name: formName.trim(), updatedAt: new Date().toISOString() });

    } else if (formMode === 'add-prod') {
      // TODO: MongoDB — POST /api/masterlist/products { categoryId, name, variantTypes[], priceType, flatPrice, priceTiers }
      const cat = localList.find(c => c.id === formCatId);
      if (!cat) return;
      const isDup = (cat.products||[]).some(p => p.name.toLowerCase() === formName.trim().toLowerCase());
      if (isDup) { setInfoModal({ title: 'Duplicate', message: `"${formName.trim()}" already exists under ${cat.name}.` }); return; }
      const newProd = { 
        id: genId(), 
        name: formName.trim(), 
        variantTypes: formVariantTypes,  // NEW: Multi-dimensional variant types
        priceType: priceType,  // NEW: Pricing
        flatPrice: priceType === 'fixed' ? parseFloat(fixedPrice) || 0 : null,
        priceTiers: priceType === 'tiered' ? priceTiers.map(t => ({
          min: parseInt(t.min),
          max: parseInt(t.max),
          price: parseFloat(t.price)
        })) : [],
        createdAt: new Date().toISOString() 
      };
      updated = localList.map(c => c.id !== formCatId ? c : { ...c, products: [...(c.products||[]), newProd] });

    } else if (formMode === 'edit-prod') {
      // TODO: MongoDB — PUT /api/masterlist/products/:id { name, variantTypes[], priceType, flatPrice, priceTiers }
      const cat = localList.find(c => c.id === formCatId);
      if (!cat) return;
      const isDup = (cat.products||[]).some(p => p.name.toLowerCase() === formName.trim().toLowerCase() && p.id !== formProdId);
      if (isDup) { setInfoModal({ title: 'Duplicate', message: `"${formName.trim()}" already exists under ${cat.name}.` }); return; }
      updated = localList.map(c => c.id !== formCatId ? c : {
        ...c, products: c.products.map(p => p.id !== formProdId ? p : { 
          ...p, 
          name: formName.trim(), 
          variantTypes: formVariantTypes,  // NEW: Multi-dimensional variant types
          priceType: priceType,  // NEW: Pricing
          flatPrice: priceType === 'fixed' ? parseFloat(fixedPrice) || 0 : null,
          priceTiers: priceType === 'tiered' ? priceTiers.map(t => ({
            min: parseInt(t.min),
            max: parseInt(t.max),
            price: parseFloat(t.price)
          })) : [],
          updatedAt: new Date().toISOString() 
        })
      });
    }

    setLocalList(updated);
    onSave(updated);
    setFormMode(null); 
    setFormName(''); 
    setFormVariantTypes([]); 
    setVariantTypeInput(''); 
    setVariantOptionInputs({}); 
    setPriceType('fixed');
    setFixedPrice('');
    setPriceTiers([]);
    setTierInput({ min: '', max: '', price: '' });
    setEditingLinked(false);
  };

  const cancelForm = () => {
    setFormMode(null);
    setFormName('');
    setFormVariantTypes([]);
    setVariantTypeInput('');
    setVariantOptionInputs({});
    setPriceType('fixed');
    setFixedPrice('');
    setPriceTiers([]);
    setTierInput({ min: '', max: '', price: '' });
    setGroupChecks({});
    setEditingLinked(false);
  };

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = localList.filter(cat =>
    !search || cat.name.toLowerCase().includes(search.toLowerCase()) ||
    (cat.products||[]).some(p => p.name.toLowerCase().includes(search.toLowerCase()))
  );

  if (!isOpen) return null;

  const isInForm = !!formMode;
  const formTitle = formMode === 'add-cat' ? 'Add Category'
    : formMode === 'edit-cat' ? 'Edit Category'
    : formMode === 'add-prod' ? `Add Product — ${localList.find(c=>c.id===formCatId)?.name||''}`
    : formMode === 'edit-prod' ? `Edit Product — ${localList.find(c=>c.id===formCatId)?.name||''}`
    : '';

  const totalCats = localList.length;
  const totalProds = localList.reduce((s, c) => s + (c.products||[]).length, 0);

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '860px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">
              {isInForm ? formTitle : 'Item Masterlist'}
            </h2>
            {!isInForm && (
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
                {totalCats} {totalCats===1?'category':'categories'} · {totalProds} {totalProds===1?'product':'products'}
              </div>
            )}
          </div>
          <button className="modal-close" onClick={isInForm ? cancelForm : onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ── FORM VIEW ─────────────────────────────────────────────────── */}
        {isInForm ? (
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>

            {/* Name field */}
            <div className="form-group">
              <label className="form-label">
                {formMode.includes('cat') ? 'Product Category Name' : 'Product Variant Name'}
                <span className="required"> *</span>
                {editingLinked
                  ? <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#f59e0b', marginLeft: '0.5rem' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.2rem' }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Locked — linked to inventory
                    </span>
                  : <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>max 80 chars</span>
                }
              </label>
              <input type="text" className="form-input" value={formName}
                onChange={e => { if (!editingLinked) setFormName(e.target.value.slice(0, 80)); }}
                readOnly={editingLinked}
                placeholder={formMode.includes('cat') ? 'e.g., Canvas Totebag, Mugs, Stickers & Labels' : 'e.g., Plain Totebag, Ceramic White, Vinyl Waterproof'}
                maxLength={80} autoFocus={!editingLinked}
                style={editingLinked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (formMode.includes('cat')) handleFormSubmit(); else document.getElementById('variant-type-input-field')?.focus(); } }} />
              {editingLinked && (
                <p className="form-hint" style={{ color: '#f59e0b' }}>
                  Name is locked — linked to active inventory items. You can still edit variant types below.
                </p>
              )}
            </div>

            {/* Variants — only for products (Multi-Dimensional Variant Types) */}
            {formMode.includes('prod') && (
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label className="form-label">
                  Variant Types
                  <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional — e.g., Capacity, Color, Size)</span>
                </label>
                <p className="form-hint" style={{ marginBottom: '1rem' }}>
                <strong>Track Stock?</strong> - Checked = Included in SKU & stock tracking (e.g., Color, Size). Unchecked = Add-on only, no stock deduction (e.g., Gift Box, Ribbon).
                </p>

                {/* Variant Types List */}
                {formVariantTypes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                    {formVariantTypes.map((vt, typeIdx) => (
                      <div key={vt.id} style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem' }}>
                        {/* Variant Type Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--gray)', background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
                              Type {typeIdx + 1}
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.9rem' }}>{vt.name}</span>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem', fontSize: '0.75rem', color: vt.isTracked ? 'var(--gold)' : 'var(--gray)', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={vt.isTracked}
                                onChange={e => {
                                  const newTypes = [...formVariantTypes];
                                  newTypes[typeIdx] = { ...vt, isTracked: e.target.checked };
                                  setFormVariantTypes(newTypes);
                                }}
                                onClick={e => e.stopPropagation()}
                                style={{ accentColor: 'var(--gold)', cursor: 'pointer' }}
                              />
                              <span style={{ fontWeight: 500 }}>Track Stock?</span>
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeVariantType(typeIdx)}
                            style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Remove Type
                          </button>
                        </div>

                        {/* Variant Options Chips */}
                        {vt.options.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                            {vt.options.map((opt, optIdx) => (
                              <span key={optIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '20px', fontSize: '0.8rem', color: '#6366f1', fontWeight: 500 }}>
                                {opt}
                                <button type="button" onClick={() => removeVariantOption(typeIdx, optIdx)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Add Option Input */}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input 
                            id={`variant-option-input-${typeIdx}`}
                            type="text" 
                            className="form-input" 
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
                    id="variant-type-input-field"
                    type="text" 
                    className="form-input" 
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
                {formVariantTypes.length > 0 && getTotalCombinations() > 0 && (
                  <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: 'var(--gold)' }}>Total Combinations:</strong>
                        <span style={{ color: 'var(--white)', marginLeft: '0.5rem', fontWeight: 600 }}>
                          {getTotalCombinations()} unique SKU{getTotalCombinations() !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                        {formVariantTypes.map(vt => `${vt.options.length} ${vt.name}`).join(' × ')}
                      </div>
                    </div>
                  </div>
                )}

                <p className="form-hint">
                  {formVariantTypes.length === 0
                    ? 'No variant types — item will be stocked as a single product.'
                    : `${formVariantTypes.length} variant type(s) defined. Each combination will be a unique SKU in inventory.`}
                </p>
              </div>
            )}

            {/* Pricing Section (Fixed/Tiered/Inquiry) - Same as Add Product module */}
            {formMode.includes('prod') && (
              <div className="form-section" style={{ marginTop: '1.5rem' }}>
                <h2 className="form-section-title">Pricing</h2>

                <div className="price-type-row">
                  {[
                    { val: 'fixed',   label: 'Fixed Price' },
                    { val: 'tiered',  label: 'Tier Price' },
                    { val: 'inquiry', label: 'For Inquiry' },
                  ].map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      className={`price-type-btn${priceType === val ? ' selected' : ''}`}
                      onClick={() => setPriceType(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {priceType === 'fixed' && (
                  <>
                    {/* Show SmartPricingTable if has variant types */}
                    {formVariantTypes.length > 0 && formVariantTypes.some(vt => vt.options.length > 0) ? (
                      <>
                        {/* Generate combinations for pricing table */}
                        {(() => {
                          // Generate variantGroups format for SmartPricingTable
                          const variantGroups = formVariantTypes.map(vt => ({
                            id: vt.id,
                            name: vt.name,
                            options: vt.options.map((opt, idx) => ({ id: `${vt.id}-opt-${idx}`, value: opt }))
                          }));

                          // Generate all combinations
                          const generateCombinations = (types) => {
                            if (types.length === 0) return [{}];
                            const [first, ...rest] = types;
                            const restCombos = generateCombinations(rest);
                            return first.options.flatMap(opt =>
                              restCombos.map(restCombo => ({
                                [first.id]: opt.value,
                                ...restCombo
                              }))
                            );
                          };

                          const combinations = generateCombinations(variantGroups).map((combo, idx) => ({
                            id: `combo-${idx}`,
                            combo,
                            label: Object.values(combo).join(' / ')
                          }));

                          // Convert priceTiers to SmartPricingTable format
                          const tiers = priceTiers.length > 0 ? priceTiers.map((tier, idx) => ({
                            id: tier.id || `tier-${idx}`,
                            minQty: tier.min,
                            maxQty: tier.max,
                            prices: Object.fromEntries(combinations.map(c => [c.id, tier.price || '']))
                          })) : [{
                            id: 'tier-1',
                            minQty: 1,
                            maxQty: 20,
                            prices: Object.fromEntries(combinations.map(c => [c.id, '']))
                          }];

                          return (
                            <>
                              <SmartPricingTable
                                tiers={tiers}
                                variantGroups={variantGroups}
                                combinations={combinations}
                                groupChecks={groupChecks}
                                onPriceChange={(tierId, comboId, val) => {
                                  const updatedTiers = tiers.map(t => {
                                    if (t.id === tierId) {
                                      return {
                                        ...t,
                                        prices: syncMergedPrices(
                                          buildColumnGroups(variantGroups, combinations, groupChecks)
                                            .find(cg => cg.comboIds.includes(comboId))?.comboIds || [comboId],
                                          t.prices,
                                          val
                                        )
                                      };
                                    }
                                    return t;
                                  });
                                  setPriceTiers(updatedTiers.map(t => ({
                                    min: t.minQty,
                                    max: t.maxQty,
                                    price: t.prices[Object.keys(t.prices)[0]] // Get first price for storage
                                  })));
                                }}
                                updateTierRange={(tierId, field, val) => {
                                  const updatedTiers = tiers.map(t => {
                                    if (t.id === tierId) {
                                      return { ...t, [field]: val === '' ? null : parseInt(val) || 0 };
                                    }
                                    return t;
                                  });
                                  setPriceTiers(updatedTiers.map(t => ({
                                    min: t.minQty,
                                    max: t.maxQty,
                                    price: t.prices[Object.keys(t.prices)[0]]
                                  })));
                                }}
                                removeTier={(tierId) => {
                                  const updatedTiers = tiers.filter(t => t.id !== tierId);
                                  setPriceTiers(updatedTiers.map(t => ({
                                    min: t.minQty,
                                    max: t.maxQty,
                                    price: t.prices[Object.keys(t.prices)[0]]
                                  })));
                                }}
                                mode="fixed"
                              />
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      /* Simple fixed price input when no variants */
                      <div className="form-group">
                        <div className="tier-price-cell">
                          <span className="peso">₱</span>
                          <FormattedDecimalInput
                            className="tier-input"
                            value={fixedPrice}
                            onChange={e => setFixedPrice(e.target.value)}
                            placeholder="0"
                            min={0}
                            step="0.01"
                          />
                        </div>
                        <p className="form-hint">This price will auto-fill in Add Product. Can be overridden there.</p>
                      </div>
                    )}
                  </>
                )}

                {priceType === 'tiered' && (
                  <>
                    {/* Show SmartPricingTable if has variant types */}
                    {formVariantTypes.length > 0 && formVariantTypes.some(vt => vt.options.length > 0) ? (
                      <>
                        {(() => {
                          // Generate variantGroups format for SmartPricingTable
                          const variantGroups = formVariantTypes.map(vt => ({
                            id: vt.id,
                            name: vt.name,
                            options: vt.options.map((opt, idx) => ({ id: `${vt.id}-opt-${idx}`, value: opt }))
                          }));

                          // Generate all combinations
                          const generateCombinations = (types) => {
                            if (types.length === 0) return [{}];
                            const [first, ...rest] = types;
                            const restCombos = generateCombinations(rest);
                            return first.options.flatMap(opt =>
                              restCombos.map(restCombo => ({
                                [first.id]: opt.value,
                                ...restCombo
                              }))
                            );
                          };

                          const combinations = generateCombinations(variantGroups).map((combo, idx) => ({
                            id: `combo-${idx}`,
                            combo,
                            label: Object.values(combo).join(' / ')
                          }));

                          // Convert priceTiers to SmartPricingTable format
                          const tiers = priceTiers.length > 0 ? priceTiers.map((tier, idx) => ({
                            id: tier.id || `tier-${idx}`,
                            minQty: tier.min,
                            maxQty: tier.max,
                            prices: Object.fromEntries(combinations.map(c => [c.id, tier.price || '']))
                          })) : [{
                            id: 'tier-1',
                            minQty: 1,
                            maxQty: 20,
                            prices: Object.fromEntries(combinations.map(c => [c.id, '']))
                          }];

                          // Check if we should show variant grouping checkboxes (only for tiered with 2+ types that have 2+ options each)
                          const shouldShowGrouping = variantGroups.length >= 2 && 
                            variantGroups.every(vg => vg.options.length >= 2);

                          return (
                            <>
                              {shouldShowGrouping && (
                                <VariantGroupingCheckboxes
                                  variantGroups={variantGroups}
                                  groupChecks={groupChecks}
                                  onGroupChecksChange={setGroupChecks}
                                />
                              )}
                              <SmartPricingTable
                                tiers={tiers}
                                variantGroups={variantGroups}
                                combinations={combinations}
                                groupChecks={groupChecks}
                                onPriceChange={(tierId, comboId, val) => {
                                  const updatedTiers = tiers.map(t => {
                                    if (t.id === tierId) {
                                      return {
                                        ...t,
                                        prices: syncMergedPrices(
                                          buildColumnGroups(variantGroups, combinations, groupChecks)
                                            .find(cg => cg.comboIds.includes(comboId))?.comboIds || [comboId],
                                          t.prices,
                                          val
                                        )
                                      };
                                    }
                                    return t;
                                  });
                                  setPriceTiers(updatedTiers.map(t => ({
                                    min: t.minQty,
                                    max: t.maxQty,
                                    price: t.prices[Object.keys(t.prices)[0]]
                                  })));
                                }}
                                updateTierRange={(tierId, field, val) => {
                                  const updatedTiers = tiers.map(t => {
                                    if (t.id === tierId) {
                                      return { ...t, [field]: val === '' ? null : parseInt(val) || 0 };
                                    }
                                    return t;
                                  });
                                  setPriceTiers(updatedTiers.map(t => ({
                                    min: t.minQty,
                                    max: t.maxQty,
                                    price: t.prices[Object.keys(t.prices)[0]]
                                  })));
                                }}
                                removeTier={(tierId) => {
                                  const updatedTiers = tiers.filter(t => t.id !== tierId);
                                  setPriceTiers(updatedTiers.map(t => ({
                                    min: t.minQty,
                                    max: t.maxQty,
                                    price: t.prices[Object.keys(t.prices)[0]]
                                  })));
                                }}
                                mode="tiered"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newTier = {
                                    id: `tier-${Date.now()}`,
                                    minQty: tiers.length > 0 ? (tiers[tiers.length - 1].maxQty || 20) + 1 : 21,
                                    maxQty: null,
                                    prices: Object.fromEntries(combinations.map(c => [c.id, '']))
                                  };
                                  const updatedTiers = [...tiers, newTier];
                                  setPriceTiers(updatedTiers.map(t => ({
                                    min: t.minQty,
                                    max: t.maxQty,
                                    price: t.prices[Object.keys(t.prices)[0]]
                                  })));
                                }}
                                className="add-tier-btn"
                              >
                                Add Price Tier
                              </button>
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      /* Simple tier list when no variants */
                      <div>
                        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                          {priceTiers.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--gray)', fontSize: '0.875rem' }}>
                              No price tiers yet. Click "Add Tier" to add wholesale pricing.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                              {priceTiers.map((tier, idx) => (
                                <div key={tier.id || idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                                  <div>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem', display: 'block' }}>Min Qty</label>
                                    <FormattedIntegerInput
                                      className="form-input"
                                      value={tier.min}
                                      onChange={e => {
                                        const newTiers = [...priceTiers];
                                        newTiers[idx] = { ...tier, min: e.target.value };
                                        setPriceTiers(newTiers);
                                      }}
                                      min={1}
                                      placeholder="1"
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem', display: 'block' }}>Max Qty</label>
                                    <FormattedIntegerInput
                                      className="form-input"
                                      value={tier.max}
                                      onChange={e => {
                                        const newTiers = [...priceTiers];
                                        newTiers[idx] = { ...tier, max: e.target.value };
                                        setPriceTiers(newTiers);
                                      }}
                                      min={tier.min || 1}
                                      placeholder="∞"
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem', display: 'block' }}>Price</label>
                                    <div className="tier-price-cell">
                                      <span className="peso">₱</span>
                                      <FormattedDecimalInput
                                        className="tier-input"
                                        value={tier.price}
                                        onChange={e => {
                                          const newTiers = [...priceTiers];
                                          newTiers[idx] = { ...tier, price: e.target.value };
                                          setPriceTiers(newTiers);
                                        }}
                                        placeholder="0"
                                        step="0.01"
                                      />
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newTiers = priceTiers.filter((_, i) => i !== idx);
                                      setPriceTiers(newTiers);
                                    }}
                                    style={{ padding: '0.5rem 0.75rem', background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {priceTiers.length < 10 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newTier = {
                                  id: `tier-${Date.now()}`,
                                  min: priceTiers.length > 0 ? (parseInt(priceTiers[priceTiers.length - 1].max) || 1) + 1 : 1,
                                  max: '',
                                  price: ''
                                };
                                setPriceTiers([...priceTiers, newTier]);
                              }}
                              style={{ padding: '0.5rem 1rem', background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              + Add Tier
                            </button>
                          )}
                          {priceTiers.length >= 10 && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem' }}>Maximum 10 tiers reached.</p>
                          )}
                        </div>
                        <p className="form-hint">Optional. Set wholesale pricing for bulk orders (e.g., 21-30 pcs = ₱90, 31-50 pcs = ₱85).</p>
                      </div>
                    )}
                  </>
                )}

                {priceType === 'inquiry' && (
                  <div style={{ padding: '1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--gray)', margin: 0 }}>
                      Price will be "For Inquiry" — customers must contact you for pricing. No price will be shown publicly.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={cancelForm}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleFormSubmit}>
                {formMode.startsWith('add') ? 'Add' : 'Update'}
              </button>
            </div>
          </div>

        ) : (
          /* ── LIST VIEW ──────────────────────────────────────────────── */
          <>
            {/* Toolbar */}
            <div style={{ padding: '0 1.5rem 1rem', flexShrink: 0, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div className="search-wrapper" style={{ flex: 1 }}>
                <span className="search-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                </span>
                <input type="text" className="search-input" placeholder="Search categories or products..."
                  value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
              </div>
              <button type="button" className="btn-primary" onClick={startAddCat} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                + Add Product Category
              </button>
            </div>

            {/* Category list */}
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', paddingTop: 0 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                  {search ? (
                    <p>No results for "<strong style={{ color: 'var(--white)' }}>{search}</strong>"</p>
                  ) : (
                    <>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--gray)', marginBottom: '1rem' }}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                      <p style={{ fontWeight: 600, color: 'var(--white)', marginBottom: '0.5rem' }}>No categories yet</p>
                      <p style={{ fontSize: '0.875rem' }}>Click <strong style={{ color: 'var(--gold)' }}>+ Add Product Category</strong> to start building your masterlist.</p>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {filtered.map(cat => {
                    const isExpanded = expandedCats.has(cat.id);
                    const prodCount = (cat.products||[]).length;
                    const catLinkedCount = getCatLinkedCount(cat);
                    const catIsLocked = catLinkedCount > 0;
                    return (
                      <div key={cat.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>

                        {/* Category header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', background: 'rgba(0,0,0,0.2)', cursor: 'pointer' }}
                          onClick={() => setExpandedCats(prev => { const n = new Set(prev); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            style={{ color: 'var(--gray)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
                            <path d="M9 18l6-6-6-6"/>
                          </svg>
                          <span style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.9rem', flex: 1 }}>{cat.name}</span>
                          {catIsLocked && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '0.15rem 0.5rem', borderRadius: '10px', flexShrink: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              {catLinkedCount} in inventory
                            </span>
                          )}
                          <span style={{ fontSize: '0.72rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                            {prodCount} {prodCount===1?'product':'products'}
                          </span>
                          {!catIsLocked && (<>
                            <button type="button" onClick={e => { e.stopPropagation(); startEditCat(cat); }}
                              style={{ background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', minWidth: '52px', flexShrink: 0, borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                            <button type="button" onClick={e => { e.stopPropagation(); handleDeleteCat(cat); }}
                              style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', minWidth: '64px', flexShrink: 0, borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                          </>)}
                        </div>

                        {/* Products list */}
                        {isExpanded && (
                          <div style={{ padding: '0.5rem 1rem 0.75rem' }}>
                            {(cat.products||[]).length === 0 ? (
                              <p style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                                No products yet — click below to add.
                              </p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                {(cat.products||[]).map(prod => {
                                  const linked = getLinkedInventoryCount(cat.name, prod.name);
                                  const isExpanded = expandedProds.has(prod.id);
                                  const hasVariantTypes = prod.variantTypes && prod.variantTypes.length > 0;
                                  const skuCombinations = hasVariantTypes ? generateSkuCombinations(prod.variantTypes, cat.name, prod.name) : [];
                                  
                                  return (
                                    <div key={prod.id} style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                                      {/* Product Row */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)' }}>
                                        {/* Expand Chevron */}
                                        <button 
                                          onClick={() => {
                                            if (hasVariantTypes) {
                                              setExpandedProds(prev => {
                                                const next = new Set(prev);
                                                if (next.has(prod.id)) next.delete(prod.id);
                                                else next.add(prod.id);
                                                return next;
                                              });
                                            }
                                          }}
                                          style={{ 
                                            background: 'none', 
                                            border: 'none', 
                                            color: hasVariantTypes ? 'var(--gray)' : 'rgba(100,100,100,0.3)',
                                            cursor: hasVariantTypes ? 'pointer' : 'default',
                                            padding: '0', 
                                            display: 'flex', 
                                            alignItems: 'center',
                                            width: '20px',
                                            flexShrink: 0
                                          }}
                                          title={hasVariantTypes ? (isExpanded ? 'Collapse SKUs' : 'Expand SKUs') : 'No variant types'}
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                            style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                            <path d="M9 18l6-6-6-6"/>
                                          </svg>
                                        </button>
                                        
                                        {/* Product info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.875rem' }}>{prod.name}</span>
                                            {linked > 0 && (
                                              <span style={{ fontSize: '0.65rem', color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                                                {linked} in inventory
                                              </span>
                                            )}
                                            {hasVariantTypes && (
                                              <span style={{ fontSize: '0.6rem', color: 'var(--gold)', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                                {skuCombinations.length} SKUs
                                              </span>
                                            )}
                                          </div>
                                          
                                          {/* Show variant types summary */}
                                          {hasVariantTypes ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.3rem' }}>
                                              {prod.variantTypes.map((vt, idx) => (
                                                <span key={idx} style={{ fontSize: '0.68rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                                                  {vt.name}: {vt.options.join(', ')}
                                                </span>
                                              ))}
                                            </div>
                                          ) : (
                                            <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.2rem', display: 'block', fontStyle: 'italic' }}>No variant types</span>
                                          )}
                                        </div>
                                        
                                        {/* Product actions */}
                                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                          <button type="button" onClick={() => startEditProd(cat.id, prod)}
                                            style={{ background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', minWidth: '52px', flexShrink: 0, borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                                          {linked === 0 && (
                                            <button type="button" onClick={() => handleDeleteProd(cat, prod)}
                                              style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', minWidth: '64px', flexShrink: 0, borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {/* Expandable SKU Combinations */}
                                      {isExpanded && hasVariantTypes && skuCombinations.length > 0 && (
                                        <div style={{ padding: '0.75rem 1rem 1rem', background: 'rgba(0,0,0,0.15)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 600 }}>
                                            Generated SKU Combinations ({skuCombinations.length})
                                          </div>
                                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                            {skuCombinations.map((combo, idx) => (
                                              <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '0.5rem 0.6rem', fontSize: '0.75rem' }}>
                                                <div style={{ color: 'var(--gold)', fontWeight: 600, fontFamily: 'monospace', marginBottom: '0.25rem' }}>{combo.sku}</div>
                                                <div style={{ color: 'var(--white)', fontSize: '0.7rem', marginBottom: '0.25rem' }}>{combo.name}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
                                                  {combo.variants.map((v, i) => (
                                                    <span key={i} style={{ fontSize: '0.65rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>{v}</span>
                                                  ))}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <button type="button"
                              onClick={() => startAddProd(cat.id)}
                              style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', padding: '0.4rem 0.75rem', color: 'var(--gray)', fontSize: '0.8rem', cursor: 'pointer', width: '100%', transition: 'all 0.15s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--gray)'; }}>
                              + Add Product Variant under {cat.name}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', flexShrink: 0 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>

      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title||''} message={infoModal?.message||''} />
      {confirmModal && (
        <ConfirmModal isOpen={!!confirmModal} onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm} title={confirmModal.title}
          message={confirmModal.message} confirmLabel={confirmModal.confirmLabel}
          confirmClass={confirmModal.confirmClass} />
      )}
    </div>
  );
}

// ── Supplier Category Selector ────────────────────────────────────────────────
// Combobox-style category selector for supplier forms.
// Same UX as inventory item category field — dropdown with "+ Add" option.
// Selected categories shown as removable chips above the dropdown.
// Categories sourced from the shared inventory category list.
function SupplierCategorySelector({ selected, categories, onChange }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const addCat = (cat) => {
    const trimmed = cat.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
    setInput('');
    setOpen(false);
  };

  const removeCat = (cat) => onChange(selected.filter(c => c !== cat));

  // Filtered: categories not yet selected, matching input
  const available = categories.filter(c =>
    !selected.includes(c) && c.toLowerCase().includes(input.toLowerCase())
  );
  // Items Supplied must come from masterlist categories — no free-text add allowed
  const canAdd = false;

  return (
    <div ref={ref}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
          {selected.map(cat => (
            <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.6rem', background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600 }}>
              {cat}
              <button type="button" onClick={() => removeCat(cat)}
                style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', padding: '0', lineHeight: 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}
                title={`Remove ${cat}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Combobox input */}
      <div className="combobox-root">
        <div className="combobox-field">
          <input type="text" className="form-input"
            value={input}
            onChange={() => {}}
            readOnly
            onClick={() => { if (categories.length > 0) setOpen(o => !o); }}
            placeholder={selected.length === 0 ? 'Click to select item categories...' : 'Click to add another item category...'}
            style={{ cursor: categories.length === 0 ? 'not-allowed' : 'pointer' }} />
          <button type="button" className="combobox-toggle" onClick={() => setOpen(o => !o)}>
            {open ? '▲' : '▼'}
          </button>
        </div>
        {open && (available.length > 0 || canAdd) && (
          <div className="combobox-menu" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {available.map(cat => (
              <button key={cat} type="button" className="combobox-item"
                onClick={() => addCat(cat)}>
                {cat}
              </button>
            ))}
            {canAdd && (
              <button type="button" className="combobox-item combobox-add"
                onClick={() => addCat(input)}>
                <span>+</span> Add "{input.trim()}"
              </button>
            )}
            {available.length === 0 && !canAdd && input && (
              <div style={{ padding: '0.75rem 1rem', color: 'var(--gray)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                All matching categories already selected.
              </div>
            )}
          </div>
        )}
        {open && available.length === 0 && !canAdd && !input && categories.length > 0 && (
          <div className="combobox-menu">
            {selected.length === categories.length ? (
              <div style={{ padding: '0.75rem 1rem', color: 'var(--gray)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                All categories selected.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Supplier Quick Modal (used inside stock modals) ────────────────────────
function AddSupplierQuickModal({ isOpen, onClose, onAdd, categories, existingSuppliers }) {
  const [form, setForm] = useState({ name: '', contact: '', phone: '', address: '', categories: [] });
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    if (isOpen) setForm({ name: '', contact: '', phone: '', address: '', categories: [] });
  }, [isOpen]);

  // Phone: digits and dashes only, max 15 chars
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

          {/* Supplier Name */}
          <div className="form-group">
            <label className="form-label">
              Supplier Name <span className="required">*</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>max 80 chars</span>
            </label>
            <input type="text" className="form-input" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value.slice(0, 80) }))}
              placeholder="e.g., SanRoque Trading" autoFocus maxLength={80} />
          </div>

          {/* Item Supplied — combobox style, same as inventory category field */}
          <div className="form-group">
            <label className="form-label">
              Item Supplied
              <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(leave empty = General — appears for all)</span>
            </label>
            <SupplierCategorySelector
              selected={form.categories}
              categories={categories}
              onChange={(cats) => setForm(p => ({ ...p, categories: cats }))}
            />
            <p className="form-hint">
              {categories.length === 0
                ? 'Add inventory categories first — they appear here automatically.'
                : form.categories.length === 0
                  ? 'No category selected — will appear for all categories (General).'
                  : `Will appear for: ${form.categories.join(', ')}`}
            </p>
          </div>

          {/* Contact Person */}
          <div className="form-group">
            <label className="form-label">
              Contact Person <span className="required">*</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>max 60 chars</span>
            </label>
            <input type="text" className="form-input" value={form.contact}
              onChange={e => setForm(p => ({ ...p, contact: e.target.value.slice(0, 60) }))}
              placeholder="e.g., Juan Dela Cruz" maxLength={60} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Phone — digits and dashes only */}
            <div className="form-group">
              <label className="form-label">
                Phone
                <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional)</span>
              </label>
              <input type="text" className="form-input" value={form.phone}
                onChange={handlePhoneChange}
                placeholder="09xx-xxx-xxxx" maxLength={15} inputMode="tel" />
              <p className="form-hint">Digits and dashes only. e.g., 0912-345-6789</p>
            </div>

            {/* Address */}
            <div className="form-group">
              <label className="form-label">
                Address
                <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional)</span>
              </label>
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



// ── Price History Accordion ────────────────────────────────────────────────────
// Same card design as before but collapsible via chevron.
// Collapsed by default — click header to expand full details.
function PriceHistoryAccordion({ productPriceHistory }) {
  const [phDateFilter, setPhDateFilter] = useState('all');
  const [phCustomFrom, setPhCustomFrom] = useState('');
  const [phCustomTo, setPhCustomTo] = useState('');
  const [showPhDrop, setShowPhDrop] = useState(false);
  const phDropRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (phDropRef.current && !phDropRef.current.contains(e.target)) setShowPhDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Filter a history array by selected date range
  const filterHistory = (arr) => {
    if (phDateFilter === 'all') return arr;
    const now = new Date();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return arr.filter(h => {
      const d = new Date(h.date);
      if (phDateFilter === 'today') return d >= startOfDay(now);
      if (phDateFilter === 'this-week') {
        const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); return d >= startOfDay(ws);
      }
      if (phDateFilter === 'this-month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (phDateFilter === 'custom' && phCustomFrom && phCustomTo) {
        const from = new Date(phCustomFrom); const to = new Date(phCustomTo); to.setHours(23,59,59);
        return d >= from && d <= to;
      }
      return true;
    });
  };

  const dateLabels = { 'all': 'All Time', 'today': 'Today', 'this-week': 'This Week', 'this-month': 'This Month', 'custom': 'Custom Range' };

  // Filter overall trend by date

  // Filter each product's history
  const filteredProductHistory = Object.fromEntries(
    Object.entries(productPriceHistory).map(([k, arr]) => [k, filterHistory(arr)])
  );

  const entries = Object.entries(filteredProductHistory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Date filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div ref={phDropRef} style={{ position: 'relative' }}>
          <div onClick={() => setShowPhDrop(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--white)', userSelect: 'none', minWidth: '130px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ flex: 1 }}>{dateLabels[phDateFilter]}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{showPhDrop ? '▲' : '▼'}</span>
          </div>
          {showPhDrop && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', minWidth: '150px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              {Object.entries(dateLabels).map(([val, label]) => (
                <button key={val} type="button" onClick={() => { setPhDateFilter(val); setShowPhDrop(false); }}
                  style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.82rem', fontWeight: val === phDateFilter ? 700 : 400, color: val === phDateFilter ? 'var(--gold)' : 'var(--white)', background: val === phDateFilter ? 'rgba(212,168,67,0.1)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {phDateFilter === 'custom' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="date" value={phCustomFrom} onChange={e => setPhCustomFrom(e.target.value)}
              style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.35rem 0.6rem', color: 'var(--white)', fontSize: '0.78rem' }} />
            <span style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>to</span>
            <input type="date" value={phCustomTo} onChange={e => setPhCustomTo(e.target.value)}
              style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.35rem 0.6rem', color: 'var(--white)', fontSize: '0.78rem' }} />
          </div>
        )}
      </div>

      {/* Per product cards */}
      {entries.map(([productKey, history]) => {
        if (history.length === 0) return (
          <div key={productKey} style={{ padding: '0.875rem 1rem', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>{productKey}</div>
            <p style={{ fontSize: '0.78rem', color: 'var(--gray)', fontStyle: 'italic', margin: 0 }}>No purchases in this period.</p>
          </div>
        );

        const first = history[0].cost;
        const latest = history[history.length - 1].cost;
        const diff = latest - first;
        const pct = first > 0 ? ((diff / first) * 100).toFixed(1) : 0;

        return (
          <div key={productKey} style={{ padding: '0.875rem 1rem', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.875rem', marginBottom: '0.15rem' }}>{productKey}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                  {history.length} purchase{history.length !== 1 ? 's' : ''} ·
                  First: <strong style={{ color: 'var(--white)' }}>₱{formatPrice(first)}</strong> →
                  Latest: <strong style={{ color: 'var(--white)' }}>₱{formatPrice(latest)}</strong>
                  {diff !== 0 && (
                    <span style={{ marginLeft: '0.5rem', color: diff > 0 ? '#f87171' : '#4ade80', fontWeight: 600 }}>
                      ({diff > 0 ? '+' : ''}{pct}%)
                    </span>
                  )}
                </div>
              </div>

            </div>
            {history.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.35rem 0.6rem', background: 'rgba(0,0,0,0.2)', borderRadius: '5px', fontSize: '0.7rem' }}>
                    <span style={{ color: 'var(--gray)' }}>{new Date(h.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, marginTop: '0.15rem' }}>₱{formatPrice(h.cost)}</span>
                    {i > 0 && (() => {
                      const prev = history[i-1].cost;
                      const d = h.cost - prev;
                      return d !== 0 ? <span style={{ color: d > 0 ? '#f87171' : '#4ade80', fontSize: '0.65rem' }}>{d > 0 ? '▲' : '▼'}₱{formatPrice(Math.abs(d))}</span> : null;
                    })()}
                  </div>
                ))}
              </div>
            )}
            {history.length === 1 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--gray)', fontStyle: 'italic', margin: '0.5rem 0 0' }}>Only 1 purchase in this period.</p>
            )}
          </div>
        );
      })}

      {entries.every(([, h]) => h.length === 0) && phDateFilter !== 'all' && (
        <p style={{ fontSize: '0.875rem', color: 'var(--gray)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>No purchases found in this period.</p>
      )}
    </div>
  );
}

// ── Supplier Details Modal ─────────────────────────────────────────────────────
// Shows full supplier profile: contact info, summary stats, price history per
// product, and all purchase transactions (batches) from this supplier.
// All data derived from inventory.batches — no separate storage needed.
function SupplierDetailsModal({ isOpen, onClose, supplier, inventory }) {
  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'price-history'
  const [dateFilter, setDateFilter] = useState('this-month'); // 'today' | 'this-week' | 'this-month' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showDateDrop, setShowDateDrop] = useState(false);
  const [itemFilter, setItemFilter] = useState('all');
  const [showItemDrop, setShowItemDrop] = useState(false);
  const dateRef = useRef(null);
  const itemRef = useRef(null);

  useEffect(() => { if (isOpen) { setActiveTab('transactions'); setDateFilter('this-month'); setItemFilter('all'); setCustomFrom(''); setCustomTo(''); } }, [isOpen]);
  useEffect(() => {
    const h = (e) => {
      if (dateRef.current && !dateRef.current.contains(e.target)) setShowDateDrop(false);
      if (itemRef.current && !itemRef.current.contains(e.target)) setShowItemDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!isOpen || !supplier) return null;

  // ── Derive all batches from this supplier ──────────────────────────────────
  const allBatches = [];
  inventory.forEach(item => {
    (item.batches || []).forEach(batch => {
      if (batch.supplierId === supplier.id || batch.supplierName === supplier.name) {
        allBatches.push({ ...batch, itemName: item.name, itemCategory: item.category, itemId: item.id });
      }
    });
  });
  allBatches.sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));

  // ── Date filter logic ──────────────────────────────────────────────────────
  const filterByDate = (batches) => {
    const now = new Date();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return batches.filter(b => {
      const d = new Date(b.dateReceived);
      if (dateFilter === 'today') return d >= startOfDay(now);
      if (dateFilter === 'this-week') {
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
        return d >= startOfDay(weekStart);
      }
      if (dateFilter === 'this-month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (dateFilter === 'custom' && customFrom && customTo) {
        const from = new Date(customFrom); const to = new Date(customTo); to.setHours(23,59,59);
        return d >= from && d <= to;
      }
      return true;
    });
  };

  // ── Unique items from this supplier ───────────────────────────────────────
  const uniqueItems = [...new Set(allBatches.map(b => b.itemName))].sort();

  // ── Filtered batches (for transactions table) ─────────────────────────────
  const filteredBatches = filterByDate(allBatches).filter(b => itemFilter === 'all' || b.itemName === itemFilter);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalSpent = allBatches.reduce((s, b) => s + (b.totalCost || b.unitCost * b.originalQty || 0), 0);
  const totalBatches = allBatches.length;
  const lastPurchase = allBatches.length > 0 ? allBatches[0].dateReceived : null;
  const totalItems = allBatches.reduce((s, b) => s + (b.originalQty || 0), 0);

  // ── Price history per product ──────────────────────────────────────────────
  // Group batches by product → array of { date, unitCost } sorted oldest first
  const productPriceHistory = {};
  allBatches.forEach(b => {
    const key = `${b.itemCategory} — ${b.itemName}`;
    if (!productPriceHistory[key]) productPriceHistory[key] = [];
    productPriceHistory[key].push({ date: b.dateReceived, cost: b.unitCost, invoice: b.invoiceNumber });
  });
  // Sort each product's history oldest → newest
  Object.values(productPriceHistory).forEach(arr => arr.sort((a, b) => new Date(a.date) - new Date(b.date)));

  const tabStyle = (tab) => ({
    padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
    borderRadius: '6px', border: 'none',
    background: activeTab === tab ? 'var(--gold)' : 'transparent',
    color: activeTab === tab ? '#000' : 'var(--gray)',
    transition: 'all 0.15s',
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '860px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">{supplier.name}</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
              {supplier.categories?.length > 0 ? supplier.categories.join(', ') : 'General — all categories'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>

          {/* Contact info strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', padding: '0.875rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '1.25rem' }}>
            {[
              ['Contact Person', supplier.contact || '—', <svg key="cp" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>],
              ['Phone', supplier.phone || '—', <svg key="ph" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.69l3-.12a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.4-1.4a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>],
              ['Address', supplier.address || '—', <svg key="addr" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>],
            ].map(([label, val, icon]) => (
              <div key={label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                  <span style={{ color: 'var(--gold)' }}>{icon}</span>{label}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.875rem' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {[
              ['Total Spent', `₱${formatPrice(totalSpent)}`, '#facc15'],
              ['Purchases', `${totalBatches} batch${totalBatches !== 1 ? 'es' : ''}`, 'var(--gold)'],
              ['Items Received', `${formatNumber(totalItems)} pcs`, 'var(--white)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ padding: '0.875rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Last purchase info */}
          {lastPurchase && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--gray)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Last purchase: <strong style={{ color: 'var(--white)' }}>
                {new Date(lastPurchase).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </strong>
              {allBatches[0]?.invoiceNumber && (
                <span style={{ color: 'var(--gray)' }}>· Invoice: <strong style={{ color: 'var(--white)', fontFamily: 'monospace' }}>{allBatches[0].invoiceNumber}</strong></span>
              )}
            </div>
          )}

          {allBatches.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontStyle: 'italic', fontSize: '0.875rem' }}>
              No purchase history yet for this supplier.
            </div>
          ) : (
            <>
              {/* Tab switcher */}
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.25rem', width: 'fit-content' }}>
                <button style={tabStyle('transactions')} onClick={() => setActiveTab('transactions')}>
                  Purchase Transactions
                </button>
                <button style={tabStyle('price-history')} onClick={() => setActiveTab('price-history')}>
                  Price History
                </button>
              </div>

              {/* ── Filters bar (transactions tab only) ──────────────────── */}
              {activeTab === 'transactions' && (
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.875rem', flexWrap: 'wrap', alignItems: 'center' }}>

                  {/* Date filter */}
                  <div ref={dateRef} style={{ position: 'relative' }}>
                    <div onClick={() => setShowDateDrop(o => !o)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--white)', userSelect: 'none', minWidth: '130px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <span style={{ flex: 1 }}>{{ 'today': 'Today', 'this-week': 'This Week', 'this-month': 'This Month', 'custom': 'Custom Range' }[dateFilter]}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{showDateDrop ? '▲' : '▼'}</span>
                    </div>
                    {showDateDrop && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', minWidth: '150px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                        {[['today','Today'],['this-week','This Week'],['this-month','This Month'],['custom','Custom Range']].map(([val, label]) => (
                          <button key={val} type="button" onClick={() => { setDateFilter(val); setShowDateDrop(false); }}
                            style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.82rem', fontWeight: val===dateFilter?700:400, color: val===dateFilter?'var(--gold)':'var(--white)', background: val===dateFilter?'rgba(212,168,67,0.1)':'transparent', border: 'none', cursor: 'pointer' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Item filter */}
                  {uniqueItems.length > 1 && (
                    <div ref={itemRef} style={{ position: 'relative' }}>
                      <div onClick={() => setShowItemDrop(o => !o)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--white)', userSelect: 'none', minWidth: '120px' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                        <span style={{ flex: 1 }}>{itemFilter === 'all' ? 'All Items' : itemFilter}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{showItemDrop ? '▲' : '▼'}</span>
                      </div>
                      {showItemDrop && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                          {['all', ...uniqueItems].map(item => (
                            <button key={item} type="button" onClick={() => { setItemFilter(item); setShowItemDrop(false); }}
                              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.82rem', fontWeight: item===itemFilter?700:400, color: item===itemFilter?'var(--gold)':'var(--white)', background: item===itemFilter?'rgba(212,168,67,0.1)':'transparent', border: 'none', cursor: 'pointer' }}>
                              {item === 'all' ? 'All Items' : item}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Custom date range inputs */}
                  {dateFilter === 'custom' && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                        style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.35rem 0.6rem', color: 'var(--white)', fontSize: '0.78rem' }} />
                      <span style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>to</span>
                      <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                        style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.35rem 0.6rem', color: 'var(--white)', fontSize: '0.78rem' }} />
                    </div>
                  )}

                  {/* Result count */}
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray)', marginLeft: 'auto' }}>
                    {filteredBatches.length === allBatches.length
                      ? `${allBatches.length} transaction${allBatches.length !== 1 ? 's' : ''}`
                      : <><strong style={{ color: 'var(--white)' }}>{filteredBatches.length}</strong> of {allBatches.length} transactions</>
                    }
                  </span>
                </div>
              )}

              {/* ── TRANSACTIONS TAB ─────────────────────────────────────── */}
              {activeTab === 'transactions' && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', background: 'rgba(0,0,0,0.25)' }}>
                        {['Date', 'Item', 'Invoice / OR', 'Qty Received', 'Unit Cost', 'Total Paid', 'Good / Damaged'].map(h => (
                          <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatches.map((b, i) => (
                        <tr key={b.batchId || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                            {new Date(b.dateReceived).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                            <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.82rem' }}>{b.itemName}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--gray)' }}>{b.itemCategory}</div>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontFamily: 'monospace', color: 'var(--white)', fontSize: '0.78rem' }}>
                            {b.invoiceNumber || <em style={{ color: 'var(--gray)' }}>N/A</em>}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: 'var(--white)', fontSize: '0.82rem' }}>
                            {b.originalQty} pcs
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: 'var(--gold)', fontWeight: 600, fontSize: '0.82rem' }}>
                            ₱{formatPrice(b.unitCost)}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: '#facc15', fontWeight: 600, fontSize: '0.82rem' }}>
                            ₱{formatPrice(b.totalCost || b.unitCost * b.originalQty)}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontSize: '0.78rem' }}>
                            <span style={{ color: 'var(--gold)' }}>{b.goodQty ?? b.originalQty} good</span>
                            {(b.damagedQty || 0) > 0 && (
                              <span style={{ color: '#f87171', marginLeft: '0.5rem' }}>{b.damagedQty} dmg</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                        <td colSpan={3} style={{ padding: '0.6rem 0.75rem', color: 'var(--gray)', fontSize: '0.78rem', textAlign: 'right', fontWeight: 600 }}>
                          {filteredBatches.length < allBatches.length ? `FILTERED (${filteredBatches.length} of ${allBatches.length})` : 'TOTALS'}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--white)', fontWeight: 700, fontSize: '0.82rem' }}>{filteredBatches.reduce((s,b)=>s+(b.originalQty||0),0)} pcs</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.78rem' }}>—</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#facc15', fontWeight: 700, fontSize: '0.82rem' }}>₱{formatPrice(filteredBatches.reduce((s,b)=>s+(b.totalCost||b.unitCost*b.originalQty||0),0))}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── PRICE HISTORY TAB ────────────────────────────────────── */}
              {activeTab === 'price-history' && (
                <PriceHistoryAccordion
                  productPriceHistory={productPriceHistory}
                />
              )}
            </>
          )}
        </div>

        <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', flexShrink: 0 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Manage Suppliers Modal ─────────────────────────────────────────────────────
// FIX: Replaced window.__supplierInUse global with proper component state
function ManageSuppliersModal({ isOpen, onClose, suppliers, categories, inventory, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingInUse, setEditingInUse] = useState(false); // FIX: was window.__supplierInUse
  const [form, setForm] = useState({ name: '', contact: '', phone: '', address: '', categories: [] });
  const [infoModal, setInfoModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewingSupplier, setViewingSupplier] = useState(null);
  const [expandedSuppliers, setExpandedSuppliers] = useState(new Set()); // Track expanded supplier rows

  useEffect(() => {
    if (isOpen) { setShowForm(false); setEditingId(null); setEditingInUse(false); setViewingSupplier(null); setForm({ name: '', contact: '', phone: '', address: '', categories: [] }); }
  }, [isOpen]);

  // Toggle supplier row expansion
  const toggleExpand = (supplierId) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(supplierId)) next.delete(supplierId);
      else next.add(supplierId);
      return next;
    });
  };

  // Get all items & their price history (up to 5 latest) for a supplier from batches
  const getSupplierItemsWithHistory = (supplier) => {
    const batches = inventory.flatMap(i => (i.batches || []).map(b => ({
      ...b,
      itemName: i.name,
      itemCategory: i.category,
      itemId: i.id
    }))).filter(b => b.supplierId === supplier.id || b.supplierName === supplier.name);

    // Group by item
    const itemMap = new Map();
    batches.forEach(batch => {
      const key = batch.itemName;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemName: batch.itemName,
          itemCategory: batch.itemCategory,
          priceHistory: []
        });
      }
      itemMap.get(key).priceHistory.push({
        unitCost: batch.unitCost,
        dateReceived: batch.dateReceived,
        invoiceNumber: batch.invoiceNumber
      });
    });

    // Sort each item's price history by date (oldest first) and limit to 5
    const result = Array.from(itemMap.values()).map(item => ({
      ...item,
      priceHistory: item.priceHistory
        .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))  // Oldest first
        .slice(-5)  // Get last 5 (most recent 5)
    })).sort((a, b) => a.itemName.localeCompare(b.itemName));

    return result;
  };

  const handleEdit = (supplier) => {
    // FIX: Check in-use via component state, not window global
    const inUse = inventory.some(i => i.lastSupplierId === supplier.id && i.isActive !== false);
    setEditingId(supplier.id);
    setEditingInUse(inUse);
    setForm({ name: supplier.name, contact: supplier.contact||'', phone: supplier.phone||'', address: supplier.address||'', categories: supplier.categories||[] });
    setShowForm(true);
  };

  const handleDeleteClick = (supplier) => {
    const inUse = inventory.some(i => i.lastSupplierId === supplier.id && i.isActive !== false);
    if (inUse) {
      setInfoModal({ title: 'Cannot Delete Supplier', message: `"${supplier.name}" is linked to active inventory items. Update those items to a different supplier first.` });
      return;
    }
    setDeleteConfirm(supplier);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter a supplier name.' }); return; }
    if (!form.contact.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter a contact person.' }); return; }
    const isDup = suppliers.some(s => s.name.toLowerCase() === form.name.trim().toLowerCase() && s.id !== editingId);
    if (isDup) { setInfoModal({ title: 'Duplicate Supplier', message: `"${form.name.trim()}" already exists.` }); return; }
    if (editingId) onUpdate(editingId, { ...form, name: form.name.trim() });
    else onAdd({ ...form, name: form.name.trim() });
    setShowForm(false); setEditingId(null); setEditingInUse(false);
    setForm({ name: '', contact: '', phone: '', address: '', categories: [] });
  };

  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '1100px', width: '95%' }}>
        <div className="modal-header">
          <h2 className="modal-title">Supplier Management</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {!showForm ? (
            <>
              <button type="button" className="btn-primary" onClick={() => setShowForm(true)} style={{ marginBottom: '1rem' }}>+ Add New Supplier</button>
              {suppliers.length > 0 ? (
                <div style={{ border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600, width: '40px' }}></th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600 }}>Name</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Contact</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Phone</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Total Spent</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Last Purchase</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map(s => {
                        const isExpanded = expandedSuppliers.has(s.id);
                        const supplierItems = getSupplierItemsWithHistory(s);
                        const totalSpent = inventory.flatMap(i => i.batches||[])
                          .filter(b => b.supplierId===s.id || b.supplierName===s.name)
                          .reduce((sum, b) => sum + (b.totalCost || b.unitCost*(b.originalQty||0) || 0), 0);
                        const allBatches = inventory.flatMap(i => i.batches||[])
                          .filter(b => b.supplierId===s.id || b.supplierName===s.name);
                        const lastPurchase = allBatches.length > 0 
                          ? allBatches.sort((a,b) => new Date(b.dateReceived)-new Date(a.dateReceived))[0].dateReceived 
                          : null;

                        return (
                          <React.Fragment key={s.id}>
                            {/* Main Supplier Row */}
                            <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <button 
                                  onClick={() => toggleExpand(s.id)}
                                  style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  title={isExpanded ? 'Collapse' : 'Expand'}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                    <path d="M9 18l6-6-6-6"/>
                                  </svg>
                                </button>
                              </td>
                              <td style={{ padding: '0.75rem', color: 'var(--white)', fontWeight: 600 }}>{s.name}</td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--white)', fontSize: '0.875rem', fontWeight: 500 }}>{s.contact||'—'}</td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>{s.phone||'—'}</td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', color: '#facc15', fontWeight: 600, fontSize: '0.82rem' }}>
                                {totalSpent > 0 ? `₱${formatPrice(totalSpent)}` : <em style={{ color: 'var(--gray)' }}>—</em>}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                {lastPurchase ? new Date(lastPurchase).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : <em>—</em>}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <button type="button" onClick={() => setViewingSupplier(s)} style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', color: 'var(--gold)', marginRight: '0.4rem', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>View</button>
                                <button type="button" onClick={() => handleEdit(s)} style={{ background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', marginRight: '0.4rem', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                                <button type="button" onClick={() => handleDeleteClick(s)} style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                              </td>
                            </tr>
                            {/* Expanded Row - Items & Prices */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} style={{ padding: '0', background: 'rgba(0,0,0,0.2)' }}>
                                  <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600 }}>
                                      Items Supplied and Price History 
                                      {supplierItems.length > 0 && <span style={{ marginLeft: '0.5rem', color: 'var(--white)', fontWeight: 400 }}>({supplierItems.length} item{supplierItems.length !== 1 ? 's' : ''})</span>}
                                    </h4>
                                    {supplierItems.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {supplierItems.map((item, itemIdx) => {
                                          return (
                                            <div key={itemIdx}>
                                              {/* Item header */}
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <span style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>{item.itemCategory}</span>
                                                <span style={{ color: 'var(--gray)' }}>—</span>
                                                <span style={{ color: 'var(--white)', fontWeight: 600, fontSize: '0.85rem' }}>{item.itemName}</span>
                                                <span style={{ color: 'var(--gray)', fontSize: '0.7rem', marginLeft: '0.25rem' }}>
                                                  ({item.priceHistory.length} purchase{item.priceHistory.length !== 1 ? 's' : ''})
                                                </span>
                                              </div>
                                              {/* Price chips */}
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                {item.priceHistory.map((price, priceIdx) => {
                                                  const isLatest = priceIdx === item.priceHistory.length - 1;
                                                  return (
                                                    <div 
                                                      key={priceIdx}
                                                      style={{ 
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        padding: '0.35rem 0.6rem', 
                                                        background: 'rgba(255,255,255,0.05)',
                                                        border: isLatest ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: '6px',
                                                        minWidth: '60px'
                                                      }}
                                                    >
                                                      <span style={{ 
                                                        color: isLatest ? 'var(--gold)' : 'var(--gray)', 
                                                        fontWeight: isLatest ? 700 : 500,
                                                        fontSize: '0.8rem'
                                                      }}>
                                                        ₱{formatPrice(price.unitCost)}
                                                      </span>
                                                      <span style={{ 
                                                        color: 'var(--gray)', 
                                                        fontSize: '0.65rem',
                                                        marginTop: '0.1rem'
                                                      }}>
                                                        {new Date(price.dateReceived).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
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
                                      <p style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic', margin: 0 }}>No items supplied yet.</p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontStyle: 'italic' }}>No suppliers yet.</div>
              )}
            </>
          ) : (
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--white)', marginBottom: '1.25rem' }}>{editingId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
              {editingInUse && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#f59e0b' }}>
                  This supplier is linked to active items. Name cannot be changed.
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Supplier Name <span className="required">*</span></label>
                <input type="text" className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., SanRoque Trading" maxLength={80} autoFocus disabled={editingInUse}
                  style={editingInUse ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Item Supplied
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(leave empty = General — appears for all categories)</span>
                </label>
                {/* Combobox-style: same as Add Inventory Item modal category field */}
                {/* Selected categories shown as chips, click + to add more, × to remove */}
                <SupplierCategorySelector
                  selected={form.categories}
                  categories={categories}
                  onChange={(cats) => setForm(p => ({ ...p, categories: cats }))}
                />
                <p className="form-hint">
                  {categories.length === 0
                    ? 'Add inventory categories first — they appear here automatically.'
                    : form.categories.length === 0
                      ? 'No category selected — this supplier appears for all categories (General).'
                      : `Supplier appears when adding stock for: ${form.categories.join(', ')}`}
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">
                    Contact Person <span className="required">*</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>max 60 chars</span>
                  </label>
                  <input type="text" className="form-input" value={form.contact}
                    onChange={e => setForm(p => ({ ...p, contact: e.target.value.slice(0, 60) }))}
                    placeholder="e.g., Juan Dela Cruz" maxLength={60} required />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Phone
                    <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional)</span>
                  </label>
                  <input type="text" className="form-input" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^0-9-]/g, '').slice(0, 15) }))}
                    placeholder="09xx-xxx-xxxx" maxLength={15} inputMode="tel" />
                  <p className="form-hint">Digits and dashes only.</p>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Address
                  <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional — max 100 chars)</span>
                </label>
                <input type="text" className="form-input" value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value.slice(0, 100) }))}
                  placeholder="e.g., Marikina City" maxLength={100} />
              </div>
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); setEditingInUse(false); }}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleSubmit}>{editingId ? 'Update Supplier' : 'Add Supplier'}</button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title||''} message={infoModal?.message||''} />
      <ConfirmModal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { onDelete(deleteConfirm.id); setDeleteConfirm(null); }}
        title="Delete Supplier" confirmLabel="Delete" confirmClass="btn-danger"
        message={`Permanently delete "${deleteConfirm?.name}"? This cannot be undone.`} />
      <SupplierDetailsModal
        isOpen={!!viewingSupplier}
        onClose={() => setViewingSupplier(null)}
        supplier={viewingSupplier}
        inventory={inventory} />
    </div>
  );
}

// ── Inventory Modal (Add/Edit Item) ────────────────────────────────────────────
// isOnDemand REMOVED — inventory = physical stocked items only
// FIX: minStockLevel is now editable when editing (was previously locked)
// FIX: SKU generated once and stored in state — never regenerates on re-render
function InventoryModal({ isOpen, onClose, onSave, onEdit, onRestoreItem, item, categories, onAddCategory, inventory, editingItem, suppliers, onAddSupplier, masterlist }) {
  const [form, setForm] = useState({
    name: '',
    category: categories[0]||'',
    initialStock: '',
    minStockLevel: 10,
    supplierId: 'unspecified',
    supplierName: 'General Merchandise',
    unitCost: '',
    isBulkPurchase: false,
    totalCost: '',
    invoiceNumber: '',
    deliveryDate: new Date().toISOString().split('T')[0],
    damagedOnArrival: '',
    notes: '',
    receiptImage: null
  });
  // SKU stored in state — generated once when name is first filled, never regenerated
  const [skuPreview, setSkuPreview] = useState('');
  const [skuLocked, setSkuLocked] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [infoModal, setInfoModal] = useState(null);
  const [duplicateItem, setDuplicateItem] = useState(null);
  const [archivedItem, setArchivedItem] = useState(null);
  
  // Variant selection state for checkbox selection
  const [selectedVariantChecks, setSelectedVariantChecks] = useState({}); // { Color: { Red: true, White: true }, Capacity: { 11oz: true } }
  const [variantStockEntries, setVariantStockEntries] = useState([]); // [{ combo: { Color: 'Red', Capacity: '11oz' }, qty: '', damaged: '' }]
  // Masterlist selection state
  const [masterlistInput, setMasterlistInput] = useState('');
  const [showMasterlistDrop, setShowMasterlistDrop] = useState(false);
  const [selectedMasterlistItem, setSelectedMasterlistItem] = useState(null); // { catId, catName, prodId, prodName, variantTypes[] }
  const masterlistRef = useRef(null);

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name||'',
        category: item.category||categories[0]||'',
        initialStock: item.stockQty||0,
        minStockLevel: item.minStockLevel||10,
        supplierId: item.lastSupplierId||'unspecified',
        supplierName: item.lastSupplierName||'General Merchandise',
        unitCost: item.lastUnitCost?String(item.lastUnitCost):'',
        isBulkPurchase: false,
        totalCost: '',
        invoiceNumber: '',
        deliveryDate: new Date().toISOString().split('T')[0],
        damagedOnArrival: '',
        notes: '',
        receiptImage: null
      });
      // Editing: SKU already exists, show it locked
      setSkuPreview(item.sku||'');
      setSkuLocked(true);
    } else {
      setForm({
        name: '',
        category: categories[0]||'',
        initialStock: '',
        minStockLevel: 10,
        supplierId: 'unspecified',
        supplierName: 'General Merchandise',
        unitCost: '',
        isBulkPurchase: false,
        totalCost: '',
        invoiceNumber: '',
        deliveryDate: new Date().toISOString().split('T')[0],
        damagedOnArrival: '',
        notes: '',
        receiptImage: null
      });
      setSkuPreview('');
      setSkuLocked(false);
      setMasterlistInput('');
      setSelectedMasterlistItem(null);
      setShowMasterlistDrop(false);
    }
  }, [item, categories]);

  // SKU generation rules:
  // - Generated ONCE when both name AND category are filled
  // - RE-GENERATED when category OR product name changes
  //   (both affect the SKU prefix: MUG-CER- vs TSH-MAG-)
  // - Cleared when name is cleared
  // - Never changes for existing items (editingItem already has sku)
  const prevSKUKeyRef = useRef(''); // tracks "category|name" combo
  useEffect(() => {
    if (item) return; // Editing — never change existing SKU
    if (!form.name.trim()) {
      setSkuPreview('');
      setSkuLocked(false);
      prevSKUKeyRef.current = '';
      return;
    }
    // Use first 3 letters of each as the "key" to detect changes
    const catPrefix = (form.category || '').replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
    const prodPrefix = form.name.trim().replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
    const currentKey = `${catPrefix}|${prodPrefix}`;
    const keyChanged = prevSKUKeyRef.current !== currentKey;
    if (!skuLocked || keyChanged) {
      setSkuPreview(generateSKU(form.category, form.name));
      setSkuLocked(true);
      prevSKUKeyRef.current = currentKey;
    }
  }, [form.name, form.category, item, skuLocked]);

  useEffect(() => {
    const h = (e) => { if (masterlistRef.current && !masterlistRef.current.contains(e.target)) setShowMasterlistDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Generate variant stock entries when selections change
  useEffect(() => {
    if (!selectedMasterlistItem || !selectedMasterlistItem.variantTypes || selectedMasterlistItem.variantTypes.length === 0) {
      setVariantStockEntries([]);
      return;
    }

    // Get all selected options per variant type
    const selectedOptions = {};
    selectedMasterlistItem.variantTypes.forEach(vt => {
      const checked = selectedVariantChecks[vt.name] || {};
      selectedOptions[vt.name] = vt.options.filter(opt => checked[opt]);
    });

    // Generate all combinations
    const generateCombinations = (types, options) => {
      if (types.length === 0) return [{}];
      const [firstType, ...restTypes] = types;
      const restCombinations = generateCombinations(restTypes, options);
      const firstOptions = options[firstType.name] || [];
      
      const combinations = [];
      firstOptions.forEach(opt => {
        restCombinations.forEach(rest => {
          combinations.push({ [firstType.name]: opt, ...rest });
        });
      });
      return combinations;
    };

    const combinations = generateCombinations(selectedMasterlistItem.variantTypes, selectedOptions);
    
    // Create stock entries for each combination
    setVariantStockEntries(combinations.map(combo => ({
      combo,
      qty: '',
      damaged: ''
    })));
  }, [selectedMasterlistItem, selectedVariantChecks]);

  // TODO: MongoDB — Replace with API: GET /api/products?inventoryId=... and GET /api/sales?inventoryId=...
  useEffect(() => {
    if (item) {
      const products = JSON.parse(localStorage.getItem('pmp_products')||'[]');
      const orders = JSON.parse(localStorage.getItem('pmp_orders')||'[]');
      setIsLinked(products.some(p => p.inventoryId===item.id) || orders.some(o => o.items?.some(oi => oi.inventoryId===item.id)));
    } else setIsLinked(false);
  }, [item]);

  const handleUnitCostChange = (val) => setForm(p => ({ ...p, unitCost: val, totalCost: !p.isBulkPurchase && p.initialStock ? String((parseFloat(val)||0)*(parseInt(p.initialStock)||0)) : p.totalCost }));
  const handleTotalCostChange = (val) => setForm(p => ({ ...p, totalCost: val, unitCost: p.isBulkPurchase && p.initialStock ? String((parseFloat(val)||0)/(parseInt(p.initialStock)||1)) : p.unitCost }));
  const handleStockChange = (val) => setForm(p => {
    const qty = parseInt(val)||0;
    return { ...p, initialStock: val, totalCost: !p.isBulkPurchase && p.unitCost ? String(qty*(parseFloat(p.unitCost)||0)) : p.totalCost };
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter a product name.' }); return; }
    
    const stock = parseInt(form.initialStock)||0;
    const damaged = parseInt(form.damagedOnArrival)||0;
    if (!item && damaged >= stock && stock > 0) { setInfoModal({ title: 'Validation Error', message: 'Damaged on arrival must be less than total quantity received.' }); return; }
    if (!item && stock > 0) {
      if (!form.unitCost || parseFloat(form.unitCost) <= 0) { setInfoModal({ title: 'Validation Error', message: 'Please enter the unit cost for the initial stock.' }); return; }
      if (!form.invoiceNumber.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter the invoice/OR number.' }); return; }
      if (!form.deliveryDate) { setInfoModal({ title: 'Validation Error', message: 'Please enter the delivery date.' }); return; }
    }
    const normalizedName = form.name.trim().split(' ').map(w => w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
    // TODO: MongoDB — Replace with API: GET /api/inventory/check-duplicate?name=...&category=...
    const dup = inventory.find(i => i.name.toLowerCase()===normalizedName.toLowerCase() && i.category.toLowerCase()===form.category.toLowerCase() && i.id!==editingItem?.id);
    if (dup) { if (dup.isActive===false) { setArchivedItem(dup); return; } setDuplicateItem(dup); return; }
    onSave({ 
      ...form, 
      name: normalizedName, 
      sku: skuPreview, 
      minStockLevel: parseInt(form.minStockLevel)||10, 
      stockQty: item ? item.stockQty : (stock-damaged), 
      damagedQty: item ? item.damagedQty : damaged, 
      lastSupplierId: form.supplierId==='unspecified'?null:form.supplierId, 
      lastSupplierName: form.supplierName, 
      lastUnitCost: parseFloat(form.unitCost)||0, 
      averageCost: parseFloat(form.unitCost)||0
    });
  };

  const hasStock = !item && form.initialStock!=='' && parseInt(form.initialStock)>0;
  const showSupplierInvoice = !item && (hasStock || selectedMasterlistItem);  // Show when masterlist selected OR has stock
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-wide" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">{item ? 'Edit Inventory Item' : 'Add New Inventory Item'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {/* ── Select from Masterlist ─────────────────────────────────────────── */}
          {!item && (
            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <label className="form-label">
                Select from Masterlist
                <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>
                  (auto-fills name & category)
                </span>
              </label>
              <div className="combobox-root" ref={masterlistRef}>
                <div className="combobox-field">
                  <input type="text" className="form-input"
                    value={masterlistInput}
                    onChange={() => {}}
                    readOnly
                    onClick={() => setShowMasterlistDrop(o => !o)}
                    onFocus={() => setShowMasterlistDrop(true)}
                    placeholder="Select a product from the list above..."
                    style={{ cursor: 'pointer' }} />
                  {selectedMasterlistItem && (
                    <button type="button" onClick={() => { setMasterlistInput(''); setSelectedMasterlistItem(null); setForm(p => ({ ...p, name: '', category: '' })); setSkuPreview(''); setSkuLocked(false); prevSKUKeyRef.current = ''; }}
                      style={{ position: 'absolute', right: '2.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0.25rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  )}
                  <button type="button" className="combobox-toggle" onClick={() => setShowMasterlistDrop(o => !o)}>{showMasterlistDrop ? '▲' : '▼'}</button>
                </div>
                {showMasterlistDrop && (() => {
                  const q = masterlistInput.toLowerCase();
                  const entries = [];
                  // Get existing inventory items (active only) to filter out duplicates
                  const existingItems = inventory
                    .filter(i => i.isActive !== false)
                    .map(i => ({ name: i.name, category: i.category }));

                  (masterlist||[]).forEach(cat => {
                    (cat.products||[]).forEach(prod => {
                      // Check if this product+category combo already exists in inventory
                      const isDuplicate = existingItems.some(
                        item => item.name.toLowerCase() === prod.name.toLowerCase() &&
                                item.category.toLowerCase() === cat.name.toLowerCase()
                      );

                      // Only show if NOT a duplicate (or if editing, allow same item)
                      if (!isDuplicate && (!q || cat.name.toLowerCase().includes(q) || prod.name.toLowerCase().includes(q))) {
                        entries.push({ 
                          catId: cat.id, 
                          catName: cat.name, 
                          prodId: prod.id, 
                          prodName: prod.name, 
                          variantTypes: prod.variantTypes || [] // NEW: Multi-dimensional variant types
                        });
                      }
                    });
                  });
                  return (
                    <div className="combobox-menu" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                      {entries.length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--gray)', fontSize: '0.875rem', textAlign: 'center' }}>
                          {(masterlist||[]).length === 0
                            ? 'Masterlist is empty. Add categories and products in Item Masterlist first.'
                            : existingItems.length === (masterlist||[]).reduce((sum, cat) => sum + (cat.products||[]).length, 0)
                              ? 'All products from masterlist are already in inventory.'
                              : `No results for "${masterlistInput}"`}
                        </div>
                      ) : entries.map(e => (
                        <button key={`${e.catId}-${e.prodId}`} type="button" className="combobox-item"
                          onClick={() => {
                            setSelectedMasterlistItem(e);
                            setMasterlistInput(`${e.catName} - ${e.prodName}`);
                            setShowMasterlistDrop(false);
                            setSkuLocked(false);
                            prevSKUKeyRef.current = '';
                            setSelectedVariantOptions({}); // Reset variant options
                            setForm(p => ({ ...p, name: e.prodName, category: e.catName }));
                          }}>
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--white)' }}>{e.prodName}</span>
                            <span style={{ color: 'var(--gray)', marginLeft: '0.5rem', fontSize: '0.8rem' }}>{e.catName}</span>
                          </div>
                          {e.variantTypes.length > 0 && (
                            <div style={{ marginTop: '0.2rem' }}>
                              {e.variantTypes.map((vt, i) => (
                                <span key={i} style={{ fontSize: '0.65rem', color: 'var(--gold)', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.25)', padding: '0.1rem 0.35rem', borderRadius: '3px', marginRight: '0.25rem' }}>
                                  {vt.name}: {vt.options.join(', ')}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {selectedMasterlistItem && selectedMasterlistItem.variantTypes.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {selectedMasterlistItem.variantTypes.map((vt, typeIdx) => (
                          <div key={typeIdx}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.5rem', display: 'block', textTransform: 'uppercase' }}>{vt.name}</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                              {vt.options.map((opt, optIdx) => {
                                const isChecked = (selectedVariantChecks[vt.name] || {})[opt] || false;
                                return (
                                  <label
                                    key={optIdx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      padding: '0.5rem 0.75rem',
                                      background: isChecked ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.03)',
                                      border: isChecked ? '1px solid rgba(212,168,67,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '0.85rem',
                                      color: isChecked ? 'var(--gold)' : 'var(--white)',
                                      fontWeight: isChecked ? 600 : 400
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const newChecks = { ...selectedVariantChecks };
                                        if (!newChecks[vt.name]) newChecks[vt.name] = {};
                                        newChecks[vt.name][opt] = e.target.checked;
                                        setSelectedVariantChecks(newChecks);
                                      }}
                                      style={{ accentColor: 'var(--gold)' }}
                                    />
                                    {opt}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {variantStockEntries.length > 0 && (
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gold)', marginBottom: '0.75rem', fontWeight: 600 }}>
                            Selected Combinations ({variantStockEntries.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {variantStockEntries.map((entry, idx) => (
                              <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                  {Object.entries(entry.combo).map(([typeName, opt], optIdx) => (
                                    <span key={optIdx} style={{ fontSize: '0.7rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                                      {typeName}: {opt}
                                    </span>
                                  ))}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                  <div>
                                    <label style={{ fontSize: '0.65rem', color: 'var(--gray)', marginBottom: '0.25rem', display: 'block' }}>Qty Received</label>
                                    <IntegerInput
                                      className="form-input"
                                      value={entry.qty}
                                      onChange={e => {
                                        const newEntries = [...variantStockEntries];
                                        newEntries[idx] = { ...entry, qty: e.target.value };
                                        setVariantStockEntries(newEntries);
                                      }}
                                      min={0}
                                      placeholder="0"
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.65rem', color: 'var(--gray)', marginBottom: '0.25rem', display: 'block' }}>Damaged</label>
                                    <IntegerInput
                                      className="form-input"
                                      value={entry.damaged}
                                      onChange={e => {
                                        const newEntries = [...variantStockEntries];
                                        newEntries[idx] = { ...entry, damaged: e.target.value };
                                        setVariantStockEntries(newEntries);
                                      }}
                                      min={0}
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                </div>
              )}
              {!selectedMasterlistItem && (
                <p className="form-hint" style={{ color: 'var(--gold)' }}>
                  Select a product from the list above. Product Name and Category will be auto filled.
                </p>
              )}
            </div>
          )}

          {/* ── Name + Category (auto-filled from masterlist, locked when selected) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Product Name <span className="required">*</span></label>
              <input type="text" className="form-input"
                value={selectedMasterlistItem ? form.name : 'Select from Masterlist above first...'}
                readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed', background: 'rgba(0,0,0,0.2)' }} />
              <p className="form-hint">
                {selectedMasterlistItem 
                  ? 'Auto-filled from masterlist selection.'
                  : 'Select a product from the Masterlist above to auto-fill the field.'}
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Category <span className="required">*</span></label>
              <input type="text" className="form-input"
                value={selectedMasterlistItem ? form.category : 'Select from Masterlist above first...'}
                readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed', background: 'rgba(0,0,0,0.2)' }} />
              <p className="form-hint">
                {selectedMasterlistItem 
                  ? 'Auto-filled from masterlist selection.'
                  : 'Select a product from the Masterlist above to auto-fill the field.'}
              </p>
            </div>
          </div>

          {/* SKU Preview — generated once, locked */}
          {form.name.trim() && (
            <div className="form-group">
              <label className="form-label">SKU <span style={{ color: 'var(--gray)', fontSize: '0.75rem', fontWeight: 400 }}>(Auto-generated — locked after save)</span></label>
              <input type="text" className="form-input" value={skuPreview || (item?.sku||'—')} readOnly style={{ background: 'rgba(0,0,0,0.2)', cursor: 'not-allowed', opacity: 0.7, fontFamily: 'monospace' }} />
              <p className="form-hint">Format: [CAT3]-[PROD3]-[YEAR]-[SEQ4] e.g. MUG-CER-2026-0001. Generated once, never changes.</p>
            </div>
          )}

          {/* Qty + Min Level */}
          {form.name.trim() && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Initial Stock Quantity <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
                <IntegerInput className="form-input" value={form.initialStock} onChange={e => handleStockChange(e.target.value)} min={0} placeholder="0" disabled={!!item} />
                <p className="form-hint">{item ? 'Use + button in table to add stock.' : 'Leave empty if no stock yet. Add later via + button.'}</p>
              </div>
              {/* FIX: minStockLevel now editable even when editing */}
              <div className="form-group">
                <label className="form-label">Min. Stock Level</label>
                <IntegerInput className="form-input" value={form.minStockLevel} onChange={e => setForm(p => ({ ...p, minStockLevel: e.target.value }))} min={0} placeholder="10" />
                <p className="form-hint">Low stock alert triggers below this number.</p>
              </div>
            </div>
          )}

          {/* No stock info box */}
          {!item && form.name.trim() && (!form.initialStock || parseInt(form.initialStock)===0) && (
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>No Initial Stock</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.5 }}>Item will be saved with 0 stock. Use the <strong>+</strong> button in the table to add stock with supplier invoice tracking later.</div>
                </div>
              </div>
            </div>
          )}

          {/* Damaged on arrival */}
          {hasStock && (
            <div className="form-group">
              <label className="form-label">Damaged on Arrival <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
              <IntegerInput className="form-input" value={form.damagedOnArrival} onChange={e => setForm(p => ({ ...p, damagedOnArrival: e.target.value }))} min={0} placeholder="0" />
              <p className="form-hint">Received but damaged. Excluded from usable stock count.</p>
            </div>
          )}

          {/* Supplier invoice section */}
          {showSupplierInvoice && (
            <div style={{ background: 'rgba(217,119,6,0.08)', border: '2px solid rgba(217,119,6,0.3)', borderRadius: '8px', padding: '1.5rem', margin: '1rem 0' }}>
              <h4 style={{ margin: '0 0 1.25rem 0', color: '#d97706', fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Supplier Invoice Information (Required)
              </h4>
              {/* Row 1: [Supplier] [Unit Cost Each] */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Supplier</label>
                  <SupplierCombobox value={form.supplierId} supplierName={form.supplierName}
                    onChange={(id, name) => setForm(p => ({ ...p, supplierId: id, supplierName: name }))}
                    suppliers={suppliers} itemCategory={form.category} onAddNew={() => setShowAddSupplier(true)} />
                  <p className="form-hint">Filtered for "{form.category}" + General suppliers.</p>
                </div>
                <div className="form-group">
                  <label className="form-label">{form.isBulkPurchase ? 'Total Amount Paid' : 'Unit Cost Each'} <span className="required">*</span></label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div className="tier-price-cell" style={{ flex: 1 }}>
                      <span className="peso">₱</span>
                      <DecimalInput className="tier-input" value={form.isBulkPurchase ? form.totalCost : form.unitCost}
                        onChange={e => form.isBulkPurchase ? handleTotalCostChange(e.target.value) : handleUnitCostChange(e.target.value)} placeholder="0.00" style={{ width: '100%' }} />
                    </div>
                    <label className="form-checkbox-label" style={{ marginBottom: '0.875rem', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" className="form-checkbox" checked={form.isBulkPurchase} onChange={() => setForm(p => ({ ...p, isBulkPurchase: !p.isBulkPurchase }))} />
                      <span className="checkbox-text" style={{ fontSize: '0.75rem' }}>{form.isBulkPurchase ? 'Per Unit' : 'Total'}</span>
                    </label>
                  </div>
                  {form.isBulkPurchase && form.totalCost && form.initialStock && (() => {
                    const unitCostCalc = parseFloat(form.totalCost)/(parseInt(form.initialStock)||1);
                    const damaged = parseInt(form.damagedOnArrival)||0;
                    const goodQty = (parseInt(form.initialStock)||0) - damaged;
                    return (
                      <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <p className="form-hint" style={{ color: 'var(--gold)' }}>Unit Cost: {formatPrice(unitCostCalc)} · Total Invoice: {formatPrice(parseFloat(form.totalCost))}</p>
                        {damaged > 0 && <p className="form-hint" style={{ color: '#f87171' }}>Less damaged: {damaged} pcs ({formatPrice(unitCostCalc*damaged)})</p>}
                        {damaged > 0 && <p className="form-hint" style={{ color: '#facc15' }}>Usable stock value: {goodQty} pcs × {formatPrice(unitCostCalc)} = {formatPrice(unitCostCalc*goodQty)}</p>}
                      </div>
                    );
                  })()}
                  {!form.isBulkPurchase && form.unitCost && form.initialStock && (() => {
                    const unit = parseFloat(form.unitCost)||0;
                    const qty = parseInt(form.initialStock)||0;
                    const damaged = parseInt(form.damagedOnArrival)||0;
                    const goodQty = qty - damaged;
                    return (
                      <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <p className="form-hint" style={{ color: 'var(--gold)' }}>Total Invoice: {formatPrice(unit*qty)} ({qty} pcs × {formatPrice(unit)})</p>
                        {damaged > 0 && <p className="form-hint" style={{ color: '#f87171' }}>Less damaged: {damaged} pcs ({formatPrice(unit*damaged)})</p>}
                        {damaged > 0 && <p className="form-hint" style={{ color: '#facc15' }}>Usable stock value: {goodQty} pcs × {formatPrice(unit)} = {formatPrice(unit*goodQty)}</p>}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Row 2: [Invoice / OR Number] [Delivery Date] */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Invoice / OR Number <span className="required">*</span></label>
                  <input type="text" className="form-input" value={form.invoiceNumber} onChange={e => setForm(p => ({ ...p, invoiceNumber: e.target.value.slice(0, 50) }))} placeholder="e.g., INV-2026-001" maxLength={50} />
                  <p className="form-hint">Invoice/SI/OR/Serial No. from supplier's receipt.</p>
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery Date <span className="required">*</span></label>
                  <input type="date" className="form-input" value={form.deliveryDate} onChange={e => setForm(p => ({ ...p, deliveryDate: e.target.value }))} />
                  <p className="form-hint">Date items were received.</p>
                </div>
              </div>
              {/* Row 3: Notes — full width */}
              <div className="form-group">
                <label className="form-label">Notes / Remarks <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value.slice(0, 300) }))} placeholder="e.g., 5 items arrived damaged. Supplier will replace next delivery." maxLength={300} rows={2} />
              </div>
              {/* Upload Receipt — optional, for audit trail */}
              {/* TODO: Cloudinary — replace base64 preview with Cloudinary upload */}
              {/* CURRENT: file stored locally as base64, not persisted to DB yet */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Upload Receipt
                  <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional — PNG, JPG, PDF, max 5MB)</span>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1.25rem', border: '2px dashed var(--border)', borderRadius: '8px', background: 'rgba(0,0,0,0.15)', cursor: 'pointer', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--gray)' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: '0.875rem', color: 'var(--gray-light)' }}>Click to upload receipt / invoice image</span>
                  <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) { setInfoModal({ title: 'File Too Large', message: 'Receipt image must be under 5MB.' }); return; }
                      // TODO: Cloudinary — upload file and store URL instead of base64
                      const reader = new FileReader();
                      reader.onload = ev => setForm(p => ({ ...p, receiptImage: ev.target.result }));
                      reader.readAsDataURL(file);
                    }} />
                </label>
                {form.receiptImage && (
                  <div style={{ marginTop: '0.75rem', position: 'relative', display: 'block' }}>
                    <img src={form.receiptImage} alt="Receipt preview" style={{ maxHeight: '200px', maxWidth: '100%', width: '100%', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }} />
                    <button type="button" onClick={() => setForm(p => ({ ...p, receiptImage: null }))}
                      style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{item ? 'Update Item' : 'Add Item'}</button>
          </div>
        </form>
      </div>

      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title||''} message={infoModal?.message||''} />

      {duplicateItem && (
        <div className="modal-overlay"><div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 className="modal-title modal-title-warning">Duplicate Item Detected</h2>
            <button className="modal-close" onClick={() => setDuplicateItem(null)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>
          <div className="modal-body"><p className="delete-confirm-text"><strong>"{duplicateItem.name}"</strong> in <strong>"{form.category}"</strong> already exists.</p>
            <p className="delete-confirm-warning" style={{ marginTop: '0.75rem' }}>Would you like to edit the existing item instead?</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setDuplicateItem(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => { setDuplicateItem(null); onClose(); setTimeout(() => onEdit(duplicateItem), 150); }}>Edit Existing Item</button>
          </div>
        </div></div>
      )}

      {archivedItem && (
        <div className="modal-overlay"><div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 className="modal-title modal-title-warning">Archived Item Found</h2>
            <button className="modal-close" onClick={() => setArchivedItem(null)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>
          <div className="modal-body"><p className="delete-confirm-text"><strong>"{archivedItem.name}"</strong> exists in your archive. Restore it to use again?</p>
            {archivedItem.deletedAt && <p style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.5rem' }}>Archived: {new Date(archivedItem.deletedAt).toLocaleDateString()}</p>}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setArchivedItem(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => { if (onRestoreItem) onRestoreItem(archivedItem); setArchivedItem(null); setTimeout(onClose, 150); }}>Restore Item</button>
          </div>
        </div></div>
      )}

      <AddSupplierQuickModal isOpen={showAddSupplier} onClose={() => setShowAddSupplier(false)}
        onAdd={(data) => { const s = onAddSupplier(data); setForm(p => ({ ...p, supplierId: s.id, supplierName: s.name })); }}
        categories={categories} existingSuppliers={suppliers} />
    </div>
  );
}
// ── Confirm Save Modal ─────────────────────────────────────────────────────────
function ConfirmSaveModal({ isOpen, onClose, onConfirm, itemData, isEdit }) {
  if (!isOpen || !itemData) return null;
  return (
    <div className="modal-overlay"><div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h2 className="modal-title modal-title-success">{isEdit ? 'Update Item' : 'Add New Item'}</h2>
        <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div className="modal-body">
        <div className="confirm-summary">
          <div className="confirm-row"><span className="confirm-label">Name:</span><span className="confirm-value">{itemData.name}</span></div>
          <div className="confirm-row"><span className="confirm-label">Category:</span><span className="confirm-value">{itemData.category}</span></div>
          <div className="confirm-row"><span className="confirm-label">SKU:</span><span className="confirm-value" style={{ fontFamily: 'monospace' }}>{itemData.sku}</span></div>
          <div className="confirm-row"><span className="confirm-label">Stock:</span><span className="confirm-value">{itemData.stockQty} pcs</span></div>
          <div className="confirm-row"><span className="confirm-label">Min Level:</span><span className="confirm-value">{itemData.minStockLevel} pcs</span></div>
        </div>
        <p className="confirm-hint">{isEdit ? 'This will update the inventory item.' : 'This will add a new item to your physical inventory.'}</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={onConfirm}>{isEdit ? 'Update' : 'Add Item'}</button>
      </div>
    </div></div>
  );
}

// ── Archive Confirm Modal ──────────────────────────────────────────────────────
function ArchiveConfirmModal({ isOpen, onClose, onArchive, onDelete, itemName, isReferenced, referencingProductsCount, hasSalesHistory }) {
  if (!isOpen) return null;
  const mustArchive = isReferenced || hasSalesHistory;
  return (
    <div className="modal-overlay"><div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h2 className={`modal-title ${mustArchive ? 'modal-title-warning' : 'modal-title-danger'}`}>
          {mustArchive ? 'Cannot Permanently Delete' : 'Confirm Delete'}
        </h2>
        <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div className="modal-body">
        {mustArchive ? (
          <>
            {isReferenced && <p className="delete-confirm-text" style={{ marginBottom: '0.75rem' }}><strong>"{itemName}"</strong> is used by {referencingProductsCount} product(s) in your catalog.</p>}
            {hasSalesHistory && <p className="delete-confirm-text" style={{ color: '#f87171', marginBottom: '0.75rem' }}><strong>Warning:</strong> This item has sales history. Permanent deletion would corrupt your reports.</p>}
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '0.75rem', marginTop: '0.75rem', fontSize: '0.875rem', color: '#f59e0b' }}>
              Archive instead? The item will be hidden but data is preserved for reports.
            </div>
          </>
        ) : (
          <>
            <p className="delete-confirm-text">Permanently delete <strong>"{itemName}"</strong>?</p>
            <p className="delete-confirm-warning">This cannot be undone. Only delete if this item was added by mistake and has no history.</p>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        {mustArchive
          ? <button type="button" className="btn-primary" onClick={onArchive}>Archive Item</button>
          : <button type="button" className="btn-danger" onClick={onDelete}>Delete Permanently</button>
        }
      </div>
    </div></div>
  );
}

// ── Stock Addition Modal (+) ───────────────────────────────────────────────────
// NOTE: isOnDemand conversion REMOVED — inventory is always stocked items
function StockAdditionModal({ isOpen, onClose, onConfirm, item, suppliers, categories, onAddSupplier }) {
  const [qty, setQty] = useState('');
  const [damaged, setDamaged] = useState('');
  const [supplierId, setSupplierId] = useState('unspecified');
  const [supplierName, setSupplierName] = useState('General Merchandise');
  const [invoice, setInvoice] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [unitCost, setUnitCost] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [receiptImage, setReceiptImage] = useState(null);
  const [infoModal, setInfoModal] = useState(null);

  const genBatchId = () => { const d=new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`; };

  useEffect(() => {
    if (isOpen && item) {
      setQty(''); setDamaged(''); setNotes(''); setInvoice(''); setIsBulk(false); setTotalCost(''); setReceiptImage(null);
      setDeliveryDate(new Date().toISOString().split('T')[0]);
      setSupplierId(item.lastSupplierId||'unspecified');
      setSupplierName(item.lastSupplierName||'General Merchandise');
      setUnitCost(item.lastUnitCost ? String(item.lastUnitCost) : '');
      setShowConfirm(false); setPending(null);
    }
  }, [isOpen, item]);

  const handleUnitChange = (v) => { setUnitCost(v); if (!isBulk && qty) setTotalCost(String((parseFloat(v)||0)*(parseInt(qty)||0))); };
  const handleTotalChange = (v) => { setTotalCost(v); if (isBulk && qty) setUnitCost(String((parseFloat(v)||0)/(parseInt(qty)||1))); };
  const handleQtyChange = (v) => { setQty(v); const q=parseInt(v)||0; if (isBulk && totalCost) setUnitCost(String((parseFloat(totalCost)||0)/(q||1))); else if (!isBulk && unitCost) setTotalCost(String((parseFloat(unitCost)||0)*q)); };

  const handleSubmit = () => {
    const q = parseInt(qty)||0; const d = parseInt(damaged)||0;
    if (q <= 0) { setInfoModal({ title: 'Validation Error', message: 'Please enter a valid quantity (minimum 1).' }); return; }
    if (d >= q) { setInfoModal({ title: 'Validation Error', message: 'Damaged on arrival must be less than quantity received.' }); return; }
    if (!unitCost || parseFloat(unitCost) <= 0) { setInfoModal({ title: 'Validation Error', message: 'Please enter the unit cost.' }); return; }
    if (!invoice.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter the invoice/OR number.' }); return; }
    if (!deliveryDate) { setInfoModal({ title: 'Validation Error', message: 'Please enter the delivery date.' }); return; }
    const goodQty = q - d; const cost = parseFloat(unitCost); const batchId = genBatchId();
    setPending({ quantity: goodQty, damagedOnArrival: d, supplierId: supplierId==='unspecified'?null:supplierId, supplierName, invoiceNumber: invoice, deliveryDate, unitCost: cost, totalCost: goodQty*cost, notes, receiptImage, batchData: { batchId, supplierId: supplierId==='unspecified'?null:supplierId, supplierName, invoiceNumber: invoice, dateReceived: deliveryDate, originalQty: q, goodQty, damagedQty: d, remainingQty: goodQty, unitCost: cost, totalCost: goodQty*cost, notes, receiptImage, movements: [{ type: 'received', quantity: goodQty, remainingAfter: goodQty, reason: 'Initial stock addition', createdAt: new Date().toISOString() }], status: 'active' } });
    setShowConfirm(true);
  };

  if (!isOpen || !item) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">Add Stock — {item.name}</h2>
          <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid var(--primary)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Adding stock to:</div>
            <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '1rem' }}>{item.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>{item.category} · Current stock: <strong style={{ color: 'var(--white)' }}>{item.stockQty} pcs</strong></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Total Received <span className="required">*</span></label>
              <IntegerInput className="form-input" value={qty} onChange={e => handleQtyChange(e.target.value)} min={1} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Damaged on Arrival <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
              <IntegerInput className="form-input" value={damaged} onChange={e => setDamaged(e.target.value)} min={0} placeholder="0" />
              <p className="form-hint">Excluded from usable stock.</p>
            </div>
          </div>
          {qty && damaged && parseInt(damaged) < parseInt(qty) && (
            <p style={{ fontSize: '0.875rem', color: 'var(--gold)', marginBottom: '1rem' }}>Good stock to add: {parseInt(qty)-parseInt(damaged)} pcs</p>
          )}
          <div style={{ background: 'rgba(217,119,6,0.08)', border: '2px solid rgba(217,119,6,0.3)', borderRadius: '8px', padding: '1.5rem' }}>
            <h4 style={{ margin: '0 0 1.25rem 0', color: '#d97706', fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase' }}>Supplier Invoice Information</h4>
            {/* Row 1: [Supplier] [Unit Cost Each] */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <SupplierCombobox value={supplierId} supplierName={supplierName} onChange={(id, name) => { setSupplierId(id); setSupplierName(name); }} suppliers={suppliers} itemCategory={item.category} onAddNew={() => setShowAddSupplier(true)} />
                <p className="form-hint">Filtered for "{item.category}" + General suppliers.</p>
              </div>
              <div className="form-group">
                <label className="form-label">{isBulk ? 'Total Amount Paid' : 'Unit Cost Each'} <span className="required">*</span></label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div className="tier-price-cell" style={{ flex: 1 }}>
                    <span className="peso">₱</span>
                    <DecimalInput className="tier-input" value={isBulk ? totalCost : unitCost} onChange={e => isBulk ? handleTotalChange(e.target.value) : handleUnitChange(e.target.value)} placeholder="0.00" style={{ width: '100%' }} />
                  </div>
                  <label className="form-checkbox-label" style={{ marginBottom: '0.875rem', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" className="form-checkbox" checked={isBulk} onChange={() => setIsBulk(p => !p)} />
                    <span className="checkbox-text" style={{ fontSize: '0.75rem' }}>{isBulk ? 'Per Unit' : 'Total'}</span>
                  </label>
                </div>
                {isBulk && totalCost && qty && (() => {
                  const unitCostCalc = parseFloat(totalCost)/(parseInt(qty)||1);
                  const dmg = parseInt(damaged)||0;
                  const goodQty = (parseInt(qty)||0) - dmg;
                  return (
                    <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <p className="form-hint" style={{ color: 'var(--gold)' }}>Unit Cost: {formatPrice(unitCostCalc)} · Total Invoice: {formatPrice(parseFloat(totalCost))}</p>
                      {dmg > 0 && <p className="form-hint" style={{ color: '#f87171' }}>Less damaged: {dmg} pcs ({formatPrice(unitCostCalc*dmg)})</p>}
                      {dmg > 0 && <p className="form-hint" style={{ color: '#facc15' }}>Usable stock value: {goodQty} pcs × {formatPrice(unitCostCalc)} = {formatPrice(unitCostCalc*goodQty)}</p>}
                    </div>
                  );
                })()}
                {!isBulk && unitCost && qty && (() => {
                  const unit = parseFloat(unitCost)||0;
                  const q = parseInt(qty)||0;
                  const dmg = parseInt(damaged)||0;
                  const goodQty = q - dmg;
                  return (
                    <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <p className="form-hint" style={{ color: 'var(--gold)' }}>Total Invoice: {formatPrice(unit*q)} ({q} pcs × {formatPrice(unit)})</p>
                      {dmg > 0 && <p className="form-hint" style={{ color: '#f87171' }}>Less damaged: {dmg} pcs ({formatPrice(unit*dmg)})</p>}
                      {dmg > 0 && <p className="form-hint" style={{ color: '#facc15' }}>Usable stock value: {goodQty} pcs × {formatPrice(unit)} = {formatPrice(unit*goodQty)}</p>}
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* Row 2: [Invoice / OR Number] [Delivery Date] */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Invoice / OR Number <span className="required">*</span></label>
                <input type="text" className="form-input" value={invoice} onChange={e => setInvoice(e.target.value.slice(0, 50))} placeholder="e.g., INV-2026-001" maxLength={50} />
                <p className="form-hint">Invoice/SI/OR/Serial No. from supplier's receipt.</p>
              </div>
              <div className="form-group">
                <label className="form-label">Delivery Date <span className="required">*</span></label>
                <input type="date" className="form-input" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                <p className="form-hint">Date items were received.</p>
              </div>
            </div>
            {/* Row 3: Notes — full width */}
            <div className="form-group">
              <label className="form-label">Notes <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
              <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value.slice(0, 300))} placeholder="e.g., 5 items arrived damaged. Supplier to replace next delivery." maxLength={300} rows={2} />
            </div>
            {/* Upload Receipt — optional, for audit trail */}
            {/* TODO: Cloudinary — replace with cloud upload */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Upload Receipt
                <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional — PNG, JPG, PDF, max 5MB)</span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1.25rem', border: '2px dashed var(--border)', borderRadius: '8px', background: 'rgba(0,0,0,0.15)', cursor: 'pointer', transition: 'border-color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--gray)' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span style={{ fontSize: '0.875rem', color: 'var(--gray-light)' }}>Click to upload receipt / invoice image</span>
                <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { setInfoModal({ title: 'File Too Large', message: 'Receipt image must be under 5MB.' }); return; }
                    // TODO: Cloudinary — upload file and store URL instead of base64
                    const reader = new FileReader();
                    reader.onload = ev => setReceiptImage(ev.target.result);
                    reader.readAsDataURL(file);
                  }} />
              </label>
              {receiptImage && (
                <div style={{ marginTop: '0.75rem', position: 'relative', display: 'block' }}>
                  <img src={receiptImage} alt="Receipt preview" style={{ maxHeight: '200px', maxWidth: '100%', width: '100%', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }} />
                  <button type="button" onClick={() => setReceiptImage(null)}
                    style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSubmit}>Add Stock</button>
        </div>
      </div>

      {/* Confirm */}
      {showConfirm && pending && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title modal-title-success">Confirm Stock Addition</h2>
              <button className="modal-close" onClick={() => setShowConfirm(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="modal-body">
              <div className="confirm-summary">
                <div className="confirm-row"><span className="confirm-label">Item:</span><span className="confirm-value">{item.name}</span></div>
                <div className="confirm-row"><span className="confirm-label">Good Qty:</span><span className="confirm-value" style={{ color: '#4ade80', fontWeight: 700 }}>+{pending.quantity} pcs</span></div>
                {pending.damagedOnArrival > 0 && <div className="confirm-row"><span className="confirm-label">Damaged:</span><span className="confirm-value" style={{ color: '#f87171' }}>−{pending.damagedOnArrival} pcs</span></div>}
                <div className="confirm-row"><span className="confirm-label">New Total:</span><span className="confirm-value" style={{ color: '#4ade80', fontWeight: 700 }}>{item.stockQty + pending.quantity} pcs</span></div>
                <div className="confirm-row"><span className="confirm-label">Supplier:</span><span className="confirm-value">{pending.supplierName}</span></div>
                <div className="confirm-row"><span className="confirm-label">Unit Cost:</span><span className="confirm-value">₱{formatPrice(pending.unitCost)}</span></div>
                <div className="confirm-row"><span className="confirm-label">Total Value:</span><span className="confirm-value" style={{ color: '#facc15', fontWeight: 700 }}>₱{formatPrice(pending.totalCost)}</span></div>
                <div className="confirm-row"><span className="confirm-label">Invoice:</span><span className="confirm-value">{pending.invoiceNumber}</span></div>
              </div>
              <p className="confirm-hint" style={{ marginTop: '1rem', color: '#facc15' }}>This will update inventory stock and create a batch record.</p>
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
        categories={categories} existingSuppliers={suppliers} />
      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title||''} message={infoModal?.message||''} />
    </div>
  );
}

// ── Stock Reduction Modal (-) ──────────────────────────────────────────────────
// Reasons: Manual Sale (outside system), Damaged/Write-off
// Stock Correction REMOVED — all stock movements must have a valid source document
function StockReductionModal({ isOpen, onClose, onConfirm, item, inventory }) {
  const [reason, setReason] = useState('sales-outside');
  const [qty, setQty] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [customer, setCustomer] = useState('');
  const [remarks, setRemarks] = useState('');
  const [batchId, setBatchId] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(null);
  const [showReasonDrop, setShowReasonDrop] = useState(false);
  const [showBatchDrop, setShowBatchDrop] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const [infoModal, setInfoModal] = useState(null);
  const reasonRef = useRef(null);
  const batchRef = useRef(null);

  const batches = useMemo(() => {
    if (!inventory || !item) return [];
    const inv = inventory.find(i => i.id === item.id);
    return (inv?.batches||[]).filter(b => b.remainingQty > 0).sort((a, b) => new Date(a.dateReceived)-new Date(b.dateReceived));
  }, [inventory, item]);

  useEffect(() => { if (batches.length > 0) { setBatchId(batches[0].batchId); setSelectedBatch(batches[0]); } }, [batches]);
  useEffect(() => { const b = batches.find(b => b.batchId===batchId); setSelectedBatch(b||null); }, [batchId, batches]);
  useEffect(() => { if (isOpen && item) { setReason('sales-outside'); setQty(''); setSellingPrice(''); setSaleDate(new Date().toISOString().split('T')[0]); setRemarks(''); setCustomer(''); setBatchSearch(''); setShowConfirm(false); setPending(null); } }, [isOpen, item]);
  useEffect(() => { const h = (e) => { if (reasonRef.current && !reasonRef.current.contains(e.target)) setShowReasonDrop(false); if (batchRef.current && !batchRef.current.contains(e.target)) setShowBatchDrop(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);

  const handleSubmit = () => {
    const q = parseInt(qty)||0;
    if (q <= 0) { setInfoModal({ title: 'Validation Error', message: 'Please enter a valid quantity (minimum 1).' }); return; }
    if (q > item.stockQty) { setInfoModal({ title: 'Validation Error', message: `Quantity (${q}) exceeds current stock (${item.stockQty} pcs).` }); return; }
    if (!batchId || !selectedBatch) { setInfoModal({ title: 'Validation Error', message: 'Please select a batch.' }); return; }
    if (reason === 'sales-outside' && (!sellingPrice || parseFloat(sellingPrice) <= 0)) { setInfoModal({ title: 'Validation Error', message: 'Please enter the total amount received.' }); return; }
    setPending({ reason, quantity: q, sellingPrice: reason==='sales-outside' ? parseFloat(sellingPrice) : 0, saleDate: reason==='sales-outside' ? saleDate : null, remarks: remarks||null, customerName: customer||null, batchId, batchData: selectedBatch ? { batchId: selectedBatch.batchId, supplierId: selectedBatch.supplierId, supplierName: selectedBatch.supplierName, unitCost: selectedBatch.unitCost, remainingQty: selectedBatch.remainingQty } : null });
    setShowConfirm(true);
  };

  const labels = { 'sales-outside': 'Manual Sale (Outside System)', 'damaged': 'Damaged / Write-off' };
  if (!isOpen || !item) return null;

  // Calculate total value based on batch costs
  const calculateTotalCost = () => {
    const q = parseInt(qty) || 0;
    if (q <= 0 || !selectedBatch) return 0;
    
    const fromSelected = Math.min(q, selectedBatch.remainingQty);
    const spillover = q - fromSelected;
    let total = fromSelected * selectedBatch.unitCost;
    
    if (spillover > 0) {
      const nextBatches = batches.filter(b => b.batchId !== batchId);
      let rem = spillover;
      for (const nb of nextBatches) {
        if (rem <= 0) break;
        const take = Math.min(rem, nb.remainingQty || 0);
        if (take > 0) total += take * nb.unitCost;
        rem -= take;
      }
    }
    return total;
  };

  const totalCost = calculateTotalCost();

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">Reduce Stock — {item.name}</h2>
          <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          {/* Info Box */}
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Reducing stock for:</div>
            <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '1rem' }}>{item.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>{item.category} · Current stock: <strong style={{ color: 'var(--white)' }}>{item.stockQty} pcs</strong></div>
          </div>

          {/* Reason */}
          <div className="form-group">
            <label className="form-label">Reason <span className="required">*</span></label>
            <div className="combobox-root" ref={reasonRef}>
              <div className="combobox-field">
                <input type="text" className="form-input" value={labels[reason]} readOnly onClick={() => setShowReasonDrop(o => !o)} style={{ cursor: 'pointer' }} />
                <button type="button" className="combobox-toggle" onClick={() => setShowReasonDrop(o => !o)}>{showReasonDrop ? '▲' : '▼'}</button>
              </div>
              {showReasonDrop && (
                <div className="combobox-menu">
                  {Object.entries(labels).map(([v, l]) => (
                    <button key={v} type="button" className={`combobox-item${reason===v?' active':''}`} onClick={() => { setReason(v); setShowReasonDrop(false); }}>{l}</button>
                  ))}
                </div>
              )}
            </div>
            {reason === 'sales-outside' && <p className="form-hint" style={{ color: '#facc15' }}>Creates a sales record and reduces inventory.</p>}
          </div>

          {/* Qty */}
          <div className="form-group">
            <label className="form-label">Quantity {reason==='sales-outside'?'Sold':'to Remove'} <span className="required">*</span></label>
            <IntegerInput className="form-input" value={qty} onChange={e => setQty(e.target.value)} min={1} max={item.stockQty} placeholder="0" />
            {qty && parseInt(qty) > item.stockQty && <p className="form-hint" style={{ color: '#f87171' }}>Exceeds current stock ({item.stockQty} pcs)</p>}
          </div>

          {/* Batch (FIFO) */}
          {batches.length > 0 && (
            <div style={{ background: 'rgba(217,119,6,0.08)', border: '2px solid rgba(217,119,6,0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ color: '#d97706', display: 'block', marginBottom: '0.5rem' }}>
                Batch (FIFO — Oldest First)
              </label>
              <p className="form-hint" style={{ marginBottom: '0.75rem' }}>
                Auto-selects oldest batch. If quantity exceeds one batch, the remainder is automatically deducted from the next batch.
              </p>
              
              {/* Combobox for batch selection */}
              <div className="combobox-root" ref={batchRef}>
                <div className="combobox-field">
                  <input type="text" className="form-input" 
                    value={selectedBatch ? `${selectedBatch.batchId} | ${new Date(selectedBatch.dateReceived).toLocaleDateString()} | ${selectedBatch.remainingQty} pcs` : 'Select a batch...'}
                    readOnly
                    onClick={() => setShowBatchDrop(o => !o)}
                    placeholder="Select a batch..."
                    style={{ cursor: 'pointer', fontFamily: 'monospace' }} />
                  <button type="button" className="combobox-toggle" onClick={() => setShowBatchDrop(o => !o)}>
                    {showBatchDrop ? '▲' : '▼'}
                  </button>
                </div>
                {showBatchDrop && (
                  <div className="combobox-menu" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                    {batches.length === 0 ? (
                      <div style={{ padding: '1rem', color: 'var(--gray)', fontSize: '0.875rem', textAlign: 'center' }}>
                        No batches with available stock.
                      </div>
                    ) : (
                      batches.map(b => (
                        <button 
                          key={b.batchId} 
                          type="button" 
                          className={`combobox-item${batchId===b.batchId?' active':''}`}
                          onClick={() => { setBatchId(b.batchId); setSelectedBatch(b); setShowBatchDrop(false); }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <span style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' }}>{b.batchId}</span>
                            <span style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.8rem' }}>{b.remainingQty} pcs</span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                            <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>
                              {new Date(b.dateReceived).toLocaleDateString()}
                            </span>
                            <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>
                              @ ₱{formatPrice(b.unitCost)}
                            </span>
                            {b.invoiceNumber && (
                              <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>
                                | INV: {b.invoiceNumber}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* FIFO spillover info */}
              {selectedBatch && qty && parseInt(qty) > 0 && (() => {
                const q = parseInt(qty);
                const fromSelected = Math.min(q, selectedBatch.remainingQty);
                const spillover = q - fromSelected;
                const nextBatches = batches.filter(b => b.batchId !== batchId);
                const totalAvailable = batches.reduce((s, b) => s + (b.remainingQty || 0), 0);

                // Accurate FIFO: track running remainder across all spillover batches
                const spilloverBreakdown = [];
                let rem = spillover;
                for (const nb of nextBatches) {
                  if (rem <= 0) break;
                  const take = Math.min(rem, nb.remainingQty || 0);
                  if (take > 0) spilloverBreakdown.push({ ...nb, take });
                  rem -= take;
                }
                const unfulfilledQty = rem; // > 0 means not enough stock

                return (
                  <div style={{ marginTop: '0.75rem' }}>
                    {/* From selected batch */}
                    <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: 'var(--gray)' }}>Invoice: <strong style={{ color: 'var(--white)' }}>{selectedBatch.invoiceNumber || 'N/A'}</strong></span>
                      <span style={{ color: 'var(--gray)', marginLeft: '1rem' }}>
                        From this batch: <strong style={{ color: '#d97706' }}>₱{formatPrice(selectedBatch.unitCost * fromSelected)}</strong>
                        <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}> ({fromSelected} pcs × ₱{formatPrice(selectedBatch.unitCost)})</span>
                      </span>
                    </div>

                    {/* FIFO spillover */}
                    {spillover > 0 && (
                      <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '6px', padding: '0.6rem 0.75rem', marginTop: '0.5rem' }}>
                        {unfulfilledQty > 0 ? (
                          <div style={{ fontSize: '0.8rem', color: '#f87171', fontWeight: 600 }}>
                            Not enough stock. Available: {totalAvailable} pcs, requested: {q} pcs
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.25rem' }}>
                              FIFO Spillover: {fromSelected} pcs from this batch + {spillover} pcs from {spilloverBreakdown.length} other batch{spilloverBreakdown.length !== 1 ? 'es' : ''}
                            </div>
                            {spilloverBreakdown.map(nb => (
                              <div key={nb.batchId} style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
                                {nb.batchId}: {nb.take} pcs @ {formatPrice(nb.unitCost)} = {formatPrice(nb.unitCost * nb.take)}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Total Value Summary */}
          {qty && parseInt(qty) > 0 && totalCost > 0 && (
            <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Total Inventory Value to Reduce:</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--gold)' }}>₱{formatPrice(totalCost)}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.25rem' }}>Based on FIFO batch costs</div>
            </div>
          )}

          {/* Sale fields */}
          {reason === 'sales-outside' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Total Amount Received <span className="required">*</span></label>
                  <div className="tier-price-cell"><span className="peso">₱</span>
                    <DecimalInput className="tier-input" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} placeholder="0.00" style={{ width: '100%' }} />
                  </div>
                  <p className="form-hint">Actual selling price (may differ from inventory cost)</p>
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Sale <span className="required">*</span></label>
                  <input type="date" className="form-input" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Customer Name <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
                <input type="text" className="form-input" value={customer} onChange={e => setCustomer(e.target.value.slice(0, 60))} placeholder="e.g., Juan Dela Cruz" maxLength={60} />
              </div>
            </>
          )}

          {/* Damaged fields */}
          {reason === 'damaged' && (
            <div className="form-group">
              <label className="form-label">Cause / Description <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
              <textarea className="form-textarea" value={remarks} onChange={e => setRemarks(e.target.value.slice(0, 300))} placeholder="e.g., Dropped during packing, product defect..." maxLength={300} rows={2} />
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={!!(qty && parseInt(qty) > item.stockQty)}>
            {reason==='sales-outside' ? 'Record Sale' : 'Mark as Damaged'}
          </button>
        </div>
      </div>

      {/* Confirm */}
      {showConfirm && pending && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title modal-title-success">{pending.reason==='sales-outside' ? 'Confirm Sale Record' : 'Confirm Stock Reduction'}</h2>
              <button className="modal-close" onClick={() => setShowConfirm(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="modal-body">
              <div className="confirm-summary">
                <div className="confirm-row"><span className="confirm-label">Item:</span><span className="confirm-value">{item.name}</span></div>
                <div className="confirm-row"><span className="confirm-label">Quantity:</span><span className="confirm-value" style={{ color: '#f87171', fontWeight: 700 }}>−{pending.quantity} pcs</span></div>
                {pending.reason === 'sales-outside' && (
                  <>
                    <div className="confirm-row"><span className="confirm-label">Amount:</span><span className="confirm-value" style={{ color: '#4ade80', fontWeight: 700 }}>₱{formatPrice(pending.sellingPrice)}</span></div>
                    {pending.customerName && <div className="confirm-row"><span className="confirm-label">Customer:</span><span className="confirm-value">{pending.customerName}</span></div>}
                    <div className="confirm-row"><span className="confirm-label">Date:</span><span className="confirm-value">{pending.saleDate}</span></div>
                  </>
                )}
                {pending.remarks && <div className="confirm-row"><span className="confirm-label">Remarks:</span><span className="confirm-value">{pending.remarks}</span></div>}
              </div>
              <p className="confirm-hint" style={{ marginTop: '1rem', color: '#facc15' }}>
                {pending.reason==='sales-outside' ? 'Creates a sales record and reduces inventory.' : 'Reduces inventory and creates an audit log entry.'}
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => { onConfirm(pending); setShowConfirm(false); setPending(null); onClose(); }}>
                {pending.reason==='sales-outside' ? 'Confirm Sale' : 'Confirm Reduction'}
              </button>
            </div>
          </div>
        </div>
      )}
      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title||''} message={infoModal?.message||''} />
    </div>
  );
}
// ── Main Inventory Page ────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingInline, setEditingInline] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingItemData, setPendingItemData] = useState(null);
  const [modalKey, setModalKey] = useState(0);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [archiveItem, setArchiveItem] = useState(null);
  const [referencingProducts, setReferencingProducts] = useState([]);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [restoreItem, setRestoreItem] = useState(null);
  const [hasSalesHistory, setHasSalesHistory] = useState(false);
  const [adjustmentItem, setAdjustmentItem] = useState(null);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [additionItem, setAdditionItem] = useState(null);
  const [showAdditionModal, setShowAdditionModal] = useState(false);
  const [showManageSuppliersModal, setShowManageSuppliersModal] = useState(false);
  const [masterlist, setMasterlist] = useState([]);
  const [showMasterlistModal, setShowMasterlistModal] = useState(false);
  const [showBatchDetailsModal, setShowBatchDetailsModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedBatchItem, setSelectedBatchItem] = useState(null);

  // TODO: MongoDB — Replace with:
  // GET /api/inventory, GET /api/categories, GET /api/suppliers, GET /api/masterlist
  useEffect(() => {
    setInventory(getInventoryList());
    setSuppliers(getSuppliers());
    // Load masterlist — categories derived from here instead of pmp_inventory_categories
    // TODO: MongoDB — GET /api/masterlist
    const ml = getMasterlist();
    setMasterlist(ml);
    // Derive categories from masterlist (replaces getCategories())
    setCategories(ml.map(c => c.name));
    setIsLoaded(true);
  }, []);

  // TODO: MongoDB — Remove this useEffect
  // CURRENT: Auto-saves to LocalStorage on every state change
  // FUTURE: Each action (add/edit/delete) calls its own API endpoint
  useEffect(() => { if (isLoaded) saveInventoryList(inventory); }, [inventory, isLoaded]);

  // Batch details event listener (from InventoryExpandRow)
  useEffect(() => {
    const h = (e) => { setSelectedBatch(e.detail.batch); setSelectedBatchItem(e.detail.item); setShowBatchDetailsModal(true); };
    window.addEventListener('openBatchDetails', h);
    return () => window.removeEventListener('openBatchDetails', h);
  }, []);

  // TODO: MongoDB — POST /api/categories (now derived from masterlist, kept for backward compat)
  const handleAddCategory = (cat) => {
    // When called from InventoryModal (manual add) — also add to masterlist as standalone category
    if (categories.some(c => c.toLowerCase() === cat.toLowerCase())) return;
    const updated = [...categories, cat];
    setCategories(updated);
    saveCategories(updated);
  };

  // TODO: MongoDB — Each action inside maps to its own API endpoint (see ItemMasterlistModal)
  const handleSaveMasterlist = (updatedList) => {
    setMasterlist(updatedList);
    saveMasterlist(updatedList);
    // Sync categories from masterlist — masterlist is single source of truth
    const derivedCats = updatedList.map(c => c.name);
    setCategories(derivedCats);
    saveCategories(derivedCats); // keep pmp_inventory_categories in sync for backward compat
  };

  const handleAddSupplier = (data) => {
    const s = addSupplier(data);
    setSuppliers(prev => [...prev, s]);
    return s;
  };

  const toggleExpand = (id) => setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Active items only, filtered by search + status
  const filteredInventory = inventory.filter(item => {
    if (item.isActive === false) return false;
    const q = searchQuery.toLowerCase();
    if (!item.name.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q)) return false;
    if (statusFilter === 'low-stock') return item.stockQty > 0 && item.stockQty <= item.minStockLevel;
    if (statusFilter === 'out-of-stock') return item.stockQty === 0;
    return true;
  });

  const archivedInventory = inventory.filter(i => i.isActive === false);

  // Summary stats
  const activeItems = inventory.filter(i => i.isActive !== false).length;
  const lowStockItems = inventory.filter(i => i.isActive !== false && i.stockQty > 0 && i.stockQty <= i.minStockLevel).length;
  const outOfStockItems = inventory.filter(i => i.isActive !== false && i.stockQty === 0).length;
  const archivedCount = archivedInventory.length;

  const handleAddNew = () => { setEditingItem(null); setPendingItemData(null); setIsConfirmModalOpen(false); setModalKey(p => p + 1); setIsModalOpen(true); };
  const handleEdit = (item) => { setEditingItem(item); setIsModalOpen(true); };

  // TODO: MongoDB — Replace with: GET /api/products?inventoryId=... and GET /api/sales?inventoryId=...
  const handleDelete = (item) => {
    const products = JSON.parse(localStorage.getItem('pmp_products')||'[]');
    const sales = JSON.parse(localStorage.getItem('pmp_sales')||'[]');
    setReferencingProducts(products.filter(p => p.inventoryId === item.id));
    setHasSalesHistory(sales.some(s => s.inventoryId === item.id || s.items?.some(i => i.inventoryId === item.id)));
    setArchiveItem(item);
    setShowArchiveModal(true);
  };

  // TODO: MongoDB — Replace with: PUT /api/inventory/:id { isActive: false, deletedAt: now }
  const handleArchive = () => {
    if (!archiveItem) return;
    setInventory(prev => prev.map(i => i.id === archiveItem.id ? { ...i, isActive: false, deletedAt: new Date().toISOString() } : i));
    // Auto-archive linked products
    // TODO: MongoDB — PUT /api/products/archive-by-inventory { inventoryId }
    const products = JSON.parse(localStorage.getItem('pmp_products')||'[]');
    localStorage.setItem('pmp_products', JSON.stringify(products.map(p => p.inventoryId === archiveItem.id ? { ...p, isPublished: false, isArchived: true, updatedAt: new Date().toISOString() } : p)));
    setShowArchiveModal(false); setArchiveItem(null); setReferencingProducts([]);
  };

  // TODO: MongoDB — Replace with: DELETE /api/inventory/:id
  const handlePermanentDelete = () => {
    if (!archiveItem) return;
    setInventory(prev => prev.filter(i => i.id !== archiveItem.id));
    setShowArchiveModal(false); setArchiveItem(null); setReferencingProducts([]);
  };

  // TODO: MongoDB — Replace with: PUT /api/inventory/:id { isActive: true, deletedAt: null }
  const handleRestore = (item) => setInventory(prev => prev.map(i => i.id === item.id ? { ...i, isActive: true, deletedAt: null } : i));

  // TODO: MongoDB — Wrap in transaction: update inventory + deduct batch + audit log + sales record
  const handleStockReduction = (data) => {
    if (!adjustmentItem) return;
    const { reason, quantity, sellingPrice, saleDate, remarks, customerName, batchId, batchData } = data;
    const newStock = Math.max(0, adjustmentItem.stockQty - quantity);

    // ── FIFO Overflow Fix ─────────────────────────────────────────────────────
    // If qty exceeds selected batch's remainingQty, spill over to next batches
    // Example: buy 140pcs, Batch1=100pcs → deduct 100 from Batch1, 40 from Batch2
    // TODO: MongoDB — this logic moves to server-side transaction
    // ── FIFO deduction ────────────────────────────────────────────────────────
    // Deduct from selected batch first, then spill to next batches by date (oldest first)
    const currentBatches = [...(adjustmentItem.batches || [])];
    const selectedBatchObj = currentBatches.find(b => b.batchId === batchId);
    const selectedDate = selectedBatchObj ? new Date(selectedBatchObj.dateReceived) : new Date(0);

    // Queue: selected batch first, then any batches received AFTER it (sorted oldest first)
    // This is true FIFO from the selected point forward
    const deductQueue = [
      ...currentBatches.filter(b => b.batchId === batchId),
      ...currentBatches
        .filter(b => b.batchId !== batchId && new Date(b.dateReceived) >= selectedDate && (b.remainingQty || 0) > 0)
        .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived)),
    ];

    // Track deductions per batchId
    const deductions = {};
    let remaining = quantity;
    for (const b of deductQueue) {
      if (remaining <= 0) break;
      const available = b.remainingQty || 0;
      const deduct = Math.min(available, remaining);
      remaining -= deduct;
      deductions[b.batchId] = deduct;
    }

    const now = new Date().toISOString();
    const updatedBatches = currentBatches.map(batch => {
      const deduct = deductions[batch.batchId];
      if (!deduct) return batch;
      const newRemaining = (batch.remainingQty || 0) - deduct;
      const movement = {
        type: reason === 'sales-outside' ? 'sold' : 'damaged',
        quantity: -deduct,
        remainingAfter: newRemaining,
        reason: reason === 'sales-outside'
          ? `Manual sale${customerName ? ` — ${customerName}` : ''}${sellingPrice ? ` @ ₱${formatPrice(sellingPrice)}` : ''}`
          : (remarks || 'Damaged / Write-off'),
        createdAt: now,
      };
      return { ...batch, remainingQty: newRemaining, movements: [...(batch.movements || []), movement] };
    });

    setInventory(prev => prev.map(i => i.id === adjustmentItem.id
      ? { ...i, stockQty: newStock, batches: updatedBatches,
          damagedQty: reason === 'damaged' ? (i.damagedQty || 0) + quantity : i.damagedQty,
          updatedAt: new Date().toISOString() }
      : i
    ));

    // Also update stock history remainingQty for FIFO tracking
    // TODO: MongoDB — handled by server transaction
    deductStockFromBatch(adjustmentItem.id, batchId, Math.min(quantity, batchData?.remainingQty || quantity));

    // Update linked products if their displayed stock exceeds new inventory stock
    // TODO: MongoDB — PUT /api/products/sync-stock { inventoryId, maxStock: newStock }
    const products = JSON.parse(localStorage.getItem('pmp_products')||'[]');
    if (products.some(p => p.inventoryId === adjustmentItem.id && p.stock > newStock)) {
      localStorage.setItem('pmp_products', JSON.stringify(
        products.map(p => p.inventoryId === adjustmentItem.id && p.stock > newStock
          ? { ...p, stock: newStock, updatedAt: new Date().toISOString() }
          : p
        )
      ));
    }

    // Audit log entry
    // TODO: MongoDB — POST /api/audit-logs
    const logs = JSON.parse(localStorage.getItem('pmp_inventory_logs')||'[]');
    logs.push({
      id: Date.now(), inventoryId: adjustmentItem.id, itemName: adjustmentItem.name,
      category: adjustmentItem.category, type: 'stock-out', reason,
      quantity: -quantity, stockBefore: adjustmentItem.stockQty, stockAfter: newStock,
      batchId, sellingPrice: reason==='sales-outside' ? sellingPrice : null,
      saleDate: reason==='sales-outside' ? saleDate : null,
      customerName: reason==='sales-outside' ? customerName : null,
      remarks, createdAt: new Date().toISOString(),
    });
    localStorage.setItem('pmp_inventory_logs', JSON.stringify(logs));

    // Sales record (only for manual sales)
    // TODO: MongoDB — POST /api/sales
    if (reason === 'sales-outside') {
      const salesData = JSON.parse(localStorage.getItem('pmp_sales')||'[]');
      salesData.push({
        id: Date.now(), inventoryId: adjustmentItem.id, batchId,
        productName: adjustmentItem.name, category: adjustmentItem.category,
        quantity, unitPrice: 0, totalPrice: sellingPrice, orderDate: saleDate,
        customerName: customerName || `Walk-in-${Date.now()}`,
        customerContact: 'N/A', customerEmail: 'N/A',
        source: 'manual', status: 'completed', balance: 0,
        cost: (batchData?.unitCost || adjustmentItem.averageCost || 0) * quantity,
        notes: 'Manual sale outside system', createdAt: new Date().toISOString(),
      });
      localStorage.setItem('pmp_sales', JSON.stringify(salesData));
    }

    setShowAdjustmentModal(false); setAdjustmentItem(null);
  };

  // TODO: MongoDB — Wrap in transaction: update inventory + create batch + add stock history + audit log
  const handleStockAddition = (data) => {
    if (!additionItem) return;
    const { quantity, supplierId, supplierName, unitCost, totalCost, batchData } = data;
    const currentStock = additionItem.stockQty;
    const currentAvg = additionItem.averageCost || 0;
    const newTotal = currentStock + quantity;
    const newAvg = newTotal > 0 ? ((currentStock * currentAvg) + (quantity * unitCost)) / newTotal : unitCost;

    setInventory(prev => prev.map(i => i.id === additionItem.id ? { ...i, stockQty: i.stockQty + quantity, lastSupplierId: supplierId, lastSupplierName: supplierName, lastUnitCost: unitCost, averageCost: newAvg, batches: batchData ? [...(i.batches||[]), batchData] : i.batches, updatedAt: new Date().toISOString() } : i));

    // Stock history entry
    // TODO: MongoDB — POST /api/stock-history
    addStockHistory({ inventoryId: additionItem.id, batchId: batchData?.batchId, itemName: additionItem.name, category: additionItem.category, supplierId: supplierId||null, supplierName, quantity: batchData?.originalQty||quantity, goodQty: batchData?.goodQty||quantity, damagedQty: batchData?.damagedQty||0, unitCost, totalCost, reason: 'restock', stockBefore: currentStock, stockAfter: newTotal, averageCostAfter: newAvg, type: 'received', remainingQty: batchData?.goodQty||quantity, dateReceived: batchData?.dateReceived||new Date().toISOString() });

    // Audit log
    // TODO: MongoDB — POST /api/audit-logs
    const logs = JSON.parse(localStorage.getItem('pmp_inventory_logs')||'[]');
    logs.push({ id: Date.now(), batchId: batchData?.batchId, inventoryId: additionItem.id, itemName: additionItem.name, category: additionItem.category, type: 'stock-in', reason: 'restock', quantity, stockBefore: currentStock, stockAfter: newTotal, supplierId, supplierName, unitCost, totalCost, createdAt: new Date().toISOString() });
    localStorage.setItem('pmp_inventory_logs', JSON.stringify(logs));

    setShowAdditionModal(false); setAdditionItem(null);
  };

  // Handle save from modal (shows confirm first)
  // TODO: MongoDB — POST /api/inventory or PUT /api/inventory/:id
  const handleSave = (itemData) => {
    // SKU: for new items, use the preview generated in modal. For edits, keep existing.
    const finalSKU = editingItem ? editingItem.sku : (itemData.sku || generateSKU(itemData.category, itemData.name));
    setPendingItemData({ ...itemData, id: editingItem ? editingItem.id : crypto.randomUUID(), sku: finalSKU, isActive: true });
    setIsConfirmModalOpen(true);
  };

  const handleConfirmSave = () => {
    if (!pendingItemData) return;
    if (editingItem) {
      setInventory(prev => prev.map(i => i.id === pendingItemData.id ? { ...i, ...pendingItemData, updatedAt: new Date().toISOString() } : i));
    } else {
      // Build initial batch if has stock + invoice
      let batches = [];
      const initStock = parseInt(pendingItemData.initialStock)||0;
      const damaged = parseInt(pendingItemData.damagedOnArrival)||0;
      if (initStock > 0 && pendingItemData.invoiceNumber) {
        const d = new Date(pendingItemData.deliveryDate);
        const batchId = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
        const goodQty = initStock - damaged;
        batches = [{ batchId, supplierId: pendingItemData.lastSupplierId||null, supplierName: pendingItemData.lastSupplierName||'General Merchandise', invoiceNumber: pendingItemData.invoiceNumber, dateReceived: pendingItemData.deliveryDate, originalQty: initStock, goodQty, damagedQty: damaged, remainingQty: goodQty, unitCost: parseFloat(pendingItemData.unitCost)||0, totalCost: initStock*(parseFloat(pendingItemData.unitCost)||0), notes: pendingItemData.notes||'', receiptImage: pendingItemData.receiptImage||null, movements: [{ type: 'received', quantity: goodQty, remainingAfter: goodQty, reason: 'Initial stock addition', createdAt: new Date().toISOString() }], status: 'active' }];

        // Create initial stock history entry
        // TODO: MongoDB — POST /api/stock-history
        addStockHistory({ inventoryId: pendingItemData.id, batchId, itemName: pendingItemData.name, category: pendingItemData.category, supplierId: pendingItemData.lastSupplierId||null, supplierName: pendingItemData.lastSupplierName||'General Merchandise', quantity: initStock, goodQty, damagedQty: damaged, unitCost: parseFloat(pendingItemData.unitCost)||0, totalCost: initStock*(parseFloat(pendingItemData.unitCost)||0), reason: 'initial', stockBefore: 0, stockAfter: goodQty, averageCostAfter: parseFloat(pendingItemData.unitCost)||0, type: 'received', remainingQty: goodQty, dateReceived: pendingItemData.deliveryDate, invoiceNumber: pendingItemData.invoiceNumber });
      }

      setInventory(prev => [...prev, { ...pendingItemData, batches, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
    }

    setIsConfirmModalOpen(false);
    setIsModalOpen(false);
    setEditingItem(null);
    setPendingItemData(null);
  };

  // Inline min stock level editing
  const handleInlineEditStart = (item) => setEditingInline({ id: item.id, value: String(item.minStockLevel) });
  const handleInlineEditSave = () => {
    if (!editingInline) return;
    setInventory(prev => prev.map(i => i.id === editingInline.id ? { ...i, minStockLevel: parseInt(editingInline.value)||0 } : i));
    setEditingInline(null);
  };

  const getStockStatus = (item) => {
    if (item.stockQty === 0) return { label: 'Out of Stock', cls: 'stock-status-out' };
    if (item.stockQty <= item.minStockLevel) return { label: 'Low Stock', cls: 'stock-status-low' };
    return { label: 'In Stock', cls: 'stock-status-ok' };
  };

  if (!isLoaded) return (
    <div className="page-content-wrapper">
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <p>Loading inventory...</p>
      </div>
    </div>
  );

  return (
    <div className="page-content-wrapper">

      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Inventory</h1>
            <p className="page-subtitle">Physical stocked items only. Upon Order products are managed in Add Product.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-primary" onClick={() => setShowMasterlistModal(true)}>
Item Masterlist
            </button>
            <button type="button" className="btn-primary" onClick={() => setShowManageSuppliersModal(true)}>
              Suppliers
            </button>
            <button type="button" className="btn-primary" onClick={handleAddNew}>
              <span className="btn-icon">+</span> Add New Item
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="inventory-summary">
          {[
            { label: 'Active Items', value: activeItems, filter: '', cls: '' },
            { label: 'Low Stock', value: lowStockItems, filter: 'low-stock', cls: 'summary-card-warning' },
            { label: 'Out of Stock', value: outOfStockItems, filter: 'out-of-stock', cls: 'summary-card-danger' },
          ].map(({ label, value, filter, cls }) => (
            <div key={label} className={`summary-card${cls?' '+cls:''}${statusFilter===filter?' active':''}`}
              onClick={() => setStatusFilter(statusFilter===filter?'':filter)} style={{ cursor: 'pointer' }}>
              <div className="summary-content">
                <span className="summary-value">{value}</span>
                <span className="summary-label">{label}</span>
              </div>
            </div>
          ))}
          {archivedCount > 0 && (
            <div className={`summary-card${showArchived?' active':''}`}
              onClick={() => setShowArchived(p => !p)}
              style={{ cursor: 'pointer', background: showArchived ? 'rgba(100,100,100,0.2)' : 'rgba(100,100,100,0.1)', border: showArchived ? '1px solid var(--gray)' : '1px solid rgba(100,100,100,0.3)' }}>
              <div className="summary-content">
                <span className="summary-value" style={{ color: 'var(--gray)' }}>{archivedCount}</span>
                <span className="summary-label" style={{ color: 'var(--gray)' }}>Archived</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="inventory-toolbar">
        <div className="search-wrapper">
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input type="text" className="search-input" placeholder="Search by name or category..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>}
        </div>
        <div className="inventory-legend">
          <span className="legend-item"><span className="legend-dot legend-dot-low"></span>Low Stock</span>
          <span className="legend-item"><span className="legend-dot legend-dot-out"></span>Out of Stock</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ WebkitOverflowScrolling: 'touch', border: '1px solid var(--border)', borderRadius: '10px', width: '0', minWidth: '100%', display: 'block', overflowX: 'auto', marginBottom: '1rem' }}>
        {filteredInventory.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            </div>
            <h3 className="empty-title">
              {searchQuery ? 'No items found' : statusFilter === 'out-of-stock' ? 'No Out of Stock Items' : statusFilter === 'low-stock' ? 'No Low Stock Items' : 'No Inventory Items'}
            </h3>
            <p className="empty-description">
              {searchQuery ? 'Try adjusting your search.' : statusFilter ? `No items match the "${statusFilter}" filter.` : 'Add your first physical inventory item.'}
            </p>
            {!searchQuery && !statusFilter && <button className="btn-primary" onClick={handleAddNew}>Add First Item</button>}
          </div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th style={{ width: '28px' }}></th>
                <th className="table-col-name">Product Name</th>
                <th className="table-col-category">Category</th>
                <th className="table-col-cost">Cost</th>
                <th className="table-col-price">Selling Price</th>
                <th className="table-col-tiers">Tiers</th>
                <th className="table-col-stock">Current Stock</th>
                <th className="table-col-min">Min. Level</th>
                <th className="table-col-status">Status</th>
                <th className="table-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map(item => {
                const status = getStockStatus(item);
                const isExpanded = expandedRows.has(item.id);
                return (
                  <React.Fragment key={item.id}>
                    <tr className="inventory-table-row">
                      <td style={{ width: '28px', cursor: 'pointer' }} onClick={() => toggleExpand(item.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ color: 'var(--gray)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'block' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </td>
                      <td className="table-cell-name">
                        <span className="product-name">{item.name}</span>
                        <div style={{ fontSize: '0.73rem', color: 'var(--gray)', marginTop: '0.15rem', fontFamily: 'monospace' }}>SKU: {item.sku||'—'}</div>
                      </td>
                      <td className="table-cell"><span className="category-badge">{item.category}</span></td>
                      <td className="table-cell" style={{ textAlign: 'center' }}>
                        {item.baseCost ? (
                          <span style={{ color: 'var(--gray)', fontWeight: 500 }}>{formatPrice(item.baseCost)}</span>
                        ) : (
                          <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td className="table-cell" style={{ textAlign: 'center' }}>
                        {item.sellingPrice ? (
                          <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{formatPrice(item.sellingPrice)}</span>
                        ) : (
                          <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td className="table-cell" style={{ textAlign: 'center' }}>
                        {item.priceTiers && item.priceTiers.length > 0 ? (
                          <span style={{ color: 'var(--gold)', background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', padding: '0.2rem 0.5rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600 }}>
                            🏷️ {item.priceTiers.length} tiers
                          </span>
                        ) : (
                          <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td className="table-cell-stock" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <button className="btn-sm btn-secondary"
                            onClick={() => { setAdjustmentItem(item); setShowAdjustmentModal(true); }}
                            disabled={item.stockQty === 0}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: '1' }}
                            title="Reduce stock (sale or damaged)">−</button>
                          <span className={`stock-value-inline${item.stockQty===0?' stock-value-zero':''}`}
                            style={{ minWidth: '40px', display: 'inline-block', textAlign: 'center' }}>
                            {item.stockQty}
                          </span>
                          <button className="btn-sm btn-secondary"
                            onClick={() => { setAdditionItem(item); setShowAdditionModal(true); }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: '1' }}
                            title="Add stock (restock)">+</button>
                        </div>
                      </td>
                      <td className="table-cell">
                        {editingInline?.id === item.id ? (
                          <IntegerInput className="form-input-inline" value={editingInline.value}
                            onChange={e => setEditingInline(p => ({ ...p, value: e.target.value }))}
                            onBlur={handleInlineEditSave}
                            onKeyDown={e => { if (e.key==='Enter') handleInlineEditSave(); if (e.key==='Escape') setEditingInline(null); }}
                            min={0} autoFocus />
                        ) : (
                          <span className="min-stock-value-inline" onClick={() => handleInlineEditStart(item)} title="Click to edit">{item.minStockLevel}</span>
                        )}
                      </td>
                      <td className="table-cell"><span className={`stock-status-badge ${status.cls}`}>{status.label}</span></td>
                      <td className="table-cell-actions">
                        <button onClick={() => handleEdit(item)} style={{ background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => handleDelete(item)} style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Remove</button>
                      </td>
                    </tr>
                    {isExpanded && <InventoryExpandRow item={item} colSpan={10} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Archived section */}
      {showArchived && archivedInventory.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '1rem' }}>Archived Items ({archivedInventory.length})</h2>
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th className="table-col-name">Product Name</th>
                  <th className="table-col-category">Category</th>
                  <th className="table-col-stock">Last Stock</th>
                  <th className="table-col-status">Archived Date</th>
                  <th className="table-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedInventory.map(item => {
                  const hasProducts = JSON.parse(localStorage.getItem('pmp_products')||'[]').some(p => p.inventoryId===item.id);
                  const hasSales = JSON.parse(localStorage.getItem('pmp_sales')||'[]').some(s => s.inventoryId===item.id);
                  return (
                    <tr key={item.id} className="inventory-table-row" style={{ opacity: 0.5 }}>
                      <td className="table-cell-name"><span className="product-name" style={{ color: 'var(--gray)' }}>{item.name}</span><div style={{ fontSize: '0.73rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{item.sku||'—'}</div></td>
                      <td className="table-cell"><span className="category-badge" style={{ background: 'rgba(100,100,100,0.2)', color: 'var(--gray)' }}>{item.category}</span></td>
                      <td className="table-cell"><span style={{ color: 'var(--gray)' }}>{item.stockQty} pcs</span></td>
                      <td className="table-cell"><span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>{item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : '—'}</span></td>
                      <td className="table-cell-actions">
                        <button onClick={() => setRestoreItem(item)} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>Restore</button>
                        {!hasProducts && !hasSales && <button onClick={() => handleDelete(item)} style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: '1rem', color: 'var(--gray)', fontSize: '0.875rem', fontStyle: 'italic' }}>
            Items with sales history or linked products cannot be permanently deleted to preserve data integrity.
          </p>
        </div>
      )}

      {/* ── All Modals ─────────────────────────────────────────────────────────── */}

      <InventoryModal key={modalKey} isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingItem(null); }}
        onSave={handleSave} onEdit={(existing) => { setEditingItem(existing); setIsModalOpen(true); }}
        onRestoreItem={handleRestore} item={editingItem} editingItem={editingItem}
        categories={categories} onAddCategory={handleAddCategory}
        inventory={inventory} suppliers={suppliers} onAddSupplier={handleAddSupplier}
        masterlist={masterlist} />

      <ConfirmSaveModal isOpen={isConfirmModalOpen} onClose={() => { setIsConfirmModalOpen(false); setPendingItemData(null); }}
        onConfirm={handleConfirmSave} itemData={pendingItemData} isEdit={!!editingItem} />

      <ArchiveConfirmModal isOpen={showArchiveModal}
        onClose={() => { setShowArchiveModal(false); setArchiveItem(null); setReferencingProducts([]); setHasSalesHistory(false); }}
        onArchive={handleArchive} onDelete={handlePermanentDelete}
        itemName={archiveItem?.name} isReferenced={referencingProducts.length > 0}
        referencingProductsCount={referencingProducts.length} hasSalesHistory={hasSalesHistory} />

      <ConfirmModal isOpen={!!restoreItem} onClose={() => setRestoreItem(null)}
        onConfirm={() => { handleRestore(restoreItem); setRestoreItem(null); }}
        title="Restore Item" confirmLabel="Restore"
        message={`Restore "${restoreItem?.name}" from archive? It will be available for use again.`} />

      <StockReductionModal isOpen={showAdjustmentModal}
        onClose={() => { setShowAdjustmentModal(false); setAdjustmentItem(null); }}
        onConfirm={handleStockReduction} item={adjustmentItem} inventory={inventory} />

      <StockAdditionModal isOpen={showAdditionModal}
        onClose={() => { setShowAdditionModal(false); setAdditionItem(null); }}
        onConfirm={handleStockAddition} item={additionItem}
        suppliers={suppliers} categories={categories} onAddSupplier={handleAddSupplier} />

      {/* Item Masterlist Modal */}
      {/* TODO: MongoDB — onSave triggers POST/PUT/DELETE /api/masterlist/* */}
      <ItemMasterlistModal
        isOpen={showMasterlistModal}
        onClose={() => setShowMasterlistModal(false)}
        masterlist={masterlist}
        onSave={handleSaveMasterlist}
        inventory={inventory} />

      <ManageSuppliersModal isOpen={showManageSuppliersModal} onClose={() => setShowManageSuppliersModal(false)}
        suppliers={suppliers} categories={categories} inventory={inventory}
        onAdd={(data) => { const s = handleAddSupplier(data); const updated = [...suppliers, s]; setSuppliers(updated); saveSuppliers(updated); }}
        onUpdate={(id, data) => { const updated = suppliers.map(s => s.id===id?{...s,...data}:s); setSuppliers(updated); saveSuppliers(updated); }}
        onDelete={(id) => { const updated = suppliers.filter(s => s.id!==id); setSuppliers(updated); saveSuppliers(updated); }} />

      <BatchDetailsModal batch={selectedBatch} item={selectedBatchItem}
        isOpen={showBatchDetailsModal}
        onClose={() => { setShowBatchDetailsModal(false); setSelectedBatch(null); setSelectedBatchItem(null); }} />



    </div>
  );
}