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
import { normalizeStatus } from '@/lib/orderStatus';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination, CustomSelect } from '../inventory-v2/shared';

// Manager hub for Job Orders — create (from a paid + design-approved order), schedule, oversee.
// Production staff work them in Production; QC staff inspect them in Quality Control.
const JO_STATUSES = ['Queued', 'In Progress', 'QC_Pending', 'QC_Passed', 'QC_Failed', 'Completed', 'Cancelled'];

const JO_BADGE = {
  'Queued':      { bg: 'var(--st-blue-bg)', color: 'var(--st-blue-fg)', border: 'rgba(96,165,250,0.35)', label: 'Queued' },
  'In Progress': { bg: 'var(--gold-subtle)', color: 'var(--gold)', border: 'rgba(212,168,67,0.35)', label: 'In Progress' },
  'QC_Pending':  { bg: 'var(--st-purple-bg)', color: 'var(--st-purple-fg)', border: 'rgba(168,85,247,0.35)', label: 'For QC' },
  'QC_Passed':   { bg: 'var(--st-green-bg)', color: 'var(--st-green-fg)', border: 'rgba(34,197,94,0.35)', label: 'QC Passed' },
  'QC_Failed':   { bg: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: 'rgba(239,68,68,0.35)', label: 'QC Failed' },
  'Completed':   { bg: 'var(--st-green-bg)', color: 'var(--st-green-fg)', border: 'rgba(34,197,94,0.35)', label: 'Completed' },
  'Cancelled':   { bg: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: 'rgba(239,68,68,0.35)', label: 'Cancelled' },
};

const EMPTY_FORM = {
  orderId: '', itemIdx: 0,
  targetCompletion: '', isRush: false, assignedTo: '', notes: '',
};

function StatusBadge({ status }) {
  const c = JO_BADGE[status] || { bg: 'var(--dark2)', color: 'var(--gray)', border: 'var(--border)', label: status };
  return <span style={{ ...S.badge, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: '11px' }}>{c.label}</span>;
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Create / Edit form ───────────────────────────────────
function JobOrderForm({ initial = EMPTY_FORM, isEdit = false, orders = [], ordersLoading = false, onSubmit, onCancel, isSubmitting, submitError }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  useEffect(() => { setForm(initial); setErrors({}); }, [initial]);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  // Product / variant / qty come straight from the chosen order item — never typed by hand.
  const selectedOrder = orders.find(o => String(o.id ?? o._id) === String(form.orderId));
  const orderItems = selectedOrder?.items ?? [];
  const chosenItem = orderItems[form.itemIdx ?? 0];
  const itemName = (it) => it?.productName ?? it?.product_name ?? it?.name ?? 'Item';
  const itemVariant = (it) => it?.variantName ?? it?.variant ?? null;
  const itemQty = (it) => Number(it?.qty ?? it?.quantity ?? 1);

  const validate = () => {
    const e = {};
    if (!isEdit && !form.orderId) e.orderId = 'Please select an order.';
    if (!isEdit && form.orderId && !chosenItem) e.orderId = 'This order has no items to produce.';
    if (!form.targetCompletion) e.targetCompletion = 'Target completion date is required.';
    if (isEdit && !form.joStatus) e.joStatus = 'Status is required.';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    const payload = isEdit
      ? { joStatus: form.joStatus, targetCompletion: form.targetCompletion, isRush: form.isRush, assignedTo: form.assignedTo || null, notes: form.notes || '' }
      : { orderId: form.orderId, product: { name: itemName(chosenItem), variant: itemVariant(chosenItem), quantity: itemQty(chosenItem), productId: chosenItem?.productId ?? null, variantId: chosenItem?.variantId ?? null }, targetCompletion: form.targetCompletion, isRush: form.isRush, assignedTo: form.assignedTo || null, notes: form.notes || '' };
    onSubmit(payload);
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {!isEdit && (
        <div>
          <label style={S.label}>Order *</label>
          <CustomSelect
            value={form.orderId}
            onChange={v => { set('orderId', v); set('itemIdx', 0); }}
            disabled={isSubmitting || ordersLoading}
            error={!!errors.orderId}
            placeholder={ordersLoading ? 'Loading orders…' : '— Select a paid, approved order —'}
            style={{ width: '100%' }}
            emptyLabel={ordersLoading ? 'Loading orders…' : 'No paid, design-approved orders are waiting for production yet.'}
            options={orders.map(o => ({ value: o.id ?? o._id, label: `${o.orderNumber || o.orderId || (o.id ?? o._id)?.slice(-8).toUpperCase()}${o.customerName ? ` — ${o.customerName}` : ''}` }))}
          />
          {errors.orderId && <span style={S.errText}>{errors.orderId}</span>}
        </div>
      )}

      {isEdit && (
        <div>
          <label style={S.label}>Status *</label>
          <CustomSelect
            value={form.joStatus || ''}
            onChange={v => set('joStatus', v)}
            disabled={isSubmitting}
            error={!!errors.joStatus}
            style={{ width: '100%' }}
            options={JO_STATUSES.map(s => ({ value: s, label: JO_BADGE[s]?.label ?? s }))}
          />
          {errors.joStatus && <span style={S.errText}>{errors.joStatus}</span>}
        </div>
      )}

      {!isEdit && orderItems.length > 1 && (
        <div>
          <label style={S.label}>Item to produce *</label>
          <CustomSelect value={String(form.itemIdx ?? 0)} onChange={v => set('itemIdx', Number(v))} disabled={isSubmitting} style={{ width: '100%' }}
            options={orderItems.map((it, i) => ({ value: String(i), label: `${itemName(it)}${itemVariant(it) ? ` — ${itemVariant(it)}` : ''} × ${itemQty(it)}` }))} />
        </div>
      )}

      {!isEdit && chosenItem && (
        <div style={{ ...S.cardSm, background: 'var(--dark2)' }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Producing (from the order)</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>{itemName(chosenItem)}{itemVariant(chosenItem) ? ` — ${itemVariant(chosenItem)}` : ''}</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>Quantity: {itemQty(chosenItem)} · raw materials are taken from this product&apos;s recipe.</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="hp-2col">
        <div>
          <label style={S.label}>Target completion *</label>
          <input style={errors.targetCompletion ? S.inputErr : S.input} type="date" value={form.targetCompletion} onChange={e => set('targetCompletion', e.target.value)} disabled={isSubmitting} />
          {errors.targetCompletion && <span style={S.errText}>{errors.targetCompletion}</span>}
        </div>
        <div>
          <label style={S.label}>Assigned to</label>
          <input style={S.input} value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} placeholder="Staff name" disabled={isSubmitting} />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', fontWeight: 600, color: 'var(--white)', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.isRush} onChange={e => set('isRush', e.target.checked)} disabled={isSubmitting} style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
        Rush order
        {form.isRush && <span style={{ ...S.badge, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: '1px solid #fecaca', fontSize: '10px' }}>RUSH</span>}
      </label>

      <div>
        <label style={S.label}>Notes</label>
        <textarea style={S.textarea} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Production notes…" disabled={isSubmitting} />
      </div>

      {submitError && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)' }}>{submitError}</div>}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={isSubmitting} style={S.btnGhost}>Cancel</button>
        <button onClick={handleSubmit} disabled={isSubmitting} style={S.btnPrimary}>{isSubmitting ? 'Saving…' : isEdit ? 'Update' : 'Create Job Order'}</button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────
export default function JobOrdersPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [jobOrders, setJobOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [rushFilter, setRushFilter] = useState('');
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('list');
  const [scheduleRange, setScheduleRange] = useState({ startDate: '', endDate: '' });
  const [scheduleJOs, setScheduleJOs] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);

  const loadJobOrders = useCallback(async () => {
    if (!token) { setIsLoading(false); return; }
    setIsLoading(true); setError(null);
    try {
      const f = {};
      if (statusFilter) f.status = statusFilter;
      if (rushFilter !== '') f.isRush = rushFilter === 'true';
      const data = await fetchJobOrders(token, f);
      setJobOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.message === 'Unauthorized') { router.push('/'); return; }
      setError(err.message || 'Failed to load job orders.');
    } finally { setIsLoading(false); }
  }, [token, statusFilter, rushFilter, router]);

  useEffect(() => { loadJobOrders(); }, [loadJobOrders]);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setOrdersLoading(true);
    try {
      const data = await fetchAllOrders(token, { limit: 200 });
      const raw = Array.isArray(data) ? data : (data?.data ?? data?.orders ?? []);
      setOrders(raw);
    } catch { setOrders([]); }
    finally { setOrdersLoading(false); }
  }, [token]);

  const loadSchedule = useCallback(async () => {
    if (!token) return;
    setScheduleLoading(true); setScheduleError(null);
    try {
      const data = await fetchJobOrderSchedule(token, scheduleRange);
      setScheduleJOs(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.message === 'Unauthorized') { router.push('/'); return; }
      setScheduleError(err.message || 'Failed to load schedule.');
    } finally { setScheduleLoading(false); }
  }, [token, scheduleRange, router]);

  useEffect(() => { if (activeTab === 'schedule') loadSchedule(); }, [activeTab, loadSchedule]);

  const openCreate = () => { setSelected(null); setSubmitError(''); loadOrders(); setModal('create'); };
  const openEdit = (jo) => { setSelected(jo); setSubmitError(''); setModal('edit'); };
  const closeModal = () => { setModal(null); setSelected(null); setSubmitError(''); };

  const handleCreate = async (payload) => {
    setIsSubmitting(true); setSubmitError('');
    try { await createJobOrder(token, payload); await loadJobOrders(); closeModal(); }
    catch (err) { setSubmitError(err.message || 'Failed to create job order.'); }
    finally { setIsSubmitting(false); }
  };

  const handleUpdate = async (payload) => {
    if (!selected) return;
    setIsSubmitting(true); setSubmitError('');
    try { await updateJobOrder(token, selected.id ?? selected._id, payload); await loadJobOrders(); closeModal(); }
    catch (err) { setSubmitError(err.message || 'Failed to update job order.'); }
    finally { setIsSubmitting(false); }
  };

  const prodName = (jo) => `${jo.product?.name ?? 'Item'}${jo.product?.variant ? ` — ${jo.product.variant}` : ''}`;

  // Only orders that can actually be produced: not already job-ordered, not finished/cancelled,
  // paid (DP/partial/paid or COD), and — for custom — past the design-approval stage.
  // (Custom orders carry their design state in orderStatus until Phase 1b separates it.)
  const PRE_APPROVAL = ['pending_review', 'pending_design', 'proof_sent', 'revision_requested', 'rejected'];
  const eligibleOrders = orders.filter(o => {
    if (o.joId) return false;
    const st = normalizeStatus(o.orderStatus);
    if (['delivered', 'cancelled', 'returned'].includes(st)) return false;
    const isCOD = (o.paymentMethod || '').toLowerCase() === 'cod';
    const paid = isCOD || ['partial', 'paid'].includes(o.paymentStatus) || Number(o.downPayment) > 0;
    if (!paid) return false;
    const isCustom = o.isCustomOrder ?? o.isCustom;
    const rawStatus = String(o.orderStatus || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (isCustom && PRE_APPROVAL.includes(rawStatus)) return false;
    // Must need a production run: customizable or made-to-order. Ready-made stocked items (e.g. a
    // plain Scrunchie) ship from stock — no Job Order. Material is still deducted at order time.
    if (!(o.items || []).some(it => it.isCustom || it.isMadeToOrder)) return false;
    return true;
  });

  const counts = {
    total:      jobOrders.length,
    queued:     jobOrders.filter(j => j.joStatus === 'Queued').length,
    inProgress: jobOrders.filter(j => j.joStatus === 'In Progress').length,
    forQc:      jobOrders.filter(j => j.joStatus === 'QC_Pending').length,
    completed:  jobOrders.filter(j => ['Completed', 'QC_Passed'].includes(j.joStatus)).length,
  };

  const filtered = jobOrders.filter(jo => {
    const q = search.toLowerCase();
    return !q || prodName(jo).toLowerCase().includes(q) || (jo.joId || '').toLowerCase().includes(q) || (jo.orderId || '').toLowerCase().includes(q);
  });
  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const scheduleGrouped = scheduleJOs.reduce((acc, jo) => {
    const day = jo.targetCompletion ? new Date(jo.targetCompletion).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'No Date';
    (acc[day] = acc[day] || []).push(jo);
    return acc;
  }, {});

  return (
    <ErrorBoundary>
      <div style={S.page}>
        <div style={{ ...S.rowBetween, marginBottom: '16px' }}>
          <button onClick={openCreate} style={S.btnPrimary}>{ICONS.plus} Create Job Order</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <SummaryCard label="Total" value={counts.total} accent />
          <SummaryCard label="Queued" value={counts.queued} />
          <SummaryCard label="In Progress" value={counts.inProgress} color="var(--gold)" />
          <SummaryCard label="For QC" value={counts.forQc} color="var(--st-purple-fg)" />
          <SummaryCard label="Completed" value={counts.completed} color="var(--st-green-fg)" />
        </div>

        <div style={{ display: 'flex', gap: '4px', background: 'var(--dark2)', borderRadius: '8px', padding: '3px', alignSelf: 'flex-start', marginBottom: '14px', width: 'fit-content' }}>
          {[{ key: 'list', label: 'Job Orders' }, { key: 'schedule', label: 'Schedule' }].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '12px', background: activeTab === t.key ? 'var(--dark)' : 'transparent', color: activeTab === t.key ? 'var(--white)' : 'var(--gray)', boxShadow: activeTab === t.key ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>{t.label}</button>
          ))}
        </div>

        {activeTab === 'list' && (
          <>
            <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
              <div style={{ ...S.row, gap: '8px', flex: 1 }}>
                <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search JO, product, order…" style={{ width: '240px' }} />
                <CustomSelect value={statusFilter} onChange={setStatusFilter} style={{ width: '150px' }}
                  options={[{ value: '', label: 'All Statuses' }, ...JO_STATUSES.map(s => ({ value: s, label: JO_BADGE[s]?.label ?? s }))]} />
                <CustomSelect value={rushFilter} onChange={setRushFilter} style={{ width: '140px' }}
                  options={[{ value: '', label: 'All Types' }, { value: 'true', label: 'Rush Only' }, { value: 'false', label: 'Standard Only' }]} />
              </div>
              <button onClick={loadJobOrders} style={S.btnGhost}>{ICONS.reload} Refresh</button>
            </div>

            {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: '10px' }}>{error}</div>}

            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={S.th}>JO</th><th style={S.th}>Product</th><th style={S.th}>Qty</th>
                  <th style={S.th}>Order</th><th style={S.th}>Assigned</th><th style={S.th}>Due</th>
                  <th style={S.th}>Status</th><th style={{ ...S.th, textAlign: 'right' }}>Action</th>
                </tr></thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: 'var(--gray)' }}>Loading…</td></tr>
                  ) : slice.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 0 }}><EmptyState message="No job orders found" sub="Create one from a paid, design-approved order." /></td></tr>
                  ) : slice.map(jo => (
                    <tr key={jo.id ?? jo._id} style={S.tr}>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600 }}>
                        {jo.joId || (jo.id ?? jo._id)?.slice(-8).toUpperCase()}
                        {jo.isRush && <span style={{ ...S.badge, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: '1px solid #fecaca', marginLeft: 6, fontSize: '10px' }}>RUSH</span>}
                      </td>
                      <td style={S.td}>
                        {prodName(jo)}{jo.designFilePath && <a href={jo.designFilePath} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontSize: 11, color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>Design</a>}
                        {jo.bomSnapshot?.length > 0 && <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>Materials: {jo.bomSnapshot.map(m => `${m.name} ×${m.totalQty}${m.unit ? ' ' + m.unit : ''}`).join(', ')}</div>}
                      </td>
                      <td style={S.td}>{jo.product?.quantity ?? '—'}</td>
                      <td style={{ ...S.td, fontFamily: 'monospace' }}>{(jo.orderId || '').slice(-8).toUpperCase() || '—'}</td>
                      <td style={S.td}>{jo.assignedTo || '—'}</td>
                      <td style={S.td}>{fmtDate(jo.targetCompletion)}</td>
                      <td style={S.td}><StatusBadge status={jo.joStatus} /></td>
                      <td style={{ ...S.td, textAlign: 'right' }}>
                        <button onClick={() => openEdit(jo)} style={S.btnSmGhost}>{ICONS.edit} Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
          </>
        )}

        {activeTab === 'schedule' && (
          <>
            <div style={{ ...S.card, ...S.row, gap: '12px', marginBottom: '10px', padding: '12px 16px', alignItems: 'flex-end' }}>
              <div><label style={S.label}>From</label><input type="date" style={{ ...S.input, width: 'auto' }} value={scheduleRange.startDate} onChange={e => setScheduleRange(p => ({ ...p, startDate: e.target.value }))} /></div>
              <div><label style={S.label}>To</label><input type="date" style={{ ...S.input, width: 'auto' }} value={scheduleRange.endDate} onChange={e => setScheduleRange(p => ({ ...p, endDate: e.target.value }))} /></div>
              <button onClick={loadSchedule} style={S.btnPrimary}>Apply</button>
            </div>

            {scheduleError && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: '10px' }}>{scheduleError}</div>}

            {scheduleLoading ? (
              <div style={{ ...S.card, textAlign: 'center', color: 'var(--gray)' }}>Loading…</div>
            ) : scheduleJOs.length === 0 ? (
              <div style={{ ...S.card }}><EmptyState message="No job orders in this range" /></div>
            ) : (
              <div style={{ display: 'grid', gap: '18px' }}>
                {Object.entries(scheduleGrouped).map(([day, jos]) => (
                  <div key={day}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>{day}</div>
                    <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {jos.map(jo => (
                            <tr key={jo.id ?? jo._id} style={S.tr}>
                              <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600, width: 120 }}>{jo.joId || (jo.id ?? jo._id)?.slice(-8).toUpperCase()}{jo.isRush && <span style={{ ...S.badge, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: '1px solid #fecaca', marginLeft: 6, fontSize: '10px' }}>RUSH</span>}</td>
                              <td style={S.td}>{prodName(jo)} {jo.product?.quantity ? `× ${jo.product.quantity}` : ''}</td>
                              <td style={S.td}>{jo.assignedTo || '—'}</td>
                              <td style={{ ...S.td, textAlign: 'right' }}><StatusBadge status={jo.joStatus} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {(modal === 'create' || (modal === 'edit' && selected)) && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: '100%', maxWidth: modal === 'create' ? 600 : 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>
              {modal === 'create' ? 'Create Job Order' : `Edit Job Order — ${selected.joId || ''}`}
            </h2>
            <JobOrderForm
              initial={modal === 'create' ? EMPTY_FORM : {
                joStatus: selected.joStatus || 'Queued',
                targetCompletion: selected.targetCompletion ? String(selected.targetCompletion).split('T')[0] : '',
                isRush: selected.isRush || false,
                assignedTo: selected.assignedTo || '',
                notes: selected.notes || '',
              }}
              isEdit={modal === 'edit'}
              orders={eligibleOrders}
              ordersLoading={ordersLoading}
              onSubmit={modal === 'create' ? handleCreate : handleUpdate}
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
