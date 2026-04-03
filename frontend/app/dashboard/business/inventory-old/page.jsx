'use client';

/**
 * INVENTORY MANAGEMENT PAGE
 *
 * Current Status: LocalStorage (Browser-only, for testing)
 * ⚠️ TODO: MongoDB Integration
 *
 * ⚠️ HYBRID INVENTORY MODEL:
 * - Inventory tracks physical stock (can be 0)
 * - Products with allowBackorder=true can be sold even at 0 stock
 * - Storefront shows ALL active products from Masterlist
 * - Storefront button logic:
 *   • stockQty > 0 → "Add to Cart" (Ready to ship)
 *   • stockQty = 0 + allowBackorder → "Pre-Order" (3-5 days)
 *   • stockQty = 0 + !allowBackorder → "Out of Stock"
 *
 * MongoDB Document Shape:
 * {
 *   _id:              ObjectId,
 *   sku:              String (unique, indexed),
 *   name:             String (required),
 *   category:         String (required),
 *   stockQty:         Number (good stock, min: 0),
 *   damagedQty:       Number (reference only),
 *   minStockLevel:    Number (reorder threshold, default: 10),
 *   averageCost:      Number (weighted moving average),
 *   lastUnitCost:     Number,
 *   lastSupplierId:   String | null,
 *   lastSupplierName: String,
 *   batches:          Array<Batch>,
 *   allowBackorder:   Boolean (can sell even if 0 stock),
 *   isActive:         Boolean (soft delete),
 *   deletedAt:        Date | null,
 *   createdAt:        Date,
 *   updatedAt:        Date,
 * }
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatNumber, formatPrice, formatSmart, formatPriceSmart } from '../../../../src/utils/format';
import AddInventoryItemModal from './AddInventoryItemModal';
import StockAdditionModal from './StockAdditionModal';
import StockReductionModal from './StockReductionModal';
import { NestedInventoryTable } from './NestedInventoryTable';
import { StockOutTable } from './StockOutTable';
import { SupplierDetailsModal, ManageSuppliersModal } from './SupplierDetails';

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

// ── Helper: Sanitize number input (from products/add) ─────────────────────────
const sanitizeNumber = (val) => {
  if (val === '') return '';
  const num = parseFloat(val);
  return isNaN(num) || num < 0 ? '0' : val;
};

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[['Original', `${batch.originalQty} pcs`, 'var(--white)'],
              ['Initial Good', `${batch.goodQty||batch.originalQty} pcs`, '#4ade80'],
              ['Damaged', `${batch.damagedQty||0} pcs`, '#f87171'],
              ['Stock Out', `${totalSold} pcs`, '#6366f1'],
              ['Remaining', `${batch.remainingQty||0} pcs`, '#facc15'],
            ].map(([l,v,c]) => (
              <div key={l} style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{l}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: c }}>{v}</div>
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
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', padding: '0.6rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                <strong style={{ color: 'var(--white)' }}>{batches.length}</strong> batch{batches.length !== 1 ? 'es' : ''}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                Remaining: <strong style={{ color: '#4ade80' }}>{totalRemaining} pcs</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                Stock Value: <strong style={{ color: 'var(--gold)' }}>{formatPrice(totalValue)}</strong>
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ color: '#E5E2E1' }}>●</span> Initial Good
                <span style={{ color: '#E5E2E1' }}>●</span> Damaged
                <span style={{ color: '#E5E2E1' }}>●</span> Stock Out (Sold/Used)
                <span style={{ color: '#E5E2E1' }}>●</span> Remaining
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
                      { label: 'Initial Good', align: 'center' },
                      { label: 'Damaged', align: 'center' },
                      { label: 'Stock Out', align: 'center' },
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
                    const stockOutQty = Math.max(0, goodQty - (batch.remainingQty || 0) - damagedQty);

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

                        {/* Good / Initial Good */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#E5E2E1' }}>
                          {goodQty} pcs
                        </td>

                        {/* Damaged */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#E5E2E1' }}>
                          {damagedQty > 0 ? `${damagedQty} pcs` : '0'}
                        </td>

                        {/* Stock Out — Sold/Used */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#E5E2E1' }}>
                          {stockOutQty > 0 ? `${stockOutQty} pcs` : '0'}
                        </td>

                        {/* Remaining — Clickable for movement details */}
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#E5E2E1' }}>
                          <button
                            onClick={() => window.dispatchEvent(new CustomEvent('openBatchDetails', { detail: { batch, item } }))}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#E5E2E1', fontWeight: 700, fontSize: '0.8rem', textDecoration: (batch.movements?.length || 0) > 0 ? 'underline' : 'none', textDecorationColor: '#E5E2E1' }}
                            title={(batch.movements?.length || 0) > 0 ? 'Click to view movement history' : 'No movement history'}
                          >
                            {batch.remainingQty || 0} pcs
                          </button>
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
  const [hasChanges, setHasChanges] = useState(false); // Track if form has changes for Update button

  // Pricing state (Fixed/Tiered/Inquiry)
  const [priceType, setPriceType] = useState('fixed'); // 'fixed' | 'tiered' | 'inquiry'
  const [fixedPrice, setFixedPrice] = useState('');
  const [priceTiers, setPriceTiers] = useState([]);
  const [tierInput, setTierInput] = useState({ min: '', max: '', price: '' });
  const [groupChecks, setGroupChecks] = useState({}); // For variant grouping in pricing
  
  // Store original values for change detection (Update button)
  const [originalProd, setOriginalProd] = useState(null);
  
  // Helper to create new variant type
  const createVariantType = (name, options = [], isStockable = true) => ({
    id: `vt-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    name,
    options,
    isStockable,  // NEW: Checkbox to track if variant type is stockable
  });

  useEffect(() => {
    if (isOpen) {
      setLocalList(masterlist.map(c => ({ ...c, products: (c.products||[]).map(p => ({ ...p })) })));
      setSearch('');
      setFormMode(null);
      setExpandedCats(new Set()); // collapse all by default
    }
  }, [isOpen, masterlist]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  
  // Check if form is valid (for Add button)
  const isFormValid = () => {
    if (!formName.trim()) return false;

    // Categories don't need variant types or pricing
    if (formMode.includes('cat')) {
      return true;
    }

    // If has variant types, each must have at least 1 option
    if (formVariantTypes.length > 0) {
      const hasEmptyType = formVariantTypes.some(vt => !vt.options || vt.options.length === 0);
      if (hasEmptyType) return false;
    }

    // Pricing validation (products only)
    if (priceType === 'fixed' && !fixedPrice) return false;
    if (priceType === 'tiered' && priceTiers.length === 0) return false;

    return true;
  };
  
  // Check if form has changes (for Update button)
  const hasFormChanges = () => {
    if (!originalProd) return true; // No original to compare, allow save
    
    const nameChanged = formName !== originalProd.name;
    const variantTypesChanged = JSON.stringify(formVariantTypes) !== JSON.stringify(originalProd.variantTypes);
    const priceTypeChanged = priceType !== originalProd.priceType;
    const fixedPriceChanged = priceType === 'fixed' && fixedPrice !== originalProd.flatPrice;
    const tierPriceChanged = priceType === 'tiered' && JSON.stringify(priceTiers) !== JSON.stringify(originalProd.priceTiers);
    
    return nameChanged || variantTypesChanged || priceTypeChanged || fixedPriceChanged || tierPriceChanged;
  };

  // Generate all SKU combinations from variant types
  const generateSkuCombinations = (variantTypes, categoryName, productName) => {
    if (!variantTypes || variantTypes.length === 0) return [];

    // NEW: Filter only stockable variant types (isStockable !== false)
    const stockableTypes = (variantTypes || []).filter(vt => vt.isStockable !== false);

    // If no stockable types, return empty (no SKU needed for non-stockable items)
    if (stockableTypes.length === 0) return [];

    const combinations = [[]];
    for (const variantType of stockableTypes) {
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
      // Generate unique SKU suffix from variant options
      // e.g., "Red" → RED, "Red Violet" → REDVIO, "11oz" → 11O
      const skuSuffix = combo.map(opt => {
        // Remove non-alphanumeric and convert to uppercase
        const cleanOpt = opt.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        // For multi-word options, take first 3 letters of each word
        // e.g., "Red Violet" → "RED" + "VIO" = REDVIO
        const words = opt.split(/[\s-]+/).filter(w => w.length > 0);
        if (words.length > 1) {
          return words.map(w => w.substring(0, 3).toUpperCase()).join('');
        }
        // Single word: use first 3 letters (or full word if shorter)
        return cleanOpt.substring(0, Math.min(6, cleanOpt.length));
      }).join('-');

      const variantName = combo.join(' - ');

      // Category prefix: first 3 letters
      const catPrefix = categoryName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();

      // Product prefix: first letter of each word (up to 4 words)
      const prodPrefix = productName
        .split(' ')
        .filter(w => w.length > 0)
        .map(w => w.charAt(0).toUpperCase())
        .slice(0, 4)
        .join('');

      return {
        sku: `${catPrefix}-${prodPrefix}-${skuSuffix}`,  // STI-VSW-GLO or STI-VSWL-GLO
        name: `${productName} ${variantName}`,
        category: categoryName,
        variants: combo,
        isTracked: true  // This is a stockable SKU
      };
    });
  };

  const getLinkedInventoryCount = (catName, prodName) =>
    inventory.filter(i => {
      if (i.isActive === false) return false;
      if (i.category !== catName) return false;
      // Check if inventory name contains the product name (flexible match)
      // e.g., "Inner Color Mugs Purple - 11oz" contains "Inner Color Mugs"
      return i.name.includes(prodName) || prodName.includes(i.name);
    }).length;

  const getCatProductCount = (catId) =>
    (localList.find(c => c.id === catId)?.products || []).length;

  // Returns total linked inventory items across ALL products in this category
  // Used to lock Edit + Delete on category level
  const getCatLinkedCount = (cat) =>
    (cat.products || []).reduce((sum, prod) => sum + getLinkedInventoryCount(cat.name, prod.name), 0);

  // Check if a specific variant option is in use by any inventory items
  const isOptionInUse = (catName, prodName, variantTypeName, optionValue) => {
    return inventory.some(item => {
      if (item.isActive === false) return false;
      if (item.category !== catName) return false;
      if (!item.name.includes(prodName)) return false;
      
      // Check if item's variantCombo uses this specific option
      if (item.variantCombo) {
        const comboValue = item.variantCombo[variantTypeName];
        if (comboValue === optionValue) return true;
      }
      return false;
    });
  };

  // ── Category actions ───────────────────────────────────────────────────────
  const startAddCat = () => {
    setFormMode('add-cat'); setFormCatId(null);
    setFormName(''); setFormVariantTypes([]);
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
    setFormName(cat.name); setFormVariantTypes([]);
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
    
    // Store original values for change detection
    setOriginalProd({
      name: prod.name,
      variantTypes: prod.variantTypes || [],
      priceType: prod.priceType || 'fixed',
      flatPrice: prod.flatPrice || '',
      priceTiers: prod.priceTiers || []
    });
    setHasChanges(false); // No changes yet

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
    const newVariantType = createVariantType(name, []);  // All types are tracked by default
    setFormVariantTypes(prev => [...prev, newVariantType]);
    setVariantTypeInput('');
  };

  const removeVariantType = (index) => {
    // Check if product is linked to inventory
    if (editingLinked) {
      setInfoModal({
        title: 'Cannot Remove Variant Type',
        message: `This product is linked to active inventory items. Removing variant types will break existing stock tracking. Please archive all linked inventory items first before removing variant types.`
      });
      return;
    }
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
    const vt = formVariantTypes[typeIndex];
    const option = vt.options[optionIndex];
    
    // Check if THIS SPECIFIC option is in use
    const inUse = isOptionInUse(
      localList.find(c => c.id === formCatId)?.name,
      formName,
      vt.name,
      option
    );
    
    if (inUse) {
      setInfoModal({
        title: 'Cannot Remove Option',
        message: `"${option}" is used by active inventory items. Remove or archive those inventory items first before removing this option.`
      });
      return;
    }
    
    // Option not in use - can remove
    const updated = [...formVariantTypes];
    updated[typeIndex].options.splice(optionIndex, 1);
    setFormVariantTypes(updated);
  };

  // Calculate total combinations (only stockable variant types)
  const getTotalCombinations = () => {
    if (formVariantTypes.length === 0) return 0;
    // Filter only stockable types
    const stockableTypes = formVariantTypes.filter(vt => vt.isStockable !== false);
    if (stockableTypes.length === 0) return 0;
    return stockableTypes.reduce((total, vt) => {
      if (vt.options.length === 0) return total;
      return total * vt.options.length;
    }, 1);
  };

  // ── Form submit ────────────────────────────────────────────────────────────
  const handleFormSubmit = () => {
    // This should not be called if button is disabled, but just in case
    if (!formName.trim()) return;
    if (formMode.includes('prod') && formVariantTypes.length > 0) {
      const hasEmptyType = formVariantTypes.some(vt => !vt.options || vt.options.length === 0);
      if (hasEmptyType) return;
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
            {formMode.includes('prod') && formName.trim() && (
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label className="form-label">
                  Variant Types
                  <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional — e.g., Capacity, Color, Size)</span>
                </label>
                <p className="form-hint" style={{ marginBottom: '1rem' }}>
                  Define product variations. All variant types will be included in SKU generation and stock tracking.
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
                                onChange={e => {
                                  const updated = [...formVariantTypes];
                                  updated[typeIdx] = { ...updated[typeIdx], isStockable: e.target.checked };
                                  setFormVariantTypes(updated);
                                }}
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
                            onClick={() => {
                              // Check if ANY option in this type is in use
                              const hasInUseOption = formVariantTypes[typeIdx].options.some(opt =>
                                isOptionInUse(
                                  localList.find(c => c.id === formCatId)?.name,
                                  formName,
                                  formVariantTypes[typeIdx].name,
                                  opt
                                )
                              );

                              if (hasInUseOption) {
                                setInfoModal({
                                  title: 'Cannot Remove Variant Type',
                                  message: `This variant type has options that are used by active inventory items. Remove all options first or archive the linked inventory items.`
                                });
                                return;
                              }
                              removeVariantType(typeIdx);
                            }}
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
                            {vt.options.map((opt, optIdx) => {
                              // Check if THIS specific option is in use
                              const optionInUse = isOptionInUse(
                                localList.find(c => c.id === formCatId)?.name,
                                formName,
                                vt.name,
                                opt
                              );
                              
                              return (
                                <span key={optIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', background: optionInUse ? 'rgba(212,168,67,0.12)' : 'rgba(100,100,100,0.12)', border: optionInUse ? '1px solid rgba(212,168,67,0.35)' : '1px solid rgba(100,100,100,0.35)', borderRadius: '20px', fontSize: '0.8rem', color: optionInUse ? 'var(--gold, #D4A843)' : '#9ca3af', fontWeight: 500 }}>
                                  {opt}
                                  {!optionInUse && (
                                    <button type="button" onClick={() => removeVariantOption(typeIdx, optIdx)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                    </button>
                                  )}
                                  {optionInUse && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--gold, #D4A843)' }}>
                                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                    </svg>
                                  )}
                                </span>
                              );
                            })}
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
                          <input
                            type="text"
                            inputMode="decimal"
                            className="tier-input"
                            value={fixedPrice}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                const numVal = parseFloat(val) || 0;
                                if (numVal <= 999999.99) {
                                  setFixedPrice(val);
                                }
                              }
                            }}
                            placeholder="0"
                            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#E5E2E1', fontSize: '0.95rem', fontWeight: 600 }}
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
                      <div className="tier-table-wrap" style={{ marginTop: '1rem' }}>
                        <table className="tier-table">
                          <thead>
                            <tr>
                              <th>Tier</th>
                              <th>Min Qty</th>
                              <th>Max Qty</th>
                              <th>Price (₱)</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const tiersToShow = priceTiers.length > 0 ? priceTiers : [{ id: 'tier-1', min: 1, max: '', price: '' }];
                              return tiersToShow.map((tier, idx) => (
                                <tr key={tier.id || idx}>
                                  <td><span className="tier-badge">Tier {idx + 1}</span></td>
                                  <td>
                                    <FormattedIntegerInput
                                      className="tier-input"
                                      value={tier.min}
                                      onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        if (val === '' || (parseInt(val) >= 1 && parseInt(val) <= 999999)) {
                                          if (priceTiers.length === 0) {
                                            setPriceTiers([{ id: 'tier-1', min: val, max: '', price: '' }]);
                                          } else {
                                            const newTiers = [...priceTiers];
                                            newTiers[idx] = { ...tier, min: val };
                                            setPriceTiers(newTiers);
                                          }
                                        }
                                      }}
                                      min={1}
                                      max={999999}
                                      placeholder="1"
                                    />
                                  </td>
                                  <td>
                                    <FormattedIntegerInput
                                      className="tier-input"
                                      value={tier.max}
                                      onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        if (val === '' || (parseInt(val) >= (tier.min || 1) && parseInt(val) <= 999999)) {
                                          if (priceTiers.length === 0) {
                                            setPriceTiers([{ id: 'tier-1', min: 1, max: val, price: '' }]);
                                          } else {
                                            const newTiers = [...priceTiers];
                                            newTiers[idx] = { ...tier, max: val };
                                            setPriceTiers(newTiers);
                                          }
                                        }
                                      }}
                                      min={tier.min || 1}
                                      max={999999}
                                      placeholder="∞"
                                    />
                                  </td>
                                  <td>
                                    <div className="tier-price-cell">
                                      <span className="peso">₱</span>
                                      <FormattedDecimalInput
                                        className="tier-input"
                                        value={tier.price}
                                        onChange={e => {
                                          const val = e.target.value.replace(/[^0-9.]/g, '');
                                          const parts = val.split('.');
                                          if (parts.length <= 2 && parts[1]?.length <= 2) {
                                            const numVal = parseFloat(val) || 0;
                                            if (numVal <= 999999.99) {
                                              if (priceTiers.length === 0) {
                                                setPriceTiers([{ id: 'tier-1', min: 1, max: '', price: val }]);
                                              } else {
                                                const newTiers = [...priceTiers];
                                                newTiers[idx] = { ...tier, price: val };
                                                setPriceTiers(newTiers);
                                              }
                                            }
                                          }
                                        }}
                                        placeholder="0"
                                        max={999999.99}
                                      />
                                    </div>
                                  </td>
                                  <td>
                                    {priceTiers.length > 0 && (
                                      <button
                                        type="button"
                                        className="btn-remove-tier"
                                        onClick={() => {
                                          const newTiers = priceTiers.filter((_, i) => i !== idx);
                                          setPriceTiers(newTiers);
                                        }}
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                        {priceTiers.length < 10 && (
                          <button
                            type="button"
                            className="add-tier-btn"
                            onClick={() => {
                              const newTier = {
                                id: `tier-${Date.now()}`,
                                min: priceTiers.length > 0 ? (parseInt(priceTiers[priceTiers.length - 1].max) || 1) + 1 : 1,
                                max: '',
                                price: ''
                              };
                              setPriceTiers([...priceTiers, newTier]);
                            }}
                            style={{ marginTop: '0.75rem' }}
                          >
                            Add Price Tier
                          </button>
                        )}
                        {priceTiers.length >= 10 && (
                          <p className="form-hint" style={{ marginTop: '0.5rem' }}>Maximum 10 tiers reached.</p>
                        )}
                        <p className="form-hint" style={{ marginTop: '0.75rem', marginBottom: 0 }}>Optional. Set wholesale pricing for bulk orders (e.g., 21-30 pcs = ₱90, 31-50 pcs = ₱85).</p>
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
              <button type="button" className="btn-primary" onClick={handleFormSubmit}
                disabled={formMode.startsWith('add') ? !isFormValid() : (editingLinked ? !hasFormChanges() : !isFormValid())}
                style={{ opacity: (formMode.startsWith('add') ? !isFormValid() : (editingLinked ? !hasFormChanges() : !isFormValid())) ? 0.5 : 1, cursor: (formMode.startsWith('add') ? !isFormValid() : (editingLinked ? !hasFormChanges() : !isFormValid())) ? 'not-allowed' : 'pointer' }}>
                {formMode.startsWith('add') ? 'Add' : 'Update'}
              </button>
            </div>
          </div>

        ) : (
          /* ── LIST VIEW ──────────────────────────────────────────────── */
          <>
            {/* Toolbar */}
            <div style={{ padding: '1rem 1.5rem', flexShrink: 0, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
                      <div key={cat.id} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '0.75rem 1rem' }}>

                        {/* Category header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', cursor: 'pointer' }}
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
                                    <div key={prod.id} style={{ borderRadius: '6px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                      {/* Product Row */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
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
                                              <span style={{ fontSize: '0.65rem', color: 'var(--gold, #D4A843)', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
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
                                                <span key={idx} style={{ 
                                                  fontSize: '0.68rem', 
                                                  color: vt.isStockable !== false ? 'var(--gold, #D4A843)' : 'var(--gray)', 
                                                  background: vt.isStockable !== false ? 'rgba(212,168,67,0.12)' : 'rgba(100,100,100,0.12)', 
                                                  border: vt.isStockable !== false ? '1px solid rgba(212,168,67,0.3)' : '1px solid rgba(100,100,100,0.3)', 
                                                  padding: '0.1rem 0.4rem', 
                                                  borderRadius: '12px',
                                                  fontWeight: vt.isStockable !== false ? 600 : 400
                                                }}>
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
                                        <div style={{ padding: '0.75rem 1rem 1rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                                          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 600 }}>
                                            Generated SKU Combinations ({skuCombinations.length})
                                          </div>
                                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                            {skuCombinations.map((combo, idx) => {
                                              // Check if this SKU exists in inventory
                                              const existsInInventory = inventory.some(i => i.sku === combo.sku && i.isActive !== false);
                                              
                                              return (
                                                <div key={idx} style={{ background: existsInInventory ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: '4px', padding: '0.5rem 0.6rem', fontSize: '0.75rem', border: existsInInventory ? '1px solid rgba(212,168,67,0.3)' : 'none' }}>
                                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                    <div style={{ color: existsInInventory ? '#D4A843' : 'var(--gold)', fontWeight: 600, fontFamily: 'monospace' }}>{combo.sku}</div>
                                                    {existsInInventory && (
                                                      <span style={{ fontSize: '0.6rem', color: '#D4A843', background: 'rgba(212,168,67,0.15)', padding: '0.1rem 0.3rem', borderRadius: '2px', fontWeight: 600 }}>Locked</span>
                                                    )}
                                                  </div>
                                                  <div style={{ color: 'var(--white)', fontSize: '0.7rem', marginBottom: '0.25rem' }}>{combo.name}</div>
                                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
                                                    {combo.variants.map((v, i) => (
                                                      <span key={i} style={{ fontSize: '0.65rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>{v}</span>
                                                    ))}
                                                  </div>
                                                  {existsInInventory && (
                                                    <div style={{ fontSize: '0.6rem', color: 'var(--gray)', marginTop: '0.35rem', fontStyle: 'italic' }}>
                                                      Cannot edit - has stock history
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
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

// ── Inventory Modal (Add/Edit Item) ────────────────────────────────────────────
// isOnDemand REMOVED — inventory = physical stocked items only
// FIX: minStockLevel is now editable when editing (was previously locked)
// FIX: SKU generated once and stored in state — never regenerates on re-render

// ── Confirm Save Modal ─────────────────────────────────────────────────────────
function ConfirmSaveModal({ isOpen, onClose, onConfirm, itemData, isEdit }) {
  if (!isOpen || !itemData) return null;

  const allItems = itemData._allItems || [itemData];
  const totalStock = allItems.reduce((sum, item) => sum + (item.stockQty || 0), 0);
  const totalDamaged = allItems.reduce((sum, item) => sum + (item.damagedQty || 0), 0);

  // Group items by product (category + masterlistProductName)
  const itemsByProduct = allItems.reduce((acc, item) => {
    const productKey = `${item.category}||${item.masterlistProductName || item.name}`;
    if (!acc.has(productKey)) {
      acc.set(productKey, {
        name: item.masterlistProductName || item.name,
        category: item.category,
        items: [],
        variantCombo: item.variantCombo
      });
    }
    acc.get(productKey).items.push(item);
    return acc;
  }, new Map());

  const products = Array.from(itemsByProduct.values());
  
  // Group batches by invoice number (same invoice = one batch)
  const groupedBatches = allItems.reduce((acc, item) => {
    if (item.batches && item.batches.length > 0) {
      item.batches.forEach(batch => {
        const batchKey = batch.invoiceNumber 
          ? `${batch.invoiceNumber}-${batch.supplierId || 'general'}-${batch.dateReceived}`
          : `${batch.batchId}-${batch.supplierId || 'general'}-${batch.dateReceived}`;
        
        if (!acc.has(batchKey)) {
          acc.set(batchKey, {
            batchId: batch.batchId,
            supplierName: batch.supplierName,
            invoiceNumber: batch.invoiceNumber,
            dateReceived: batch.dateReceived,
            items: [],
            totalQty: 0,
            totalCost: 0
          });
        }
        
        const existingBatch = acc.get(batchKey);
        const existingItem = existingBatch.items.find(i => i.sku === item.sku);
        
        if (existingItem) {
          existingItem.remainingQty += batch.remainingQty || 0;
          existingItem.goodQty += batch.goodQty || 0;
          existingItem.damagedQty += batch.damagedQty || 0;
        } else {
          existingBatch.items.push({
            sku: item.sku,
            variantName: item.variantCombo ? Object.values(item.variantCombo).join(' / ') : item.name,
            remainingQty: batch.remainingQty || 0,
            goodQty: batch.goodQty || 0,
            damagedQty: batch.damagedQty || 0,
            unitCost: batch.unitCost || 0,
            totalCost: (batch.remainingQty || 0) * (batch.unitCost || 0)
          });
        }
        
        existingBatch.totalQty += batch.remainingQty || 0;
        existingBatch.totalCost += batch.totalCost || 0;
      });
    }
    return acc;
  }, new Map());
  
  const batches = Array.from(groupedBatches.values());
  
  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: '#D4A843' }}>{isEdit ? 'Update Item' : 'Add Item'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {/* Product Info Cards - show separate card for each product */}
          {products.map((product, idx) => (
            <div key={idx} style={{ padding: '1rem', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '10px', marginBottom: products.length > 1 ? '0.75rem' : '1rem' }}>
              <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', marginBottom: '0.5rem' }}>{product.name}</div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--gray)', flexWrap: 'wrap', alignItems: 'center' }}>
                <span>Category: <strong style={{ color: '#D4A843' }}>{product.category}</strong></span>
                {product.items.length > 0 && (
                  <span style={{ fontFamily: 'monospace', color: 'var(--gray)' }}>SKU: {product.items[0].sku}</span>
                )}
                {product.items.length > 1 && (
                  <span style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 600, background: 'rgba(212,168,67,0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    {product.items.length} combo variant{product.items.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Summary Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ padding: '0.875rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Total Stock</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#D4A843' }}>{totalStock} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>pcs</span></div>
            </div>
            <div style={{ padding: '0.875rem', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Damaged</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F87171' }}>{totalDamaged} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>pcs</span></div>
            </div>
            <div style={{ padding: '0.875rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Min Level</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#E5E2E1' }}>{itemData.minStockLevel || 10} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>pcs</span></div>
            </div>
          </div>

          {/* Variants List with Batch Info (if multi-variant) */}
          {products.length > 1 || (products.length === 1 && products[0].items.length > 1) ? (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 600, letterSpacing: '0.08em' }}>Variants & Batch Details</div>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                {products.map((product, pIdx) => (
                  <div key={pIdx}>
                    {products.length > 1 && (
                      <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(212,168,67,0.05)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#D4A843' }}>{product.name}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{product.category}</div>
                      </div>
                    )}
                    {product.items.map((item, idx) => {
                      const batch = item.batches?.[0];
                      return (
                        <div key={item.id || idx} style={{ padding: '0.75rem', borderBottom: idx < product.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                          {/* Top row: Variant name + Stock */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <div>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E5E2E1', marginBottom: '0.25rem' }}>
                                {item.variantCombo ? Object.values(item.variantCombo).join(' / ') : item.name}
                              </div>
                              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'var(--gray)' }}>{item.sku}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#D4A843' }}>{item.stockQty || 0}</div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>pcs</div>
                            </div>
                          </div>
                          {/* Bottom row: Batch details */}
                          {batch && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', fontSize: '0.65rem' }}>
                              <div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>Batch ID</div>
                                <div style={{ fontFamily: 'monospace', color: '#D4A843', fontWeight: 600 }}>{batch.batchId}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>Supplier</div>
                                <div style={{ color: 'var(--white)' }}>{batch.supplierName || 'General'}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>Invoice</div>
                                <div style={{ color: 'var(--white)', fontFamily: 'monospace' }}>{batch.invoiceNumber || '—'}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p style={{ fontSize: '0.8rem', color: 'var(--gray)', textAlign: 'center', fontStyle: 'italic' }}>
            {isEdit ? 'This will update the inventory item.' : 'This will add a new item to your physical inventory.'}
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onConfirm} style={{ background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)', color: '#000', fontWeight: 700 }}>
            {isEdit ? 'Update Item' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Archive Confirm Modal ──────────────────────────────────────────────────────
function ArchiveConfirmModal({ isOpen, onClose, onArchive, onDelete, itemName, isReferenced, referencingProductsCount, hasSalesHistory, canHardDelete }) {
  if (!isOpen) return null;
  const mustArchive = !canHardDelete;
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
            <p className="delete-confirm-warning">This cannot be undone. This item has no linked data.</p>
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

// ── Main Inventory Page ────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingInline, setEditingInline] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);  // For future Archives modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingItemData, setPendingItemData] = useState(null);
  const [modalKey, setModalKey] = useState(0);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [expandedBatches, setExpandedBatches] = useState(new Set());
  const [expandedBatchSections, setExpandedBatchSections] = useState(new Set());
  // For StockOutTable nested structure
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  // Date filter for Stock Out view
  const [stockOutDateFilter, setStockOutDateFilter] = useState('all'); // 'all', 'today', 'this-week', 'this-month', 'custom'
  const [showStockOutDateDropdown, setShowStockOutDateDropdown] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  
  const handleExpandProduct = (productName) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productName)) {
      newExpanded.delete(productName);
    } else {
      newExpanded.add(productName);
    }
    setExpandedProducts(newExpanded);
  };
  
  const handleExpandBatch = (batchKey) => {
    const newExpanded = new Set(expandedBatches);
    if (newExpanded.has(batchKey)) {
      newExpanded.delete(batchKey);
    } else {
      newExpanded.add(batchKey);
    }
    setExpandedBatches(newExpanded);
  };
  
  const handleExpandBatchSection = (productName) => {
    const newExpanded = new Set(expandedBatchSections);
    if (newExpanded.has(productName)) {
      newExpanded.delete(productName);
    } else {
      newExpanded.add(productName);
    }
    setExpandedBatchSections(newExpanded);
  };

  // Handler for StockOutTable category expansion
  const handleExpandStockOutCategory = (categoryName) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };
  
  // Handler for StockOutTable product expansion
  const handleExpandStockOutProduct = (productName) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productName)) {
      newExpanded.delete(productName);
    } else {
      newExpanded.add(productName);
    }
    setExpandedProducts(newExpanded);
  };
  const [archiveItem, setArchiveItem] = useState(null);
  const [referencingProducts, setReferencingProducts] = useState([]);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [restoreItem, setRestoreItem] = useState(null);  // For future Archives modal
  const [hasSalesHistory, setHasSalesHistory] = useState(false);
  const [canHardDelete, setCanHardDelete] = useState(false);
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

  // For Remove Product confirmation
  const [confirmModal, setConfirmModal] = useState(null);

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

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isCategoryDropdownOpen && !e.target.closest('.search-wrapper')) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCategoryDropdownOpen]);

  // Close date dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showStockOutDateDropdown && !e.target.closest('[data-date-filter]')) {
        setShowStockOutDateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStockOutDateDropdown]);

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
    
    // AUTO-CREATE INVENTORY RECORDS for new products (stockQty: 0, allowBackorder: true)
    const currentInventory = JSON.parse(localStorage.getItem('pmp_inventory') || '[]');
    const existingSKUs = new Set(currentInventory.map(i => i.sku));
    const newInventoryItems = [];
    
    updatedList.forEach(cat => {
      cat.products?.forEach(prod => {
        // Generate SKU combinations - ONLY STOCKABLE variant types create SKUs
        const variantTypes = prod.variantTypes || [];
        const stockableTypes = variantTypes.filter(vt => vt.isStockable !== false);  // Filter non-stockable
        
        if (stockableTypes.length === 0) {
          // No stockable variants - create single base SKU
          const catP = cat.name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
          const prodP = prod.name.split(' ').filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase()).slice(0, 4).join('');
          const sku = `${catP}-${prodP}-BASE`;
          
          if (!existingSKUs.has(sku)) {
            newInventoryItems.push({
              id: `inv-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
              sku,
              name: prod.name,
              masterlistProductName: prod.name,
              category: cat.name,
              variantCombo: {},
              stockQty: 0,
              damagedQty: 0,
              minStockLevel: 10,
              averageCost: 0,
              lastUnitCost: 0,
              lastSupplierId: null,
              lastSupplierName: '',
              batches: [],
              allowBackorder: true,
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            existingSKUs.add(sku);
          }
        } else {
          // Has stockable variants - create SKU for each stockable combination
          const combinations = [[]];
          for (const vt of stockableTypes) {  // ← Only stockable types!
            const newCombinations = [];
            for (const combo of combinations) {
              for (const option of vt.options) {
                newCombinations.push([...combo, option]);
              }
            }
            combinations.length = 0;
            combinations.push(...newCombinations);
          }
          
          combinations.forEach(combo => {
            const catP = cat.name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
            const prodP = prod.name.split(' ').filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase()).slice(0, 4).join('');
            
            // Build variant name from stockable options only
            const variantName = combo.join(' / ');
            
            // Generate SKU suffix from stockable options only
            const skuSuffix = combo.map(opt => opt.replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase()).join('-');
            const sku = `${catP}-${prodP}-${skuSuffix}`;
            
            if (!existingSKUs.has(sku)) {
              // Build variantCombo from stockable types only
              const variantCombo = {};
              stockableTypes.forEach((vt, idx) => {
                if (combo[idx]) variantCombo[vt.name] = combo[idx];
              });
              
              newInventoryItems.push({
                id: `inv-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
                sku,
                name: `${prod.name} ${variantName}`,
                masterlistProductName: prod.name,
                category: cat.name,
                variantCombo,
                stockQty: 0,
                damagedQty: 0,
                minStockLevel: 10,
                averageCost: 0,
                lastUnitCost: 0,
                lastSupplierId: null,
                lastSupplierName: '',
                batches: [],
                allowBackorder: true,
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              existingSKUs.add(sku);
            }
          });
        }
      });
    });
    
    // Add new inventory items if any
    if (newInventoryItems.length > 0) {
      const updatedInventory = [...currentInventory, ...newInventoryItems];
      setInventory(updatedInventory);
      saveInventoryList(updatedInventory);
    }
  };

  const handleAddSupplier = (data) => {
    const s = addSupplier(data);
    setSuppliers(prev => [...prev, s]);
    return s;
  };

  const toggleExpand = (id) => setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Active items only, filtered by search + status + category
  // Exception: Stock Out view shows ALL items (including archived) for historical reporting
  // Items with 0 stock ARE shown (for Pre-Order / allowBackorder items)
  const filteredInventory = inventory.filter(item => {
    // Category filter (from combobox)
    if (selectedCategory && item.category !== selectedCategory) return false;

    // Stock Out view: Show all items with movements, even if archived
    if (statusFilter === 'stock-out') {
      const q = searchQuery.toLowerCase();
      const name = (item.name || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      const hasMovements = (item.batches || []).some(b => (b.movements || []).some(m => m.type === 'sold' || m.type === 'damaged'));
      if (!hasMovements) return false;
      if (!name.includes(q) && !category.includes(q)) return false;
      return true;
    }

    // Other views: Only active items (including 0 stock for Pre-Order)
    if (item.isActive === false) return false;
    const q = searchQuery.toLowerCase();
    const name = (item.name || '').toLowerCase();
    const category = (item.category || '').toLowerCase();
    if (!name.includes(q) && !category.includes(q)) return false;
    if (statusFilter === 'low-stock') return item.stockQty <= item.minStockLevel;  // Include 0 stock
    if (statusFilter === 'out-of-stock') return item.stockQty === 0;
    return true;  // Show all active items including 0 stock
  });

  const archivedInventory = inventory.filter(i => i.isActive === false);

  // Summary stats
  const activeItems = inventory.filter(i => i.isActive !== false).length;
  const lowStockItems = inventory.filter(i => i.isActive !== false && i.stockQty > 0 && i.stockQty <= i.minStockLevel).length;
  const outOfStockItems = inventory.filter(i => i.isActive !== false && i.stockQty === 0).length;
  // Stock Out = items that have stock out movements (sold or damaged) - INCLUDE archived for reporting
  const stockOutItems = inventory.filter(i => (i.batches || []).some(b => (b.movements || []).some(m => m.type === 'sold' || m.type === 'damaged'))).length;
  const archivedCount = archivedInventory.length;

  const handleAddNew = () => { setEditingItem(null); setPendingItemData(null); setIsConfirmModalOpen(false); setModalKey(p => p + 1); setIsModalOpen(true); };
  const handleEdit = (item) => { setEditingItem(item); setIsModalOpen(true); };

  // TODO: MongoDB — Replace with: GET /api/products?inventoryId=... and GET /api/sales?inventoryId=...
  const handleDelete = (item) => {
    const products = JSON.parse(localStorage.getItem('pmp_products')||'[]');
    const sales = JSON.parse(localStorage.getItem('pmp_sales')||'[]');
    const linkedProducts = products.filter(p => p.inventoryId === item.id);
    const hasSales = sales.some(s => s.inventoryId === item.id || s.items?.some(i => i.inventoryId === item.id));
    const hasBatches = (item.batches || []).length > 0;
    const hasStock = item.stockQty > 0;
    
    // Can only hard delete if NO linked data
    const canHardDelete = !hasSales && !hasBatches && !hasStock && linkedProducts.length === 0;
    
    setReferencingProducts(linkedProducts);
    setHasSalesHistory(hasSales);
    setArchiveItem(item);
    setCanHardDelete(canHardDelete);
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

  // TODO: MongoDB — Replace with: PUT /api/inventory/sku/:sku { isActive: false, archivedAt: now }
  const handleArchiveVariant = (variant, product) => {
    if (!variant || !variant.sku) return;

    // Archive all inventory items with this SKU
    setInventory(prev => prev.map(i =>
      i.sku === variant.sku
        ? { ...i, isActive: false, archivedAt: new Date().toISOString(), archivedReason: 'variant_archived' }
        : i
    ));

    // Archive linked products (storefront)
    const products = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    const updatedProducts = products.map(p =>
      p.variantSku === variant.sku || p.sku === variant.sku
        ? { ...p, isPublished: false, isArchived: true, archivedReason: 'variant_archived', updatedAt: new Date().toISOString() }
        : p
    );
    localStorage.setItem('pmp_products', JSON.stringify(updatedProducts));

    // Note: We don't delete from masterlist - masterlist is a template
    // The variant definition stays, only inventory is archived
  };

  // Remove entire product (all variants) - for out of stock products
  const handleRemoveProduct = (productFromNestedTable) => {
    // productFromNestedTable has: { name, category, variants: Map, batches: Map }
    // Get all SKUs from this product's variants
    const variantList = Array.from(productFromNestedTable.variants.values());
    const allSkus = variantList.map(v => v.sku);

    // Find all inventory items that match these SKUs
    const itemsToDelete = inventory.filter(i => allSkus.includes(i.sku) && i.isActive !== false);

    // Check if any can be deleted
    const products = JSON.parse(localStorage.getItem('pmp_products')||'[]');
    const sales = JSON.parse(localStorage.getItem('pmp_sales')||'[]');

    // Check each item
    let hasAnyLinkedData = false;
    itemsToDelete.forEach(item => {
      const linkedProducts = products.filter(p => p.inventoryId === item.id || p.sku === item.sku || p.variantSku === item.sku);
      const hasSales = sales.some(s => s.inventoryId === item.id || s.items?.some(i => i.inventoryId === item.id || i.sku === item.sku));
      const hasBatches = (item.batches || []).length > 0;
      const hasStock = item.stockQty > 0;

      if (linkedProducts.length > 0 || hasSales || hasBatches || hasStock) {
        hasAnyLinkedData = true;
      }
    });

    // Show confirmation
    setConfirmModal({
      isOpen: true,
      title: 'Remove Out of Stock Product',
      message: `Permanently remove "${productFromNestedTable.name}" and all ${itemsToDelete.length} variant(s)?`,
      confirmLabel: 'Remove',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        // Archive all variants of this product
        setInventory(prev => prev.map(i => {
          if (allSkus.includes(i.sku)) {
            return { ...i, isActive: false, deletedAt: new Date().toISOString() };
          }
          return i;
        }));

        // Also archive linked storefront products
        const updatedProducts = products.map(p => {
          if (allSkus.some(sku => p.sku === sku || p.variantSku === sku)) {
            return { ...p, isPublished: false, isArchived: true, updatedAt: new Date().toISOString() };
          }
          return p;
        });
        localStorage.setItem('pmp_products', JSON.stringify(updatedProducts));

        setConfirmModal({ isOpen: false });
      }
    });
  };

  // TODO: MongoDB — Replace with: DELETE /api/inventory/sku/:sku
  const handleDeleteVariant = (variant, product) => {
    if (!variant || !variant.sku) return;
    
    // Delete all inventory items with this SKU
    setInventory(prev => prev.filter(i => i.sku !== variant.sku));
    
    // Note: We don't delete from masterlist - masterlist is a template
    // User can manually delete from masterlist if needed
  };

  // TODO: MongoDB — Wrap in transaction: update inventory + deduct batch + audit log + sales record
  const handleStockReduction = (data) => {
    // Check if new multi-variant structure or old single-item structure
    if (data.variants && Array.isArray(data.variants)) {
      // NEW STRUCTURE - Multi-variant reduction
      const { reason, saleDate, customer, remarks, variants, totals } = data;
      const now = new Date().toISOString();
      
      // Process each variant
      variants.forEach(variant => {
        const variantId = variant.variantId;
        const qtyFulfilled = variant.qtyFulfilled;
        
        if (qtyFulfilled <= 0) return;
        
        // Find variant in inventory
        const variantInInventory = inventory.find(i => i.id === variantId);
        if (!variantInInventory) return;
        
        const newStock = Math.max(0, variantInInventory.stockQty - qtyFulfilled);
        
        // Process FIFO batch deductions
        const currentBatches = [...(variantInInventory.batches || [])];
        const deductions = {};
        
        variant.batches.forEach(batch => {
          deductions[batch.batchId] = batch.take;
        });

        // Fix: Check for 'sales' (from modal) instead of 'sales-outside'
        const isSale = reason === 'sales' || reason === 'sales-outside';

        // Update batches with deductions
        const updatedBatches = currentBatches.map(batch => {
          const deduct = deductions[batch.batchId];
          if (!deduct) return batch;

          const newRemaining = (batch.remainingQty || 0) - deduct;
          const totalAmount = isSale && variant.sellingPrice ? (deduct * variant.sellingPrice) : 0;
          // Fix: Properly handle 'damaged' vs 'writeoff' as separate types
          const movementType = reason === 'sales' || reason === 'sales-outside' ? 'sold' : reason;
          const movement = {
            type: movementType,
            quantity: -deduct,
            remainingAfter: newRemaining,
            reason: isSale
              ? `Manual sale${customer ? ` — ${customer}` : ''}${variant.sellingPrice ? `: ₱${formatPrice(totalAmount)} (${deduct} pcs @ ₱${formatPrice(variant.sellingPrice)})` : ''}`
              : (remarks || variant.damageType || (reason === 'writeoff' ? 'Write-off' : 'Damaged')),
            createdAt: now,
          };

          return { ...batch, remainingQty: newRemaining, movements: [...(batch.movements || []), movement] };
        });

        // Update inventory
        setInventory(prev => prev.map(i => i.id === variantId
          ? {
              ...i,
              stockQty: newStock,
              batches: updatedBatches,
              // Only increment damagedQty for 'damaged' reason, not 'writeoff'
              damagedQty: reason === 'damaged' ? (i.damagedQty || 0) + qtyFulfilled : i.damagedQty,
              updatedAt: now
            }
          : i
        ));

        // Audit log entry
        const logs = JSON.parse(localStorage.getItem('pmp_inventory_logs')||'[]');
        logs.push({
          id: Date.now(),
          inventoryId: variantId,
          itemName: variant.variantName,
          category: variantInInventory.category,
          type: 'stock-out',
          reason,
          quantity: -qtyFulfilled,
          stockBefore: variantInInventory.stockQty,
          stockAfter: newStock,
          batchId: variant.batches[0]?.batchId,
          sellingPrice: isSale ? variant.sellingPrice : null,
          saleDate: isSale ? saleDate : null,
          customerName: isSale ? customer : null,
          remarks: !isSale ? remarks : null,
          createdAt: now,
        });
        localStorage.setItem('pmp_inventory_logs', JSON.stringify(logs));

        // Sales record (only for manual sales)
        if (isSale) {
          const salesData = JSON.parse(localStorage.getItem('pmp_sales')||'[]');
          salesData.push({
            id: Date.now(), 
            inventoryId: variantId, 
            batchId: variant.batches[0]?.batchId,
            productName: variant.variantName, 
            category: variantInInventory.category,
            quantity: qtyFulfilled, 
            unitPrice: variant.sellingPrice, 
            totalPrice: qtyFulfilled * variant.sellingPrice, 
            orderDate: saleDate,
            customerName: customer || `Walk-in-${Date.now()}`,
            paymentMethod: 'cash',
            status: 'completed',
            notes: 'Manual sale (outside system)',
            createdAt: now,
          });
          localStorage.setItem('pmp_sales', JSON.stringify(salesData));
        }
      });
      
      return;
    }
    
    // OLD STRUCTURE - Single item reduction (backward compatibility)
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
    const isSale = reason === 'sales' || reason === 'sales-outside';
    const updatedBatches = currentBatches.map(batch => {
      const deduct = deductions[batch.batchId];
      if (!deduct) return batch;
      const newRemaining = (batch.remainingQty || 0) - deduct;
      const totalAmount = isSale && sellingPrice ? (deduct * sellingPrice) : 0;
      // Fix: Properly handle 'damaged' vs 'writeoff' as separate types
      const movementType = reason === 'sales' || reason === 'sales-outside' ? 'sold' : reason;
      const movement = {
        type: movementType,
        quantity: -deduct,
        remainingAfter: newRemaining,
        reason: isSale
          ? `Manual sale${customerName ? ` — ${customerName}` : ''}${sellingPrice ? `: ₱${formatPrice(totalAmount)} (${deduct} pcs @ ₱${formatPrice(sellingPrice)})` : ''}`
          : (remarks || (reason === 'writeoff' ? 'Write-off' : 'Damaged')),
        createdAt: now,
      };
      return { ...batch, remainingQty: newRemaining, movements: [...(batch.movements || []), movement] };
    });

    setInventory(prev => prev.map(i => i.id === adjustmentItem.id
      ? { ...i, stockQty: newStock, batches: updatedBatches,
          damagedQty: !isSale ? (i.damagedQty || 0) + quantity : i.damagedQty,
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
      batchId, sellingPrice: isSale ? sellingPrice : null,
      saleDate: isSale ? saleDate : null,
      customerName: isSale ? customerName : null,
      remarks, createdAt: new Date().toISOString(),
    });
    localStorage.setItem('pmp_inventory_logs', JSON.stringify(logs));

    // Sales record (only for manual sales)
    // TODO: MongoDB — POST /api/sales
    if (isSale) {
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
  const handleStockAddition = (items) => {
    // items is an array from StockAdditionModal (one per variant)
    if (!Array.isArray(items) || items.length === 0) return;
    
    // Process each item (variant)
    items.forEach(itemData => {
      const { stockQty, damagedQty, batches, lastSupplierId, lastSupplierName, lastUnitCost, averageCost, name, category, sku, variantCombo } = itemData;
      
      // Find existing inventory item by SKU
      const existingItem = inventory.find(i => i.sku === sku);
      
      if (existingItem) {
        // Update existing variant
        const currentStock = existingItem.stockQty;
        const currentAvg = existingItem.averageCost || 0;
        const newTotal = currentStock + stockQty;
        const newAvg = newTotal > 0 ? ((currentStock * currentAvg) + (stockQty * lastUnitCost)) / newTotal : lastUnitCost;
        
        setInventory(prev => prev.map(i => i.sku === sku ? { 
          ...i, 
          stockQty: newTotal, 
          lastSupplierId, 
          lastSupplierName, 
          lastUnitCost, 
          averageCost: newAvg, 
          batches: batches ? [...(i.batches||[]), ...batches] : i.batches, 
          updatedAt: new Date().toISOString() 
        } : i));
        
        // Stock history entry
        addStockHistory({ 
          inventoryId: existingItem.id, 
          batchId: batches?.[0]?.batchId, 
          itemName: name, 
          category, 
          supplierId: lastSupplierId, 
          supplierName: lastSupplierName, 
          quantity: batches?.[0]?.originalQty || stockQty, 
          goodQty: stockQty, 
          damagedQty, 
          unitCost: lastUnitCost, 
          totalCost: stockQty * lastUnitCost, 
          reason: 'restock', 
          stockBefore: currentStock, 
          stockAfter: newTotal, 
          averageCostAfter: newAvg, 
          type: 'received', 
          remainingQty: batches?.[0]?.remainingQty || stockQty, 
          dateReceived: batches?.[0]?.dateReceived || new Date().toISOString() 
        });
        
        // Audit log
        const logs = JSON.parse(localStorage.getItem('pmp_inventory_logs')||'[]');
        logs.push({ 
          id: Date.now(), 
          batchId: batches?.[0]?.batchId, 
          inventoryId: existingItem.id, 
          itemName: name, 
          category, 
          type: 'stock-in', 
          reason: 'restock', 
          quantity: stockQty, 
          stockBefore: currentStock, 
          stockAfter: newTotal, 
          supplierId: lastSupplierId, 
          supplierName: lastSupplierName, 
          unitCost: lastUnitCost, 
          totalCost: stockQty * lastUnitCost, 
          createdAt: new Date().toISOString() 
        });
        localStorage.setItem('pmp_inventory_logs', JSON.stringify(logs));
      } else {
        // Add new variant to inventory
        setInventory(prev => [...prev, { 
          ...itemData, 
          batches: batches || [], 
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        }]);
      }
    });
    
    setShowAdditionModal(false); setAdditionItem(null);
  };

  // Handle save from modal (shows confirm first)
  // TODO: MongoDB — POST /api/inventory or PUT /api/inventory/:id
  const handleSave = (items) => {
    // items is an array from AddInventoryItemModal (one per variant)
    if (!Array.isArray(items) || items.length === 0) return;
    
    // For confirmation, show the first item (or aggregate info)
    const firstItem = items[0];
    const totalStock = items.reduce((sum, item) => sum + (item.stockQty || 0), 0);
    const allBatches = items.flatMap(item => item.batches || []);
    
    // Create consolidated item for confirmation
    const consolidatedItem = {
      ...firstItem,
      stockQty: totalStock,
      batches: allBatches,
      id: editingItem ? editingItem.id : crypto.randomUUID(),
      sku: editingItem ? editingItem.sku : (firstItem.sku || generateSKU(firstItem.category, firstItem.name)),
      isActive: true,
      _allItems: items // Store all items for actual save
    };
    
    setPendingItemData(consolidatedItem);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmSave = () => {
    if (!pendingItemData) return;

    // Get all items (for multi-variant saves)
    const itemsToSave = pendingItemData._allItems || [pendingItemData];

    if (editingItem) {
      // Update existing item (first item only for now)
      setInventory(prev => prev.map(i => i.id === pendingItemData.id ? { ...pendingItemData, updatedAt: new Date().toISOString() } : i));
    } else {
      // NEW LOGIC: Find & Restore or Create New (ERP-style Single Source of Truth)
      // TODO: MongoDB — This logic will be replaced by:
      //   1. Create unique index on SKU: db.inventory.createIndex({ sku: 1 }, { unique: true })
      //   2. Create compound index for lookup: db.inventory.createIndex({ category: 1, name: 1, variantCombo: 1 })
      //   3. Use upsert: db.inventory.updateOne({ sku: item.sku }, { $set: {...}, $setOnInsert: {...} }, { upsert: true })
      itemsToSave.forEach(itemData => {
        // Find existing item by SKU (most reliable - unique per variant)
        // SKU is generated from masterlist and guaranteed unique
        const existingItem = inventory.find(i => {
          // Primary: match by SKU (most reliable)
          if (itemData.sku && i.sku && i.sku === itemData.sku) return true;
          
          // Fallback: match by category + masterlistProductName + sorted variantCombo
          if (i.category !== itemData.category) return false;
          
          const masterNameA = itemData.masterlistProductName || '';
          const masterNameB = i.masterlistProductName || '';
          if (masterNameA && masterNameB && masterNameA !== masterNameB) return false;
          
          // Compare variantCombo as sorted JSON (handles object key order differences)
          const sortObj = (obj) => JSON.stringify(
            Object.fromEntries(Object.entries(obj || {}).sort())
          );
          return sortObj(itemData.variantCombo) === sortObj(i.variantCombo);
        });

        if (existingItem) {
          // RESTORE: Update existing item (set isActive: true, add new batch)
          // This maintains single ID per SKU - critical for sales history tracking
          // TODO: MongoDB — Replace with:
          //   db.inventory.updateOne(
          //     { _id: existingItem._id },
          //     { 
          //       $set: { isActive: true, updatedAt: new Date() },
          //       $push: { batches: { $each: newBatches } },
          //       $inc: { stockQty: newStockQty }
          //     }
          //   )
          setInventory(prev => prev.map(i => {
            if (i.id === existingItem.id) {
              // Merge: keep existing data, add new batch, update stock
              const newBatches = itemData.batches || [];
              const existingBatches = i.batches || [];
              
              // Check for duplicate batch IDs and skip them
              const existingBatchIds = new Set(existingBatches.map(b => b.batchId));
              const uniqueNewBatches = newBatches.filter(b => !existingBatchIds.has(b.batchId));
              
              return {
                ...i,
                isActive: true,  // Restore
                stockQty: (i.stockQty || 0) + (itemData.stockQty || 0),  // Add new stock
                batches: [...existingBatches, ...uniqueNewBatches],  // Merge batches
                minStockLevel: itemData.minStockLevel || i.minStockLevel,  // Update if provided
                allowBackorder: i.allowBackorder !== undefined ? i.allowBackorder : true,  // Preserve or default to true
                updatedAt: new Date().toISOString()
              };
            }
            return i;
          }));
        } else {
          // CREATE: No existing item found, create new entry
          // TODO: MongoDB — Replace with: db.inventory.insertOne({ ...itemData, createdAt: new Date(), updatedAt: new Date() })
          setInventory(prev => [...prev, {
            ...itemData,
            batches: itemData.batches || [],
            allowBackorder: true,  // NEW: Can be sold even at 0 stock (default true)
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }]);
        }
      });
    }

    setIsConfirmModalOpen(false);
    setIsModalOpen(false);  // Close the wizard modal
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
            <p className="page-subtitle">Physical stock + Pre-Order items. Products with "Pre-Order" enabled can be sold even at 0 stock.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-primary" onClick={() => setShowMasterlistModal(true)}>
Item Masterlist
            </button>
            <button type="button" className="btn-primary" onClick={() => setShowManageSuppliersModal(true)}>
              Suppliers
            </button>
            <button type="button" className="btn-primary" onClick={handleAddNew}>
              <span className="btn-icon">+</span> Add Item
            </button>
          </div>
        </div>

        {/* Summary cards - Simple 2-tab navigation */}
        <div className="inventory-summary" style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { label: 'All Items', value: activeItems, filter: '', cls: '' },
            { label: 'Stock Out', value: stockOutItems, filter: 'stock-out', cls: 'summary-card-danger' },
          ].map(({ label, value, filter, cls }) => (
            <div key={label} className={`summary-card${cls?' '+cls:''}${statusFilter===filter?' active':''}`}
              onClick={() => setStatusFilter(statusFilter===filter?'':filter)} style={{ cursor: 'pointer', flex: 1 }}>
              <div className="summary-content" style={{ justifyContent: 'center' }}>
                <span className="summary-label" style={{ fontSize: '1rem', fontWeight: 700 }}>{label}</span>
                {value > 0 && (
                  <span className="summary-value" style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray)', marginTop: '0.25rem' }}>{value} {label === 'All Items' ? 'items' : 'items'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search with Category Combobox */}
      <div className="inventory-toolbar">
        <div className="search-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or category..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          {searchQuery && <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>}
          
          {/* Category Dropdown Button */}
          <button
            type="button"
            onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'rgba(212, 168, 67, 0.1)',
              border: '1px solid var(--gold)',
              borderRadius: '6px',
              color: 'var(--gold)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minWidth: '140px',
              outline: 'none',
            }}
          >
            {selectedCategory || 'All Categories'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform 0.2s', transform: isCategoryDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

          {/* Category Dropdown Menu */}
          {isCategoryDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: '0',
                marginTop: '0.5rem',
                background: 'rgba(20, 20, 20, 0.98)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                zIndex: 1000,
                minWidth: '200px',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              <button
                type="button"
                onClick={() => { setSelectedCategory(''); setSearchQuery(''); setIsCategoryDropdownOpen(false); }}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: selectedCategory === '' ? 'rgba(212, 168, 67, 0.15)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: selectedCategory === '' ? 'var(--gold)' : 'var(--white)',
                  fontSize: '0.875rem',
                  fontWeight: selectedCategory === '' ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.target.style.background = selectedCategory === '' ? 'rgba(212, 168, 67, 0.25)' : 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.target.style.background = selectedCategory === '' ? 'rgba(212, 168, 67, 0.15)' : 'transparent'}
              >
                All Categories
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setSelectedCategory(cat); setSearchQuery(''); setIsCategoryDropdownOpen(false); }}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: selectedCategory === cat ? 'rgba(212, 168, 67, 0.15)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    color: selectedCategory === cat ? 'var(--gold)' : 'var(--white)',
                    fontSize: '0.875rem',
                    fontWeight: selectedCategory === cat ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = selectedCategory === cat ? 'rgba(212, 168, 67, 0.25)' : 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.target.style.background = selectedCategory === cat ? 'rgba(212, 168, 67, 0.15)' : 'transparent'}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date filter - only show in Stock Out view */}
        {statusFilter === 'stock-out' && (
          <div data-date-filter style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              onClick={() => setShowStockOutDateDropdown(!showStockOutDateDropdown)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: 'var(--white)',
                userSelect: 'none',
                minWidth: '130px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span style={{ flex: 1 }}>{stockOutDateFilter === 'all' ? 'All Time' : stockOutDateFilter === 'today' ? 'Today' : stockOutDateFilter === 'this-week' ? 'This Week' : stockOutDateFilter === 'this-month' ? 'This Month' : 'Custom Range'}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{showStockOutDateDropdown ? '▲' : '▼'}</span>
            </div>
            {showStockOutDateDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  zIndex: 100,
                  background: 'var(--dark2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  minWidth: '150px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                {[['all', 'All Time'], ['today', 'Today'], ['this-week', 'This Week'], ['this-month', 'This Month'], ['custom', 'Custom Range']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setStockOutDateFilter(val); setShowStockOutDateDropdown(false); }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '0.6rem 1rem',
                      textAlign: 'left',
                      fontSize: '0.82rem',
                      fontWeight: val === stockOutDateFilter ? 700 : 400,
                      color: val === stockOutDateFilter ? 'var(--gold)' : 'var(--white)',
                      background: val === stockOutDateFilter ? 'rgba(212, 168, 67, 0.1)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {/* Custom Date Range Inputs */}
            {stockOutDateFilter === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>from</span>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.8rem',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--white)',
                    outline: 'none',
                    minWidth: '140px',
                  }}
                />
                <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>to</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.8rem',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--white)',
                    outline: 'none',
                    minWidth: '140px',
                  }}
                />
              </div>
            )}
          </div>
        )}
        {/* Legend - only show in Inventory view */}
        {statusFilter !== 'stock-out' && (
          <div className="inventory-legend">
            <span className="legend-item"><span className="legend-dot legend-dot-low"></span>Low Stock</span>
            <span className="legend-item"><span className="legend-dot legend-dot-out"></span>Out of Stock</span>
          </div>
        )}
      </div>

      {/* Stock Out Table */}
      {statusFilter === 'stock-out' && (
        <div>
          <StockOutTable
            inventory={inventory}
            expandedBatches={expandedBatches}
            onExpandBatch={handleExpandBatch}
            expandedProducts={expandedProducts}
            onExpandProduct={handleExpandStockOutProduct}
            dateFilter={stockOutDateFilter}
            selectedCategory={selectedCategory}
            customDateFrom={customDateFrom}
            customDateTo={customDateTo}
          />
        </div>
      )}

      {/* Table - Only show in Inventory/Low Stock view */}
      {statusFilter !== 'stock-out' && (
        <div style={{ WebkitOverflowScrolling: 'touch', borderRadius: '10px', width: '0', minWidth: '100%', display: 'block', overflowX: 'auto', marginBottom: '1rem' }}>
        {filteredInventory.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            </div>
            <h3 className="empty-title">
              {searchQuery ? 'No items found' : statusFilter === 'stock-out' ? 'No Stock Out Items' : 'No Inventory Items'}
            </h3>
            <p className="empty-description">
              {searchQuery ? 'Try adjusting your search.' : statusFilter ? `No items match the "${statusFilter}" filter.` : 'Add your first physical inventory item.'}
            </p>
            {!searchQuery && !statusFilter && <button className="btn-primary" onClick={handleAddNew}>Add First Item</button>}
          </div>
        ) : (
          <NestedInventoryTable
            inventory={filteredInventory}
            expandedProducts={expandedProducts}
            expandedBatches={expandedBatches}
            expandedBatchSections={expandedBatchSections}
            onExpandProduct={handleExpandProduct}
            onExpandBatch={handleExpandBatch}
            onExpandBatchSection={handleExpandBatchSection}
            onEditItem={handleEdit}
            onRemoveItem={handleRemoveProduct}
            onAddStock={(item) => { setAdditionItem(item); setShowAdditionModal(true); }}
            onReduceStock={(item) => { setAdjustmentItem(item); setShowAdjustmentModal(true); }}
            onUpdateMinStock={(sku, minStock) => {
              // Update ALL items with this SKU
              setInventory(prev => prev.map(i => i.sku === sku ? { ...i, minStockLevel: minStock, updatedAt: new Date().toISOString() } : i));
              // Save full inventory to localStorage (not just filtered)
              const fullInventory = JSON.parse(localStorage.getItem('pmp_inventory') || '[]');
              const updated = fullInventory.map(i => i.sku === sku ? { ...i, minStockLevel: minStock, updatedAt: new Date().toISOString() } : i);
              localStorage.setItem('pmp_inventory', JSON.stringify(updated));
            }}
            // TODO: Pre-Order toggle removed - Pre-Order is always ON by default (allowBackorder: true)
            onArchiveVariant={handleArchiveVariant}
            onDeleteVariant={handleDeleteVariant}
          />
        )}
        </div>
      )}

      {/* Archived section - HIDDEN */}
      {/* TODO: Create "Archives" button in header that opens a modal showing archivedInventory */}
      {/* When ready, add button in page-header div:
          <button type="button" className="btn-secondary" onClick={() => setShowArchivedModal(true)}>
            📦 Archives ({archivedCount})
          </button>
      */}

      {/* ── All Modals ─────────────────────────────────────────────────────────── */}

      <AddInventoryItemModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingItem(null); }}
        onSave={handleSave}
        item={editingItem}
        categories={categories}
        inventory={inventory}
        suppliers={suppliers}
        onAddSupplier={handleAddSupplier}
        masterlist={masterlist} />

      <ConfirmSaveModal isOpen={isConfirmModalOpen} onClose={() => { setIsConfirmModalOpen(false); setPendingItemData(null); }}
        onConfirm={handleConfirmSave} itemData={pendingItemData} isEdit={!!editingItem} />

      <ArchiveConfirmModal isOpen={showArchiveModal}
        onClose={() => { setShowArchiveModal(false); setArchiveItem(null); setReferencingProducts([]); setHasSalesHistory(false); }}
        onArchive={handleArchive} onDelete={handlePermanentDelete}
        itemName={archiveItem?.name} isReferenced={referencingProducts.length > 0}
        referencingProductsCount={referencingProducts.length} hasSalesHistory={hasSalesHistory}
        canHardDelete={canHardDelete} />

      <ConfirmModal isOpen={!!restoreItem} onClose={() => setRestoreItem(null)}
        onConfirm={() => { handleRestore(restoreItem); setRestoreItem(null); }}
        title="Restore Item" confirmLabel="Restore"
        message={`Restore "${restoreItem?.name}" from archive? It will be available for use again.`} />

      <StockReductionModal isOpen={showAdjustmentModal}
        onClose={() => { setShowAdjustmentModal(false); setAdjustmentItem(null); }}
        onConfirm={handleStockReduction} item={adjustmentItem} inventory={inventory}
        masterlist={masterlist} />

      <StockAdditionModal isOpen={showAdditionModal}
        onClose={() => { setShowAdditionModal(false); setAdditionItem(null); }}
        onConfirm={handleStockAddition} item={additionItem}
        suppliers={suppliers} categories={categories} onAddSupplier={handleAddSupplier}
        masterlist={masterlist} />

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