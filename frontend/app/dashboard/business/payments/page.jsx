'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { remainingDue, paidSoFar } from '@/lib/orderBalance';
import ErrorBoundary from '@/components/ErrorBoundary';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import { orderNo } from '@/lib/orderNumber';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination, CustomSelect } from '../inventory-v2/shared';

// Accounts receivable. Sales answers "what did we sell"; this answers "what have we collected and
// who still owes us". The two are deliberately separate reports over the same orders.
//
// Ageing is measured from the order date, the standard receivable clock: an unsettled balance that
// is 45 days old is a very different problem from one raised this morning, and a flat list of
// debtors cannot tell you which to chase first.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cod', label: 'COD' },
];

const STATUS_BADGE = {
  paid:    { bg: 'var(--st-green-bg)', color: 'var(--st-green-fg)', border: 'rgba(34,197,94,0.35)',  label: 'Paid' },
  partial: { bg: 'var(--gold-subtle)', color: 'var(--gold)',        border: 'rgba(212,168,67,0.35)', label: 'Partial' },
  unpaid:  { bg: 'var(--st-red-bg)',   color: 'var(--st-red-fg)',   border: 'rgba(239,68,68,0.35)',  label: 'Unpaid' },
};

// Ageing buckets, oldest first. `max` is inclusive; null means open-ended.
const AGE_BUCKETS = [
  { key: '60',   label: '60+ days',   min: 61, max: null, tone: { bg: 'var(--st-red-bg)',    fg: 'var(--st-red-fg)' } },
  { key: '3160', label: '31-60 days', min: 31, max: 60,   tone: { bg: 'var(--st-orange-bg)', fg: 'var(--st-orange-fg)' } },
  { key: '130',  label: '1-30 days',  min: 1,  max: 30,   tone: { bg: 'var(--gold-subtle)',  fg: 'var(--gold)' } },
  { key: 'cur',  label: 'Current',    min: 0,  max: 0,    tone: { bg: 'var(--st-blue-bg)',   fg: 'var(--st-blue-fg)' } },
];

const fmt = (n) => '₱' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The stored `balance` is only written once a payment lands, so it reads 0 on an order that has been
// billed nothing yet - and this module then skipped its own overpayment guard, which is keyed on
// `due > 0`. Compute it from payments received instead, the same way the Orders modal does.
const balanceOf = (o) => remainingDue(o);

const customerOf = (o) =>
  o.userSnapshot?.name || o.customerName ||
  `${o.customer?.firstName || ''} ${o.customer?.lastName || ''}`.trim() || 'Walk-in';

const ageDays = (o) => {
  const d = new Date(o.createdAt ?? o.created_at ?? 0);
  if (isNaN(d) || !d.getTime()) return 0;
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((a - b) / 86400000));
};

const bucketOf = (o) => {
  const days = ageDays(o);
  return AGE_BUCKETS.find(bk => days >= bk.min && (bk.max === null || days <= bk.max)) ?? AGE_BUCKETS[3];
};

function StatusBadge({ status }) {
  const c = STATUS_BADGE[status] || STATUS_BADGE.unpaid;
  return <span style={{ ...S.badge, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: '11px' }}>{c.label}</span>;
}

export default function PaymentsPage() {
  const { token } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('outstanding');
  const [ageFilter, setAgeFilter] = useState('all');

  const [modalOrder, setModalOrder] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', note: '' });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState('');
  const [historyOrder, setHistoryOrder] = useState(null);

  useLockBodyScroll(!!modalOrder || !!historyOrder);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders`, { headers: HEADERS(token) }, 20000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
      setOrders(Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err.message || 'Failed to load orders.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const openRecordPayment = (order) => {
    setModalOrder(order);
    setPayForm({ amount: '', method: 'cash', note: '' });
    setPayError(''); setPaySuccess('');
  };

  const handleRecordPayment = async () => {
    const amt = Number(payForm.amount);
    if (!payForm.amount || isNaN(amt) || amt <= 0) { setPayError('Enter a valid amount greater than 0.'); return; }
    const due = balanceOf(modalOrder);
    // Not gated on `due > 0` any more: a zero figure used to wave everything through, which is how an
    // order with nothing owed could still be paid into.
    if (amt > due + 0.01) {
      setPayError(due > 0
        ? `That is more than the outstanding balance of ${fmt(due)}.`
        : 'This order has nothing outstanding.');
      return;
    }
    setPaying(true); setPayError(''); setPaySuccess('');
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/orders/${modalOrder._id || modalOrder.id}/record-payment`,
        { method: 'POST', headers: HEADERS(token), body: JSON.stringify({ amount: amt, method: payForm.method, note: payForm.note.trim() || undefined }) },
        15000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to record payment.');
      setPaySuccess('Payment recorded.');
      const updated = data.data || data;
      const key = modalOrder._id || modalOrder.id;
      setOrders(prev => prev.map(o => (o._id || o.id) === key ? { ...o, ...updated } : o));
      setModalOrder(prev => ({ ...prev, ...updated }));
      setPayForm({ amount: '', method: 'cash', note: '' });
    } catch (err) { setPayError(err.message); }
    finally { setPaying(false); }
  };

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || orderNo(o).toLowerCase().includes(q)
      || String(o._id ?? o.id ?? '').toLowerCase().includes(q)
      || customerOf(o).toLowerCase().includes(q);

    const st = o.paymentStatus || 'unpaid';
    const matchStatus = statusFilter === 'all' ? true
      : statusFilter === 'outstanding' ? balanceOf(o) > 0
      : st === statusFilter;

    const matchAge = ageFilter === 'all' || (balanceOf(o) > 0 && bucketOf(o).key === ageFilter);
    return matchSearch && matchStatus && matchAge;
  }).sort((a, b) => ageDays(b) - ageDays(a));   // oldest receivable first

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered, 15);

  const totalValue     = orders.reduce((s, o) => s + Number(o.totalAmount ?? 0), 0);
  const totalCollected = orders.reduce((s, o) => s + paidSoFar(o), 0);
  const outstanding    = orders.reduce((s, o) => s + balanceOf(o), 0);
  const owing          = orders.filter(o => balanceOf(o) > 0);
  const overdue60      = owing.filter(o => ageDays(o) >= 61).reduce((s, o) => s + balanceOf(o), 0);

  const bucketTotals = AGE_BUCKETS.map(bk => ({
    ...bk,
    amount: owing.filter(o => bucketOf(o).key === bk.key).reduce((s, o) => s + balanceOf(o), 0),
    count:  owing.filter(o => bucketOf(o).key === bk.key).length,
  }));

  return (
    <ErrorBoundary>
      <div style={S.page}>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <SummaryCard label="Total Order Value" value={fmt(totalValue)} />
          <SummaryCard label="Collected" value={fmt(totalCollected)} color="var(--st-green-fg)" />
          <SummaryCard label="Outstanding" value={fmt(outstanding)} sub={`${owing.length} order${owing.length === 1 ? '' : 's'}`} color={outstanding > 0 ? 'var(--st-red-fg)' : undefined} />
          <SummaryCard label="Over 60 Days" value={fmt(overdue60)} color={overdue60 > 0 ? 'var(--st-red-fg)' : undefined} />
        </div>

        {/* Ageing summary - click a bucket to filter the list to it. */}
        <div style={{ ...S.card, marginBottom: '10px', padding: '12px 16px' }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Receivables ageing (from order date)</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {bucketTotals.map(bk => {
              const active = ageFilter === bk.key;
              return (
                <button key={bk.key} onClick={() => { setAgeFilter(active ? 'all' : bk.key); setPage(1); }}
                  style={{ flex: '1 1 150px', textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    background: bk.amount > 0 ? bk.tone.bg : 'var(--dark2)',
                    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--gray)' }}>{bk.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: bk.amount > 0 ? bk.tone.fg : 'var(--gray)', marginTop: 2 }}>{fmt(bk.amount)}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>{bk.count} order{bk.count === 1 ? '' : 's'}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
          <div style={{ ...S.row, gap: '8px', flex: 1 }}>
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search order or customer…" style={{ width: '240px' }} />
            <CustomSelect value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} style={{ width: '170px' }}
              options={[
                { value: 'outstanding', label: 'Outstanding only' },
                { value: 'all',         label: 'All orders' },
                { value: 'unpaid',      label: 'Unpaid' },
                { value: 'partial',     label: 'Partial' },
                { value: 'paid',        label: 'Paid' },
              ]} />
            <CustomSelect value={ageFilter} onChange={v => { setAgeFilter(v); setPage(1); }} style={{ width: '150px' }}
              options={[{ value: 'all', label: 'Any age' }, ...AGE_BUCKETS.map(b => ({ value: b.key, label: b.label }))]} />
          </div>
          <button onClick={fetchOrders} style={S.btnGhost}>{ICONS.reload} Refresh</button>
        </div>

        {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: '10px' }}>{error}</div>}

        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>Order</th><th style={S.th}>Customer</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Paid</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Balance</th>
              <th style={S.th}>Age</th><th style={S.th}>Status</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Action</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <>
                  <style>{`@keyframes pmPulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
                  {[0, 1, 2, 3].map(r => (
                    <tr key={`sk${r}`}>{[0, 1, 2, 3, 4, 5, 6, 7].map(c => (
                      <td key={c} style={S.td}><div style={{ height: 12, borderRadius: 4, background: 'var(--dark2)', animation: 'pmPulse 1.4s ease-in-out infinite', width: c === 1 ? '80%' : '55%' }} /></td>
                    ))}</tr>
                  ))}
                </>
              ) : slice.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 0 }}><EmptyState message="Nothing outstanding" sub="Orders with an unpaid balance appear here." /></td></tr>
              ) : slice.map(o => {
                const bal = balanceOf(o);
                const bk = bucketOf(o);
                const days = ageDays(o);
                return (
                  <tr key={o._id || o.id} style={S.tr}>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: 'var(--gold)' }}>{orderNo(o)}</td>
                    <td style={S.td}>{customerOf(o)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(o.totalAmount)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', color: 'var(--st-green-fg)' }}>{fmt(paidSoFar(o))}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: bal > 0 ? 'var(--st-red-fg)' : 'var(--gray)' }}>{fmt(bal)}</td>
                    <td style={S.td}>
                      {bal > 0
                        ? <span style={{ ...S.badge, background: bk.tone.bg, color: bk.tone.fg, border: 'none', fontSize: 10, fontWeight: 700 }}>{days}d</span>
                        : <span style={{ color: 'var(--gray)' }}>—</span>}
                    </td>
                    <td style={S.td}><StatusBadge status={o.paymentStatus || 'unpaid'} /></td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {(o.paymentHistory?.length > 0) && (
                        <button onClick={() => setHistoryOrder(o)} style={S.btnSmGhost}>History</button>
                      )}
                      {bal > 0 && (
                        <button onClick={() => openRecordPayment(o)} style={{ ...S.btnSm, marginLeft: 6 }}>Record</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />

        {modalOrder && (
          <div onClick={() => !paying && setModalOrder(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
            <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: 440, maxWidth: '100%' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>Record Payment</h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--gray)' }}>
                {orderNo(modalOrder)} · {customerOf(modalOrder)} · outstanding{' '}
                <strong style={{ color: 'var(--st-red-fg)' }}>{fmt(balanceOf(modalOrder))}</strong>
              </p>

              <label style={S.label}>Amount</label>
              <input type="number" min="0.01" step="0.01" max={balanceOf(modalOrder) || undefined}
                value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                placeholder={String(balanceOf(modalOrder).toFixed(2))} style={S.input} disabled={paying} />

              <label style={{ ...S.label, marginTop: 12 }}>Payment method</label>
              <CustomSelect value={payForm.method} onChange={v => setPayForm(f => ({ ...f, method: v }))}
                options={PAYMENT_METHODS} style={{ width: '100%' }} disabled={paying} />

              <label style={{ ...S.label, marginTop: 12 }}>Note (optional)</label>
              <input type="text" value={payForm.note} maxLength={200}
                onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                placeholder="e.g. COD collected by rider" style={S.input} disabled={paying} />

              {payError && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginTop: 12 }}>{payError}</div>}
              {paySuccess && <div style={{ ...S.note, background: 'var(--st-green-bg)', borderColor: 'rgba(34,197,94,0.35)', color: 'var(--st-green-fg)', marginTop: 12 }}>{paySuccess}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button onClick={() => setModalOrder(null)} disabled={paying} style={S.btnGhost}>Close</button>
                <button onClick={handleRecordPayment} disabled={paying} style={S.btnPrimary}>{paying ? 'Recording…' : 'Record Payment'}</button>
              </div>
            </div>
          </div>
        )}

        {historyOrder && (
          <div onClick={() => setHistoryOrder(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
            <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: 460, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>Payment History</h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--gray)' }}>{orderNo(historyOrder)} · {customerOf(historyOrder)}</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {(historyOrder.paymentHistory || []).map((e, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ ...S.rowBetween, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: 'var(--st-green-fg)', fontSize: 14 }}>{fmt(e.amount)}</span>
                      <span style={{ ...S.badge, background: 'var(--dark)', color: 'var(--gray)', border: '1px solid var(--border)', fontSize: 10, textTransform: 'uppercase' }}>{e.method}</span>
                    </div>
                    {e.note && <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>{e.note}</div>}
                    <div style={{ fontSize: 11, color: 'var(--gray)', opacity: 0.8 }}>
                      {e.recordedBy ? `${e.recordedBy} · ` : ''}
                      {(e.recordedAt || e.paidAt) ? new Date(e.recordedAt || e.paidAt).toLocaleString('en-PH') : '—'}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={() => setHistoryOrder(null)} style={S.btnGhost}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
