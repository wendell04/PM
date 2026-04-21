'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  fetchInventory,
} from '@/lib/inventoryApi';

// ─── Constants ────────────────────────────────────────────
const EMPTY_FORM = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  itemsSupplied: [],
};

// ─── SupplierForm ─────────────────────────────────────────
function SupplierForm({ initial = EMPTY_FORM, onSubmit, onCancel, isSubmitting, submitError }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  useEffect(() => { setForm(initial); setErrors({}); }, [initial]);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Vendor name is required.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Enter a valid email address.';
    if (form.phone && !/^[\d\s\-\+\(\)]{6,20}$/.test(form.phone))
      e.phone = 'Enter a valid phone number.';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSubmit(form);
  };

  const inputStyle = (hasError) => ({
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'var(--dark)',
    border: `1px solid ${hasError ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: '8px',
    color: 'var(--white)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  });

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--gray)',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Name */}
      <div>
        <label style={labelStyle}>Vendor name *</label>
        <input
          type="text"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. ABC Print Supplies"
          disabled={isSubmitting}
          style={inputStyle(!!errors.name)}
        />
        {errors.name && (
          <span style={{ fontSize: '12px', color: 'var(--red)', marginTop: '4px', display: 'block' }}>
            {errors.name}
          </span>
        )}
      </div>

      {/* Contact Person */}
      <div>
        <label style={labelStyle}>Contact Person</label>
        <input
          type="text"
          value={form.contactPerson}
          onChange={e => set('contactPerson', e.target.value)}
          placeholder="e.g. Juan dela Cruz"
          disabled={isSubmitting}
          style={inputStyle(false)}
        />
      </div>

      {/* Phone + Email row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Phone</label>
          <input
            type="text"
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="+63 912 345 6789"
            disabled={isSubmitting}
            style={inputStyle(!!errors.phone)}
          />
          {errors.phone && (
            <span style={{ fontSize: '12px', color: 'var(--red)', marginTop: '4px', display: 'block' }}>
              {errors.phone}
            </span>
          )}
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="supplier@example.com"
            disabled={isSubmitting}
            style={inputStyle(!!errors.email)}
          />
          {errors.email && (
            <span style={{ fontSize: '12px', color: 'var(--red)', marginTop: '4px', display: 'block' }}>
              {errors.email}
            </span>
          )}
        </div>
      </div>

      {/* Address */}
      <div>
        <label style={labelStyle}>Address</label>
        <input
          type="text"
          value={form.address}
          onChange={e => set('address', e.target.value)}
          placeholder="Street, City, Province"
          disabled={isSubmitting}
          style={inputStyle(false)}
        />
      </div>

      {/* Items supplied (catalog) */}
      <div>
        <label style={labelStyle}>Items supplied</label>
        <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: '0 0 8px' }}>
          Optional list of product lines this vendor supplies (name + unit).
        </p>
        {(form.itemsSupplied || []).map((row, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 36px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={row.name || ''}
              onChange={e => {
                const next = [...(form.itemsSupplied || [])];
                next[idx] = { ...next[idx], name: e.target.value };
                set('itemsSupplied', next);
              }}
              placeholder="Item name"
              disabled={isSubmitting}
              style={inputStyle(false)}
            />
            <input
              type="text"
              value={row.uom || ''}
              onChange={e => {
                const next = [...(form.itemsSupplied || [])];
                next[idx] = { ...next[idx], uom: e.target.value };
                set('itemsSupplied', next);
              }}
              placeholder="UOM"
              disabled={isSubmitting}
              style={inputStyle(false)}
            />
            <button
              type="button"
              onClick={() => {
                const next = (form.itemsSupplied || []).filter((_, i) => i !== idx);
                set('itemsSupplied', next);
              }}
              disabled={isSubmitting}
              style={{
                borderRadius: '8px',
                border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.1)',
                color: 'var(--red)',
                cursor: 'pointer',
                height: '36px',
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set('itemsSupplied', [...(form.itemsSupplied || []), { name: '', uom: '' }])}
          disabled={isSubmitting}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--gray)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          + Add line
        </button>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Optional notes about this vendor"
          rows={3}
          disabled={isSubmitting}
          style={{
            ...inputStyle(false),
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Submit error */}
      {submitError && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          backgroundColor: 'rgba(239,68,68,0.08)',
          border: '1px solid var(--red)',
          fontSize: '13px',
          color: 'var(--red)',
        }}>
          {submitError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--dark2)',
            color: 'var(--gray)',
            fontSize: '14px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="btn-primary"
          style={{ padding: '10px 24px', opacity: isSubmitting ? 0.6 : 1 }}
        >
          {isSubmitting ? 'Saving…' : 'Save vendor'}
        </button>
      </div>
    </div>
  );
}

function normalizeVendorList(list) {
  return (Array.isArray(list) ? list : []).map((v) => ({
    ...v,
    id: v.id ?? v._id,
  }));
}

// ─── Vendors tab (API) — embedded in Master Data ────────────────────────────
export default function VendorsApiTab({ onVendorsChange, showHeader = false }) {
  const { token } = useAuth();

  const [suppliers, setSuppliers]       = useState([]);
  const [inventory, setInventory]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState('');

  // Price History modal state
  const [priceHistorySupplier, setPriceHistorySupplier] = useState(null); // supplier object | null

  // Modal state
  const [modal, setModal]               = useState(null); // null | 'create' | 'edit' | 'delete'
  const [selected, setSelected]         = useState(null); // supplier being edited/deleted
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const [deleteError, setDeleteError]   = useState('');

  // ── Fetch ─────────────────────────────────────────────
  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [suppliersData, inventoryData] = await Promise.all([
        fetchSuppliers(token),
        fetchInventory(token).catch(() => []),
      ]);
      setSuppliers(normalizeVendorList(suppliersData));
      setInventory(Array.isArray(inventoryData) ? inventoryData : []);
    } catch (err) {
      setError(err.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  useEffect(() => {
    onVendorsChange?.(suppliers);
  }, [suppliers, onVendorsChange]);

  // ── Search filter (client-side) ───────────────────────
  const filtered = suppliers.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.contactPerson?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q)
    );
  });

  // ── Handlers ──────────────────────────────────────────
  const openCreate = () => {
    setSelected(null);
    setSubmitError('');
    setModal('create');
  };

  const openEdit = (supplier) => {
    setSelected(supplier);
    setSubmitError('');
    setModal('edit');
  };

  const openDelete = (supplier) => {
    setSelected(supplier);
    setDeleteError('');
    setModal('delete');
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);
    setSubmitError('');
    setDeleteError('');
  };

  const handleCreate = async (formData) => {
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        ...formData,
        itemsSupplied: (formData.itemsSupplied || []).filter((i) => (i.name || '').trim()),
      };
      await createSupplier(payload, token);
      await loadSuppliers();
      closeModal();
    } catch (err) {
      setSubmitError(err.message || 'Failed to create supplier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (formData) => {
    if (!selected) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        ...formData,
        itemsSupplied: (formData.itemsSupplied || []).filter((i) => (i.name || '').trim()),
      };
      await updateSupplier(selected.id ?? selected._id, payload, token);
      await loadSuppliers();
      closeModal();
    } catch (err) {
      setSubmitError(err.message || 'Failed to update supplier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setDeleteError('');
    try {
      await deleteSupplier(selected.id ?? selected._id, token);
      await loadSuppliers();
      closeModal();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete supplier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div style={{ padding: showHeader ? '24px' : '0', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        {showHeader && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <div>
            <h1 className="page-title">Vendors</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--gray)' }}>
              Manage your supply chain contacts
            </p>
          </div>
          <button
            onClick={openCreate}
            className="btn-primary"
            style={{ padding: '10px 20px' }}
          >
            Add vendor
          </button>
        </div>
        )}
        {!showHeader && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray)' }}>
            API-backed vendor records (shared with inventory and purchasing).
          </p>
          <button
            onClick={openCreate}
            className="btn-primary"
            style={{ padding: '10px 20px' }}
          >
            Add vendor
          </button>
        </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, contact, email, or phone..."
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '10px 14px',
              backgroundColor: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--white)',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)' }}>
            Loading vendors…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}>
            <span>{error}</span>
            <button
              onClick={loadSuppliers}
              style={{
                background: 'none',
                border: '1px solid var(--red)',
                borderRadius: '6px',
                color: 'var(--red)',
                padding: '4px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--gray)' }}>
            {search ? `No vendors match "${search}".` : 'No vendors yet. Add your first vendor.'}
          </div>
        )}

        {/* Supplier cards */}
        {!loading && !error && filtered.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}>
            {filtered.map(supplier => (
              <div
                key={supplier.id ?? supplier._id}
                style={{
                  backgroundColor: 'var(--dark2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '2px' }}>
                      {supplier.name}
                    </div>
                    {supplier.contactPerson && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                        {supplier.contactPerson}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setPriceHistorySupplier(supplier)}
                      style={{
                        background: 'none',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        color: 'var(--gold)',
                        padding: '4px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Price History
                    </button>
                    <button
                      onClick={() => openEdit(supplier)}
                      style={{
                        background: 'none',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        color: 'var(--gold)',
                        padding: '4px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openDelete(supplier)}
                      style={{
                        background: 'none',
                        border: '1px solid var(--red)',
                        borderRadius: '6px',
                        color: 'var(--red)',
                        padding: '4px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Contact details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {supplier.phone && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray)', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--gold)', minWidth: '52px' }}>Phone</span>
                      <span style={{ color: 'var(--white)' }}>{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.email && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray)', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--gold)', minWidth: '52px' }}>Email</span>
                      <span style={{ color: 'var(--white)' }}>{supplier.email}</span>
                    </div>
                  )}
                  {supplier.address && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray)', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--gold)', minWidth: '52px' }}>Address</span>
                      <span style={{ color: 'var(--white)' }}>{supplier.address}</span>
                    </div>
                  )}
                  {supplier.notes && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray)', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--gold)', minWidth: '52px' }}>Notes</span>
                      <span style={{ color: 'var(--white)', fontStyle: 'italic' }}>{supplier.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Modal ──────────────────────────────────── */}
      {modal === 'create' && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 24px', fontSize: '1.25rem', fontWeight: 700, color: 'var(--white)' }}>
              Add vendor
            </h2>
            <SupplierForm
              initial={EMPTY_FORM}
              onSubmit={handleCreate}
              onCancel={closeModal}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          </div>
        </div>
      )}

      {/* ── Edit Modal ────────────────────────────────────── */}
      {modal === 'edit' && selected && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 24px', fontSize: '1.25rem', fontWeight: 700, color: 'var(--white)' }}>
              Edit vendor
            </h2>
            <SupplierForm
              initial={{
                name: selected.name || '',
                contactPerson: selected.contactPerson || '',
                phone: selected.phone || '',
                email: selected.email || '',
                address: selected.address || '',
                notes: selected.notes || '',
                itemsSupplied: (Array.isArray(selected.itemsSupplied) ? selected.itemsSupplied : []).map(
                  item => typeof item === 'string' ? { name: item, uom: 'pcs' } : { name: item.name || '', uom: item.uom || 'pcs' }
                ),
              }}
              onSubmit={handleUpdate}
              onCancel={closeModal}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────── */}
      {modal === 'delete' && selected && (
        <div
          onClick={e => { if (!isSubmitting) closeModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '440px',
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 700, color: 'var(--white)' }}>
              Delete vendor
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Are you sure you want to delete{' '}
              <strong style={{ color: 'var(--white)' }}>{selected.name}</strong>?
              This action cannot be undone.
            </p>

            {deleteError && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid var(--red)',
                fontSize: '13px',
                color: 'var(--red)',
                marginBottom: '20px',
              }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--dark)',
                  color: 'var(--gray)',
                  fontSize: '14px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--red)',
                  color: 'var(--white)',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Price History Modal ──────────────────────────────────── */}
      {priceHistorySupplier && (() => {
        const supplierId = priceHistorySupplier._id || priceHistorySupplier.id;

        // Collect all batches from inventory where supplierId matches
        const rows = [];
        inventory.forEach(item => {
          (item.batches || []).forEach(batch => {
            if (String(batch.supplierId ?? '') === String(supplierId ?? '')) {
              rows.push({
                itemName:      item.name,
                itemCategory:  item.category,
                batchId:       batch.batchId,
                invoiceNumber: batch.invoiceNumber || batch.invoiceNumber || null,
                dateReceived:  batch.dateReceived,
                unitCost:      batch.unitCost ?? 0,
                originalQty:   batch.originalQty ?? batch.goodQty ?? 0,
                goodQty:       batch.goodQty ?? batch.originalQty ?? 0,
              });
            }
          });
        });

        // Sort newest first
        rows.sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));

        // Group by item for summary: last price, min price, max price
        const byItem = {};
        rows.forEach(r => {
          if (!byItem[r.itemName]) {
            byItem[r.itemName] = { category: r.itemCategory, prices: [] };
          }
          byItem[r.itemName].prices.push(r.unitCost);
        });

        return (
          <div
            onClick={() => setPriceHistorySupplier(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--dark2)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '32px',
                width: '100%',
                maxWidth: '780px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--white)' }}>
                    Price History
                  </h2>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gold)', fontWeight: 600, marginTop: '2px' }}>
                    {priceHistorySupplier.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '2px' }}>
                    {rows.length} purchase record{rows.length !== 1 ? 's' : ''} across {Object.keys(byItem).length} item{Object.keys(byItem).length !== 1 ? 's' : ''}
                  </div>
                </div>
                <button
                  onClick={() => setPriceHistorySupplier(null)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--gray)',
                    cursor: 'pointer', padding: '4px', flexShrink: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {rows.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>
                  No purchase records found for this supplier.
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    Records appear here when stock is added with this supplier selected.
                  </div>
                </div>
              ) : (
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Per-item price summary */}
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                      Price Summary by Item
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                      {Object.entries(byItem).map(([itemName, { category, prices }]) => {
                        const last   = prices[0];
                        const minP   = Math.min(...prices);
                        const maxP   = Math.max(...prices);
                        const hasVar = prices.length > 1 && minP !== maxP;
                        return (
                          <div key={itemName} style={{
                            padding: '12px 14px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                          }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)', marginBottom: '2px' }}>{itemName}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '8px' }}>{category}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                                Last price: <strong style={{ color: 'var(--gold)' }}>₱{last.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                              </div>
                              {hasVar && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                                  Range: <span style={{ color: 'rgba(34,197,94,0.95)' }}>₱{minP.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  {' — '}
                                  <span style={{ color: 'rgba(239,68,68,0.95)' }}>₱{maxP.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              )}
                              <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                                {prices.length} purchase{prices.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Full transaction log */}
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                      Full Purchase Log
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '2px solid var(--border)' }}>
                            {['Date', 'Item', 'Category', 'Invoice', 'Qty', 'Unit Cost'].map(h => (
                              <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Unit Cost' || h === 'Qty' ? 'center' : 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => (
                            <tr key={`${row.batchId}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                              <td style={{ padding: '10px 12px', color: 'var(--gray)', whiteSpace: 'nowrap' }}>
                                {new Date(row.dateReceived).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                              </td>
                              <td style={{ padding: '10px 12px', color: 'var(--white)', fontWeight: 600 }}>
                                {row.itemName}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: '4px' }}>
                                  {row.itemCategory}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: 'var(--gray)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                {row.invoiceNumber || <em style={{ fontStyle: 'italic', opacity: 0.5 }}>N/A</em>}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--white)' }}>
                                {row.originalQty} pcs
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--gold)' }}>
                                ₱{row.unitCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => setPriceHistorySupplier(null)}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--dark)',
                    color: 'var(--gray)',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </ErrorBoundary>
  );
}
