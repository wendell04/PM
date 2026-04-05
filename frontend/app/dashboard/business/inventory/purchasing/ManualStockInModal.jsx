'use client';

import React, { useState, useEffect, useMemo } from 'react';

// ── Integer Input ──────────────────────────────────────────────────────────────
function IntegerInput({ value, onChange, min = 0, max, placeholder, style, disabled }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      const num = val === '' ? 0 : parseInt(val, 10);
      if (max !== undefined && num > max) return;
      if (num < min) return;
      onChange(val);
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
      if (num <= max) onChange(val);
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

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL STOCK-IN WIZARD MODAL — 3 Steps
// Step 1: Select Materials (from Master Data)
// Step 2: Stock Entry (left) + Invoice Preview (right)
// Step 3: Stock Summary (left) + Invoice Details (right)
// ══════════════════════════════════════════════════════════════════════════════
export default function ManualStockInModal({ materials, vendors, onClose, onSave }) {
  const [step, setStep] = useState(1);

  // Step 1
  const [search, setSearch] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState([]);

  // Step 2 - Stock rows per material
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
  const [infoModal, setInfoModal] = useState(null);

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

  // Generate stock rows for a material
  const generateMaterialRows = (material) => {
    if (!material.hasVariants) {
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
      }];
    }
    const children = materials.filter(m => m.parentId === material.id);
    if (children.length === 0) {
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
  const totalPaid = Object.values(stockRowsByMaterial).flat().reduce((sum, r) => sum + (parseInt(r.qty) || 0) * (parseFloat(r.unitCost) || 0), 0);

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
    if (!step3Valid()) newErrors.step3 = 'Complete all required invoice fields.';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

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

    onSave(siEntries, 'cancel');
    onClose();
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
      <style>{`
        @media (max-width: 768px) {
          .wizard-grid { grid-template-columns: 1fr !important; }
          .wizard-panel { padding: 1rem !important; }
        }
      `}</style>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '1100px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, background: '#0E0E0E', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{ padding: '1.5rem 2rem', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#131313' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.62rem', color: '#D4A843', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.35rem', fontWeight: 600 }}>Procurement</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E5E2E1', margin: 0 }}>Manual Stock-In Entry</h2>
              {selectedMaterials.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  Selected: <span style={{ color: '#D4A843', fontWeight: 600 }}>{selectedMaterials.length} material{selectedMaterials.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', color: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444'; }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Step Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative', paddingLeft: '2rem', paddingRight: '2rem' }}>
            <div style={{ position: 'absolute', top: '14px', left: 'calc(16.67%)', width: 'calc(33.33%)', height: '2px', background: 'rgba(255,255,255,0.08)', zIndex: 0, borderRadius: '2px', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(16.67%)', width: step1Valid ? 'calc(33.33%)' : '0%', height: '2px', background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)', zIndex: 1, borderRadius: '2px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: step1Valid ? '0 0 12px rgba(212,168,67,0.4)' : 'none', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(50%)', width: 'calc(33.33%)', height: '2px', background: 'rgba(255,255,255,0.08)', zIndex: 0, borderRadius: '2px', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(50%)', width: step2Valid() ? 'calc(33.33%)' : '0%', height: '2px', background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)', zIndex: 1, borderRadius: '2px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: step2Valid() ? '0 0 12px rgba(212,168,67,0.4)' : 'none', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(83.33%)', width: 'calc(33.33%)', height: '2px', background: 'rgba(255,255,255,0.08)', zIndex: 0, borderRadius: '2px', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '14px', left: 'calc(83.33%)', width: step3Valid() ? 'calc(33.33%)' : '0%', height: '2px', background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)', zIndex: 1, borderRadius: '2px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: step3Valid() ? '0 0 12px rgba(212,168,67,0.4)' : 'none', transform: 'translateX(-50%)' }} />

            {[
              { num: 1, label: 'Select Materials' },
              { num: 2, label: 'Stock Entry' },
              { num: 3, label: 'Invoice' },
            ].map((s) => {
              const isComplete = s.num === 1 ? step1Valid : s.num === 2 ? step2Valid() : step3Valid();
              const isCurrent = step === s.num;
              return (
                <div key={s.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', flex: 1, position: 'relative', zIndex: 2 }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isComplete ? 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)' : isCurrent ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
                    color: isComplete ? '#000' : isCurrent ? '#D4A843' : 'var(--gray)',
                    border: isCurrent ? '2px solid #D4A843' : '2px solid transparent',
                    transition: 'all 0.3s ease',
                    boxShadow: isCurrent ? '0 0 16px rgba(212,168,67,0.4)' : 'none',
                    transform: isCurrent ? 'scale(1.08)' : 'scale(1)',
                  }}>
                    {isComplete
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{s.num}</span>
                    }
                  </div>
                  <span style={{ fontSize: '0.6rem', letterSpacing: '0.12em', fontWeight: 600, color: isComplete || isCurrent ? '#D4A843' : 'var(--gray)', textTransform: 'uppercase' }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STEP 1: Select Materials ─────────────────────────────────── */}
        {step === 1 && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search materials by name, SKU, or category..."
                style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {errors.step1 && <p style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '0.75rem' }}>{errors.step1}</p>}

            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              {groupedByCategory.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>
                  {selectableMaterials.length === 0 ? 'No materials available. Add materials in Master Data first.' : `No results for "${search}"`}
                </div>
              ) : groupedByCategory.map(group => (
                <div key={group.category}>
                  <button type="button"
                    onClick={() => {/* Could expand/collapse here */}}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', background: 'rgba(255,255,255,0.04)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{group.category}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--gray)', marginTop: '0.1rem' }}>{group.materials.length} material{group.materials.length !== 1 ? 's' : ''}</div>
                    </div>
                  </button>
                  {group.materials.map((m, idx) => {
                    const isSelected = selectedMaterials.some(p => p.id === m.id);
                    return (
                      <button key={m.id} type="button"
                        onClick={() => toggleMaterial(m)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '0.75rem 1rem 0.75rem 2.5rem',
                          background: isSelected ? 'rgba(212,168,67,0.12)' : idx % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'transparent',
                          border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
                          cursor: 'pointer', textAlign: 'left',
                        }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: isSelected ? '#D4A843' : 'var(--white)', fontSize: '0.85rem' }}>{m.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>
                            {m.sku || '—'} {m.hasVariants && `• ${materials.filter(c => c.parentId === m.id).length} variants`}
                          </div>
                        </div>
                        {isSelected ? (
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#D4A843', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {selectedMaterials.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '0.875rem', textAlign: 'center' }}>
                Select one or more materials to receive.
              </p>
            )}
            <div className="modal-actions" style={{ flexShrink: 0 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" onClick={goNext}>Next Step</button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Stock Entry + Invoice Preview ────────────────────── */}
        {step === 2 && (
          <div className="wizard-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>

            {/* LEFT — Stock Entry Table */}
            <div className="wizard-panel" style={{ padding: '1.5rem 2rem', overflowY: 'auto', background: '#0E0E0E' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem' }}>Step 2: Stock Entry</div>
                  <div style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 600 }}>{selectedMaterials.length} Material{selectedMaterials.length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              {errors.step2 && <p style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '0.75rem' }}>{errors.step2}</p>}

              {/* Apply-all controls */}
              {selectedMaterials.length > 1 && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.25rem', letterSpacing: '0.08em' }}>Apply Unit Cost to All</label>
                    <input type="text" inputMode="decimal" placeholder="e.g., 30.00" value={applyAllCost}
                      onChange={e => { const val = e.target.value; if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setApplyAllCost(val); }}
                      style={{ width: '100%', padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '6px', color: '#E5E2E1', fontSize: '0.8rem', outline: 'none' }} />
                    <button type="button" onClick={() => { if (applyAllCost) applyToAll('unitCost', applyAllCost); }}
                      style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: '#D4A843', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      Apply to All
                    </button>
                  </div>
                </div>
              )}

              {/* Stock entry tables per material */}
              {selectedMaterials.map(mat => {
                const rows = stockRowsByMaterial[mat.id] || [];
                const matTotal = rows.reduce((s, r) => s + (parseInt(r.qty) || 0) * (parseFloat(r.unitCost) || 0), 0);
                const matReceived = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);

                return (
                  <div key={mat.id} style={{ marginBottom: '1.5rem' }}>
                    {/* Material Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{mat.category} / {mat.name}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{rows.length} Variant{rows.length !== 1 ? 's' : ''} {matReceived > 0 && `• ${matReceived} ${rows[0]?.uom || 'pcs'}`}</div>
                      </div>
                    </div>

                    {/* Variant Table */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '1rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Item</th>
                            <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '120px' }}>Qty Received</th>
                            <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '120px' }}>Damaged</th>
                            <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '100px' }}>Unit Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => (
                            <tr key={row.materialId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '0.75rem 1rem' }}>
                                <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{row.variantLabel}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>SKU: {row.sku || '—'}</div>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <IntegerInput value={row.qty} onChange={val => updateStockRow(row.materialId, idx, 'qty', val)}
                                  min={0} max={99999} placeholder="0"
                                  style={{ textAlign: 'center', width: '80px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: (parseInt(row.qty) || 0) > 0 ? '#D4A843' : 'var(--gray)', fontWeight: 700, padding: '0.5rem', fontSize: '0.9rem' }} />
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <IntegerInput value={row.damaged} onChange={val => updateStockRow(row.materialId, idx, 'damaged', val)}
                                  min={0} max={99999} placeholder="0"
                                  style={{ textAlign: 'center', width: '80px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: (parseInt(row.damaged) || 0) > 0 ? '#F87171' : 'var(--gray)', fontWeight: 600, padding: '0.5rem', fontSize: '0.9rem' }} />
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <DecimalInput value={row.unitCost} onChange={val => updateStockRow(row.materialId, idx, 'unitCost', val)}
                                  placeholder="0.00"
                                  style={{ textAlign: 'center', width: '90px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: (parseFloat(row.unitCost) || 0) > 0 ? '#E5E2E1' : 'var(--gray)', fontWeight: 600, padding: '0.5rem', fontSize: '0.85rem' }} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {matTotal > 0 && (
                        <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.15)', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--gray)', marginRight: '0.5rem' }}>Subtotal:</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>₱{matTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>Total Good Qty</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#E5E2E1' }}>{totalGood} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span></div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>Damaged Upon Arrival</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F87171' }}>{totalDamaged} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span></div>
                </div>
              </div>
            </div>

            {/* RIGHT — Invoice Preview */}
            <div style={{ padding: '1.5rem 2rem', borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0A0A0A', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem' }}>Invoice Preview</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>Go to Step 3 to fill details</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem', letterSpacing: '0.08em' }}>Supplier</label>
                  <div style={{ padding: '0.65rem 0.875rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'var(--gray)', fontSize: '0.8rem' }}>Select in Step 3</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem', letterSpacing: '0.08em' }}>Invoice Number</label>
                    <div style={{ padding: '0.65rem 0.875rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'var(--gray)', fontSize: '0.8rem' }}>Required</div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem', letterSpacing: '0.08em' }}>Delivery Date</label>
                    <div style={{ padding: '0.65rem 0.875rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'var(--gray)', fontSize: '0.8rem' }}>Required</div>
                  </div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px', textAlign: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2" style={{ marginBottom: '0.5rem' }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  <div style={{ fontSize: '0.75rem', color: '#D4A843', fontWeight: 600 }}>Navigate to Step 3 to complete invoice details</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Stock Summary + Invoice Details ──────────────────── */}
        {step === 3 && (
          <div className="wizard-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>

            {/* LEFT — Stock Summary */}
            <div className="wizard-panel" style={{ padding: '1.5rem 2rem', overflowY: 'auto', background: '#0E0E0E' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem' }}>Stock Summary</div>
                  <div style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 600 }}>{selectedMaterials.length} Material{selectedMaterials.length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              {errors.step3 && <p style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '0.75rem' }}>{errors.step3}</p>}

              {/* Summary per material */}
              {selectedMaterials.map(mat => {
                const rows = stockRowsByMaterial[mat.id] || [];
                const rowsWithQty = rows.filter(r => (parseInt(r.qty) || 0) > 0);
                const matGood = rowsWithQty.reduce((s, r) => s + Math.max(0, (parseInt(r.qty) || 0) - (parseInt(r.damaged) || 0)), 0);
                const matDamaged = rowsWithQty.reduce((s, r) => s + (parseInt(r.damaged) || 0), 0);
                if (rowsWithQty.length === 0) return null;

                return (
                  <div key={mat.id} style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '5px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{mat.category} / {mat.name}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--gray)' }}>{rowsWithQty.length} variant{rowsWithQty.length !== 1 ? 's' : ''} with qty</div>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '0.75rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <th style={{ padding: '0.6rem 0.875rem', textAlign: 'left', fontSize: '0.55rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Variant</th>
                            <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontSize: '0.55rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '80px' }}>Qty</th>
                            <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontSize: '0.55rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '80px' }}>DMG</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowsWithQty.map((row) => (
                            <tr key={row.materialId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '0.6rem 0.875rem' }}>
                                <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{row.variantLabel}</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{row.sku || '—'}</div>
                              </td>
                              <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                                <span style={{ fontWeight: 700, color: '#D4A843', fontSize: '0.85rem' }}>{row.qty}</span>
                              </td>
                              <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                                <span style={{ fontWeight: 600, color: (parseInt(row.damaged) || 0) > 0 ? '#F87171' : 'var(--gray)', fontSize: '0.8rem' }}>{row.damaged || 0}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div style={{ padding: '0.6rem', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600 }}>Good</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#22c55e' }}>{matGood} {rows[0]?.uom || 'pcs'}</div>
                      </div>
                      <div style={{ padding: '0.6rem', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.55rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600 }}>Damaged</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#F87171' }}>{matDamaged} {rows[0]?.uom || 'pcs'}</div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Total Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>Total Effective Qty</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#E5E2E1' }}>{totalGood} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span></div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 600, letterSpacing: '0.08em' }}>Damaged</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F87171' }}>{totalDamaged} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray)' }}>units</span></div>
                </div>
              </div>
            </div>

            {/* RIGHT — Invoice Details */}
            <div style={{ padding: '1.5rem 2rem', borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0A0A0A', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1rem' }}>Step 3: Invoice Details</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Vendor */}
                <div>
                  <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem', letterSpacing: '0.08em' }}>Supplier</label>
                  <select value={invoice.vendorId}
                    onChange={e => {
                      const v = vendors.find(v => v.id === e.target.value);
                      setInvoice(p => ({ ...p, vendorId: e.target.value, vendorName: v?.name || '' }));
                    }}
                    style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', fontSize: '0.8rem', outline: 'none' }}>
                    <option value="">General Merchandise (Walk-in)</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>

                {/* Invoice No + Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem', letterSpacing: '0.08em' }}>Reference / OR Number</label>
                    <input type="text" value={invoice.referenceNo}
                      onChange={e => setInvoice(p => ({ ...p, referenceNo: e.target.value.slice(0, 50) }))}
                      placeholder="INV-2024-001"
                      style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', fontSize: '0.8rem', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem', letterSpacing: '0.08em' }}>Delivery Date</label>
                    <input type="date" value={invoice.deliveryDate}
                      onChange={e => setInvoice(p => ({ ...p, deliveryDate: e.target.value }))}
                      max={new Date().toISOString().split('T')[0]}
                      style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', fontSize: '0.8rem', outline: 'none', colorScheme: 'dark' }} />
                  </div>
                </div>

                {/* Per-material cost review */}
                {selectedMaterials.map(mat => {
                  const rows = (stockRowsByMaterial[mat.id] || []).filter(r => (parseInt(r.qty) || 0) > 0);
                  if (rows.length === 0) return null;
                  return (
                    <div key={mat.id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '0.65rem', color: '#D4A843', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
                        {mat.category} / {mat.name}
                      </div>
                      {rows.map((row) => {
                        const rowTotal = (parseInt(row.qty) || 0) * (parseFloat(row.unitCost) || 0);
                        return (
                          <div key={row.materialId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: '0.75rem', color: '#E5E2E1' }}>{row.variantLabel}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{row.qty} {row.uom} × ₱{parseFloat(row.unitCost || 0).toFixed(2)}</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#D4A843', fontFamily: 'monospace' }}>₱{rowTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Notes */}
                <div>
                  <label style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem', letterSpacing: '0.08em' }}>Notes (Optional)</label>
                  <textarea value={invoice.notes}
                    onChange={e => setInvoice(p => ({ ...p, notes: e.target.value.slice(0, 500) }))}
                    placeholder="Optional notes..."
                    style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', fontSize: '0.8rem', outline: 'none', resize: 'vertical', minHeight: '50px' }} />
                </div>

                {/* Total */}
                {totalPaid > 0 && (
                  <div style={{ padding: '0.75rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Total Value</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D4A843', fontFamily: 'monospace' }}>₱{totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div style={{ padding: '1rem 2rem', borderTop: '1px solid rgba(255,255,255,0.08)', background: '#131313', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {step > 1 && (
              <button onClick={goBack} style={{ padding: '0.6rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                Back
              </button>
            )}
            <button onClick={onClose} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--gray)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
              Discard
            </button>
          </div>
          {step < 3 ? (
            <button onClick={goNext} style={{ padding: '0.6rem 1.5rem', background: '#D4A843', border: 'none', borderRadius: '8px', color: '#000', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Next
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            </button>
          ) : (
            <button onClick={handleSubmit} style={{ padding: '0.6rem 1.5rem', background: '#D4A843', border: 'none', borderRadius: '8px', color: '#000', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              Save Stock-In
            </button>
          )}
        </div>
      </div>
      <InfoModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title || ''} message={infoModal?.message || ''} />
    </div>
  );
}
