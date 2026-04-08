'use client';

import ManualStockInModal from './ManualStockInModal';

/**
 * PURCHASING PAGE
 *
 * SAP-Grade Inventory Module — Phase 2
 *
 * Purpose: Manage purchasing workflow
 * - Purchase Orders (PO) Creation
 * - Purchase Order Tracking
 * - Goods Receipt (receiving against PO)
 * - Direct Stock-In (walk-in purchases, no PO needed)
 */


import React, { useState, useMemo, useEffect, useCallback } from 'react';
import CustomDropdown from '@/app/components/CustomDropdown';

// ── Storage Keys ───────────────────────────────────────────────────────────────
const PO_KEY         = 'pmp_purchase_orders';
const GR_KEY         = 'pmp_goods_receipts';
const RTV_KEY        = 'pmp_returns_to_vendor';
const PENDING_RTV_KEY = 'pmp_pending_rtvs';
const BACKORDER_KEY  = 'pmp_backorders';
const CREDIT_KEY     = 'pmp_credit_claims';
const STOCK_IN_KEY   = 'pmp_stock_in_log';
const STOCK_OUT_KEY  = 'pmp_stock_out_log';
const MATERIALS_KEY  = 'pmp_materials';
const VENDORS_KEY    = 'pmp_vendors';

// ── Storage Helpers ────────────────────────────────────────────────────────────
function getStore(key) {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}
function setStore(key, data) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Number Generation ──────────────────────────────────────────────────────────
function genDocNumber(prefix, list) {
  const year = new Date().getFullYear();
  const seq  = String((list.length || 0) + 1).padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
}

// ── PO Status Config ───────────────────────────────────────────────────────────
const PO_STATUS = {
  pending:   { label: 'Pending',   color: 'rgb(212, 168, 67)', bg: 'rgba(212,168,67,0.1)',   border: 'rgba(212,168,67,0.2)' },
  draft:     { label: 'Pending',   color: 'rgb(212, 168, 67)', bg: 'rgba(212,168,67,0.1)',   border: 'rgba(212,168,67,0.2)' },
  received:  { label: 'Completed', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.2)'  },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.2)'  },
};

const OPEN_STATUSES    = ['pending', 'draft'];
const RECEIVE_STATUSES = ['pending', 'draft'];

// ── Return Reasons ─────────────────────────────────────────────────────────────
const RETURN_REASONS = [
  'Damaged in Transit',
  'Defective Product',
  'Wrong Item Shipped',
  'Other',
];

// ── Shared Styles ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#E5E2E1',
  padding: '0.625rem 0.75rem',
  fontSize: '0.85rem',
  outline: 'none',
};

const thStyle = {
  padding: '0.875rem 1rem',
  textAlign: 'left',
  color: 'var(--gray)',
  fontWeight: 700,
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

// ── Reusable Input Components ──────────────────────────────────────────────────
function IntInput({ value, onChange, min = 0, max, placeholder, style, disabled }) {
  return (
    <input
      type="text" inputMode="numeric" pattern="[0-9]*"
      value={value} placeholder={placeholder} disabled={disabled} style={style}
      onChange={e => {
        const v = e.target.value;
        if (v === '' || /^\d+$/.test(v)) {
          if (v === '') { onChange(v); return; }
          const n = parseInt(v, 10);
          if (max !== undefined && n > max) return;
          if (n < min) return;
          onChange(v);
        }
      }}
      onKeyDown={e => ['e', 'E', '+', '-', '.'].includes(e.key) && e.preventDefault()}
      onWheel={e => document.activeElement === e.target && e.target.blur()}
    />
  );
}

function DecInput({ value, onChange, placeholder, style, disabled }) {
  return (
    <input
      type="text" inputMode="decimal"
      value={value} placeholder={placeholder} disabled={disabled} style={style}
      onChange={e => {
        const v = e.target.value;
        if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) onChange(v);
      }}
      onKeyDown={e => ['e', 'E', '+', ' '].includes(e.key) && e.preventDefault()}
      onWheel={e => document.activeElement === e.target && e.target.blur()}
    />
  );
}

// ── Status Badges ──────────────────────────────────────────────────────────────
function POStatusBadge({ status }) {
  const cfg = PO_STATUS[status] || PO_STATUS.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.2rem 0.6rem', borderRadius: '6px',
      fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const EditIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>;
const ChevronIcon = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
    <path d="M9 18l6-6-6-6"/>
  </svg>
);

// ══════════════════════════════════════════════════════════════════════════════
// PO FORM MODAL
// ══════════════════════════════════════════════════════════════════════════════
function POFormModal({ po, vendors, materials, onClose, onSave }) {
  const [form, setForm] = useState({
    vendorId: '', vendorName: '', expectedDate: '', notes: '', status: 'pending', items: [],
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (po) {
      setForm({
        vendorId:     po.vendorId || '',
        vendorName:   po.vendorName || '',
        expectedDate: po.expectedDate ? po.expectedDate.substring(0, 10) : '',
        notes:        po.notes || '',
        status:       po.status || 'draft',
        items:        po.items ? po.items.map(i => ({ ...i })) : [],
      });
    } else {
      setForm({ vendorId: '', vendorName: '', expectedDate: '', notes: '', status: 'pending', items: [] });
      setErrors({});
    }
  }, [po]);

  const selectVendor = (vendorId) => {
    const vendor = vendors.find(v => v.id === vendorId);
    setForm(p => ({ ...p, vendorId, vendorName: vendor?.name || '', items: [] }));
    setErrors(p => ({ ...p, items: null }));
  };

  const addItem = () => setForm(p => ({
    ...p,
    items: [...p.items, { materialId: '', materialName: '', sku: '', uom: 'pcs', qty: '', unitCost: '', receivedQty: 0 }],
  }));

  const removeItem = (idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const updateItem = (idx, field, value) => setForm(p => {
    const items = [...p.items];
    if (field === 'materialId') {
      const mat = materials.find(m => m.id === value);
      items[idx] = {
        ...items[idx],
        materialId:   value,
        materialName: mat?.name || '',
        sku:          mat?.sku  || '',
        uom:          mat?.uom  || 'pcs',
        unitCost:     mat?.baseCost != null ? String(mat.baseCost) : items[idx].unitCost,
      };
    } else {
      items[idx] = { ...items[idx], [field]: value };
    }
    return { ...p, items };
  });

  const total = form.items.reduce(
    (sum, item) => sum + ((parseFloat(item.unitCost) || 0) * (parseInt(item.qty) || 0)), 0
  );

  const validate = () => {
    const e = {};
    if (!form.vendorId)             e.vendor = 'Select a vendor.';
    if (!form.expectedDate)         e.expectedDate = 'Expected delivery date is required.';
    if (form.items.length === 0)    e.items  = 'Add at least one item.';
    else if (form.items.some(i => !i.materialId || !i.qty || parseInt(i.qty) <= 0))
                                    e.items  = 'Every line item needs a material and qty > 0.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      ...po,
      ...form,
      expectedDate: form.expectedDate ? new Date(form.expectedDate).toISOString() : null,
    });
  };

  const [showPriceHistory, setShowPriceHistory] = useState(null);
  const priceHistory = useMemo(() => {
    if (!showPriceHistory) return [];
    const stockIns = getStore(STOCK_IN_KEY) || [];
    return stockIns
      .filter(si => si.materialId === showPriceHistory.materialId)
      .sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived))
      .slice(0, 10)
      .map(si => ({
        date: si.dateReceived,
        vendorName: si.vendorName,
        unitCost: si.unitCost,
        qty: si.goodQty,
        refNo: si.referenceNo || si.siNumber || '—',
      }));
  }, [showPriceHistory]);

  const selectableMaterials = useMemo(() => {
    if (!form.vendorId) return [];
    const vendor = vendors.find(v => v.id === form.vendorId);
    if (!vendor) return [];
    const vendorItemNames = (vendor.itemsSupplied || []).map(item =>
      typeof item === 'string' ? item : item.name
    );
    if (vendorItemNames.length === 0) return [];
    const selectedIds = new Set(
      form.items
        .filter((item, idx, arr) => arr.findIndex(i => i.materialId === item.materialId) === idx)
        .map(item => item.materialId)
        .filter(id => id)
    );
    const filtered = materials.filter(m =>
      vendorItemNames.includes(m.category) &&
      (!m.hasVariants || m.parentId)
    );
    const available = filtered.filter(m => !selectedIds.has(m.id));
    const normalizeName = (n) => n.replace(/[—–\-]/g, ' ').replace(/[,]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const seen = new Map();
    available.forEach(m => {
      const key = normalizeName(m.name);
      if (!seen.has(key) || (m.sku || '').length > (seen.get(key).sku || '').length) {
        seen.set(key, m);
      }
    });
    return [...seen.values()];
  }, [materials, form.vendorId, form.items, vendors]);

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">{po ? 'Edit Purchase Order' : 'Create Purchase Order'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Vendor <span className="required">*</span></label>
                <CustomDropdown
                  value={form.vendorId}
                  onChange={(val) => { selectVendor(val); setErrors(p => ({ ...p, vendor: null })); }}
                  options={[
                    { value: '', label: 'Select vendor...' },
                    ...vendors.map(v => ({ value: v.id, label: v.name })),
                  ]}
                  placeholder="Select vendor..."
                  style={{ borderColor: errors.vendor ? 'rgba(239,68,68,0.5)' : undefined }}
                />
                {errors.vendor && <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.25rem' }}>{errors.vendor}</p>}
              </div>
              <div>
                <label className="form-label">Expected Delivery Date <span className="required">*</span></label>
                <input
                  type="date"
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                  value={form.expectedDate}
                  min={new Date().toISOString().substring(0, 10)}
                  onChange={e => { setForm(p => ({ ...p, expectedDate: e.target.value })); if (errors.expectedDate) setErrors(er => ({ ...er, expectedDate: '' })); }}
                />
                {errors.expectedDate && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.2rem', display: 'block' }}>{errors.expectedDate}</span>}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Line Items <span className="required">*</span></label>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!form.vendorId}
                  style={{
                    background: form.vendorId ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.03)',
                    border: form.vendorId ? '1px solid rgba(212,168,67,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '6px', padding: '0.3rem 0.75rem',
                    color: form.vendorId ? '#D4A843' : 'var(--gray)',
                    fontSize: '0.75rem', fontWeight: 700,
                    cursor: form.vendorId ? 'pointer' : 'not-allowed',
                    opacity: form.vendorId ? 1 : 0.5,
                  }}
                >
                  + Add Item
                </button>
              </div>

              {errors.items && (
                <p style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '0.5rem' }}>{errors.items}</p>
              )}

              {!form.vendorId ? (
                <div style={{
                  padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem',
                  background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                  border: '1px dashed rgba(255,255,255,0.1)',
                }}>
                  Select a vendor first to see available materials.
                </div>
              ) : form.items.length === 0 ? (
                <div style={{
                  padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem',
                  background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                  border: '1px dashed rgba(255,255,255,0.1)',
                }}>
                  No items added. Click "+ Add Item" to add materials from this vendor.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 130px 32px', gap: '0.5rem', padding: '0 0.25rem' }}>
                    {['Material', 'Qty', 'Unit Cost (₱)', ''].map((h, i) => (
                      <span key={i} style={{ fontSize: '0.65rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase', textAlign: i === 2 ? 'right' : i === 1 ? 'center' : 'left' }}>
                        {h}
                      </span>
                    ))}
                  </div>

                  {form.items.map((item, idx) => {
                    const currentMaterial = item.materialId ? materials.find(m => m.id === item.materialId) : null;
                    const dropdownOptions = [
                      { value: '', label: 'Select material...' },
                      ...selectableMaterials.map(m => ({ value: m.id, label: `${m.name}${m.sku ? ` (${m.sku})` : ''}` })),
                      ...(currentMaterial && !selectableMaterials.find(m => m.id === currentMaterial.id)
                        ? [{ value: currentMaterial.id, label: `${currentMaterial.name} (${currentMaterial.sku || ''})` }]
                        : []),
                    ];
                    return (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 130px 32px', gap: '0.5rem', alignItems: 'center' }}>
                        <CustomDropdown
                          value={item.materialId}
                          onChange={(val) => { updateItem(idx, 'materialId', val); setErrors(p => ({ ...p, items: null })); }}
                          options={dropdownOptions}
                          placeholder="Select material..."
                          style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem' }}
                        />
                        <IntInput
                          style={{ ...inputStyle, padding: '0.5rem', fontSize: '0.8rem', textAlign: 'center' }}
                          value={item.qty}
                          onChange={v => { updateItem(idx, 'qty', v); setErrors(p => ({ ...p, items: null })); }}
                          min={1} max={999999} placeholder="0"
                        />
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <DecInput
                            style={{ ...inputStyle, padding: '0.5rem 0.65rem', fontSize: '0.8rem', textAlign: 'right', flex: 1 }}
                            value={item.unitCost}
                            onChange={v => updateItem(idx, 'unitCost', v)}
                            placeholder="0.00"
                          />
                          {item.materialId && (
                            <button type="button" onClick={() => {
                              const mat = materials.find(m => m.id === item.materialId);
                              setShowPriceHistory({ materialId: item.materialId, materialName: mat?.name || '' });
                            }} title="View Price History" style={{
                              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px',
                              padding: '0.45rem 0.55rem', cursor: 'pointer', color: 'var(--gray)', flexShrink: 0,
                              display: 'flex', alignItems: 'center',
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            </button>
                          )}
                        </div>
                        <button type="button" onClick={() => removeItem(idx)} style={{
                          background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: '6px',
                          padding: '0.5rem', cursor: 'pointer', color: '#f87171',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', paddingRight: '40px', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>PO Total</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#D4A843', fontFamily: 'monospace' }}>
                      ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{po ? 'Save Changes' : 'Create PO'}</button>
          </div>
        </form>
      </div>

      {showPriceHistory && (
        <div className="modal-overlay" onClick={() => setShowPriceHistory(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div>
                <h2 className="modal-title">Price History</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.1rem' }}>{showPriceHistory.materialName}</p>
              </div>
              <button className="modal-close" onClick={() => setShowPriceHistory(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              {priceHistory.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>No purchase history found for this material.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--gray)', fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700 }}>Date</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700 }}>Vendor</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700 }}>Qty</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--gray)', fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700 }}>Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((ph, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '0.5rem', color: '#E5E2E1', fontSize: '0.75rem' }}>{ph.date ? new Date(ph.date).toLocaleDateString('en-PH') : '—'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', color: '#E5E2E1', fontSize: '0.75rem' }}>{ph.vendorName}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', color: '#E5E2E1', fontSize: '0.75rem' }}>{ph.qty}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: '#D4A843', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.75rem' }}>₱{ph.unitCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-actions" style={{ flexShrink: 0, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowPriceHistory(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INVOICE ENTRY MODAL (appears after Confirm Receipt)
// ══════════════════════════════════════════════════════════════════════════════
function InvoiceEntryModal({ grData, po, onClose, onFinalize, approvedDiscrepancies = [] }) {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [costs, setCosts] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    const initial = {};
    (grData.items || []).forEach(item => {
      initial[item.materialId] = String(item.unitCost || 0);
    });
    setCosts(initial);
  }, [grData]);

  const updateCost = (materialId, val) => {
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      setCosts(prev => ({ ...prev, [materialId]: val }));
    }
  };

  // Total is based on good qty only (receivedQty - damagedQty)
  // shortageQty is already excluded from receivedQty (auto-calculated in GR form)
  const totalAmount = (grData.items || []).reduce((sum, item) => {
    const goodQty = item.receivedQty - (item.damagedQty || 0);
    const cost = parseFloat(costs[item.materialId]) || 0;
    return sum + (goodQty * cost);
  }, 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!invoiceNo.trim()) { setError('Invoice/Reference Number is required.'); return; }
    onFinalize({ ...grData, invoiceNo: invoiceNo.trim(), actualCosts: costs, totalAmount });
  };

  const dispositionLabels = {
    backorder:      { label: 'Backorder',      color: 'rgb(245, 158, 11)', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
    request_credit: { label: 'Credit Claim',   color: 'rgb(245, 158, 11)', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
    accept_partial: { label: 'Accepted',       color: '#9ca3af', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)' },
    rtv:            { label: 'RTV',            color: 'rgb(245, 158, 11)', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
    write_off:      { label: 'Write Off',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)' },
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">Invoice Entry</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.1rem' }}>
              Enter invoice details to finalize receipt for {po.poNumber}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div>
              <label className="form-label">Invoice / Reference Number <span className="required">*</span></label>
              <input
                type="text"
                style={{ ...inputStyle, borderColor: error ? 'rgba(239,68,68,0.5)' : undefined }}
                value={invoiceNo}
                onChange={e => { setInvoiceNo(e.target.value); setError(''); }}
                placeholder="e.g., INV-2026-00123"
                maxLength={50}
                autoFocus
              />
              {error && <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.25rem' }}>{error}</p>}
            </div>

            <div>
              <label className="form-label">Actual Unit Cost per Item</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(grData.items || []).map(item => {
                  const damagedQty  = parseInt(item.damagedQty)  || 0;
                  const shortageQty = parseInt(item.shortageQty) || 0;
                  const goodQty     = item.receivedQty - damagedQty;
                  // shortageQty is already excluded from receivedQty (toReceive was auto-adjusted)

                  const cost = parseFloat(costs[item.materialId]) || 0;
                  const goodTotal    = goodQty    * cost;
                  const damagedTotal = damagedQty * cost;
                  const shortageTotal = shortageQty * cost;

                  // Find dispositions — match by materialId AND discrepancyType
                  const damageDisc   = (approvedDiscrepancies || []).find(d => d.materialId === item.materialId && d.discrepancyType === 'damage');
                  const shortageDisc = (approvedDiscrepancies || []).find(d => d.materialId === item.materialId && d.discrepancyType === 'shortage');

                  const damageDispConfig   = damageDisc   ? dispositionLabels[damageDisc.disposition]   : null;
                  const shortageDispConfig = shortageDisc ? dispositionLabels[shortageDisc.disposition] : null;

                  return (
                    <div key={item.materialId} style={{
                      padding: '0.75rem',
                      background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.825rem' }}>{item.materialName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span>Ordered: <strong style={{ color: '#E5E2E1' }}>{item.orderedQty || 0}</strong></span>
                          <span>·</span>
                          <span>Received: <strong style={{ color: (damagedQty + shortageQty) > 0 ? '#f59e0b' : '#22c55e' }}>{item.receivedQty}</strong></span>
                          {damagedQty > 0 && (
                            <>
                              <span>·</span>
                              <span style={{ color: '#f59e0b' }}>Damaged: <strong>{damagedQty}</strong></span>
                            </>
                          )}
                          {shortageQty > 0 && (
                            <>
                              <span>·</span>
                              <span style={{ color: '#ef4444' }}>Shortage: <strong>{shortageQty}</strong></span>
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'start' }}>
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginBottom: '0.25rem', textTransform: 'uppercase', fontWeight: 600 }}>Unit Cost</div>
                          <input
                            type="text" inputMode="decimal"
                            style={{ ...inputStyle, padding: '0.4rem 0.5rem', fontSize: '0.825rem', textAlign: 'right', width: '100px' }}
                            value={costs[item.materialId] || '0'}
                            onChange={e => updateCost(item.materialId, e.target.value)}
                            placeholder="0.00"
                          />
                        </div>

                        <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-end' }}>
                          {/* Good stock line */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <span style={{ color: 'var(--gray)' }}>Good to Stock: {goodQty} {item.uom} × ₱{cost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                            <span style={{ fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace' }}>₱{goodTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          </div>

                          {/* Damaged line — only shows if damagedQty > 0 */}
                          {damagedQty > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                              <span style={{ color: 'rgb(245, 158, 11)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(245, 158, 11)" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                Damaged: {damagedQty} {item.uom} × ₱{cost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ fontWeight: 600, color: 'rgb(245, 158, 11)', fontFamily: 'monospace' }}>₱{damagedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                {damageDispConfig && (
                                  <span style={{
                                    fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px',
                                    background: damageDispConfig.bg, color: damageDispConfig.color, border: `1px solid ${damageDispConfig.border}`,
                                  }}>
                                    {damageDispConfig.label}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}

                          {/* Shortage line — only shows if shortageQty > 0 */}
                          {shortageQty > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                              <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                Shortage: {shortageQty} {item.uom} × ₱{cost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ fontWeight: 600, color: '#ef4444', fontFamily: 'monospace' }}>₱{shortageTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                {shortageDispConfig && (
                                  <span style={{
                                    fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px',
                                    background: shortageDispConfig.bg, color: shortageDispConfig.color, border: `1px solid ${shortageDispConfig.border}`,
                                  }}>
                                    {shortageDispConfig.label}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{
              padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.06)',
              borderRadius: '8px', border: '1px solid rgba(212,168,67,0.2)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--gray)', fontWeight: 600 }}>Total Invoice Amount (Good Items Only)</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#D4A843', fontFamily: 'monospace' }}>
                ₱{totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Finalize &amp; Update Stock</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GOODS RECEIPT FORM MODAL
// ══════════════════════════════════════════════════════════════════════════════
function GRFormModal({ po, onClose, onSave }) {
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [showPendingRTV, setShowPendingRTV] = useState(false);
  const [pendingGRData, setPendingGRData] = useState(null);
  const [pendingUpdatedPO, setPendingUpdatedPO] = useState(null);
  const [pendingDiscrepancyItems, setPendingDiscrepancyItems] = useState([]);
  const [approvedDiscrepancies, setApprovedDiscrepancies] = useState([]);
  const [customReasons, setCustomReasons] = useState({});

  useEffect(() => {
    if (!po) return;
    const pending = (po.items || [])
      .map(item => ({
        ...item,
        remaining: (parseInt(item.qty) || 0) - (parseInt(item.receivedQty) || 0),
      }))
      .filter(i => i.remaining > 0)
      .map(i => ({ ...i, toReceive: String(i.remaining), damagedQty: '', shortageQty: '', returnReason: '' }));
    setItems(pending);
    setCustomReasons({});
  }, [po]);

  const updateToReceive = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const parsed = parseInt(val) || 0;
      const clamped = parsed > item.remaining ? item.remaining : parsed;
      return { ...item, toReceive: val === '' ? '' : String(clamped) };
    }));
    setError('');
  };

  const updateDamaged = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const parsed = parseInt(val) || 0;
      const physicalCount = parseInt(item.toReceive) || 0;
      const clamped = parsed > physicalCount ? physicalCount : parsed;
      return { ...item, damagedQty: val === '' ? '' : String(clamped) };
    }));
    setError('');
  };

  const updateShortage = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const parsed = parseInt(val) || 0;
      const maxShortage = parseInt(item.remaining) || 0;
      const clamped = parsed > maxShortage ? maxShortage : parsed;
      // Auto-adjust physical count: shortage means fewer arrived
      const newPhysicalCount = Math.max(0, maxShortage - clamped);
      return {
        ...item,
        shortageQty: val === '' ? '' : String(clamped),
        toReceive: String(newPhysicalCount),
      };
    }));
    setError('');
  };

  const updateReturnReason = (idx, val) => {
    setItems(prev => prev.map((item, i) => i !== idx ? item : { ...item, returnReason: val }));
  };

  const updateCustomReason = (idx, val) => {
    setCustomReasons(prev => ({ ...prev, [idx]: val.slice(0, 100) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const hasQty = items.some(i => parseInt(i.toReceive) > 0);
    if (!hasQty) { setError('Enter a received quantity for at least one item.'); return; }

    const invalidDamaged = items.find(i => (parseInt(i.damagedQty) || 0) > (parseInt(i.toReceive) || 0));
    if (invalidDamaged) { setError(`Damaged qty cannot exceed received qty for ${invalidDamaged.materialName}.`); return; }

    // Damaged items require a reason
    const damagedNoReason = items.findIndex((i, idx) => {
      const damaged = parseInt(i.damagedQty) || 0;
      if (damaged === 0) return false;
      const reason = i.returnReason;
      if (!reason) return true;
      if (reason === 'Other' && !(customReasons[idx] || '').trim()) return true;
      return false;
    });
    if (damagedNoReason !== -1) {
      const itemName = items[damagedNoReason].materialName;
      const isOther = items[damagedNoReason].returnReason === 'Other';
      if (isOther) {
        setError(`${itemName}: Please specify a reason for the damaged unit(s).`);
      } else {
        setError(`${itemName}: Please select a return reason for the damaged unit(s).`);
      }
      return;
    }

    // Build GR items — receivedQty = physical count (shortage already excluded via updateShortage)
    // shortageQty is tracked separately
    const grItems = items
      .filter(i => parseInt(i.toReceive) > 0 || parseInt(i.shortageQty) > 0)
      .map((item, idx) => ({
        materialId:         item.materialId,
        materialName:       item.materialName,
        sku:                item.sku,
        uom:                item.uom || 'pcs',
        orderedQty:         parseInt(item.qty) || 0,
        previouslyReceived: parseInt(item.receivedQty) || 0,
        receivedQty:        parseInt(item.toReceive) || 0,    // physical count (not including shortage)
        damagedQty:         parseInt(item.damagedQty) || 0,   // subset of receivedQty
        shortageQty:        parseInt(item.shortageQty) || 0,  // separate — not in stock, not in received
        returnReason:       item.returnReason === 'Other' ? (customReasons[idx] || 'Other') : (item.returnReason || ''),
        unitCost:           parseFloat(item.unitCost) || 0,
      }));

    // Update PO item received quantities (only count physical received, not shortage)
    const updatedItems = (po.items || []).map(poItem => {
      const gr = grItems.find(g => g.materialId === poItem.materialId);
      if (!gr) return poItem;
      return { ...poItem, receivedQty: (parseInt(poItem.receivedQty) || 0) + gr.receivedQty };
    });

    const allFulfilled = updatedItems.every(i => (parseInt(i.receivedQty) || 0) >= (parseInt(i.qty) || 0));
    const anyReceived  = updatedItems.some(i => (parseInt(i.receivedQty) || 0) > 0);
    const newStatus    = allFulfilled ? 'received' : anyReceived ? 'partial' : po.status;

    const grPayload  = { poId: po.id, poNumber: po.poNumber, vendorId: po.vendorId, vendorName: po.vendorName, items: grItems, notes, receivedDate: new Date().toISOString() };
    const updatedPO  = { ...po, items: updatedItems, status: newStatus };

    // Discrepancies = items with damage OR shortage
    const discrepancies = grItems.filter(i => i.damagedQty > 0 || i.shortageQty > 0);
    if (discrepancies.length > 0) {
      setPendingGRData(grPayload);
      setPendingUpdatedPO(updatedPO);
      setPendingDiscrepancyItems(discrepancies);
      setShowPendingRTV(true);
    } else {
      setPendingGRData(grPayload);
      setPendingUpdatedPO(updatedPO);
      setShowInvoice(true);
    }
  };

  const handlePendingRTVApprove = (approvedItems) => {
    setApprovedDiscrepancies(approvedItems);
    setShowPendingRTV(false);
    setShowInvoice(true);
  };

  const handleInvoiceFinalize = (finalizedData) => {
    onSave(finalizedData, pendingUpdatedPO, approvedDiscrepancies);
    setShowInvoice(false);
    setPendingGRData(null);
    setPendingUpdatedPO(null);
    setPendingDiscrepancyItems([]);
    setApprovedDiscrepancies([]);
  };

  if (!po) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '720px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">Receive Stock & Quality Check</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.1rem' }}>
              Verify quantities and report any damages or shortages.
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {error && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: '#f87171' }}>
                {error}
              </div>
            )}

            {items.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>
                All items in this PO have been fully received.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {items.map((item, idx) => {
                  const physicalCount = parseInt(item.toReceive) || 0;
                  const damaged       = parseInt(item.damagedQty) || 0;
                  const shortage      = parseInt(item.shortageQty) || 0;
                  const good          = Math.max(0, physicalCount - damaged);
                  return (
                    <div key={idx} style={{
                      padding: '1rem 1.25rem',
                      background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.95rem' }}>{item.materialName}</div>
                          {item.sku && <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{item.sku}</div>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600 }}>
                          Expected: {item.remaining} {item.uom}
                        </div>
                      </div>

                      {/* Inputs: Expected | Damaged | Shortage */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: (damaged > 0 || shortage > 0) ? '0.75rem' : '0' }}>
                        <div>
                          <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>
                            Expected Qty (from PO)
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={item.remaining}
                            style={{ ...inputStyle, padding: '0.5rem 0.75rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.04)', color: 'var(--gray)', cursor: 'not-allowed', fontWeight: 600 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.65rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>
                            Damaged / Others
                          </label>
                          <IntInput
                            style={{ ...inputStyle, padding: '0.5rem 0.75rem', fontSize: '0.85rem'}}
                            value={item.damagedQty}
                            onChange={v => updateDamaged(idx, v)}
                            min={0} max={physicalCount} placeholder="0"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.65rem', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>
                            Shortage
                          </label>
                          <IntInput
                            style={{ ...inputStyle, padding: '0.5rem 0.75rem'}}
                            value={item.shortageQty}
                            onChange={v => updateShortage(idx, v)}
                            min={0} max={item.remaining} placeholder="0"
                          />
                        </div>
                      </div>

                      {/* Return reason — only for damaged items */}
                      {damaged > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <label style={{ fontSize: '0.65rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>
                            Damage Reason <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <CustomDropdown
                            value={item.returnReason}
                            onChange={(val) => updateReturnReason(idx, val)}
                            options={RETURN_REASONS.map(r => ({ value: r, label: r }))}
                            placeholder="Select reason..."
                            style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                          />
                          {item.returnReason === 'Other' && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <input
                                type="text"
                                style={{ ...inputStyle, padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                                value={customReasons[idx] || ''}
                                onChange={e => updateCustomReason(idx, e.target.value)}
                                placeholder="Specify reason..."
                                maxLength={100}
                              />
                              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '0.2rem', textAlign: 'right' }}>
                                {(customReasons[idx] || '').length}/100
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Summary row */}
                      {(physicalCount > 0 || shortage > 0) && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {physicalCount > 0 && (
                            <>
                              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Good qty to stock:</span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: good > 0 ? '#22c55e' : '#ef4444' }}>
                                {good} {item.uom}
                              </span>
                            </>
                          )}
                          {damaged > 0 && (
                            <>
                              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>·</span>
                              <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                                {damaged} {item.uom} → {item.returnReason === 'Other' ? (customReasons[idx] || 'Other') : (item.returnReason || 'damaged')} (Damaged)
                              </span>
                            </>
                          )}
                          {shortage > 0 && (
                            <>
                              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>·</span>
                              <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                                {shortage} {item.uom} → Missing (Shortage)
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={items.length === 0}
              style={{ opacity: items.length === 0 ? 0.5 : 1, cursor: items.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              Confirm Receipt
            </button>
          </div>
        </form>
      </div>

      {showPendingRTV && pendingDiscrepancyItems.length > 0 && (
        <PendingRTVReviewModal
          grItems={pendingDiscrepancyItems}
          po={po}
          onClose={() => { setShowPendingRTV(false); setPendingGRData(null); setPendingUpdatedPO(null); setPendingDiscrepancyItems([]); }}
          onApprove={handlePendingRTVApprove}
        />
      )}

      {showInvoice && pendingGRData && (
        <InvoiceEntryModal
          grData={pendingGRData}
          po={po}
          approvedDiscrepancies={approvedDiscrepancies}
          onClose={() => { setShowInvoice(false); setPendingGRData(null); setPendingUpdatedPO(null); setPendingDiscrepancyItems([]); setApprovedDiscrepancies([]); }}
          onFinalize={handleInvoiceFinalize}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PENDING RTV REVIEW MODAL
// ══════════════════════════════════════════════════════════════════════════════
function PendingRTVReviewModal({ grItems, po, onClose, onApprove }) {
  const [dispositions, setDispositions] = useState({});

  const getOptionsForType = (type) => {
    if (type === 'shortage') {
      return [
        { value: 'request_credit', label: 'Request Credit/Refund', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', hint: 'Vendor returns money or gives credit for missing items' },
        { value: 'backorder',      label: 'Backorder Remaining',   color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', hint: 'Vendor sends missing items on next delivery' },
        { value: 'accept_partial', label: 'Accept Partial',        color: '#9ca3af', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)', hint: 'Close order as-is, accept the loss' },
      ];
    }
    return [
      { value: 'rtv',       label: 'Return to Vendor', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
      { value: 'write_off', label: 'Write Off (Loss)',  color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)' },
    ];
  };

  const allDispOptions = useMemo(() => {
    const all = new Set();
    grItems.forEach(item => {
      if (item.damagedQty > 0)  getOptionsForType('damage').forEach(o => all.add(o.value));
      if (item.shortageQty > 0) getOptionsForType('shortage').forEach(o => all.add(o.value));
    });
    const masterOrder = ['request_credit', 'backorder', 'rtv', 'write_off', 'accept_partial'];
    const masterLabels = {
      request_credit: { label: 'Request Credit/Refund', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
      backorder:      { label: 'Backorder Remaining',   color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
      rtv:            { label: 'Return to Vendor',      color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
      write_off:      { label: 'Write Off (Loss)',       color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)' },
      accept_partial: { label: 'Accept Partial',         color: '#9ca3af', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)' },
    };
    return masterOrder.filter(v => all.has(v)).map(v => ({ value: v, ...masterLabels[v] }));
  }, [grItems]);

  useEffect(() => {
    const init = {};
    grItems.forEach(item => {
      if (item.damagedQty > 0)  init[`${item.materialId}-damage`]   = 'rtv';
      if (item.shortageQty > 0) init[`${item.materialId}-shortage`] = 'request_credit';
    });
    setDispositions(init);
  }, [grItems]);

  const updateDisposition = (key, val) => {
    setDispositions(p => ({ ...p, [key]: val }));
  };

  // Build approved items list — damage and shortage are SEPARATE entries
  const approvedItems = [];
  grItems.forEach(item => {
    if (item.damagedQty > 0) {
      const dispKey = `${item.materialId}-damage`;
      const disp = dispositions[dispKey] || 'rtv';
      approvedItems.push({
        ...item,
        discrepancyType: 'damage',
        qty: item.damagedQty,
        disposition: disp,
      });
    }
    if (item.shortageQty > 0) {
      const dispKey = `${item.materialId}-shortage`;
      const disp = dispositions[dispKey] || 'request_credit';
      if (disp !== 'accept_partial') {
        approvedItems.push({
          ...item,
          discrepancyType: 'shortage',
          qty: item.shortageQty,
          disposition: disp,
        });
      }
    }
  });

  const requestCreditCount = approvedItems.filter(i => i.disposition === 'request_credit').length;
  const backorderCount     = approvedItems.filter(i => i.disposition === 'backorder').length;
  const rtvCount           = approvedItems.filter(i => i.disposition === 'rtv').length;
  const writeOffCount      = grItems.filter(i => (dispositions[`${i.materialId}-damage`] || 'rtv') === 'write_off').length;
  const acceptPartialCount = grItems.filter(i => (dispositions[`${i.materialId}-shortage`] || 'request_credit') === 'accept_partial').length;

  const handleSubmit = (e) => {
    e.preventDefault();
    onApprove(approvedItems);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">Pending Discrepancies</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.1rem' }}>
              {po.poNumber} — Review and decide disposition for each discrepancy.
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingBottom: '0.25rem' }}>
              {allDispOptions.map(opt => (
                <span key={opt.value} style={{
                  padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700,
                  background: opt.bg, color: opt.color, border: `1px solid ${opt.border}`,
                }}>
                  {opt.label}
                </span>
              ))}
            </div>

            {grItems.map((item, idx) => (
              <div key={idx} style={{
                padding: '1rem 1.25rem',
                background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.95rem' }}>{item.materialName}</div>
                    {item.sku && <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{item.sku}</div>}
                  </div>
                  {/* Show damage and shortage counts separately */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {item.damagedQty > 0 && (
                      <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                        {item.damagedQty} {item.uom} damaged
                      </span>
                    )}
                    {item.shortageQty > 0 && (
                      <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        {item.shortageQty} {item.uom} shortage
                      </span>
                    )}
                  </div>
                </div>

                {/* Damaged Section */}
                {item.damagedQty > 0 && (
                  <div style={{ padding: '0.75rem', background: 'rgba(245,158,11,0.04)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.1)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700, marginBottom: '0.5rem' }}>
                      Damaged: {item.damagedQty} {item.uom}
                      {item.returnReason && (
                        <span style={{ fontWeight: 400, color: 'rgba(245,158,11,0.7)', marginLeft: '0.5rem' }}>
                          — {item.returnReason}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {getOptionsForType('damage').map(opt => {
                        const key  = `${item.materialId}-damage`;
                        const disp = dispositions[key] || 'rtv';
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateDisposition(key, opt.value)}
                            style={{
                              padding: '0.45rem 0.85rem', borderRadius: '8px',
                              border: disp === opt.value ? `2px solid ${opt.color}` : '1px solid rgba(255,255,255,0.1)',
                              background: disp === opt.value ? opt.bg : 'rgba(255,255,255,0.02)',
                              color: disp === opt.value ? opt.color : 'var(--gray)',
                              fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
                      {(dispositions[`${item.materialId}-damage`] || 'rtv') === 'rtv'       && `→ ${item.damagedQty} ${item.uom} will be sent to RTV (Return to Vendor)`}
                      {(dispositions[`${item.materialId}-damage`] || 'rtv') === 'write_off' && `→ ${item.damagedQty} ${item.uom} will be written off as loss`}
                    </div>
                  </div>
                )}

                {/* Shortage Section — visually distinct from Damaged */}
                {item.shortageQty > 0 && (
                  <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.04)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700, marginBottom: '0.5rem' }}>
                      Shortage: {item.shortageQty} {item.uom}
                      <span style={{ fontWeight: 400, color: 'rgba(239,68,68,0.7)', marginLeft: '0.5rem' }}>
                        — items were not delivered
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {getOptionsForType('shortage').map(opt => {
                        const key  = `${item.materialId}-shortage`;
                        const disp = dispositions[key] || 'request_credit';
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateDisposition(key, opt.value)}
                            style={{
                              padding: '0.45rem 0.85rem', borderRadius: '8px',
                              border: disp === opt.value ? `2px solid ${opt.color}` : '1px solid rgba(255,255,255,0.1)',
                              background: disp === opt.value ? opt.bg : 'rgba(255,255,255,0.02)',
                              color: disp === opt.value ? opt.color : 'var(--gray)',
                              fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
                      {(dispositions[`${item.materialId}-shortage`] || 'request_credit') === 'request_credit' && `→ Vendor returns money for ${item.shortageQty} missing ${item.uom}`}
                      {(dispositions[`${item.materialId}-shortage`] || 'request_credit') === 'backorder'      && `→ Vendor to send remaining ${item.shortageQty} ${item.uom} later`}
                      {(dispositions[`${item.materialId}-shortage`] || 'request_credit') === 'accept_partial' && `→ Accept partial delivery — close order as-is, no further action`}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Footer Summary */}
            <div style={{
              padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)',
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                {requestCreditCount > 0 && `${requestCreditCount} Credit/Refund`}
                {requestCreditCount > 0 && backorderCount > 0 && ` · `}
                {backorderCount > 0 && `${backorderCount} Backorder`}
                {(requestCreditCount > 0 || backorderCount > 0) && (rtvCount > 0 || writeOffCount > 0) && ` · `}
                {rtvCount > 0 && `${rtvCount} RTV`}
                {rtvCount > 0 && writeOffCount > 0 && ` · `}
                {writeOffCount > 0 && `${writeOffCount} Write Off`}
                {(rtvCount > 0 || writeOffCount > 0 || requestCreditCount > 0 || backorderCount > 0) && acceptPartialCount > 0 && ` · `}
                {acceptPartialCount > 0 && `${acceptPartialCount} Accepted`}
                {requestCreditCount === 0 && backorderCount === 0 && rtvCount === 0 && writeOffCount === 0 && acceptPartialCount === 0 && '—'}
              </span>
            </div>
          </div>

          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Confirm &amp; Proceed</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL STOCK-IN HISTORY TAB
// ══════════════════════════════════════════════════════════════════════════════
function StockInHistoryTab({ stockIns }) {
  const [search, setSearch] = useState('');
  const [expandedSI, setExpandedSI] = useState(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return stockIns
      .filter(si => !q
        || (si.materialName || '').toLowerCase().includes(q)
        || (si.sku || '').toLowerCase().includes(q)
        || (si.vendorName || '').toLowerCase().includes(q)
        || (si.referenceNo || '').toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));
  }, [stockIns, search]);

  return (
    <div>
      <div className="inventory-toolbar" style={{ marginBottom: '1rem' }}>
        <div className="search-wrapper" style={{ maxWidth: '280px' }}>
          <span className="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input className="search-input" placeholder="Search manual entries..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'visible', background: 'var(--dark)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ ...thStyle, width: '40px' }}></th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Material</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Vendor</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Received</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Good</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Damaged</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Unit Cost</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total Paid</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Ref No</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                  {stockIns.length === 0
                    ? 'No stock-in records yet. Click "Stock-In" to receive goods.'
                    : 'No records match your search.'}
                </td>
              </tr>
            ) : filtered.map(si => {
              const isExpanded = expandedSI === si.id;
              return (
                <React.Fragment key={si.id}>
                  <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.875rem 0.5rem 0.875rem 1rem' }}>
                      <button
                        onClick={() => setExpandedSI(isExpanded ? null : si.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? '#D4A843' : 'var(--gray)', padding: 0 }}
                      >
                        <ChevronIcon open={isExpanded} />
                      </button>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#E5E2E1' }}>{new Date(si.dateReceived).toLocaleDateString('en-PH')}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{new Date(si.dateReceived).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.825rem' }}>{si.materialName}</div>
                      {si.sku && <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{si.sku}</div>}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#E5E2E1', fontSize: '0.8rem' }}>{si.vendorName || '—'}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#E5E2E1' }}>
                      {si.receivedQty} <span style={{ color: 'var(--gray)', fontWeight: 400 }}>{si.uom}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#22c55e' }}>{si.goodQty}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      {si.damagedQty > 0
                        ? <span style={{ fontWeight: 700, color: '#ef4444' }}>{si.damagedQty}</span>
                        : <span style={{ color: 'var(--gray)' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      ₱{si.unitCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>
                      ₱{si.totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--gray)', fontFamily: 'monospace' }}>
                      {si.referenceNo || '—'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: 'rgba(0,0,0,0.12)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td colSpan={10} style={{ padding: '1rem 1rem 1rem 3.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '0.75rem' }}>
                          <div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Effective Cost / Good Unit</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D4A843', fontFamily: 'monospace' }}>
                              ₱{si.effectiveUnitCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Loss from Damage</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: si.damagedQty > 0 ? '#ef4444' : 'var(--gray)', fontFamily: 'monospace' }}>
                              ₱{(si.damagedQty * si.unitCost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Stock Added</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#22c55e' }}>+{si.goodQty} {si.uom}</div>
                          </div>
                        </div>
                        {si.notes && (
                          <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--gray)', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                            <strong style={{ color: '#E5E2E1' }}>Notes: </strong>{si.notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PO DOCUMENT PREVIEW
// ══════════════════════════════════════════════════════════════════════════════
function PODocumentPreview({ poData, vendors, materials, onClose, onConfirm }) {
  const total = (poData.items || []).reduce(
    (sum, item) => sum + ((parseFloat(item.unitCost) || 0) * (parseInt(item.qty) || 0)), 0
  );
  const vendor       = vendors.find(v => v.id === poData.vendorId);
  const expectedDate = poData.expectedDate ? new Date(poData.expectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const today        = poData.createdAt ? new Date(poData.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const displayPONum = poData.poNumber || `PO-${new Date().getFullYear()}-NEW`;

  const business = {
    name:    'PERSONALIZE ME PRINTING SERVICES',
    owner:   'Jerlyn Barrameda',
    title:   'Business Owner',
    phone1:  '+63 945972 6272',
    phone2:  '+63 962436 2161',
    address: '5 Ford St., Fil.2, Batasan Hills, Quezon City',
    email:   'personalizemeprinting@gmail.com',
    logo:    '/logos/NEW logo no BG.png',
  };

  return (
    <div className="modal-overlay" style={{ overflowY: 'auto', paddingTop: '1rem', paddingBottom: '1rem' }}>
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.5in; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; overflow: visible !important; }
          body * { visibility: hidden !important; }
          #po-print-area, #po-print-area * { visibility: visible !important; }
          #po-print-area { position: absolute; left: 0; top: 0; width: 7.5in; max-width: 100%; box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .po-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div id="po-print-area" style={{ background: '#fff', color: '#1a1a1a', width: '7.5in', margin: '0 auto', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div className="po-header" style={{ background: '#1a1a1a', color: '#fff', padding: '1.2rem 1.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
              <img src={business.logo} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain', marginTop: '0.1rem' }} />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.03em', color: '#D4A843', lineHeight: 1.2 }}>{business.name}</div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.15rem' }}>
                  {poData.status === 'pending' ? 'Order Request' : (poData.status || 'Order Request').charAt(0).toUpperCase() + (poData.status || 'Order Request').slice(1)}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace', color: '#D4A843' }}>{displayPONum}</div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.15rem' }}>{today}</div>
            </div>
          </div>
          <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)', flex: 1 }}>
              <div>
                <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '0.15rem' }}>From:</div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.7rem' }}>{business.owner}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)' }}>{business.title}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '0.15rem' }}>Contact:</div>
                <div>{business.phone1}</div>
                <div>{business.phone2}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '0.15rem' }}>Address:</div>
                <div>{business.address}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.1rem' }}>{business.email}</div>
          </div>
        </div>

        <div style={{ padding: '0.8rem 1.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e5e5e5' }}>
          <div>
            <div style={{ fontSize: '0.55rem', color: '#999', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.15rem', letterSpacing: '0.05em' }}>Vendor</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1a1a1a' }}>{vendor?.name || 'General Merchandise'}</div>
            {vendor?.phone && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.1rem' }}>{vendor.phone}</div>}
            {vendor?.email && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.05rem' }}>{vendor.email}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.55rem', color: '#999', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.15rem', letterSpacing: '0.05em' }}>Expected Delivery</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1a1a' }}>{expectedDate}</div>
          </div>
        </div>

        <div style={{ padding: '0.8rem 1.8rem 1.2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1a1a1a' }}>
                <th style={{ padding: '0.45rem 0.4rem', textAlign: 'left', color: '#999', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase', width: '25px' }}>#</th>
                <th style={{ padding: '0.45rem 0.4rem', textAlign: 'left', color: '#999', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Material</th>
                <th style={{ padding: '0.45rem 0.4rem', textAlign: 'center', color: '#999', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase', width: '50px' }}>Qty</th>
                <th style={{ padding: '0.45rem 0.4rem', textAlign: 'center', color: '#999', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase', width: '50px' }}>Unit</th>
                <th style={{ padding: '0.45rem 0.4rem', textAlign: 'right', color: '#999', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase', width: '80px' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(poData.items || []).map((item, idx) => {
                const mat       = materials.find(m => m.id === item.materialId);
                const lineTotal = (parseFloat(item.unitCost) || 0) * (parseInt(item.qty) || 0);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem 0.4rem', color: '#aaa', fontSize: '0.75rem' }}>{idx + 1}</td>
                    <td style={{ padding: '0.5rem 0.4rem' }}>
                      <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: '0.8rem' }}>{mat?.name || item.materialName || '—'}</div>
                      {mat?.sku && <div style={{ fontSize: '0.65rem', color: '#aaa', fontFamily: 'monospace', marginTop: '0.05rem' }}>{mat.sku}</div>}
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', textAlign: 'center', color: '#1a1a1a', fontWeight: 600, fontSize: '0.8rem' }}>{item.qty}</td>
                    <td style={{ padding: '0.5rem 0.4rem', textAlign: 'center', color: '#888', fontSize: '0.75rem' }}>{mat?.uom || item.uom || 'pcs'}</td>
                    <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700, color: '#1a1a1a', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      ₱{lineTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '0.8rem', paddingTop: '0.6rem', borderTop: '2px solid #1a1a1a' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Grand Total</span>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#D4A843', fontFamily: 'monospace' }}>
              ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
          {poData.notes && (
            <div style={{ marginTop: '1rem', padding: '0.5rem 0.75rem', background: '#f8f8f8', borderRadius: '6px', borderLeft: '3px solid #D4A843' }}>
              <div style={{ fontSize: '0.55rem', color: '#999', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.1rem' }}>Notes</div>
              <div style={{ fontSize: '0.72rem', color: '#555', lineHeight: 1.4 }}>{poData.notes}</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '2rem', marginTop: '2rem' }}>
            <div style={{ textAlign: 'center', width: '180px' }}>
              <div style={{ borderBottom: '1px solid #ccc', height: '35px', marginBottom: '0.3rem' }}></div>
              <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>Prepared By</div>
            </div>
          </div>
        </div>

        <div className="no-print" style={{ background: '#1a1a1a', padding: '1rem 1.8rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#999', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button onClick={() => window.print()} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#E5E2E1', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print
              </button>
              <button onClick={() => onConfirm(poData)} style={{ background: '#D4A843', border: 'none', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#1a1a1a', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>Confirm &amp; Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL COMPOSER SIDE PANEL
// ══════════════════════════════════════════════════════════════════════════════
function EmailComposerPanel({ po, vendor, materials, onClose, onSent }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!po || !vendor) return;
    const total = (po.items || []).reduce((sum, item) => sum + ((parseFloat(item.unitCost) || 0) * (parseInt(item.qty) || 0)), 0);
    const itemsList = (po.items || []).map((item, idx) => {
      const mat = materials.find(m => m.id === item.materialId);
      return `${idx + 1}. ${mat?.name || item.materialName} — ${item.qty} ${item.uom} @ ₱${(parseFloat(item.unitCost) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    }).join('\n');
    const expectedDate = po.expectedDate ? new Date(po.expectedDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : 'ASAP';
    setBody(`Hi ${vendor.name},\n\nPlease see the details of our Purchase Order below:\n\nPO Number: ${po.poNumber}\nExpected Delivery: ${expectedDate}\n\nItems:\n${itemsList}\n\nGrand Total: ₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}\n\n${po.notes ? 'Notes: ' + po.notes + '\n\n' : ''}Looking forward to the delivery.\n\nThank you,\nPersonalize Me Prints`);
  }, [po, vendor, materials]);

  const handleSend = () => {
    if (!po || !vendor) return;
    setSending(true);
    const subject      = encodeURIComponent(`Purchase Order ${po.poNumber} — Personalize Me Prints`);
    const bodyEncoded  = encodeURIComponent(body);
    window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(vendor.email)}&su=${subject}&body=${bodyEncoded}`, '_blank');
    setTimeout(() => { setSending(false); if (onSent) onSent(); onClose(); }, 1500);
  };

  if (!po || !vendor) return null;
  const total = (po.items || []).reduce((sum, item) => sum + ((parseFloat(item.unitCost) || 0) * (parseInt(item.qty) || 0)), 0);

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: '480px', height: '100vh', background: '#1a1a1a', borderLeft: '1px solid var(--border)', zIndex: 9999, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)', animation: 'slideInRight 0.25s ease-out' }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#E5E2E1' }}>Send PO Email</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{po.poNumber}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.35rem', display: 'block' }}>To</label>
          <div style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#E5E2E1', fontWeight: 600 }}>{vendor.name}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--gray)', marginLeft: 'auto' }}>{vendor.email}</span>
          </div>
        </div>
        <div>
          <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.35rem', display: 'block' }}>Subject</label>
          <div style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.85rem', color: '#E5E2E1' }}>
            Purchase Order {po.poNumber} — Personalize Me Prints
          </div>
        </div>
        <div style={{ padding: '0.85rem 1rem', background: 'rgba(212,168,67,0.06)', borderRadius: '8px', border: '1px solid rgba(212,168,67,0.15)' }}>
          <div style={{ fontSize: '0.6rem', color: '#D4A843', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>PO Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {(po.items || []).map((item, idx) => {
              const mat = materials.find(m => m.id === item.materialId);
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: '#E5E2E1' }}>{mat?.name || item.materialName}</span>
                  <span style={{ color: 'var(--gray)', fontFamily: 'monospace' }}>{item.qty} {item.uom} × ₱{(parseFloat(item.unitCost) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              );
            })}
            <div style={{ borderTop: '1px solid rgba(212,168,67,0.2)', paddingTop: '0.4rem', marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#D4A843', fontWeight: 700, fontSize: '0.8rem' }}>Total</span>
              <span style={{ color: '#D4A843', fontWeight: 800, fontFamily: 'monospace' }}>₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>Message Body</span>
            <span style={{ textTransform: 'none', color: '#818cf8', fontWeight: 400 }}>Editable</span>
          </label>
          <textarea value={body} onChange={e => setBody(e.target.value)} style={{ flex: 1, minHeight: '200px', resize: 'vertical', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#E5E2E1', padding: '0.75rem', fontSize: '0.82rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none' }} />
        </div>
      </div>

      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'rgba(0,0,0,0.3)' }}>
        <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#999', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSend} disabled={sending} style={{ background: sending ? 'rgba(34,197,94,0.3)' : '#22c55e', border: 'none', borderRadius: '8px', padding: '0.6rem 1.5rem', color: sending ? '#aaa' : '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer' }}>
          {sending ? 'Opening email app...' : 'Open Email App'}
        </button>
      </div>
      <div style={{ padding: '0.5rem 1.5rem 0.75rem', fontSize: '0.65rem', color: 'var(--gray)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        Opens Gmail compose with pre-filled PO details.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS TAB
// ══════════════════════════════════════════════════════════════════════════════
function POTab({ pos, vendors, materials, onRefresh }) {
  const [search,          setSearch]          = useState('');
  const [statusFilter,    setStatusFilter]    = useState('');
  const [showForm,        setShowForm]        = useState(false);
  const [editPO,          setEditPO]          = useState(null);
  const [showGRForm,      setShowGRForm]      = useState(false);
  const [grTargetPO,      setGRTargetPO]      = useState(null);
  const [expandedPO,      setExpandedPO]      = useState(null);
  const [cancelTarget,    setCancelTarget]    = useState(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState(null);
  const [poPreviewData,   setPOPreviewData]   = useState(null);
  const [viewDocPO,       setViewDocPO]       = useState(null);
  const [emailTargetPO,   setEmailTargetPO]   = useState(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pos
      .filter(p => {
        const matchSearch = !q || p.poNumber.toLowerCase().includes(q) || (p.vendorName || '').toLowerCase().includes(q);
        const matchStatus = !statusFilter || p.status === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [pos, search, statusFilter]);

  const handlePreviewPO = (poData) => {
    if (!poData.id || !pos.find(p => p.id === poData.id)) {
      const all      = getStore(PO_KEY);
      const poNumber = genDocNumber('PO', all);
      setPOPreviewData({ ...poData, poNumber });
    } else {
      handleSavePO(poData);
      return;
    }
    setShowForm(false);
    setEditPO(null);
  };

  const handleSavePO = (po) => {
    const all = getStore(PO_KEY);
    let updated;
    if (po.id && all.find(p => p.id === po.id)) {
      updated = all.map(p => p.id === po.id ? { ...po, updatedAt: new Date().toISOString() } : p);
    } else {
      const newPO = {
        ...po,
        id:        po.id || `po-${Date.now()}`,
        poNumber:  po.poNumber || genDocNumber('PO', all),
        createdAt: po.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updated = [...all, newPO];
    }
    setStore(PO_KEY, updated);
    setShowForm(false);
    setEditPO(null);
    setPOPreviewData(null);
    onRefresh();
  };

  const handleStatusChange = (po, newStatus) => { setStatusChangeTarget({ po, newStatus }); };

  const handleStatusConfirm = () => {
    if (!statusChangeTarget) return;
    const { po, newStatus } = statusChangeTarget;
    const all = getStore(PO_KEY);
    setStore(PO_KEY, all.map(p => p.id === po.id ? { ...p, status: newStatus, updatedAt: new Date().toISOString() } : p));
    setStatusChangeTarget(null);
    onRefresh();
  };

  const handleCancelConfirm = () => {
    if (!cancelTarget) return;
    const all = getStore(PO_KEY);
    setStore(PO_KEY, all.map(p => p.id === cancelTarget.id ? { ...p, status: 'cancelled', updatedAt: new Date().toISOString() } : p));
    setCancelTarget(null);
    onRefresh();
  };

  const generateBatchId = () => {
    const d = new Date();
    const dateStr   = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
    const seq       = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${dateStr}-${timestamp}-${seq}`;
  };

  const computeStockFromBatches = (batches) => {
    if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
    return batches.reduce((sum, b) => sum + ((b.remainingQty || b.goodQty || b.qtyGood || 0)), 0);
  };

  // FIFO cost = unit cost of the OLDEST active batch (next batch to be issued)
  // This reflects the actual cost that will be used for the next stock-out
  const computeAveCostFromBatches = (batches) => {
    if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
    const oldest = [...batches]
      .filter(b => (b.remainingQty || 0) > 0)
      .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))[0];
    return oldest ? (oldest.unitCost || 0) : 0;
  };

  const handleSaveGR = (grData, updatedPO, approvedDiscrepancies = []) => {
    // 1. Persist GR record
    const grs   = getStore(GR_KEY);
    const newGR = {
      ...grData,
      id:                    `gr-${Date.now()}`,
      grNumber:              genDocNumber('GR', grs),
      invoiceNo:             grData.invoiceNo || '',
      totalAmount:           grData.totalAmount || 0,
      approvedDiscrepancies: approvedDiscrepancies || [],
      createdAt:             new Date().toISOString(),
    };
    setStore(GR_KEY, [...grs, newGR]);

    // 2. PO will be updated later with final status based on discrepancies disposition
    // (See Step 6 below)

    // 3. Update materials with batch entries
    //    goodQty = receivedQty - damagedQty  (shortageQty already excluded from receivedQty)
    const mats = getStore(MATERIALS_KEY);
    setStore(MATERIALS_KEY, mats.map(mat => {
      const rcv = grData.items.find(i => i.materialId === mat.id);
      if (!rcv || !rcv.receivedQty) return mat;

      const damaged = parseInt(rcv.damagedQty) || 0;
      const goodQty = rcv.receivedQty - damaged;
      if (goodQty <= 0) return mat;

      const unitCost = grData.actualCosts && grData.actualCosts[mat.id]
        ? parseFloat(grData.actualCosts[mat.id]) || 0
        : parseFloat(rcv.unitCost) || 0;
      if (unitCost <= 0) return mat;

      const newBatch = {
        batchId:       generateBatchId(),
        vendorId:      grData.vendorId || null,
        vendorName:    grData.vendorName || 'Unknown Vendor',
        poNumber:      grData.poNumber || '',
        grNumber:      newGR.grNumber || '',
        invoiceNumber: grData.invoiceNo || '',
        dateReceived:  grData.receivedDate || new Date().toISOString(),
        qtyReceived:   rcv.receivedQty,
        qtyGood:       goodQty,
        qtyDamaged:    damaged,
        remainingQty:  goodQty,
        unitCost,
        totalCost:     goodQty * unitCost,
        movements: [{
          type: 'received', qty: goodQty, remainingAfter: goodQty,
          reason: `Goods Receipt ${newGR.grNumber} from PO ${grData.poNumber}`,
          date: new Date().toISOString(),
        }],
        status: 'active',
      };

      const existingBatches = mat.batches || [];
      const updatedBatches  = [...existingBatches, newBatch];
      const newStock        = computeStockFromBatches(updatedBatches);
      const newCost         = computeAveCostFromBatches(updatedBatches);

      return { ...mat, stockQty: newStock, baseCost: newCost, batches: updatedBatches, updatedAt: new Date().toISOString() };
    }));

    // 4. Process discrepancies — damage and shortage are already split into separate entries
    const rtvs      = getStore(RTV_KEY);
    const stockOuts = getStore(STOCK_OUT_KEY);
    const backorders = getStore(BACKORDER_KEY);
    const credits   = getStore(CREDIT_KEY);
    const newRTVs      = [];
    const newStockOuts = [];
    const newBackorders = [];
    const newCredits   = [];

    // Track if any shortage has backorder disposition
    let hasBackorder = false;

    (approvedDiscrepancies || []).forEach(item => {
      const qty  = item.qty || 0;
      const type = item.discrepancyType; // 'damage' or 'shortage'

      if (type === 'damage') {
        if (item.disposition === 'rtv') {
          newRTVs.push({
            id:           `rtv-${Date.now()}-${item.materialId}`,
            rtvNumber:    genDocNumber('RTV', rtvs),
            poId:         grData.poId,
            poNumber:     grData.poNumber,
            vendorId:     grData.vendorId || '',
            vendorName:   grData.vendorName,
            materialId:   item.materialId,
            materialName: item.materialName,
            sku:          item.sku || '',
            uom:          item.uom || 'pcs',
            qty,
            unitCost:     item.unitCost,
            reason:       item.returnReason || 'Damaged in Transit',
            source:       'goods_receipt',
            status:       'pending',
            createdAt:    new Date().toISOString(),
            updatedAt:    new Date().toISOString(),
          });
        } else if (item.disposition === 'write_off') {
          // Damaged items were NEVER added to stock (only goodQty was), so the stock-out log
          // reflects the loss at time of receipt — previousStock = stock AFTER goodQty was added
          const mat = mats.find(m => m.id === item.materialId);
          const currentStock = mat ? computeStockFromBatches(mat.batches || []) : 0;
          newStockOuts.push({
            id:           `so-${Date.now()}-${item.materialId}`,
            docNumber:    genDocNumber('SO', stockOuts),
            materialId:   item.materialId,
            materialName: item.materialName,
            sku:          item.sku || '',
            uom:          item.uom || 'pcs',
            issueType:    'damage',
            quantity:     qty,
            previousStock: currentStock,
            newStock:     currentStock, // already excluded from batch — no double deduction
            unitCost:     item.unitCost,
            totalLoss:    qty * item.unitCost,
            referenceNo:  grData.poNumber,
            notes:        `Write-off from ${grData.poNumber} — ${item.returnReason || 'No reason given'}`,
            dateIssued:   new Date().toISOString(),
          });
        }
      } else if (type === 'shortage') {
        // Shortage is NOT damage — it goes to backorder or credit claim
        if (item.disposition === 'backorder') {
          hasBackorder = true;
          newBackorders.push({
            id:           `bo-${Date.now()}-${item.materialId}`,
            boNumber:     genDocNumber('BO', backorders),
            poId:         grData.poId,
            poNumber:     grData.poNumber,
            vendorId:     grData.vendorId || '',
            vendorName:   grData.vendorName,
            materialId:   item.materialId,
            materialName: item.materialName,
            sku:          item.sku || '',
            uom:          item.uom || 'pcs',
            qty,
            unitCost:     item.unitCost,
            reason:       'Quantity Shortage',
            source:       'goods_receipt',
            status:       'pending',
            createdAt:    new Date().toISOString(),
            updatedAt:    new Date().toISOString(),
          });
        } else if (item.disposition === 'request_credit') {
          newCredits.push({
            id:           `cc-${Date.now()}-${item.materialId}`,
            ccNumber:     genDocNumber('CC', credits),
            poId:         grData.poId,
            poNumber:     grData.poNumber,
            vendorId:     grData.vendorId || '',
            vendorName:   grData.vendorName,
            materialId:   item.materialId,
            materialName: item.materialName,
            sku:          item.sku || '',
            uom:          item.uom || 'pcs',
            qty,
            unitCost:     item.unitCost,
            totalCredit:  qty * item.unitCost,
            reason:       'Quantity Shortage',
            source:       'goods_receipt',
            status:       'pending',
            createdAt:    new Date().toISOString(),
            updatedAt:    new Date().toISOString(),
          });
        }
        // 'accept_partial' → no action needed, PO will be marked as received
      }
    });

    // 5. Update PO status based on discrepancies disposition
    // - If ANY shortage has backorder → PO stays 'partial' (waiting for backorder)
    // - If ALL shortages are credit/accept_partial/write_off/rtv → PO becomes 'received'
    let finalPOStatus = updatedPO.status;
    if (approvedDiscrepancies && approvedDiscrepancies.length > 0) {
      const hasAnyShortage = approvedDiscrepancies.some(i => i.discrepancyType === 'shortage');
      if (hasAnyShortage) {
        // If there's at least one backorder, keep it partial
        // Otherwise, mark as received (credit/accept_partial closes the order)
        finalPOStatus = hasBackorder ? 'partial' : 'received';
      }
    }

    if (newRTVs.length > 0)       setStore(RTV_KEY,       [...rtvs,      ...newRTVs]);
    if (newStockOuts.length > 0)  setStore(STOCK_OUT_KEY, [...stockOuts, ...newStockOuts]);
    if (newBackorders.length > 0) setStore(BACKORDER_KEY, [...backorders, ...newBackorders]);
    if (newCredits.length > 0)    setStore(CREDIT_KEY,    [...credits,   ...newCredits]);

    // 6. Update PO with final status based on disposition
    const allPOs = getStore(PO_KEY);
    setStore(PO_KEY, allPOs.map(p => p.id === updatedPO.id ? { ...updatedPO, status: finalPOStatus, updatedAt: new Date().toISOString() } : p));

    setShowGRForm(false);
    setGRTargetPO(null);
    onRefresh();
  };

  const computeTotal = (po) =>
    (po.items || []).reduce((s, i) => s + ((parseFloat(i.unitCost) || 0) * (parseInt(i.qty) || 0)), 0);

  return (
    <div>
      {/* Toolbar */}
      <div className="inventory-toolbar" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrapper" style={{ maxWidth: '280px' }}>
            <span className="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
            <input className="search-input" placeholder="Search materials, POs, or vendors..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
          </div>
          <CustomDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'All Status' },
              ...Object.values(
                Object.entries(PO_STATUS).reduce((acc, [k, v]) => {
                  if (!acc[v.label]) acc[v.label] = { value: k, label: v.label };
                  return acc;
                }, {})
              ),
            ]}
            placeholder="All Status"
            style={{ minWidth: '130px' }}
          />
        </div>
        <button className="btn-primary" onClick={() => { setEditPO(null); setShowForm(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Create Purchase Order
        </button>
      </div>

      {/* PO Cards */}
      {filtered.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)', background: 'var(--dark)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          {pos.length === 0
            ? 'No purchase orders yet. Click "Create Purchase Order" to get started.'
            : 'No POs match your filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map(po => {
            const total      = computeTotal(po);
            const canReceive = RECEIVE_STATUSES.includes(po.status);
            const canCancel  = !['received', 'cancelled'].includes(po.status);
            const cfg        = PO_STATUS[po.status] || PO_STATUS.pending;

            return (
              <div key={po.id} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'visible' }}>
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.95rem' }}>PO #{po.poNumber}</span>
                        <button onClick={() => setViewDocPO(po)} title="View Document" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '0.15rem 0.35rem', cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#D4A843'} onMouseLeave={e => e.currentTarget.style.color = '#aaa'}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </button>
                        {!['cancelled'].includes(po.status) && (
                          <button onClick={() => setEmailTargetPO(po)} title="Send PO to Supplier via Email" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '0.15rem 0.35rem', cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; }} onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          </button>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.5rem', borderRadius: '99px', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {cfg.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
                        <span>{po.vendorName || '—'}</span>
                        <span>{new Date(po.createdAt).toLocaleDateString('en-PH')}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>Total Amount</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#E5E2E1', fontFamily: 'monospace' }}>
                        ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {canCancel && (
                        <button onClick={() => setCancelTarget(po)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.5rem 0.85rem', cursor: 'pointer', color: '#f87171', fontSize: '0.75rem', fontWeight: 700 }}>
                          Cancel
                        </button>
                      )}
                      {canReceive && (
                        <button onClick={() => { setGRTargetPO(po); setShowGRForm(true); }} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', color: '#22c55e', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          Receive Stock
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Summary — shows damage and shortage separately */}
                {(po.items || []).length > 0 && (
                  <div style={{ padding: '0 1.5rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.5rem', paddingTop: '0.75rem' }}>
                      Items Summary
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {(po.items || []).map((item, idx) => {
                        const received = parseInt(item.receivedQty) || 0;
                        const ordered  = parseInt(item.qty) || 0;
                        const hasReceived = received > 0;

                        // Pull damage and shortage from GR records separately
                        const grs     = getStore(GR_KEY);
                        const grItems = grs.filter(g => g.poId === po.id).flatMap(g => g.items || []);
                        const grItem  = grItems.find(g => g.materialId === item.materialId);
                        const damaged  = grItem ? (parseInt(grItem.damagedQty)  || 0) : 0;
                        const shortage = grItem ? (parseInt(grItem.shortageQty) || 0) : 0;
                        const reason   = grItem?.returnReason || '';

                        // Calculate display values:
                        // - receivedDisplay: Cap at ordered qty (can't receive more than ordered)
                        // - outstandingShortage: Only show when partially received
                        const receivedDisplay = Math.min(received, ordered);
                        const outstandingShortage = hasReceived ? Math.max(0, ordered - receivedDisplay) : 0;

                        return (
                          <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.78rem' }}>
                            <span style={{ fontWeight: 700, color: '#E5E2E1' }}>{ordered} {item.uom}</span>
                            <span style={{ color: 'var(--gray)' }}>{item.materialName}</span>
                            {hasReceived && (
                              <span style={{ fontWeight: 700, color: '#22c55e' }}>Received: {receivedDisplay}</span>
                            )}
                            {/* Damage shown separately - always show if there was damage */}
                            {damaged > 0 && (
                              <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                                {reason ? reason : 'Damaged'}: {damaged}
                              </span>
                            )}
                            {/* Only show shortage if not yet fully received */}
                            {outstandingShortage > 0 && (
                              <span style={{ fontWeight: 700, color: '#ef4444' }}>
                                Shortage: {outstandingShortage}
                              </span>
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

      {/* Modals */}
      {showForm && (
        <POFormModal
          po={editPO} vendors={vendors} materials={materials}
          onClose={() => { setShowForm(false); setEditPO(null); }}
          onSave={handlePreviewPO}
        />
      )}
      {poPreviewData && (
        <PODocumentPreview
          poData={poPreviewData} vendors={vendors} materials={materials}
          onClose={() => setPOPreviewData(null)}
          onConfirm={handleSavePO}
        />
      )}
      {viewDocPO && (
        <PODocumentPreview
          poData={viewDocPO} vendors={vendors} materials={materials}
          onClose={() => setViewDocPO(null)}
          onConfirm={handleSavePO}
        />
      )}
      {showGRForm && grTargetPO && (
        <GRFormModal
          po={grTargetPO}
          onClose={() => { setShowGRForm(false); setGRTargetPO(null); }}
          onSave={handleSaveGR}
        />
      )}

      {cancelTarget && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Cancel Purchase Order</h2>
              <button className="modal-close" onClick={() => setCancelTarget(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <p style={{ fontSize: '0.875rem', color: '#E5E2E1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                Are you sure you want to cancel <strong style={{ fontFamily: 'monospace' }}>{cancelTarget.poNumber}</strong>?
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                Vendor: {cancelTarget.vendorName}<br/>
                Total: <strong style={{ color: '#D4A843', fontFamily: 'monospace' }}>₱{(cancelTarget.items || []).reduce((s, i) => s + ((parseFloat(i.unitCost) || 0) * (parseInt(i.qty) || 0)), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
              </p>
              <div style={{ marginTop: '1rem', padding: '0.6rem 0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600 }}>This action cannot be undone.</span>
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setCancelTarget(null)}>Keep PO</button>
              <button type="button" className="btn-danger" onClick={handleCancelConfirm}>Yes, Cancel PO</button>
            </div>
          </div>
        </div>
      )}

      {statusChangeTarget && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Update PO Status</h2>
              <button className="modal-close" onClick={() => setStatusChangeTarget(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <p style={{ fontSize: '0.875rem', color: '#E5E2E1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                Change <strong style={{ fontFamily: 'monospace' }}>{statusChangeTarget.po.poNumber}</strong> status to:
              </p>
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center', marginBottom: '1rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: PO_STATUS[statusChangeTarget.newStatus]?.color || '#E5E2E1' }}>
                  {PO_STATUS[statusChangeTarget.newStatus]?.label || statusChangeTarget.newStatus}
                </span>
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setStatusChangeTarget(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleStatusConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {emailTargetPO && (
        <EmailComposerPanel
          po={emailTargetPO}
          vendor={vendors.find(v => v.id === emailTargetPO.vendorId)}
          materials={materials}
          onClose={() => setEmailTargetPO(null)}
          onSent={onRefresh}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GOODS RECEIPT HISTORY TAB
// ══════════════════════════════════════════════════════════════════════════════
function GRHistoryTab({ grs }) {
  const [search,     setSearch]     = useState('');
  const [expandedGR, setExpandedGR] = useState(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return grs
      .filter(g => !q
        || g.grNumber.toLowerCase().includes(q)
        || g.poNumber.toLowerCase().includes(q)
        || (g.vendorName || '').toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [grs, search]);

  return (
    <div>
      <div className="inventory-toolbar" style={{ marginBottom: '1rem' }}>
        <div className="search-wrapper" style={{ maxWidth: '280px' }}>
          <span className="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input className="search-input" placeholder="Search receipts..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'visible', background: 'var(--dark)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ ...thStyle, width: '40px' }}></th>
              <th style={thStyle}>Invoice Number</th>
              <th style={thStyle}>PO Reference</th>
              <th style={{ ...thStyle, textAlign: 'center'}}>Supplier Name</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Items</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Total Received</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                  {grs.length === 0
                    ? 'No goods receipts yet. Receive goods from a Purchase Order.'
                    : 'No receipts match your search.'}
                </td>
              </tr>
            ) : filtered.map(gr => {
              const isExpanded    = expandedGR === gr.id;
              const totalReceived = (gr.items || []).reduce((s, i) => s + (parseInt(i.receivedQty) || 0), 0);

              return (
                <React.Fragment key={gr.id}>
                  <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.875rem 0.5rem 0.875rem 1rem' }}>
                      <button onClick={() => setExpandedGR(isExpanded ? null : gr.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? '#D4A843' : 'var(--gray)', padding: 0 }}>
                        <ChevronIcon open={isExpanded} />
                      </button>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: 'rgb(212, 168, 67)', fontFamily: 'monospace' }}>
                        {gr.invoiceNo || <span style={{ color: 'var(--gray)', fontStyle: 'italic' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.8rem' }}>{gr.poNumber}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#E5E2E1' }}>{gr.vendorName}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#E5E2E1' }}>{(gr.items || []).length}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#22c55e' }}>{totalReceived} pcs</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#E5E2E1', fontSize: '0.8rem' }}>
                      {gr.receivedDate ? new Date(gr.receivedDate).toLocaleDateString('en-PH') : '—'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: 'rgba(0,0,0,0.12)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td colSpan={7} style={{ padding: '0 1rem 1rem 3.5rem' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', paddingTop: '0.75rem' }}>
                          Received Items
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {(gr.items || []).map((item, idx) => {
                            const damaged  = parseInt(item.damagedQty)  || 0;
                            const shortage = parseInt(item.shortageQty) || 0;
                            return (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'rgba(34,197,94,0.04)', borderRadius: '6px', border: '1px solid rgba(34,197,94,0.1)', fontSize: '0.8rem' }}>
                                <div>
                                  <span style={{ color: '#E5E2E1', fontWeight: 600 }}>{item.materialName}</span>
                                  {item.sku && <span style={{ color: 'var(--gray)', fontFamily: 'monospace', fontSize: '0.65rem', marginLeft: '0.5rem' }}>{item.sku}</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <span style={{ color: '#22c55e', fontWeight: 700 }}>+{item.receivedQty} {item.uom} received</span>
                                  {/* Damage and shortage inline */}
                                  {damaged > 0 && (
                                    <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.75rem' }}>
                                      {damaged} damaged
                                    </span>
                                  )}
                                  {shortage > 0 && (
                                    <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.75rem' }}>
                                      {shortage} shortage
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {gr.notes && (
                          <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--gray)', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                            <strong style={{ color: '#E5E2E1' }}>Notes: </strong>{gr.notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function PurchasingPage() {
  const [activeTab,   setActiveTab]   = useState('po');
  const [pos,         setPOs]         = useState([]);
  const [grs,         setGRs]         = useState([]);
  const [stockIns,    setStockIns]    = useState([]);
  const [vendors,     setVendors]     = useState([]);
  const [materials,   setMaterials]   = useState([]);
  const [showStockIn, setShowStockIn] = useState(false);

  const refresh = useCallback(() => {
    setPOs(getStore(PO_KEY));
    setGRs(getStore(GR_KEY));
    setStockIns(getStore(STOCK_IN_KEY));
    setVendors(getStore(VENDORS_KEY));
    setMaterials(getStore(MATERIALS_KEY));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh when data changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = () => {
      refresh();
    };
    
    // Listen for storage events (other tabs)
    window.addEventListener('storage', handleStorageChange);
    
    // Listen for custom events (same tab changes from Returns page)
    const handleCustomRefresh = () => {
      refresh();
    };
    window.addEventListener('inventoryRefresh', handleCustomRefresh);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('inventoryRefresh', handleCustomRefresh);
    };
  }, [refresh]);

  const totalPOs     = pos.length;
  const openPOs      = pos.filter(p => OPEN_STATUSES.includes(p.status)).length;
  const receivedPOs  = pos.filter(p => p.status === 'received').length;
  const totalPOValue = pos
    .filter(p => p.status !== 'cancelled')
    .reduce((sum, po) => sum + (po.items || []).reduce((s, i) => s + ((parseFloat(i.unitCost) || 0) * (parseInt(i.qty) || 0)), 0), 0);
  
  // Calculate Total Goods Stock from stockIns (good quantity only)
  const totalGoodsStock = stockIns.reduce((sum, si) => sum + (parseInt(si.goodQty) || 0), 0);
  
  const totalStockIn      = stockIns.length;
  const totalStockInValue = stockIns.reduce((s, si) => s + si.totalPaid, 0);

  const generateBatchId = () => {
    const d       = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
    const seq     = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${dateStr}-${timestamp}-${seq}`;
  };

  const computeStockFromBatches = (batches) => {
    if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
    return batches.reduce((sum, b) => sum + ((b.remainingQty || b.goodQty || b.qtyGood || 0)), 0);
  };

  // FIFO cost = unit cost of the OLDEST active batch (next batch to be issued)
  // This reflects the actual cost that will be used for the next stock-out
  const computeAveCostFromBatches = (batches) => {
    if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
    const oldest = [...batches]
      .filter(b => (b.remainingQty || 0) > 0)
      .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))[0];
    return oldest ? (oldest.unitCost || 0) : 0;
  };

  const handleStockIn = (siEntries, disposition = 'write_off') => {
    const entries = Array.isArray(siEntries) ? siEntries : [siEntries];

    entries.forEach(siData => {
      const mats = getStore(MATERIALS_KEY);
      const mat  = mats.find(m => m.id === siData.materialId);
      if (!mat) return;

      // ALWAYS exclude damaged from stock — goods received ≠ goods stocked
      const damaged  = siData.damagedQty || 0;
      const goodQty  = siData.receivedQty - damaged;
      const unitCost = siData.unitCost || 0;

      if (goodQty <= 0 || unitCost <= 0) {
        const log = getStore(STOCK_IN_KEY);
        setStore(STOCK_IN_KEY, [...log, { ...siData, id: `si-${Date.now()}-${siData.materialId}`, siNumber: genDocNumber('SI', log), disposition, createdAt: new Date().toISOString() }]);
        return;
      }

      const newBatch = {
        batchId:       generateBatchId(),
        vendorId:      siData.vendorId || null,
        vendorName:    siData.vendorName || 'Unknown Vendor',
        poNumber:      '',
        grNumber:      '',
        invoiceNumber: siData.referenceNo || '',
        dateReceived:  siData.dateReceived || new Date().toISOString(),
        qtyReceived:   siData.receivedQty,
        qtyGood:       goodQty,
        qtyDamaged:    damaged,
        remainingQty:  goodQty,
        unitCost,
        totalCost:     goodQty * unitCost,
        movements: [{
          type: 'received', qty: goodQty, remainingAfter: goodQty,
          reason: `Manual Stock-In ${siData.referenceNo || ''}`,
          date: new Date().toISOString(),
        }],
        status: 'active',
      };

      const existingBatches = mat.batches || [];
      const updatedBatches  = [...existingBatches, newBatch];
      const newStock        = computeStockFromBatches(updatedBatches);
      const newCost         = computeAveCostFromBatches(updatedBatches);

      const updatedMats = mats.map(m => {
        if (m.id !== siData.materialId) return m;
        return { ...m, stockQty: newStock, baseCost: newCost, batches: updatedBatches, updatedAt: new Date().toISOString() };
      });
      setStore(MATERIALS_KEY, updatedMats);

      const log = getStore(STOCK_IN_KEY);
      setStore(STOCK_IN_KEY, [...log, { ...siData, id: `si-${Date.now()}-${siData.materialId}`, siNumber: genDocNumber('SI', log), disposition, createdAt: new Date().toISOString() }]);

      // Damaged items: log as stock-out (they were physically received but unusable)
      if (damaged > 0) {
        const stockOuts = getStore(STOCK_OUT_KEY);
        const issueType = disposition === 'rtv' ? 'return' : 'damage';
        setStore(STOCK_OUT_KEY, [...stockOuts, {
          id:            `so-${Date.now()}-${siData.materialId}`,
          docNumber:     genDocNumber('SO', stockOuts),
          materialId:    siData.materialId,
          materialName:  siData.materialName,
          sku:           siData.sku || '',
          uom:           siData.uom || 'pcs',
          issueType:     issueType,
          quantity:      damaged,
          previousStock: newStock,
          newStock:      newStock, // already excluded from batch — no double deduction
          unitCost:      siData.unitCost,
          totalLoss:     damaged * siData.unitCost,
          referenceNo:   siData.referenceNo || 'Manual Stock-In',
          notes:         disposition === 'rtv'
            ? `Damaged items sent to RTV (${siData.returnReason || 'Damaged'})`
            : `Damaged upon arrival — written off`,
          dateIssued:    new Date().toISOString(),
        }]);

        // If RTV, also create RTV record
        if (disposition === 'rtv') {
          const rtvs = getStore(RTV_KEY);
          setStore(RTV_KEY, [...rtvs, {
            id:           `rtv-${Date.now()}-${siData.materialId}`,
            rtvNumber:    genDocNumber('RTV', rtvs),
            poId:         '',
            poNumber:     siData.referenceNo || 'Manual Stock-In',
            vendorId:     siData.vendorId || '',
            vendorName:   siData.vendorName,
            materialId:   siData.materialId,
            materialName: siData.materialName,
            sku:          siData.sku || '',
            uom:          siData.uom || 'pcs',
            qty:          damaged,
            unitCost:     siData.unitCost,
            reason:       siData.returnReason || 'Damaged',
            source:       'stock_in',
            status:       'pending',
            createdAt:    new Date().toISOString(),
            updatedAt:    new Date().toISOString(),
          }]);
        }
      }
    });

    setShowStockIn(false);
    refresh();
  };

  const tabStyle = (tab) => ({
    padding: '0.625rem 1.25rem', fontSize: '0.825rem', fontWeight: 700,
    cursor: 'pointer', borderRadius: '8px', border: 'none',
    background: activeTab === tab ? 'var(--gold)' : 'transparent',
    color:      activeTab === tab ? '#000' : 'var(--gray)',
    transition: 'all 0.15s',
  });

  return (
    <div className="page-content-wrapper">
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Procurement and Sourcing</h1>
            <p className="page-subtitle">Track purchase orders, incoming stock, and direct purchases.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '0.25rem', width: 'fit-content' }}>
          <button style={tabStyle('po')} onClick={() => setActiveTab('po')}>Purchase Orders</button>
          <button style={tabStyle('gr')} onClick={() => setActiveTab('gr')}>Goods Receipts</button>
          <button style={tabStyle('si')} onClick={() => setActiveTab('si')}>Manual Stock-In</button>
        </div>
      </div>

      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="summary-content">
            <span className="summary-value">{totalPOs}</span>
            <span className="summary-label">Total POs</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="summary-content">
            <span className="summary-value">{totalGoodsStock}</span>
            <span className="summary-label">Total Goods Stock</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ fontSize: '1rem' }}>
              ₱{totalPOValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="summary-label">Total PO Value</span>
          </div>
        </div>
        {activeTab === 'si' && (
          <>
            <div className="summary-card" style={{ background: 'rgba(129,140,248,0.08)', borderColor: 'rgba(129,140,248,0.3)' }}>
              <div className="summary-content">
                <span className="summary-value" style={{ color: '#818cf8' }}>{totalStockIn}</span>
                <span className="summary-label" style={{ color: '#818cf8' }}>Manual Entries</span>
              </div>
            </div>
            <div className="summary-card" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
              <div className="summary-content">
                <span className="summary-value" style={{ color: '#22c55e', fontSize: '1rem' }}>
                  ₱{totalStockInValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="summary-label" style={{ color: '#22c55e' }}>Manual Entry Value</span>
              </div>
            </div>
          </>
        )}
      </div>

      {activeTab === 'po' && <POTab pos={pos} vendors={vendors} materials={materials} onRefresh={refresh} />}
      {activeTab === 'gr' && <GRHistoryTab grs={grs} />}
      {activeTab === 'si' && (
        <div>
          <div className="inventory-toolbar" style={{ marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}></div>
            <button className="btn-primary" onClick={() => setShowStockIn(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Add Manual Entry
            </button>
          </div>
          <StockInHistoryTab stockIns={stockIns} />
        </div>
      )}

      {showStockIn && (
        <ManualStockInModal
          materials={materials} vendors={vendors}
          onClose={() => setShowStockIn(false)}
          onSave={handleStockIn}
        />
      )}
    </div>
  );
}