'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  toggleVoucher,
} from '@/lib/voucherApi';
import ErrorBoundary from '@/components/ErrorBoundary';

const EMPTY_FORM = {
  code: '',
  discountType: 'percentage',
  discountValue: '',
  minOrderAmount: '',
  maxUses: '',
  isActive: true,
  expiresAt: '',
};

export default function VouchersPage() {
  const { token } = useAuth();
  const [vouchers, setVouchers]     = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = create, object = edit
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formError, setFormError]   = useState(null);
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState(null);
  const [deleting, setDeleting]     = useState(false);
  const [vPage, setVPage]           = useState(1);
  const [vRpp, setVRpp]             = useState(10);

  const load = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchVouchers(token);
      setVouchers(data.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setVPage(1); }, [vouchers.length]);

  const vTotalPages = Math.max(1, Math.ceil(vouchers.length / vRpp));
  const pagedVouchers = vouchers.slice((vPage - 1) * vRpp, vPage * vRpp);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(v) {
    setEditTarget(v);
    setForm({
      code:           v.code || '',
      discountType:   v.discountType || 'percentage',
      discountValue:  String(v.discountValue || ''),
      minOrderAmount: v.minOrderAmount != null ? String(v.minOrderAmount) : '',
      maxUses:        v.maxUses != null ? String(v.maxUses) : '',
      isActive:       v.isActive ?? true,
      expiresAt:      v.expiresAt ? v.expiresAt.slice(0, 10) : '',
    });
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function validate() {
    if (!form.code.trim())                      return 'Code is required.';
    const val = parseFloat(form.discountValue);
    if (!form.discountValue || isNaN(val) || val <= 0) return 'Discount value must be greater than 0.';
    if (form.discountType === 'percentage' && val >= 100) return 'Percentage discount must be less than 100%.';
    if (form.minOrderAmount && isNaN(parseFloat(form.minOrderAmount))) return 'Minimum order must be a number.';
    if (form.maxUses && (!Number.isInteger(Number(form.maxUses)) || Number(form.maxUses) < 1)) return 'Max uses must be a positive integer.';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        code:           form.code.trim().toUpperCase(),
        discountType:   form.discountType,
        discountValue:  parseFloat(form.discountValue),
        minOrderAmount: form.minOrderAmount ? parseFloat(form.minOrderAmount) : null,
        maxUses:        form.maxUses ? parseInt(form.maxUses) : null,
        isActive:       form.isActive,
        expiresAt:      form.expiresAt || null,
      };
      if (editTarget) {
        await updateVoucher(token, editTarget._id ?? editTarget.id, payload);
      } else {
        await createVoucher(token, payload);
      }
      closeModal();
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(v) {
    try {
      await toggleVoucher(token, v._id ?? v.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteVoucher(token, deleteId);
      setDeleteId(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'var(--dark)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--white)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    color: 'var(--gray)',
    marginBottom: '0.375rem',
  };

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <style>{`
          @keyframes vchPageSkel { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        `}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                height: '56px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)',
                animation: 'vchPageSkel 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Vouchers</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--gray)' }}>
            Create and manage discount codes for customers
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            padding: '10px 20px',
            backgroundColor: 'var(--gold)',
            color: 'var(--black)',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          + New Voucher
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginBottom: '1rem', padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {vouchers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>No vouchers yet. Create one to get started.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Code', 'Discount', 'Min Order', 'Uses', 'Expires', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedVouchers.map((v, idx) => {
                const isExpired = v.expiresAt && new Date(v.expiresAt) < new Date();
                const isMaxed   = v.maxUses != null && v.usedCount >= v.maxUses;
                return (
                  <tr key={String(v.id ?? v._id ?? idx)} style={{ borderBottom: '1px solid var(--border)', opacity: (!v.isActive || isExpired || isMaxed) ? 0.6 : 1 }}>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--gold)', fontWeight: 700, fontFamily: 'monospace' }}>{v.code}</td>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--white)' }}>
                      {v.discountType === 'percentage' ? `${v.discountValue}%` : `₱${Number(v.discountValue).toLocaleString()} OFF`}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--white)' }}>
                      {v.minOrderAmount != null ? `₱${Number(v.minOrderAmount).toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--white)' }}>
                      {v.usedCount ?? 0}{v.maxUses != null ? ` / ${v.maxUses}` : ' / ∞'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: isExpired ? 'var(--red)' : 'var(--white)' }}>
                      {v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: v.isActive && !isExpired && !isMaxed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                        color: v.isActive && !isExpired && !isMaxed ? 'var(--green)' : 'var(--red)',
                      }}>
                        {!v.isActive ? 'Inactive' : isExpired ? 'Expired' : isMaxed ? 'Maxed' : 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => openEdit(v)} style={{ padding: '5px 12px', background: 'var(--border)', border: 'none', borderRadius: '6px', color: 'var(--white)', fontSize: '0.78rem', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => handleToggle(v)} style={{ padding: '5px 12px', background: v.isActive ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)', border: 'none', borderRadius: '6px', color: v.isActive ? 'var(--red)' : 'var(--green)', fontSize: '0.78rem', cursor: 'pointer' }}>
                          {v.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => setDeleteId(v._id ?? v.id)} style={{ padding: '5px 12px', background: 'rgba(239,68,68,0.12)', border: 'none', borderRadius: '6px', color: 'var(--red)', fontSize: '0.78rem', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {vouchers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--gray)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Rows per page:
              <select value={vRpp} onChange={e => { setVRpp(Number(e.target.value)); setVPage(1); }} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--white)', padding: '0.2rem 0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <button onClick={() => setVPage(p => Math.max(1, p - 1))} disabled={vPage <= 1} style={{ padding: '0.25rem 0.625rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: vPage <= 1 ? 'var(--gray)' : 'var(--white)', cursor: vPage <= 1 ? 'not-allowed' : 'pointer' }}>‹</button>
              <button onClick={() => setVPage(p => Math.min(vTotalPages, p + 1))} disabled={vPage >= vTotalPages} style={{ padding: '0.25rem 0.625rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: vPage >= vTotalPages ? 'var(--gray)' : 'var(--white)', cursor: vPage >= vTotalPages ? 'not-allowed' : 'pointer' }}>›</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Page: <span style={{ padding: '0.2rem 0.6rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--white)', minWidth: '28px', textAlign: 'center' }}>{vPage}</span> of {vTotalPages}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '480px' }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>
              {editTarget ? 'Edit Voucher' : 'New Voucher'}
            </h2>

            {formError && (
              <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.85rem' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Code */}
              <div>
                <label style={labelStyle}>Code <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. SAVE20"
                  style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' }}
                />
              </div>

              {/* Discount Type */}
              <div>
                <label style={labelStyle}>Discount Type <span style={{ color: 'var(--red)' }}>*</span></label>
                <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))} style={inputStyle}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₱)</option>
                </select>
              </div>

              {/* Discount Value */}
              <div>
                <label style={labelStyle}>
                  {form.discountType === 'percentage' ? 'Discount (%)' : 'Discount Amount (₱)'} <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.discountValue}
                  onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                  placeholder={form.discountType === 'percentage' ? 'e.g. 20' : 'e.g. 100'}
                  style={inputStyle}
                />
              </div>

              {/* Min Order */}
              <div>
                <label style={labelStyle}>Minimum Order Amount (₱) <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(optional)</span></label>
                <input type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={e => setForm(f => ({ ...f, minOrderAmount: e.target.value }))} placeholder="e.g. 500" style={inputStyle} />
              </div>

              {/* Max Uses */}
              <div>
                <label style={labelStyle}>Max Uses <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(optional — leave blank for unlimited)</span></label>
                <input type="number" min="1" step="1" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="e.g. 100" style={inputStyle} />
              </div>

              {/* Expires At */}
              <div>
                <label style={labelStyle}>Expiry Date <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(optional)</span></label>
                <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={inputStyle} />
              </div>

              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--white)' }}>Active</div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: form.isActive ? 'var(--gold)' : 'var(--border)', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}
                >
                  <span style={{ position: 'absolute', top: '2px', left: form.isActive ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'var(--white)', transition: 'left 0.2s' }} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={closeModal} disabled={saving} style={{ flex: 1, padding: '10px', background: 'var(--border)', border: 'none', borderRadius: '8px', color: 'var(--white)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '10px', background: 'var(--gold)', border: 'none', borderRadius: '8px', color: 'var(--black)', fontWeight: 700, fontSize: '0.875rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '380px' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--white)', fontSize: '1rem', fontWeight: 700 }}>Delete Voucher?</h3>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--gray)', fontSize: '0.875rem' }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeleteId(null)} disabled={deleting} style={{ flex: 1, padding: '10px', background: 'var(--border)', border: 'none', borderRadius: '8px', color: 'var(--white)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '10px', background: 'var(--red)', border: 'none', borderRadius: '8px', color: 'var(--white)', fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}

