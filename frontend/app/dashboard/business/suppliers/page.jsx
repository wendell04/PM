'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '@/lib/inventoryApi';

// ─── Constants ────────────────────────────────────────────
const EMPTY_FORM = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
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
    if (!form.name.trim()) e.name = 'Supplier name is required.';
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
    border: `1px solid ${hasError ? 'var(--danger, #ef4444)' : 'var(--border)'}`,
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
        <label style={labelStyle}>Supplier Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. ABC Print Supplies"
          disabled={isSubmitting}
          style={inputStyle(!!errors.name)}
        />
        {errors.name && (
          <span style={{ fontSize: '12px', color: 'var(--danger, #ef4444)', marginTop: '4px', display: 'block' }}>
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
            <span style={{ fontSize: '12px', color: 'var(--danger, #ef4444)', marginTop: '4px', display: 'block' }}>
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
            <span style={{ fontSize: '12px', color: 'var(--danger, #ef4444)', marginTop: '4px', display: 'block' }}>
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

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Optional notes about this supplier"
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
          border: '1px solid var(--danger, #ef4444)',
          fontSize: '13px',
          color: 'var(--danger, #ef4444)',
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
          {isSubmitting ? 'Saving...' : 'Save Supplier'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function SuppliersPage() {
  const { token } = useAuth();

  const [suppliers, setSuppliers]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState('');

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
      const data = await fetchSuppliers(token);
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

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
      await createSupplier(formData, token);
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
      await updateSupplier(selected.id ?? selected._id, formData, token);
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
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>
              Suppliers
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--gray)' }}>
              Manage your supply chain contacts
            </p>
          </div>
          <button
            onClick={openCreate}
            className="btn-primary"
            style={{ padding: '10px 20px' }}
          >
            + Add Supplier
          </button>
        </div>

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
            Loading suppliers...
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid var(--danger, #ef4444)',
            color: 'var(--danger, #ef4444)',
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
                border: '1px solid var(--danger, #ef4444)',
                borderRadius: '6px',
                color: 'var(--danger, #ef4444)',
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
            {search ? `No suppliers match "${search}".` : 'No suppliers yet. Add your first supplier.'}
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
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
                        border: '1px solid var(--danger, #ef4444)',
                        borderRadius: '6px',
                        color: 'var(--danger, #ef4444)',
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
              Add Supplier
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
              Edit Supplier
            </h2>
            <SupplierForm
              initial={{
                name: selected.name || '',
                contactPerson: selected.contactPerson || '',
                phone: selected.phone || '',
                email: selected.email || '',
                address: selected.address || '',
                notes: selected.notes || '',
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
              Delete Supplier
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
                border: '1px solid var(--danger, #ef4444)',
                fontSize: '13px',
                color: 'var(--danger, #ef4444)',
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
                  background: 'var(--danger, #ef4444)',
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
    </ErrorBoundary>
  );
}
