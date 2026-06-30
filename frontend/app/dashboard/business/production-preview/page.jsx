'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchJobOrders, updateJobOrder } from '@/lib/jobOrderApi';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination, CustomSelect } from '../inventory-v2/shared';

// Production staff worklist — the Queued / In Progress / For QC stages of a Job Order.
// One Job Order moves: Queued -> In Progress -> For QC (then QC staff inspect it).

const STATUS_TABS = [
  { value: 'all',         label: 'All Active' },
  { value: 'Queued',      label: 'Queued' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'QC_Pending',  label: 'For QC' },
];

const JO_BADGE = {
  'Queued':      { bg: 'var(--st-blue-bg)', color: 'var(--st-blue-fg)', border: 'rgba(96,165,250,0.35)', label: 'Queued' },
  'In Progress': { bg: 'var(--gold-subtle)', color: 'var(--gold)', border: 'rgba(212,168,67,0.35)', label: 'In Progress' },
  'QC_Pending':  { bg: 'var(--st-purple-bg)', color: 'var(--st-purple-fg)', border: 'rgba(168,85,247,0.35)', label: 'For QC' },
  'QC_Passed':   { bg: 'var(--st-green-bg)', color: 'var(--st-green-fg)', border: 'rgba(34,197,94,0.35)', label: 'QC Passed' },
  'QC_Failed':   { bg: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: 'rgba(239,68,68,0.35)', label: 'QC Failed' },
  'Completed':   { bg: 'var(--st-green-bg)', color: 'var(--st-green-fg)', border: 'rgba(34,197,94,0.35)', label: 'Completed' },
  'Cancelled':   { bg: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: 'rgba(239,68,68,0.35)', label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const c = JO_BADGE[status] || { bg: 'var(--dark2)', color: 'var(--gray)', border: 'var(--border)', label: status };
  return <span style={{ ...S.badge, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: '11px' }}>{c.label}</span>;
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProductionPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const data = await fetchJobOrders(token);
      setJobs(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message || 'Failed to load job orders'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const idOf = (j) => j._id ?? j.id;
  const prodName = (j) => {
    const p = j.product || {};
    return `${p.name ?? 'Item'}${p.variant ? ` — ${p.variant}` : ''}`;
  };

  const advance = async (j, joStatus) => {
    setBusyId(idOf(j)); setError('');
    try {
      await updateJobOrder(token, idOf(j), { joStatus });
      await load();
    } catch (e) { setError(e.message || 'Update failed'); }
    finally { setBusyId(null); }
  };

  const active = jobs.filter(j => !['Completed', 'Cancelled', 'QC_Passed'].includes(j.joStatus));
  const counts = {
    queued:     jobs.filter(j => j.joStatus === 'Queued').length,
    inProgress: jobs.filter(j => j.joStatus === 'In Progress').length,
    forQc:      jobs.filter(j => j.joStatus === 'QC_Pending').length,
  };

  const filtered = active.filter(j => {
    const mS = statusFilter === 'all' || j.joStatus === statusFilter;
    const q = search.toLowerCase();
    const mQ = !q || prodName(j).toLowerCase().includes(q) || (j.joId || '').toLowerCase().includes(q) || (j.orderId || '').toLowerCase().includes(q);
    return mS && mQ;
  });

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  return (
    <ErrorBoundary>
      <div style={S.page}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <SummaryCard label="Queued" value={counts.queued} accent />
          <SummaryCard label="In Progress" value={counts.inProgress} color="var(--gold)" />
          <SummaryCard label="For QC" value={counts.forQc} color="var(--st-purple-fg)" />
        </div>

        <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
          <div style={{ ...S.row, gap: '8px', flex: 1 }}>
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search JO, product, order…" style={{ width: '260px' }} />
            <CustomSelect value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} options={STATUS_TABS} style={{ width: '160px' }} />
          </div>
          <button onClick={load} style={S.btnGhost}>{ICONS.reload} Refresh</button>
        </div>

        {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: '10px' }}>{error}</div>}

        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>JO</th><th style={S.th}>Product</th><th style={S.th}>Qty</th>
              <th style={S.th}>Order</th><th style={S.th}>Target</th><th style={S.th}>Status</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Action</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: 'var(--gray)' }}>Loading…</td></tr>
              ) : slice.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState message="No active job orders" sub="Create one from a paid, design-approved order in Job Orders." /></td></tr>
              ) : slice.map(j => {
                const id = idOf(j); const busy = busyId === id;
                return (
                  <tr key={id} style={S.tr}>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600 }}>
                      {j.joId || '—'}
                      {j.isRush && <span style={{ ...S.badge, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: '1px solid #fecaca', marginLeft: 6, fontSize: '10px' }}>RUSH</span>}
                    </td>
                    <td style={S.td}>
                      {prodName(j)}
                      {j.bomSnapshot?.length > 0 && <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>Materials: {j.bomSnapshot.map(m => `${m.name} ×${m.totalQty}${m.unit ? ' ' + m.unit : ''}`).join(', ')}</div>}
                    </td>
                    <td style={S.td}>{j.product?.quantity ?? '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace' }}>{(j.orderId || '').slice(-8).toUpperCase() || '—'}</td>
                    <td style={S.td}>{fmtDate(j.targetCompletion)}</td>
                    <td style={S.td}><StatusBadge status={j.joStatus} /></td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      {j.joStatus === 'Queued' && <button disabled={busy} onClick={() => advance(j, 'In Progress')} style={S.btnSm}>{busy ? '…' : 'Start'}</button>}
                      {j.joStatus === 'In Progress' && <button disabled={busy} onClick={() => advance(j, 'QC_Pending')} style={S.btnSm}>{busy ? '…' : 'Send to QC'}</button>}
                      {j.joStatus === 'QC_Pending' && <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Awaiting QC</span>}
                      {j.joStatus === 'QC_Failed' && <button disabled={busy} onClick={() => advance(j, 'In Progress')} style={S.btnSm}>{busy ? '…' : 'Redo'}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
      </div>
    </ErrorBoundary>
  );
}
