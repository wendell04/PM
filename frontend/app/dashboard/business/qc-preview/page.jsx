'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchJobOrders } from '@/lib/jobOrderApi';
import { submitJobOrderQC } from '@/lib/ordersApi';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination } from '../inventory-v2/shared';

// QC staff worklist — Job Orders at the For QC stage. Pass -> order moves to Ready for Delivery
// and materials are consumed. Fail -> back to production for reprint (materials stay reserved).

const JO_BADGE = {
  'QC_Pending': { bg: '#f5f3ff', color: '#5b21b6', border: '#ddd6fe', label: 'For QC' },
  'QC_Failed':  { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', label: 'Rework' },
  'QC_Passed':  { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', label: 'Passed' },
};

function StatusBadge({ status }) {
  const c = JO_BADGE[status] || { bg: '#f3f4f6', color: '#6b7280', border: '#e1e3e5', label: status };
  return <span style={{ ...S.badge, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: '11px' }}>{c.label}</span>;
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function QualityControlPage() {
  const { token, currentUser } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [failJob, setFailJob] = useState(null);
  const [defects, setDefects] = useState('');

  const checkedBy = (`${currentUser?.firstName ?? ''} ${currentUser?.lastName ?? ''}`.trim()) || currentUser?.email || 'QC';

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

  const queue = jobs.filter(j => ['QC_Pending', 'QC_Failed'].includes(j.joStatus));
  const counts = {
    pending: jobs.filter(j => j.joStatus === 'QC_Pending').length,
    rework:  jobs.filter(j => j.joStatus === 'QC_Failed').length,
    passed:  jobs.filter(j => j.joStatus === 'QC_Passed').length,
  };

  const pass = async (j) => {
    setBusyId(idOf(j)); setError('');
    try {
      await submitJobOrderQC(idOf(j), { passed: true, checkedBy }, token);
      await load();
    } catch (e) { setError(e.message || 'Failed to submit QC'); }
    finally { setBusyId(null); }
  };

  const confirmFail = async () => {
    if (!failJob) return;
    setBusyId(idOf(failJob)); setError('');
    try {
      await submitJobOrderQC(idOf(failJob), { passed: false, defects: defects.trim() || null, checkedBy }, token);
      setFailJob(null); setDefects('');
      await load();
    } catch (e) { setError(e.message || 'Failed to submit QC'); }
    finally { setBusyId(null); }
  };

  const filtered = queue.filter(j => {
    const q = search.toLowerCase();
    return !q || prodName(j).toLowerCase().includes(q) || (j.joId || '').toLowerCase().includes(q) || (j.orderId || '').toLowerCase().includes(q);
  });

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  return (
    <ErrorBoundary>
      <div style={S.page}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <SummaryCard label="Pending QC" value={counts.pending} accent />
          <SummaryCard label="Rework (Failed)" value={counts.rework} color="#991b1b" />
          <SummaryCard label="Passed" value={counts.passed} color="#166534" />
        </div>

        <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
          <div style={{ ...S.row, gap: '8px', flex: 1 }}>
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search JO, product, order…" style={{ width: '260px' }} />
          </div>
          <button onClick={load} style={S.btnGhost}>{ICONS.reload} Refresh</button>
        </div>

        {error && <div style={{ ...S.note, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', marginBottom: '10px' }}>{error}</div>}

        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>JO</th><th style={S.th}>Product</th><th style={S.th}>Qty</th>
              <th style={S.th}>Order</th><th style={S.th}>Status</th><th style={S.th}>Last Defect</th>
              <th style={{ ...S.th, textAlign: 'right' }}>QC Action</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
              ) : slice.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState message="Nothing to inspect" sub="Job orders appear here once production sends them For QC." /></td></tr>
              ) : slice.map(j => {
                const id = idOf(j); const busy = busyId === id;
                return (
                  <tr key={id} style={S.tr}>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600 }}>
                      {j.joId || '—'}
                      {j.isRush && <span style={{ ...S.badge, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', marginLeft: 6, fontSize: '10px' }}>RUSH</span>}
                    </td>
                    <td style={S.td}>{prodName(j)}</td>
                    <td style={S.td}>{j.product?.quantity ?? '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace' }}>{(j.orderId || '').slice(-8).toUpperCase() || '—'}</td>
                    <td style={S.td}><StatusBadge status={j.joStatus} /></td>
                    <td style={{ ...S.td, color: '#6b7280', maxWidth: 220 }}>{j.qcResult?.defects || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button disabled={busy} onClick={() => pass(j)} style={{ ...S.btnSm, background: '#16a34a' }}>{busy ? '…' : 'Pass'}</button>
                      <button disabled={busy} onClick={() => { setFailJob(j); setDefects(''); }} style={{ ...S.btnSmDanger, marginLeft: 6 }}>Fail</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />

        {failJob && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => !busyId && setFailJob(null)}>
            <div style={{ ...S.card, width: 440, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#1a1a2e' }}>Fail QC — {failJob.joId}</h3>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6b7280' }}>{prodName(failJob)} · x{failJob.product?.quantity ?? 1}. The job returns to production for reprint; materials stay reserved.</p>
              <label style={S.label}>Defect details</label>
              <textarea style={{ ...S.textarea }} value={defects} onChange={e => setDefects(e.target.value.slice(0, 1000))} placeholder="What went wrong? (misprint, color, alignment, smudge…)" />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button onClick={() => setFailJob(null)} disabled={!!busyId} style={S.btnGhost}>Cancel</button>
                <button onClick={confirmFail} disabled={!!busyId} style={S.btnDanger}>{busyId ? 'Submitting…' : 'Confirm Fail'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
