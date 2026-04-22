'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  fetchInventory,
} from '@/lib/inventoryApi';
import { fetchUnits } from '@/lib/unitsApi';

// ─── Icons ────────────────────────────────────────────────
const TruckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);
const PersonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const PhoneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);
const EmailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const AddressIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

// ─── Shared styles ────────────────────────────────────────
const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#E5E2E1',
  padding: '0.625rem 0.75rem',
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box',
};
const inputErrorStyle = { ...inputStyle, borderColor: '#ef4444' };
const labelStyle = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: 'var(--gray)',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const errorText = {
  fontSize: '0.72rem',
  color: '#ef4444',
  marginTop: '0.2rem',
  display: 'block',
};

function normalizeVendorList(list) {
  return (Array.isArray(list) ? list : []).map((v) => ({ ...v, id: v.id ?? v._id }));
}

// ─── Vendor Catalog Modal ──────────────────────────────────
function VendorCatalogModal({ vendor, materials, inventory, onClose }) {
  if (!vendor) return null;

  const linkedMaterials = useMemo(
    () => (materials || []).filter((m) => m.preferredVendorId === vendor.id && !m.parentId),
    [materials, vendor.id],
  );

  const batchRows = useMemo(() => {
    const rows = [];
    const supplierId = vendor.id;
    (inventory || []).forEach((item) => {
      (item.batches || []).forEach((batch) => {
        if (String(batch.supplierId ?? '') === String(supplierId ?? '')) {
          rows.push({
            itemName: item.name,
            batchId: batch.batchId,
            invoiceNumber: batch.invoiceNumber || '—',
            dateReceived: batch.dateReceived,
            unitCost: batch.unitCost ?? 0,
            originalQty: batch.originalQty ?? batch.goodQty ?? 0,
          });
        }
      });
    });
    return rows.sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));
  }, [inventory, vendor.id]);

  const totalSpent = batchRows.reduce((s, r) => s + r.unitCost * r.originalQty, 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--dark2)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '0',
          width: '100%',
          maxWidth: '700px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#E5E2E1' }}>
                {vendor.name} — Catalog
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--gray)' }}>
                Materials linked to this supplier and purchase history.
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: '4px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginTop: '1rem' }}>
            {[
              { label: 'Linked Materials', value: linkedMaterials.length },
              { label: 'Purchase Batches', value: batchRows.length },
              { label: 'Total Spent', value: `₱${totalSpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` },
            ].map((s) => (
              <div key={s.label} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.3rem' }}>{s.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#E5E2E1' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 28px' }}>
          {/* Linked materials */}
          {linkedMaterials.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                Linked Materials ({linkedMaterials.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {linkedMaterials.map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E5E2E1' }}>{m.name}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{m.sku || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#E5E2E1' }}>
                        ₱{(m.baseCost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase' }}>{m.uom}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Purchase history */}
          {batchRows.length > 0 ? (
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                Purchase History ({batchRows.length} batches)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Item', 'Invoice', 'Date', 'Unit Cost', 'Qty'].map((h) => (
                      <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '0.5rem 0.6rem', color: '#E5E2E1' }}>{r.itemName}</td>
                      <td style={{ padding: '0.5rem 0.6rem', color: 'var(--gray)', fontFamily: 'monospace', fontSize: '0.72rem' }}>{r.invoiceNumber}</td>
                      <td style={{ padding: '0.5rem 0.6rem', color: 'var(--gray)' }}>{r.dateReceived ? new Date(r.dateReceived).toLocaleDateString('en-PH') : '—'}</td>
                      <td style={{ padding: '0.5rem 0.6rem', color: '#E5E2E1', fontWeight: 600 }}>₱{r.unitCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0.5rem 0.6rem', color: '#E5E2E1' }}>{r.originalQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            linkedMaterials.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray)', fontSize: '0.85rem' }}>
                No materials or purchase history linked to this vendor yet.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Vendor Form Modal ─────────────────────────────────────
function VendorFormModal({ vendor, allVendors, materials, units, onClose, onSave, isSubmitting, submitError }) {
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    itemsSupplied: [],
  });
  const [itemNameInput, setItemNameInput] = useState('');
  const [itemUomInput, setItemUomInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errors, setErrors] = useState({});

  const linkedMaterials = useMemo(
    () => (!vendor ? [] : (materials || []).filter((m) => m.preferredVendorId === vendor.id)),
    [vendor, materials],
  );
  const hasLinkedMaterials = linkedMaterials.length > 0;

  const usedItems = useMemo(() => {
    const items = new Set();
    linkedMaterials.forEach((m) => { if (m.category) items.add(m.category); });
    return items;
  }, [linkedMaterials]);

  const allKnownItems = useMemo(() => {
    const seen = new Set();
    const items = [];
    (allVendors || []).forEach((v) => {
      (v.itemsSupplied || []).forEach((item) => {
        const name = typeof item === 'string' ? item : item.name;
        if (name && !seen.has(name)) { seen.add(name); items.push(name); }
      });
    });
    return items.sort();
  }, [allVendors]);

  const suggestions = useMemo(() => {
    const existing = new Set((form.itemsSupplied || []).map((i) => i.name?.toLowerCase()));
    const q = itemNameInput.toLowerCase();
    return allKnownItems.filter((n) => !existing.has(n.toLowerCase()) && (!q || n.toLowerCase().includes(q)));
  }, [itemNameInput, allKnownItems, form.itemsSupplied]);

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name || '',
        contactPerson: vendor.contactPerson || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        address: vendor.address || '',
        notes: vendor.notes || '',
        itemsSupplied: (Array.isArray(vendor.itemsSupplied) ? vendor.itemsSupplied : []).map(
          (item) => typeof item === 'string' ? { name: item, uom: '' } : { name: item.name || '', uom: item.uom || '' }
        ),
      });
    }
    setItemNameInput('');
    setItemUomInput(units && units.length > 0 ? units[0].code : '');
    setErrors({});
  }, [vendor, units]);

  useEffect(() => {
    if (!itemUomInput && units && units.length > 0) setItemUomInput(units[0].code);
  }, [units, itemUomInput]);

  const addItem = () => {
    const trimmed = itemNameInput.trim();
    if (!trimmed) return;
    if ((form.itemsSupplied || []).some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) return;
    setForm((p) => ({ ...p, itemsSupplied: [...(p.itemsSupplied || []), { name: trimmed, uom: itemUomInput }] }));
    setItemNameInput('');
    setShowSuggestions(false);
  };

  const removeItem = (idx) => {
    const item = form.itemsSupplied[idx];
    if (usedItems.has(item.name)) return;
    setForm((p) => ({ ...p, itemsSupplied: p.itemsSupplied.filter((_, i) => i !== idx) }));
  };

  const handleItemKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
  };

  const handlePhoneInput = (val) => {
    let cleaned = val.replace(/[^0-9+\-\s]/g, '');
    if (cleaned.startsWith('+63')) {
      const digits = cleaned.slice(3).replace(/[^0-9]/g, '').slice(0, 10);
      cleaned = '+63' + digits;
    } else if (cleaned.startsWith('63') && !cleaned.startsWith('6')) {
      const digits = cleaned.slice(2).replace(/[^0-9]/g, '').slice(0, 10);
      cleaned = '+63' + digits;
    } else {
      const digits = cleaned.replace(/[^0-9]/g, '').slice(0, 11);
      cleaned = digits;
    }
    setForm((p) => ({ ...p, phone: cleaned }));
    if (errors.phone) setErrors((er) => ({ ...er, phone: '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Company name is required.';
    if ((form.itemsSupplied || []).filter((i) => i.name?.trim()).length === 0)
      newErrors.items = 'Add at least one item this vendor supplies.';
    if (form.phone && !/^(\+63\d{10}|09\d{9}|0\d{9,10})$/.test(form.phone.replace(/\s/g, '')))
      newErrors.phone = 'Enter a valid PH phone number (e.g. 09171234567 or +639171234567).';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = 'Enter a valid email address.';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    onSave({ ...form, itemsSupplied: (form.itemsSupplied || []).filter((i) => i.name?.trim()) });
  };

  const uomSelectOrInput = (value, onChange) => {
    if (units && units.length > 0) {
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '110px', cursor: 'pointer' }}>
          {units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
        </select>
      );
    }
    return (
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="UOM" style={{ ...inputStyle, flex: 1, minWidth: '80px' }} />
    );
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '580px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#E5E2E1' }}>
            {vendor ? 'Edit Vendor' : 'Add New Vendor'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: '4px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Company Name */}
          <div>
            <label style={labelStyle}>
              Company Name <span style={{ color: '#ef4444' }}>*</span>
              {hasLinkedMaterials && (
                <span style={{ fontSize: '0.65rem', color: '#f59e0b', marginLeft: '0.5rem', fontWeight: 600 }}>
                  (Locked — {linkedMaterials.length} material{linkedMaterials.length > 1 ? 's' : ''} linked)
                </span>
              )}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value.slice(0, 100) })); if (errors.name) setErrors((er) => ({ ...er, name: '' })); }}
              placeholder="e.g. Global Garments Inc."
              maxLength={100}
              readOnly={hasLinkedMaterials}
              style={hasLinkedMaterials ? { ...inputStyle, opacity: 0.5, cursor: 'not-allowed' } : (errors.name ? inputErrorStyle : inputStyle)}
            />
            {errors.name && <span style={errorText}>{errors.name}</span>}
          </div>

          {/* Items Supplied */}
          <div>
            <label style={labelStyle}>
              Items Supplied <span style={{ color: '#ef4444' }}>*</span>
              {hasLinkedMaterials && (
                <span style={{ fontSize: '0.6rem', color: 'var(--gray)', marginLeft: '0.5rem', fontWeight: 400 }}>
                  (Locked items are used by linked materials)
                </span>
              )}
            </label>
            {errors.items && <span style={errorText}>{errors.items}</span>}

            {/* Existing items */}
            {(form.itemsSupplied || []).length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {(form.itemsSupplied || []).map((item, i) => {
                  const isUsed = usedItems.has(item.name);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.5rem 0.75rem', background: isUsed ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isUsed ? 'rgba(212,168,67,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '0.82rem', color: '#E5E2E1', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase' }}>{item.uom || '—'}</span>
                      </div>
                      {isUsed ? (
                        <LockIcon />
                      ) : (
                        <button type="button" onClick={() => removeItem(i)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.2rem 0.4rem', cursor: 'pointer', color: '#f87171', fontSize: '0.7rem', lineHeight: 1 }}>✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add item row */}
            <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
              <input
                type="text"
                value={itemNameInput}
                onChange={(e) => { setItemNameInput(e.target.value.slice(0, 60)); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={handleItemKeyDown}
                placeholder="Item name…"
                maxLength={60}
                style={{ ...inputStyle, flex: 2 }}
              />
              {uomSelectOrInput(itemUomInput, setItemUomInput)}
              <button type="button" onClick={addItem} className="btn-primary" style={{ padding: '0 1rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                + Add
              </button>
              {/* Suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#1a1a1a', border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto', marginTop: '0.25rem', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  {suggestions.map((name, i) => (
                    <button key={i} type="button" onMouseDown={() => { setItemNameInput(name); setShowSuggestions(false); }}
                      style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#E5E2E1', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(212,168,67,0.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Contact Person */}
          <div>
            <label style={labelStyle}>
              Contact Person
              <span style={{ fontWeight: 400, color: 'var(--gray)', marginLeft: '0.4rem', textTransform: 'none', letterSpacing: 0 }}>({form.contactPerson.length}/60)</span>
            </label>
            <input
              type="text"
              value={form.contactPerson}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'.,-]/g, '').slice(0, 60);
                setForm((p) => ({ ...p, contactPerson: val }));
              }}
              placeholder="e.g. Juan dela Cruz"
              maxLength={60}
              style={inputStyle}
            />
            <span style={{ fontSize: '0.68rem', color: 'var(--gray)', marginTop: '3px', display: 'block' }}>Letters and spaces only</span>
          </div>

          {/* Phone + Email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>
                Phone
                <span style={{ fontWeight: 400, color: 'var(--gray)', marginLeft: '0.4rem', textTransform: 'none', letterSpacing: 0 }}>({form.phone.replace(/\s/g,'').length}/13)</span>
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => handlePhoneInput(e.target.value)}
                placeholder="09171234567"
                maxLength={14}
                style={errors.phone ? inputErrorStyle : inputStyle}
              />
              {errors.phone
                ? <span style={errorText}>{errors.phone}</span>
                : <span style={{ fontSize: '0.68rem', color: 'var(--gray)', marginTop: '3px', display: 'block' }}>09xxxxxxxxx or +63xxxxxxxxxx</span>
              }
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => { setForm((p) => ({ ...p, email: e.target.value.slice(0, 100) })); if (errors.email) setErrors((er) => ({ ...er, email: '' })); }}
                placeholder="supplier@example.com"
                maxLength={100}
                style={errors.email ? inputErrorStyle : inputStyle}
              />
              {errors.email && <span style={errorText}>{errors.email}</span>}
            </div>
          </div>

          {/* Address */}
          <div>
            <label style={labelStyle}>
              Address
              <span style={{ fontWeight: 400, color: 'var(--gray)', marginLeft: '0.4rem', textTransform: 'none', letterSpacing: 0 }}>({form.address.length}/150)</span>
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value.slice(0, 150) }))}
              placeholder="Street, City, Province"
              maxLength={150}
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>
              Notes
              <span style={{ fontWeight: 400, color: 'var(--gray)', marginLeft: '0.4rem', textTransform: 'none', letterSpacing: 0 }}>({(form.notes || '').length}/300)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value.slice(0, 300) }))}
              placeholder="Optional notes about this vendor"
              rows={3}
              maxLength={300}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {submitError && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)', fontSize: '13px', color: 'var(--red)' }}>
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button type="button" onClick={onClose} disabled={isSubmitting} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--gray)', fontSize: '14px', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.6 : 1 }}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary" style={{ padding: '10px 28px', opacity: isSubmitting ? 0.6 : 1 }}>
              {isSubmitting ? 'Saving…' : (vendor ? 'Save Changes' : 'Add Vendor')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────
export default function VendorsApiTab({ onVendorsChange, materials = [], units = [] }) {
  const { token } = useAuth();

  const [suppliers, setSuppliers]   = useState([]);
  const [inventory, setInventory]   = useState([]);
  const [localUnits, setLocalUnits] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState('');

  const [modal, setModal]           = useState(null); // null | 'form' | 'delete' | 'catalog'
  const [selected, setSelected]     = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const [deleteError, setDeleteError]   = useState('');

  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const [suppliersResult, inventoryResult, unitsResult] = await Promise.allSettled([
      fetchSuppliers(token),
      fetchInventory(token),
      fetchUnits(token),
    ]);
    if (suppliersResult.status === 'fulfilled') {
      setSuppliers(normalizeVendorList(suppliersResult.value));
      setError(null);
    } else {
      setError(suppliersResult.reason?.message || 'Failed to load suppliers.');
    }
    setInventory(inventoryResult.status === 'fulfilled' && Array.isArray(inventoryResult.value) ? inventoryResult.value : []);
    if (unitsResult.status === 'fulfilled' && Array.isArray(unitsResult.value)) {
      setLocalUnits(unitsResult.value.map((u) => ({
        id: u._id || u.id,
        code: u.abbreviation || u.code || '',
        name: u.name,
      })));
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  useEffect(() => { onVendorsChange?.(suppliers); }, [suppliers, onVendorsChange]);

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter((s) =>
      s.name?.toLowerCase().includes(q) ||
      s.contactPerson?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  const openCreate = () => { setSelected(null); setSubmitError(''); setModal('form'); };
  const openEdit = (s) => { setSelected(s); setSubmitError(''); setModal('form'); };
  const openDelete = (s) => { setSelected(s); setDeleteError(''); setModal('delete'); };
  const openCatalog = (s) => { setSelected(s); setModal('catalog'); };
  const closeModal = () => { setModal(null); setSelected(null); setSubmitError(''); setDeleteError(''); };

  const handleSave = async (formData) => {
    setIsSubmitting(true);
    setSubmitError('');
    try {
      if (selected) {
        await updateSupplier(selected.id, formData, token);
      } else {
        await createSupplier(formData, token);
      }
      await loadSuppliers();
      closeModal();
    } catch (err) {
      setSubmitError(err.message || 'Failed to save supplier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setDeleteError('');
    try {
      await deleteSupplier(selected.id, token);
      await loadSuppliers();
      closeModal();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete supplier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ErrorBoundary>
      <div>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Inline count badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#E5E2E1', lineHeight: 1 }}>{suppliers.length}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Vendors</span>
          </div>
          {/* Search + Add */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div className="search-wrapper" style={{ maxWidth: '300px' }}>
              <span className="search-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              </span>
              <input className="search-input" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
            </div>
            <button className="btn-primary" onClick={openCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              Add New Supplier
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)' }}>Loading vendors…</div>}

        {/* Error */}
        {!loading && error && (
          <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)', color: 'var(--red)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <span>{error}</span>
            <button onClick={loadSuppliers} style={{ background: 'none', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '4px 12px', fontSize: '13px', cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {/* Card Grid */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {filtered.map((v) => {
              const activeMaterials = (materials || []).filter((m) => m.preferredVendorId === v.id && !m.parentId);
              return (
                <div key={v.id} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', transition: 'border-color 0.2s' }}>
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4A843', flexShrink: 0 }}>
                        <TruckIcon />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '1.05rem' }}>{v.name}</div>
                        {v.category && (
                          <span style={{ display: 'inline-block', fontSize: '0.6rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.15rem 0.5rem', borderRadius: '4px', marginTop: '0.25rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
                            {v.category}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => openEdit(v)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.35rem', cursor: 'pointer', color: 'var(--gray)' }} title="Edit">
                        <EditIcon />
                      </button>
                      <button onClick={() => openDelete(v)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.35rem', cursor: 'pointer', color: '#f87171' }} title="Delete">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.825rem' }}>
                    {v.contactPerson && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#E5E2E1' }}>
                        <span style={{ color: 'var(--gray)', flexShrink: 0 }}><PersonIcon /></span> {v.contactPerson}
                      </div>
                    )}
                    {v.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#E5E2E1' }}>
                        <span style={{ color: 'var(--gray)', flexShrink: 0 }}><PhoneIcon /></span> {v.phone}
                      </div>
                    )}
                    {v.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray)' }}>
                        <span style={{ flexShrink: 0 }}><EmailIcon /></span> {v.email}
                      </div>
                    )}
                    {v.address && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray)' }}>
                        <span style={{ flexShrink: 0 }}><AddressIcon /></span> {v.address}
                      </div>
                    )}
                  </div>

                  {/* Items Supplied */}
                  {(v.itemsSupplied || []).length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
                        Items Supplied ({v.itemsSupplied.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {v.itemsSupplied.map((item, i) => {
                          const name = typeof item === 'string' ? item : item.name;
                          const uom = typeof item === 'string' ? '' : item.uom || '';
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.35rem 0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}>
                              <span style={{ fontSize: '0.78rem', color: '#E5E2E1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                              {uom && (
                                <span style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', background: 'rgba(255,255,255,0.04)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                                  {uom}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Active Materials</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#E5E2E1' }}>{activeMaterials.length}</div>
                    </div>
                    <button onClick={() => openCatalog(v)} style={{ background: 'none', border: 'none', color: '#D4A843', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      View Catalog <ExternalLinkIcon />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Dashed Add Card */}
            <div
              onClick={openCreate}
              style={{ background: 'transparent', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', cursor: 'pointer', minHeight: '240px', transition: 'border-color 0.2s, background 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'; e.currentTarget.style.background = 'rgba(212,168,67,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>
              <span style={{ fontSize: '0.875rem', color: 'var(--gray)', fontWeight: 600 }}>Add New Supplier</span>
            </div>
          </div>
        )}

        {/* Empty state (no vendors at all) */}
        {!loading && !error && suppliers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--gray)' }}>
            No vendors yet. Click "Add New Supplier" to get started.
          </div>
        )}
      </div>

      {/* Modals */}
      {(modal === 'form') && (
        <VendorFormModal
          vendor={selected}
          allVendors={suppliers}
          materials={materials}
          units={localUnits.length > 0 ? localUnits : units}
          onClose={closeModal}
          onSave={handleSave}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}

      {modal === 'delete' && selected && (
        <div onClick={() => { if (!isSubmitting) closeModal(); }} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '440px' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: '#E5E2E1' }}>Delete Vendor</h2>
            <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong style={{ color: '#E5E2E1' }}>{selected.name}</strong>? This cannot be undone.
            </p>
            {deleteError && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)', fontSize: '13px', color: 'var(--red)', marginBottom: '20px' }}>{deleteError}</div>}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={closeModal} disabled={isSubmitting} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--gray)', fontSize: '14px', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.6 : 1 }}>Cancel</button>
              <button onClick={handleDelete} disabled={isSubmitting} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--red)', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.6 : 1 }}>
                {isSubmitting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'catalog' && selected && (
        <VendorCatalogModal
          vendor={selected}
          materials={materials}
          inventory={inventory}
          onClose={closeModal}
        />
      )}
    </ErrorBoundary>
  );
}
