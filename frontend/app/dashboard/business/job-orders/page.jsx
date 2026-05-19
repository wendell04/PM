'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  fetchJobOrders,
  fetchJobOrderSchedule,
  createJobOrder,
  updateJobOrder,
} from '@/lib/jobOrderApi';
import { fetchAllOrders } from '@/lib/ordersApi';
import CustomDropdown from '@/app/components/CustomDropdown';

// ─── Constants ────────────────────────────────────────────
const JO_STATUSES = ['Queued', 'In Progress', 'Completed'];

const STATUS_COLORS = {
  'Queued':      { bg: 'rgba(234,179,8,0.12)',  color: 'var(--gold)' },
  'In Progress': { bg: 'rgba(59,130,246,0.12)', color: 'var(--blue)' },
  'Completed':   { bg: 'rgba(34,197,94,0.12)',  color: 'var(--green)' },
};

const EMPTY_FORM = {
  orderId: '',
  productName: '',
  productVariant: '',
  productQuantity: '',
  targetCompletion: '',
  isRush: false,
  assignedTo: '',
  notes: '',
  designNotes: '',
  designFilePath: '',
  adminComment: '',
};

// ─── Helpers ──────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: 'rgba(107,114,128,0.15)', color: 'var(--gray)' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: 700,
      background: s.bg,
      color: s.color,
      letterSpacing: '0.3px',
    }}>
      {status}
    </span>
  );
}

// ─── JobOrderForm ─────────────────────────────────────────
function JobOrderForm({
  initial = EMPTY_FORM,
  isEdit = false,
  orders = [],
  ordersLoading = false,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  useEffect(() => { setForm(initial); setErrors({}); }, [initial]);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!isEdit && !form.orderId) e.orderId = 'Please select an order.';
    if (!form.productName.trim()) e.productName = 'Product name is required.';
    if (!form.productQuantity || Number(form.productQuantity) < 1)
      e.productQuantity = 'Quantity must be at least 1.';
    if (!form.targetCompletion) e.targetCompletion = 'Target completion date is required.';
    if (isEdit && !form.joStatus) e.joStatus = 'Status is required.';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    const payload = isEdit
      ? {
          joStatus:         form.joStatus,
          targetCompletion: form.targetCompletion,
          isRush:           form.isRush,
          assignedTo:       form.assignedTo || null,
          notes:            form.notes || '',
        }
      : {
          orderId:          form.orderId,
          product: {
            name:     form.productName.trim(),
            variant:  form.productVariant.trim() || null,
            quantity: Number(form.productQuantity),
          },
          targetCompletion: form.targetCompletion,
          isRush:           form.isRush,
          assignedTo:       form.assignedTo || null,
          notes:            form.notes || '',
        };
    onSubmit(payload);
  };

  const inputStyle = (hasErr) => ({
    width: '100%',
    padding: '10px 12px',
    background: 'var(--dark)',
    border: `1px solid ${hasErr ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: '8px',
    color: 'var(--white)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  });

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--gray)',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const errStyle = {
    fontSize: '12px',
    color: 'var(--red)',
    marginTop: '4px',
    display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Order selector — create only */}
      {!isEdit && (
        <div>
          <label style={labelStyle}>Order *</label>
          <select
            value={form.orderId}
            onChange={e => set('orderId', e.target.value)}
            disabled={isSubmitting || ordersLoading}
            style={inputStyle(!!errors.orderId)}
          >
            <option value="">
              {ordersLoading ? 'Loading orders...' : '— Select an order —'}
            </option>
            {orders.map(o => (
              <option key={o.id ?? o._id} value={o.id ?? o._id}>
                {o.orderNumber || o.orderId || (o.id ?? o._id)?.slice(-8).toUpperCase()}
                {o.customerName ? ` — ${o.customerName}` : ''}
              </option>
            ))}
          </select>
          {errors.orderId && <span style={errStyle}>{errors.orderId}</span>}
        </div>
      )}

      {/* Status — edit only */}
      {isEdit && (
        <div>
          <label style={labelStyle}>Status *</label>
          <select
            value={form.joStatus || ''}
            onChange={e => set('joStatus', e.target.value)}
            disabled={isSubmitting}
            style={inputStyle(!!errors.joStatus)}
          >
            <option value="">— Select status —</option>
            {JO_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {errors.joStatus && <span style={errStyle}>{errors.joStatus}</span>}
        </div>
      )}

      {/* Product name — create only */}
      {!isEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Product Name *</label>
            <input
              type="text"
              value={form.productName}
              onChange={e => set('productName', e.target.value)}
              placeholder="e.g. Custom Mug"
              disabled={isSubmitting}
              style={inputStyle(!!errors.productName)}
            />
            {errors.productName && <span style={errStyle}>{errors.productName}</span>}
          </div>
          <div>
            <label style={labelStyle}>Variant</label>
            <input
              type="text"
              value={form.productVariant}
              onChange={e => set('productVariant', e.target.value)}
              placeholder="e.g. White / 11oz"
              disabled={isSubmitting}
              style={inputStyle(false)}
            />
          </div>
        </div>
      )}

      {/* Quantity — create only */}
      {!isEdit && (
        <div>
          <label style={labelStyle}>Quantity *</label>
          <input
            type="number"
            min="1"
            value={form.productQuantity}
            onChange={e => set('productQuantity', e.target.value)}
            placeholder="1"
            disabled={isSubmitting}
            style={inputStyle(!!errors.productQuantity)}
          />
          {errors.productQuantity && <span style={errStyle}>{errors.productQuantity}</span>}
        </div>
      )}

      {/* Target completion */}
      <div>
        <label style={labelStyle}>Target Completion *</label>
        <input
          type="date"
          value={form.targetCompletion
            ? form.targetCompletion.split('T')[0]
            : ''}
          onChange={e => set('targetCompletion', e.target.value)}
          disabled={isSubmitting}
          style={inputStyle(!!errors.targetCompletion)}
        />
        {errors.targetCompletion && <span style={errStyle}>{errors.targetCompletion}</span>}
      </div>

      {/* Rush + Assigned row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Assigned To</label>
          <input
            type="text"
            value={form.assignedTo}
            onChange={e => set('assignedTo', e.target.value)}
            placeholder="Staff name"
            disabled={isSubmitting}
            style={inputStyle(false)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            padding: '10px 12px',
            background: 'var(--dark)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}>
            <input
              type="checkbox"
              checked={form.isRush}
              onChange={e => set('isRush', e.target.checked)}
              disabled={isSubmitting}
              style={{ width: '16px', height: '16px', accentColor: 'var(--gold)' }}
            />
            <span style={{ fontSize: '14px', color: 'var(--white)', fontWeight: 600 }}>
              Rush Order
            </span>
            {form.isRush && (
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--red)',
                background: 'rgba(239,68,68,0.1)',
                padding: '2px 8px',
                borderRadius: '999px',
              }}>
                RUSH
              </span>
            )}
          </label>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Production notes..."
          rows={3}
          disabled={isSubmitting}
          style={{ ...inputStyle(false), resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      {/* Submit error */}
      {submitError && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'rgba(239,68,68,0.08)',
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
            padding: '10px 20px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--dark2)',
            color: 'var(--gray)', fontSize: '14px',
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
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Create Job Order'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function JobOrdersPage() {
  const { token } = useAuth();
  const router = useRouter();

  // List tab state
  const [jobOrders, setJobOrders]       = useState([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState(null);
  const [filters, setFilters]           = useState({ status: '', isRush: '' });

  // Modal state
  const [modal, setModal]               = useState(null); // null | 'create' | 'edit'
  const [selected, setSelected]         = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState('');

  // Orders for selector
  const [orders, setOrders]             = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Schedule tab state
  const [activeTab, setActiveTab]       = useState('list');
  const [scheduleRange, setScheduleRange] = useState({ startDate: '', endDate: '' });
  const [scheduleJOs, setScheduleJOs]   = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);

  // ── Load job orders ───────────────────────────────────
  const loadJobOrders = useCallback(async () => {
    if (!token) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    try {
      const f = {};
      if (filters.status)  f.status  = filters.status;
      if (filters.isRush !== '') f.isRush = filters.isRush === 'true';
      const data = await fetchJobOrders(token, f);
      setJobOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.message === 'Unauthorized') { router.push('/'); return; }
      setError(err.message || 'Failed to load job orders.');
    } finally {
      setIsLoading(false);
    }
  }, [token, filters, router]);

  useEffect(() => { loadJobOrders(); }, [loadJobOrders]);

  // ── Load orders for selector ──────────────────────────
  const loadOrders = useCallback(async () => {
    if (!token) return;
    setOrdersLoading(true);
    try {
      const data = await fetchAllOrders({}, token);
      const raw = data?.data ?? data?.orders ?? (Array.isArray(data) ? data : []);
      setOrders(raw);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [token]);

  // ── Load schedule ─────────────────────────────────────
  const loadSchedule = useCallback(async () => {
    if (!token) return;
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const data = await fetchJobOrderSchedule(token, scheduleRange);
      setScheduleJOs(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.message === 'Unauthorized') { router.push('/'); return; }
      setScheduleError(err.message || 'Failed to load schedule.');
    } finally {
      setScheduleLoading(false);
    }
  }, [token, scheduleRange, router]);

  useEffect(() => {
    if (activeTab === 'schedule') loadSchedule();
  }, [activeTab, loadSchedule]);

  // ── Handlers ──────────────────────────────────────────
  const openCreate = () => {
    setSelected(null);
    setSubmitError('');
    loadOrders();
    setModal('create');
  };

  const openEdit = (jo) => {
    setSelected(jo);
    setSubmitError('');
    setModal('edit');
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);
    setSubmitError('');
  };

  const handleCreate = async (payload) => {
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await createJobOrder(token, payload);
      await loadJobOrders();
      closeModal();
    } catch (err) {
      setSubmitError(err.message || 'Failed to create job order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (payload) => {
    if (!selected) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await updateJobOrder(token, selected.id ?? selected._id, payload);
      await loadJobOrders();
      closeModal();
    } catch (err) {
      setSubmitError(err.message || 'Failed to update job order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Group schedule by date ────────────────────────────
  const scheduleGrouped = scheduleJOs.reduce((acc, jo) => {
    const day = jo.targetCompletion
      ? new Date(jo.targetCompletion).toLocaleDateString('en-PH', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })
      : 'No Date';
    if (!acc[day]) acc[day] = [];
    acc[day].push(jo);
    return acc;
  }, {});

  // ── Shared styles ─────────────────────────────────────
  const cardStyle = {
    background: 'var(--dark2)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '20px',
  };

  // ── Render ────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '24px',
          flexWrap: 'wrap', gap: '16px',
        }}>
          <button
            onClick={openCreate}
            className="btn-primary"
            style={{ padding: '10px 20px' }}
          >
            + Create Job Order
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px',
          borderBottom: '1px solid var(--border)',
          marginBottom: '24px',
        }}>
          {[
            { key: 'list',     label: 'Job Orders' },
            { key: 'schedule', label: 'Schedule'   },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '10px 20px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === t.key
                  ? '2px solid var(--gold)'
                  : '2px solid transparent',
                color: activeTab === t.key ? 'var(--gold)' : 'var(--gray)',
                fontSize: '14px',
                fontWeight: activeTab === t.key ? 700 : 400,
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Job Orders list ─────────────────────── */}
        {activeTab === 'list' && (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <CustomDropdown
                value={filters.status}
                onChange={v => setFilters(p => ({ ...p, status: v }))}
                placeholder="All Statuses"
                options={[
                  { value: '', label: 'All Statuses' },
                  ...JO_STATUSES.map(s => ({ value: s, label: s })),
                ]}
                style={{ minWidth: '150px' }}
              />
              <CustomDropdown
                value={filters.isRush}
                onChange={v => setFilters(p => ({ ...p, isRush: v }))}
                placeholder="All Types"
                options={[
                  { value: '', label: 'All Types' },
                  { value: 'true', label: 'Rush Only' },
                  { value: 'false', label: 'Standard Only' },
                ]}
                style={{ minWidth: '140px' }}
              />
              <button
                onClick={loadJobOrders}
                style={{
                  padding: '8px 16px', background: 'var(--dark2)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  color: 'var(--gray)', fontSize: '14px', cursor: 'pointer',
                }}
              >
                Refresh
              </button>
            </div>

            {/* Loading */}
            {isLoading && (
              <>
                <style>{`
                  @keyframes joPageSkel { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
                `}</style>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 0 1rem' }}>
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      style={{
                        height: '56px',
                        borderRadius: '8px',
                        background: 'var(--dark2)',
                        animation: 'joPageSkel 1.5s ease-in-out infinite',
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Error */}
            {!isLoading && error && (
              <div style={{
                padding: '16px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid var(--red)',
                color: 'var(--red)',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: '16px', marginBottom: '16px',
              }}>
                <span>{error}</span>
                <button
                  onClick={loadJobOrders}
                  style={{
                    background: 'none',
                    border: '1px solid var(--red)',
                    borderRadius: '6px',
                    color: 'var(--red)',
                    padding: '4px 12px', fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Empty */}
            {!isLoading && !error && jobOrders.length === 0 && (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--gray)' }}>
                No job orders found.
              </div>
            )}

            {/* Job order cards */}
            {!isLoading && !error && jobOrders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {jobOrders.map(jo => (
                  <div
                    key={jo.id ?? jo._id}
                    style={{
                      ...cardStyle,
                      borderLeft: jo.isRush
                        ? '3px solid var(--red)'
                        : '3px solid transparent',
                    }}
                  >
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap',
                    }}>
                      {/* Left: JO info */}
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                            {jo.joId || (jo.id ?? jo._id)?.slice(-8).toUpperCase()}
                          </span>
                          {jo.isRush && (
                            <span style={{
                              fontSize: '10px', fontWeight: 700,
                              color: 'var(--red)',
                              background: 'rgba(239,68,68,0.1)',
                              padding: '2px 7px', borderRadius: '999px',
                            }}>
                              RUSH
                            </span>
                          )}
                          <StatusBadge status={jo.joStatus} />
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--gray)', marginBottom: '4px' }}>
                          {jo.product?.name}
                          {jo.product?.variant ? ` — ${jo.product.variant}` : ''}
                          {jo.product?.quantity ? ` × ${jo.product.quantity}` : ''}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                          Order: <span style={{ color: 'var(--white)' }}>
                            {jo.orderId?.slice(-8).toUpperCase() || '—'}
                          </span>
                          {jo.assignedTo && (
                            <span style={{ marginLeft: '12px' }}>
                              Assigned: <span style={{ color: 'var(--white)' }}>{jo.assignedTo}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: date + actions */}
                      <div style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-end', gap: '8px', flexShrink: 0,
                      }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray)', textAlign: 'right' }}>
                          Due: <span style={{ color: 'var(--white)', fontWeight: 600 }}>
                            {formatDate(jo.targetCompletion)}
                          </span>
                        </div>
                        <button
                          onClick={() => openEdit(jo)}
                          style={{
                            background: 'none',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            color: 'var(--gold)',
                            padding: '4px 12px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    {jo.notes && (
                      <div style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px solid var(--border)',
                        fontSize: '0.8rem',
                        color: 'var(--gray)',
                        fontStyle: 'italic',
                      }}>
                        {jo.notes}
                      </div>
                    )}

                    {/* Design File */}
                    {jo.designFilePath && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Design File</div>
                        <a
                          href={jo.designFilePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.82rem', color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                          View Design File
                        </a>
                      </div>
                    )}

                    {/* Design Notes */}
                    {jo.designNotes && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Design Notes</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--white)', lineHeight: 1.5 }}>{jo.designNotes}</div>
                      </div>
                    )}

                    {/* Admin Comment */}
                    {jo.adminComment && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin Notes</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--white)', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '6px', padding: '0.5rem 0.75rem', lineHeight: 1.5 }}>{jo.adminComment}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── TAB: Schedule ────────────────────────────── */}
        {activeTab === 'schedule' && (
          <>
            {/* Date range filters */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', marginBottom: '4px' }}>
                  From
                </label>
                <input
                  type="date"
                  value={scheduleRange.startDate}
                  onChange={e => setScheduleRange(p => ({ ...p, startDate: e.target.value }))}
                  style={{
                    padding: '8px 12px', background: 'var(--dark2)',
                    border: '1px solid var(--border)', borderRadius: '8px',
                    color: 'var(--white)', fontSize: '14px', outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', marginBottom: '4px' }}>
                  To
                </label>
                <input
                  type="date"
                  value={scheduleRange.endDate}
                  onChange={e => setScheduleRange(p => ({ ...p, endDate: e.target.value }))}
                  style={{
                    padding: '8px 12px', background: 'var(--dark2)',
                    border: '1px solid var(--border)', borderRadius: '8px',
                    color: 'var(--white)', fontSize: '14px', outline: 'none',
                  }}
                />
              </div>
              <button
                onClick={loadSchedule}
                className="btn-primary"
                style={{ padding: '8px 20px' }}
              >
                Apply
              </button>
            </div>

            {/* Schedule loading */}
            {scheduleLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <style>{`@keyframes joSkel{0%,100%{background-position:-400px 0}100%{background-position:400px 0}}.jo-skel{background:linear-gradient(90deg,var(--dark2) 25%,var(--dark3,#2a2a2a) 50%,var(--dark2) 75%);background-size:400px 100%;animation:joSkel 1.4s ease-in-out infinite;border-radius:8px;}`}</style>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="jo-skel" style={{ height: '14px', width: '120px' }} />
                    <div className="jo-skel" style={{ height: '60px', borderRadius: '10px' }} />
                  </div>
                ))}
              </div>
            )}

            {/* Schedule error */}
            {!scheduleLoading && scheduleError && (
              <div style={{
                padding: '16px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid var(--red)',
                color: 'var(--red)',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: '16px',
              }}>
                <span>{scheduleError}</span>
                <button
                  onClick={loadSchedule}
                  style={{
                    background: 'none',
                    border: '1px solid var(--red)',
                    borderRadius: '6px',
                    color: 'var(--red)',
                    padding: '4px 12px', fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Schedule empty */}
            {!scheduleLoading && !scheduleError && scheduleJOs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--gray)' }}>
                No job orders in this date range.
              </div>
            )}

            {/* Schedule grouped */}
            {!scheduleLoading && !scheduleError && scheduleJOs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {Object.entries(scheduleGrouped).map(([day, jos]) => (
                  <div key={day}>
                    <div style={{
                      fontSize: '0.8rem', fontWeight: 700,
                      color: 'var(--gold)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '10px',
                    }}>
                      {day}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {jos.map(jo => (
                        <div key={jo.id ?? jo._id} style={{
                          ...cardStyle,
                          padding: '14px 20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px',
                          flexWrap: 'wrap',
                          borderLeft: jo.isRush
                            ? '3px solid var(--red)'
                            : '3px solid transparent',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.9rem' }}>
                              {jo.joId || (jo.id ?? jo._id)?.slice(-8).toUpperCase()}
                            </span>
                            <StatusBadge status={jo.joStatus} />
                            {jo.isRush && (
                              <span style={{
                                fontSize: '10px', fontWeight: 700,
                                color: 'var(--red)',
                                background: 'rgba(239,68,68,0.1)',
                                padding: '2px 7px', borderRadius: '999px',
                              }}>
                                RUSH
                              </span>
                            )}
                            <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
                              {jo.product?.name}
                              {jo.product?.variant ? ` — ${jo.product.variant}` : ''}
                              {jo.product?.quantity ? ` × ${jo.product.quantity}` : ''}
                            </span>
                          </div>
                          {jo.assignedTo && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--gray)', flexShrink: 0 }}>
                              {jo.assignedTo}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
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
              background: 'var(--dark2)', border: '1px solid var(--border)',
              borderRadius: '16px', padding: '32px',
              width: '100%', maxWidth: '600px',
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 24px', fontSize: '1.25rem', fontWeight: 700, color: 'var(--white)' }}>
              Create Job Order
            </h2>
            <JobOrderForm
              initial={EMPTY_FORM}
              isEdit={false}
              orders={orders}
              ordersLoading={ordersLoading}
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
              background: 'var(--dark2)', border: '1px solid var(--border)',
              borderRadius: '16px', padding: '32px',
              width: '100%', maxWidth: '520px',
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 24px', fontSize: '1.25rem', fontWeight: 700, color: 'var(--white)' }}>
              Edit Job Order — {selected.joId}
            </h2>
            <JobOrderForm
              initial={{
                joStatus:         selected.joStatus || 'Queued',
                targetCompletion: selected.targetCompletion
                  ? selected.targetCompletion.split('T')[0]
                  : '',
                isRush:    selected.isRush   || false,
                assignedTo: selected.assignedTo || '',
                notes:         selected.notes         || '',
                designNotes:   selected.designNotes   || '',
                designFilePath: selected.designFilePath || '',
                adminComment:  selected.adminComment  || '',
              }}
              isEdit={true}
              onSubmit={handleUpdate}
              onCancel={closeModal}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
