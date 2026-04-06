'use client';

/**
 * STOCKS PAGE
 *
 * SAP-Grade Inventory Module — Phase 3
 *
 * Purpose: Manage stock/inventory levels
 * - Current Stock Overview
 * - Goods Issue (Stock-Out): Damage, Scrap, Production Use, Loss
 * - Stock Movement History
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import CustomDropdown from '@/app/components/CustomDropdown';

// ── Storage Keys ───────────────────────────────────────────────────────────────
const MATERIALS_KEY  = 'pmp_materials';
const VENDORS_KEY    = 'pmp_vendors';
const STOCK_OUT_KEY  = 'pmp_stock_out_log';

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

// ── Issue Type Config ──────────────────────────────────────────────────────────
const ISSUE_TYPES = {
  damage:       { label: 'Damage',        color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)' },
  scrap:        { label: 'Scrap',         color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.2)' },
  production:   { label: 'Production Use', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.2)' },
  lost:         { label: 'Lost/Missing',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)' },
  return:       { label: 'Return to Vendor', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)' },
  adjustment:   { label: 'Adjustment',    color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.2)' },
};

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
          const n = v === '' ? 0 : parseInt(v, 10);
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

function IssueTypeBadge({ type }) {
  const cfg = ISSUE_TYPES[type] || ISSUE_TYPES.adjustment;
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

// ── Chevron Icon ───────────────────────────────────────────────────────────────
function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
      <path d="M9 18l6-6-6-6"/>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GOODS ISSUE FORM MODAL (Stock-Out)
// ══════════════════════════════════════════════════════════════════════════════
function GoodsIssueModal({ materials, onClose, onSave }) {
  const [form, setForm] = useState({
    materialId: '', issueType: 'damage', quantity: '',
    referenceNo: '', notes: '',
  });
  const [errors, setErrors] = useState({});

  const material = materials.find(m => m.id === form.materialId);
  const currentStock = material ? (parseInt(material.stockQty) || 0) : 0;
  const issueQty = parseInt(form.quantity) || 0;
  const remainingStock = currentStock - issueQty;

  const validate = () => {
    const e = {};
    if (!form.materialId)              e.material = 'Select a material.';
    if (!form.quantity || issueQty <= 0) e.quantity = 'Quantity must be greater than 0.';
    if (issueQty > currentStock)       e.quantity = `Insufficient stock. Only ${currentStock} available.`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      materialId:   form.materialId,
      materialName: material?.name || '',
      sku:          material?.sku || '',
      uom:          material?.uom || 'pcs',
      issueType:    form.issueType,
      quantity:     issueQty,
      previousStock: currentStock,
      newStock:     remainingStock,
      unitCost:     parseFloat(material?.baseCost) || 0,
      totalLoss:    issueQty * (parseFloat(material?.baseCost) || 0),
      referenceNo:  form.referenceNo.trim(),
      notes:        form.notes.trim(),
      dateIssued:   new Date().toISOString(),
    });
  };

  // Only non-child materials
  const selectableMaterials = materials.filter(m => !m.parentId);

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">Goods Issue (Stock-Out)</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.1rem' }}>
              Deduct stock for damage, scrap, production, or loss
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

            {/* Material */}
            <div>
              <label className="form-label">Material <span className="required">*</span></label>
              <CustomDropdown
                value={form.materialId}
                onChange={(val) => { setForm(p => ({ ...p, materialId: val })); setErrors(p => ({ ...p, material: null, quantity: null })); }}
                options={[
                  { value: '', label: 'Select material...' },
                  ...selectableMaterials.map(m => ({ value: m.id, label: `${m.name}${m.sku ? ` (${m.sku})` : ''} — Stock: ${m.stockQty || 0} ${m.uom || 'pcs'}` })),
                ]}
                placeholder="Select material..."
                style={{ borderColor: errors.material ? 'rgba(239,68,68,0.5)' : undefined }}
              />
              {errors.material && <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.25rem' }}>{errors.material}</p>}
            </div>

            {/* Issue Type */}
            <div>
              <label className="form-label">Issue Type <span className="required">*</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {Object.entries(ISSUE_TYPES).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, issueType: key }))}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: form.issueType === key ? `2px solid ${cfg.color}` : '1px solid rgba(255,255,255,0.1)',
                      background: form.issueType === key ? cfg.bg : 'rgba(255,255,255,0.02)',
                      color: form.issueType === key ? cfg.color : 'var(--gray)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      transition: 'all 0.15s',
                    }}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity + Stock Info */}
            <div>
              <label className="form-label">Quantity to Deduct <span className="required">*</span></label>
              <IntInput
                style={{ ...inputStyle, borderColor: errors.quantity ? 'rgba(239,68,68,0.5)' : undefined }}
                value={form.quantity}
                onChange={v => { setForm(p => ({ ...p, quantity: v })); setErrors(p => ({ ...p, quantity: null })); }}
                min={1}
                max={currentStock}
                placeholder="0"
              />
              {errors.quantity && <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.25rem' }}>{errors.quantity}</p>}
            </div>

            {/* Stock Impact */}
            {material && issueQty > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Current</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#E5E2E1' }}>{currentStock}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Deduct</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>-{issueQty}</div>
                </div>
                <div style={{ padding: '0.75rem', background: remainingStock === 0 ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)', borderRadius: '8px', border: `1px solid ${remainingStock === 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Remaining</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: remainingStock === 0 ? '#ef4444' : '#22c55e' }}>{remainingStock}</div>
                </div>
              </div>
            )}

            {/* Value Impact */}
            {material && issueQty > 0 && (
              <div style={{
                padding: '0.625rem 1rem', background: 'rgba(239,68,68,0.04)',
                borderRadius: '8px', border: '1px solid rgba(239,68,68,0.15)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Estimated Loss Value</span>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>
                  ₱{(issueQty * (parseFloat(material.baseCost) || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Reference No */}
            <div>
              <label className="form-label">Reference No</label>
              <input
                type="text"
                style={inputStyle}
                value={form.referenceNo}
                onChange={e => setForm(p => ({ ...p, referenceNo: e.target.value.slice(0, 50) }))}
                placeholder="e.g., INC-001, Job Order #123"
                maxLength={50}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="form-label">Reason / Notes</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '56px' }}
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value.slice(0, 300) }))}
                placeholder="Describe why stock is being deducted..."
                maxLength={300}
              />
            </div>
          </div>

          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
              Confirm Stock-Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STOCK OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════════════════
function StockOverviewTab({ materials, vendors, onIssueStock }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedParents, setExpandedParents] = useState(new Set());

  const categories = useMemo(() => {
    const cats = new Set();
    materials.forEach(m => { if (m.category) cats.add(m.category); });
    return [...cats].sort();
  }, [materials]);

  // Group materials: parents with children, or standalone
  const groupedMaterials = useMemo(() => {
    const parents = materials.filter(m => m.hasVariants && !m.parentId);
    const childrenMap = new Map();
    materials.filter(m => m.parentId).forEach(child => {
      if (!childrenMap.has(child.parentId)) childrenMap.set(child.parentId, []);
      childrenMap.get(child.parentId).push(child);
    });
    const standalone = materials.filter(m => !m.hasVariants && !m.parentId);
    return { parents, childrenMap, standalone };
  }, [materials]);

  const toggleExpand = (id) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Filter function for a single material
  const matchesFilters = (m) => {
    const q = search.toLowerCase();
    const matchSearch = !q || m.name.toLowerCase().includes(q) || (m.sku || '').toLowerCase().includes(q);
    const matchCat = !categoryFilter || m.category === categoryFilter;
    const matchStatus = !statusFilter || (() => {
      if (statusFilter === 'out-of-stock') return m.stockQty === 0 && m.procurementType !== 'on-demand';
      if (statusFilter === 'low-stock') return m.stockQty > 0 && m.stockQty < (m.minStock || 10) && m.procurementType !== 'on-demand';
      if (statusFilter === 'healthy') return m.stockQty >= (m.minStock || 10);
      if (statusFilter === 'on-demand') return m.procurementType === 'on-demand';
      return true;
    })();
    return matchSearch && matchCat && matchStatus;
  };

  // Build filtered rows: parent rows (with children if expanded) + standalone
  const filteredRows = useMemo(() => {
    const rows = [];
    // Standalone materials
    groupedMaterials.standalone.filter(matchesFilters).forEach(m => {
      rows.push({ type: 'standalone', item: m });
    });
    // Parent materials (show if parent matches OR any child matches)
    groupedMaterials.parents.forEach(parent => {
      const children = groupedMaterials.childrenMap.get(parent.id) || [];
      const parentMatches = matchesFilters(parent);
      const matchingChildren = children.filter(matchesFilters);
      // Show parent if parent matches search, or if any child matches
      if (parentMatches || matchingChildren.length > 0) {
        rows.push({
          type: 'parent',
          item: parent,
          children: matchingChildren.length > 0 ? matchingChildren : children,
          allChildrenMatch: matchingChildren.length === children.length,
        });
      }
    });
    // Sort by criticality
    rows.sort((a, b) => {
      const mA = a.item;
      const mB = b.item;
      const aCritical = mA.stockQty === 0 && mA.procurementType !== 'on-demand' ? 0 : mA.stockQty < (mA.minStock || 10) && mA.procurementType !== 'on-demand' ? 1 : 2;
      const bCritical = mB.stockQty === 0 && mB.procurementType !== 'on-demand' ? 0 : mB.stockQty < (mB.minStock || 10) && mB.procurementType !== 'on-demand' ? 1 : 2;
      return aCritical - bCritical || mA.name.localeCompare(mB.name);
    });
    return rows;
  }, [groupedMaterials, search, categoryFilter, statusFilter]);

  const totalStock = materials.reduce((s, m) => s + (m.stockQty || 0), 0);
  const outOfStock = materials.filter(m => m.stockQty === 0 && m.procurementType !== 'on-demand').length;
  const lowStock = materials.filter(m => m.stockQty > 0 && m.stockQty < (m.minStock || 10) && m.procurementType !== 'on-demand').length;
  const totalValue = materials.reduce((s, m) => s + ((m.stockQty || 0) * (m.baseCost || 0)), 0);

  return (
    <div>
      {/* Summary Cards */}
      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#22c55e' }}>{totalStock}</span>
            <span className="summary-label" style={{ color: '#22c55e' }}>Total Stock</span>
          </div>
        </div>
        <div className="summary-card summary-card-danger">
          <div className="summary-content">
            <span className="summary-value">{outOfStock}</span>
            <span className="summary-label">Out of Stock</span>
          </div>
        </div>
        <div className="summary-card summary-card-warning">
          <div className="summary-content">
            <span className="summary-value">{lowStock}</span>
            <span className="summary-label">Low Stock</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(212,168,67,0.08)', borderColor: 'rgba(212,168,67,0.3)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#D4A843', fontSize: '1rem' }}>
              ₱{totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="summary-label">Stock Value</span>
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
            <input className="search-input" placeholder="Search materials..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
          </div>
          <CustomDropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: '', label: 'All Categories' },
              ...categories.map(c => ({ value: c, label: c })),
            ]}
            placeholder="All Categories"
            style={{ minWidth: '140px' }}
          />
          <CustomDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'All Status' },
              { value: 'healthy', label: 'Healthy' },
              { value: 'low-stock', label: 'Low Stock' },
              { value: 'out-of-stock', label: 'Out of Stock' },
              { value: 'on-demand', label: 'On-Demand' },
            ]}
            placeholder="All Status"
            style={{ minWidth: '130px' }}
          />
        </div>
        <button className="btn-primary" onClick={onIssueStock} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Goods Issue
        </button>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--dark)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={thStyle}>SKU / Name</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Category</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Current Stock</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Min Stock</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Unit Cost</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Stock Value</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                  {materials.length === 0 ? 'No materials yet. Add materials in Master Data first.' : 'No materials match your filters.'}
                </td>
              </tr>
            ) : filteredRows.map((row) => {
              if (row.type === 'standalone') {
                const m = row.item;
                const stockVal = (m.stockQty || 0) * (m.baseCost || 0);
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.875rem' }}>{m.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.15rem' }}>{m.sku || '—'}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: '#E5E2E1' }}>
                      {m.category || '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: m.procurementType === 'on-demand' ? '#818cf8' : m.stockQty === 0 ? '#ef4444' : m.stockQty < (m.minStock || 10) ? '#f59e0b' : '#E5E2E1' }}>
                      {m.stockQty || 0} <span style={{ color: 'var(--gray)', fontWeight: 400 }}>{m.uom || 'pcs'}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                      {m.minStock || 10}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      ₱{(m.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>
                      ₱{stockVal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <StatusBadge stock={m.stockQty || 0} minStock={m.minStock || 10} procurementType={m.procurementType} />
                    </td>
                  </tr>
                );
              }

              // Parent row with variants
              const parent = row.item;
              const children = row.children || [];
              const isExpanded = expandedParents.has(parent.id);
              const parentStockVal = children.reduce((s, c) => s + ((c.stockQty || 0) * (c.baseCost || 0)), 0);
              const totalChildStock = children.reduce((s, c) => s + (c.stockQty || 0), 0);

              return (
                <React.Fragment key={parent.id}>
                  <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)', background: 'rgba(212,168,67,0.02)', cursor: 'pointer' }}
                    onClick={() => toggleExpand(parent.id)}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,168,67,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExpanded ? 'rgba(212,168,67,0.02)' : 'rgba(212,168,67,0.02)'}
                  >
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); toggleExpand(parent.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? '#D4A843' : 'var(--gray)', padding: 0 }}>
                          <ChevronIcon open={isExpanded} />
                        </button>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.875rem' }}>{parent.name}</span>
                            <span style={{ padding: '0.12rem 0.45rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700, background: 'rgba(212,168,67,0.15)', color: '#D4A843' }}>
                              {children.length} variants
                            </span>
                          </div>
                          {parent.variantTypes && parent.variantTypes.length > 0 && (
                            <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                              {parent.variantTypes.map(vt => `${vt.name}: ${vt.options.join(', ')}`).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#E5E2E1' }}>{parent.category || '—'}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 700, color: totalChildStock === 0 ? '#ef4444' : totalChildStock < (parent.minStock || 10) * children.length ? '#f59e0b' : '#E5E2E1' }}>
                          {totalChildStock}
                        </span>
                        <span style={{ color: 'var(--gray)', fontWeight: 400 }}> pcs total</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                      {parent.minStock || 10}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {(() => {
                        const costs = children.map(c => c.baseCost || 0).filter(c => c > 0);
                        if (costs.length === 0) return '₱0.00';
                        const min = Math.min(...costs);
                        const max = Math.max(...costs);
                        if (min === max) return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#E5E2E1' }}>
                              ₱{min.toLocaleString('en-PH', { minimumFractionDigits: 2 })} – ₱{max.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>
                      ₱{parentStockVal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <StatusBadge stock={totalChildStock} minStock={(parent.minStock || 10) * children.length} procurementType={parent.procurementType} />
                    </td>
                  </tr>
                  {isExpanded && children.map(child => {
                    const childStockVal = (child.stockQty || 0) * (child.baseCost || 0);
                    return (
                      <tr key={child.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.15)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.25)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.15)'}
                      >
                        <td style={{ padding: '0.75rem 1rem 0.75rem 2.5rem' }}>
                          <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.82rem' }}>{child.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>{child.sku || '—'}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.78rem', color: '#E5E2E1' }}>
                          {child.category || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: child.procurementType === 'on-demand' ? '#818cf8' : child.stockQty === 0 ? '#ef4444' : child.stockQty < (child.minStock || 10) ? '#f59e0b' : '#E5E2E1' }}>
                          {child.stockQty || 0} <span style={{ color: 'var(--gray)', fontWeight: 400 }}>{child.uom || 'pcs'}</span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.78rem' }}>
                          {child.minStock || 10}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          ₱{(child.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>
                          ₱{childStockVal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <StatusBadge stock={child.stockQty || 0} minStock={child.minStock || 10} procurementType={child.procurementType} />
                        </td>
                      </tr>
                    );
                  })}
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
// STOCK-OUT HISTORY TAB
// ══════════════════════════════════════════════════════════════════════════════
function StockOutHistoryTab({ stockOuts }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expandedSO, setExpandedSO] = useState(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return stockOuts
      .filter(so => {
        const matchSearch = !q
          || (so.materialName || '').toLowerCase().includes(q)
          || (so.sku || '').toLowerCase().includes(q)
          || (so.referenceNo || '').toLowerCase().includes(q);
        const matchType = !typeFilter || so.issueType === typeFilter;
        return matchSearch && matchType;
      })
      .sort((a, b) => new Date(b.dateIssued) - new Date(a.dateIssued));
  }, [stockOuts, search, typeFilter]);

  return (
    <div>
      <div className="inventory-toolbar" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ maxWidth: '280px' }}>
            <span className="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
            <input className="search-input" placeholder="Search stock-out records..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
          </div>
          <CustomDropdown
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: '', label: 'All Types' },
              ...Object.entries(ISSUE_TYPES).map(([k, v]) => ({ value: k, label: v.label })),
            ]}
            placeholder="All Types"
            style={{ minWidth: '150px' }}
          />
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--dark)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ ...thStyle, width: '40px' }}></th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Material</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Type</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Qty Deducted</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Before → After</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Unit Cost</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Loss Value</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Ref No</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                  {stockOuts.length === 0
                    ? 'No stock-out records yet. Click "Goods Issue" to deduct stock.'
                    : 'No records match your filters.'}
                </td>
              </tr>
            ) : filtered.map(so => {
              const isExpanded = expandedSO === so.id;
              return (
                <React.Fragment key={so.id}>
                  <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.875rem 0.5rem 0.875rem 1rem' }}>
                      <button
                        onClick={() => setExpandedSO(isExpanded ? null : so.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? '#D4A843' : 'var(--gray)', padding: 0 }}
                      >
                        <ChevronIcon open={isExpanded} />
                      </button>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#E5E2E1' }}>
                        {new Date(so.dateIssued).toLocaleDateString('en-PH')}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>
                        {new Date(so.dateIssued).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.825rem' }}>{so.materialName}</div>
                      {so.sku && <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{so.sku}</div>}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <IssueTypeBadge type={so.issueType} />
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#ef4444' }}>
                      -{so.quantity} <span style={{ color: 'var(--gray)', fontWeight: 400 }}>{so.uom}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: '#E5E2E1', fontFamily: 'monospace' }}>
                      {so.previousStock} → <span style={{ color: so.newStock === 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>{so.newStock}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#E5E2E1', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      ₱{(so.unitCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>
                      ₱{(so.totalLoss || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--gray)', fontFamily: 'monospace' }}>
                      {so.referenceNo || '—'}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr style={{ background: 'rgba(0,0,0,0.12)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td colSpan={9} style={{ padding: '1rem 1rem 1rem 3.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '0.75rem' }}>
                          <div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Issue Type</div>
                            <IssueTypeBadge type={so.issueType} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Total Loss Value</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>
                              ₱{(so.totalLoss || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                        {so.notes && (
                          <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--gray)', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                            <strong style={{ color: '#E5E2E1' }}>Notes: </strong>{so.notes}
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
// ACTUAL STOCK TAB (Physical Count with Damage Reconciliation)
// ══════════════════════════════════════════════════════════════════════════════
function ActualStockTab({ materials }) {
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Load saved counts from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pmp_actual_stock') || '{}');
      setCounts(saved);
    } catch {
      setCounts({});
    }
  }, []);

  // Handler for inputs
  const handleCountChange = (id, field, val) => {
    const num = parseInt(val) || 0;
    const newCounts = { ...counts, [id]: { ...counts[id], [field]: num } };
    setCounts(newCounts);
    localStorage.setItem('pmp_actual_stock', JSON.stringify(newCounts));
  };

  // Stats
  const totalDamagedDetected = Object.values(counts).reduce((acc, c) => acc + (c.damaged || 0), 0);
  const totalShortage = Object.entries(counts).reduce((acc, [id, c]) => {
    const mat = materials.find(m => m.id === id);
    const diff = (c.good || 0) - (mat?.stockQty || 0);
    return acc + (diff < 0 ? Math.abs(diff) : 0);
  }, 0);

  // Filter materials (Parents only)
  const categories = [...new Set(materials.filter(m => !m.parentId).map(m => m.category).filter(Boolean))];
  const filtered = materials.filter(m => {
    if (m.parentId) return false; 
    if (categoryFilter && m.category !== categoryFilter) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !(m.sku||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const inputStyle = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px', color: '#E5E2E1', padding: '0.4rem', width: '60px',
    textAlign: 'center', fontSize: '0.85rem', outline: 'none'
  };

  return (
    <div>
      {/* Summary Cards for Damage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.7rem', color: '#F87171', textTransform: 'uppercase', fontWeight: 700 }}>Detected Damaged</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F87171' }}>{totalDamagedDetected} units</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>Found during physical count</div>
        </div>
        <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.7rem', color: '#F59E0B', textTransform: 'uppercase', fontWeight: 700 }}>Shortage (Missing)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B' }}>{totalShortage} units</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>System vs Actual difference</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search materials..."
            style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '8px', color: '#E5E2E1', outline: 'none' }} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </div>
        <CustomDropdown value={categoryFilter} onChange={setCategoryFilter}
          options={[{ value: '', label: 'All Categories' }, ...categories.map(c => ({ value: c, label: c }))]}
          placeholder="All Categories" style={{ minWidth: '150px' }} />
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--dark)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>SKU / Name</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', width: '100px' }}>Sys Good</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#22c55e', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', width: '110px' }}>Actual Good</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#ef4444', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', width: '110px' }}>Actual Dmg</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gold)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', width: '100px' }}>Total</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', width: '100px' }}>Variance</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', width: '100px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((mat) => {
              const sysGood = mat.stockQty || 0;
              const recGood = counts[mat.id]?.good ?? '';
              const recDmg = counts[mat.id]?.damaged ?? '';
              const totalAct = (parseInt(recGood) || 0) + (parseInt(recDmg) || 0);
              
              // Variance logic: Actual Good vs System Good
              const diff = (parseInt(recGood) || 0) - sysGood;
              const varianceDisplay = recGood === '' ? '—' : (diff > 0 ? `+${diff}` : `${diff}`);
              
              // Status Logic
              let status = 'Pending';
              let statusColor = 'var(--gray)';
              
              if (recGood !== '' || recDmg !== '') {
                if (recDmg > 0 && diff === 0) { status = 'Damaged Found'; statusColor = '#F87171'; }
                else if (recDmg > 0 && diff < 0) { status = 'Damaged + Short'; statusColor = '#EF4444'; }
                else if (diff < 0) { status = 'Shortage'; statusColor = '#F59E0B'; }
                else if (diff > 0) { status = 'Overage'; statusColor = '#3B82F6'; }
                else { status = 'Matched'; statusColor = '#22C55E'; }
              }

              return (
                <tr key={mat.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: '#E5E2E1' }}>{mat.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{mat.sku}</div>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', color: '#E5E2E1', fontWeight: 600 }}>
                    {sysGood}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                    <input type="number" value={recGood} onChange={e => handleCountChange(mat.id, 'good', e.target.value)}
                      placeholder={sysGood} min="0" style={inputStyle} />
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                    <input type="number" value={recDmg} onChange={e => handleCountChange(mat.id, 'damaged', e.target.value)}
                      placeholder="0" min="0" style={{...inputStyle, borderColor: recDmg > 0 ? '#ef4444' : 'rgba(255,255,255,0.1)'}} />
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#D4A843' }}>
                    {recGood !== '' || recDmg !== '' ? totalAct : '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: statusColor }}>
                    {varianceDisplay}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusColor, textTransform: 'uppercase' }}>
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: '#f59e0b' }}>
        <strong>Guide:</strong> 
        1. Count good items & put in "Actual Good". 
        2. Count faulty items & put in "Actual Dmg". 
        3. "Variance" compares Actual Good vs System Good.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function StocksPage() {
  const [activeTab,     setActiveTab]     = useState('goods');
  const [materials,     setMaterials]     = useState([]);
  const [stockOuts,     setStockOuts]     = useState([]);
  const [showIssueForm, setShowIssueForm] = useState(false);

  const refresh = useCallback(() => {
    setMaterials(getStore(MATERIALS_KEY));
    setStockOuts(getStore(STOCK_OUT_KEY));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Goods Issue Handler ──────────────────────────────────────────────────────
  const handleGoodsIssue = (soData) => {
    const mats = getStore(MATERIALS_KEY);
    const updatedMats = mats.map(m => {
      if (m.id !== soData.materialId) return m;
      return {
        ...m,
        stockQty:  soData.newStock,
        updatedAt: new Date().toISOString(),
      };
    });
    setStore(MATERIALS_KEY, updatedMats);

    // Save to stock-out log
    const log = getStore(STOCK_OUT_KEY);
    const newEntry = {
      ...soData,
      id: `so-${Date.now()}`,
      soNumber: genDocNumber('SO', log),
      createdAt: new Date().toISOString(),
    };
    setStore(STOCK_OUT_KEY, [...log, newEntry]);

    setShowIssueForm(false);
    refresh();
  };

  // ── Summary Stats ────────────────────────────────────────────────────────────
  const totalStockOuts = stockOuts.length;
  const totalLossValue = stockOuts.reduce((s, so) => s + (so.totalLoss || 0), 0);
  const damageCount = stockOuts.filter(so => so.issueType === 'damage').length;
  const scrapCount = stockOuts.filter(so => so.issueType === 'scrap').length;

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
            <h1 className="page-title">Stocks</h1>
            <p className="page-subtitle">Monitor stock levels, track movements, and manage goods issues.</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '0.25rem', width: 'fit-content' }}>
          <button style={tabStyle('goods')} onClick={() => setActiveTab('goods')}>Goods Stock</button>
          <button style={tabStyle('actual')} onClick={() => setActiveTab('actual')}>Actual Stock</button>
          <button style={tabStyle('history')} onClick={() => setActiveTab('history')}>Stock-Out History</button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'goods' && (
        <StockOverviewTab
          materials={materials}
          onIssueStock={() => setShowIssueForm(true)}
        />
      )}
      {activeTab === 'actual' && (
        <ActualStockTab materials={materials} />
      )}
      {activeTab === 'history' && (
        <StockOutHistoryTab stockOuts={stockOuts} />
      )}

      {/* Goods Issue Modal */}
      {showIssueForm && (
        <GoodsIssueModal
          materials={materials}
          onClose={() => setShowIssueForm(false)}
          onSave={handleGoodsIssue}
        />
      )}
    </div>
  );
}
