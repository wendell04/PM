'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

function CategoryCombobox({ options, value, onChange, inputStyle, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = (options || []).filter((o) => !query || o.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = (options || []).some((o) => o.toLowerCase() === query.trim().toLowerCase());

  const select = (name) => { onChange(name); setQuery(name); setOpen(false); };

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setOpen(true);
  };

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || 'Select or type a category...'}
          style={{ ...inputStyle, paddingRight: '2.25rem', width: '100%', boxSizing: 'border-box' }}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: 0, display: 'flex', alignItems: 'center' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points={open ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
          </svg>
        </button>
      </div>
      {open && (filtered.length > 0 || (query.trim() && !exactMatch)) && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300, background: 'var(--dark2, #1a1a1a)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: '180px', overflowY: 'auto' }}>
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={() => select(name)}
              style={{ display: 'block', width: '100%', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#E5E2E1', fontSize: '0.82rem', textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(212,168,67,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {name}
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={() => { onChange(query.trim()); setOpen(false); }}
              style={{ display: 'block', width: '100%', padding: '0.55rem 0.75rem', background: 'rgba(212,168,67,0.06)', border: 'none', borderTop: filtered.length > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none', color: '#D4A843', fontSize: '0.82rem', textAlign: 'left', cursor: 'pointer', fontWeight: 600 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(212,168,67,0.15)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(212,168,67,0.06)')}
            >
              + Use &ldquo;{query.trim()}&rdquo; as new category
            </button>
          )}
        </div>
      )}
    </div>
  );
}
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


function normalizeVendor(v) {
  const base = { ...v, id: v.id ?? v._id };
  return {
    ...base,
    contacts: Array.isArray(base.contacts) ? base.contacts : (base.contactPerson ? [base.contactPerson] : []),
    phones:   Array.isArray(base.phones)   ? base.phones   : (base.phone        ? [base.phone]        : []),
    emails:   Array.isArray(base.emails)   ? base.emails   : (base.email        ? [base.email]        : []),
  };
}

function normalizeVendorList(list) {
  return (Array.isArray(list) ? list : []).map(normalizeVendor);
}

// ─── Vendor Catalog Modal ──────────────────────────────────
function VendorCatalogModal({ vendor, materials, inventory, onClose }) {
  const [catalogSearch, setCatalogSearch] = useState('');
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Purchase History ({batchRows.length} batches)
                </div>
                <div style={{ position: 'relative' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <input
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Filter by item or invoice..."
                    style={{ padding: '0.4rem 0.75rem 0.4rem 1.75rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '6px', color: '#E5E2E1', fontSize: '0.75rem', outline: 'none', width: '200px' }}
                  />
                </div>
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
                  {batchRows.filter((r) => {
                    if (!catalogSearch.trim()) return true;
                    const q = catalogSearch.toLowerCase();
                    return r.itemName?.toLowerCase().includes(q) || r.invoiceNumber?.toLowerCase().includes(q);
                  }).map((r, i) => (
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
    contact: [],
    phones: [],
    emails: [],
    address: '',
    notes: '',
    itemsSupplied: [],
  });
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [itemNameInput, setItemNameInput] = useState('');
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

  const availableCategories = useMemo(() => {
    const seen = new Set();
    (materials || []).forEach((m) => { if (m.category) seen.add(m.category); });
    (allVendors || []).forEach((v) => {
      (v.itemsSupplied || []).forEach((item) => {
        const name = typeof item === 'string' ? item : item.name;
        if (name) seen.add(name);
      });
    });
    return [...seen].sort();
  }, [materials, allVendors]);

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name || '',
        contact: Array.isArray(vendor.contacts) ? vendor.contacts : (vendor.contactPerson ? [vendor.contactPerson] : []),
        phones:  Array.isArray(vendor.phones)   ? vendor.phones   : (vendor.phone        ? [vendor.phone]        : []),
        emails:  Array.isArray(vendor.emails)   ? vendor.emails   : (vendor.email        ? [vendor.email]        : []),
        address: vendor.address || '',
        notes: vendor.notes || '',
        itemsSupplied: (Array.isArray(vendor.itemsSupplied) ? vendor.itemsSupplied : []).map(
          (item) => typeof item === 'string' ? { name: item, uom: 'pcs' } : { name: item.name || '', uom: item.uom || 'pcs' }
        ),
      });
    } else {
      setForm({ name: '', contact: [], phones: [], emails: [], address: '', notes: '', itemsSupplied: [] });
    }
    setItemNameInput('');
    setNewContact('');
    setNewPhone('');
    setNewEmail('');
    setErrors({});
  }, [vendor]);

  const fInStyle = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', padding: '0.625rem 0.75rem', fontSize: '0.85rem', outline: 'none' };
  const fInErrStyle = { ...fInStyle, borderColor: '#ef4444' };
  const addBtn = { background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#D4A843', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
  const chipStyle = { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.75rem', color: '#E5E2E1' };
  const chipXBtn = { background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, display: 'flex' };

  const addItem = () => {
    const trimmed = itemNameInput.trim();
    if (!trimmed) return;
    if ((form.itemsSupplied || []).some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) return;
    setForm((p) => ({ ...p, itemsSupplied: [...(p.itemsSupplied || []), { name: trimmed, uom: 'pcs' }] }));
    setItemNameInput('');
  };

  const removeItem = (idx) => {
    if (usedItems.has(form.itemsSupplied[idx]?.name)) return;
    setForm((p) => ({ ...p, itemsSupplied: p.itemsSupplied.filter((_, i) => i !== idx) }));
  };

  const addContact = () => {
    const trimmed = newContact.trim();
    if (!trimmed || form.contact.includes(trimmed)) return;
    setForm((p) => ({ ...p, contact: [...p.contact, trimmed] }));
    setNewContact('');
    if (errors.contact) setErrors((er) => ({ ...er, contact: '' }));
  };

  const addPhone = () => {
    const trimmed = newPhone.trim();
    if (!trimmed || form.phones.includes(trimmed)) return;
    setForm((p) => ({ ...p, phones: [...p.phones, trimmed] }));
    setNewPhone('');
    if (errors.phone) setErrors((er) => ({ ...er, phone: '' }));
  };

  const addEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed || form.emails.includes(trimmed)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrors((er) => ({ ...er, email: 'Enter a valid email address.' }));
      return;
    }
    setForm((p) => ({ ...p, emails: [...p.emails, trimmed] }));
    setNewEmail('');
    if (errors.email) setErrors((er) => ({ ...er, email: '' }));
  };

  const handlePhoneInput = (val) => {
    let cleaned = val.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+63')) cleaned = '+63' + cleaned.slice(3).replace(/[^0-9]/g, '').slice(0, 10);
    else if (cleaned.startsWith('0')) cleaned = '0' + cleaned.slice(1).replace(/[^0-9]/g, '').slice(0, 10);
    else cleaned = cleaned.replace(/[^0-9]/g, '').slice(0, 11);
    setNewPhone(cleaned);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Company name is required';
    if ((form.itemsSupplied || []).filter((i) => i.name?.trim()).length === 0) newErrors.items = 'Add at least one item';
    if (form.contact.length === 0) newErrors.contact = 'Add at least one contact person';
    if (form.phones.length === 0) newErrors.phone = 'Add at least one phone number';
    if (form.emails.length === 0) newErrors.email = 'Add at least one email';
    if (!form.address.trim()) newErrors.address = 'Address is required';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    onSave({
      name: form.name,
      contacts: form.contact,
      phones: form.phones,
      emails: form.emails,
      address: form.address,
      notes: form.notes,
      itemsSupplied: (form.itemsSupplied || []).filter((i) => i.name?.trim()),
    });
  };

  const uomOptions = units && units.length > 0
    ? units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)
    : [
        <option key="pcs" value="pcs">Pieces</option>,
        <option key="bottle" value="bottle">Bottle</option>,
        <option key="liter" value="liter">Liter</option>,
        <option key="kg" value="kg">Kilogram</option>,
        <option key="meter" value="meter">Meter</option>,
        <option key="roll" value="roll">Roll</option>,
        <option key="box" value="box">Box</option>,
        <option key="pack" value="pack">Pack</option>,
        <option key="set" value="set">Set</option>,
      ];

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{vendor ? 'Edit Vendor' : 'Add New Vendor'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Company Name */}
            <div>
              <label className="form-label">
                Company Name <span className="required">*</span>
                {hasLinkedMaterials && (
                  <span style={{ fontSize: '0.65rem', color: '#f59e0b', marginLeft: '0.5rem', fontWeight: 600 }}>
                    (Locked: {linkedMaterials.length} material{linkedMaterials.length > 1 ? 's' : ''} linked)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value.slice(0, 100) })); if (errors.name) setErrors((er) => ({ ...er, name: '' })); }}
                placeholder="e.g., Global Garments Inc."
                maxLength={100}
                readOnly={hasLinkedMaterials}
                style={hasLinkedMaterials ? { ...fInStyle, opacity: 0.5, cursor: 'not-allowed' } : { ...fInStyle, borderColor: errors.name ? '#ef4444' : undefined }}
              />
              {errors.name && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.2rem', display: 'block' }}>{errors.name}</span>}
            </div>

            {/* Items Supplied */}
            <div>
              <label className="form-label">
                Items Supplied <span className="required">*</span>
                {hasLinkedMaterials && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--gray)', marginLeft: '0.5rem', fontWeight: 400 }}>(Locked items cannot be removed)</span>
                )}
              </label>
              {errors.items && <span style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: '0.3rem', display: 'block' }}>{errors.items}</span>}
              {(form.itemsSupplied || []).length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {(form.itemsSupplied || []).map((item, i) => {
                    const isUsed = usedItems.has(item.name);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.5rem 0.75rem', background: isUsed ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isUsed ? 'rgba(212,168,67,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.82rem', color: '#E5E2E1', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase' }}>{item.uom || 'pcs'}</span>
                        </div>
                        {isUsed ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2.5" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                        ) : (
                          <button type="button" onClick={() => removeItem(i)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.2rem 0.4rem', cursor: 'pointer', color: '#f87171', lineHeight: 1, fontSize: '0.7rem' }}>✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <CategoryCombobox
                  options={availableCategories.filter((n) => !(form.itemsSupplied || []).some((i) => i.name?.toLowerCase() === n.toLowerCase()))}
                  value={itemNameInput}
                  onChange={setItemNameInput}
                  inputStyle={fInStyle}
                />
                <button type="button" className="btn-primary" onClick={addItem} style={{ padding: '0 1rem', whiteSpace: 'nowrap', flexShrink: 0 }}>+ Add</button>
              </div>
            </div>

            {/* Contact Person */}
            <div>
              <label className="form-label">Contact Person <span className="required">*</span></label>
              {form.contact.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {form.contact.map((c, idx) => (
                    <span key={idx} style={chipStyle}>
                      {c}
                      <button type="button" onClick={() => setForm((p) => ({ ...p, contact: p.contact.filter((_, i) => i !== idx) }))} style={chipXBtn}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" style={fInStyle} value={newContact}
                  onChange={(e) => setNewContact(e.target.value.slice(0, 80))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addContact(); } }}
                  placeholder="Juan Dela Cruz" maxLength={80}
                />
                <button type="button" onClick={addContact} style={addBtn}>+ Add</button>
              </div>
              {errors.contact && <p style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.25rem' }}>{errors.contact}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="form-label">Email <span className="required">*</span></label>
              {form.emails.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {form.emails.map((e, idx) => (
                    <span key={idx} style={chipStyle}>
                      {e}
                      <button type="button" onClick={() => setForm((p) => ({ ...p, emails: p.emails.filter((_, i) => i !== idx) }))} style={chipXBtn}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="email" style={fInStyle} value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value.slice(0, 100)); if (errors.email) setErrors((er) => ({ ...er, email: '' })); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                  placeholder="vendor@email.com" maxLength={100}
                />
                <button type="button" onClick={addEmail} style={addBtn}>+ Add</button>
              </div>
              {errors.email && <p style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.25rem' }}>{errors.email}</p>}
            </div>

            {/* Phone */}
            <div>
              <label className="form-label">Phone <span className="required">*</span></label>
              {form.phones.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {form.phones.map((ph, idx) => (
                    <span key={idx} style={chipStyle}>
                      {ph}
                      <button type="button" onClick={() => setForm((p) => ({ ...p, phones: p.phones.filter((_, i) => i !== idx) }))} style={chipXBtn}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" style={fInStyle} value={newPhone}
                  onChange={(e) => handlePhoneInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhone(); } }}
                  placeholder="09xx-xxx-xxxx" maxLength={15} inputMode="tel"
                />
                <button type="button" onClick={addPhone} style={addBtn}>+ Add</button>
              </div>
              {errors.phone && <p style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.25rem' }}>{errors.phone}</p>}
            </div>

            {/* Address */}
            <div>
              <label className="form-label">Address <span className="required">*</span></label>
              <textarea
                style={{ ...fInStyle, resize: 'vertical', minHeight: '60px' }}
                value={form.address}
                onChange={(e) => { setForm((p) => ({ ...p, address: e.target.value.slice(0, 200) })); if (errors.address) setErrors((er) => ({ ...er, address: '' })); }}
                placeholder="Full address" maxLength={200}
              />
              {errors.address && <p style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: '0.25rem' }}>{errors.address}</p>}
            </div>

            {submitError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)', fontSize: '13px', color: 'var(--red)' }}>
                {submitError}
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ opacity: isSubmitting ? 0.6 : 1 }}>
              {isSubmitting ? 'Saving…' : (vendor ? 'Save Changes' : 'Save Vendor')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────
export default function VendorsApiTab({ onVendorsChange, materials = [], units = [], onOpenUnits }) {
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
    // Phase 1: load suppliers + units fast (shows cards immediately)
    const [suppliersResult, unitsResult] = await Promise.allSettled([
      fetchSuppliers(token),
      fetchUnits(token),
    ]);
    if (suppliersResult.status === 'fulfilled') {
      setSuppliers(normalizeVendorList(suppliersResult.value));
      setError(null);
    } else {
      setError(suppliersResult.reason?.message || 'Failed to load suppliers.');
    }
    if (unitsResult.status === 'fulfilled' && Array.isArray(unitsResult.value)) {
      setLocalUnits(unitsResult.value.map((u) => ({
        id: u._id || u.id,
        code: u.abbreviation || u.code || '',
        name: u.name,
      })));
    }
    setLoading(false);
    // Phase 2: load inventory in background (only needed for catalog modal)
    fetchInventory(token).then((d) => {
      if (Array.isArray(d)) setInventory(d);
    }).catch(() => {});
  }, [token]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  useEffect(() => { onVendorsChange?.(suppliers); }, [suppliers, onVendorsChange]);

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter((s) =>
      s.name?.toLowerCase().includes(q) ||
      (s.contacts || []).some((c) => c.toLowerCase().includes(q)) ||
      (s.emails || []).some((e) => e.toLowerCase().includes(q)) ||
      (s.phones || []).some((p) => p.toLowerCase().includes(q)),
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
          {/* Search + Add */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div className="search-wrapper" style={{ maxWidth: '300px' }}>
              <span className="search-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              </span>
              <input className="search-input" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {onOpenUnits && (
                <button
                  type="button"
                  onClick={onOpenUnits}
                  style={{ padding: "0.625rem 1rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--gray)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="16" width="20" height="4" rx="1"/></svg>
                  Units
                </button>
              )}
              <button className="btn-primary" onClick={openCreate}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                Add New Vendor
              </button>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            <style>{`@keyframes vSkel{0%,100%{background-position:-400px 0}100%{background-position:400px 0}}.v-skel{background:linear-gradient(90deg,var(--dark2) 25%,var(--dark3,#2a2a2a) 50%,var(--dark2) 75%);background-size:400px 100%;animation:vSkel 1.4s ease-in-out infinite;border-radius:8px;}`}</style>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="v-skel" style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                    <div className="v-skel" style={{ height: '16px', width: '60%' }} />
                    <div className="v-skel" style={{ height: '12px', width: '40%' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div className="v-skel" style={{ height: '13px' }} />
                  <div className="v-skel" style={{ height: '13px', width: '80%' }} />
                  <div className="v-skel" style={{ height: '13px', width: '55%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

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
                      <button onClick={() => openDelete(v)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '0.35rem', cursor: 'pointer', color: 'var(--red)' }} title="Delete">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.825rem' }}>
                    {(v.contacts || []).length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#E5E2E1' }}>
                        <span style={{ color: 'var(--gray)', flexShrink: 0 }}><PersonIcon /></span>
                        {v.contacts[0]}
                        {v.contacts.length > 1 && <span style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>+{v.contacts.length - 1}</span>}
                      </div>
                    )}
                    {(v.phones || []).length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#E5E2E1' }}>
                        <span style={{ color: 'var(--gray)', flexShrink: 0 }}><PhoneIcon /></span> {v.phones[0]}
                      </div>
                    )}
                    {(v.emails || []).length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray)' }}>
                        <span style={{ flexShrink: 0 }}><EmailIcon /></span> {v.emails[0]}
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
