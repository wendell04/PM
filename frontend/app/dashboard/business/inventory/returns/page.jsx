'use client';

/**
 * RETURNS TO VENDOR (RTV) PAGE
 *
 * SAP-Grade Inventory Module — Phase 4
 *
 * Purpose: Manage returns to vendor workflow
 * - Auto-created from Goods Receipt damaged items
 * - Track RTV status: Pending → Replacement Received
 * - When replacement received → stock restored
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import CustomDropdown from '@/app/components/CustomDropdown';

// ── PO Print Preview Component (from Purchasing page) ──────────────────────────
function PODocumentPreview({ poData, vendors, materials, onClose }) {
  const total = (poData.items || []).reduce(
    (sum, item) => sum + ((parseFloat(item.unitCost) || 0) * (parseInt(item.qty) || 0)), 0
  );
  const vendor = vendors.find(v => v.id === poData.vendorId);
  const expectedDate = poData.expectedDate ? new Date(poData.expectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const today = poData.createdAt ? new Date(poData.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

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
              <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace', color: '#D4A843' }}>{poData.poNumber}</div>
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
                const mat = materials.find(m => m.id === item.materialId);
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
                    <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700, color: '#1a1a1a', fontFamily: 'monospace', fontSize: '0.8rem' }}>₱{lineTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '0.8rem', paddingTop: '0.6rem', borderTop: '2px solid #1a1a1a' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Grand Total</span>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#D4A843', fontFamily: 'monospace' }}>₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '2rem', marginTop: '2rem' }}>
            <div style={{ textAlign: 'center', width: '180px' }}>
              <div style={{ borderBottom: '1px solid #ccc', height: '35px', marginBottom: '0.3rem' }}></div>
              <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>Prepared By</div>
            </div>
          </div>
        </div>
        <div className="no-print" style={{ background: '#1a1a1a', padding: '1rem 1.8rem', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#999', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => window.print()} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#E5E2E1', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Storage Keys ───────────────────────────────────────────────────────────────
const RTV_KEY        = 'pmp_returns_to_vendor';
const BACKORDER_KEY  = 'pmp_backorders';
const CREDIT_KEY     = 'pmp_credit_claims';
const MATERIALS_KEY  = 'pmp_materials';
const VENDORS_KEY    = 'pmp_vendors';
const PO_KEY         = 'pmp_purchase_orders';

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

// ── Helper: Check if all RTVs and Credit Claims for a PO are resolved ──────────
// Resolved statuses: replacement_received, credited, cancelled
const RESOLVED_STATUSES = ['replacement_received', 'credited', 'cancelled'];

function checkAndCompletePO(poNumber) {
  if (!poNumber || poNumber === 'Manual') return;
  
  const allRTVs = getStore(RTV_KEY);
  const allCredits = getStore(CREDIT_KEY);
  const allPOs = getStore(PO_KEY);
  
  // Get all RTVs for this PO
  const poRTVs = allRTVs.filter(r => r.poNumber === poNumber);
  // Get all Credit Claims for this PO
  const poCredits = allCredits.filter(c => c.poNumber === poNumber);
  
  // Check if all are resolved
  const allRTVsResolved = poRTVs.length === 0 || poRTVs.every(r => RESOLVED_STATUSES.includes(r.status));
  const allCreditsResolved = poCredits.length === 0 || poCredits.every(c => RESOLVED_STATUSES.includes(c.status));
  
  // If all resolved and PO is still pending/partial, mark as received
  if (allRTVsResolved && allCreditsResolved) {
    const po = allPOs.find(p => p.poNumber === poNumber);
    if (po && (po.status === 'pending' || po.status === 'partial' || po.status === 'draft')) {
      const updatedPOs = allPOs.map(p =>
        p.poNumber === poNumber ? { ...p, status: 'received', updatedAt: new Date().toISOString() } : p
      );
      setStore(PO_KEY, updatedPOs);
    }
  }
}

// ── Status Config ──────────────────────────────────────────────────────────────
const RTV_STATUS = {
  pending:              { label: 'Pending',              color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.2)' },
  replacement_received: { label: 'Replacement Received', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.2)' },
  credited:             { label: 'Credited',             color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',   border: 'rgba(139,92,246,0.2)' },
  cancelled:            { label: 'Cancelled',            color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.2)' },
};

// Statuses available for the Update Status dropdown (resolution options only)
const RTV_UPDATE_STATUSES = {
  replacement_received: { label: 'Replacement Received', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.2)' },
  credited:             { label: 'Credited',             color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',   border: 'rgba(139,92,246,0.2)' },
  cancelled:            { label: 'Cancelled',            color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.2)' },
};

const RETURN_REASONS = [
  'Damaged in Transit',
  'Defective Product',
  'Wrong Item Shipped',
  'Quantity Shortage',
  'Expired',
  'Other',
];

// ── Shared Styles ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#E5E2E1',
  padding: '0.5rem 0.75rem',
  fontSize: '0.8rem',
  outline: 'none',
};

// ── Status Badge ───────────────────────────────────────────────────────────────
function RTVStatusBadge({ status }) {
  const cfg = RTV_STATUS[status] || RTV_STATUS.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.5rem', borderRadius: '99px',
      fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL RTV FORM MODAL
// ══════════════════════════════════════════════════════════════════════════════
function ManualRTVFormModal({ materials, vendors, onClose, onSave }) {
  const [form, setForm] = useState({
    vendorId: '', materialId: '', qty: '', reason: 'Damaged in Transit', notes: '',
  });
  const [errors, setErrors] = useState({});

  const material = materials.find(m => m.id === form.materialId);
  const vendor = vendors.find(v => v.id === form.vendorId);

  const validate = () => {
    const e = {};
    if (!form.vendorId) e.vendor = 'Select a vendor.';
    if (!form.materialId) e.material = 'Select a material.';
    if (!form.qty || parseInt(form.qty) <= 0) e.qty = 'Quantity must be greater than 0.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      vendorId: form.vendorId,
      vendorName: vendor?.name || '',
      materialId: form.materialId,
      materialName: material?.name || '',
      sku: material?.sku || '',
      uom: material?.uom || 'pcs',
      qty: parseInt(form.qty),
      unitCost: parseFloat(material?.baseCost) || 0,
      reason: form.reason,
      notes: form.notes.trim(),
      poId: '',
      poNumber: 'Manual',
    });
  };

  const selectableMaterials = materials.filter(m => !m.parentId);

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">Log Manual Return</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">Vendor <span className="required">*</span></label>
              <CustomDropdown
                value={form.vendorId}
                onChange={(val) => { setForm(p => ({ ...p, vendorId: val })); setErrors(p => ({ ...p, vendor: null })); }}
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
              <label className="form-label">Material <span className="required">*</span></label>
              <CustomDropdown
                value={form.materialId}
                onChange={(val) => { setForm(p => ({ ...p, materialId: val })); setErrors(p => ({ ...p, material: null })); }}
                options={[
                  { value: '', label: 'Select material...' },
                  ...selectableMaterials.map(m => ({ value: m.id, label: `${m.name}${m.sku ? ` (${m.sku})` : ''}` })),
                ]}
                placeholder="Select material..."
                style={{ borderColor: errors.material ? 'rgba(239,68,68,0.5)' : undefined }}
              />
              {errors.material && <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.25rem' }}>{errors.material}</p>}
            </div>
            <div>
              <label className="form-label">Quantity <span className="required">*</span></label>
              <input type="number" min="1"
                style={{ ...inputStyle, borderColor: errors.qty ? 'rgba(239,68,68,0.5)' : undefined }}
                value={form.qty}
                onChange={e => { setForm(p => ({ ...p, qty: e.target.value })); setErrors(p => ({ ...p, qty: null })); }}
                placeholder="0"
              />
              {errors.qty && <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.25rem' }}>{errors.qty}</p>}
            </div>
            <div>
              <label className="form-label">Reason</label>
              <CustomDropdown
                value={form.reason}
                onChange={(val) => setForm(p => ({ ...p, reason: val }))}
                options={RETURN_REASONS.map(r => ({ value: r, label: r }))}
                placeholder="Select reason..."
              />
            </div>
            <div>
              <label className="form-label">Notes</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '56px' }}
                value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value.slice(0, 300) }))}
                placeholder="Additional details..." maxLength={300} />
            </div>
          </div>
          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Create RTV</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RTV LIST TAB
// ══════════════════════════════════════════════════════════════════════════════
function RTVListTab({ rtvs, onRefresh }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, rtv: null, newStatus: '' });
  const [poPreview, setPOPreview] = useState(null);

  const materials = useMemo(() => getStore(MATERIALS_KEY), []);
  const vendors = useMemo(() => getStore(VENDORS_KEY), []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rtvs
      .filter(r => {
        const matchSearch = !q
          || (r.materialName || '').toLowerCase().includes(q)
          || (r.rtvNumber || '').toLowerCase().includes(q)
          || (r.vendorName || '').toLowerCase().includes(q)
          || (r.poNumber || '').toLowerCase().includes(q);
        const matchStatus = !statusFilter || r.status === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [rtvs, search, statusFilter]);

  const requestStatusChange = (rtv, newStatus) => {
    // If already resolved, don't allow changes
    if (rtv.status !== 'pending') return;
    setConfirmModal({ isOpen: true, rtv, newStatus });
  };

  const confirmStatusChange = () => {
    const { rtv, newStatus } = confirmModal;
    const all = getStore(RTV_KEY);
    const updated = all.map(r => r.id === rtv.id ? { ...r, status: newStatus, updatedAt: new Date().toISOString() } : r);
    setStore(RTV_KEY, updated);

    // If replacement received → restore stock AND update PO receivedQty AND update batch
    if (newStatus === 'replacement_received') {
      const mats = getStore(MATERIALS_KEY);
      const mat = mats.find(m => m.id === rtv.materialId);
      if (mat) {
        const oldStock = parseInt(mat.stockQty) || 0;
        const restored = oldStock + (parseInt(rtv.qty) || 0);
        setStore(MATERIALS_KEY, mats.map(m =>
          m.id === rtv.materialId ? { ...m, stockQty: restored, updatedAt: new Date().toISOString() } : m
        ));
      }

      // Update batch: move damaged to good stock (replacement replaces damaged items)
      if (mat && mat.batches) {
        const updatedBatches = mat.batches.map(batch => {
          // Find matching batch by PO number (most recent batch with damage for this PO)
          if (batch.poNumber === rtv.poNumber && (batch.qtyDamaged || 0) > 0) {
            const damaged = batch.qtyDamaged || 0;
            const good = batch.qtyGood || 0;
            // Move damaged to good (replacement received)
            return {
              ...batch,
              qtyGood: good + damaged,
              qtyDamaged: 0,
              remainingQty: good + damaged, // remaining = good (no damage now)
              updatedAt: new Date().toISOString()
            };
          }
          return batch;
        });
        setStore(MATERIALS_KEY, mats.map(m =>
          m.id === rtv.materialId ? { ...m, batches: updatedBatches, updatedAt: new Date().toISOString() } : m
        ));
      }

      // Update PO items receivedQty to include the replacement
      const allPOs = getStore(PO_KEY);
      const po = allPOs.find(p => p.id === rtv.poId || p.poNumber === rtv.poNumber);
      if (po) {
        const updatedItems = (po.items || []).map(item => {
          if (item.materialId === rtv.materialId) {
            const currentReceived = parseInt(item.receivedQty) || 0;
            const newReceived = currentReceived + (parseInt(rtv.qty) || 0);
            return { ...item, receivedQty: newReceived };
          }
          return item;
        });
        setStore(PO_KEY, allPOs.map(p =>
          (p.id === rtv.poId || p.poNumber === rtv.poNumber)
            ? { ...p, items: updatedItems, updatedAt: new Date().toISOString() }
            : p
        ));
      }
    }

    // Check if all RTVs and Credit Claims for this PO are resolved → complete the PO
    checkAndCompletePO(rtv.poNumber);

    setConfirmModal({ isOpen: false, rtv: null, newStatus: '' });
    onRefresh();

    // Dispatch custom event to notify procurement page
    window.dispatchEvent(new CustomEvent('inventoryRefresh'));
  };

  const handleManualRTV = (data) => {
    const all = getStore(RTV_KEY);
    const newRTV = {
      ...data,
      id: `rtv-${Date.now()}`,
      rtvNumber: `RTV-${new Date().getFullYear()}-${String(all.length + 1).padStart(4, '0')}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStore(RTV_KEY, [...all, newRTV]);
    setShowManualForm(false);
    onRefresh();
  };

  const pendingCount = rtvs.filter(r => r.status === 'pending').length;
  const totalValue = rtvs.filter(r => r.status !== 'cancelled').reduce((s, r) => s + ((r.qty || 0) * (r.unitCost || 0)), 0);

  return (
    <div>
      {/* Summary Cards */}
      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card summary-card-warning">
          <div className="summary-content">
            <span className="summary-value">{pendingCount}</span>
            <span className="summary-label">Pending RTVs</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(212,168,67,0.08)', borderColor: 'rgba(212,168,67,0.3)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#D4A843', fontSize: '1rem' }}>
              ₱{totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="summary-label">Total RTV Value</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#22c55e' }}>
              {rtvs.filter(r => r.status === 'replacement_received').length}
            </span>
            <span className="summary-label" style={{ color: '#22c55e' }}>Resolved</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="inventory-toolbar" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ maxWidth: '280px' }}>
            <span className="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
            <input className="search-input" placeholder="Search RTVs..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
          </div>
          <CustomDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'All Status' },
              ...Object.entries(RTV_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
            ]}
            placeholder="All Status"
            style={{ minWidth: '140px' }}
          />
        </div>
        <button className="btn-primary" onClick={() => setShowManualForm(true)} style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Log Manual Return
        </button>
      </div>

      {/* RTV Cards */}
      {filtered.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)', background: 'var(--dark)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          {rtvs.length === 0
            ? 'No returns yet. Damaged items from Goods Receipt will appear here automatically.'
            : 'No RTVs match your filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(rtv => {
            const isResolved = rtv.status === 'replacement_received' || rtv.status === 'credited';
            return (
              <div key={rtv.id} style={{
                background: 'var(--dark)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                overflow: 'visible',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem' }}>
                  {/* Left: Icon + Material Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#f59e0b',
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.95rem' }}>{rtv.materialName}</span>
                        <RTVStatusBadge status={rtv.status} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.15rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
                        <span>{rtv.vendorName || '—'}</span>
                        <span style={{ fontWeight: 600, color: '#E5E2E1' }}>Qty: {rtv.qty}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Reason + Status Dropdowns */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', textAlign: 'center' }}>Reason</div>
                      <div style={{
                        ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '160px', textAlign: 'center',
                        background: 'rgba(255,255,255,0.03)', color: '#E5E2E1', cursor: 'default',
                      }}>
                        {rtv.reason || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', textAlign: 'center' }}>Update Status</div>
                      {rtv.status === 'pending' ? (
                        <CustomDropdown
                          value=""
                          onChange={(val) => { if (val) requestStatusChange(rtv, val); }}
                          options={Object.entries(RTV_UPDATE_STATUSES).map(([k, v]) => ({ value: k, label: v.label }))}
                          placeholder="Select action..."
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '170px' }}
                        />
                      ) : (
                        <div style={{
                          ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '170px', textAlign: 'center',
                          background: 'rgba(255,255,255,0.03)', color: RTV_STATUS[rtv.status]?.color || 'var(--gray)',
                          fontWeight: 700, cursor: 'default',
                        }}>
                          {RTV_STATUS[rtv.status]?.label || rtv.status}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer: PO Link + Date + Stock Restored */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.6rem 1.5rem',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  background: 'rgba(0,0,0,0.1)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--gray)' }}>
                    <span
                      onClick={() => {
                        if (rtv.poNumber && rtv.poNumber !== 'Manual') {
                          const allPOs = getStore(PO_KEY);
                          const po = allPOs.find(p => p.poNumber === rtv.poNumber);
                          if (po) setPOPreview(po);
                        }
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: rtv.poNumber && rtv.poNumber !== 'Manual' ? 'pointer' : 'default' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--gray)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--gray)'; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      LINKED TO PO: {rtv.poNumber || '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                      {new Date(rtv.createdAt).toLocaleDateString('en-PH')}
                    </span>
                    {isResolved && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
                        </svg>
                        Stock Restored
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual RTV Modal */}
      {showManualForm && (
        <ManualRTVFormModal
          materials={materials}
          vendors={vendors}
          onClose={() => setShowManualForm(false)}
          onSave={handleManualRTV}
        />
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && confirmModal.rtv && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Confirm Status Update</h2>
              <button className="modal-close" onClick={() => setConfirmModal({ isOpen: false, rtv: null, newStatus: '' })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <p style={{ fontSize: '0.875rem', color: '#E5E2E1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                Update <strong>{confirmModal.rtv.materialName}</strong> ({confirmModal.rtv.qty} {confirmModal.rtv.uom}) status to:
              </p>
              <div style={{
                padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                border: '1px solid var(--border)', textAlign: 'center', marginBottom: '1rem',
              }}>
                <span style={{
                  fontWeight: 700, fontSize: '0.9rem',
                  color: RTV_UPDATE_STATUSES[confirmModal.newStatus]?.color || '#E5E2E1',
                }}>
                  {RTV_UPDATE_STATUSES[confirmModal.newStatus]?.label || confirmModal.newStatus}
                </span>
              </div>
              {confirmModal.newStatus === 'replacement_received' && (
                <div style={{
                  padding: '0.6rem 0.75rem', background: 'rgba(34,197,94,0.06)', borderRadius: '6px',
                  border: '1px solid rgba(34,197,94,0.15)', fontSize: '0.8rem', color: '#86efac',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
                  </svg>
                  This will restore {confirmModal.rtv.qty} {confirmModal.rtv.uom} to stock.
                </div>
              )}
              <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.75rem' }}>
                This action cannot be undone.
              </p>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmModal({ isOpen: false, rtv: null, newStatus: '' })}>Cancel</button>
              <button type="button" className="btn-primary" onClick={confirmStatusChange}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* PO Preview Modal */}
      {poPreview && (
        <PODocumentPreview
          poData={poPreview}
          vendors={vendors}
          materials={materials}
          onClose={() => setPOPreview(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BACKORDERS TAB
// ══════════════════════════════════════════════════════════════════════════════
function BackordersTab({ onRefresh, refreshKey }) {
  const [backorders, setBackorders] = useState([]);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null, newStatus: '' });

  // Reload backorders when component mounts, refreshKey changes, or storage event fires
  useEffect(() => {
    setBackorders(getStore(BACKORDER_KEY));
    
    // Listen for storage changes (in case backorders are created in another tab/window)
    const handleStorageChange = () => {
      setBackorders(getStore(BACKORDER_KEY));
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refreshKey]);

  const updateStatus = (bo, newStatus) => {
    if (newStatus === 'received') {
      // Restore stock when backorder received
      const mats = getStore(MATERIALS_KEY);
      const mat = mats.find(m => m.id === bo.materialId);
      if (mat) {
        const oldStock = parseInt(mat.stockQty) || 0;
        const newStock = oldStock + bo.qty;
        setStore(MATERIALS_KEY, mats.map(m =>
          m.id === bo.materialId ? { ...m, stockQty: newStock, updatedAt: new Date().toISOString() } : m
        ));
      }

      // Update PO items receivedQty to include the backorder
      const allPOs = getStore(PO_KEY);
      const po = allPOs.find(p => p.id === bo.poId || p.poNumber === bo.poNumber);
      if (po) {
        const updatedItems = (po.items || []).map(item => {
          if (item.materialId === bo.materialId) {
            const currentReceived = parseInt(item.receivedQty) || 0;
            const newReceived = currentReceived + (parseInt(bo.qty) || 0);
            return { ...item, receivedQty: newReceived };
          }
          return item;
        });
        setStore(PO_KEY, allPOs.map(p =>
          (p.id === bo.poId || p.poNumber === bo.poNumber)
            ? { ...p, items: updatedItems, updatedAt: new Date().toISOString() }
            : p
        ));
      }

      // Update PO status if all backorders fulfilled
      const allBO = getStore(BACKORDER_KEY);
      const poBackorders = allBO.filter(b => b.poId === bo.poId);
      const allFulfilled = poBackorders.every(b => b.id === bo.id || b.status === 'fulfilled');

      if (allFulfilled) {
        const allPOs2 = getStore(PO_KEY);
        const po2 = allPOs2.find(p => p.id === bo.poId);
        // Update PO status if it's pending or partial (meaning it had shortages)
        if (po2 && (po2.status === 'pending' || po2.status === 'partial')) {
          setStore(PO_KEY, allPOs2.map(p =>
            p.id === bo.poId ? { ...p, status: 'received', updatedAt: new Date().toISOString() } : p
          ));
        }
      }
    }

    const allBO = getStore(BACKORDER_KEY);
    setStore(BACKORDER_KEY, allBO.map(b =>
      b.id === bo.id ? { ...b, status: newStatus, updatedAt: new Date().toISOString() } : b
    ));

    // Check if all RTVs and Credit Claims for this PO are resolved → complete the PO
    checkAndCompletePO(bo.poNumber);

    setBackorders(getStore(BACKORDER_KEY));
    setConfirmModal({ isOpen: false, item: null, newStatus: '' });
    onRefresh();

    // Dispatch custom event to notify procurement page
    window.dispatchEvent(new CustomEvent('inventoryRefresh'));
  };

  // Status config for Backorders
  const boStatusConfig = {
    pending: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
    received: { label: 'Received', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)' },
    cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)' },
  };

  const statusOptions = [
    { value: 'received', label: 'Received', color: '#22c55e' },
    { value: 'cancelled', label: 'Cancelled', color: '#ef4444' },
  ];

  return (
    <div>
      {/* Refresh Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={onRefresh} style={{
          padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
          borderRadius: '8px', color: '#E5E2E1', fontSize: '0.8rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>
          </svg>
          Refresh
        </button>
      </div>

      {backorders.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)', background: 'var(--dark)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          No backorders yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {backorders.map(bo => {
            const isResolved = bo.status !== 'pending';
            const statusCfg = boStatusConfig[bo.status] || boStatusConfig.pending;
            return (
              <div key={bo.id} style={{
                background: 'var(--dark)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                overflow: 'visible',
                opacity: isResolved ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem' }}>
                  {/* Left: Icon + Material Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: isResolved ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                      border: isResolved ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(245,158,11,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isResolved ? '#22c55e' : '#f59e0b',
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.95rem' }}>{bo.materialName}</span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.5rem', borderRadius: '99px',
                          fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                          background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}`,
                        }}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.15rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
                        <span>{bo.vendorName || '—'}</span>
                        <span style={{ fontWeight: 600, color: '#E5E2E1' }}>Qty: {bo.qty}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Reason + Status Display */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', textAlign: 'center' }}>Reason</div>
                      <div style={{
                        ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '160px', textAlign: 'center',
                        background: 'rgba(255,255,255,0.03)', color: '#E5E2E1', cursor: 'default',
                      }}>
                        {bo.reason || '—'}
                      </div>
                    </div>
                    {!isResolved && (
                      <div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', textAlign: 'center' }}>Update Status</div>
                        <CustomDropdown
                          value=""
                          onChange={(val) => { if (val) setConfirmModal({ isOpen: true, item: bo, newStatus: val }); }}
                          options={statusOptions}
                          placeholder="Select action..."
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '170px' }}
                        />
                      </div>
                    )}
                    {isResolved && (
                      <div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', textAlign: 'center' }}>Status</div>
                        <div style={{
                          ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '170px', textAlign: 'center',
                          background: 'rgba(255,255,255,0.03)', color: statusCfg.color, fontWeight: 700, cursor: 'default',
                        }}>
                          {statusCfg.label}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: PO Link + Date */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.6rem 1.5rem',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  background: 'rgba(0,0,0,0.1)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--gray)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    LINKED TO PO: {bo.poNumber || '—'}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                    {new Date(bo.createdAt).toLocaleDateString('en-PH')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && confirmModal.item && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Confirm Status Update</h2>
              <button className="modal-close" onClick={() => setConfirmModal({ isOpen: false, item: null, newStatus: '' })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <p style={{ fontSize: '0.875rem', color: '#E5E2E1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                Update <strong>{confirmModal.item.materialName}</strong> ({confirmModal.item.qty} {confirmModal.item.uom}) status to:
              </p>
              <div style={{
                padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                border: '1px solid var(--border)', textAlign: 'center', marginBottom: '1rem',
              }}>
                <span style={{
                  fontWeight: 700, fontSize: '0.9rem',
                  color: statusOptions.find(s => s.value === confirmModal.newStatus)?.color || '#E5E2E1',
                }}>
                  {statusOptions.find(s => s.value === confirmModal.newStatus)?.label || confirmModal.newStatus}
                </span>
              </div>
              {confirmModal.newStatus === 'received' && (
                <div style={{
                  padding: '0.6rem 0.75rem', background: 'rgba(34,197,94,0.06)', borderRadius: '6px',
                  border: '1px solid rgba(34,197,94,0.15)', fontSize: '0.8rem', color: '#86efac',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
                  </svg>
                  This will restore {confirmModal.item.qty} {confirmModal.item.uom} to stock.
                </div>
              )}
              <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.75rem' }}>
                This action cannot be undone.
              </p>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmModal({ isOpen: false, item: null, newStatus: '' })}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => updateStatus(confirmModal.item, confirmModal.newStatus)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CREDIT CLAIMS TAB
// ══════════════════════════════════════════════════════════════════════════════
function CreditClaimsTab({ onRefresh }) {
  const [credits, setCredits] = useState([]);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null, newStatus: '' });

  useEffect(() => {
    setCredits(getStore(CREDIT_KEY));
  }, []);

  const updateStatus = (cc, newStatus) => {
    // If replacement received, update PO items receivedQty
    if (newStatus === 'replacement_received') {
      const allPOs = getStore(PO_KEY);
      const po = allPOs.find(p => p.id === cc.poId || p.poNumber === cc.poNumber);
      if (po) {
        const updatedItems = (po.items || []).map(item => {
          if (item.materialId === cc.materialId) {
            const currentReceived = parseInt(item.receivedQty) || 0;
            const newReceived = currentReceived + (parseInt(cc.qty) || 0);
            return { ...item, receivedQty: newReceived };
          }
          return item;
        });
        setStore(PO_KEY, allPOs.map(p =>
          (p.id === cc.poId || p.poNumber === cc.poNumber)
            ? { ...p, items: updatedItems, updatedAt: new Date().toISOString() }
            : p
        ));
      }
    }

    const allCC = getStore(CREDIT_KEY);
    setStore(CREDIT_KEY, allCC.map(c =>
      c.id === cc.id ? { ...c, status: newStatus, updatedAt: new Date().toISOString() } : c
    ));

    // Check if all RTVs and Credit Claims for this PO are resolved → complete the PO
    checkAndCompletePO(cc.poNumber);

    setCredits(getStore(CREDIT_KEY));
    setConfirmModal({ isOpen: false, item: null, newStatus: '' });
    onRefresh();

    // Dispatch custom event to notify procurement page
    window.dispatchEvent(new CustomEvent('inventoryRefresh'));
  };

  // Status config for Credit Claims
  const ccStatusConfig = {
    pending: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
    replacement_received: { label: 'Replacement Received', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)' },
    credited: { label: 'Credited', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)' },
    cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)' },
  };

  const statusOptions = [
    { value: 'replacement_received', label: 'Replacement Received', color: '#22c55e' },
    { value: 'credited', label: 'Credited', color: '#8b5cf6' },
    { value: 'cancelled', label: 'Cancelled', color: '#ef4444' },
  ];

  return (
    <div>
      {credits.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)', background: 'var(--dark)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          No credit claims yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {credits.map(cc => {
            const isResolved = cc.status !== 'pending';
            const statusCfg = ccStatusConfig[cc.status] || ccStatusConfig.pending;
            return (
            <div key={cc.id} style={{
              background: 'var(--dark)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'visible',
              opacity: isResolved ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem' }}>
                {/* Left: Icon + Material Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: isResolved ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                    border: isResolved ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(245,158,11,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isResolved ? '#22c55e' : '#f59e0b',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.95rem' }}>{cc.materialName}</span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.5rem', borderRadius: '99px',
                        fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                        background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}`,
                      }}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.15rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
                      <span>{cc.vendorName || '—'}</span>
                      <span style={{ fontWeight: 600, color: '#E5E2E1' }}>
                        {cc.qty} {cc.uom} × ₱{cc.unitCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Reason + Status Display */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', textAlign: 'center' }}>Reason</div>
                    <div style={{
                      ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '160px', textAlign: 'center',
                      background: 'rgba(255,255,255,0.03)', color: '#E5E2E1', cursor: 'default',
                    }}>
                      {cc.reason || '—'}
                    </div>
                  </div>
                  {!isResolved && (
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', textAlign: 'center' }}>Update Status</div>
                      <CustomDropdown
                        value=""
                        onChange={(val) => { if (val) setConfirmModal({ isOpen: true, item: cc, newStatus: val }); }}
                        options={statusOptions}
                        placeholder="Select action..."
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '170px' }}
                      />
                    </div>
                  )}
                  {isResolved && (
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', textAlign: 'center' }}>Status</div>
                      <div style={{
                        ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.75rem', minWidth: '170px', textAlign: 'center',
                        background: 'rgba(255,255,255,0.03)', color: statusCfg.color, fontWeight: 700, cursor: 'default',
                      }}>
                        {statusCfg.label}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: PO Link + Date + Credit Amount */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.6rem 1.5rem',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                background: 'rgba(0,0,0,0.1)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--gray)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  LINKED TO PO: {cc.poNumber || '—'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                    {new Date(cc.createdAt).toLocaleDateString('en-PH')}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
                    ₱{cc.totalCredit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          );})}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && confirmModal.item && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Confirm Status Update</h2>
              <button className="modal-close" onClick={() => setConfirmModal({ isOpen: false, item: null, newStatus: '' })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <p style={{ fontSize: '0.875rem', color: '#E5E2E1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                Update credit claim of <strong>₱{confirmModal.item.totalCredit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> for <strong>{confirmModal.item.materialName}</strong> to:
              </p>
              <div style={{
                padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                border: '1px solid var(--border)', textAlign: 'center', marginBottom: '1rem',
              }}>
                <span style={{
                  fontWeight: 700, fontSize: '0.9rem',
                  color: statusOptions.find(s => s.value === confirmModal.newStatus)?.color || '#E5E2E1',
                }}>
                  {statusOptions.find(s => s.value === confirmModal.newStatus)?.label || confirmModal.newStatus}
                </span>
              </div>
              {confirmModal.newStatus === 'replacement_received' && (
                <div style={{
                  padding: '0.6rem 0.75rem', background: 'rgba(34,197,94,0.06)', borderRadius: '6px',
                  border: '1px solid rgba(34,197,94,0.15)', fontSize: '0.8rem', color: '#86efac',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
                  </svg>
                  Vendor will send {confirmModal.item.qty} {confirmModal.item.uom} as replacement.
                </div>
              )}
              {confirmModal.newStatus === 'credited' && (
                <div style={{
                  padding: '0.6rem 0.75rem', background: 'rgba(139,92,246,0.06)', borderRadius: '6px',
                  border: '1px solid rgba(139,92,246,0.15)', fontSize: '0.8rem', color: '#c4b5fd',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
                  </svg>
                  ₱{confirmModal.item.totalCredit.toLocaleString('en-PH', { minimumFractionDigits: 2 })} will be credited to your account.
                </div>
              )}
              <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.75rem' }}>
                This action cannot be undone.
              </p>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmModal({ isOpen: false, item: null, newStatus: '' })}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => updateStatus(confirmModal.item, confirmModal.newStatus)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function ReturnsPage() {
  const [activeTab, setActiveTab] = useState('returns');
  const [rtvs, setRtvs] = useState([]);
  const [backorderRefreshKey, setBackorderRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRtvs(getStore(RTV_KEY));
    // Trigger backorder reload when switching to backorders tab
    setBackorderRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const tabStyle = (tab) => ({
    padding: '0.625rem 1.25rem', fontSize: '0.825rem', fontWeight: 700,
    cursor: 'pointer', borderRadius: '8px', border: 'none',
    background: activeTab === tab ? 'var(--gold)' : 'transparent',
    color: activeTab === tab ? '#000' : 'var(--gray)',
    transition: 'all 0.15s',
  });

  return (
    <div className="page-content-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Returns to Vendor</h1>
            <p className="page-subtitle">
              Manage returns, backorders, and credit claims with your suppliers.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '0.25rem', width: 'fit-content' }}>
          <button style={tabStyle('returns')} onClick={() => setActiveTab('returns')}>Returns to Vendor</button>
          <button style={tabStyle('backorders')} onClick={() => setActiveTab('backorders')}>Backorders</button>
          <button style={tabStyle('credits')} onClick={() => setActiveTab('credits')}>Credit Claims</button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'returns' && <RTVListTab rtvs={rtvs} onRefresh={refresh} />}
      {activeTab === 'backorders' && <BackordersTab onRefresh={refresh} refreshKey={backorderRefreshKey} />}
      {activeTab === 'credits' && <CreditClaimsTab onRefresh={refresh} />}
    </div>
  );
}
