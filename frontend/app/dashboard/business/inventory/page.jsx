'use client';

import ErrorBoundary from '../../../../components/ErrorBoundary';

/**
 * INVENTORY MANAGEMENT PAGE
 *
 * Current Status: LocalStorage (Browser-only, for testing)
 * TODO: MongoDB Integration - Replace LocalStorage with Database
 *
 * Features:
 * - Add/Edit/Delete inventory items (blank materials)
 * - Inline editing for stock levels
 * - Status filtering (Low Stock, Out of Stock, Upon Order)
 * - Search by name or category
 * - Duplicate prevention (same Name + Category)
 * - Auto-formatting (Proper Case)
 *
 * MongoDB Integration Steps:
 * 1. Create MongoDB collection: 'inventory'
 * 2. Replace getInventoryList() → GET /api/inventory
 * 3. Replace saveInventoryList() → POST/PUT /api/inventory/:id
 * 4. Add API routes in app/api/inventory/route.js
 * 5. Add Mongoose schema in models/Inventory.js
 * 6. Remove LocalStorage references
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatNumber, formatPrice } from '../../../../src/utils/format';
import {
  fetchInventory,
  createInventory,
  updateInventory,
  adjustInventoryStock,
  deleteInventory,
  fetchSuppliers,
  createSupplier
} from '@/lib/inventoryApi';
import { fetchProducts, updateProduct } from '@/lib/productApi';

// ── Reusable Number Input Component ───────────────────────────────────────────
// Prevents negative values, e, E, -, +, and disables scroll wheel
function NumberInput({ value, onChange, min = 0, max, placeholder, className, disabled }) {
  const handleChange = (e) => {
    const val = e.target.value;
    // Allow empty string or valid non-negative number
    if (val === '' || /^-?\d*$/.test(val)) {
      const num = val === '' ? '' : Math.max(min, parseInt(val) || min);
      onChange({ ...e, target: { ...e.target, value: num } });
    }
  };

  const handleKeyDown = (e) => {
    // Block e, E, +, -
    if (['e', 'E', '+', '-', '.'].includes(e.key)) {
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
    />
  );
}

// ── LocalStorage Key ───────────────────────────────────────────────────────────
const INVENTORY_STORAGE_KEY = 'pmp_inventory';

// TODO: MongoDB - Replace with API calls
// CURRENT: LocalStorage helper functions (browser-only)
// FUTURE: Replace with API calls to MongoDB

// ── LocalStorage Helpers ───────────────────────────────────────────────────────
// TODO: MongoDB - Replace with API calls:
// - getInventoryList() → GET /api/inventory
// - saveInventoryList() → POST /api/inventory or PUT /api/inventory/:id
//
// Example MongoDB API implementation:
// ```javascript
// // app/api/inventory/route.js
// export async function GET() {
//   const inventory = await Inventory.find({}).sort({ name: 1 });
//   return NextResponse.json(inventory);
// }
//
// export async function POST(request) {
//   const body = await request.json();
//   const newItem = await Inventory.create(body);
//   return NextResponse.json(newItem);
// }
//
// export async function PUT(request) {
//   const { id, ...data } = await request.json();
//   const updated = await Inventory.findByIdAndUpdate(id, data, { new: true });
//   return NextResponse.json(updated);
// }
// ```
export function getInventoryList() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(INVENTORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading inventory from LocalStorage:', error);
    return [];
  }
}

// TODO: MongoDB - Replace with API call to save/update inventory item
// CURRENT: Saves to LocalStorage (browser-only, NOT persistent across devices)
// FUTURE: POST to MongoDB API
export function saveInventoryList(inventory) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(inventory));
  } catch (error) {
    console.error('Error saving inventory to LocalStorage:', error);
  }
}

// ── Categories ─────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  'Mugs',
  'T-Shirt',
  'Stickers',
  'Phone Cases',
  'Accessories',
  'Home & Living',
  'Stationery',
  'Others'
];

// ── LocalStorage Key for Categories ───────────────────────────────────────────
const CATEGORIES_STORAGE_KEY = 'pmp_inventory_categories';

// TODO: MongoDB - Replace with API calls
// CURRENT: Categories stored in LocalStorage (browser-only)
// FUTURE: Store categories in MongoDB as separate collection or derive from inventory
//
// Option 1: Separate categories collection
// - GET /api/categories - Fetch all categories
// - POST /api/categories - Add new category
//
// Option 2: Derive from inventory items
// - Use MongoDB aggregation: db.inventory.distinct("category")
// - No need to store categories separately

// ── Get Categories from LocalStorage ───────────────────────────────────────────
// TODO: MongoDB - Replace with API call: GET /api/categories
export function getCategories() {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES;
  try {
    const stored = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_CATEGORIES;
  } catch (error) {
    console.error('Error reading categories from LocalStorage:', error);
    return DEFAULT_CATEGORIES;
  }
}

// ── Save Categories to LocalStorage ────────────────────────────────────────────
// TODO: MongoDB - Replace with API call: POST /api/categories
export function saveCategories(categories) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  } catch (error) {
    console.error('Error saving categories to LocalStorage:', error);
  }
}

// ── Suppliers Management ───────────────────────────────────────────────────────
// NEW: Supplier tracking for cost and source tracking
const SUPPLIERS_STORAGE_KEY = 'pmp_suppliers';

// Default supplier option (like "Walk-in / Unspecified")
export const WALK_IN_SUPPLIER = {
  id: 'walk-in',
  name: '— Walk-in / Unspecified',
  contact: '',
  address: '',
  isSystem: true
};

export function getSuppliers() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(SUPPLIERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading suppliers from LocalStorage:', error);
    return [];
  }
}

export function saveSuppliers(suppliers) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(suppliers));
  } catch (error) {
    console.error('Error saving suppliers to LocalStorage:', error);
  }
}

export function addSupplier(supplier) {
  const suppliers = getSuppliers();
  const newSupplier = {
    ...supplier,
    id: supplier.id || `supplier-${Date.now()}`,
    phone: supplier.phone || '',
    createdAt: new Date().toISOString()
  };
  suppliers.push(newSupplier);
  saveSuppliers(suppliers);
  return newSupplier;
}

export function getSupplierById(id) {
  const suppliers = getSuppliers();
  return suppliers.find(s => s.id === id) || null;
}

// ── Stock History Management ──────────────────────────────────────────────────
// NEW: Track each stock addition with supplier and cost for audit trail
// FIFO: Track remaining quantity per batch
const STOCK_HISTORY_STORAGE_KEY = 'pmp_stock_history';

export function getStockHistory(inventoryId = null) {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STOCK_HISTORY_STORAGE_KEY);
    const history = stored ? JSON.parse(stored) : [];
    if (inventoryId) {
      return history.filter(h => h.inventoryId === inventoryId);
    }
    return history;
  } catch (error) {
    console.error('Error reading stock history from LocalStorage:', error);
    return [];
  }
}

export function addStockHistory(entry) {
  const history = getStockHistory();
  const newEntry = {
    ...entry,
    id: `history-${Date.now()}`,
    remainingQty: entry.quantity, // FIFO: Track remaining quantity
    createdAt: new Date().toISOString()
  };
  history.push(newEntry);
  saveStockHistory(history);
  return newEntry;
}

export function saveStockHistory(history) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STOCK_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Error saving stock history to LocalStorage:', error);
  }
}

// FIFO: Deduct from oldest batch first
export function deductStockFIFO(inventoryId, quantityToDeduct) {
  const history = getStockHistory(inventoryId);
  
  // Sort by date (oldest first) - FIFO
  const sortedHistory = history.sort((a, b) => 
    new Date(a.createdAt) - new Date(b.createdAt)
  );
  
  let remaining = quantityToDeduct;
  const updatedHistory = sortedHistory.map(batch => {
    if (remaining <= 0) return batch;
    
    const canDeduct = Math.min(batch.remainingQty || batch.quantity, remaining);
    const newRemaining = (batch.remainingQty || batch.quantity) - canDeduct;
    remaining -= canDeduct;
    
    return { ...batch, remainingQty: newRemaining };
  });
  
  saveStockHistory(updatedHistory);
  
  return {
    success: remaining === 0,
    deducted: quantityToDeduct - remaining,
    remaining: remaining
  };
}

// FIFO: Deduct from specific batch
export function deductStockFromBatch(inventoryId, batchId, quantityToDeduct) {
  const history = getStockHistory(inventoryId);
  
  // Find the specific batch
  const batchIndex = history.findIndex(h => h.batchId === batchId);
  if (batchIndex === -1) {
    return { success: false, error: 'Batch not found' };
  }
  
  const batch = history[batchIndex];
  const availableQty = batch.remainingQty || batch.quantity;
  
  if (availableQty < quantityToDeduct) {
    return { 
      success: false, 
      error: `Insufficient quantity in batch. Available: ${availableQty}, Requested: ${quantityToDeduct}`
    };
  }
  
  // Deduct from the batch
  const updatedHistory = [...history];
  updatedHistory[batchIndex] = {
    ...batch,
    remainingQty: availableQty - quantityToDeduct
  };
  
  saveStockHistory(updatedHistory);
  
  return {
    success: true,
    deducted: quantityToDeduct,
    remaining: quantityToDeduct - quantityToDeduct
  };
}

// Get current stock from FIFO batches
export function getCurrentStockFromFIFO(inventoryId) {
  const history = getStockHistory(inventoryId);
  return history.reduce((sum, h) => sum + (h.remainingQty || h.quantity), 0);
}

// Compute average cost for an inventory item
export function computeAverageCost(inventoryId) {
  const history = getStockHistory(inventoryId);
  if (history.length === 0) return 0;
  
  const totalCost = history.reduce((sum, h) => sum + ((h.totalCost || 0) * ((h.remainingQty || h.quantity) / h.quantity)), 0);
  const totalQty = history.reduce((sum, h) => sum + (h.remainingQty || h.quantity), 0);
  
  if (totalQty === 0) return 0;
  return totalCost / totalQty;
}

// ── Initial Sample Data ────────────────────────────────────────────────────────
// TODO: MongoDB - Remove this initial data when connecting to database
// This is only for testing purposes. In production, data will come from MongoDB.
const initialInventory = [];
// Example structure for MongoDB documents (for reference):
// {
//   _id: ObjectId,              // MongoDB auto-generates this
//   name: String,               // e.g., "Ceramic", "Magic Mug"
//   category: String,           // e.g., "Mugs", "T-Shirt"
//   stockQty: Number,           // Current stock quantity
//   minStockLevel: Number,      // Minimum stock threshold
//   isOnDemand: Boolean,        // true = Upon Order, false = Track Stock
//   isActive: Boolean,          // NEW: true = active, false = archived
//   deletedAt: Date | null,     // NEW: Timestamp when archived/deleted
//   createdAt: Date,            // Timestamp
//   updatedAt: Date             // Last update timestamp
// }

// ── Batch Details Modal Component (Resibo Format) ──────────────────────────────
// Displays batch details like a supplier invoice/delivery receipt
function BatchDetailsModal({ batch, item, isOpen, onClose }) {
  if (!isOpen || !batch || !item) return null;

  const movements = batch.movements || [];
  const sortedMovements = [...movements].sort((a, b) => 
    new Date(a.createdAt) - new Date(b.createdAt)
  );

  // Calculate summary statistics
  const totalReceived = movements.filter(m => m.type === 'received').reduce((sum, m) => sum + m.quantity, 0);
  const totalSold = movements.filter(m => m.type === 'sold').reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  const totalDamaged = movements.filter(m => m.type === 'damaged').reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  const returnCredit = totalDamaged * batch.unitCost;

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=800,height=600');
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Batch Details - ${batch.batchId}</title>
          <style>
            @media print {
              @page { margin: 0.5in; }
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 30px;
              color: #000;
              background: #fff;
              line-height: 1.5;
            }
            h1 {
              font-size: 20px;
              font-weight: bold;
              margin: 0 0 5px 0;
              text-align: center;
              text-transform: uppercase;
              color: #000;
            }
            h2 {
              font-size: 14px;
              margin: 0 0 20px 0;
              text-align: center;
              color: #666;
              font-weight: normal;
            }
            h3 {
              font-size: 14px;
              font-weight: bold;
              margin: 0 0 10px 0;
              text-transform: uppercase;
              border-bottom: 2px solid #000;
              padding-bottom: 5px;
            }
            .invoice-header {
              background: #f9fafb;
              padding: 15px;
              border: 2px solid #333;
              border-radius: 8px;
              margin-bottom: 20px;
            }
            .invoice-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
            }
            .label {
              font-size: 11px;
              color: #666;
              text-transform: uppercase;
              margin-bottom: 3px;
              font-weight: 600;
            }
            .value {
              font-size: 13px;
              color: #000;
              font-weight: 600;
            }
            .section {
              margin: 20px 0;
              padding: 15px;
              border: 2px solid #333;
              border-radius: 8px;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 15px;
              margin: 15px 0;
            }
            .summary-card {
              padding: 10px;
              background: #f3f4f6;
              border-radius: 6px;
              text-align: center;
            }
            .summary-label {
              font-size: 10px;
              color: #666;
              text-transform: uppercase;
              margin-bottom: 5px;
            }
            .summary-value {
              font-size: 16px;
              font-weight: 700;
              color: #000;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
              margin: 15px 0;
            }
            th {
              padding: 8px;
              text-align: center;
              border-bottom: 2px solid #000;
              font-weight: 600;
              font-size: 11px;
              text-transform: uppercase;
            }
            td {
              padding: 6px;
              border-bottom: 1px solid #ddd;
              text-align: center;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 2px solid #000;
              text-align: center;
              font-size: 10px;
              color: #666;
            }
            .type-badge {
              display: inline-block;
              padding: 3px 8px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
            }
            .type-received { background: #dcfce7; color: #16a34a; }
            .type-sold { background: #dbeafe; color: #2563eb; }
            .type-damaged { background: #fee2e2; color: #dc2626; }
            .type-other { background: #fef3c7; color: #d97706; }
          </style>
        </head>
        <body>
          <h1>Supplier Invoice / Delivery Receipt</h1>
          <h2>Batch Details - ${batch.batchId}</h2>
          
          <div class="invoice-header">
            <div class="invoice-grid">
              <div>
                <div class="label">Supplier</div>
                <div class="value">${batch.supplierName || 'N/A'}</div>
              </div>
              <div>
                <div class="label">Invoice Number</div>
                <div class="value">${batch.invoiceNumber || 'N/A'}</div>
              </div>
              <div>
                <div class="label">Delivery Date</div>
                <div class="value">${new Date(batch.dateReceived).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
              <div>
                <div class="label">Batch ID</div>
                <div class="value">${batch.batchId}</div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h3>Item Information</h3>
            <div class="invoice-grid">
              <div>
                <div class="label">Product Name</div>
                <div class="value">${item.name}</div>
              </div>
              <div>
                <div class="label">Category</div>
                <div class="value">${item.category}</div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h3>Stock Summary</h3>
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-label">Original Qty</div>
                <div class="summary-value">${batch.originalQty} pcs</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">Remaining</div>
                <div class="summary-value" style="color: ${batch.remainingQty === 0 ? '#dc2626' : '#d97706'}">${batch.remainingQty} pcs</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">Unit Cost</div>
                <div class="summary-value">₱${formatPrice(batch.unitCost)}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">Total Value</div>
                <div class="summary-value">₱${formatPrice(batch.totalCost)}</div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h3>Movement History</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Change</th>
                  <th>Remaining</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${sortedMovements.map(mov => `
                  <tr>
                    <td>${new Date(mov.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span class="type-badge type-${mov.type === 'received' ? 'received' : mov.type === 'sold' ? 'sold' : mov.type === 'damaged' ? 'damaged' : 'other'}">
                        ${mov.type}
                      </span>
                    </td>
                    <td style="color: ${mov.quantity > 0 ? '#16a34a' : '#dc2626'}; font-weight: 600;">
                      ${mov.quantity > 0 ? '+' : ''}${mov.quantity}
                    </td>
                    <td style="font-weight: 600;">${mov.remainingAfter} pcs</td>
                    <td>${mov.reason || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="section" style="background: #f9fafb;">
            <h3>Summary</h3>
            <div class="invoice-grid">
              <div>
                <div class="label">Total Received</div>
                <div class="value" style="color: #16a34a;">${totalReceived} pcs</div>
              </div>
              <div>
                <div class="label">Total Sold</div>
                <div class="value" style="color: #2563eb;">${totalSold} pcs</div>
              </div>
              <div>
                <div class="label">Total Damaged</div>
                <div class="value" style="color: #dc2626;">${totalDamaged} pcs</div>
              </div>
              <div>
                <div class="label">Return Credit</div>
                <div class="value" style="color: #d97706;">₱${formatPrice(returnCredit)}</div>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div><strong>Printed:</strong> ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div style="margin-top: 8px;">Internal Batch Record • For inventory tracking only</div>
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      onClose();
    }, 250);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '1000px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">{batch.batchId} - Batch Details</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Invoice Header */}
          <div style={{
            background: 'rgba(249, 250, 251, 0.1)',
            border: '2px solid var(--border)',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--white)', fontSize: '1.125rem', textTransform: 'uppercase', textAlign: 'center' }}>
              Supplier Invoice / Delivery Receipt
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Supplier</div>
                <div style={{ fontWeight: 600, color: 'var(--white)' }}>{batch.supplierName || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Invoice Number</div>
                <div style={{ fontWeight: 600, color: 'var(--white)' }}>{batch.invoiceNumber || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Delivery Date</div>
                <div style={{ fontWeight: 600, color: 'var(--white)' }}>
                  {new Date(batch.dateReceived).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Batch ID</div>
                <div style={{ fontWeight: 600, color: 'var(--white)', fontFamily: 'monospace' }}>{batch.batchId}</div>
              </div>
            </div>
          </div>

          {/* Item Information */}
          <div style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--white)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Item Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Product Name</div>
                <div style={{ fontWeight: 600, color: 'var(--white)' }}>{item.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Category</div>
                <div style={{ fontWeight: 600, color: 'var(--white)' }}>{item.category}</div>
              </div>
            </div>
          </div>

          {/* Stock Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Original Qty</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>{batch.originalQty} pcs</div>
            </div>
            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Remaining</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: batch.remainingQty === 0 ? '#f87171' : '#facc15' }}>
                {batch.remainingQty} pcs
              </div>
            </div>
            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Unit Cost</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)' }}>₱{formatPrice(batch.unitCost)}</div>
            </div>
            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Value</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)' }}>₱{formatPrice(batch.totalCost)}</div>
            </div>
          </div>

          {/* Movement History Table */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--white)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Movement History</h3>
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '6px'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>Date</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>Type</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>Change</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>Remaining</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMovements.map((mov, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>
                        {new Date(mov.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          background: mov.type === 'received' ? 'rgba(74, 222, 128, 0.2)' :
                                     mov.type === 'sold' ? 'rgba(99, 102, 241, 0.2)' :
                                     mov.type === 'damaged' ? 'rgba(248, 113, 113, 0.2)' :
                                     'rgba(250, 204, 21, 0.2)',
                          color: mov.type === 'received' ? '#4ade80' :
                                 mov.type === 'sold' ? '#6366f1' :
                                 mov.type === 'damaged' ? '#f87171' :
                                 '#facc15'
                        }}>
                          {mov.type}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', color: mov.quantity > 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                        {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', color: '#facc15', fontWeight: 600 }}>
                        {mov.remainingAfter} pcs
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                        {mov.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary Section */}
          <div style={{
            background: 'rgba(217, 119, 6, 0.1)',
            border: '2px solid rgba(217, 119, 6, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#d97706', fontSize: '0.875rem', textTransform: 'uppercase' }}>Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Total Received</div>
                <div style={{ fontWeight: 600, color: '#4ade80', fontSize: '1.125rem' }}>{totalReceived} pcs</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Total Sold</div>
                <div style={{ fontWeight: 600, color: '#6366f1', fontSize: '1.125rem' }}>{totalSold} pcs</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Total Damaged</div>
                <div style={{ fontWeight: 600, color: '#f87171', fontSize: '1.125rem' }}>{totalDamaged} pcs</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Return Credit</div>
                <div style={{ fontWeight: 600, color: '#d97706', fontSize: '1.125rem' }}>₱{formatPrice(returnCredit)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-primary" onClick={handlePrint}>
            Print Batch Details
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inventory Expand Row Component ────────────────────────────────────────────
// Shows supplier and cost history when row is expanded
// FIFO: Shows remaining quantity per batch with expandable movement history
function InventoryExpandRow({ item, colSpan }) {
  const history = getStockHistory(item.id);
  const scrollRef = useRef(null);
  const [expandedBatches, setExpandedBatches] = useState(new Set());

  // Toggle batch expansion
  const toggleBatchExpand = (batchId) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  // Group history by batch
  const batchesByDate = useMemo(() => {
    const batches = {};
    history.forEach(entry => {
      if (entry.batchId) {
        if (!batches[entry.batchId]) {
          batches[entry.batchId] = {
            batchId: entry.batchId,
            supplierId: entry.supplierId,
            supplierName: entry.supplierName,
            invoiceNumber: entry.invoiceNumber,
            dateReceived: entry.dateReceived || entry.createdAt,
            originalQty: 0,
            remainingQty: 0,
            unitCost: entry.unitCost || 0,
            totalCost: entry.totalCost || 0,
            movements: []
          };
        }
        batches[entry.batchId].movements.push(entry);
        
        // Track original qty from first received entry
        if (entry.type === 'received' && !batches[entry.batchId].originalQty) {
          batches[entry.batchId].originalQty = entry.quantity;
        }
        
        // Get latest remaining qty
        batches[entry.batchId].remainingQty = entry.remainingQty !== undefined ? entry.remainingQty : batches[entry.batchId].remainingQty;
      }
    });
    
    // Convert to array and sort by date (FIFO)
    return Object.values(batches).sort((a, b) => 
      new Date(a.dateReceived) - new Date(b.dateReceived)
    );
  }, [history]);

  // Auto-scroll to bottom to show summary when expanded
  useEffect(() => {
    if (scrollRef.current && batchesByDate.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [batchesByDate.length]);

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '1rem 1.25rem 1.25rem', display: 'block', width: '100%' }}>
          {/* Batch History */}
          {batchesByDate.length > 0 ? (
            <div
              ref={scrollRef}
              style={{
                maxHeight: batchesByDate.length <= 2 ? 'none' : '200px',
                overflowY: batchesByDate.length <= 2 ? 'visible' : 'auto',
                border: '1px solid var(--border)',
                borderRadius: '6px'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.75rem' }}>Batch ID</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.75rem' }}>Date</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.75rem' }}>Supplier</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.75rem' }}>Original</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.75rem' }}>Remaining</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.75rem' }}>Unit Cost</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.75rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batchesByDate.map((batch, idx) => {
                    const isExpanded = expandedBatches.has(batch.batchId);
                    const isDepleted = batch.remainingQty === 0;
                    const batchMovements = batch.movements.sort((a, b) => 
                      new Date(a.createdAt) - new Date(b.createdAt)
                    );
                    
                    return (
                      <React.Fragment key={batch.batchId}>
                        <tr style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: isDepleted ? 'rgba(0,0,0,0.1)' : (isExpanded ? 'rgba(99, 102, 241, 0.08)' : 'transparent'),
                          transition: 'all 0.2s'
                        }}>
                          <td style={{ padding: '0.75rem' }}>
                            <button
                              onClick={() => toggleBatchExpand(batch.batchId)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--primary)',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}
                            >
                              <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                              {batch.batchId}
                            </button>
                            {batch.invoiceNumber && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                                Inv: {batch.invoiceNumber}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                            {new Date(batch.dateReceived).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--white)', fontSize: '0.8rem' }}>
                            {batch.supplierName || '— Walk-in'}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--white)', fontSize: '0.8rem' }}>
                            {batch.originalQty} pcs
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: '600' }}>
                            <span style={{ color: isDepleted ? '#f87171' : '#facc15' }}>
                              {batch.remainingQty} pcs
                            </span>
                            {isDepleted && (
                              <div style={{ fontSize: '0.65rem', color: '#f87171', marginTop: '0.1rem' }}>Depleted</div>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gold)', fontSize: '0.8rem' }}>
                            ₱{formatPrice(batch.unitCost)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <button
                              onClick={() => {
                                // Open batch details modal
                                const event = new CustomEvent('openBatchDetails', { detail: { batch, item } });
                                window.dispatchEvent(event);
                              }}
                              style={{
                                background: 'rgba(99, 102, 241, 0.2)',
                                border: '1px solid var(--primary)',
                                borderRadius: '4px',
                                padding: '0.25rem 0.75rem',
                                color: 'var(--primary)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = 'var(--primary)';
                                e.target.style.color = 'var(--black)';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = 'rgba(99, 102, 241, 0.2)';
                                e.target.style.color = 'var(--primary)';
                              }}
                            >
                              View Details →
                            </button>
                          </td>
                        </tr>
                        
                        {/* Expanded Movement History */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} style={{ padding: '1rem', background: 'rgba(0,0,0,0.15)' }}>
                              <div style={{ marginBottom: '0.75rem', fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase' }}>
                                Movement History for {batch.batchId}
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.7rem' }}>Date</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.7rem' }}>Type</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.7rem' }}>Change</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.7rem' }}>Remaining</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.7rem' }}>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {batchMovements.map((mov, movIdx) => (
                                    <tr key={movIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <td style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)' }}>
                                        {new Date(mov.createdAt).toLocaleDateString()}
                                      </td>
                                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                        <span style={{
                                          padding: '0.2rem 0.5rem',
                                          borderRadius: '4px',
                                          fontSize: '0.65rem',
                                          fontWeight: 600,
                                          background: mov.type === 'received' ? 'rgba(74, 222, 128, 0.2)' :
                                                         mov.type === 'sold' ? 'rgba(99, 102, 241, 0.2)' :
                                                         mov.type === 'damaged' ? 'rgba(248, 113, 113, 0.2)' :
                                                         'rgba(250, 204, 21, 0.2)',
                                          color: mov.type === 'received' ? '#4ade80' :
                                                 mov.type === 'sold' ? '#6366f1' :
                                                 mov.type === 'damaged' ? '#f87171' :
                                                 '#facc15'
                                        }}>
                                          {mov.type}
                                        </span>
                                      </td>
                                      <td style={{ padding: '0.5rem', textAlign: 'center', color: mov.quantity > 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                                        {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                                      </td>
                                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#facc15', fontWeight: 600 }}>
                                        {mov.remainingAfter} pcs
                                      </td>
                                      <td style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.75rem' }}>
                                        {mov.reason || '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              
                              {/* Batch Summary */}
                              <div style={{ 
                                marginTop: '1rem', 
                                padding: '0.75rem', 
                                background: 'rgba(0,0,0,0.2)', 
                                borderRadius: '6px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                                  <span style={{ color: '#4ade80', fontWeight: 600 }}>{batch.remainingQty} pcs</span> remaining from 
                                  <span style={{ color: 'var(--white)', fontWeight: 600 }}> {batch.originalQty} pcs</span> original
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 600 }}>
                                  Remaining Value: ₱{formatPrice(batch.unitCost * batch.remainingQty)}
                                </div>
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
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--gray)',
              fontSize: '0.875rem',
              fontStyle: 'italic'
            }}>
              No batch history yet. Add stock to see batch tracking.
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Modal Component ────────────────────────────────────────────────────────────
function InventoryModal({ isOpen, onClose, onSave, onEdit, onRestoreItem, item, categories, onAddCategory, inventory, editingItem, suppliers, onAddSupplier }) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'Mugs',
    initialStock: '',  // Empty by default, shows "0" as placeholder
    minStockLevel: 10,
    isOnDemand: false,
    isActive: true,
    supplierId: 'unspecified',
    supplierName: 'Unspecified',
    unitCost: '',
    isBulkPurchase: false,
    totalCost: '',
    invoiceNumber: '',  // NEW: Required if initialStock > 0
    deliveryDate: new Date().toISOString().split('T')[0]  // NEW: Required if initialStock > 0
  });
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [duplicateItem, setDuplicateItem] = useState(null); // For duplicate warning modal (active items)
  const [archivedItem, setArchivedItem] = useState(null); // For archived item restore modal
  const [isLinked, setIsLinked] = useState(false); // NEW: Track if item is linked to products/sales
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false); // For custom combobox
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false); // For supplier combobox
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false); // For adding new supplier
  const [showManageSuppliersModal, setShowManageSuppliersModal] = useState(false); // For managing suppliers
  const [showValidationModal, setShowValidationModal] = useState(false); // For validation errors
  const [validationMessage, setValidationMessage] = useState('');
  const categoryDropdownRef = useRef(null);
  const supplierDropdownRef = useRef(null);

  // Set formData from item when editing
  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        category: item.category || 'Mugs',
        initialStock: item.stockQty || 0,
        minStockLevel: item.minStockLevel || 10,
        isOnDemand: item.isOnDemand || false,
        isActive: item.isActive !== undefined ? item.isActive : true,
        supplierId: item.lastSupplierId || 'unspecified',
        supplierName: item.lastSupplierName || 'Unspecified',
        unitCost: item.lastUnitCost ? String(item.lastUnitCost) : '',
        isBulkPurchase: false,
        totalCost: '',
        invoiceNumber: '',
        deliveryDate: new Date().toISOString().split('T')[0]
      });
    } else {
      setFormData({
        name: '',
        category: 'Mugs',
        initialStock: '',  // Empty string, not 0!
        minStockLevel: 10,
        isOnDemand: false,
        isActive: true,
        supplierId: 'unspecified',
        supplierName: 'Unspecified',
        unitCost: '',
        isBulkPurchase: false,
        totalCost: '',
        invoiceNumber: '',
        deliveryDate: new Date().toISOString().split('T')[0]
      });
    }
  }, [item]);

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setShowCategoryDropdown(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // NEW: Check if item is linked to products or has sales history
  useEffect(() => {
    if (item) {
      const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
      const allOrders = JSON.parse(localStorage.getItem('pmp_orders') || '[]');

      // Check if referenced by products
      const linkedProducts = allProducts.filter(p => p.inventoryId === item.id);

      // Check if item has sales history
      const salesWithThisItem = allOrders.filter(order =>
        order.items?.some(orderItem => orderItem.inventoryId === item.id) ||
        order.productInventoryId === item.id
      );

      setIsLinked(linkedProducts.length > 0 || salesWithThisItem.length > 0);
    } else {
      setIsLinked(false);
    }
  }, [item]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle supplier selection
  const handleSupplierSelect = (supplierId, supplierName) => {
    if (supplierId === '__new__') {
      setShowAddSupplierModal(true);
    } else {
      setFormData(prev => ({
        ...prev,
        supplierId,
        supplierName
      }));
      setShowSupplierDropdown(false);
    }
  };

  // Handle adding new supplier from modal
  const handleAddNewSupplier = (supplierData) => {
    const newSupplier = onAddSupplier(supplierData);
    setFormData(prev => ({
      ...prev,
      supplierId: newSupplier.id,
      supplierName: newSupplier.name
    }));
    setShowAddSupplierModal(false);
  };

  // Handle bulk purchase toggle
  const handleBulkPurchaseToggle = () => {
    setFormData(prev => ({
      ...prev,
      isBulkPurchase: !prev.isBulkPurchase
    }));
  };

  // Handle unit cost change
  const handleUnitCostChange = (value) => {
    setFormData(prev => {
      const unitCost = value;
      let totalCost = prev.totalCost;

      // Auto-compute total cost if not in bulk mode
      if (!prev.isBulkPurchase && unitCost !== '' && prev.initialStock !== '') {
        const qty = parseInt(prev.initialStock) || 0;
        const cost = parseFloat(unitCost) || 0;
        totalCost = String(qty * cost);
      }

      return {
        ...prev,
        unitCost,
        totalCost
      };
    });
  };

  // Handle total cost change (for bulk purchase mode)
  const handleTotalCostChange = (value) => {
    setFormData(prev => {
      const totalCost = value;
      let unitCost = prev.unitCost;
      
      // Auto-compute unit cost if in bulk mode
      if (prev.isBulkPurchase && totalCost !== '' && prev.stockQty !== '') {
        const qty = parseInt(prev.stockQty) || 0;
        const total = parseFloat(totalCost) || 0;
        unitCost = qty > 0 ? String(total / qty) : '';
      }
      
      return {
        ...prev,
        unitCost,
        totalCost
      };
    });
  };

  // Handle stock quantity change (for auto-compute)
  const handleStockQtyChange = (value) => {
    setFormData(prev => {
      const stockQty = value;
      let unitCost = prev.unitCost;
      let totalCost = prev.totalCost;
      
      if (prev.isBulkPurchase && prev.totalCost !== '' && value !== '') {
        // Recompute unit cost from total
        const qty = parseInt(value) || 0;
        const total = parseFloat(prev.totalCost) || 0;
        unitCost = qty > 0 ? String(total / qty) : '';
      } else if (!prev.isBulkPurchase && prev.unitCost !== '' && value !== '') {
        // Recompute total cost from unit
        const qty = parseInt(value) || 0;
        const cost = parseFloat(prev.unitCost) || 0;
        totalCost = String(qty * cost);
      }
      
      return {
        ...prev,
        stockQty,
        unitCost,
        totalCost
      };
    });
  };

  const handleCategorySelect = (e) => {
    const value = e.target.value;
    if (value === '__new__') {
      setShowNewCategoryInput(true);
      setNewCategoryName('');
    } else {
      setShowNewCategoryInput(false);
      setFormData(prev => ({ ...prev, category: value }));
    }
  };

  const handleAddNewCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      alert('Please enter a category name');
      return;
    }

    // Check if category already exists
    if (categories.some(cat => cat.toLowerCase() === trimmed.toLowerCase())) {
      alert('Category already exists!');
      return;
    }

    // Add new category
    onAddCategory(trimmed);
    setFormData(prev => ({ ...prev, category: trimmed }));
    setShowNewCategoryInput(false);
    setNewCategoryName('');
  };

  const handleNumberInput = (e) => {
    const { name, value } = e.target;
    const sanitized = value === '' ? '0' : Math.max(0, parseInt(value) || 0);
    setFormData(prev => ({
      ...prev,
      [name]: sanitized
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate product name
    if (!formData.name.trim()) {
      setValidationMessage('Please enter a product name');
      setShowValidationModal(true);
      return;
    }

    // Validate stock quantity for new items
    if (!item && formData.initialStock !== '' && formData.initialStock !== null && parseInt(formData.initialStock) < 0) {
      setValidationMessage('Please enter a valid stock quantity');
      setShowValidationModal(true);
      return;
    }

    // Validate unit cost (only required if initialStock > 0)
    if (formData.initialStock !== '' && formData.initialStock !== null && parseInt(formData.initialStock) > 0 && !formData.unitCost) {
      setValidationMessage('Please enter the unit cost (original price)');
      setShowValidationModal(true);
      return;
    }

    // Normalize the name: Trim whitespace and convert to Proper Case
    const normalizedName = formData.name.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    // Check for duplicates in inventory (same Name + same Category)
    const duplicateItem = inventory.find(item =>
      item.name.toLowerCase() === normalizedName.toLowerCase() &&
      item.category.toLowerCase() === formData.category.toLowerCase() &&
      item.id !== (editingItem?.id) // Exclude current item if editing
    );

    if (duplicateItem) {
      // Check if item is archived
      if (duplicateItem.isActive === false) {
        // Show archived item modal
        setArchivedItem(duplicateItem);
      } else {
        // Show duplicate warning modal (active item)
        setDuplicateItem(duplicateItem);
      }
      return;
    }

    // Save with normalized name
    // NEW: Include supplier and cost information
    // When editing, preserve original stockQty (stock adjustments done via table +/- buttons)
    onSave({
      ...formData,
      name: normalizedName,
      stockQty: item ? item.stockQty : parseInt(formData.initialStock) || 0,  // Use initialStock for new items
      minStockLevel: parseInt(formData.minStockLevel),
      isActive: formData.isActive !== undefined ? formData.isActive : true,  // Preserve active status
      deletedAt: formData.isActive === false ? new Date() : null,  // Set deletedAt when archived
      // NEW: Supplier and cost fields
      lastSupplierId: formData.supplierId === 'walk-in' ? null : formData.supplierId,
      lastSupplierName: formData.supplierName,
      lastUnitCost: formData.unitCost ? parseFloat(formData.unitCost) : 0,
      averageCost: formData.unitCost ? parseFloat(formData.unitCost) : 0  // Initial cost = average cost
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-wide" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">
            {item ? 'Edit Inventory Item' : 'Add New Inventory Item'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Row 1: Product Name | Category */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                Product Name <span className="required">*</span>
                {isLinked && (
                  <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Locked (Item is in use)
                  </span>
                )}
              </label>
              <input
                type="text"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Ceramic, Magic Mug..."
                required
                readOnly={isLinked}
                autoComplete="off"
                style={isLinked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
              />
              {isLinked ? (
                <p className="form-hint" style={{ color: '#f59e0b' }}>
                  This item is linked to products or sales records. Name cannot be changed to prevent data discrepancies.
                </p>
              ) : (
                <p className="form-hint">
                  Product name will be auto-formatted (Proper Case). Duplicate names in the same category are not allowed.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">
                Category <span className="required">*</span>
                {isLinked && (
                  <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Locked
                  </span>
                )}
              </label>
              {showNewCategoryInput ? (
                <div className="new-category-input-wrap">
                  <input
                    type="text"
                    className="form-input"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddNewCategory();
                      }
                      if (e.key === 'Escape') {
                        setShowNewCategoryInput(false);
                        setNewCategoryName('');
                      }
                    }}
                    placeholder="Enter new category name..."
                    autoFocus
                    readOnly={isLinked}
                    style={isLinked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  />
                  {isLinked && (
                    <p className="form-hint" style={{ color: '#f59e0b', marginTop: '0.5rem' }}>
                      This item is linked to products or sales. Category cannot be changed.
                    </p>
                  )}
                  <div className="new-category-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleAddNewCategory}
                      disabled={isLinked}
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', opacity: isLinked ? 0.5 : 1, cursor: isLinked ? 'not-allowed' : 'pointer' }}
                    >
                      Add Category
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setShowNewCategoryInput(false);
                        setNewCategoryName('');
                      }}
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="combobox-root" ref={categoryDropdownRef}>
                    <div className="combobox-field">
                      <input
                        type="text"
                        className="form-input"
                        value={formData.category}
                        readOnly
                        onClick={() => !isLinked && setShowCategoryDropdown(!showCategoryDropdown)}
                        style={isLinked ? { opacity: 0.6, cursor: 'not-allowed' } : { cursor: 'pointer' }}
                        disabled={isLinked}
                      />
                      <button
                        type="button"
                        className="combobox-toggle"
                        onClick={() => !isLinked && setShowCategoryDropdown(!showCategoryDropdown)}
                        disabled={isLinked}
                        style={isLinked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                      >
                        {showCategoryDropdown ? '▲' : '▼'}
                      </button>
                    </div>
                    {showCategoryDropdown && !isLinked && (
                      <div className="combobox-menu" style={{ maxHeight: '200px' }}>
                        {categories.slice(0, 5).map((cat, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`combobox-item${cat === formData.category ? ' active' : ''}`}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, category: cat }));
                              setShowCategoryDropdown(false);
                            }}
                          >
                            {cat}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="combobox-item combobox-add"
                          onClick={() => {
                            setShowCategoryDropdown(false);
                            setShowNewCategoryInput(true);
                            setNewCategoryName('');
                          }}
                        >
                          <span>+</span> Add New Category...
                        </button>
                      </div>
                    )}
                  </div>
                  {isLinked ? (
                    <p className="form-hint" style={{ color: '#f59e0b' }}>
                      This item is linked to products or sales records.
                    </p>
                  ) : (
                    <p className="form-hint">
                      Select a category or add a new one.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Row 2: Stock Qty | Min Level */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {!formData.isOnDemand && (
              <>
                <div className="form-group">
                  <label className="form-label">
                    {!item ? 'Quantity' : `Current Stock: ${formData.initialStock} pcs (locked)`}
                  </label>
                  {!item ? (
                    <NumberInput
                      className="form-input"
                      name="initialStock"
                      value={formData.initialStock}
                      onChange={e => setFormData(prev => ({ ...prev, initialStock: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                      min={0}
                      placeholder="0"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          return false;
                        }
                      }}
                    />
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      value={`${formData.initialStock} pcs`}
                      readOnly
                      style={{ opacity: 0.6, cursor: 'not-allowed', background: 'rgba(0,0,0,0.2)' }}
                    />
                  )}
                  <p className="form-hint">
                    {!item ? 'Leave empty if the item to be sold is Upon Order' : 'Use + / − buttons in table to adjust stock.'}
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Min. Stock Level</label>
                  <NumberInput
                    className="form-input"
                    name="minStockLevel"
                    value={formData.minStockLevel}
                    onChange={e => setFormData(prev => ({ ...prev, minStockLevel: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                    min={0}
                    placeholder="10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    readOnly={item}
                    style={item ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  />
                  <p className="form-hint">
                    You'll receive a low stock warning when current stock falls below this level.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Info Note - Auto-detect Upon Order */}
          {!item && (
            <div style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '8px',
              padding: '1rem',
              margin: '1.5rem 0'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#6366f1', flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4M12 8h.01"/>
                </svg>
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Stock Type Auto-Detection
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                    Leave Quantity empty for <strong>Upon Order</strong> items (made-to-order).<br/>
                    Enter quantity for <strong>Track Stock</strong> items (requires supplier invoice).
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Supplier Invoice Section - Full width, shows ONLY if initialStock > 0 AND not editing */}
          {!item && formData.initialStock !== '' && formData.initialStock !== null && parseInt(formData.initialStock) > 0 && (
            <div style={{
              background: 'rgba(217, 119, 6, 0.1)',
              border: '2px solid rgba(217, 119, 6, 0.3)',
              borderRadius: '8px',
              padding: '1.5rem',
              margin: '1.5rem 0'
            }}>
              <h4 style={{
                margin: '0 0 1.5rem 0',
                color: '#d97706',
                fontSize: '0.875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Supplier Invoice Information (Required)
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Supplier</label>
                  <div className="combobox-root" ref={supplierDropdownRef}>
                    <div className="combobox-field">
                      <input
                        type="text"
                        className="form-input"
                        value={formData.supplierName}
                        readOnly
                        onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
                        style={{ cursor: 'pointer' }}
                      />
                      <button
                        type="button"
                        className="combobox-toggle"
                        onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
                      >
                        {showSupplierDropdown ? '▲' : '▼'}
                      </button>
                    </div>
                    {showSupplierDropdown && (
                      <div className="combobox-menu" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        <button
                          type="button"
                          className={`combobox-item${formData.supplierId === 'unspecified' ? ' active' : ''}`}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, supplierId: 'unspecified', supplierName: 'Unspecified' }));
                            setShowSupplierDropdown(false);
                          }}
                        >
                          — Unspecified
                        </button>
                        {suppliers && suppliers.map((supplier, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`combobox-item${formData.supplierId === supplier.id ? ' active' : ''}`}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, supplierId: supplier.id, supplierName: supplier.name }));
                              setShowSupplierDropdown(false);
                            }}
                          >
                            {supplier.name}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="combobox-item combobox-add"
                          onClick={() => setShowAddSupplierModal(true)}
                        >
                          <span>+</span> Add New Supplier...
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    {formData.isBulkPurchase ? 'Total Amount Paid' : 'Unit Cost Each'} 
                    <span className="required">*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div className="tier-price-cell" style={{ flex: 1 }}>
                      <span className="peso">₱</span>
                      <input
                        type="number"
                        className="tier-input no-spinner"
                        value={formData.isBulkPurchase ? formData.totalCost : formData.unitCost}
                        onChange={e => formData.isBulkPurchase ? handleTotalCostChange(e.target.value) : handleUnitCostChange(e.target.value)}
                        placeholder={formData.isBulkPurchase ? '0.00' : '0.00'}
                        min="0"
                        step="0.01"
                        style={{ width: '100%' }}
                      />
                    </div>
                    
                    {/* Bulk Purchase Toggle - Side by side */}
                    <label className="form-checkbox-label" style={{ marginBottom: '0.875rem', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        className="form-checkbox"
                        checked={formData.isBulkPurchase}
                        onChange={handleBulkPurchaseToggle}
                        style={{ cursor: 'pointer' }}
                      />
                      <span className="checkbox-text" style={{ fontSize: '0.75rem' }}>
                        {formData.isBulkPurchase ? 'Per Unit' : 'Total Amount'}
                      </span>
                    </label>
                  </div>
                  {formData.isBulkPurchase && formData.totalCost && formData.initialStock !== '' && parseInt(formData.initialStock) > 0 && (
                    <p className="form-hint" style={{ color: '#4ade80', marginTop: '0.5rem' }}>
                      Unit Cost: {formatPrice(parseFloat(formData.totalCost) / parseInt(formData.initialStock))} each
                    </p>
                  )}
                  {!formData.isBulkPurchase && formData.unitCost && formData.initialStock !== '' && parseInt(formData.initialStock) > 0 && (
                    <p className="form-hint" style={{ color: '#4ade80', marginTop: '0.5rem' }}>
                      Total: {formatPrice(parseFloat(formData.unitCost) * parseInt(formData.initialStock))}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Invoice Number <span className="required">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.invoiceNumber}
                    onChange={e => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                    placeholder="e.g., INV-2026-001"
                  />
                  <p className="form-hint">From supplier's delivery receipt or invoice</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Delivery Date <span className="required">*</span></label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.deliveryDate}
                    onChange={e => setFormData(prev => ({ ...prev, deliveryDate: e.target.value }))}
                  />
                  <p className="form-hint">Date items were received</p>
                </div>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {item ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>

      {/* Duplicate Item Warning Modal */}
      <DuplicateItemModal
        isOpen={!!duplicateItem}
        onClose={() => setDuplicateItem(null)}
        onEdit={() => {
          if (duplicateItem) {
            setDuplicateItem(null);
            onClose();
            setTimeout(() => {
              onEdit(duplicateItem);
            }, 150);
          }
        }}
        existingItem={duplicateItem}
        categoryName={formData.category}
      />

      {/* Archived Item Detected Modal */}
      <ArchivedItemModal
        isOpen={!!archivedItem}
        onClose={() => setArchivedItem(null)}
        onRestore={() => {
          if (archivedItem) {
            // Restore the item (set isActive: true, deletedAt: null)
            if (onRestoreItem) {
              onRestoreItem(archivedItem);
            }
            setArchivedItem(null);
            // Close the Add modal - item is now restored in inventory list
            setTimeout(() => {
              onClose();
            }, 150);
          }
        }}
        archivedItem={archivedItem}
        categoryName={formData.category}
      />

      {/* Add New Supplier Modal */}
      <AddSupplierModal
        isOpen={showAddSupplierModal}
        onClose={() => setShowAddSupplierModal(false)}
        onAdd={handleAddNewSupplier}
      />

      {/* Validation Modal */}
      <ValidationModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        message={validationMessage}
      />
    </div>
  );
}

// ── Validation Modal ───────────────────────────────────────────────────────────
function ValidationModal({ isOpen, onClose, message }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">Validation Error</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">{message}</p>
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

// ── Add Supplier Modal ─────────────────────────────────────────────────────────
function AddSupplierModal({ isOpen, onClose, onAdd }) {
  const [supplierName, setSupplierName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSupplierName('');
      setContact('');
      setAddress('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (!supplierName.trim()) {
      return;
    }

    onAdd({
      name: supplierName.trim(),
      contact: contact.trim(),
      address: address.trim()
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add New Supplier</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">
              Supplier Name <span className="required">*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="e.g., SanRoque Mugs"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Contact Number <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder="e.g., 0912-345-6789"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Address <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g., San Roque, Marikina"
            />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!supplierName.trim()}
          >
            Add Supplier
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage Suppliers Modal ──────────────────────────────────────────────────────
function ManageSuppliersModal({ isOpen, onClose, suppliers, inventory, onAdd, onUpdate, onDelete }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', contact: '', address: '', phone: '' });

  useEffect(() => {
    if (isOpen) {
      setShowAddForm(false);
      setEditingId(null);
      setFormData({ name: '', contact: '', address: '', phone: '' });
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (!formData.name.trim()) return;
    
    if (editingId) {
      onUpdate(editingId, formData);
    } else {
      onAdd(formData);
    }
    setFormData({ name: '', contact: '', address: '', phone: '' });
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleEdit = (supplier) => {
    // Check if supplier is in use
    const isInUse = inventory.some(item => 
      item.lastSupplierId === supplier.id && item.isActive !== false
    );
    
    setEditingId(supplier.id);
    setFormData({
      name: supplier.name,
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      address: supplier.address || ''
    });
    setShowAddForm(true);
    // Store in-use status for disabling form
    window.__supplierInUse = isInUse;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">Supplier Management</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {!showAddForm ? (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowAddForm(true)}
                style={{ marginBottom: '1rem' }}
              >
                <span>+</span> Add New Supplier
              </button>

              {suppliers && suppliers.length > 0 ? (
                <div style={{ 
                  maxHeight: '280px',  // ~2 rows max
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: '6px'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Supplier Name</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Contact Person</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Phone</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Address</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map((supplier, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--white)', fontWeight: 600 }}>{supplier.name}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>{supplier.contact || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>{supplier.phone || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>{supplier.address || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn-sm btn-secondary"
                              onClick={() => handleEdit(supplier)}
                              style={{ marginRight: '0.5rem', background: 'var(--gold)', borderColor: 'var(--gold)', color: '#000' }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-sm btn-danger"
                              onClick={() => onDelete(supplier.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{
                  padding: '3rem',
                  textAlign: 'center',
                  color: 'var(--gray)',
                  fontSize: '0.875rem',
                  fontStyle: 'italic'
                }}>
                  No suppliers yet. Click "Add New Supplier" to get started.
                </div>
              )}
            </>
          ) : (
            /* Add/Edit Form */
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--white)' }}>
                {editingId ? 'Edit Supplier' : 'Add New Supplier'}
              </h3>

              {editingId && window.__supplierInUse && (
                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <p style={{ fontSize: '0.875rem', color: '#f59e0b', margin: 0 }}>
                    This supplier is currently in use. The supplier name cannot be changed.
                  </p>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Supplier Name <span className="required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., SanRoque Mugs"
                  autoFocus
                  disabled={editingId && window.__supplierInUse}
                  style={editingId && window.__supplierInUse ? { opacity: 0.6, cursor: 'not-allowed', background: 'rgba(0,0,0,0.2)' } : {}}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contact Person <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.contact}
                  onChange={e => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="e.g., Juan Dela Cruz"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g., 0912-345-6789"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Address <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g., San Roque, Marikina"
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingId(null);
                    setFormData({ name: '', contact: '', address: '', phone: '' });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={!formData.name.trim()}
                >
                  {editingId ? 'Update Supplier' : 'Add Supplier'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Duplicate Item Warning Modal ───────────────────────────────────────────────
function DuplicateItemModal({ isOpen, onClose, onEdit, existingItem, categoryName }) {
  if (!isOpen || !existingItem) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">Duplicate Item Detected</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            <strong>"{existingItem.name}"</strong> in category <strong>"{categoryName}"</strong> already exists in your inventory.
          </p>
          <p className="delete-confirm-warning" style={{ marginTop: '0.75rem' }}>
            Would you like to update the existing item's stock instead?
          </p>
          <div className="existing-item-info" style={{
            background: 'rgba(255, 193, 7, 0.1)',
            border: '1px solid rgba(255, 193, 7, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Current Item:</div>
            <div style={{ fontWeight: '600', color: 'var(--white)', marginBottom: '0.25rem' }}>{existingItem.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
              Category: {existingItem.category} • Stock: {existingItem.isOnDemand ? 'Upon Order' : `${existingItem.stockQty} pcs`}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onEdit}>
            Edit Existing Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Archived Item Detected Modal ──────────────────────────────────────────────
// Shows when user tries to add item with same name/category as archived item
function ArchivedItemModal({ isOpen, onClose, onRestore, archivedItem, categoryName }) {
  if (!isOpen || !archivedItem) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">Archived Item Found</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            <strong>"{archivedItem.name}"</strong> in category <strong>"{categoryName}"</strong> exists in your archive.
          </p>
          <p className="delete-confirm-warning" style={{ marginTop: '0.75rem', color: '#f59e0b' }}>
            This item was previously archived. Restore it to use again.
          </p>
          <div className="existing-item-info" style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Archived Item:</div>
            <div style={{ fontWeight: '600', color: 'var(--white)', marginBottom: '0.25rem' }}>{archivedItem.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
              Category: {archivedItem.category} • Stock: {archivedItem.isOnDemand ? 'Upon Order' : `${archivedItem.stockQty} pcs`}
            </div>
            {archivedItem.deletedAt && (
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem' }}>
                Archived on: {new Date(archivedItem.deletedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onRestore}>
            Restore Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Archive/Delete Confirmation Modal ────────────���────────────────────────────
// NEW: Now checks sales history in addition to product references
// If item has sales history, force soft delete (archive) only
function ArchiveConfirmModal({ 
  isOpen, 
  onClose, 
  onArchive, 
  onDelete,  // Fixed: Added onDelete prop
  itemName, 
  isReferenced, 
  referencingProductsCount,
  hasSalesHistory = false  // NEW: Prop for sales history
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-danger">
            {isReferenced ? 'Item Is Referenced' : 'Confirm Action'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {isReferenced || hasSalesHistory ? (
            <>
              {isReferenced && (
                <>
                  <p className="delete-confirm-text">
                    <strong>"{itemName}"</strong> is currently used by {referencingProductsCount} product(s).
                  </p>
                  <p className="delete-confirm-warning" style={{
                    marginTop: '1rem',
                    background: 'rgba(255, 193, 7, 0.1)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    padding: '1rem',
                    borderRadius: '8px'
                  }}>
                    <strong>Cannot Delete:</strong> This item is being used in your product catalog.
                    Deleting it would break those products.
                  </p>
                </>
              )}
              
              {/* NEW: Sales History Warning */}
              {hasSalesHistory && (
                <>
                  <p className="delete-confirm-text" style={{ 
                    marginTop: isReferenced ? '1rem' : '0',
                    color: '#f87171',
                    fontWeight: '600'
                  }}>
                    <strong>CRITICAL:</strong> This item has previous sales records!
                  </p>
                  <p className="delete-confirm-warning" style={{ 
                    marginTop: '0.5rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '1rem',
                    borderRadius: '8px'
                  }}>
                    <strong>Cannot Permanently Delete:</strong> This item is part of your sales history. 
                    Hard deleting would corrupt your accounting and sales reports.
                  </p>
                </>
              )}
              
              <p className="delete-confirm-text" style={{ marginTop: '1rem' }}>
                Would you like to <strong>Archive</strong> it instead?
              </p>
              <ul style={{
                marginTop: '0.75rem',
                paddingLeft: '1.25rem',
                color: 'var(--gray)',
                fontSize: '0.875rem',
                lineHeight: '1.8'
              }}>
              </ul>
            </>
          ) : (
            <>
              <p className="delete-confirm-text">
                Are you sure you want to delete <strong>"{itemName}"</strong>?
              </p>
              <p className="delete-confirm-warning">
                This action cannot be undone. The item will be permanently removed from your inventory.
              </p>
              <p style={{
                marginTop: '0.75rem',
                fontSize: '0.875rem',
                color: 'var(--gray)',
                fontStyle: 'italic'
              }}>
                <span style={{ marginRight: '0.5rem', fontWeight: 'bold' }}>ℹ</span> Only delete permanently if this item was created by mistake and has never been used.
              </p>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {isReferenced || hasSalesHistory ? (
            <button type="button" className="btn-primary" onClick={onArchive}>
              Archive Item
            </button>
          ) : (
            <button type="button" className="btn-danger" onClick={onDelete}>
              Delete Permanently
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manual Stock Addition Modal ──────────────���────────────────────────────────
// Modal for adding stock with audit log
// Reasons: Restock/New Delivery, Inventory Correction
function StockAdditionModal({ isOpen, onClose, onConfirm, item, suppliers, onAddSupplier }) {
  const [reason, setReason] = useState('restock'); // 'restock', 'correction-add'
  const [quantity, setQuantity] = useState('');
  const [supplierId, setSupplierId] = useState('walk-in');
  const [supplierName, setSupplierName] = useState('Unspecified');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [unitCost, setUnitCost] = useState('');
  const [isBulkPurchase, setIsBulkPurchase] = useState(false);
  const [totalCost, setTotalCost] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const reasonDropdownRef = useRef(null);
  const supplierDropdownRef = useRef(null);

  // Auto-generate Batch ID
  const generateBatchId = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `BATCH-${timestamp}-${random}`;
  };

  // Close reason dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (reasonDropdownRef.current && !reasonDropdownRef.current.contains(e.target)) {
        setShowReasonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && item) {
      // Reset form when modal opens
      setReason('restock');
      setQuantity('');
      setShowConfirmModal(false);
      setPendingData(null);

      // Auto-populate supplier from item's last supplier
      if (item.lastSupplierId) {
        setSupplierId(item.lastSupplierId);
        setSupplierName(item.lastSupplierName || 'Unspecified');
      } else {
        setSupplierId('walk-in');
        setSupplierName('Unspecified');
      }

      // Auto-populate unit cost from item's last cost
      setUnitCost(item.lastUnitCost ? String(item.lastUnitCost) : '');
      
      // Reset invoice fields
      setInvoiceNumber('');
      setDeliveryDate(new Date().toISOString().split('T')[0]);
      
      setIsBulkPurchase(false);
      setTotalCost('');
    }
  }, [isOpen, item]);

  // Close supplier dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (reasonDropdownRef.current && !reasonDropdownRef.current.contains(e.target)) {
        setShowReasonDropdown(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle supplier selection
  const handleSupplierSelect = (id, name) => {
    if (id === '__new__') {
      setShowAddSupplierModal(true);
    } else {
      setSupplierId(id);
      setSupplierName(name);
      setShowSupplierDropdown(false);
    }
  };

  // Handle adding new supplier
  const handleAddNewSupplier = (supplierData) => {
    const newSupplier = onAddSupplier(supplierData);
    setSupplierId(newSupplier.id);
    setSupplierName(newSupplier.name);
    setShowAddSupplierModal(false);
  };

  // Handle bulk purchase toggle
  const handleBulkPurchaseToggle = () => {
    setIsBulkPurchase(prev => !prev);
  };

  // Handle unit cost change
  const handleUnitCostChange = (value) => {
    setUnitCost(value);
    if (!isBulkPurchase && value !== '' && quantity !== '') {
      const qty = parseInt(quantity) || 0;
      const cost = parseFloat(value) || 0;
      setTotalCost(String(qty * cost));
    }
  };

  // Handle total cost change
  const handleTotalCostChange = (value) => {
    setTotalCost(value);
    if (isBulkPurchase && value !== '' && quantity !== '') {
      const qty = parseInt(quantity) || 0;
      const total = parseFloat(value) || 0;
      setUnitCost(qty > 0 ? String(total / qty) : '');
    }
  };

  // Handle quantity change (for auto-compute)
  const handleQuantityChange = (value) => {
    setQuantity(value);
    if (isBulkPurchase && totalCost !== '' && value !== '') {
      const qty = parseInt(value) || 0;
      const total = parseFloat(totalCost) || 0;
      setUnitCost(qty > 0 ? String(total / qty) : '');
    } else if (!isBulkPurchase && unitCost !== '' && value !== '') {
      const qty = parseInt(value) || 0;
      const cost = parseFloat(unitCost) || 0;
      setTotalCost(String(qty * cost));
    }
  };

  const handleSubmit = () => {
    if (!quantity || quantity <= 0) {
      setValidationMessage('Please enter a valid quantity');
      setShowValidationModal(true);
      return;
    }

    // Validate unit cost
    if (!unitCost) {
      setValidationMessage('Please enter the unit cost (original price)');
      setShowValidationModal(true);
      return;
    }

    // Validate invoice number and delivery date for restock
    if (reason === 'restock') {
      if (!invoiceNumber || invoiceNumber.trim() === '') {
        setValidationMessage('Please enter the invoice number from supplier');
        setShowValidationModal(true);
        return;
      }
      if (!deliveryDate) {
        setValidationMessage('Please enter the delivery date');
        setShowValidationModal(true);
        return;
      }
    }

    // Compute total cost
    const qty = parseInt(quantity);
    const cost = parseFloat(unitCost);
    const computedTotalCost = qty * cost;

    // Generate batch ID
    const batchId = generateBatchId();

    // Store pending data with batch information and show confirmation modal
    const adjustmentData = {
      reason,
      quantity: qty,
      supplierId: supplierId === 'walk-in' ? null : supplierId,
      supplierName,
      invoiceNumber: reason === 'restock' ? invoiceNumber : null,
      deliveryDate: reason === 'restock' ? deliveryDate : new Date().toISOString().split('T')[0],
      unitCost: cost,
      totalCost: computedTotalCost,
      batchData: {
        batchId,
        supplierId: supplierId === 'walk-in' ? null : supplierId,
        supplierName,
        invoiceNumber: reason === 'restock' ? invoiceNumber : null,
        dateReceived: reason === 'restock' ? deliveryDate : new Date().toISOString().split('T')[0],
        originalQty: qty,
        remainingQty: qty,
        unitCost: cost,
        totalCost: computedTotalCost,
        status: 'active'
      }
    };

    setPendingData(adjustmentData);
    setShowConfirmModal(true);
  };

  const handleConfirmAdd = () => {
    if (pendingData) {
      onConfirm(pendingData);
      setShowConfirmModal(false);
      setPendingData(null);
      onClose();
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add Stock</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Item Info */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid var(--primary)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Adding stock to:</div>
            <div style={{ fontWeight: '600', color: 'var(--white)' }}>{item.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
              Category: {item.category} - Current Stock: {item.stockQty} pcs
            </div>
          </div>

          {/* Reason Dropdown */}
          <div className="form-group">
            <label className="form-label">
              Reason for Addition <span className="required">*</span>
            </label>
            <div className="combobox-root" ref={reasonDropdownRef}>
              <div className="combobox-field">
                <input
                  type="text"
                  className="form-input"
                  value={reason === 'restock' ? 'Restock' : 'Inventory Correction (Add)'}
                  readOnly
                  onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                  style={{ cursor: 'pointer' }}
                />
                <button
                  type="button"
                  className="combobox-toggle"
                  onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                >
                  {showReasonDropdown ? '▲' : '▼'}
                </button>
              </div>
              {showReasonDropdown && (
                <div className="combobox-menu">
                  <button
                    type="button"
                    className={`combobox-item${reason === 'restock' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('restock');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Restock
                  </button>
                  <button
                    type="button"
                    className={`combobox-item${reason === 'correction-add' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('correction-add');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Inventory Correction (Add)
                  </button>
                </div>
              )}
            </div>
            {reason === 'restock' && (
              <p className="form-hint" style={{ color: '#4ade80', marginTop: '0.5rem' }}>
                For new stock.
              </p>
            )}
          </div>

          {/* Quantity */}
          <div className="form-group">
            <label className="form-label">
              Quantity to Add <span className="required">*</span>
            </label>
            <NumberInput
              className="form-input no-spinner"
              value={quantity}
              onChange={e => handleQuantityChange(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              placeholder=""
            />
          </div>

          {/* Supplier Field */}
          <div className="form-group">
            <label className="form-label">
              Supplier <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
            </label>
            <div className="combobox-root" ref={supplierDropdownRef}>
              <div className="combobox-field">
                <input
                  type="text"
                  className="form-input"
                  value={supplierName}
                  readOnly
                  onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
                  style={{ cursor: 'pointer' }}
                />
                <button
                  type="button"
                  className="combobox-toggle"
                  onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
                >
                  {showSupplierDropdown ? '▲' : '▼'}
                </button>
              </div>
              {showSupplierDropdown && (
                <div className="combobox-menu" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {/* Walk-in option */}
                  <button
                    type="button"
                    className={`combobox-item${supplierId === 'walk-in' ? ' active' : ''}`}
                    onClick={() => handleSupplierSelect('walk-in', '— Unspecified')}
                  >
                    — Unspecified
                  </button>
                  {/* Supplier list */}
                  {suppliers && suppliers.map((supplier, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`combobox-item${supplierId === supplier.id ? ' active' : ''}`}
                      onClick={() => handleSupplierSelect(supplier.id, supplier.name)}
                    >
                      {supplier.name}
                    </button>
                  ))}
                  {/* Add new supplier option */}
                  <button
                    type="button"
                    className="combobox-item combobox-add"
                    onClick={() => handleSupplierSelect('__new__', '')}
                  >
                    <span>+</span> Add New Supplier...
                  </button>
                </div>
              )}
            </div>
            <p className="form-hint">
              Select a supplier or leave as "Unspecified" for cash purchases.
            </p>
          </div>

          {/* Supplier Invoice Information - Show only for Restock */}
          {reason === 'restock' && (
            <div style={{
              background: 'rgba(217, 119, 6, 0.1)',
              border: '2px solid rgba(217, 119, 6, 0.3)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <h4 style={{ 
                margin: '0 0 1rem 0', 
                color: '#d97706',
                fontSize: '0.875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                borderBottom: '2px solid #d97706',
                paddingBottom: '0.5rem'
              }}>
                Supplier Invoice / Delivery Receipt
              </h4>
              
              <div className="form-group">
                <label className="form-label">
                  Invoice Number <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="e.g., INV-2026-001"
                />
                <p className="form-hint">
                  From supplier's delivery receipt or invoice
                </p>
              </div>
              
              <div className="form-group">
                <label className="form-label">
                  Delivery Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                />
                <p className="form-hint">
                  Date items were received
                </p>
              </div>
            </div>
          )}

          {/* Unit Cost and Bulk Purchase Fields */}
          <div className="form-group">
            <label className="form-label">
              {isBulkPurchase ? 'Total Amount Paid' : 'Unit Cost Each'} 
              <span className="required">*</span>
            </label>
            
            {/* Bulk Purchase Toggle */}
            <label className="form-checkbox-label" style={{ marginBottom: '0.75rem' }}>
              <input
                type="checkbox"
                className="form-checkbox"
                checked={isBulkPurchase}
                onChange={handleBulkPurchaseToggle}
                style={{ cursor: 'pointer' }}
              />
              <span className="checkbox-text">
                Bulk Purchase (Enter Total Cost instead)
              </span>
            </label>

            {!isBulkPurchase ? (
              // Unit Cost Input
              <div className="tier-price-cell">
                <span className="peso">₱</span>
                <input
                  type="number"
                  className="tier-input no-spinner"
                  value={unitCost}
                  onChange={e => handleUnitCostChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onWheel={(e) => {
                    e.target.blur();
                    e.preventDefault();
                  }}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            ) : (
              // Total Cost Input
              <div className="tier-price-cell">
                <span className="peso">₱</span>
                <input
                  type="number"
                  className="tier-input no-spinner"
                  value={totalCost}
                  onChange={e => handleTotalCostChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onWheel={(e) => {
                    e.target.blur();
                    e.preventDefault();
                  }}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            )}

            {/* Auto-computed display */}
            {!isBulkPurchase && unitCost && quantity && (
              <p className="form-hint" style={{ color: '#4ade80', marginTop: '0.5rem' }}>
                Total Cost: {formatPrice(parseFloat(unitCost) * parseInt(quantity))}
              </p>
            )}
            {isBulkPurchase && totalCost && quantity && parseInt(quantity) > 0 && (
              <p className="form-hint" style={{ color: '#4ade80', marginTop: '0.5rem' }}>
                Unit Cost: {formatPrice(parseFloat(totalCost) / parseInt(quantity))} each
              </p>
            )}

            <p className="form-hint" style={{ marginTop: '0.5rem' }}>
              Required for profit tracking. This is your original cost per piece.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!quantity}
          >
            Add Stock
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Add Stock */}
      <div className="modal-overlay" style={{ display: showConfirmModal ? 'flex' : 'none' }} onClick={e => e.stopPropagation()}>
        <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title modal-title-success">Confirm Stock Addition</h2>
            <button className="modal-close" onClick={() => setShowConfirmModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="modal-body">
            <div className="confirm-summary">
              <div className="confirm-row">
                <span className="confirm-label">Product:</span>
                <span className="confirm-value">{item?.name}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Category:</span>
                <span className="confirm-value">{item?.category}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Current Stock:</span>
                <span className="confirm-value">{item?.stockQty} pcs</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Quantity to Add:</span>
                <span className="confirm-value" style={{ color: '#4ade80', fontWeight: '700' }}>
                  +{pendingData?.quantity} pcs
                </span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">New Stock Total:</span>
                <span className="confirm-value" style={{ color: '#4ade80', fontWeight: '700' }}>
                  {(item?.stockQty || 0) + (pendingData?.quantity || 0)} pcs
                </span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Supplier:</span>
                <span className="confirm-value">{pendingData?.supplierName || '— Walk-in / Unspecified'}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Unit Cost:</span>
                <span className="confirm-value">{formatPrice(pendingData?.unitCost || 0)}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Total Cost:</span>
                <span className="confirm-value" style={{ color: '#facc15', fontWeight: '700' }}>
                  {formatPrice(pendingData?.totalCost || 0)}
                </span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Reason:</span>
                <span className="confirm-value">
                  {pendingData?.reason === 'restock' ? 'Restock / New Delivery' : 'Inventory Correction'}
                </span>
              </div>
            </div>
            <p className="confirm-hint" style={{ marginTop: '1rem', color: '#facc15' }}>
              This will increase your inventory stock and create an audit log entry.
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirmAdd}>
              Confirm Addition
            </button>
          </div>
        </div>
      </div>

      {/* Add New Supplier Modal */}
      <AddSupplierModal
        isOpen={showAddSupplierModal}
        onClose={() => setShowAddSupplierModal(false)}
        onAdd={handleAddNewSupplier}
      />

      {/* Validation Modal */}
      <ValidationModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        message={validationMessage}
      />
    </div>
  );
}

// ── Confirm Modal ──────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onCancel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="delete-confirm-text">{message}</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className={confirmClass || 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Manual Stock Adjustment Modal ───────────────────────────────────���─────────
// NEW: Modal for reducing stock with audit log
// Reasons: Sales Outside System, Damaged Stock, Stock Correction
function StockAdjustmentModal({ isOpen, onClose, onConfirm, item, inventory }) {
  const [reason, setReason] = useState('sales-outside'); // 'sales-outside', 'damaged', 'correction-remove'
  const [quantity, setQuantity] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);
  const reasonDropdownRef = useRef(null);

  // Get available batches for this item (FIFO - oldest first)
  const availableBatches = useMemo(() => {
    if (!inventory || !item) return [];
    const itemData = inventory.find(inv => inv.id === item.id);
    const itemBatches = itemData?.batches || [];
    return itemBatches
      .filter(batch => batch.remainingQty > 0)
      .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));
  }, [inventory, item]);

  // Auto-select oldest batch (FIFO) and update selected batch object
  useEffect(() => {
    if (availableBatches.length > 0) {
      setSelectedBatchId(availableBatches[0].batchId);
      setSelectedBatch(availableBatches[0]);
    }
  }, [availableBatches]);

  // Update selected batch when dropdown changes
  useEffect(() => {
    const batch = availableBatches.find(b => b.batchId === selectedBatchId);
    setSelectedBatch(batch || null);
  }, [selectedBatchId, availableBatches]);

  useEffect(() => {
    if (isOpen && item) {
      // Reset form when modal opens
      setReason('sales-outside');
      setQuantity('');
      setSellingPrice('');
      setSaleDate(new Date().toISOString().split('T')[0]);
      setRemarks('');
      setCustomerName('');
      setShowConfirmModal(false);
      setPendingData(null);
      setShowValidationModal(false);
      setValidationMessage('');
    }
  }, [isOpen, item]);

  const handleSubmit = () => {
    if (!quantity || quantity <= 0) {
      setValidationMessage('Please enter a valid quantity');
      setShowValidationModal(true);
      return;
    }

    // Validate batch selection
    if (!selectedBatchId || !selectedBatch) {
      setValidationMessage('Please select a batch');
      setShowValidationModal(true);
      return;
    }

    // For sales outside system, require selling price
    if (reason === 'sales-outside' && !sellingPrice) {
      setValidationMessage('Please enter the sold price');
      setShowValidationModal(true);
      return;
    }

    // Store pending data with batch information and show confirmation modal
    const adjustmentData = {
      reason,
      quantity: parseInt(quantity),
      sellingPrice: reason === 'sales-outside' ? parseFloat(sellingPrice) : 0,
      saleDate: reason === 'sales-outside' ? saleDate : null,
      remarks: remarks || null,
      customerName: customerName || null,
      batchId: selectedBatchId,
      batchData: selectedBatch ? {
        batchId: selectedBatch.batchId,
        supplierId: selectedBatch.supplierId,
        supplierName: selectedBatch.supplierName,
        unitCost: selectedBatch.unitCost,
        remainingQty: selectedBatch.remainingQty
      } : null
    };

    // Show confirmation modal for all reasons
    setPendingData(adjustmentData);
    setShowConfirmModal(true);
  };

  const handleConfirmSale = () => {
    if (pendingData) {
      onConfirm(pendingData);
      setShowConfirmModal(false);
      setPendingData(null);
      onClose();
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Reduce Stock</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Item Info */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid var(--primary)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Adjusting Stock for:</div>
            <div style={{ fontWeight: '600', color: 'var(--white)', fontSize: '1.125rem' }}>{item.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
              Category: {item.category} - Current Stock: {item.stockQty} pcs
            </div>
          </div>

          {/* Reason Dropdown */}
          <div className="form-group">
            <label className="form-label">
              Reason for Adjustment <span className="required">*</span>
            </label>
            <div className="combobox-root" ref={reasonDropdownRef}>
              <div className="combobox-field">
                <input
                  type="text"
                  className="form-input"
                  value={
                    reason === 'sales-outside' ? 'Sales Outside System (Manual Sale)' :
                    reason === 'damaged' ? 'Damaged Stock' :
                    'Stock Correction (Remove)'
                  }
                  readOnly
                  onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                  style={{ cursor: 'pointer' }}
                />
                <button
                  type="button"
                  className="combobox-toggle"
                  onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                >
                  {showReasonDropdown ? '▲' : '▼'}
                </button>
              </div>
              {showReasonDropdown && (
                <div className="combobox-menu">
                  <button
                    type="button"
                    className={`combobox-item${reason === 'sales-outside' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('sales-outside');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Sales Outside System (Manual Sale)
                  </button>
                  <button
                    type="button"
                    className={`combobox-item${reason === 'damaged' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('damaged');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Damaged Stock
                  </button>
                  <button
                    type="button"
                    className={`combobox-item${reason === 'correction-remove' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('correction-remove');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Stock Correction (Remove)
                  </button>
                </div>
              )}
            </div>
            {reason === 'sales-outside' && (
              <p className="form-hint" style={{ color: '#facc15', marginTop: '0.5rem' }}>
                Preferred: This will create a sales record and reduce stock.
              </p>
            )}
          </div>

          {/* Quantity */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">
              Quantity {reason === 'sales-outside' ? 'Sold' : 'to Remove'} <span className="required">*</span>
            </label>
            <NumberInput
              className="form-input no-spinner"
              value={quantity}
              onChange={e => setQuantity(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={item.stockQty}
              placeholder=""
            />
            {quantity > item.stockQty && (
              <p className="form-hint" style={{ color: '#f87171', marginTop: '0.5rem' }}>
                Quantity exceeds current stock ({item.stockQty} pcs)
              </p>
            )}
          </div>

          {/* Batch Selection (FIFO) */}
          {availableBatches.length > 0 && (
            <div style={{
              background: 'rgba(217, 119, 6, 0.1)',
              border: '2px solid rgba(217, 119, 6, 0.3)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.25rem'
            }}>
              <label className="form-label" style={{ color: '#d97706', marginBottom: '0.75rem', display: 'block', fontWeight: 600 }}>
                Select Batch (FIFO - Oldest First)
              </label>
              <select
                className="form-input"
                value={selectedBatchId}
                onChange={e => setSelectedBatchId(e.target.value)}
                style={{
                  background: 'var(--dark)',
                  borderColor: 'var(--border)',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  padding: '0.75rem',
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                {availableBatches.map(batch => (
                  <option key={batch.batchId} value={batch.batchId} style={{ background: 'var(--dark)', color: 'var(--white)', padding: '0.5rem' }}>
                    {batch.batchId} | {new Date(batch.dateReceived).toLocaleDateString()} | {batch.remainingQty}pcs @ ₱{formatPrice(batch.unitCost)}
                  </option>
                ))}
              </select>
              {selectedBatch && quantity && (
                <div style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.75rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}>
                  <div style={{ marginBottom: '0.5rem', color: 'var(--gray)' }}>
                    <span style={{ color: 'var(--white)', fontWeight: 600 }}>Invoice:</span> {selectedBatch.invoiceNumber || 'N/A'}
                  </div>
                  <div style={{ color: '#d97706', fontWeight: 700, fontSize: '1rem' }}>
                    💰 Return Value: ₱{formatPrice(selectedBatch.unitCost * parseInt(quantity))} 
                    <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--gray)' }}>
                      ({quantity} × ₱{formatPrice(selectedBatch.unitCost)})
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dynamic Fields based on reason */}
          {reason === 'sales-outside' && (
            <>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">
                  Total Amount Received (₱) <span className="required">*</span>
                </label>
                <div className="tier-price-cell">
                  <span className="peso">₱</span>
                  <input
                    type="number"
                    className="tier-input no-spinner"
                    value={sellingPrice}
                    onChange={e => {
                      const val = e.target.value;
                      // Allow empty or valid decimal number
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setSellingPrice(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      // Block e, E, +, -
                      if (['e', 'E', '+', '-'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    onWheel={(e) => {
                      e.target.blur();
                      e.preventDefault();
                    }}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                  Enter the total amount received.
                </p>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">
                  Date of Sale <span className="required">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={saleDate}
                  onChange={e => setSaleDate(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">
                  Customer Name <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g., Juan Dela Cruz"
                />
              </div>
            </>
          )}

          {reason === 'damaged' && (
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">
                Remarks / Cause of Damage <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
              </label>
              <textarea
                className="form-textarea"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="e.g., Broken item, Item defect..."
                rows={3}
              />
            </div>
          )}

          {reason === 'correction-remove' && (
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">
                Remarks <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
              </label>
              <textarea
                className="form-textarea"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="e.g., Inventory count adjustment..."
                rows={3}
              />
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={quantity > item.stockQty || !quantity}
          >
            {reason === 'sales-outside' ? 'Record Sale' : reason === 'damaged' ? 'Mark as Damaged' : 'Adjust Stock'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Stock Reduction */}
      <div className="modal-overlay" style={{ display: showConfirmModal ? 'flex' : 'none' }} onClick={e => e.stopPropagation()}>
        <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title modal-title-success">
              {pendingData?.reason === 'sales-outside' ? 'Confirm Sale Record' : 
               pendingData?.reason === 'damaged' ? 'Confirm Stock Reduction' : 'Confirm Stock Adjustment'}
            </h2>
            <button className="modal-close" onClick={() => setShowConfirmModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="modal-body">
            <div className="confirm-summary">
              <div className="confirm-row">
                <span className="confirm-label">Product:</span>
                <span className="confirm-value">{item?.name}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Category:</span>
                <span className="confirm-value">{item?.category}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Quantity:</span>
                <span className="confirm-value" style={{ color: '#f87171', fontWeight: '700' }}>
                  −{pendingData?.quantity} pcs
                </span>
              </div>
              {pendingData?.reason === 'sales-outside' ? (
                <>
                  <div className="confirm-row">
                    <span className="confirm-label">Total Amount Received:</span>
                    <span className="confirm-value" style={{ color: '#4ade80', fontWeight: '700' }}>
                      {formatPrice(pendingData?.sellingPrice || 0)}
                    </span>
                  </div>
                  {pendingData?.customerName && (
                    <div className="confirm-row">
                      <span className="confirm-label">Customer:</span>
                      <span className="confirm-value">{pendingData.customerName}</span>
                    </div>
                  )}
                  <div className="confirm-row">
                    <span className="confirm-label">Date:</span>
                    <span className="confirm-value">{pendingData?.saleDate || new Date().toISOString().split('T')[0]}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="confirm-row">
                    <span className="confirm-label">Reason:</span>
                    <span className="confirm-value">
                      {pendingData?.reason === 'damaged' ? 'Damaged Stock' : 'Stock Correction'}
                    </span>
                  </div>
                  {pendingData?.remarks && (
                    <div className="confirm-row">
                      <span className="confirm-label">Remarks:</span>
                      <span className="confirm-value">{pendingData.remarks}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <p className="confirm-hint" style={{ marginTop: '1rem', color: '#facc15' }}>
              {pendingData?.reason === 'sales-outside' 
                ? 'This will create a sales record and reduce your inventory stock.'
                : 'This will reduce your inventory stock and create an audit log entry.'}
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirmSale}>
              {pendingData?.reason === 'sales-outside' ? 'Confirm Sale' : 
               pendingData?.reason === 'damaged' ? 'Confirm Reduction' : 'Confirm Adjustment'}
            </button>
          </div>
        </div>
      </div>

      {/* Validation Modal */}
      <div className="modal-overlay" style={{ display: showValidationModal ? 'flex' : 'none' }} onClick={e => e.stopPropagation()}>
        <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title modal-title-warning">Validation Error</h2>
            <button className="modal-close" onClick={() => setShowValidationModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="modal-body">
            <p className="delete-confirm-text">
              {validationMessage}
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={() => setShowValidationModal(false)}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Save Modal (Add/Edit) ─────────────────────────────────────────────
function ConfirmSaveModal({ isOpen, onClose, onConfirm, itemData, isEdit }) {
  if (!isOpen || !itemData) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-success">
            {isEdit ? 'Update Item' : 'Add New Item'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="confirm-summary">
            <div className="confirm-row">
              <span className="confirm-label">Product Name:</span>
              <span className="confirm-value">{itemData.name}</span>
            </div>
            <div className="confirm-row">
              <span className="confirm-label">Category:</span>
              <span className="confirm-value">{itemData.category}</span>
            </div>
            <div className="confirm-row">
              <span className="confirm-label">Status:</span>
              <span className="confirm-value">
                {itemData.isOnDemand ? 'Upon Order' : `${itemData.stockQty} pcs (Min: ${itemData.minStockLevel})`}
              </span>
            </div>
          </div>
          <p className="confirm-hint">
            {isEdit 
              ? 'This will update the inventory item.'
              : 'This will add a new item to your inventory.'}
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm}>
            {isEdit ? 'Update' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Inventory Page ────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [suppliers, setSuppliers] = useState([]); // NEW: Suppliers state
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingInline, setEditingInline] = useState(null); // { id, field, value }
  const [statusFilter, setStatusFilter] = useState(''); // 'low-stock', 'out-of-stock', 'upon-order', ''
  const [showArchived, setShowArchived] = useState(false); // Toggle archived items visibility
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // For Add/Edit confirmation
  const [pendingItemData, setPendingItemData] = useState(null); // Temp storage before confirm
  const [modalKey, setModalKey] = useState(0); // Force modal remount for fresh form
  const [expandedRows, setExpandedRows] = useState(new Set()); // NEW: For expandable rows

  // NEW: States for Archive/Delete with product reference checking
  const [archiveItem, setArchiveItem] = useState(null); // Item to archive/delete
  const [referencingProducts, setReferencingProducts] = useState([]); // Products using this item
  const [showArchiveModal, setShowArchiveModal] = useState(false); // Show archive confirmation
  const [restoreItem, setRestoreItem] = useState(null); // Item to restore
  const [hasSalesHistory, setHasSalesHistory] = useState(false); // NEW: Track if item has sales
  
  // NEW: States for Manual Stock Adjustment
  const [adjustmentItem, setAdjustmentItem] = useState(null); // Item being adjusted
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false); // Show adjustment modal (reduce)
  const [showAdjustmentSuccess, setShowAdjustmentSuccess] = useState(false); // Show success message

  // NEW: States for Stock Addition
  const [additionItem, setAdditionItem] = useState(null); // Item being added
  const [showAdditionModal, setShowAdditionModal] = useState(false); // Show addition modal
  const [showConvertModal, setShowConvertModal] = useState(false); // Show convert from Upon Order confirmation
  const [showManageSuppliersModal, setShowManageSuppliersModal] = useState(false); // NEW: Supplier management modal
  const [deleteSupplierId, setDeleteSupplierId] = useState(null); // For supplier delete confirmation
  const [showSupplierDeleteConfirm, setShowSupplierDeleteConfirm] = useState(false); // Supplier delete confirmation modal
  const [showSupplierInUseError, setShowSupplierInUseError] = useState(false); // Supplier in use error modal

  // NEW: States for Batch Details Modal
  const [showBatchDetailsModal, setShowBatchDetailsModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedBatchItem, setSelectedBatchItem] = useState(null);

  // Handle supplier delete confirmation
  const handleConfirmDeleteSupplier = () => {
    if (!deleteSupplierId) return;

    const updated = suppliers.filter(s => s.id !== deleteSupplierId);
    setSuppliers(updated);
    saveSuppliers(updated);
    setDeleteSupplierId(null);
    setShowSupplierDeleteConfirm(false);
  };

  // Load inventory and suppliers from API on mount
  useEffect(() => {
    async function loadData() {
      try {
        // Load inventory
        const inventoryData = await fetchInventory();
        setInventory(Array.isArray(inventoryData) ? inventoryData : []);

        // Load categories (derive from inventory or use default)
        const inventoryCategories = inventoryData
          ? [...new Set(inventoryData.map(item => item.category).filter(Boolean))]
          : [];
        setCategories(inventoryCategories.length > 0 ? inventoryCategories : DEFAULT_CATEGORIES);

        // Load suppliers
        const suppliersData = await fetchSuppliers();
        setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
      } catch (error) {
        console.error('Failed to load inventory data:', error);
        // Fallback to empty state on error
        setInventory([]);
        setCategories(DEFAULT_CATEGORIES);
        setSuppliers([]);
      } finally {
        setIsLoaded(true);
      }
    }

    loadData();
  }, []);

  // Handle Add Category - adds to state only (categories derived from inventory)
  const handleAddCategory = (newCategory) => {
    const updatedCategories = [...categories, newCategory];
    setCategories(updatedCategories);
  };

  // NEW: Handle Add Supplier - Uses API
  const handleAddSupplier = async (supplierData) => {
    try {
      const created = await createSupplier(supplierData);
      setSuppliers(prev => [...prev, created]);
      return created;
    } catch (error) {
      console.error('Failed to add supplier:', error);
      alert('Failed to add supplier: ' + (error.message || 'Unknown error'));
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
    const matchesSearch = item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);

    // Status filter
    let matchesStatus = true;
    if (statusFilter === 'low-stock') {
      matchesStatus = !item.isOnDemand && item.stockQty > 0 && item.stockQty <= item.minStockLevel;
    } else if (statusFilter === 'out-of-stock') {
      matchesStatus = !item.isOnDemand && item.stockQty === 0;
    } else if (statusFilter === 'upon-order') {
      matchesStatus = item.isOnDemand;
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

  // NEW: Filter for archived items (for separate view)
  const archivedInventory = inventory.filter(item => item.isActive === false);

  // Handle Add New Item
  const handleAddNew = () => {
    setEditingItem(null);
    setPendingItemData(null);
    setIsConfirmModalOpen(false);
    // Force modal to remount with fresh state by using key
    setModalKey(prev => prev + 1);
    setIsModalOpen(true);
  };

  // Handle Edit Item
  const handleEdit = (item) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  // Handle Delete/Archive Item
  // NEW: Check if item is referenced by products OR sales before allowing delete
  const handleDelete = (item) => {
    // TODO: MongoDB - Replace with API calls to get products and orders referencing this item
    // CURRENT: Check LocalStorage for products and orders
    // FUTURE: GET /api/products?inventoryId={item.id} AND GET /api/orders?inventoryId={item.id}

    const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    const allOrders = JSON.parse(localStorage.getItem('pmp_sales') || '[]');

    // Check if referenced by products
    const productsUsingThisItem = allProducts.filter(
      p => p.inventoryId === item.id
    );

    // NEW: Check if item has sales history
    const salesWithThisItem = allOrders.filter(order =>
      order.inventoryId === item.id ||  // Direct inventory sale
      order.items?.some(orderItem => orderItem.inventoryId === item.id) ||
      order.productInventoryId === item.id
    );

    setReferencingProducts(productsUsingThisItem);
    setHasSalesHistory(salesWithThisItem.length > 0); // NEW: Track sales history
    setArchiveItem(item);

    // NEW: Store sales info for validation
    setShowArchiveModal(true);
  };

  // NEW: Archive item (soft delete) - Uses API
  const handleArchive = async () => {
    if (!archiveItem) return;

    try {
      // Archive via API (sets isActive: false)
      const id = archiveItem.id || archiveItem._id;
      await deleteInventory(id);

      // Auto-archive products linked to this inventory item
      try {
        const allProducts = await fetchProducts();
        const linkedProducts = allProducts.filter(p => 
          p.inventoryId === id || 
          p.inventoryId === archiveItem?.id || 
          p.inventoryId === archiveItem?._id
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
      alert('Failed to archive: ' + (error.message || 'Unknown error'));
    }
  };

  // Handle Permanent Delete (only if not referenced) - Uses API
  const handlePermanentDelete = async () => {
    if (!archiveItem) return;

    try {
      // Delete permanently via API
      const id = archiveItem.id || archiveItem._id;
      await deleteInventory(id);
      
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
      alert('Failed to delete: ' + (error.message || 'Unknown error'));
    }
  };

  // NEW: Restore archived item - Uses API
  const handleRestore = async (item) => {
    try {
      const id = item.id || item._id;
      
      // Call API to restore item
      const restored = await updateInventory(id, { 
        isActive: true,
        deletedAt: null,
        updatedAt: new Date().toISOString()
      });
      
      // Update local state with restored item
      setInventory(prev => prev.map(i => 
        (i.id === id || i._id === id) 
          ? { ...i, ...restored, isActive: true, deletedAt: null }
          : i
      ));
      
    } catch (error) {
      console.error('Failed to restore item:', error);
      alert('Failed to restore item: ' + (error.message || 'Unknown error'));
    }
  };

  // NEW: Handle stock adjustment (Manual Stock Out) - Uses API
  const handleStockAdjustment = async (adjustmentData) => {
    if (!adjustmentItem) return;

    try {
      const id = adjustmentItem.id || adjustmentItem._id;
      const { reason, quantity, sellingPrice, saleDate, remarks, customerName, batchId, batchData } = adjustmentData;

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
      alert('Failed to adjust stock: ' + (error.message || 'Unknown error'));
    }
  };

  // NEW: Handle stock addition (Manual Stock In) - Uses API
  const handleStockAddition = async (additionData) => {
    if (!additionItem) return;

    try {
      const id = additionItem.id || additionItem._id;
      
      const updated = await adjustInventoryStock(id, {
        adjustmentType: 'add',
        quantity: Math.abs(additionData.quantity),
        reason: additionData.reason || 'restock',
        supplierId: additionData.supplierId || null,
        supplierName: additionData.supplierName || null,
        unitCost: additionData.unitCost ? parseFloat(additionData.unitCost) : null,
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
      alert('Failed to add stock: ' + (error.message || 'Unknown error'));
    }
  };

  // Handle Save (Add or Update) - Shows confirmation modal first
  // TODO: MongoDB - Replace with API call
  // CURRENT: Stores locally, saves to LocalStorage via useEffect
  // FUTURE: POST /api/inventory (new) or PUT /api/inventory/:id (update)
  const handleSave = (itemData) => {
    // VALIDATION: If initialStock > 0, require invoice number and delivery date
    if (!editingItem && itemData.initialStock !== '' && itemData.initialStock !== null && parseInt(itemData.initialStock) > 0) {
      if (!itemData.invoiceNumber || itemData.invoiceNumber.trim() === '') {
        setValidationMessage('Please enter invoice number for initial stock');
        setShowValidationModal(true);
        return;
      }
      if (!itemData.deliveryDate) {
        setValidationMessage('Please enter delivery date for initial stock');
        setShowValidationModal(true);
        return;
      }
    }

    // Auto-detect isOnDemand based on quantity
    const isOnDemand = !itemData.initialStock || itemData.initialStock === 0 || itemData.initialStock === '';

    // Store pending data with batch info and show confirmation modal
    const pendingData = {
      ...itemData,
      id: editingItem ? editingItem.id : crypto.randomUUID(),
      // Include invoice data for batch creation
      invoiceNumber: itemData.invoiceNumber,
      deliveryDate: itemData.deliveryDate,
      supplierId: itemData.supplierId,
      supplierName: itemData.supplierName,
      isOnDemand: isOnDemand  // Auto-detect!
    };
    
    setPendingItemData(pendingData);
    setIsConfirmModalOpen(true);
  };

  // Confirm the Add/Edit action - Uses API
  const handleConfirmSave = async () => {
    if (!pendingItemData) return;

    try {
      if (editingItem) {
        // Update existing item via API
        const id = editingItem.id || editingItem._id;
        const updated = await updateInventory(id, pendingItemData);
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
        const created = await createInventory(newItem);
        setInventory(prev => [...prev, created]);
      }

      // Close all modals and reset
      setIsConfirmModalOpen(false);
      setIsModalOpen(false);
      setEditingItem(null);
      setPendingItemData(null);
    } catch (error) {
      console.error('Failed to save inventory item:', error);
      alert('Failed to save: ' + (error.message || 'Unknown error'));
    }
  };

  // Handle Confirm Delete
  // TODO: MongoDB - Replace with API call
  // CURRENT: Removes from LocalStorage state
  // FUTURE: DELETE /api/inventory/:id
  //
  // Example:
  // const handleConfirmDelete = async () => {
  //   if (!deleteItem) return;
  //   await fetch(`/api/inventory/${deleteItem.id}`, { method: 'DELETE' });
  //   setInventory(prev => prev.filter(item => item.id !== deleteItem.id));
  // };
  const handleConfirmDelete = () => {
    if (deleteItem) {
      setInventory(prev => prev.filter(item => item.id !== deleteItem.id));
      setDeleteItem(null);
    }
  };

  // Handle Inline Edit Start
  const handleInlineEditStart = (item, field) => {
    if (item.isOnDemand) return; // Don't allow editing for Upon Order items
    setEditingInline({ id: item.id, field, value: item[field] });
  };

  // Handle Inline Edit Save
  const handleInlineEditSave = () => {
    if (!editingInline) return;
    setInventory(prev =>
      prev.map(item =>
        item.id === editingInline.id
          ? { ...item, [editingInline.field]: parseInt(editingInline.value) || 0 }
          : item
      )
    );
    setEditingInline(null);
  };

  // Handle Inline Edit Cancel
  const handleInlineEditCancel = () => {
    setEditingInline(null);
  };

  // Handle Inline Edit Change
  const handleInlineEditChange = (e) => {
    const val = e.target.value;
    if (val === '' || (parseInt(val) >= 0)) {
      setEditingInline(prev => ({ ...prev, value: val }));
    }
  };

  // Get stock status
  const getStockStatus = (item) => {
    if (item.isOnDemand) {
      return { status: 'upon-order', label: 'Upon Order', className: 'stock-status-upon-order' };
    }
    if (item.stockQty === 0) {
      return { status: 'out-of-stock', label: 'Out of Stock', className: 'stock-status-out' };
    }
    if (item.stockQty <= item.minStockLevel) {
      return { status: 'low-stock', label: 'Low Stock', className: 'stock-status-low' };
    }
    return { status: 'in-stock', label: 'In Stock', className: 'stock-status-ok' };
  };

  // Calculate summary stats
  // NEW: Separate active and archived items
  const totalItems = inventory.length;
  const activeItems = inventory.filter(item => item.isActive !== false).length;
  const archivedItems = inventory.filter(item => item.isActive === false).length;
  const lowStockItems = inventory.filter(item => !item.isOnDemand && item.stockQty <= item.minStockLevel && item.stockQty > 0 && item.isActive !== false).length;
  const outOfStockItems = inventory.filter(item => !item.isOnDemand && item.stockQty === 0 && item.isActive !== false).length;
  const uponOrderItems = inventory.filter(item => item.isOnDemand && item.isActive !== false).length;

  if (!isLoaded) {
    return (
      <div className="page-content-wrapper">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
      {/* ── Page Header ────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Inventory</h1>
            <p className="page-subtitle">
              Manage your blank materials and track stock levels.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowManageSuppliersModal(true)}
            >
              <span className="btn-icon">+</span>
              Suppliers
            </button>
            <button className="btn-primary" onClick={handleAddNew}>
              <span className="btn-icon">+</span>
              Add New Item
            </button>
          </div>
        </div>

        {/* ── Summary Cards ────────────────────────────────────────────────────── */}
        <div className="inventory-summary">
          <div
            className={`summary-card${statusFilter === '' ? ' active' : ''}`}
            onClick={() => setStatusFilter('')}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-content">
              <span className="summary-value">{activeItems}</span>
              <span className="summary-label">Active Items</span>
            </div>
          </div>
          <div
            className={`summary-card summary-card-warning${statusFilter === 'low-stock' ? ' active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'low-stock' ? '' : 'low-stock')}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-content">
              <span className="summary-value">{lowStockItems}</span>
              <span className="summary-label">Low Stock</span>
            </div>
          </div>
          <div
            className={`summary-card summary-card-danger${statusFilter === 'out-of-stock' ? ' active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'out-of-stock' ? '' : 'out-of-stock')}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-content">
              <span className="summary-value">{outOfStockItems}</span>
              <span className="summary-label">Out of Stock</span>
            </div>
          </div>
          <div
            className={`summary-card summary-card-info${statusFilter === 'upon-order' ? ' active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'upon-order' ? '' : 'upon-order')}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-content">
              <span className="summary-value">{uponOrderItems}</span>
              <span className="summary-label">Upon Order</span>
            </div>
          </div>
          {archivedItems > 0 && (
            <div
              className={`summary-card${showArchived ? ' active' : ''}`}
              onClick={() => setShowArchived(!showArchived)}
              style={{
                cursor: 'pointer',
                background: showArchived ? 'rgba(100, 100, 100, 0.2)' : 'rgba(100, 100, 100, 0.1)',
                border: showArchived ? '1px solid var(--gray)' : '1px solid rgba(100, 100, 100, 0.3)'
              }}
            >
              <div className="summary-content">
                <span className="summary-value" style={{ color: 'var(--gray)' }}>{archivedItems}</span>
                <span className="summary-label" style={{ color: 'var(--gray)' }}>Archived</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Search Bar ─────────────────────────────────────────────────────────── */}
      <div className="inventory-toolbar">
        <div className="search-wrapper">
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or category..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
        <div className="inventory-legend">
          <span className="legend-item">
            <span className="legend-dot legend-dot-low"></span>
            Low Stock
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot-out"></span>
            Out of Stock
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot-upon-order"></span>
            Upon Order
          </span>
        </div>
      </div>

      {/* ── Inventory Table ────────────────────────────────────────────────────── */}
      <div style={{
        WebkitOverflowScrolling: 'touch',
        border: '1px solid var(--border)',
        boxSizing: 'border-box',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--gold) var(--dark2)',
        borderRadius: '10px',
        width: '0',
        minWidth: '100%',
        marginBottom: '1rem',
        display: 'block',
        overflowX: 'auto',
      }}>
        {filteredInventory.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <h3 className="empty-title">
              {searchQuery 
                ? 'No items found' 
                : statusFilter === 'out-of-stock'
                  ? 'No Out of Stock Products'
                  : statusFilter === 'low-stock'
                    ? 'No Low Stock Products'
                    : statusFilter === 'upon-order'
                      ? 'No Upon Order Products'
                      : 'No Inventory Items'}
            </h3>
            <p className="empty-description">
              {searchQuery
                ? 'Try adjusting your search query.'
                : statusFilter
                  ? `No products match the "${statusFilter.replace('-', ' ')}" filter.`
                  : 'Get started by adding your first inventory item.'}
            </p>
            {!searchQuery && !statusFilter && (
              <button className="btn-primary" onClick={handleAddNew}>
                Add First Item
              </button>
            )}
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
                const stockStatus = getStockStatus(item);
                const isExpanded = expandedRows.has(item.id);
                
                return (
                  <React.Fragment key={item.id}>
                    <tr className="inventory-table-row">
                      {/* Expand chevron */}
                      <td style={{ width: '28px', cursor: 'pointer' }} onClick={() => toggleExpand(item.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ color: 'var(--gray)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'block' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </td>
                    <td className="table-cell-name">
                      <span className="product-name">{item.name}</span>
                    </td>
                    <td className="table-cell">
                      <span className="category-badge">{item.category}</span>
                    </td>
                    <td className="table-cell-stock" style={{ textAlign: 'center' }}>
                      {item.isOnDemand ? (
                        <span className="stock-value-dash">—</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <button
                            className="btn-sm btn-secondary"
                            onClick={() => {
                              setAdjustmentItem(item);
                              setShowAdjustmentModal(true);
                            }}
                            disabled={item.stockQty === 0}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: '1' }}
                            title="Reduce stock (Manual adjustment)"
                          >
                            −
                          </button>
                          <span
                            className={`stock-value-inline ${stockStatus.status === 'out-of-stock' ? 'stock-value-zero' : ''}`}
                            style={{ minWidth: '40px', display: 'inline-block', textAlign: 'center' }}
                          >
                            {item.stockQty}
                          </span>
                          <button
                            className="btn-sm btn-secondary"
                            onClick={() => {
                              if (item.isOnDemand) {
                                // Item is Upon Order - show conversion confirmation
                                setAdditionItem(item);
                                setShowConvertModal(true);
                              } else {
                                // Item is In Stock - open add stock modal directly
                                setAdditionItem(item);
                                setShowAdditionModal(true);
                              }
                            }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: '1' }}
                            title="Add stock"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="table-cell">
                      {item.isOnDemand ? (
                        <span className="stock-value-dash">—</span>
                      ) : editingInline?.id === item.id && editingInline?.field === 'minStockLevel' ? (
                        <NumberInput
                          className="form-input-inline"
                          value={editingInline.value}
                          onChange={handleInlineEditChange}
                          onBlur={handleInlineEditSave}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleInlineEditSave();
                            if (e.key === 'Escape') handleInlineEditCancel();
                          }}
                          min={0}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="min-stock-value-inline"
                          onClick={() => handleInlineEditStart(item, 'minStockLevel')}
                          title="Click to edit"
                        >
                          {item.minStockLevel}
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`stock-status-badge ${stockStatus.className}`}>
                        {stockStatus.label}
                      </span>
                    </td>
                    <td className="table-cell-actions">
                      <button
                        className="btn-sm btn-secondary"
                        onClick={() => handleEdit(item)}
                        style={{ background: 'var(--gold)', borderColor: 'var(--gold)', color: '#000' }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => handleDelete(item)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                  
                  {/* Expandable Row - Shows when expanded */}
                  {isExpanded && (
                    <InventoryExpandRow item={item} colSpan={7} />
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* NEW: Archived Items Section */}
      {showArchived && archivedInventory.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: 'var(--gray)',
            marginBottom: '1rem'
          }}>
            Archived Items ({archivedInventory.length})
          </h2>
          <div style={{
            WebkitOverflowScrolling: 'touch',
            border: '1px solid var(--border)',
            boxSizing: 'border-box',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--gold) var(--dark2)',
            borderRadius: '10px',
            width: '0',
            minWidth: '100%',
            marginBottom: '1rem',
            display: 'block',
            overflowX: 'auto',
          }}>
            <table className="inventory-table" style={{
              width: 'max-content',
              minWidth: '100%',
            }}>
              <thead>
                <tr>
                  <th className="table-col-name">Product Name</th>
                  <th className="table-col-category">Category</th>
                  <th className="table-col-stock">Stock</th>
                  <th className="table-col-status">Archived Date</th>
                  <th className="table-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedInventory.map(item => {
                  const isReferenced = JSON.parse(localStorage.getItem('pmp_products') || '[]').some(p => p.inventoryId === item.id);
                  const hasSalesHistory = JSON.parse(localStorage.getItem('pmp_sales') || '[]').some(order =>
                    order.inventoryId === item.id ||
                    order.items?.some(orderItem => orderItem.inventoryId === item.id) ||
                    order.productInventoryId === item.id
                  );
                  return (
                    <tr key={item.id} className="inventory-table-row" style={{ opacity: 0.5 }}>
                      <td className="table-cell-name">
                        <span className="product-name" style={{ color: 'var(--gray)' }}>{item.name}</span>
                      </td>
                      <td className="table-cell">
                        <span className="category-badge" style={{ background: 'rgba(100, 100, 100, 0.2)', color: 'var(--gray)' }}>{item.category}</span>
                      </td>
                      <td className="table-cell">
                        {item.isOnDemand ? (
                          <span className="stock-value-dash" style={{ color: 'var(--gray)' }}>Upon Order</span>
                        ) : (
                          <span className="stock-value-inline" style={{ color: 'var(--gray)' }}>{item.stockQty}</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
                          {item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td className="table-cell-actions">
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn-sm btn-primary"
                            onClick={() => setRestoreItem(item)}
                            style={{
                              background: 'var(--dark2)',
                              borderColor: 'var(--border)',
                              color: 'var(--white)',
                              cursor: 'pointer'
                            }}
                          >
                            Restore
                          </button>
                          {!isReferenced && !hasSalesHistory && (
                            <button
                              className="btn-sm btn-danger"
                              onClick={() => handleDelete(item)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{
            marginTop: '1rem',
            color: 'var(--gray)',
            fontSize: '0.875rem',
            fontStyle: 'italic'
          }}>
            <span style={{ marginRight: '0.5rem', fontWeight: 'bold', color: '#f59e0b' }}>⚠</span> Deleted items were archived to avoid data discrepancies. Adding a product with the same name under the same category will Restore the archived item instead.
          </p>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      <InventoryModal
        key={modalKey}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSave}
        onEdit={(existingItem) => {
          setEditingItem(existingItem);
          setIsModalOpen(true);
        }}
        onRestoreItem={(archivedItem) => {
          handleRestore(archivedItem);
        }}
        item={editingItem}
        editingItem={editingItem}
        categories={categories}
        onAddCategory={handleAddCategory}
        inventory={inventory}
        suppliers={suppliers}
        onAddSupplier={handleAddSupplier}
      />

      {/* NEW: Archive/Delete Confirmation Modal with product reference checking */}
      <ArchiveConfirmModal
        isOpen={showArchiveModal}
        onClose={() => {
          setShowArchiveModal(false);
          setArchiveItem(null);
          setReferencingProducts([]);
          setHasSalesHistory(false);
        }}
        onArchive={handleArchive}
        onDelete={handlePermanentDelete}
        itemName={archiveItem?.name}
        isReferenced={referencingProducts.length > 0}
        referencingProductsCount={referencingProducts.length}
        hasSalesHistory={hasSalesHistory}
      />

      {/* NEW: Restore Confirmation Modal */}
      {restoreItem && (
        <ConfirmModal
          title="Restore Inventory Item"
          message={`Restore "${restoreItem.name}" from archived? This will make the item available for use again.`}
          confirmLabel="Restore"
          confirmClass="btn-primary"
          onConfirm={() => {
            handleRestore(restoreItem);
            setRestoreItem(null);
          }}
          onCancel={() => setRestoreItem(null)}
        />
      )}

      {/* NEW: Manual Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={showAdjustmentModal}
        onClose={() => {
          setShowAdjustmentModal(false);
          setAdjustmentItem(null);
        }}
        onConfirm={handleStockAdjustment}
        item={adjustmentItem}
        inventory={inventory}
      />

      {/* NEW: Stock Addition Modal */}
      <StockAdditionModal
        isOpen={showAdditionModal}
        onClose={() => {
          setShowAdditionModal(false);
          setAdditionItem(null);
        }}
        onConfirm={handleStockAddition}
        item={additionItem}
        suppliers={suppliers}
        onAddSupplier={handleAddSupplier}
      />

      {/* Manage Suppliers Modal */}
      <ManageSuppliersModal
        isOpen={showManageSuppliersModal}
        onClose={() => setShowManageSuppliersModal(false)}
        suppliers={suppliers}
        inventory={inventory}
        onAdd={(data) => {
          const newSupplier = addSupplier(data);
          const updated = [...suppliers, newSupplier];
          setSuppliers(updated);
          saveSuppliers(updated);
        }}
        onUpdate={(id, data) => {
          const updated = suppliers.map(s => s.id === id ? { ...s, ...data } : s);
          setSuppliers(updated);
          saveSuppliers(updated);
        }}
        onDelete={(id) => {
          // Check if supplier is currently used by any active inventory item
          const isInUseByInventory = inventory.some(item =>
            item.lastSupplierId === id && item.isActive !== false
          );

          if (isInUseByInventory) {
            // Show error - cannot delete, pass supplier info for modal
            setDeleteSupplierId(null);
            setShowSupplierInUseError(true);
            return;
          }

          // Show confirmation modal before deleting
          setDeleteSupplierId(id);
          setShowSupplierDeleteConfirm(true);
        }}
      />

      {/* Supplier In Use Error Modal */}
      {showSupplierInUseError && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setShowSupplierInUseError(false)}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title modal-title-warning">Cannot Delete Supplier</h2>
              <button className="modal-close" onClick={() => setShowSupplierInUseError(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p className="delete-confirm-text">
                This supplier is currently being used by one or more inventory items.
              </p>
              <p className="delete-confirm-warning" style={{ marginTop: '0.75rem', color: '#f59e0b' }}>
                You cannot delete a supplier that is actively in use. Please update the inventory items first to use a different supplier.
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => setShowSupplierInUseError(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Delete Confirmation Modal */}
      {showSupplierDeleteConfirm && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setShowSupplierDeleteConfirm(false)}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title modal-title-danger">Delete Supplier</h2>
              <button className="modal-close" onClick={() => setShowSupplierDeleteConfirm(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p className="delete-confirm-text">
                Are you sure you want to delete this supplier?
              </p>
              <p className="delete-confirm-warning" style={{ marginTop: '0.75rem', color: '#f59e0b' }}>
                This action cannot be undone. The supplier will be permanently removed from your supplier list.
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowSupplierDeleteConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmDeleteSupplier}
              >
                Delete Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Upon Order to In Stock Confirmation */}
      {showConvertModal && additionItem && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setShowConvertModal(false)}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title modal-title-warning">Convert to In Stock</h2>
              <button className="modal-close" onClick={() => setShowConvertModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p className="delete-confirm-text">
                <strong>"{additionItem.name}"</strong> is currently set as <strong>"Upon Order"</strong>.
              </p>
              <p className="delete-confirm-warning" style={{ marginTop: '0.75rem', color: '#f59e0b' }}>
                Adding physical stock will convert this item to <strong>"In Stock"</strong> mode. This change will enable stock tracking for this item.
              </p>
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                marginTop: '1rem'
              }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Current Status:</div>
                <div style={{ fontWeight: '600', color: 'var(--white)', marginBottom: '0.25rem' }}>{additionItem.name}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
                  Category: {additionItem.category} • Status: Upon Order
                </div>
              </div>
              <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--gray)' }}>
                Do you want to proceed with adding stock and converting to "In Stock" mode?
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowConvertModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setShowConvertModal(false);
                  setShowAdditionModal(true); // Open stock addition modal
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmSaveModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setPendingItemData(null);
        }}
        onConfirm={handleConfirmSave}
        itemData={pendingItemData}
        isEdit={!!editingItem}
      />

      {/* Stock Adjustment Success Toast */}
      {showAdjustmentSuccess && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setShowAdjustmentSuccess(false)}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title modal-title-success">Success</h2>
              <button className="modal-close" onClick={() => setShowAdjustmentSuccess(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-hint" style={{ textAlign: 'center', fontSize: '0.95rem' }}>
                Stock adjusted successfully!
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => setShowAdjustmentSuccess(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Batch Details Modal (Resibo Format) */}
      {showBatchDetailsModal && selectedBatch && (
        <BatchDetailsModal
          batch={selectedBatch}
          item={selectedBatchItem}
          isOpen={showBatchDetailsModal}
          onClose={() => {
            setShowBatchDetailsModal(false);
            setSelectedBatch(null);
            setSelectedBatchItem(null);
          }}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}