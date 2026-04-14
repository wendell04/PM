'use client';

import ErrorBoundary from '../../../../components/ErrorBoundary';

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
import { formatNumber, formatPrice } from '../../../../src/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMasterlist, saveMasterlist } from '@/lib/inventoryApi';
import {
  fetchInventory,
  createInventory,
  updateInventory,
  adjustInventoryStock,
  deleteInventory,
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
} from '@/lib/inventoryApi';
import { fetchProducts, updateProduct } from '@/lib/productApi';
import { fetchAllOrders } from '@/lib/ordersApi';

// ── DEFAULT CATEGORIES — Fallback when inventory is empty ─────────────────────
const DEFAULT_CATEGORIES = [
  'T-Shirts',
  'Mugs',
  'Stickers',
  'Accessories',
  'Bags',
  'Other'
];

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

// ── Item Masterlist Helpers ────────────────────────────────────────────────────
// Derive flat category list from masterlist
export function getCategoriesFromMasterlist(masterlist) {
  return masterlist.map(c => c.name);
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
          <button type="button" className={confirmClass} onClick={onConfirm} disabled={confirmLabel === 'Restoring...'}
            style={{ opacity: confirmLabel === 'Restoring...' ? 0.6 : 1, cursor: confirmLabel === 'Restoring...' ? 'not-allowed' : 'pointer' }}>
            {confirmLabel}
          </button>
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

  const handlePrint = () => {
    const w = window.open('', '', 'width=800,height=600');
    w.document.write(`<html><head><title>Batch ${batch.batchId}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;color:#000}h1{font-size:18px;text-align:center;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:12px;margin:15px 0}th,td{padding:6px;border-bottom:1px solid #ddd;text-align:center}th{border-bottom:2px solid #000;font-weight:600;text-transform:uppercase}.s{margin:15px 0;padding:12px;border:1px solid #333;border-radius:6px}.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.lbl{font-size:10px;color:#666;text-transform:uppercase}.val{font-size:13px;font-weight:600}</style>
    </head><body>
    <h1>Batch Details — ${batch.batchId}</h1>
    <div class="s"><div class="g2">
      <div><div class="lbl">Supplier</div><div class="val">${batch.supplierName||'N/A'}</div></div>
      <div><div class="lbl">Invoice</div><div class="val">${batch.invoiceNumber||'N/A'}</div></div>
      <div><div class="lbl">Date Received</div><div class="val">${new Date(batch.dateReceived).toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})}</div></div>
      <div><div class="lbl">Item</div><div class="val">${item.name} (${item.category})</div></div>
    </div></div>
    <div class="s"><div class="g2">
      <div><div class="lbl">Original</div><div class="val">${batch.originalQty} pcs</div></div>
      <div><div class="lbl">Good</div><div class="val" style="color:#16a34a">${batch.goodQty||batch.originalQty} pcs</div></div>
      <div><div class="lbl">Damaged</div><div class="val" style="color:#dc2626">${batch.damagedQty||0} pcs</div></div>
      <div><div class="lbl">Unit Cost</div><div class="val" style="color:#d97706">₱${formatPrice(batch.unitCost)}</div></div>
    </div></div>
    ${sorted.length>0?`<div class="s"><h3 style="margin:0 0 10px 0;font-size:13px;text-transform:uppercase">Movement History</h3>
    <table><thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Remaining</th><th>Notes</th></tr></thead><tbody>
    ${sorted.map(m=>`<tr><td>${new Date(m.createdAt).toLocaleDateString()}</td><td>${m.type}</td><td style="color:${m.quantity>0?'#16a34a':'#dc2626'}">${m.quantity>0?'+':''}${m.quantity}</td><td>${m.remainingAfter} pcs</td><td>${m.reason||'—'}</td></tr>`).join('')}
    </tbody></table></div>`:''}
    <div class="s"><div class="g2">
      <div><div class="lbl">Total Received</div><div class="val" style="color:#16a34a">${totalReceived} pcs</div></div>
      <div><div class="lbl">Total Sold</div><div class="val" style="color:#2563eb">${totalSold} pcs</div></div>
      <div><div class="lbl">Total Damaged</div><div class="val" style="color:#dc2626">${totalDamaged} pcs</div></div>
      <div><div class="lbl">Return Credit</div><div class="val" style="color:#d97706">₱${formatPrice(totalDamaged*batch.unitCost)}</div></div>
    </div></div>
    <div style="margin-top:20px;border-top:1px solid #000;text-align:center;font-size:10px;color:#666;padding-top:10px">
      Printed: ${new Date().toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})} • Internal Batch Record
    </div></body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); onClose(); }, 250);
  };

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
              ['Unit Cost', `₱${formatPrice(batch.unitCost)}`, 'var(--gold)'],
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
              ['Total Damaged',`${totalDamaged} pcs`,'#f87171'],['Return Credit',`₱${formatPrice(totalDamaged*batch.unitCost)}`,'#d97706'],
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
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" onClick={handlePrint}>Print Batch Details</button>
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
              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                Avg Cost: <strong style={{ color: 'var(--white)' }}>{formatPrice(item.averageCost || 0)}</strong>
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
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'rgba(0,0,0,0.25)', position: 'sticky', top: 0 }}>
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
                      <th key={h.label} style={{ padding: '0.6rem 0.75rem', textAlign: h.align, color: 'var(--gray)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
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
                          <span style={{ color: isDepleted ? '#f87171' : (batch.remainingQty <= 5 ? '#facc15' : 'var(--gold)') }}>
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
            <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: '0.5rem' }}>Local Market / Various Market</span>
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
function ItemMasterlistModal({ isOpen, onClose, masterlist, onSave, inventory }) {
  const [localList, setLocalList] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [infoModal, setInfoModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  // ── Add/Edit form state ────────────────────────────────────────────────────
  // mode: null | 'add-cat' | 'edit-cat' | 'add-prod' | 'edit-prod'
  const [formMode, setFormMode] = useState(null);
  const [formCatId, setFormCatId] = useState(null);   // which category context
  const [formProdId, setFormProdId] = useState(null); // which product (for edit)
  const [formName, setFormName] = useState('');
  const [formVariants, setFormVariants] = useState([]); // string[]
  const [variantInput, setVariantInput] = useState('');
  const [editingLinked, setEditingLinked] = useState(false); // true when editing a product linked to inventory

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
    setFormProdId(null); setFormName(''); setFormVariants([]); setVariantInput('');
  };

  const startEditProd = (catId, prod) => {
    // TODO: MongoDB — GET /api/inventory/count?category=:catName&name=:prodName
    // If linked: allow edit but lock name (variants still editable)
    const cat = localList.find(c => c.id === catId);
    const linkedCount = cat ? getLinkedInventoryCount(cat.name, prod.name) : 0;
    setEditingLinked(linkedCount > 0);
    setFormMode('edit-prod'); setFormCatId(catId); setFormProdId(prod.id);
    setFormName(prod.name); setFormVariants([...(prod.variants||[])]); setVariantInput('');
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

  // ── Variant actions (inside form only) ────────────────────────────────────
  const addVariant = () => {
    const v = variantInput.trim();
    if (!v) return;
    if (formVariants.some(x => x.toLowerCase() === v.toLowerCase())) {
      setInfoModal({ title: 'Duplicate Variant', message: `"${v}" already exists.` }); return;
    }
    setFormVariants(prev => [...prev, v]);
    setVariantInput('');
  };
  const removeVariant = (v) => setFormVariants(prev => prev.filter(x => x !== v));

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
      // TODO: MongoDB — POST /api/masterlist/products { categoryId, name, variants[] }
      const cat = localList.find(c => c.id === formCatId);
      if (!cat) return;
      const isDup = (cat.products||[]).some(p => p.name.toLowerCase() === formName.trim().toLowerCase());
      if (isDup) { setInfoModal({ title: 'Duplicate', message: `"${formName.trim()}" already exists under ${cat.name}.` }); return; }
      const newProd = { id: genId(), name: formName.trim(), variants: formVariants, createdAt: new Date().toISOString() };
      updated = localList.map(c => c.id !== formCatId ? c : { ...c, products: [...(c.products||[]), newProd] });

    } else if (formMode === 'edit-prod') {
      // TODO: MongoDB — PUT /api/masterlist/products/:id { name, variants[] }
      const cat = localList.find(c => c.id === formCatId);
      if (!cat) return;
      const isDup = (cat.products||[]).some(p => p.name.toLowerCase() === formName.trim().toLowerCase() && p.id !== formProdId);
      if (isDup) { setInfoModal({ title: 'Duplicate', message: `"${formName.trim()}" already exists under ${cat.name}.` }); return; }
      updated = localList.map(c => c.id !== formCatId ? c : {
        ...c, products: c.products.map(p => p.id !== formProdId ? p : { ...p, name: formName.trim(), variants: formVariants, updatedAt: new Date().toISOString() })
      });
    }

    setLocalList(updated);
    onSave(updated);
    setFormMode(null); setFormName(''); setFormVariants([]); setVariantInput(''); setEditingLinked(false);
  };

  const cancelForm = () => { setFormMode(null); setFormName(''); setFormVariants([]); setVariantInput(''); setEditingLinked(false); };

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
                {formMode.includes('cat') ? 'Category Name' : 'Product Name'}
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
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (formMode.includes('cat')) handleFormSubmit(); else document.getElementById('variant-input-field')?.focus(); } }} />
              {editingLinked && (
                <p className="form-hint" style={{ color: '#f59e0b' }}>
                  Name is locked — linked to active inventory items. You can still edit variants below.
                </p>
              )}
            </div>

            {/* Variants — only for products */}
            {formMode.includes('prod') && (
              <div className="form-group">
                <label className="form-label">
                  Variants
                  <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional — e.g., Small, Medium, Large or Glossy, Matte)</span>
                </label>

                {/* Variant chips */}
                {formVariants.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                    {formVariants.map((v, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.35)', borderRadius: '20px', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 500 }}>
                        {v}
                        <button type="button" onClick={() => removeVariant(v)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Add variant input */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input id="variant-input-field" type="text" className="form-input" value={variantInput}
                    onChange={e => setVariantInput(e.target.value.slice(0, 40))}
                    placeholder="e.g., Small, Glossy, Round..."
                    maxLength={40}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariant(); } if (e.key === 'Escape') cancelForm(); }} />
                  <button type="button" className="btn-primary" onClick={addVariant}
                    style={{ padding: '0 1rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    + Add
                  </button>
                </div>
                <p className="form-hint">
                  {formVariants.length === 0
                    ? 'No variants — item will be stocked as a single product (e.g., Ceramic White Mug, Mousepad).'
                    : `${formVariants.length} variant(s) defined. These auto-populate the Variants field in Add Product.`}
                </p>

                {/* Variants info box */}
                {formVariants.length > 0 && (
                  <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--white)' }}>Note:</strong> Variants are for storefront display only.
                    In Inventory, this product is tracked as a single item (whole stock, not per variant).
                    Variants auto-fill in <strong style={{ color: 'var(--white)' }}>Add Product</strong> when you select this item.
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
                + Add Category
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
                      <p style={{ fontSize: '0.875rem' }}>Click <strong style={{ color: 'var(--gold)' }}>+ Add Category</strong> to start building your masterlist.</p>
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
                                  return (
                                    <div key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                      {/* Product info */}
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                          <span style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.875rem' }}>{prod.name}</span>
                                          {linked > 0 && (
                                            <span style={{ fontSize: '0.65rem', color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                                              {linked} in inventory
                                            </span>
                                          )}
                                        </div>
                                        {(prod.variants||[]).length > 0 ? (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.3rem' }}>
                                            {(prod.variants||[]).map((v, i) => (
                                              <span key={i} style={{ fontSize: '0.7rem', color: 'var(--gold)', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.25)', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                                                {v}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.2rem', display: 'block', fontStyle: 'italic' }}>No variants</span>
                                        )}
                                      </div>
                                      {/* Product actions */}
                                      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                        {/* Edit always shown — name locked if linked, variants still editable */}
                                        <button type="button" onClick={() => startEditProd(cat.id, prod)}
                                          style={{ background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', minWidth: '52px', flexShrink: 0, borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                                        {/* Delete only shown when not linked */}
                                        {linked === 0 && (
                                          <button type="button" onClick={() => handleDeleteProd(cat, prod)}
                                            style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', minWidth: '64px', flexShrink: 0, borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                                        )}
                                      </div>
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
                              + Add Product under {cat.name}
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
        {open && categories.length === 0 && (
          <div className="combobox-menu">
            <div style={{ padding: '0.75rem 1rem', color: 'var(--gray)', fontSize: '0.875rem' }}>
              No categories yet. Add categories via <strong style={{ color: 'var(--white)' }}>Add Inventory Item</strong>.
            </div>
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

  const toggle = (cat) => setForm(p => ({
    ...p, categories: p.categories.includes(cat) ? p.categories.filter(c => c !== cat) : [...p.categories, cat],
  }));

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
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
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
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
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
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
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
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
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


// ── Manage Suppliers Modal ─────────────────────────────────────────────────────
// FIX: Replaced window.__supplierInUse global with proper component state
function ManageSuppliersModal({ isOpen, onClose, suppliers, categories, inventory, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingInUse, setEditingInUse] = useState(false); // FIX: was window.__supplierInUse
  const [form, setForm] = useState({ name: '', contact: '', phone: '', address: '', categories: [] });
  const [infoModal, setInfoModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    if (isOpen) { setShowForm(false); setEditingId(null); setEditingInUse(false); setForm({ name: '', contact: '', phone: '', address: '', categories: [] }); }
  }, [isOpen]);

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

  const toggle = (cat) => setForm(p => ({
    ...p, categories: p.categories.includes(cat) ? p.categories.filter(c => c !== cat) : [...p.categories, cat],
  }));

  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '920px', width: '95%' }}>
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
                <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        {['Name','Contact Person','Item Supplied','Phone','Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map(s => (
                        <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.75rem', color: 'var(--white)', fontWeight: 600 }}>{s.name}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--white)', fontSize: '0.875rem', fontWeight: 500 }}>{s.contact||'—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                            {s.categories?.length > 0 ? s.categories.join(', ') : <em style={{ color: 'var(--gray)' }}>All / General</em>}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>{s.phone||'—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <button type="button" onClick={() => handleEdit(s)} style={{ background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', marginRight: '0.5rem', borderRadius: '6px', padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                            <button type="button" className="btn-sm btn-danger" onClick={() => handleDeleteClick(s)}>Delete</button>
                          </td>
                        </tr>
                      ))}
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
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
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
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
                    placeholder="e.g., Juan Dela Cruz" maxLength={60} required />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Phone
                    <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--gray)', marginLeft: '0.5rem' }}>(Optional)</span>
                  </label>
                  <input type="text" className="form-input" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^0-9-]/g, '').slice(0, 15) }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
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
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
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
    </div>
  );
}

// ── Inventory Modal (Add/Edit Item) ────────────────────────────────────────────
// isOnDemand REMOVED — inventory = physical stocked items only
// FIX: minStockLevel is now editable when editing (was previously locked)
// FIX: SKU generated once and stored in state — never regenerates on re-render
function InventoryModal({ isOpen, onClose, onSave, onEdit, onRestoreItem, item, categories, onAddCategory, inventory, editingItem, suppliers, onAddSupplier, masterlist, products = [] }) {
  const [form, setForm] = useState({ name: '', category: categories[0]||'', initialStock: '', minStockLevel: 10, supplierId: 'unspecified', supplierName: 'General Merchandise', unitCost: '', isBulkPurchase: false, totalCost: '', invoiceNumber: '', deliveryDate: new Date().toISOString().split('T')[0], damagedOnArrival: '', notes: '', receiptImage: null });
  // SKU stored in state — generated once when name is first filled, never regenerated
  const [skuPreview, setSkuPreview] = useState('');
  const [skuLocked, setSkuLocked] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [infoModal, setInfoModal] = useState(null);
  const [duplicateItem, setDuplicateItem] = useState(null);
  const [archivedItem, setArchivedItem] = useState(null);
  const catRef = useRef(null);
  // Masterlist selection state
  const [masterlistInput, setMasterlistInput] = useState('');
  const [showMasterlistDrop, setShowMasterlistDrop] = useState(false);
  const [selectedMasterlistItem, setSelectedMasterlistItem] = useState(null); // { catName, prodName, variants[] }
  const masterlistRef = useRef(null);

  useEffect(() => {
    if (item) {
      setForm({ name: item.name||'', category: item.category||categories[0]||'', initialStock: item.stockQty||0, minStockLevel: item.minStockLevel||10, supplierId: item.lastSupplierId||'unspecified', supplierName: item.lastSupplierName||'General Merchandise', unitCost: item.lastUnitCost?String(item.lastUnitCost):'', isBulkPurchase: false, totalCost: '', invoiceNumber: '', deliveryDate: new Date().toISOString().split('T')[0], damagedOnArrival: '', notes: '', receiptImage: null });
      // Editing: SKU already exists, show it locked
      setSkuPreview(item.sku||'');
      setSkuLocked(true);
    } else {
      setForm({ name: '', category: categories[0]||'', initialStock: '', minStockLevel: 10, supplierId: 'unspecified', supplierName: 'General Merchandise', unitCost: '', isBulkPurchase: false, totalCost: '', invoiceNumber: '', deliveryDate: new Date().toISOString().split('T')[0], damagedOnArrival: '', notes: '', receiptImage: null });
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
    const h = (e) => { if (catRef.current && !catRef.current.contains(e.target)) setShowCatDropdown(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => {
    const h = (e) => { if (masterlistRef.current && !masterlistRef.current.contains(e.target)) setShowMasterlistDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Check if item is linked to products or orders
  useEffect(() => {
    if (item) {
      const isLinkedToProduct = products.some(p => p.inventoryId === item.id);
      // TODO: Add orders check when orders API is integrated
      setIsLinked(isLinkedToProduct);
    } else setIsLinked(false);
  }, [item, products]);

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
    onSave({ ...form, name: normalizedName, sku: skuPreview, minStockLevel: parseInt(form.minStockLevel)||10, stockQty: item ? item.stockQty : (stock-damaged), damagedQty: item ? item.damagedQty : damaged, lastSupplierId: form.supplierId==='unspecified'?null:form.supplierId, lastSupplierName: form.supplierName, lastUnitCost: parseFloat(form.unitCost)||0, averageCost: parseFloat(form.unitCost)||0 });
  };

  const hasStock = !item && form.initialStock!=='' && parseInt(form.initialStock)>0;
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
          {/* TODO: MongoDB — Replace with GET /api/masterlist (search endpoint) */}
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
                    placeholder="Click to select from masterlist..."
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
                  // Flatten masterlist to searchable product entries
                  // TODO: MongoDB — this filtering moves to server-side search
                  const q = masterlistInput.toLowerCase();
                  const entries = [];
                  (masterlist||[]).forEach(cat => {
                    (cat.products||[]).forEach(prod => {
                      if (!q || cat.name.toLowerCase().includes(q) || prod.name.toLowerCase().includes(q)) {
                        entries.push({ catId: cat.id, catName: cat.name, prodId: prod.id, prodName: prod.name, variants: prod.variants||[] });
                      }
                    });
                  });
                  return (
                    <div className="combobox-menu" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                      {entries.length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--gray)', fontSize: '0.875rem', textAlign: 'center' }}>
                          {(masterlist||[]).length === 0
                            ? 'Masterlist is empty. Add categories and products in Item Masterlist first.'
                            : `No results for "${masterlistInput}"`}
                        </div>
                      ) : entries.map(e => (
                        <button key={`${e.catId}-${e.prodId}`} type="button" className="combobox-item"
                          onClick={() => {
                            // Auto-fill name and category from masterlist selection
                            // TODO: MongoDB — on select, fetch full product details from API
                            setSelectedMasterlistItem(e);
                            setMasterlistInput(`${e.catName} - ${e.prodName}`);
                            setShowMasterlistDrop(false);
                            setSkuLocked(false); // allow SKU regeneration
                            prevSKUKeyRef.current = ''; // reset SKU key
                            setForm(p => ({ ...p, name: e.prodName, category: e.catName }));
                          }}>
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--white)' }}>{e.prodName}</span>
                            <span style={{ color: 'var(--gray)', marginLeft: '0.5rem', fontSize: '0.8rem' }}>{e.catName}</span>
                          </div>
                          {e.variants.length > 0 && (
                            <div style={{ marginTop: '0.2rem' }}>
                              {e.variants.map((v, i) => (
                                <span key={i} style={{ fontSize: '0.68rem', color: 'var(--gold)', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.25)', padding: '0.1rem 0.35rem', borderRadius: '3px', marginRight: '0.25rem' }}>{v}</span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {/* Masterlist selection info */}
              {selectedMasterlistItem && (
                <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.75rem', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '6px', fontSize: '0.8rem' }}>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>Selected:</span>
                  <span style={{ color: 'var(--white)', marginLeft: '0.5rem' }}>{selectedMasterlistItem.catName} - {selectedMasterlistItem.prodName}</span>
                  {selectedMasterlistItem.variants.length > 0 && (
                    <span style={{ color: 'var(--gray)', marginLeft: '0.5rem' }}>
                      · Variants: {selectedMasterlistItem.variants.join(', ')} (tracked in Add Product, not in inventory)
                    </span>
                  )}
                </div>
              )}
              {!selectedMasterlistItem && masterlistInput && (
                <p className="form-hint" style={{ color: '#f59e0b' }}>
                  Select from the list above, or add this product to the masterlist first.
                </p>
              )}
              {(masterlist||[]).length === 0 && (
                <p className="form-hint" style={{ color: '#f87171' }}>
                  No masterlist items yet. Click <strong style={{ color: 'var(--white)' }}>Item Masterlist</strong> button to set up your categories and products first.
                </p>
              )}
            </div>
          )}

          {/* ── Name + Category (auto-filled from masterlist, locked when selected) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Product Name <span className="required">*</span>
                {(isLinked || !!selectedMasterlistItem) && <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '0.5rem' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.2rem' }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>{selectedMasterlistItem ? 'from Masterlist' : 'Locked (in use)'}</span>}
              </label>
              <input type="text" className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Ceramic Mug, Magic Mug..." maxLength={80} required
                readOnly={isLinked || !!selectedMasterlistItem}
                style={(isLinked || !!selectedMasterlistItem) ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
              <p className="form-hint">
                {isLinked ? 'Linked to products or sales. Name cannot be changed.'
                  : selectedMasterlistItem ? 'Auto-filled from Masterlist. Clear selection above to change.'
                  : 'Auto-formatted to Proper Case. Duplicate name+category not allowed.'}
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Category <span className="required">*</span>
                {(isLinked || !!selectedMasterlistItem) && <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '0.5rem' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.2rem' }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>{selectedMasterlistItem ? 'from Masterlist' : 'Locked (in use)'}</span>}
              </label>
              {showNewCat ? (
                <div>
                  <input type="text" className="form-input" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g., Mugs, Shirts..." autoFocus
                    onKeyDown={e => { if (e.key==='Enter') { e.preventDefault(); if (newCatName.trim()) { onAddCategory(newCatName.trim()); setForm(p => ({ ...p, category: newCatName.trim() })); setShowNewCat(false); setNewCatName(''); } } if (e.key==='Escape') { setShowNewCat(false); setNewCatName(''); } }} />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button type="button" className="btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => { if (newCatName.trim()) { onAddCategory(newCatName.trim()); setForm(p => ({ ...p, category: newCatName.trim() })); setShowNewCat(false); setNewCatName(''); } }}>Add</button>
                    <button type="button" className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => { setShowNewCat(false); setNewCatName(''); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="combobox-root" ref={catRef}>
                  <div className="combobox-field">
                    <input type="text" className="form-input" value={form.category} readOnly
                      onClick={() => !isLinked && !selectedMasterlistItem && setShowCatDropdown(o => !o)}
                      placeholder={categories.length === 0 ? "Click to add a category..." : "Select a category..."}
                      style={(isLinked || !!selectedMasterlistItem) ? { opacity: 0.6, cursor: 'not-allowed' } : { cursor: 'pointer' }}
                      disabled={isLinked || !!selectedMasterlistItem} />
                    <button type="button" className="combobox-toggle"
                      onClick={() => !isLinked && !selectedMasterlistItem && setShowCatDropdown(o => !o)}
                      disabled={isLinked || !!selectedMasterlistItem}>{showCatDropdown ? '▲' : '▼'}</button>
                  </div>
                  {showCatDropdown && !isLinked && (
                    <div className="combobox-menu" style={{ maxHeight: '200px' }}>
                      {categories.length === 0 && (
                        <div style={{ padding: '0.75rem 1rem', color: 'var(--gray)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                          No categories yet — add one below.
                        </div>
                      )}
                      {categories.map(cat => (
                        <button key={cat} type="button" className={`combobox-item${cat===form.category?' active':''}`} onClick={() => { setForm(p => ({ ...p, category: cat })); setShowCatDropdown(false); }}>{cat}</button>
                      ))}
                      <button type="button" className="combobox-item combobox-add" onClick={() => { setShowCatDropdown(false); setShowNewCat(true); }}><span>+</span> Add New Category...</button>
                    </div>
                  )}
                </div>
              )}
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
          {hasStock && (
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
                  {form.isBulkPurchase && form.totalCost && form.initialStock && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <p className="form-hint" style={{ color: 'var(--gold)' }}>
                        Unit Cost: ₱{formatPrice(parseFloat(form.totalCost)/(parseInt(form.initialStock)||1))}
                      </p>
                      {form.damagedOnArrival && parseInt(form.damagedOnArrival) > 0 && (
                        <>
                          <p className="form-hint" style={{ color: 'var(--gold)', marginTop: '0.25rem' }}>
                            Total Invoice: ₱{formatPrice(parseFloat(form.totalCost))} (includes {form.damagedOnArrival} damaged)
                          </p>
                          <p className="form-hint" style={{ color: 'var(--gold)', marginTop: '0.25rem' }}>
                            Usable Stock Value: ₱{formatPrice(parseFloat(form.totalCost)/(parseInt(form.initialStock)||1) * ((parseInt(form.initialStock)||1) - parseInt(form.damagedOnArrival)))} ({(parseInt(form.initialStock)||1) - parseInt(form.damagedOnArrival)} pcs × ₱{formatPrice(parseFloat(form.totalCost)/(parseInt(form.initialStock)||1))})
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {!form.isBulkPurchase && form.unitCost && form.initialStock && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <p className="form-hint" style={{ color: 'var(--gold)' }}>
                        Total Invoice: ₱{formatPrice(parseFloat(form.unitCost)*(parseInt(form.initialStock)||0))} ({form.initialStock} pcs × ₱{form.unitCost})
                      </p>
                      {form.damagedOnArrival && parseInt(form.damagedOnArrival) > 0 && (
                        <>
                          <p className="form-hint" style={{ color: '#f87171', marginTop: '0.25rem' }}>
                            Less Damaged: {form.damagedOnArrival} pcs (₱{formatPrice(parseFloat(form.unitCost)*parseInt(form.damagedOnArrival))})
                          </p>
                          <p className="form-hint" style={{ color: '#f87171', marginTop: '0.25rem' }}>
                            Usable Stock: {parseInt(form.initialStock) - parseInt(form.damagedOnArrival)} pcs = ₱{formatPrice(parseFloat(form.unitCost)*(parseInt(form.initialStock) - parseInt(form.damagedOnArrival)))}
                          </p>
                        </>
                      )}
                    </div>
                  )}
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
                  <div style={{ marginTop: '0.75rem', position: 'relative', display: 'inline-block' }}>
                    <img src={form.receiptImage} alt="Receipt preview" style={{ maxHeight: '120px', maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--border)' }} />
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
function StockAdditionModal({ isOpen, onClose, onConfirm, item, suppliers, categories, onAddSupplier, submitting = false }) {
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
    setPending({ quantity: goodQty, damagedOnArrival: d, supplierId: supplierId==='unspecified'?null:supplierId, supplierName, invoiceNumber: invoice, deliveryDate, unitCost: cost, totalCost: goodQty*cost, notes, batchData: { batchId, supplierId: supplierId==='unspecified'?null:supplierId, supplierName, invoiceNumber: invoice, dateReceived: deliveryDate, originalQty: q, goodQty, damagedQty: d, remainingQty: goodQty, unitCost: cost, totalCost: goodQty*cost, notes, status: 'active' } });
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
            <p style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '1rem' }}>
              Good stock to add: {parseInt(qty)-parseInt(damaged)} pcs
            </p>
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
                {isBulk && totalCost && qty && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <p className="form-hint" style={{ color: 'var(--gold)' }}>
                      Unit Cost: ₱{formatPrice(parseFloat(totalCost)/(parseInt(qty)||1))}
                    </p>
                    {damaged && parseInt(damaged) > 0 && (
                      <>
                        <p className="form-hint" style={{ color: 'var(--gold)', marginTop: '0.25rem' }}>
                          Total Invoice: ₱{formatPrice(totalCost)} (includes {damaged} damaged)
                        </p>
                        <p className="form-hint" style={{ color: 'var(--gold)', marginTop: '0.25rem' }}>
                          Usable Stock Value: ₱{formatPrice(parseFloat(totalCost)/(parseInt(qty)||1) * ((parseInt(qty)||1) - parseInt(damaged)))} ({(parseInt(qty)||1) - parseInt(damaged)} pcs × ₱{formatPrice(parseFloat(totalCost)/(parseInt(qty)||1))})
                        </p>
                      </>
                    )}
                  </div>
                )}
                {!isBulk && unitCost && qty && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <p className="form-hint" style={{ color: 'var(--gold)' }}>
                      Total Invoice: ₱{formatPrice(parseFloat(unitCost)*(parseInt(qty)||0))} ({qty} pcs × ₱{unitCost})
                    </p>
                    {damaged && parseInt(damaged) > 0 && (
                      <>
                        <p className="form-hint" style={{ color: '#f87171', marginTop: '0.25rem' }}>
                          Less Damaged: {damaged} pcs (₱{formatPrice(parseFloat(unitCost)*parseInt(damaged))})
                        </p>
                        <p className="form-hint" style={{ color: 'var(--gold)', marginTop: '0.25rem' }}>
                          Usable Stock: {parseInt(qty) - parseInt(damaged)} pcs = ₱{formatPrice(parseFloat(unitCost)*(parseInt(qty) - parseInt(damaged)))}
                        </p>
                      </>
                    )}
                  </div>
                )}
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
                <div style={{ marginTop: '0.75rem', position: 'relative', display: 'inline-block' }}>
                  <img src={receiptImage} alt="Receipt preview" style={{ maxHeight: '120px', maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--border)' }} />
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
              <button type="button" className="btn-secondary" onClick={() => setShowConfirm(false)} disabled={submitting}>Cancel</button>
              <button type="button" className="btn-primary"
                onClick={() => { onConfirm(pending); setShowConfirm(false); setPending(null); onClose(); }}
                disabled={submitting}>
                {submitting ? 'Adding...' : 'Confirm Addition'}
              </button>
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
function StockReductionModal({ isOpen, onClose, onConfirm, item, inventory, submitting = false }) {
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
  const [infoModal, setInfoModal] = useState(null);
  const reasonRef = useRef(null);

  const batches = useMemo(() => {
    if (!inventory || !item) return [];
    const inv = inventory.find(i => i.id === item.id);
    return (inv?.batches||[]).filter(b => b.remainingQty > 0).sort((a, b) => new Date(a.dateReceived)-new Date(b.dateReceived));
  }, [inventory, item]);

  useEffect(() => { if (batches.length > 0) { setBatchId(batches[0].batchId); setSelectedBatch(batches[0]); } }, [batches]);
  useEffect(() => { const b = batches.find(b => b.batchId===batchId); setSelectedBatch(b||null); }, [batchId, batches]);
  useEffect(() => { if (isOpen && item) { setReason('sales-outside'); setQty(''); setSellingPrice(''); setSaleDate(new Date().toISOString().split('T')[0]); setRemarks(''); setCustomer(''); setShowConfirm(false); setPending(null); } }, [isOpen, item]);
  useEffect(() => { const h = (e) => { if (reasonRef.current && !reasonRef.current.contains(e.target)) setShowReasonDrop(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);

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

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">Reduce Stock — {item.name}</h2>
          <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid var(--primary)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Reducing stock for:</div>
            <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '1rem' }}>{item.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>{item.category} · Current stock: <strong style={{ color: 'var(--white)' }}>{item.stockQty} pcs</strong></div>
          </div>
          {/* Reason */}
          <div className="form-group">
            <label className="form-label">Reason <span className="required">*</span></label>
            <div className="combobox-root" ref={reasonRef}>
              <div className="combobox-field" onClick={() => setShowReasonDrop(o => !o)} style={{ cursor: 'pointer' }}>
                <input type="text" className="form-input" value={labels[reason]} readOnly style={{ cursor: 'pointer' }} />
                <button type="button" className="combobox-toggle">{showReasonDrop ? '▲' : '▼'}</button>
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
              <select className="form-input" value={batchId} onChange={e => setBatchId(e.target.value)}
                style={{ background: 'var(--dark)', borderColor: 'var(--border)', color: 'var(--white)', fontFamily: 'monospace' }}>
                {batches.map(b => (
                  <option key={b.batchId} value={b.batchId} style={{ background: 'var(--dark)' }}>
                    {b.batchId} | {new Date(b.dateReceived).toLocaleDateString()} | {b.remainingQty} pcs @ ₱{formatPrice(b.unitCost)}
                  </option>
                ))}
              </select>

              {/* FIFO spillover info */}
              {selectedBatch && qty && parseInt(qty) > 0 && (() => {
                const q = parseInt(qty);
                const fromSelected = Math.min(q, selectedBatch.remainingQty);
                const spillover = q - fromSelected;
                const nextBatches = batches.filter(b => b.batchId !== batchId);
                const totalAvailable = batches.reduce((s, b) => s + (b.remainingQty || 0), 0);

                return (
                  <div style={{ marginTop: '0.75rem' }}>
                    {/* Return value from selected batch */}
                    <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: 'var(--gray)' }}>Invoice: <strong style={{ color: 'var(--white)' }}>{selectedBatch.invoiceNumber || 'N/A'}</strong></span>
                      <span style={{ color: 'var(--gray)', marginLeft: '1rem' }}>
                        From this batch: <strong style={{ color: '#d97706' }}>₱{formatPrice(selectedBatch.unitCost * fromSelected)}</strong>
                        <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}> ({fromSelected} pcs × ₱{formatPrice(selectedBatch.unitCost)})</span>
                      </span>
                    </div>

                    {/* FIFO spillover warning */}
                    {spillover > 0 && (
                      <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '6px', padding: '0.6rem 0.75rem', marginTop: '0.5rem' }}>
                        {nextBatches.length > 0 ? (
                          <>
                            <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.25rem' }}>
                              ⚡ FIFO Spillover: {fromSelected} pcs from this batch + {spillover} pcs from next batch
                            </div>
                            {nextBatches.slice(0, 2).map(nb => {
                              const fromNext = Math.min(spillover, nb.remainingQty);
                              return (
                                <div key={nb.batchId} style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
                                  → {nb.batchId}: {fromNext} pcs @ ₱{formatPrice(nb.unitCost)} = ₱{formatPrice(nb.unitCost * fromNext)}
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: '#f87171', fontWeight: 600 }}>
                            ⚠ Not enough stock across all batches. Available: {totalAvailable} pcs
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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
          {reason === 'damaged' && (
            <div className="form-group">
              <label className="form-label">Cause / Description <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span></label>
              <textarea className="form-textarea" value={remarks} onChange={e => setRemarks(e.target.value.slice(0, 300))} placeholder="e.g., Dropped during packing, product defect..." maxLength={300} rows={2} />
            </div>
          )}
        </div>
        <div className="modal-actions">
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
              <button type="button" className="btn-secondary" onClick={() => setShowConfirm(false)} disabled={submitting}>Cancel</button>
              <button type="button" className="btn-primary"
                onClick={() => { onConfirm(pending); setShowConfirm(false); setPending(null); onClose(); }}
                disabled={submitting}>
                {submitting ? 'Processing...' : pending.reason==='sales-outside' ? 'Confirm Sale' : 'Confirm Reduction'}
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
  const { token } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [showAdjustmentSuccess, setShowAdjustmentSuccess] = useState(false);
  const [additionItem, setAdditionItem] = useState(null);
  const [showAdditionModal, setShowAdditionModal] = useState(false);
  const [showManageSuppliersModal, setShowManageSuppliersModal] = useState(false);
  const [masterlist, setMasterlist] = useState([]);
  const [showMasterlistModal, setShowMasterlistModal] = useState(false);
  const [showBatchDetailsModal, setShowBatchDetailsModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedBatchItem, setSelectedBatchItem] = useState(null);
  const [infoModal, setInfoModal] = useState(null);

  // Load inventory, suppliers, and products from API on mount
  useEffect(() => {
    if (!token) return;
    async function loadData() {
      try {
        // Load inventory
        const inventoryResponse = await fetchInventory(token);
        const inventoryData = Array.isArray(inventoryResponse)
          ? inventoryResponse : [];
        setInventory(Array.isArray(inventoryData) ? inventoryData : []);

        // Load categories (derive from inventory or use default)
        const inventoryCategories = inventoryData
          ? [...new Set(inventoryData.map(item => item.category).filter(Boolean))]
          : [];
        setCategories(inventoryCategories.length > 0 ? inventoryCategories : DEFAULT_CATEGORIES);

        // Load suppliers
        const suppliersResponse = await fetchSuppliers(token);
        const suppliersData = Array.isArray(suppliersResponse)
          ? suppliersResponse : [];
        setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);

        // Load masterlist
        try {
          const masterlistData = await fetchMasterlist(token);
          if (Array.isArray(masterlistData) && masterlistData.length > 0) {
            setMasterlist(masterlistData);
            setCategories(masterlistData.map(c => c.name));
          }
        } catch {
          // masterlist load failure is non-fatal — keep empty default
        }

        // Load products for linkage checks
        try {
          const productsResponse = await fetchProducts(token);
          const productsData = Array.isArray(productsResponse)
            ? productsResponse : [];
          setProducts(Array.isArray(productsData) ? productsData : []);
        } catch (prodError) {
          console.error('Failed to load products (linkage checks will be unavailable):', prodError);
          setProducts([]);
        }
      } catch (error) {
        console.error('Failed to load inventory data:', error);
        // Fallback to empty state on error
        setInventory([]);
        setCategories(DEFAULT_CATEGORIES);
        setSuppliers([]);
        setProducts([]);
      } finally {
        setIsLoaded(true);
      }
    }

    loadData();
  }, []);

  // NEW: Handle Add Supplier - Uses API
  const handleAddSupplier = async (supplierData) => {
    try {
      const created = await createSupplier(supplierData, token);
      setSuppliers(prev => [...prev, created]);
      return created;
    } catch (error) {
      console.error('Failed to add supplier:', error);
      setInfoModal({ title: 'Failed to Add Supplier', message: error.message || 'Unknown error occurred while adding the supplier.' });
      return null;
    }
  };

  // NEW: Toggle expand/collapse row
  const toggleExpand = (itemId) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  // Filter inventory based on search query and status filter
  // NEW: By default, only show active items (isActive: true)
  const filteredInventory = inventory.filter(item => {
    // EXCLUDE archived items by default
    if (item.isActive === false) return false;

    const query = searchQuery.toLowerCase();
    const matchesSearch = (item.name || '').toLowerCase().includes(query) || (item.category || '').toLowerCase().includes(query);

    // Status filter
    let matchesStatus = true;
    if (statusFilter === 'low-stock') {
      matchesStatus = item.stockQty > 0 && item.stockQty <= item.minStockLevel;
    } else if (statusFilter === 'out-of-stock') {
      matchesStatus = item.stockQty === 0;
    }

    return matchesSearch && matchesStatus;
  });

  // NEW: Event listener for opening batch details modal
  useEffect(() => {
    const handleOpenBatchDetails = (event) => {
      const { batch, item } = event.detail;
      setSelectedBatch(batch);
      setSelectedBatchItem(item);
      setShowBatchDetailsModal(true);
    };

    window.addEventListener('openBatchDetails', handleOpenBatchDetails);

    return () => {
      window.removeEventListener('openBatchDetails', handleOpenBatchDetails);
    };
  }, []);

  // TODO: MongoDB — POST /api/categories (now derived from masterlist, kept for backward compat)
  const handleAddCategory = (cat) => {
    // When called from InventoryModal (manual add) — also add to masterlist as standalone category
    if (categories.some(c => c.toLowerCase() === cat.toLowerCase())) return;
    const updated = [...categories, cat];
    setCategories(updated);
    // TODO: Call API to save category when backend endpoint exists
  };

  // TODO: MongoDB — Each action inside maps to its own API endpoint (see ItemMasterlistModal)
  const handleSaveMasterlist = async (updatedList) => {
    setMasterlist(updatedList);
    const derivedCats = updatedList.map(c => c.name);
    setCategories(derivedCats);
    try {
      await saveMasterlist(updatedList, token);
    } catch (err) {
      console.error('Failed to persist masterlist:', err);
    }
  };

  const archivedInventory = inventory.filter(i => i.isActive === false);

  // Summary stats
  const activeItems = inventory.filter(i => i.isActive !== false).length;
  const lowStockItems = inventory.filter(i => i.isActive !== false && i.stockQty > 0 && i.stockQty <= i.minStockLevel).length;
  const outOfStockItems = inventory.filter(i => i.isActive !== false && i.stockQty === 0).length;
  const archivedCount = archivedInventory.length;

  const handleAddNew = () => { setEditingItem(null); setPendingItemData(null); setIsConfirmModalOpen(false); setModalKey(p => p + 1); setIsModalOpen(true); };
  const handleEdit = (item) => { setEditingItem(item); setIsModalOpen(true); };

  // Check for linked products and sales history before delete
  const handleDelete = async (item) => {
    const linkedProducts = products.filter(p => p.inventoryId === item.id);

    // Fetch orders to check for sales history
    let hasSales = false;
    try {
      const allOrders = await fetchAllOrders({}, token);
      hasSales = allOrders.some(o =>
        o.items?.some(i => i.inventoryId === item.id)
      );
    } catch (error) {
      console.error('Failed to fetch orders for sales check:', error);
      // Fail safe: if we can't verify, assume there might be sales
      hasSales = true;
    }
    setReferencingProducts(linkedProducts);
    setHasSalesHistory(hasSales);
    setArchiveItem(item);
    setShowArchiveModal(true);
  };

  // NEW: Archive item (soft delete) - Uses API
  const handleArchive = async () => {
    if (!archiveItem || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Archive via API (sets isActive: false)
      const id = archiveItem.id || archiveItem._id;
      await deleteInventory(id, token);

      // Auto-archive products linked to this inventory item
      try {
        const allProducts = await fetchProducts(token);
        const linkedProducts = allProducts.filter(p =>
          p.inventoryId === id ||
          p.inventoryId === archiveItem?.id
        );
        if (linkedProducts.length > 0) {
          await Promise.all(
            linkedProducts.map(p =>
              updateProduct(p._id || p.id, {
                isPublished: false,
                isArchived: true,
                updatedAt: new Date().toISOString()
              })
            )
          );
        }
      } catch (productErr) {
        // Don't block main archive if product update fails
        console.warn('Could not auto-archive linked products:', productErr.message);
      }

      // Update local state
      setInventory(prev =>
        prev.map(item =>
          (item.id === id || item._id === id)
            ? { ...item, isActive: false, deletedAt: new Date() }
            : item
        )
      );

      // Close modal and reset
      setShowArchiveModal(false);
      setArchiveItem(null);
      setReferencingProducts([]);
    } catch (error) {
      console.error('Failed to archive item:', error);
      setInfoModal({ title: 'Failed to Archive', message: error.message || 'Unknown error occurred while archiving the item.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Permanent Delete (only if not referenced) - Uses API
  const handlePermanentDelete = async () => {
    if (!archiveItem || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Delete permanently via API
      const id = archiveItem.id || archiveItem._id;
      await deleteInventory(id, token);

      // Remove from local state
      setInventory(prev => prev.filter(item =>
        item.id !== id && item._id !== id
      ));

      // Close modal and reset
      setShowArchiveModal(false);
      setArchiveItem(null);
      setReferencingProducts([]);
    } catch (error) {
      console.error('Failed to delete item:', error);
      setInfoModal({ title: 'Failed to Delete', message: error.message || 'Unknown error occurred while deleting the item.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // NEW: Restore archived item - Uses API
  const handleRestore = async (item) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const id = item.id || item._id;

      // Call API to restore item
      const restored = await updateInventory(id, {
        isActive: true,
        deletedAt: null,
        updatedAt: new Date().toISOString()
      }, token);

      // Update local state with restored item
      setInventory(prev => prev.map(i =>
        (i.id === id || i._id === id)
          ? { ...i, ...restored, isActive: true, deletedAt: null }
          : i
      ));

    } catch (error) {
      console.error('Failed to restore item:', error);
      setInfoModal({ title: 'Failed to Restore', message: error.message || 'Unknown error occurred while restoring the item.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // NEW: Handle stock adjustment (Manual Stock Out) - Uses API
  const handleStockAdjustment = async (adjustmentData) => {
    if (!adjustmentItem) return;
    const { reason, quantity, sellingPrice, saleDate, remarks, customerName, batchId, batchData } = adjustmentData;
    const newStock = Math.max(0, adjustmentItem.stockQty - quantity);

    try {
      const id = adjustmentItem.id || adjustmentItem._id;

      // Prepare adjustment data for API
      const adjustData = {
        adjustmentType: 'subtract',
        quantity: quantity,
        reason: reason,
        batchId: batchId,
        sellingPrice: reason === 'sales-outside' ? sellingPrice : null,
        saleDate: reason === 'sales-outside' ? saleDate : null,
        customerName: reason === 'sales-outside' ? customerName : null,
        remarks: remarks,
      };

      // Call API to adjust stock
      const updated = await adjustInventoryStock(id, adjustData);

      // Update local state with updated item
      setInventory(prev => prev.map(item =>
        (item.id === id || item._id === id)
          ? { ...item, ...updated }
          : item
      ));

      // Close modal
      setShowAdjustmentModal(false);
      setAdjustmentItem(null);

      // Show success message
      setShowAdjustmentSuccess(true);
    } catch (error) {
      console.error('Failed to adjust stock:', error);
      setInfoModal({ title: 'Failed to Adjust Stock', message: error.message || 'Unknown error occurred while adjusting stock.' });
    }
  };

  // NEW: Handle stock addition (Manual Stock In) - Uses API
  const handleStockAddition = async (additionData) => {
    if (!additionItem || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const id = additionItem.id || additionItem._id;

      const updated = await adjustInventoryStock(id, {
        adjustmentType: 'add',
        quantity:       Math.abs(additionData.quantity),
        reason:         'restock',
        supplierId:     additionData.supplierId || null,
        supplierName:   additionData.supplierName || null,
        unitCost:       additionData.unitCost
                          ? parseFloat(additionData.unitCost)
                          : null,
        invoiceNumber:  additionData.invoiceNumber || null,
        deliveryDate:   additionData.deliveryDate || null,
        batchId:        additionData.batchData?.batchId || null,
        remarks:        additionData.notes || null,
      });

      // Update local state with updated item
      setInventory(prev => prev.map(item =>
        (item.id === id || item._id === id)
          ? { ...item, ...updated }
          : item
      ));

      // Close modal
      setShowAdditionModal(false);
      setAdditionItem(null);

      // Show success message
      setShowAdjustmentSuccess(true);
    } catch (error) {
      console.error('Failed to add stock:', error);
      setInfoModal({ title: 'Failed to Add Stock', message: error.message || 'Unknown error occurred while adding stock.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // NEW: Handle stock reduction (Manual Stock Out / Sale) - Uses API
  const handleStockReduction = async (reductionData) => {
    if (!adjustmentItem || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const id = adjustmentItem.id || adjustmentItem._id;
      const { reason, quantity, sellingPrice, saleDate, remarks, customerName, batchId, batchData } = reductionData;

      // Prepare adjustment data for API
      const adjustData = {
        adjustmentType: 'subtract',
        quantity: quantity,
        reason: reason,
        batchId: batchId,
        sellingPrice: reason === 'sales-outside' ? sellingPrice : null,
        saleDate: reason === 'sales-outside' ? saleDate : null,
        customerName: reason === 'sales-outside' ? customerName : null,
        remarks: remarks,
      };

      // Call API to adjust stock
      const updated = await adjustInventoryStock(id, adjustData);

      // Update local state with updated item
      setInventory(prev => prev.map(item =>
        (item.id === id || item._id === id)
          ? { ...item, ...updated }
          : item
      ));

      // Close modal
      setShowAdjustmentModal(false);
      setAdjustmentItem(null);

      // Show success message
      setShowAdjustmentSuccess(true);
    } catch (error) {
      console.error('Failed to reduce stock:', error);
      setInfoModal({ title: 'Failed to Reduce Stock', message: error.message || 'Unknown error occurred while reducing stock.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle save from modal (shows confirm first)
  // TODO: MongoDB — POST /api/inventory or PUT /api/inventory/:id
  const handleSave = (itemData) => {
    // SKU: for new items, use the preview generated in modal. For edits, keep existing.
    const finalSKU = editingItem ? editingItem.sku : (itemData.sku || generateSKU(itemData.category, itemData.name));
    setPendingItemData({ ...itemData, id: editingItem ? editingItem.id : crypto.randomUUID(), sku: finalSKU, isActive: true });
    setIsConfirmModalOpen(true);
  };

  // Confirm the Add/Edit action - Uses API
  const handleConfirmSave = async () => {
    if (!pendingItemData) return;

    try {
      if (editingItem) {
        // Update existing item via API
        const id = editingItem.id || editingItem._id;
        const updated = await updateInventory(id, pendingItemData, token);
        setInventory(prev =>
          prev.map(item =>
            (item.id === id || item._id === id) ? updated : item
          )
        );
      } else {
        // Create new item via API
        const newItem = {
          ...pendingItemData,
          stockQty: parseInt(pendingItemData.initialStock) || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const created = await createInventory(newItem, token);
        setInventory(prev => [...prev, created]);
      }

      // Close all modals and reset
      setIsConfirmModalOpen(false);
      setIsModalOpen(false);
      setEditingItem(null);
      setPendingItemData(null);
    } catch (error) {
      console.error('Failed to save inventory item:', error);
      setInfoModal({ title: 'Failed to Save', message: error.message || 'Unknown error occurred while saving the inventory item.' });
    }
  };

  // Inline min stock level editing
  const handleInlineEditStart = (item) => setEditingInline({ id: item.id, value: String(item.minStockLevel) });
  const handleInlineEditSave = async () => {
    if (!editingInline) return;
    const newLevel = parseInt(editingInline.value) || 0;
    try {
      await updateInventory(editingInline.id, {
        minStockLevel: newLevel
      }, token);
      setInventory(prev => prev.map(i =>
        i.id === editingInline.id
          ? { ...i, minStockLevel: newLevel }
          : i
      ));
    } catch (error) {
      console.error('Failed to update min stock level:', error);
      setInfoModal({
        title: 'Failed to Update',
        message: error.message ||
          'Could not save minimum stock level.'
      });
    } finally {
      setEditingInline(null);
    }
  };

  const getStockStatus = (item) => {
    if (item.stockQty === 0) return { label: 'Out of Stock', cls: 'stock-status-out' };
    if (item.stockQty <= item.minStockLevel) return { label: 'Low Stock', cls: 'stock-status-low' };
    return { label: 'In Stock', cls: 'stock-status-ok' };
  };

  if (!isLoaded) return (
    <div className="page-content-wrapper">
      <div className="skeleton-page">
        <div className="skeleton-header">
          <div className="skeleton-title" />
          <div className="skeleton-subtitle" />
        </div>
        <div className="skeleton-cards">
          {[...Array(4)].map((_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
        <div className="skeleton-table">
          <div className="skeleton-table-header" />
          {[...Array(7)].map((_, i) => (
            <div className="skeleton-row" key={i}>
              <div className="skeleton-cell skeleton-cell-wide" />
              <div className="skeleton-cell skeleton-cell-mid" />
              <div className="skeleton-cell skeleton-cell-short" />
              <div className="skeleton-cell skeleton-cell-short" />
              <div className="skeleton-cell-badge" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
      {/* ── Page Header ────────────────────────────────────────────────────────── */}
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
                        <button className="btn-sm btn-secondary" onClick={() => handleEdit(item)} style={{ background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', borderRadius: '6px' }}>Edit</button>
                        <button className="btn-sm btn-danger" onClick={() => handleDelete(item)}>Remove</button>
                      </td>
                    </tr>
                    {isExpanded && <InventoryExpandRow item={item} colSpan={7} />}
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
                  const hasProducts = products.some(p => p.inventoryId === item.id);
                  const hasSales = false; // TODO: Add sales check when orders API is integrated
                  return (
                    <tr key={item.id} className="inventory-table-row" style={{ opacity: 0.5 }}>
                      <td className="table-cell-name"><span className="product-name" style={{ color: 'var(--gray)' }}>{item.name}</span><div style={{ fontSize: '0.73rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{item.sku||'—'}</div></td>
                      <td className="table-cell"><span className="category-badge" style={{ background: 'rgba(100,100,100,0.2)', color: 'var(--gray)' }}>{item.category}</span></td>
                      <td className="table-cell"><span style={{ color: 'var(--gray)' }}>{item.stockQty} pcs</span></td>
                      <td className="table-cell"><span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>{item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : '—'}</span></td>
                      <td className="table-cell-actions">
                        <button className="btn-sm btn-secondary" onClick={() => setRestoreItem(item)} disabled={isSubmitting}>Restore</button>
                        {!hasProducts && !hasSales && <button className="btn-sm btn-danger" onClick={() => handleDelete(item)}>Delete</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: '1rem', color: 'var(--gray)', fontSize: '0.875rem', fontStyle: 'italic' }}>
            ⚠ Items with sales history or linked products cannot be permanently deleted to preserve data integrity.
          </p>
        </div>
      )}

      {/* ── All Modals ─────────────────────────────────────────────────────────── */}

      <InventoryModal key={modalKey} isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingItem(null); }}
        onSave={handleSave} onEdit={(existing) => { setEditingItem(existing); setIsModalOpen(true); }}
        onRestoreItem={handleRestore} item={editingItem} editingItem={editingItem}
        categories={categories} onAddCategory={handleAddCategory}
        inventory={inventory} suppliers={suppliers} onAddSupplier={handleAddSupplier}
        masterlist={masterlist} products={products} />

      <ConfirmSaveModal isOpen={isConfirmModalOpen} onClose={() => { setIsConfirmModalOpen(false); setPendingItemData(null); }}
        onConfirm={handleConfirmSave} itemData={pendingItemData} isEdit={!!editingItem} />

      <ArchiveConfirmModal isOpen={showArchiveModal}
        onClose={() => { if (!isSubmitting) { setShowArchiveModal(false); setArchiveItem(null); setReferencingProducts([]); setHasSalesHistory(false); } }}
        onArchive={handleArchive} onDelete={handlePermanentDelete}
        itemName={archiveItem?.name} isReferenced={referencingProducts.length > 0}
        referencingProductsCount={referencingProducts.length} hasSalesHistory={hasSalesHistory} />

      <ConfirmModal isOpen={!!restoreItem} onClose={() => !isSubmitting && setRestoreItem(null)}
        onConfirm={() => { handleRestore(restoreItem); setRestoreItem(null); }}
        title="Restore Item" confirmLabel={isSubmitting ? 'Restoring...' : 'Restore'}
        message={`Restore "${restoreItem?.name}" from archive? It will be available for use again.`} />

      <StockReductionModal isOpen={showAdjustmentModal}
        onClose={() => { setShowAdjustmentModal(false); setAdjustmentItem(null); }}
        onConfirm={handleStockReduction} item={adjustmentItem} inventory={inventory}
        submitting={isSubmitting} />

      <StockAdditionModal isOpen={showAdditionModal}
        onClose={() => { setShowAdditionModal(false); setAdditionItem(null); }}
        onConfirm={handleStockAddition} item={additionItem}
        suppliers={suppliers} categories={categories} onAddSupplier={handleAddSupplier}
        submitting={isSubmitting} />

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
        onAdd={async (data) => {
          if (isSubmitting) return;
          setIsSubmitting(true);
          try {
            const s = await handleAddSupplier(data);
            if (s) {
              setSuppliers(prev => [...prev, s]);
            }
          } catch (error) {
            console.error('Failed to add supplier in modal:', error);
          } finally {
            setIsSubmitting(false);
          }
        }}
        onUpdate={async (id, data) => {
          if (isSubmitting) return;
          setIsSubmitting(true);
          try {
            await updateSupplier(id, data, token);
            setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
          } catch (error) {
            console.error('Failed to update supplier in modal:', error);
          } finally {
            setIsSubmitting(false);
          }
        }}
        onDelete={async (id) => {
          if (isSubmitting) return;
          setIsSubmitting(true);
          try {
            await deleteSupplier(id, token);
            setSuppliers(prev => prev.filter(s => s.id !== id));
          } catch (error) {
            console.error('Failed to delete supplier in modal:', error);
          } finally {
            setIsSubmitting(false);
          }
        }} />

      <BatchDetailsModal batch={selectedBatch} item={selectedBatchItem}
        isOpen={showBatchDetailsModal} onClose={() => { setShowBatchDetailsModal(false); setSelectedBatch(null); setSelectedBatchItem(null); }} />

      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title||''} message={infoModal?.message||''} />
    </div>
    </ErrorBoundary>
  );
}