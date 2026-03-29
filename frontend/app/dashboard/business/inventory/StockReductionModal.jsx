'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { formatPrice } from '../../../../src/utils/format';

// ── Base product name extractor ───────────────────────────────────────────────
function extractBaseProductName(fullName) {
  const patterns = [
    /\s+[A-Za-z]+\s*\/\s*\d+oz.*$/i,
    /\s+[A-Za-z]+\s*\/\s*\d+ml.*$/i,
    /\s+\d+oz\s*\/.*$/i,
    /\s+\d+ml\s*\/.*$/i,
  ];
  for (const pattern of patterns) {
    const match = fullName.match(pattern);
    if (match) return fullName.substring(0, match.index).trim();
  }
  return fullName.trim();
}

function extractVariantName(fullName, baseProductName) {
  return fullName.replace(baseProductName, '').trim().replace(/^[\s\/-]+/, '').trim();
}

// ── Integer Input ─────────────────────────────────────────────────────────────
function IntegerInput({ value, onChange, min = 0, max, placeholder = '0', style, disabled, autoFocus }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      const numVal = val === '' ? 0 : parseInt(val, 10);
      if (max !== undefined && numVal > max) return;
      if (numVal < min) return;
      onChange(val);
    }
  };
  const handleKeyDown = (e) => {
    if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
  };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="numeric"
      pattern="[0-9]*"
      style={style}
    />
  );
}

// ── Decimal Input ─────────────────────────────────────────────────────────────
function DecimalInput({ value, onChange, placeholder = '0.00', style, disabled }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || (/^\d+\.?\d{0,2}$/.test(val) && !val.endsWith('.'))) {
      const numVal = parseFloat(val) || 0;
      if (numVal <= 999999.99) onChange(val);
    }
  };
  const handleKeyDown = (e) => {
    if (['e', 'E', '+', '-', ' '].includes(e.key)) e.preventDefault();
  };
  const handleWheel = (e) => { if (document.activeElement === e.target) e.target.blur(); };

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      placeholder={placeholder}
      disabled={disabled}
      inputMode="decimal"
      style={style}
    />
  );
}

// ── Info Modal ────────────────────────────────────────────────────────────────
function InfoModal({ isOpen, onClose, title, message }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="delete-confirm-text">{message}</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconFifo = ({ color = '#D4A843', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const IconBatch = ({ color = '#D4A843', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconWarning = ({ color = '#fbbf24', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconCheck = ({ color = '#4ade80', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── Damage type options ───────────────────────────────────────────────────────
const DAMAGE_TYPES = [
  { value: 'broken',    label: 'Broken / Cracked' },
  { value: 'defective', label: 'Defective / QC Fail' },
  { value: 'expired',   label: 'Expired' },
  { value: 'lost',      label: 'Lost / Missing' },
  { value: 'other',     label: 'Other' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function StockReductionModal({ isOpen, onClose, onConfirm, item, inventory }) {

  const [batchMode, setBatchMode]   = useState('fifo');
  const [reason, setReason]         = useState('sales-outside');
  const [saleDate, setSaleDate]     = useState(new Date().toISOString().split('T')[0]);
  const [customer, setCustomer]     = useState('');
  const [remarks, setRemarks]       = useState('');

  const [variants, setVariants]                 = useState([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState([]);
  const [variantQtys, setVariantQtys]           = useState({});   // { id: '10' }
  const [sellingPrices, setSellingPrices]       = useState({});   // { id: '250.00' }
  const [damageTypes, setDamageTypes]           = useState({});   // { id: 'broken' }
  const [pickedBatchQtys, setPickedBatchQtys]   = useState({});   // { variantId: { batchKey: qty } }

  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending]         = useState(null);
  const [infoModal, setInfoModal]     = useState(null);

  const isDamaged   = reason === 'damaged';
  const accentColor  = isDamaged ? '#ef4444' : '#D4A843';
  const accentBg     = isDamaged ? 'rgba(239,68,68,0.12)' : 'rgba(212,168,67,0.12)';
  const accentBorder = isDamaged ? 'rgba(239,68,68,0.4)'  : 'rgba(212,168,67,0.4)';

  // ── Load variants ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !item) return;
    const baseName      = extractBaseProductName(item.name);
    const itemSkuPrefix = item.sku?.split('-').slice(0, 3).join('-');

    const productVariants = (inventory || [])
      .filter(inv => {
        if (inv.isActive === false) return false;
        const invBase = extractBaseProductName(inv.name);
        if (invBase.toLowerCase() === baseName.toLowerCase()) return true;
        const invSkuPrefix = inv.sku?.split('-').slice(0, 3).join('-');
        return itemSkuPrefix && invSkuPrefix && itemSkuPrefix === invSkuPrefix;
      })
      .map(inv => ({
        id: inv.id,
        fullName: inv.name,
        variantName: extractVariantName(inv.name, baseName) || inv.name,
        sku: inv.sku,
        stock: inv.stockQty || 0,
        category: inv.category,
        batches: (inv.batches || [])
          .filter(b => (b.remainingQty || 0) > 0)
          .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived)),
      }));

    setVariants(
      productVariants.length > 0
        ? productVariants
        : [{
            id: item.id,
            fullName: item.name,
            variantName: extractVariantName(item.name, baseName) || item.name,
            sku: item.sku,
            stock: item.stockQty || 0,
            category: item.category,
            batches: (item.batches || [])
              .filter(b => (b.remainingQty || 0) > 0)
              .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived)),
          }]
    );
  }, [isOpen, item, inventory]);

  // ── Reset on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setBatchMode('fifo');
      setReason('sales-outside');
      setSaleDate(new Date().toISOString().split('T')[0]);
      setCustomer('');
      setRemarks('');
      setSelectedVariantIds([]);
      setVariantQtys({});
      setSellingPrices({});
      setDamageTypes({});
      setPickedBatchQtys({});
      setShowConfirm(false);
      setPending(null);
    }
  }, [isOpen]);

  // ── FIFO calculation ──────────────────────────────────────────────────────
  const fifoCalculation = useMemo(() => {
    const result = {};
    selectedVariantIds.forEach(variantId => {
      const variant = variants.find(v => v.id === variantId);
      const qty = parseInt(variantQtys[variantId]) || 0;
      if (!variant || qty <= 0) return;

      const consumption = [];
      let remaining = qty;
      for (const batch of variant.batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.remainingQty);
        consumption.push({
          batchId:        batch.batchId,
          batchDate:      batch.dateReceived,
          invoiceNumber:  batch.invoiceNumber,
          supplierId:     batch.supplierId,
          take,
          unitCost:       batch.unitCost || 0,
          totalCost:      take * (batch.unitCost || 0),
          remainingAfter: batch.remainingQty - take,
        });
        remaining -= take;
      }

      result[variantId] = {
        variantId,
        variantName:    variant.variantName,
        sku:            variant.sku,
        qtyRequested:   qty,
        qtyFulfilled:   qty - remaining,
        unfulfilledQty: remaining,
        totalCostValue: consumption.reduce((s, c) => s + c.totalCost, 0),
        consumption,
      };
    });
    return result;
  }, [selectedVariantIds, variantQtys, variants]);

  // ── Pick-batch calculation ────────────────────────────────────────────────
  const pickCalculation = useMemo(() => {
    const result = {};
    selectedVariantIds.forEach(variantId => {
      const variant = variants.find(v => v.id === variantId);
      const totalQtyNeeded = parseInt(variantQtys[variantId]) || 0;
      if (!variant || totalQtyNeeded <= 0) return;

      const pickedForVariant = pickedBatchQtys[variantId] || {};
      let totalAssigned = 0;
      const consumption = [];

      variant.batches.forEach(batch => {
        const qtyFromBatch = parseInt(pickedForVariant[batch.batchId]) || 0;
        if (qtyFromBatch <= 0) return;
        const safeTake = Math.min(qtyFromBatch, batch.remainingQty);
        totalAssigned += safeTake;
        consumption.push({
          batchId:        batch.batchId,
          batchDate:      batch.dateReceived,
          invoiceNumber:  batch.invoiceNumber,
          supplierId:     batch.supplierId,
          take:           safeTake,
          unitCost:       batch.unitCost || 0,
          totalCost:      safeTake * (batch.unitCost || 0),
          remainingAfter: batch.remainingQty - safeTake,
        });
      });

      result[variantId] = {
        variantId,
        variantName:   variant.variantName,
        sku:           variant.sku,
        qtyRequested:  totalQtyNeeded,
        qtyAssigned:   totalAssigned,
        stillNeeded:   Math.max(0, totalQtyNeeded - totalAssigned),
        fullyAssigned: totalAssigned >= totalQtyNeeded,
        totalCostValue: consumption.reduce((s, c) => s + c.totalCost, 0),
        consumption,
      };
    });
    return result;
  }, [selectedVariantIds, variantQtys, variants, pickedBatchQtys]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let totalQty = 0, totalCostValue = 0, totalRevenue = 0;
    const calc = batchMode === 'fifo' ? fifoCalculation : pickCalculation;

    selectedVariantIds.forEach(variantId => {
      const c = calc[variantId];
      if (!c) return;
      const fulfilled = batchMode === 'fifo' ? (c.qtyFulfilled || 0) : (c.qtyAssigned || 0);
      totalQty       += fulfilled;
      totalCostValue += c.totalCostValue || 0;
      if (!isDamaged) {
        const price = parseFloat(sellingPrices[variantId]) || 0;
        totalRevenue += fulfilled * price;
      }
    });

    return { totalQty, totalCostValue, totalRevenue };
  }, [batchMode, selectedVariantIds, fifoCalculation, pickCalculation, isDamaged, sellingPrices]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toggleVariant = (variantId) => {
    setSelectedVariantIds(prev =>
      prev.includes(variantId) ? prev.filter(id => id !== variantId) : [...prev, variantId]
    );
  };

  const updatePickedBatchQty = (variantId, batchId, qty) => {
    setPickedBatchQtys(prev => ({
      ...prev,
      [variantId]: { ...(prev[variantId] || {}), [batchId]: qty },
    }));
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validateForm = () => {
    if (selectedVariantIds.length === 0) {
      setInfoModal({ title: 'Validation Error', message: 'Please select at least one variant.' });
      return false;
    }
    for (const variantId of selectedVariantIds) {
      const qty     = parseInt(variantQtys[variantId]) || 0;
      const variant = variants.find(v => v.id === variantId);
      if (qty <= 0) {
        setInfoModal({ title: 'Validation Error', message: 'Please enter a quantity greater than 0 for all selected variants.' });
        return false;
      }
      if (variant && qty > variant.stock) {
        setInfoModal({ title: 'Validation Error', message: `Quantity exceeds available stock for ${variant.variantName}.` });
        return false;
      }
      if (batchMode === 'fifo') {
        const fifo = fifoCalculation[variantId];
        if (fifo && fifo.unfulfilledQty > 0) {
          setInfoModal({ title: 'Validation Error', message: `Insufficient batch stock for ${variant?.variantName}. ${fifo.unfulfilledQty} pcs cannot be fulfilled from available batches.` });
          return false;
        }
      }
      if (batchMode === 'pick') {
        const pick = pickCalculation[variantId];
        if (!pick || !pick.fullyAssigned) {
          setInfoModal({ title: 'Validation Error', message: `Please fully assign batches for ${variant?.variantName}. Still need ${pick?.stillNeeded || qty} pcs.` });
          return false;
        }
      }
      if (!isDamaged) {
        const price = parseFloat(sellingPrices[variantId]) || 0;
        if (price <= 0) {
          setInfoModal({ title: 'Validation Error', message: `Please enter a selling price for ${variant?.variantName}.` });
          return false;
        }
      }
    }
    return true;
  };

  // ── Submit / Confirm ──────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!validateForm()) return;

    const calc = batchMode === 'fifo' ? fifoCalculation : pickCalculation;

    const reductionData = {
      batchMode,
      reason,
      saleDate:  !isDamaged ? saleDate : null,
      customer:  !isDamaged ? customer : null,
      remarks:   isDamaged  ? remarks  : null,
      variants: selectedVariantIds.map(variantId => {
        const variant  = variants.find(v => v.id === variantId);
        const c        = calc[variantId];
        const fulfilled = batchMode === 'fifo' ? (c?.qtyFulfilled || 0) : (c?.qtyAssigned || 0);
        return {
          variantId,
          variantName:    variant?.variantName,
          sku:            variant?.sku,
          qtyRequested:   parseInt(variantQtys[variantId]) || 0,
          qtyFulfilled:   fulfilled,
          sellingPrice:   !isDamaged ? (parseFloat(sellingPrices[variantId]) || 0) : 0,
          damageType:     isDamaged  ? (damageTypes[variantId] || 'other') : null,
          batches:        c?.consumption || [],
          totalCostValue: c?.totalCostValue || 0,
        };
      }),
      totals,
    };

    setPending(reductionData);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    try {
      onConfirm(pending);
      setShowConfirm(false);
      setPending(null);
      onClose();
    } catch (error) {
      console.error('Stock reduction error:', error);
      setInfoModal({ title: 'Error', message: error.message || 'Failed to process stock reduction. Please try again.' });
    }
  };

  if (!isOpen || !item) return null;

  const baseName          = extractBaseProductName(item.name);
  const totalCurrentStock = variants.reduce((s, v) => s + v.stock, 0);
  const hasSelection      = selectedVariantIds.length > 0 && totals.totalQty > 0;

  // ── Shared styles (matching + modal pattern) ──────────────────────────────
  const panelLabel = {
    fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', display: 'block',
  };

  const thStyle = {
    padding: '0.875rem 1rem', textAlign: 'left',
    fontSize: '0.65rem', fontWeight: 700, color: 'var(--gray)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
  };

  // ── FIFO breakdown table ──────────────────────────────────────────────────
  const renderFifoBreakdown = () => {
    const entries = Object.values(fifoCalculation).filter(f => f.consumption.length > 0);
    if (entries.length === 0) return null;
    return (
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(212,168,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconFifo size={15} color="#D4A843" />
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E5E2E1' }}>Batch Consumption — Auto FIFO</span>
        </div>

        {entries.map(fifo => (
          <div key={fifo.variantId} style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.78rem', color: '#E5E2E1', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {fifo.variantName}
              {fifo.unfulfilledQty > 0 && (
                <span style={{ color: '#ef4444', fontWeight: 400, fontSize: '0.72rem' }}>
                  — {fifo.unfulfilledQty} pcs unfulfilled
                </span>
              )}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['Batch ID', 'Taking', 'Remaining', 'Unit Cost', 'Cost Value'].map((h, i) => (
                      <th key={h} style={{ ...thStyle, padding: '0.6rem 0.75rem', textAlign: i > 0 ? 'center' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fifo.consumption.map((c, ci) => (
                    <tr key={c.batchId} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: ci % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        <div style={{ fontFamily: 'monospace', color: '#D4A843', fontWeight: 700, fontSize: '0.8rem' }}>{c.batchId}</div>
                        {c.invoiceNumber && <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '1px' }}>INV: {c.invoiceNumber}</div>}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 700, color: isDamaged ? '#fca5a5' : '#fbbf24' }}>{c.take} pcs</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--gray)' }}>{c.remainingAfter} pcs</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--gray)' }}>₱{formatPrice(c.unitCost)}</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#facc15' }}>₱{formatPrice(c.totalCost)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(0,0,0,0.15)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <td colSpan={4} style={{ padding: '0.55rem 0.75rem', fontSize: '0.72rem', color: 'var(--gray)' }}>
                      Total cost {isDamaged ? 'written off' : 'removed'}
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#facc15' }}>
                      ₱{formatPrice(fifo.totalCostValue)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Pick-batch cards ──────────────────────────────────────────────────────
  const renderPickBatchCards = () => {
    const selected = selectedVariantIds.filter(id => (parseInt(variantQtys[id]) || 0) > 0);
    if (selected.length === 0) return null;

    return (
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(212,168,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconBatch size={15} color="#D4A843" />
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E5E2E1' }}>Pick Batches Manually</span>
        </div>

        {selected.map(variantId => {
          const variant = variants.find(v => v.id === variantId);
          const pick    = pickCalculation[variantId];
          if (!variant) return null;

          return (
            <div key={variantId} style={{ marginBottom: '1.5rem' }}>
              {/* Variant header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#E5E2E1' }}>{variant.variantName}</span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, letterSpacing: 0,
                  color: pick?.fullyAssigned ? '#4ade80' : '#fbbf24',
                }}>
                  {pick?.qtyAssigned || 0} / {variantQtys[variantId] || 0} pcs assigned
                </span>
              </div>

              {/* Warning */}
              {pick && !pick.fullyAssigned && pick.stillNeeded > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px', padding: '0.6rem 0.875rem', marginBottom: '0.625rem', fontSize: '0.77rem', color: '#fbbf24' }}>
                  <div style={{ flexShrink: 0, marginTop: '1px' }}><IconWarning /></div>
                  <div>Still need <strong>{pick.stillNeeded} pcs</strong> — pick another batch or switch to <strong>Auto FIFO</strong>.</div>
                </div>
              )}

              {/* Fully assigned */}
              {pick?.fullyAssigned && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '8px', padding: '0.55rem 0.875rem', marginBottom: '0.625rem', fontSize: '0.77rem', color: '#4ade80' }}>
                  <IconCheck />
                  Fully assigned — {pick.qtyAssigned} pcs across {pick.consumption.length} batch{pick.consumption.length !== 1 ? 'es' : ''}
                </div>
              )}

              {/* Batch cards */}
              {variant.batches.map(batch => {
                const pickedQty  = parseInt((pickedBatchQtys[variantId] || {})[batch.batchId]) || 0;
                const isPicked   = pickedQty > 0;
                const costValue  = pickedQty * (batch.unitCost || 0);

                return (
                  <div key={batch.batchId} style={{
                    borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '0.5rem',
                    border: isPicked ? `1px solid ${accentColor}` : '1px solid rgba(255,255,255,0.07)',
                    background: isPicked ? accentBg : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'monospace', color: '#D4A843', fontWeight: 700, fontSize: '0.82rem' }}>{batch.batchId}</span>
                        {isPicked && (
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: accentColor, background: accentBg, padding: '2px 8px', borderRadius: '10px', border: `1px solid ${accentBorder}` }}>
                            Selected
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ade80' }}>{batch.remainingQty} pcs avail.</span>
                    </div>

                    <div style={{ display: 'flex', gap: '14px', fontSize: '0.71rem', color: 'var(--gray)', marginBottom: '8px' }}>
                      {batch.dateReceived && <span>Rcvd: {new Date(batch.dateReceived).toLocaleDateString()}</span>}
                      <span>Unit Cost: <strong style={{ color: '#facc15' }}>₱{formatPrice(batch.unitCost || 0)}</strong></span>
                      {batch.invoiceNumber && <span>INV: {batch.invoiceNumber}</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--gray)', flexShrink: 0 }}>Qty from batch:</span>
                      <IntegerInput
                        value={(pickedBatchQtys[variantId] || {})[batch.batchId] || ''}
                        onChange={val => updatePickedBatchQty(variantId, batch.batchId, val)}
                        min={0}
                        max={batch.remainingQty}
                        placeholder="0"
                        style={{
                          width: '60px', textAlign: 'center', fontWeight: 700,
                          background: 'rgba(255,255,255,0.06)',
                          border: `1px solid ${isPicked ? accentColor : 'rgba(255,255,255,0.12)'}`,
                          borderRadius: '7px',
                          color: isPicked ? accentColor : '#E5E2E1',
                          padding: '0.4rem 0.25rem', fontSize: '0.85rem', outline: 'none',
                        }}
                      />
                      {isPicked && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                          = <strong style={{ color: '#facc15' }}>₱{formatPrice(costValue)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Assignment summary bar */}
              {pick && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.875rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                    Assigned: <strong style={{ color: pick.fullyAssigned ? '#4ade80' : '#fbbf24' }}>{pick.qtyAssigned} / {variantQtys[variantId]} pcs</strong>
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                    Cost value: <strong style={{ color: '#facc15' }}>₱{formatPrice(pick.totalCostValue)}</strong>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Right panel: Summary box ──────────────────────────────────────────────
  const renderSummary = () => {
    if (totals.totalQty <= 0) return null;
    const grossProfit = totals.totalRevenue - totals.totalCostValue;

    return (
      <div style={{
        padding: '1rem 1.125rem', borderRadius: '10px', marginTop: '1.25rem',
        background: isDamaged ? 'rgba(239,68,68,0.07)' : 'rgba(212,168,67,0.07)',
        border: `1px solid ${isDamaged ? 'rgba(239,68,68,0.2)' : 'rgba(212,168,67,0.18)'}`,
      }}>
        <div style={{ ...panelLabel, marginBottom: '0.75rem' }}>Summary</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Total qty {isDamaged ? 'written off' : 'removed'}</span>
          <span style={{ fontWeight: 700, color: '#E5E2E1' }}>{totals.totalQty} pcs</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: isDamaged ? 0 : '0.45rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Cost value {isDamaged ? 'lost' : 'removed'}</span>
          <span style={{ fontWeight: 700, color: isDamaged ? '#f87171' : '#facc15' }}>₱{formatPrice(totals.totalCostValue)}</span>
        </div>

        {!isDamaged && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.5rem', marginTop: '0.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Revenue recorded</span>
              <span style={{ fontWeight: 700, color: '#4ade80' }}>₱{formatPrice(totals.totalRevenue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Gross profit</span>
              <span style={{ fontWeight: 700, color: grossProfit >= 0 ? '#4ade80' : '#ef4444' }}>
                ₱{formatPrice(grossProfit)}
              </span>
            </div>
          </div>
        )}

        {isDamaged && (
          <div style={{ marginTop: '0.75rem', padding: '0.45rem 0.75rem', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.63rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              No revenue — write-off only
            </span>
          </div>
        )}
      </div>
    );
  };

  // ── Footer submit button disabled state ───────────────────────────────────
  const isSubmitDisabled = totals.totalQty <= 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ maxWidth: '1100px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#0E0E0E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div style={{ padding: '1.5rem 2rem', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#131313', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.62rem', color: accentColor, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.35rem', fontWeight: 600 }}>
              Inventory Management
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E5E2E1', margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Reduce Stock — {baseName}
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.4rem' }}>
              {item.category} · Current stock:{' '}
              <strong style={{ color: accentColor }}>{totalCurrentStock} pcs</strong>
            </div>
          </div>

          {/* Mode toggle + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* FIFO / Pick buttons */}
            {[
              { mode: 'fifo', label: 'Auto FIFO', Icon: IconFifo },
              { mode: 'pick', label: 'Pick Batch', Icon: IconBatch },
            ].map(({ mode, label, Icon }) => {
              const active = batchMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBatchMode(mode)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.5rem 0.875rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.2s',
                    border: active ? `2px solid ${accentColor}` : '1px solid rgba(255,255,255,0.1)',
                    background: active ? accentBg : 'rgba(255,255,255,0.04)',
                    color: active ? accentColor : 'var(--gray)',
                  }}
                >
                  <Icon color={active ? accentColor : 'var(--gray)'} size={14} />
                  {label}
                </button>
              );
            })}

            {/* Close */}
            <button
              onClick={onClose}
              style={{ marginLeft: '0.25rem', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', color: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--gray)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* ── BODY ───────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 0, overflow: 'hidden' }}>

          {/* LEFT PANEL */}
          <div style={{ padding: '1.5rem 2rem', overflowY: 'auto', background: '#0E0E0E' }}>

            {/* Panel title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2">
                  <path d="M20 12V22H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {isDamaged ? 'Write-off Entry' : 'Sales Entry'}
                </div>
                <div style={{ fontSize: '0.7rem', color: accentColor, fontWeight: 600 }}>
                  {variants.length} Variant{variants.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Mode hint */}
            <div style={{
              fontSize: '0.75rem', borderRadius: '8px', padding: '0.6rem 0.875rem', marginBottom: '1.25rem',
              color: batchMode === 'fifo' ? '#facc15' : '#9ca3af',
              background: batchMode === 'fifo' ? 'rgba(212,168,67,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${batchMode === 'fifo' ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.07)'}`,
            }}>
              {batchMode === 'fifo'
                ? 'Auto FIFO — system pulls from oldest batches first. Review the breakdown below.'
                : 'Pick Batch — manually choose which batch(es) to pull from per variant.'}
            </div>

            {/* Variant table */}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '0.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ ...thStyle, width: '40px', textAlign: 'center' }}></th>
                    <th style={thStyle}>Variant</th>
                    <th style={{ ...thStyle, textAlign: 'center', width: '80px' }}>Stock</th>
                    <th style={{ ...thStyle, textAlign: 'center', width: '100px' }}>
                      {isDamaged ? 'Write-off Qty' : 'Reduce Qty'}
                    </th>
                    <th style={{ ...thStyle, textAlign: 'center', width: '90px' }}>Remaining</th>
                    {!isDamaged && <th style={{ ...thStyle, textAlign: 'center', width: '120px' }}>Selling Price</th>}
                    {isDamaged  && <th style={{ ...thStyle, textAlign: 'center', width: '150px' }}>Damage Type</th>}
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant, idx) => {
                    const isSelected = selectedVariantIds.includes(variant.id);
                    const qty        = parseInt(variantQtys[variant.id]) || 0;
                    const remaining  = variant.stock - qty;
                    const overLimit  = qty > variant.stock;

                    return (
                      <tr
                        key={variant.id}
                        style={{
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          opacity: isSelected ? 1 : 0.55,
                          transition: 'opacity 0.2s',
                          borderLeft: isSelected ? `3px solid ${accentColor}` : '3px solid transparent',
                        }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '1rem 0.5rem', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleVariant(variant.id)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor }}
                          />
                        </td>

                        {/* Variant info */}
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{variant.variantName}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>SKU: {variant.sku}</div>
                        </td>

                        {/* Stock */}
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#D4A843' }}>{variant.stock}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: '3px' }}>pcs</span>
                        </td>

                        {/* Qty input */}
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                          {isSelected ? (
                            <IntegerInput
                              value={variantQtys[variant.id] || ''}
                              onChange={val => setVariantQtys(prev => ({ ...prev, [variant.id]: val }))}
                              min={1}
                              max={variant.stock}
                              placeholder="0"
                              style={{
                                width: '68px', textAlign: 'center', fontWeight: 700,
                                background: 'rgba(255,255,255,0.06)',
                                border: `1px solid ${overLimit ? 'rgba(239,68,68,0.6)' : isDamaged ? 'rgba(239,68,68,0.5)' : 'rgba(212,168,67,0.6)'}`,
                                borderRadius: '7px',
                                color: overLimit ? '#fca5a5' : '#E5E2E1',
                                padding: '0.45rem 0.25rem', fontSize: '0.85rem', outline: 'none',
                              }}
                            />
                          ) : (
                            <span style={{ color: 'var(--gray)' }}>—</span>
                          )}
                        </td>

                        {/* Remaining */}
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                          {isSelected && qty > 0 ? (
                            <span style={{ fontWeight: 700, color: overLimit ? '#ef4444' : '#4ade80', fontSize: '0.85rem' }}>
                              {remaining} pcs
                            </span>
                          ) : <span style={{ color: 'var(--gray)' }}>—</span>}
                        </td>

                        {/* Selling price */}
                        {!isDamaged && (
                          <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                            {isSelected ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '0.38rem 0.5rem' }}>
                                <span style={{ fontSize: '0.72rem', color: '#D4A843', fontWeight: 700 }}>₱</span>
                                <DecimalInput
                                  value={sellingPrices[variant.id] || ''}
                                  onChange={val => setSellingPrices(prev => ({ ...prev, [variant.id]: val }))}
                                  placeholder="0.00"
                                  style={{ width: '68px', background: 'none', border: 'none', color: '#E5E2E1', fontSize: '0.85rem', textAlign: 'center', outline: 'none', fontWeight: 600 }}
                                />
                              </div>
                            ) : <span style={{ color: 'var(--gray)' }}>—</span>}
                          </td>
                        )}

                        {/* Damage type */}
                        {isDamaged && (
                          <td style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                            {isSelected ? (
                              <select
                                value={damageTypes[variant.id] || 'broken'}
                                onChange={e => setDamageTypes(prev => ({ ...prev, [variant.id]: e.target.value }))}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: '#E5E2E1', fontSize: '0.75rem', padding: '0.4rem 0.5rem', cursor: 'pointer', width: '100%' }}
                              >
                                {DAMAGE_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                              </select>
                            ) : <span style={{ color: 'var(--gray)' }}>—</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary cards (matching + modal) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
              <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>
                  Total Qty {isDamaged ? 'Written Off' : 'Reduced'}
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#E5E2E1', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {totals.totalQty} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span>
                </div>
              </div>
              <div style={{ padding: '1rem', background: isDamaged ? 'rgba(239,68,68,0.06)' : 'rgba(250,204,21,0.05)', border: `1px solid ${isDamaged ? 'rgba(239,68,68,0.2)' : 'rgba(250,204,21,0.15)'}`, borderRadius: '10px' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>
                  Cost Value {isDamaged ? 'Lost' : 'Removed'}
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isDamaged ? '#f87171' : '#facc15', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  ₱{formatPrice(totals.totalCostValue)}
                </div>
              </div>
            </div>

            {/* Batch breakdown */}
            {batchMode === 'fifo' && renderFifoBreakdown()}
            {batchMode === 'pick' && renderPickBatchCards()}
          </div>

          {/* RIGHT PANEL */}
          <div style={{ padding: '1.5rem 1.75rem', background: '#131313', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>

            {/* Panel title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {isDamaged ? 'Write-off Details' : 'Sale Details'}
                </div>
              </div>
            </div>

            {/* Reason toggle */}
            <div>
              <label style={panelLabel}>Reason</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem' }}>
                {[
                  { val: 'sales-outside', label: 'Manual Sale',       color: '#D4A843', bg: 'rgba(212,168,67,0.12)' },
                  { val: 'damaged',       label: 'Damaged / Write-off', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
                ].map(({ val, label, color, bg }) => {
                  const active = reason === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setReason(val)}
                      style={{
                        flex: 1, padding: '0.625rem', borderRadius: '8px', fontSize: '0.75rem',
                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center',
                        border: active ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.1)',
                        background: active ? bg : 'rgba(255,255,255,0.04)',
                        color: active ? color : 'var(--gray)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: '0.72rem', color: isDamaged ? '#f87171' : '#facc15', marginBottom: '1.25rem' }}>
                {isDamaged
                  ? 'Stock will be written off. No sales record created.'
                  : 'Creates a sales record and reduces inventory.'}
              </div>
            </div>

            {/* Conditional fields */}
            {!isDamaged ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={panelLabel}>Sale Date <span style={{ color: '#D4A843' }}>*</span></label>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={e => setSaleDate(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={panelLabel}>
                    Customer <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={customer}
                    onChange={e => setCustomer(e.target.value.slice(0, 60))}
                    placeholder="e.g., Juan Dela Cruz"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>

                {/* Per-variant selling price invoice */}
                {selectedVariantIds.some(id => (parseInt(variantQtys[id]) || 0) > 0) && (
                  <div>
                    <label style={panelLabel}>Selling Price Breakdown</label>
                    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', fontSize: '0.6rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span>Variant</span><span style={{ textAlign: 'center' }}>Price</span><span style={{ textAlign: 'center' }}>Revenue</span>
                      </div>
                      {selectedVariantIds
                        .filter(id => (parseInt(variantQtys[id]) || 0) > 0)
                        .map(variantId => {
                          const variant  = variants.find(v => v.id === variantId);
                          const qty      = parseInt(variantQtys[variantId]) || 0;
                          const price    = parseFloat(sellingPrices[variantId]) || 0;
                          const revenue  = qty * price;
                          const calc     = batchMode === 'fifo' ? fifoCalculation : pickCalculation;
                          const fulfilled = batchMode === 'fifo' ? (calc[variantId]?.qtyFulfilled || 0) : (calc[variantId]?.qtyAssigned || 0);
                          return (
                            <div key={variantId} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '0.625rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.78rem', color: '#E5E2E1', fontWeight: 500 }}>{variant?.variantName}</span>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: '#D4A843', fontWeight: 700 }}>₱</span>
                                <span style={{ fontSize: '0.78rem', color: price > 0 ? '#E5E2E1' : 'var(--gray)', fontWeight: 600 }}>
                                  {price > 0 ? formatPrice(price) : '—'}
                                </span>
                              </div>
                              <span style={{ textAlign: 'center', fontSize: '0.78rem', color: revenue > 0 ? '#4ade80' : 'var(--gray)', fontWeight: 600 }}>
                                {revenue > 0 ? `₱${formatPrice(fulfilled * price)}` : '—'}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label style={panelLabel}>
                  Remarks <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(Optional)</span>
                </label>
                <textarea
                  value={remarks}
                  onChange={e => setRemarks(e.target.value.slice(0, 300))}
                  placeholder="e.g., Broken during shipping, QC failed..."
                  rows={3}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '1.25rem 0' }} />

            {/* Summary */}
            {renderSummary()}
          </div>
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '1rem 2rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#131313' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--gray)', borderRadius: '8px', padding: '0.625rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--gray)'; }}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Footer breakdown (mirrors + modal) */}
            {totals.totalQty > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--gray)' }}>
                  Qty: <strong style={{ color: '#E5E2E1' }}>{totals.totalQty} pcs</strong>
                </span>
                <span style={{ color: 'var(--gray)' }}>
                  Cost: <strong style={{ color: '#facc15' }}>₱{formatPrice(totals.totalCostValue)}</strong>
                </span>
                {!isDamaged && totals.totalRevenue > 0 && (
                  <span style={{ color: 'var(--gray)' }}>
                    Revenue: <strong style={{ color: '#4ade80' }}>₱{formatPrice(totals.totalRevenue)}</strong>
                  </span>
                )}
                <span style={{ color: 'var(--gray)' }}>
                  {selectedVariantIds.length} variant{selectedVariantIds.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            <button
              type="button"
              disabled={isSubmitDisabled}
              onClick={handleSubmit}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: isSubmitDisabled
                  ? 'rgba(255,255,255,0.08)'
                  : isDamaged
                  ? '#ef4444'
                  : 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)',
                border: 'none',
                color: isSubmitDisabled ? 'var(--gray)' : isDamaged ? '#fff' : '#000',
                borderRadius: '8px', padding: '0.625rem 1.25rem',
                fontSize: '0.85rem', fontWeight: 700,
                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                boxShadow: isSubmitDisabled ? 'none' : isDamaged ? '0 0 16px rgba(239,68,68,0.3)' : '0 0 16px rgba(212,168,67,0.3)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { if (!isSubmitDisabled) e.currentTarget.style.transform = 'scale(1.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {isDamaged ? 'Confirm Write-off' : 'Confirm Reduction'}
            </button>
          </div>
        </div>
      </div>

      {/* ── CONFIRM MODAL ──────────────────────────────────────────────────── */}
      {showConfirm && pending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setShowConfirm(false)}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className={`modal-title ${isDamaged ? 'modal-title-danger' : 'modal-title-warning'}`}>
                Confirm {isDamaged ? 'Write-off' : 'Stock Reduction'}
              </h2>
              <button className="modal-close" onClick={() => setShowConfirm(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="confirm-summary">
                <div className="confirm-row">
                  <span className="confirm-label">Mode:</span>
                  <span className="confirm-value">{pending.batchMode === 'fifo' ? 'Auto FIFO' : 'Manual Batch Pick'}</span>
                </div>
                <div className="confirm-row">
                  <span className="confirm-label">Reason:</span>
                  <span className="confirm-value">{isDamaged ? 'Damaged / Write-off' : 'Manual Sale (Outside System)'}</span>
                </div>
                <div className="confirm-row">
                  <span className="confirm-label">Total Qty:</span>
                  <span className="confirm-value" style={{ color: '#f87171', fontWeight: 700 }}>−{pending.totals.totalQty} pcs</span>
                </div>
                <div className="confirm-row">
                  <span className="confirm-label">Cost Value:</span>
                  <span className="confirm-value" style={{ color: isDamaged ? '#f87171' : '#facc15', fontWeight: 700 }}>₱{formatPrice(pending.totals.totalCostValue)}</span>
                </div>
                {!isDamaged && (
                  <>
                    <div className="confirm-row">
                      <span className="confirm-label">Revenue:</span>
                      <span className="confirm-value" style={{ color: '#4ade80', fontWeight: 700 }}>₱{formatPrice(pending.totals.totalRevenue)}</span>
                    </div>
                    <div className="confirm-row">
                      <span className="confirm-label">Gross Profit:</span>
                      <span className="confirm-value" style={{ color: pending.totals.totalRevenue - pending.totals.totalCostValue >= 0 ? '#4ade80' : '#ef4444', fontWeight: 700 }}>
                        ₱{formatPrice(pending.totals.totalRevenue - pending.totals.totalCostValue)}
                      </span>
                    </div>
                    {pending.saleDate && (
                      <div className="confirm-row">
                        <span className="confirm-label">Sale Date:</span>
                        <span className="confirm-value">{new Date(pending.saleDate + 'T00:00:00').toLocaleDateString()}</span>
                      </div>
                    )}
                    {pending.customer && (
                      <div className="confirm-row">
                        <span className="confirm-label">Customer:</span>
                        <span className="confirm-value">{pending.customer}</span>
                      </div>
                    )}
                  </>
                )}
                {isDamaged && pending.remarks && (
                  <div className="confirm-row">
                    <span className="confirm-label">Remarks:</span>
                    <span className="confirm-value">{pending.remarks}</span>
                  </div>
                )}
              </div>
              <p className="confirm-hint" style={{ marginTop: '1rem', color: isDamaged ? '#f87171' : '#facc15' }}>
                {isDamaged
                  ? 'This will permanently write off stock with no revenue. This cannot be undone.'
                  : 'This will reduce inventory and create a sales record.'}
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                type="button"
                className={isDamaged ? 'btn-danger' : 'btn-primary'}
                onClick={handleConfirm}
              >
                {isDamaged ? 'Confirm Write-off' : 'Confirm Reduction'}
              </button>
            </div>
          </div>
        </div>
      )}

      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title || ''} message={infoModal?.message || ''} />
    </div>
  );
}