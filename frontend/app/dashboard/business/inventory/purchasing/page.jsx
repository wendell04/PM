'use client';

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
// Reads current list length to compute sequence; not globally unique but
// sufficient for single-tenant localStorage. Replace with server-side seq in prod.
function genDocNumber(prefix, list) {
  const year = new Date().getFullYear();
  const seq  = String((list.length || 0) + 1).padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
}

// ── PO Status Config ───────────────────────────────────────────────────────────
const PO_STATUS = {
  pending:   { label: 'Pending',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.2)' },
  draft:     { label: 'Pending',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.2)' },
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
  'Quantity Shortage',
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
          if (v === '') {
            onChange(v);
            return;
          }
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
      // Reset form for new PO
      setForm({
        vendorId: '', vendorName: '', expectedDate: '', notes: '', status: 'pending', items: [],
      });
      setErrors({});
    }
  }, [po]);

  const selectVendor = (vendorId) => {
    const vendor = vendors.find(v => v.id === vendorId);
    setForm(p => ({
      ...p,
      vendorId,
      vendorName: vendor?.name || '',
      // Clear all items when vendor changes — materials are vendor-specific
      items: [],
    }));
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

  const [showPriceHistory, setShowPriceHistory] = useState(null); // { materialId, materialName }
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
    // Extract item names — handle both old string format and new {name, uom} format
    const vendorItemNames = (vendor.itemsSupplied || []).map(item =>
      typeof item === 'string' ? item : item.name
    );
    if (vendorItemNames.length === 0) return [];
    const filtered = materials.filter(m =>
      vendorItemNames.includes(m.category) &&
      (!m.hasVariants || m.parentId) // standalone OR variant children, not parents
    );
    // Deduplicate by normalized name — keep the one with the longest/newest SKU
    const normalizeName = (n) => n.replace(/[—–\-]/g, ' ').replace(/[,]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const seen = new Map();
    filtered.forEach(m => {
      const key = normalizeName(m.name);
      if (!seen.has(key) || (m.sku || '').length > (seen.get(key).sku || '').length) {
        seen.set(key, m);
      }
    });
    return [...seen.values()];
  }, [materials, form.vendorId, vendors]);

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

            {/* Vendor + Date */}
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

            {/* Line Items */}
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
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 0.5rem', opacity: 0.4 }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
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
                  {/* Column Headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 130px 32px', gap: '0.5rem', padding: '0 0.25rem' }}>
                    {['Material', 'Qty', 'Unit Cost (₱)', ''].map((h, i) => (
                      <span key={i} style={{ fontSize: '0.65rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase', textAlign: i === 2 ? 'right' : i === 1 ? 'center' : 'left' }}>
                        {h}
                      </span>
                    ))}
                  </div>

                  {form.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 130px 32px', gap: '0.5rem', alignItems: 'center' }}>
                      <CustomDropdown
                        value={item.materialId}
                        onChange={(val) => { updateItem(idx, 'materialId', val); setErrors(p => ({ ...p, items: null })); }}
                        options={[
                          { value: '', label: 'Select material...' },
                          ...selectableMaterials.map(m => ({ value: m.id, label: `${m.name}${m.sku ? ` (${m.sku})` : ''}` })),
                        ]}
                        placeholder="Select material..."
                        style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem' }}
                      />

                      <IntInput
                        style={{ ...inputStyle, padding: '0.5rem', fontSize: '0.8rem', textAlign: 'center' }}
                        value={item.qty}
                        onChange={v => { updateItem(idx, 'qty', v); setErrors(p => ({ ...p, items: null })); }}
                        min={1}
                        max={999999}
                        placeholder="0"
                      />

                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        <DecInput
                          style={{ ...inputStyle, padding: '0.5rem 0.65rem', fontSize: '0.8rem', textAlign: 'right', flex: 1 }}
                          value={item.unitCost}
                          onChange={v => updateItem(idx, 'unitCost', v)}
                          placeholder="0.00"
                          max={9999999.99}
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
                  ))}

                  {/* Total row */}
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

      {/* Price History Modal */}
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
function InvoiceEntryModal({ grData, po, onClose, onFinalize }) {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [costs, setCosts] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    // Initialize costs from GR items
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

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '560px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

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

            {/* Invoice Number */}
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

            {/* Unit Costs per Item */}
            <div>
              <label className="form-label">Actual Unit Cost per Item</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(grData.items || []).map(item => {
                  const goodQty = item.receivedQty - (item.damagedQty || 0);
                  const cost = parseFloat(costs[item.materialId]) || 0;
                  const lineTotal = goodQty * cost;
                  return (
                    <div key={item.materialId} style={{
                      display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: '0.5rem',
                      alignItems: 'center', padding: '0.625rem 0.75rem',
                      background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.825rem' }}>{item.materialName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                          Good qty: {goodQty} {item.uom}
                          {item.damagedQty > 0 && (
                            <span style={{ color: '#f59e0b' }}> · {item.damagedQty} {item.returnReason || 'damaged'}</span>
                          )}
                        </div>
                      </div>
                      <input
                        type="text" inputMode="decimal"
                        style={{ ...inputStyle, padding: '0.4rem 0.5rem', fontSize: '0.825rem', textAlign: 'right' }}
                        value={costs[item.materialId] || '0'}
                        onChange={e => updateCost(item.materialId, e.target.value)}
                        placeholder="0.00"
                      />
                      <div style={{ textAlign: 'right', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        ₱{lineTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total */}
            <div style={{
              padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.06)',
              borderRadius: '8px', border: '1px solid rgba(212,168,67,0.2)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--gray)', fontWeight: 600 }}>Total Invoice Amount</span>
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
      .map(i => ({ ...i, toReceive: String(i.remaining), damagedQty: '0', returnReason: '' }));
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
      const received = parseInt(item.toReceive) || 0;
      const clamped = parsed > received ? received : parsed;
      return { ...item, damagedQty: val === '' ? '' : String(clamped) };
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

    // Validate: damaged items must have a return reason
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
      const hasDamaged = parseInt(items[damagedNoReason].damagedQty) || 0;
      const isOther = items[damagedNoReason].returnReason === 'Other';
      if (isOther) {
        setError(`${itemName}: Please specify a reason for ${hasDamaged} damaged unit(s).`);
      } else {
        setError(`${itemName}: Please select a return reason for ${hasDamaged} damaged unit(s).`);
      }
      return;
    }

    const grItems = items
      .filter(i => parseInt(i.toReceive) > 0)
      .map((item, idx) => ({
        materialId:        item.materialId,
        materialName:      item.materialName,
        sku:               item.sku,
        uom:               item.uom || 'pcs',
        orderedQty:        parseInt(item.qty) || 0,
        previouslyReceived: parseInt(item.receivedQty) || 0,
        receivedQty:       parseInt(item.toReceive) || 0,
        damagedQty:        parseInt(item.damagedQty) || 0,
        returnReason:      item.returnReason === 'Other' ? (customReasons[idx] || 'Other') : (item.returnReason || ''),
        unitCost:          parseFloat(item.unitCost) || 0,
      }));

    const updatedItems = (po.items || []).map(poItem => {
      const gr = grItems.find(g => g.materialId === poItem.materialId);
      if (!gr) return poItem;
      return { ...poItem, receivedQty: (parseInt(poItem.receivedQty) || 0) + gr.receivedQty };
    });

    const allFulfilled = updatedItems.every(i => (parseInt(i.receivedQty) || 0) >= (parseInt(i.qty) || 0));
    const anyReceived  = updatedItems.some(i => (parseInt(i.receivedQty) || 0) > 0);
    const newStatus    = allFulfilled ? 'received' : anyReceived ? 'partial' : po.status;

    const grPayload = { poId: po.id, poNumber: po.poNumber, vendorId: po.vendorId, vendorName: po.vendorName, items: grItems, notes, receivedDate: new Date().toISOString() };
    const updatedPO = { ...po, items: updatedItems, status: newStatus };

    // Check if there are discrepancies (damaged/shortage items)
    const discrepancies = grItems.filter(i => i.damagedQty > 0);
    if (discrepancies.length > 0) {
      // Show Pending RTV Review first
      setPendingGRData(grPayload);
      setPendingUpdatedPO(updatedPO);
      setPendingDiscrepancyItems(discrepancies);
      setShowPendingRTV(true);
    } else {
      // No discrepancies → go straight to Invoice
      setPendingGRData(grPayload);
      setPendingUpdatedPO(updatedPO);
      setShowInvoice(true);
    }
  };

  const handlePendingRTVApprove = (approvedItems) => {
    // approvedItems includes disposition per item
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
              Verify quantities and report any damages for Return to Vendor (RTV).
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
                  const received = parseInt(item.toReceive) || 0;
                  const damaged = parseInt(item.damagedQty) || 0;
                  const good = Math.max(0, received - damaged);
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
                          Ordered: {item.qty} {item.uom}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: damaged > 0 ? '0.75rem' : '0' }}>
                        <div>
                          <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>Quantity Received</label>
                          <IntInput
                            style={{ ...inputStyle, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                            value={item.toReceive}
                            onChange={v => updateToReceive(idx, v)}
                            min={0}
                            max={item.remaining}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.65rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>Damaged / Shortage / Others</label>
                          <IntInput
                            style={{ ...inputStyle, padding: '0.5rem 0.75rem', fontSize: '0.85rem', borderColor: damaged > 0 ? 'rgba(245,158,11,0.4)' : undefined }}
                            value={item.damagedQty}
                            onChange={v => updateDamaged(idx, v)}
                            min={0}
                            max={received}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {damaged > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <label style={{ fontSize: '0.65rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>
                            Return Reason <span style={{ color: '#ef4444' }}>*</span>
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
                                required
                              />
                              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '0.2rem', textAlign: 'right' }}>
                                {(customReasons[idx] || '').length}/100
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {received > 0 && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Good qty to stock:</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: good > 0 ? '#22c55e' : '#ef4444' }}>
                            {good} {item.uom}
                          </span>
                          {damaged > 0 && (
                            <>
                              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>·</span>
                              <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                                {damaged} {item.uom} → RTV
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

      {/* Pending RTV Review Modal (shown after Confirm Receipt, before Invoice) */}
      {showPendingRTV && pendingDiscrepancyItems.length > 0 && (
        <PendingRTVReviewModal
          grItems={pendingDiscrepancyItems}
          po={po}
          onClose={() => { setShowPendingRTV(false); setPendingGRData(null); setPendingUpdatedPO(null); setPendingDiscrepancyItems([]); }}
          onApprove={handlePendingRTVApprove}
        />
      )}

      {/* Invoice Entry Modal (shown after Confirm Receipt) */}
      {showInvoice && pendingGRData && (
        <InvoiceEntryModal
          grData={pendingGRData}
          po={po}
          onClose={() => { setShowInvoice(false); setPendingGRData(null); setPendingUpdatedPO(null); setPendingDiscrepancyItems([]); setApprovedDiscrepancies([]); }}
          onFinalize={handleInvoiceFinalize}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PENDING RTV REVIEW MODAL (Staging — damaged items from GR before formal RTV)
// ══════════════════════════════════════════════════════════════════════════════
function PendingRTVReviewModal({ grItems, po, onClose, onApprove }) {
  const [dispositions, setDispositions] = useState({});

  // Check if this discrepancy is from shortage (not returnable)
  const isShortage = (reason) => {
    return reason && (reason.toLowerCase().includes('shortage') || reason.toLowerCase().includes('partial'));
  };

  // Disposition options — different for shortage vs. damaged/defective
  const dispOptionsForItem = (reason) => {
    if (isShortage(reason)) {
      // For shortage: can't return what was never received
      return [
        { value: 'bill_adj', label: 'Bill Adjustment', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
        { value: 'backorder', label: 'Backorder Remaining', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
        { value: 'cancel', label: 'Accept Partial', color: '#9ca3af', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)' },
      ];
    }
    // For damaged/defective: return or write off
    return [
      { value: 'rtv', label: 'Return to Vendor', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
      { value: 'write_off', label: 'Write Off (Loss)', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
      { value: 'cancel', label: 'Cancel (Keep in Stock)', color: '#9ca3af', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)' },
    ];
  };

  // Get all unique disposition options across all items for the legend
  const allDispOptions = useMemo(() => {
    const all = new Set();
    grItems.forEach(item => {
      const opts = dispOptionsForItem(item.returnReason);
      opts.forEach(o => all.add(o.value));
    });
    const masterOrder = ['bill_adj', 'backorder', 'rtv', 'write_off', 'cancel'];
    const masterLabels = {
      bill_adj: { label: 'Bill Adjustment', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
      backorder: { label: 'Backorder Remaining', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
      rtv: { label: 'Return to Vendor', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
      write_off: { label: 'Write Off (Loss)', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
      cancel: { label: 'Accept / Keep', color: '#9ca3af', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)' },
    };
    return masterOrder.filter(v => all.has(v)).map(v => ({ value: v, ...masterLabels[v] }));
  }, [grItems]);

  useEffect(() => {
    const init = {};
    grItems.forEach(item => {
      // For shortage, default to bill_adj; for damaged, default to rtv
      init[item.materialId] = isShortage(item.returnReason) ? 'bill_adj' : 'rtv';
    });
    setDispositions(init);
  }, [grItems]);

  const updateDisposition = (materialId, val) => {
    setDispositions(p => ({ ...p, [materialId]: val }));
  };

  const approvedItems = grItems.filter(item => {
    const disp = dispositions[item.materialId] || (isShortage(item.returnReason) ? 'bill_adj' : 'rtv');
    return disp !== 'cancel';
  }).map(item => ({
    ...item,
    disposition: dispositions[item.materialId] || (isShortage(item.returnReason) ? 'bill_adj' : 'rtv'),
  }));

  const billAdjCount = approvedItems.filter(i => i.disposition === 'bill_adj').length;
  const backorderCount = approvedItems.filter(i => i.disposition === 'backorder').length;
  const rtyCount = approvedItems.filter(i => i.disposition === 'rtv').length;
  const writeOffCount = approvedItems.filter(i => i.disposition === 'write_off').length;
  const cancelCount = grItems.length - approvedItems.length;

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

            {/* Disposition Options Legend */}
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

            {grItems.map((item, idx) => {
              const disp = dispositions[item.materialId] || (isShortage(item.returnReason) ? 'bill_adj' : 'rtv');
              const itemOptions = dispOptionsForItem(item.returnReason);
              return (
                <div key={idx} style={{
                  padding: '1rem 1.25rem',
                  background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
                  border: `1px solid ${itemOptions.find(o => o.value === disp)?.border || 'rgba(255,255,255,0.06)'}`,
                }}>
                  {/* Material Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.95rem' }}>{item.materialName}</div>
                      {item.sku && <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{item.sku}</div>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700 }}>
                      {item.damagedQty} {item.uom} discrepancy
                    </div>
                  </div>

                  {/* Reason Display */}
                  {item.returnReason && (
                    <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginBottom: '0.75rem' }}>
                      <span style={{ textTransform: 'uppercase', fontSize: '0.6rem', fontWeight: 700, marginRight: '0.25rem' }}>Reason:</span>
                      {item.returnReason}
                    </div>
                  )}

                  {/* Disposition Selector */}
                  <div>
                    <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>
                      Disposition
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {itemOptions.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateDisposition(item.materialId, opt.value)}
                          style={{
                            padding: '0.45rem 0.85rem',
                            borderRadius: '8px',
                            border: disp === opt.value ? `2px solid ${opt.color}` : '1px solid rgba(255,255,255,0.1)',
                            background: disp === opt.value ? opt.bg : 'rgba(255,255,255,0.02)',
                            color: disp === opt.value ? opt.color : 'var(--gray)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Summary Line */}
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
                    {disp === 'bill_adj' && `→ Invoice will be adjusted — pay only for received items`}
                    {disp === 'backorder' && `→ Vendor to send remaining ${item.damagedQty} ${item.uom} later`}
                    {disp === 'rtv' && `→ ${item.damagedQty} ${item.uom} will be sent to RTV (Return to Vendor)`}
                    {disp === 'write_off' && `→ ${item.damagedQty} ${item.uom} will be written off as loss (recorded in Goods Issue)`}
                    {disp === 'cancel' && (isShortage(item.returnReason)
                      ? `→ Accept partial delivery — no further action needed`
                      : `→ ${item.damagedQty} ${item.uom} will be kept in stock (no action)`)}
                  </div>
                </div>
              );
            })}

            {/* Footer Summary */}
            <div style={{
              padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)',
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                {billAdjCount > 0 && `${billAdjCount} Bill Adj`}
                {billAdjCount > 0 && backorderCount > 0 && ` · `}
                {backorderCount > 0 && `${backorderCount} Backorder`}
                {(billAdjCount > 0 || backorderCount > 0) && (rtyCount > 0 || writeOffCount > 0) && ` · `}
                {rtyCount > 0 && `${rtyCount} RTV`}
                {rtyCount > 0 && writeOffCount > 0 && ` · `}
                {writeOffCount > 0 && `${writeOffCount} Write Off`}
                {(rtyCount > 0 || writeOffCount > 0 || billAdjCount > 0 || backorderCount > 0) && cancelCount > 0 && ` · `}
                {cancelCount > 0 && `${cancelCount} Accepted`}
                {billAdjCount === 0 && backorderCount === 0 && rtyCount === 0 && writeOffCount === 0 && cancelCount === 0 && '—'}
              </span>
            </div>
          </div>

          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">
              Confirm &amp; Proceed
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL STOCK-IN WIZARD MODAL (3 Steps)
// Step 1: Select Material(s)
// Step 2: Stock Entry (qty, damaged, unit cost)
// Step 3: Invoice Details (vendor, ref no, delivery date, notes)
// ══════════════════════════════════════════════════════════════════════════════
function ManualStockInModal({ materials, vendors, onClose, onSave }) {
  const [step, setStep] = useState(1);

  // Step 1
  const [search, setSearch] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState([]);

  // Step 2 - Stock rows per material: { materialId: [{ qty, damaged, unitCost }] }
  const [stockRowsByMaterial, setStockRowsByMaterial] = useState({});

  // Apply-all helpers
  const [applyAllCost, setApplyAllCost] = useState('');
  const [applyAllDamaged, setApplyAllDamaged] = useState('');

  // Step 3 - Invoice
  const [invoice, setInvoice] = useState({
    vendorId: '', vendorName: '',
    referenceNo: '', deliveryDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [errors, setErrors] = useState({});
  const [showPendingRTV, setShowPendingRTV] = useState(false);
  const [pendingSIEntries, setPendingSIEntries] = useState(null);
  const [approvedDisposition, setApprovedDisposition] = useState('rtv');

  // Selectable: only parent materials (not variant children)
  const selectableMaterials = useMemo(() => {
    const parents = materials.filter(m => m.hasVariants && !m.parentId);
    const standalone = materials.filter(m => !m.hasVariants && !m.parentId);
    return [...parents, ...standalone];
  }, [materials]);

  // Filtered materials for Step 1 search
  const filteredMaterials = useMemo(() => {
    if (!search.trim()) return selectableMaterials;
    const q = search.toLowerCase();
    return selectableMaterials.filter(m =>
      m.name.toLowerCase().includes(q) || (m.sku || '').toLowerCase().includes(q) || (m.category || '').toLowerCase().includes(q)
    );
  }, [search, selectableMaterials]);

  // Group by category for Step 1
  const groupedByCategory = useMemo(() => {
    const groups = {};
    filteredMaterials.forEach(m => {
      const cat = m.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = { category: cat, materials: [] };
      groups[cat].materials.push(m);
    });
    return Object.values(groups);
  }, [filteredMaterials]);

  // Generate stock rows for a material (parent + children or standalone)
  const generateMaterialRows = (material) => {
    if (!material.hasVariants) {
      // Standalone material — single row
      return [{
        materialId: material.id,
        materialName: material.name,
        sku: material.sku || '',
        uom: material.uom || 'pcs',
        isVariant: false,
        variantLabel: material.name,
        qty: '',
        damaged: '',
        unitCost: material.baseCost != null && material.baseCost > 0 ? String(material.baseCost) : '',
        minStockLevel: material.minStock || 10,
      }];
    }
    // Has variants — generate a row per child
    const children = materials.filter(m => m.parentId === material.id);
    if (children.length === 0) {
      // Parent with no children yet — single row for the parent
      return [{
        materialId: material.id,
        materialName: material.name,
        sku: material.sku || '',
        uom: material.uom || 'pcs',
        isVariant: true,
        variantLabel: material.name + ' (Parent)',
        qty: '',
        damaged: '',
        unitCost: material.baseCost != null && material.baseCost > 0 ? String(material.baseCost) : '',
        minStockLevel: material.minStock || 10,
      }];
    }
    return children.map(c => ({
      materialId: c.id,
      materialName: c.name,
      sku: c.sku || '',
      uom: c.uom || material.uom || 'pcs',
      isVariant: true,
      variantLabel: c.name.replace(new RegExp(`^${material.name}\\s*[-–]`, 'i'), ''),
      qty: '',
      damaged: '',
      unitCost: c.baseCost != null && c.baseCost > 0 ? String(c.baseCost) : (material.baseCost != null && material.baseCost > 0 ? String(material.baseCost) : ''),
      minStockLevel: c.minStock || material.minStock || 10,
    }));
  };

  // Toggle material selection
  const toggleMaterial = (material) => {
    const exists = selectedMaterials.find(m => m.id === material.id);
    if (exists) {
      setSelectedMaterials(prev => prev.filter(m => m.id !== material.id));
      setStockRowsByMaterial(prev => {
        const next = { ...prev };
        delete next[material.id];
        return next;
      });
    } else {
      setSelectedMaterials(prev => [...prev, material]);
      setStockRowsByMaterial(prev => ({
        ...prev,
        [material.id]: generateMaterialRows(material),
      }));
    }
  };

  // Update a stock row
  const updateStockRow = (materialId, rowIndex, field, value) => {
    setStockRowsByMaterial(prev => {
      const rows = [...(prev[materialId] || [])];
      rows[rowIndex] = { ...rows[rowIndex], [field]: value };
      return { ...prev, [materialId]: rows };
    });
  };

  // Apply cost/damaged to all rows
  const applyToAll = (field, value) => {
    setStockRowsByMaterial(prev => {
      const updated = {};
      Object.keys(prev).forEach(mid => {
        updated[mid] = prev[mid].map(row => {
          const qty = parseInt(row.qty) || 0;
          if (field === 'unitCost') return { ...row, unitCost: value };
          if (field === 'damaged' && value && qty > 0) {
            const num = Math.min(parseInt(value) || 0, qty);
            return { ...row, damaged: String(num) };
          }
          return row;
        });
      });
      return updated;
    });
  };

  // Computed totals
  const totalReceived = Object.values(stockRowsByMaterial).flat().reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  const totalDamaged = Object.values(stockRowsByMaterial).flat().reduce((s, r) => s + (parseInt(r.damaged) || 0), 0);
  const totalGood = totalReceived - totalDamaged;

  const totalPaid = Object.values(stockRowsByMaterial).flat().reduce((sum, r) => {
    const qty = parseInt(r.qty) || 0;
    const cost = parseFloat(r.unitCost) || 0;
    return sum + qty * cost;
  }, 0);

  // Step validation
  const step1Valid = selectedMaterials.length > 0;
  const step2Valid = () => {
    if (selectedMaterials.length === 0) return false;
    return Object.values(stockRowsByMaterial).flat().some(r => (parseInt(r.qty) || 0) > 0);
  };
  const step3Valid = () => {
    return invoice.deliveryDate && invoice.referenceNo.trim() && Object.values(stockRowsByMaterial).flat().some(r => (parseFloat(r.unitCost) || 0) > 0);
  };

  const handleSubmit = () => {
    const newErrors = {};
    if (!step1Valid) newErrors.step1 = 'Select at least one material.';
    if (!step2Valid()) newErrors.step2 = 'Enter received quantity for at least one item.';
    if (!step3Valid()) newErrors.step3 = 'Complete all required invoice fields (delivery date, reference number, and unit cost).';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    // Build stock-in entries — one per material row
    const siEntries = Object.values(stockRowsByMaterial).flat()
      .filter(r => (parseInt(r.qty) || 0) > 0)
      .map(r => {
        const received = parseInt(r.qty) || 0;
        const damaged = parseInt(r.damaged) || 0;
        const good = received - damaged;
        const unitCost = parseFloat(r.unitCost) || 0;
        return {
          materialId: r.materialId,
          materialName: r.materialName,
          sku: r.sku || '',
          uom: r.uom || 'pcs',
          vendorId: invoice.vendorId || null,
          vendorName: invoice.vendorName || 'General Merchandise',
          receivedQty: received,
          damagedQty: damaged,
          goodQty: good,
          unitCost,
          effectiveUnitCost: good > 0 ? (received * unitCost) / good : unitCost,
          totalPaid: received * unitCost,
          referenceNo: invoice.referenceNo.trim(),
          notes: invoice.notes.trim(),
          returnReason: '',
          dateReceived: invoice.deliveryDate + 'T00:00:00.000Z',
        };
      });

    // Check for any damaged items across all entries
    const hasDamaged = siEntries.some(e => e.damagedQty > 0);
    if (hasDamaged) {
      setPendingSIEntries(siEntries);
      setShowPendingRTV(true);
    } else {
      onSave(siEntries, 'cancel');
    }
  };

  const handlePendingRTVApprove = (approvedItems) => {
    if (approvedItems.length > 0) {
      setApprovedDisposition(approvedItems[0].disposition || 'rtv');
    }
    setShowPendingRTV(false);
    if (pendingSIEntries) {
      onSave(pendingSIEntries, approvedItems[0]?.disposition || 'rtv');
    }
    setPendingSIEntries(null);
  };

  // Navigation
  const goNext = () => {
    const stepErrors = {};
    if (step === 1 && !step1Valid) stepErrors.step1 = 'Select at least one material.';
    if (step === 2 && !step2Valid()) stepErrors.step2 = 'Enter received quantity for at least one item.';
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStep(s => Math.min(s + 1, 3));
  };
  const goBack = () => { setErrors({}); setStep(s => Math.max(s - 1, 1)); };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '900px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 2rem', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 className="modal-title">Manual Stock-In Entry</h2>
              {selectedMaterials.length > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#D4A843', marginTop: '0.25rem', fontWeight: 600 }}>
                  {selectedMaterials.length} material{selectedMaterials.length !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>
            <button className="modal-close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Step Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative', paddingLeft: '2rem', paddingRight: '2rem' }}>
            {[
              { num: 1, label: 'Select Materials' },
              { num: 2, label: 'Stock Entry' },
              { num: 3, label: 'Invoice' },
            ].map((s, i) => {
              const isComplete = s.num === 1 ? step1Valid : s.num === 2 ? step2Valid() : step3Valid();
              const isCurrent = step === s.num;
              const isPast = step > s.num;
              return (
                <div key={s.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', flex: 1, position: 'relative', zIndex: 2 }}>
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isComplete || isPast ? '#D4A843' : isCurrent ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.06)',
                    color: isComplete || isPast ? '#000' : isCurrent ? '#D4A843' : 'var(--gray)',
                    border: isCurrent ? '2px solid #D4A843' : 'none',
                    transition: 'all 0.3s',
                  }}>
                    {isComplete || isPast
                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{s.num}</span>
                    }
                  </div>
                  <span style={{ fontSize: '0.55rem', letterSpacing: '0.1em', fontWeight: 600, color: isComplete || isCurrent ? '#D4A843' : 'var(--gray)', textTransform: 'uppercase' }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>

          {/* STEP 1: Select Materials */}
          {step === 1 && (
            <div>
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search materials by name, SKU, or category..."
                  style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '8px', color: '#E5E2E1', fontSize: '0.85rem', outline: 'none' }} />
              </div>
              {errors.step1 && <p style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '0.75rem' }}>{errors.step1}</p>}

              {/* Material list grouped by category */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                {groupedByCategory.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>
                    {selectableMaterials.length === 0 ? 'No materials available. Add materials in Master Data first.' : `No results for "${search}"`}
                  </div>
                ) : groupedByCategory.map(group => (
                  <div key={group.category}>
                    <div style={{
                      padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)',
                      fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}>
                      {group.category} ({group.materials.length})
                    </div>
                    {group.materials.map(m => {
                      const isSelected = selectedMaterials.some(sel => sel.id === m.id);
                      return (
                        <button key={m.id} type="button"
                          onClick={() => toggleMaterial(m)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.7rem 1rem',
                            background: isSelected ? 'rgba(212,168,67,0.1)' : 'transparent',
                            border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
                            cursor: 'pointer', textAlign: 'left',
                          }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: isSelected ? '#D4A843' : '#E5E2E1', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.name}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace' }}>
                              {m.sku || '—'} {m.hasVariants && `(${materials.filter(c => c.parentId === m.id).length} variants)`}
                            </div>
                          </div>
                          {isSelected ? (
                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#D4A843', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          ) : (
                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              {selectedMaterials.length === 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.75rem', textAlign: 'center' }}>
                  Select one or more materials to receive.
                </p>
              )}
            </div>
          )}

          {/* STEP 2: Stock Entry */}
          {step === 2 && (
            <div>
              {errors.step2 && <p style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '0.75rem' }}>{errors.step2}</p>}

              {/* Apply-all controls */}
              {selectedMaterials.length > 1 && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>Apply Unit Cost to All</label>
                    <input type="text" inputMode="decimal" placeholder="e.g., 30.00" value={applyAllCost}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setApplyAllCost(val);
                      }}
                      style={{ ...inputStyle, padding: '0.45rem 0.65rem', fontSize: '0.8rem' }} />
                    <button type="button" onClick={() => { if (applyAllCost) applyToAll('unitCost', applyAllCost); }}
                      style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: '#D4A843', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      Apply to All
                    </button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>Apply Damaged to All</label>
                    <input type="text" inputMode="numeric" placeholder="e.g., 0" value={applyAllDamaged}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d+$/.test(val)) setApplyAllDamaged(val);
                      }}
                      style={{ ...inputStyle, padding: '0.45rem 0.65rem', fontSize: '0.8rem' }} />
                    <button type="button" onClick={() => { if (applyAllDamaged) applyToAll('damaged', applyAllDamaged); }}
                      style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      Apply to All
                    </button>
                  </div>
                </div>
              )}

              {/* Stock entry tables per material */}
              {selectedMaterials.map(mat => {
                const rows = stockRowsByMaterial[mat.id] || [];
                const matReceived = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
                const matDamaged = rows.reduce((s, r) => s + (parseInt(r.damaged) || 0), 0);
                const matTotal = rows.reduce((s, r) => s + (parseInt(r.qty) || 0) * (parseFloat(r.unitCost) || 0), 0);

                return (
                  <div key={mat.id} style={{ marginBottom: '1.25rem', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                    {/* Material header */}
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.08)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.9rem' }}>{mat.name}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{mat.sku || '—'} {mat.hasVariants && `• ${rows.length} variant${rows.length !== 1 ? 's' : ''}`}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>
                          ₱{matTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </div>
                        {matReceived > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{matReceived} {rows[0]?.uom || 'pcs'} received</div>}
                      </div>
                    </div>

                    {/* Rows */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Item</th>
                            <th style={{ padding: '0.5rem 0.5rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', width: '80px' }}>Qty</th>
                            <th style={{ padding: '0.5rem 0.5rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', width: '80px' }}>Damaged</th>
                            <th style={{ padding: '0.5rem 0.5rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', width: '100px' }}>Unit Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => (
                            <tr key={row.materialId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '0.5rem 0.75rem' }}>
                                <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{row.variantLabel}</div>
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                <input type="text" inputMode="numeric" value={row.qty}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d+$/.test(val)) updateStockRow(row.materialId, idx, 'qty', val);
                                  }}
                                  style={{ ...inputStyle, padding: '0.4rem', fontSize: '0.8rem', textAlign: 'center', width: '70px' }} />
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                <input type="text" inputMode="numeric" value={row.damaged}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d+$/.test(val)) updateStockRow(row.materialId, idx, 'damaged', val);
                                  }}
                                  style={{ ...inputStyle, padding: '0.4rem', fontSize: '0.8rem', textAlign: 'center', width: '70px' }} />
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                <input type="text" inputMode="decimal" value={row.unitCost}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) updateStockRow(row.materialId, idx, 'unitCost', val);
                                  }}
                                  placeholder="0.00"
                                  style={{ ...inputStyle, padding: '0.4rem', fontSize: '0.8rem', textAlign: 'center', width: '90px' }} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>Good Qty</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#22c55e' }}>{totalGood}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>Damaged</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444' }}>{totalDamaged}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>Total Value</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D4A843' }}>₱{totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Invoice Details */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {errors.step3 && <p style={{ fontSize: '0.72rem', color: '#f87171' }}>{errors.step3}</p>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">Vendor <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>(Optional)</span></label>
                  <CustomDropdown
                    value={invoice.vendorId}
                    onChange={(val) => {
                      const v = vendors.find(v => v.id === val);
                      setInvoice(p => ({ ...p, vendorId: val, vendorName: v?.name || '' }));
                    }}
                    options={[
                      { value: '', label: 'General Merchandise (Walk-in)' },
                      ...vendors.map(v => ({ value: v.id, label: v.name })),
                    ]}
                    placeholder="General Merchandise (Walk-in)"
                  />
                </div>
                <div>
                  <label className="form-label">Reference / Receipt No <span className="required">*</span></label>
                  <input type="text" style={inputStyle} value={invoice.referenceNo}
                    onChange={e => setInvoice(p => ({ ...p, referenceNo: e.target.value.slice(0, 50) }))}
                    placeholder="e.g., OR-12345, INV-ABC" maxLength={50} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">Delivery Date <span className="required">*</span></label>
                  <input type="date" style={{ ...inputStyle, colorScheme: 'dark' }} value={invoice.deliveryDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setInvoice(p => ({ ...p, deliveryDate: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={invoice.notes}
                  onChange={e => setInvoice(p => ({ ...p, notes: e.target.value.slice(0, 500) }))}
                  placeholder="Optional notes..." maxLength={500} />
              </div>

              {/* Summary preview */}
              <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Entry Summary</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--gray)' }}>Materials:</span>
                  <span style={{ color: '#E5E2E1', fontWeight: 600 }}>{selectedMaterials.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--gray)' }}>Total Received:</span>
                  <span style={{ color: '#E5E2E1', fontWeight: 600 }}>{totalReceived}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--gray)' }}>Total Value:</span>
                  <span style={{ color: '#D4A843', fontWeight: 700 }}>₱{totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-actions" style={{ flexShrink: 0 }}>
          {step > 1 && (
            <button type="button" className="btn-secondary" onClick={goBack}>Back</button>
          )}
          <div style={{ flex: 1 }}></div>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          {step < 3 ? (
            <button type="button" className="btn-primary" onClick={goNext}>Next Step</button>
          ) : (
            <button type="button" className="btn-primary" onClick={handleSubmit}>
              Confirm Stock-In
            </button>
          )}
        </div>
      </div>

      {/* Pending RTV Review */}
      {showPendingRTV && pendingSIEntries && (
        <PendingRTVReviewModal
          grItems={pendingSIEntries.map(e => ({
            materialId: e.materialId,
            materialName: e.materialName,
            sku: e.sku,
            uom: e.uom,
            damagedQty: e.damagedQty,
            returnReason: '',
            unitCost: e.unitCost,
          }))}
          po={{ poNumber: pendingSIEntries[0]?.referenceNo || 'Manual Stock-In' }}
          onClose={() => { setShowPendingRTV(false); setPendingSIEntries(null); }}
          onApprove={handlePendingRTVApprove}
        />
      )}
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
                      <div style={{ fontSize: '0.8rem', color: '#E5E2E1' }}>
                        {new Date(si.dateReceived).toLocaleDateString('en-PH')}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>
                        {new Date(si.dateReceived).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.825rem' }}>{si.materialName}</div>
                      {si.sku && <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{si.sku}</div>}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#E5E2E1', fontSize: '0.8rem' }}>
                      {si.vendorName || '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#E5E2E1' }}>
                      {si.receivedQty} <span style={{ color: 'var(--gray)', fontWeight: 400 }}>{si.uom}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#22c55e' }}>
                      {si.goodQty}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      {si.damagedQty > 0 ? (
                        <span style={{ fontWeight: 700, color: '#ef4444' }}>{si.damagedQty}</span>
                      ) : (
                        <span style={{ color: 'var(--gray)' }}>—</span>
                      )}
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
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#22c55e' }}>
                              +{si.goodQty} {si.uom}
                            </div>
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
// PO DOCUMENT PREVIEW — Printable Purchase Order (Letter Size)
// ══════════════════════════════════════════════════════════════════════════════
function PODocumentPreview({ poData, vendors, materials, onClose, onConfirm }) {
  const total = (poData.items || []).reduce(
    (sum, item) => sum + ((parseFloat(item.unitCost) || 0) * (parseInt(item.qty) || 0)), 0
  );
  const vendor = vendors.find(v => v.id === poData.vendorId);
  const expectedDate = poData.expectedDate ? new Date(poData.expectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const today = poData.createdAt ? new Date(poData.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Show the actual PO number (for new POs, it was pre-generated by handlePreviewPO)
  const displayPONum = poData.poNumber || `PO-${new Date().getFullYear()}-NEW`;

  // Business details from business card
  const business = {
    name: 'PERSONALIZE ME PRINTING SERVICES',
    owner: 'Jerlyn Barrameda',
    title: 'Business Owner',
    phone1: '+63 945972 6272',
    phone2: '+63 962436 2161',
    address: '5 Ford St., Fil.2, Batasan Hills, Quezon City',
    email: 'personalizemeprinting@gmail.com',
    logo: '/logos/NEW logo no BG.png',
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" style={{ overflowY: 'auto', paddingTop: '1rem', paddingBottom: '1rem' }}>
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.5in;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            overflow: visible !important;
          }
          body * { visibility: hidden !important; }
          #po-print-area, #po-print-area * { visibility: visible !important; }
          #po-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 7.5in;
            max-width: 100%;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          .po-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .po-logo { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div id="po-print-area" style={{
        background: '#fff', color: '#1a1a1a', width: '7.5in', margin: '0 auto',
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div className="po-header" style={{
          background: '#1a1a1a',
          color: '#fff', padding: '1.2rem 1.8rem',
        }}>
          {/* Top: Logo + Company Name + PO Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
              <img
                className="po-logo"
                src={business.logo}
                alt="Logo"
                style={{ width: '48px', height: '48px', objectFit: 'contain', marginTop: '0.1rem' }}
              />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.03em', color: '#D4A843', lineHeight: 1.2 }}>
                  {business.name}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.15rem' }}>
                  {poData.status === 'pending' ? 'Order Request' : (poData.status || 'Order Request').charAt(0).toUpperCase() + (poData.status || 'Order Request').slice(1)}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace', color: '#D4A843' }}>
                {displayPONum}
              </div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.15rem' }}>
                {today}
              </div>
            </div>
          </div>

          {/* Bottom: Owner + Contact Info */}
          <div style={{
            marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
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
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.1rem' }}>
              {business.email}
            </div>
          </div>
        </div>

        {/* Vendor + Expected Delivery */}
        <div style={{
          padding: '0.8rem 1.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: '1px solid #e5e5e5',
        }}>
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

        {/* Items Table */}
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
                const mat = materials.find(m => m.id === item.materialId);
                const lineTotal = (parseFloat(item.unitCost) || 0) * (parseInt(item.qty) || 0);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem 0.4rem', color: '#aaa', fontSize: '0.75rem' }}>{idx + 1}</td>
                    <td style={{ padding: '0.5rem 0.4rem' }}>
                      <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: '0.8rem' }}>
                        {mat?.name || item.materialName || '—'}
                      </div>
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

          {/* Grand Total */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem',
            marginTop: '0.8rem', paddingTop: '0.6rem', borderTop: '2px solid #1a1a1a',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Grand Total</span>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#D4A843', fontFamily: 'monospace' }}>
              ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Notes */}
          {poData.notes && (
            <div style={{
              marginTop: '1rem', padding: '0.5rem 0.75rem', background: '#f8f8f8',
              borderRadius: '6px', borderLeft: '3px solid #D4A843',
            }}>
              <div style={{ fontSize: '0.55rem', color: '#999', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.1rem' }}>Notes</div>
              <div style={{ fontSize: '0.72rem', color: '#555', lineHeight: 1.4 }}>{poData.notes}</div>
            </div>
          )}

          {/* Signature — Prepared By only */}
          <div style={{
            display: 'flex', justifyContent: 'flex-start', gap: '2rem', marginTop: '2rem',
          }}>
            <div style={{ textAlign: 'center', width: '180px' }}>
              <div style={{ borderBottom: '1px solid #ccc', height: '35px', marginBottom: '0.3rem' }}></div>
              <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>Prepared By</div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="no-print" style={{
          background: '#1a1a1a', padding: '1rem 1.8rem', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
        }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
            padding: '0.6rem 1.25rem', color: '#999', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button onClick={handlePrint} style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
              padding: '0.6rem 1.25rem', color: '#E5E2E1', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print
            </button>
            <button onClick={() => onConfirm(poData)} style={{
              background: '#D4A843', border: 'none', borderRadius: '8px',
              padding: '0.6rem 1.25rem', color: '#1a1a1a', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
            }}>Confirm & Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS TAB
// ══════════════════════════════════════════════════════════════════════════════
function POTab({ pos, vendors, materials, onRefresh }) {
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [editPO,       setEditPO]       = useState(null);
  const [showGRForm,   setShowGRForm]   = useState(false);
  const [grTargetPO,   setGRTargetPO]   = useState(null);
  const [expandedPO,   setExpandedPO]   = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState(null);
  const [poPreviewData, setPOPreviewData] = useState(null); // unsaved PO data for preview
  const [viewDocPO, setViewDocPO] = useState(null); // view existing PO document

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

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handlePreviewPO = (poData) => {
    // For new POs, generate the PO number upfront so it shows in preview
    if (!poData.id || !pos.find(p => p.id === poData.id)) {
      const all = getStore(PO_KEY);
      const poNumber = genDocNumber('PO', all);
      setPOPreviewData({ ...poData, poNumber });
    } else {
      // For edits, save directly
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
        poNumber:  po.poNumber || genDocNumber('PO', all), // use pre-generated if available
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

  const handleStatusChange = (po, newStatus) => {
    setStatusChangeTarget({ po, newStatus });
  };

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

  const handleSaveGR = (grData, updatedPO, approvedDiscrepancies = []) => {
    // Build a disposition map: materialId → disposition
    const dispMap = {};
    (approvedDiscrepancies || []).forEach(item => {
      dispMap[item.materialId] = item.disposition || 'rtv';
    });

    // 1. Persist GR record with invoice data
    const grs   = getStore(GR_KEY);
    const newGR = {
      ...grData,
      id: `gr-${Date.now()}`,
      grNumber: genDocNumber('GR', grs),
      invoiceNo: grData.invoiceNo || '',
      totalAmount: grData.totalAmount || 0,
      approvedDiscrepancies: approvedDiscrepancies || [],
      createdAt: new Date().toISOString(),
    };
    setStore(GR_KEY, [...grs, newGR]);

    // 2. Update PO
    const allPOs = getStore(PO_KEY);
    setStore(PO_KEY, allPOs.map(p => p.id === updatedPO.id ? { ...updatedPO, updatedAt: new Date().toISOString() } : p));

    // 3. Update material stock quantities + Moving Average Cost
    //    - disposition 'rtv' or 'write_off': damaged qty NOT added to stock
    //    - disposition 'cancel': damaged qty IS added to stock (kept)
    const mats = getStore(MATERIALS_KEY);
    setStore(MATERIALS_KEY, mats.map(mat => {
      const rcv = grData.items.find(i => i.materialId === mat.id);
      if (!rcv || !rcv.receivedQty) return mat;
      const oldStock = parseInt(mat.stockQty) || 0;
      const oldCost  = parseFloat(mat.baseCost) || 0;
      const disp = dispMap[mat.id] || 'rtv';
      // If cancelled, damaged qty stays in stock; otherwise it doesn't
      const effectiveDamaged = disp === 'cancel' ? 0 : (rcv.damagedQty || 0);
      const goodQty  = rcv.receivedQty - effectiveDamaged;
      if (goodQty <= 0) return mat;
      // Use actual cost from invoice if available, otherwise fall back to GR unit cost
      const unitCost = grData.actualCosts && grData.actualCosts[mat.id]
        ? parseFloat(grData.actualCosts[mat.id]) || oldCost
        : parseFloat(rcv.unitCost) || oldCost;
      const newStock = oldStock + goodQty;
      let newCost = oldCost;
      if (oldStock === 0) {
        newCost = unitCost;
      } else if (unitCost > 0) {
        newCost = ((oldStock * oldCost) + (goodQty * unitCost)) / newStock;
      }
      return {
        ...mat,
        stockQty:  newStock,
        baseCost:  Math.round(newCost * 100) / 100,
        updatedAt: new Date().toISOString(),
      };
    }));

    // 4. Process discrepancies based on disposition
    const rtvs = getStore(RTV_KEY);
    const stockOuts = getStore(STOCK_OUT_KEY);
    const newRTVs = [];
    const newStockOuts = [];

    (approvedDiscrepancies || []).forEach(item => {
      if (item.disposition === 'rtv') {
        // Create formal RTV record
        newRTVs.push({
          id: `rtv-${Date.now()}-${item.materialId}`,
          rtvNumber: genDocNumber('RTV', rtvs),
          poId: grData.poId,
          poNumber: grData.poNumber,
          vendorId: grData.vendorId || '',
          vendorName: grData.vendorName,
          materialId: item.materialId,
          materialName: item.materialName,
          sku: item.sku || '',
          uom: item.uom || 'pcs',
          qty: item.damagedQty,
          unitCost: item.unitCost,
          reason: item.returnReason || 'Damaged in Transit',
          source: 'goods_receipt',
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else if (item.disposition === 'write_off') {
        // Record as Goods Issue (loss)
        newStockOuts.push({
          id: `so-${Date.now()}-${item.materialId}`,
          docNumber: genDocNumber('SO', stockOuts),
          materialId: item.materialId,
          materialName: item.materialName,
          sku: item.sku || '',
          uom: item.uom || 'pcs',
          issueType: 'damage',
          quantity: item.damagedQty,
          previousStock: 0,
          newStock: 0,
          unitCost: item.unitCost,
          totalLoss: item.damagedQty * item.unitCost,
          referenceNo: grData.poNumber,
          notes: `Write-off from ${grData.poNumber} — ${item.returnReason || 'No reason given'}`,
          dateIssued: new Date().toISOString(),
        });
      }
      // disposition 'cancel' → no action needed
    });

    if (newRTVs.length > 0) {
      setStore(RTV_KEY, [...rtvs, ...newRTVs]);
    }
    if (newStockOuts.length > 0) {
      setStore(STOCK_OUT_KEY, [...stockOuts, ...newStockOuts]);
    }

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
              ...Object.entries(PO_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
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
            const total = computeTotal(po);
            const canReceive = RECEIVE_STATUSES.includes(po.status);
            const canCancel = !['received', 'cancelled'].includes(po.status);
            const cfg = PO_STATUS[po.status] || PO_STATUS.pending;

            return (
              <div key={po.id} style={{
                background: 'var(--dark)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                overflow: 'visible',
              }}>
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--gray)',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.95rem' }}>PO #{po.poNumber}</span>
                        <button onClick={() => setViewDocPO(po)} title="View Document" style={{
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '4px', padding: '0.15rem 0.35rem', cursor: 'pointer', color: '#aaa',
                          display: 'flex', alignItems: 'center', transition: 'color 0.15s',
                        }} onMouseEnter={e => e.currentTarget.style.color = '#D4A843'} onMouseLeave={e => e.currentTarget.style.color = '#aaa'}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </button>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.5rem', borderRadius: '99px',
                          fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                        }}>
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
                    {/* Action Buttons: Cancel + Receive Stock */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {canCancel && (
                        <button
                          onClick={() => setCancelTarget(po)}
                          style={{
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '8px', padding: '0.5rem 0.85rem', cursor: 'pointer',
                            color: '#f87171', fontSize: '0.75rem', fontWeight: 700,
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {canReceive && (
                        <button
                          onClick={() => { setGRTargetPO(po); setShowGRForm(true); }}
                          style={{
                            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                            borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer',
                            color: '#22c55e', fontSize: '0.8rem', fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                          }}
                        >
                          Receive Stock
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Summary */}
                {(po.items || []).length > 0 && (
                  <div style={{
                    padding: '0 1.5rem 1.25rem',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.5rem', paddingTop: '0.75rem' }}>
                      Items Summary
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {(po.items || []).map((item, idx) => {
                        const received = parseInt(item.receivedQty) || 0;
                        const ordered = parseInt(item.qty) || 0;
                        const hasReceived = received > 0;
                        // Find damaged from GR records
                        const grs = getStore(GR_KEY);
                        const grItems = grs.filter(g => g.poId === po.id).flatMap(g => g.items || []);
                        const grItem = grItems.find(g => g.materialId === item.materialId);
                        const damaged = grItem ? (parseInt(grItem.damagedQty) || 0) : 0;
                        const reason = grItem?.returnReason || '';
                        return (
                          <div key={idx} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.35rem 0.75rem', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                            fontSize: '0.78rem',
                          }}>
                            <span style={{ fontWeight: 700, color: '#E5E2E1' }}>{ordered} {item.uom}</span>
                            <span style={{ color: 'var(--gray)' }}>{item.materialName}</span>
                            {hasReceived && (
                              <>
                                <span style={{ fontWeight: 700, color: '#22c55e' }}>Received: {received}</span>
                                {damaged > 0 && (
                                  <span style={{ fontWeight: 700, color: '#ef4444' }}>{reason ? reason : 'Damaged'}: {damaged}</span>
                                )}
                              </>
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
          po={editPO}
          vendors={vendors}
          materials={materials}
          onClose={() => { setShowForm(false); setEditPO(null); }}
          onSave={handlePreviewPO}
        />
      )}
      {poPreviewData && (
        <PODocumentPreview
          poData={poPreviewData}
          vendors={vendors}
          materials={materials}
          onClose={() => setPOPreviewData(null)}
          onConfirm={handleSavePO}
        />
      )}
      {viewDocPO && (
        <PODocumentPreview
          poData={viewDocPO}
          vendors={vendors}
          materials={materials}
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

      {/* Cancel Confirmation Modal */}
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
              <div style={{
                marginTop: '1rem', padding: '0.6rem 0.75rem', background: 'rgba(239,68,68,0.06)',
                borderRadius: '6px', border: '1px solid rgba(239,68,68,0.15)',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
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

      {/* Status Change Confirmation Modal */}
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
              <div style={{
                padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                border: '1px solid var(--border)', textAlign: 'center', marginBottom: '1rem',
              }}>
                <span style={{
                  fontWeight: 700, fontSize: '0.9rem',
                  color: PO_STATUS[statusChangeTarget.newStatus]?.color || '#E5E2E1',
                }}>
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
              <th style={thStyle}>GR Number</th>
              <th style={thStyle}>PO Reference</th>
              <th style={thStyle}>Vendor</th>
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
              const isExpanded   = expandedGR === gr.id;
              const totalReceived = (gr.items || []).reduce((s, i) => s + (parseInt(i.receivedQty) || 0), 0);

              return (
                <React.Fragment key={gr.id}>
                  <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.875rem 0.5rem 0.875rem 1rem' }}>
                      <button
                        onClick={() => setExpandedGR(isExpanded ? null : gr.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? '#D4A843' : 'var(--gray)', padding: 0 }}
                      >
                        <ChevronIcon open={isExpanded} />
                      </button>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>{gr.grNumber}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {gr.poNumber}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#E5E2E1' }}>{gr.vendorName}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#E5E2E1' }}>
                      {(gr.items || []).length}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#22c55e' }}>
                      {totalReceived} pcs
                    </td>
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
                          {(gr.items || []).map((item, idx) => (
                            <div key={idx} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '0.4rem 0.75rem', background: 'rgba(34,197,94,0.04)',
                              borderRadius: '6px', border: '1px solid rgba(34,197,94,0.1)', fontSize: '0.8rem',
                            }}>
                              <div>
                                <span style={{ color: '#E5E2E1', fontWeight: 600 }}>{item.materialName}</span>
                                {item.sku && <span style={{ color: 'var(--gray)', fontFamily: 'monospace', fontSize: '0.65rem', marginLeft: '0.5rem' }}>{item.sku}</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>
                                  Previously received: {item.previouslyReceived}
                                </span>
                                <span style={{ color: '#22c55e', fontWeight: 700 }}>
                                  +{item.receivedQty} {item.uom}
                                </span>
                              </div>
                            </div>
                          ))}
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

  // ── Summary Stats ────────────────────────────────────────────────────────────
  const totalPOs      = pos.length;
  const openPOs       = pos.filter(p => OPEN_STATUSES.includes(p.status)).length;
  const receivedPOs   = pos.filter(p => p.status === 'received').length;
  const totalPOValue  = pos
    .filter(p => p.status !== 'cancelled')
    .reduce((sum, po) => sum + (po.items || []).reduce((s, i) => s + ((parseFloat(i.unitCost) || 0) * (parseInt(i.qty) || 0)), 0), 0);
  const totalStockIn  = stockIns.length;
  const totalStockInValue = stockIns.reduce((s, si) => s + si.totalPaid, 0);

  // ── Stock-In Handler ─────────────────────────────────────────────────────────
  // disposition: 'rtv' | 'write_off' | 'cancel'
  const handleStockIn = (siEntries, disposition = 'cancel') => {
    // siEntries can be a single entry or an array
    const entries = Array.isArray(siEntries) ? siEntries : [siEntries];

    entries.forEach(siData => {
      const mats = getStore(MATERIALS_KEY);
      const mat = mats.find(m => m.id === siData.materialId);
      if (!mat) return;

      const oldStock = parseInt(mat.stockQty) || 0;
      const oldCost  = parseFloat(mat.baseCost) || 0;
      const effectiveDamaged = disposition === 'cancel' ? 0 : siData.damagedQty;
      const goodQty  = siData.receivedQty - effectiveDamaged;
      const newCost  = siData.effectiveUnitCost;

      let updatedBaseCost;
      if (oldStock === 0) {
        updatedBaseCost = newCost;
      } else {
        updatedBaseCost = ((oldStock * oldCost) + (goodQty * newCost)) / (oldStock + goodQty);
      }

      const updatedMats = mats.map(m => {
        if (m.id !== siData.materialId) return m;
        return { ...m, stockQty: oldStock + goodQty, baseCost: Math.round(updatedBaseCost * 100) / 100, updatedAt: new Date().toISOString() };
      });
      setStore(MATERIALS_KEY, updatedMats);

      const log = getStore(STOCK_IN_KEY);
      setStore(STOCK_IN_KEY, [...log, { ...siData, id: `si-${Date.now()}-${siData.materialId}`, siNumber: genDocNumber('SI', log), disposition, createdAt: new Date().toISOString() }]);

      if (disposition === 'rtv' && siData.damagedQty > 0) {
        const rtvs = getStore(RTV_KEY);
        setStore(RTV_KEY, [...rtvs, { id: `rtv-${Date.now()}-${siData.materialId}`, rtvNumber: genDocNumber('RTV', rtvs), poId: '', poNumber: siData.referenceNo || 'Manual Stock-In', vendorId: siData.vendorId || '', vendorName: siData.vendorName, materialId: siData.materialId, materialName: siData.materialName, sku: siData.sku || '', uom: siData.uom || 'pcs', qty: siData.damagedQty, unitCost: siData.unitCost, reason: siData.returnReason || 'Damaged', source: 'stock_in', status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
      } else if (disposition === 'write_off' && siData.damagedQty > 0) {
        const stockOuts = getStore(STOCK_OUT_KEY);
        setStore(STOCK_OUT_KEY, [...stockOuts, { id: `so-${Date.now()}-${siData.materialId}`, docNumber: genDocNumber('SO', stockOuts), materialId: siData.materialId, materialName: siData.materialName, sku: siData.sku || '', uom: siData.uom || 'pcs', issueType: 'damage', quantity: siData.damagedQty, previousStock: oldStock, newStock: oldStock + goodQty, unitCost: siData.unitCost, totalLoss: siData.damagedQty * siData.unitCost, referenceNo: siData.referenceNo || 'Manual Stock-In', notes: `Write-off from stock-in`, dateIssued: new Date().toISOString() }]);
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
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Procurement and Sourcing</h1>
            <p className="page-subtitle">
              Track purchase orders, incoming stock, and direct purchases.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '0.25rem', width: 'fit-content' }}>
          <button style={tabStyle('po')} onClick={() => setActiveTab('po')}>Purchase Orders</button>
          <button style={tabStyle('gr')} onClick={() => setActiveTab('gr')}>Goods Receipts</button>
          <button style={tabStyle('si')} onClick={() => setActiveTab('si')}>Manual Stock-In</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{totalPOs}</span>
            <span className="summary-label">Total POs</span>
          </div>
        </div>
        <div className="summary-card summary-card-warning">
          <div className="summary-content">
            <span className="summary-value">{openPOs}</span>
            <span className="summary-label">Pending</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#22c55e' }}>{receivedPOs}</span>
            <span className="summary-label" style={{ color: '#22c55e' }}>Completed</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(212,168,67,0.08)', borderColor: 'rgba(212,168,67,0.3)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#D4A843', fontSize: '1rem' }}>
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

      {/* Tab Content */}
      {activeTab === 'po' && (
        <POTab pos={pos} vendors={vendors} materials={materials} onRefresh={refresh} />
      )}
      {activeTab === 'gr' && (
        <GRHistoryTab grs={grs} />
      )}
      {activeTab === 'si' && (
        <div>
          {/* Manual Entry Toolbar */}
          <div className="inventory-toolbar" style={{ marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}></div>
            <button className="btn-primary" onClick={() => setShowStockIn(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Add Manual Entry
            </button>
          </div>
          <StockInHistoryTab stockIns={stockIns} />
        </div>
      )}

      {/* Stock-In Modal */}
      {showStockIn && (
        <ManualStockInModal
          materials={materials}
          vendors={vendors}
          onClose={() => setShowStockIn(false)}
          onSave={handleStockIn}
        />
      )}
    </div>
  );
}