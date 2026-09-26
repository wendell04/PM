'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAccess } from '@/contexts/AccessContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { remainingDue, paidSoFar } from '@/lib/orderBalance';
import ErrorBoundary from '@/components/ErrorBoundary';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import { orderNo } from '@/lib/orderNumber';
import { normalizeStatus } from '@/lib/orderStatus';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination, CustomSelect, ConfirmModal } from '../inventory-v2/shared';
import { useIsPhone, KpiStrip, PhoneFilterBar, PhoneList, PhoneRow, pesoShort } from '@/components/dashboard/phone';

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

const SORT_OPTIONS = [
  { value: 'newest',  label: 'Newest first' },
  { value: 'oldest',  label: 'Oldest first' },
  { value: 'balance', label: 'Largest balance' },
];

// A parked order that still owes. The tag is the difference between "this is hidden from the
// Orders queue" and "this is settled" - archiving does the first and never the second.
const ArchivedTag = () => (
  <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
    fontFamily: 'inherit', background: 'var(--st-orange-bg)', color: 'var(--st-orange-fg)', border: '1px solid color-mix(in srgb, var(--st-orange-fg) 35%, transparent)', verticalAlign: 'middle' }}>
    ARCHIVED
  </span>
);

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
  // Payments Work records money received; See reads who paid and who owes.
  const mayRecord = useAccess().can('payments.create');

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('outstanding');
  const isPhone = useIsPhone();
  const [ageFilter, setAgeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

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
      // Archived orders included. Archiving parks an order; it does not settle it. A balance on
      // an archived order is still owed, and this is the page that exists to show what is owed.
      // To make a balance go away the owner cancels or writes it off, not archives it.
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders?showArchived=1`, { headers: HEADERS(token) }, 20000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
      const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      // A cancelled or returned order owes nothing, whatever its deposit arithmetic says - the
      // list came back with every live order and this page showed a cancelled one as a red
      // balance with a Record button. Delivered stays: an unpaid balance on a delivered order
      // is exactly what this page exists to chase.
      setOrders(list.filter(o => !['cancelled', 'returned'].includes(normalizeStatus(o.orderStatus))));
    } catch (err) {
      setError(err.message || 'Failed to load orders.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const openRecordPayment = (order) => {
    setModalOrder(order);
    setPayForm({ amount: '', method: 'cash', note: '' });
    setPayError(''); setPaySuccess(''); setPayReview(false);
  };

  // Transfers carry a reference the shop can check against its account; a second look before money
  // is written, because one click once marked an order paid that never was.
  const needsRef = payForm.method === 'gcash' || payForm.method === 'bank_transfer';
  const [payReview, setPayReview] = useState(false);

  const handleRecordPayment = async () => {
    const amt = Number(payForm.amount);
    if (!payForm.amount || isNaN(amt) || amt <= 0) { setPayError('Enter a valid amount greater than 0.'); return; }
    if (needsRef && payForm.note.trim().length < 4) { setPayError('Enter the reference number from the GCash or bank receipt.'); return; }
    if (!payReview) {
      const due0 = balanceOf(modalOrder);
      if (amt > due0 + 0.01) { setPayError(due0 > 0 ? `That is more than the outstanding balance of ${fmt(due0)}.` : 'This order has nothing outstanding.'); return; }
      setPayError(''); setPayReview(true); return;
    }
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
      setPayReview(false);
    } catch (err) { setPayError(err.message); setPayReview(false); }
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

    // How old the ORDER is, not how old the debt is. Requiring a balance here meant "Paid" and an
    // age together could never match anything - a paid order owes nothing, so it fell out of every
    // bucket and the table sat empty over a page reporting 19,116.78 collected. The ageing cards
    // above still count receivables only; they filter by status as well, so they are unaffected.
    const matchAge = ageFilter === 'all' || bucketOf(o).key === ageFilter;
    return matchSearch && matchStatus && matchAge;
  }).sort((a, b) => {
    if (sortBy === 'balance') return balanceOf(b) - balanceOf(a);
    const ta = new Date(a.createdAt ?? a.created_at ?? 0).getTime();
    const tb = new Date(b.createdAt ?? b.created_at ?? 0).getTime();
    return sortBy === 'oldest' ? ta - tb : tb - ta;
  });

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered, 15);

  // "Nothing outstanding" is only true when outstanding is what was asked for. Under any other
  // filter it reads as a fact about the shop's money rather than about the filters, which is how
  // an empty table under "Paid" looked like lost orders.
  const emptyMessage = search.trim() !== '' ? 'No match'
    : statusFilter === 'outstanding' ? 'Nothing outstanding'
    : statusFilter === 'paid' ? 'No fully paid orders here'
    : 'No orders here';
  const emptySub = search.trim() !== '' ? 'No order number or customer matches that search.'
    : statusFilter === 'outstanding' ? 'Orders with an unpaid balance appear here.'
    : ageFilter !== 'all' ? 'Nothing in this age range. Try Any age.'
    : 'Try a different filter.';

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

        {isPhone ? (
          <KpiStrip items={[
            { key: 'out',  label: 'Outstanding', value: pesoShort(outstanding), title: fmt(outstanding), color: outstanding > 0 ? 'var(--st-red-fg)' : undefined, active: ageFilter === 'all', onClick: () => { setAgeFilter('all'); setPage(1); } },
            ...bucketTotals.map(bk => ({ key: bk.key, label: bk.label, value: pesoShort(bk.amount), title: fmt(bk.amount), color: bk.amount > 0 ? bk.tone.fg : 'var(--gray)', active: ageFilter === bk.key, onClick: () => { setAgeFilter(ageFilter === bk.key ? 'all' : bk.key); setPage(1); } })),
            { key: 'col',  label: 'Collected',   value: pesoShort(totalCollected), title: fmt(totalCollected), color: 'var(--st-green-fg)' },
          ]} />
        ) : (<>
        <div className="pmp-stat-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
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
                <button key={bk.key} onClick={() => {
                    // The tiles count RECEIVABLES; the table lists orders by age whatever their
                    // status. Both are right and together they read as a contradiction - a tile
                    // saying 4 orders over a table showing nine. Clicking one now says "show me
                    // those", which means the money still owed, so the two agree.
                    setAgeFilter(active ? 'all' : bk.key);
                    if (!active) setStatusFilter('outstanding');
                    setPage(1);
                  }}
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

        </>)}

        {isPhone ? (
          <PhoneFilterBar search={search} onSearch={v => { setSearch(v); setPage(1); }} placeholder="Search order or customer"
            filters={[
              { key: 'status', label: 'Show', value: statusFilter, defaultValue: 'outstanding', onChange: v => { setStatusFilter(v); setPage(1); },
                options: [{ value: 'outstanding', label: 'Outstanding only' }, { value: 'all', label: 'All orders' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partial' }, { value: 'paid', label: 'Paid' }] },
              { key: 'age', label: 'Age', value: ageFilter, defaultValue: 'all', onChange: v => { setAgeFilter(v); setPage(1); },
                options: [{ value: 'all', label: 'Any age' }, ...AGE_BUCKETS.map(b => ({ value: b.key, label: b.label }))] },
              { key: 'sort', label: 'Sort', value: sortBy, defaultValue: 'newest', onChange: v => { setSortBy(v); setPage(1); },
                options: SORT_OPTIONS },
            ]}
            actions={<button onClick={fetchOrders} style={{ ...S.btnSmGhost, minHeight: 36 }}>{ICONS.reload} Refresh</button>}
            note={`${total} order${total === 1 ? '' : 's'}`} />
        ) : (
        <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
          <div className="pmp-filters" style={{ ...S.row, gap: '8px', flex: 1 }}>
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
            <CustomSelect value={sortBy} onChange={v => { setSortBy(v); setPage(1); }} style={{ width: '160px' }}
              options={SORT_OPTIONS} />
          </div>
          <button onClick={fetchOrders} style={S.btnGhost}>{ICONS.reload} Refresh</button>
        </div>

        )}

        {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: '10px' }}>{error}</div>}

        {isPhone ? (
          <>
            {loading ? (
              <div style={{ ...S.card, padding: '28px 16px', textAlign: 'center', color: 'var(--gray)', fontSize: 13 }}>Loading</div>
            ) : slice.length === 0 ? (
              <div style={{ ...S.card, padding: 0 }}><EmptyState message={emptyMessage} sub={emptySub} /></div>
            ) : (
              <PhoneList>
                {slice.map((o, i) => {
                  const bal = balanceOf(o);
                  return (
                    <PhoneRow key={o._id || o.id} first={i === 0}
                      onClick={() => (bal > 0 && mayRecord) ? openRecordPayment(o) : (o.paymentHistory?.length > 0 ? setHistoryOrder(o) : null)}
                      title={orderNo(o)}
                      chip={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{o.isArchived && <ArchivedTag />}<StatusBadge status={o.paymentStatus || 'unpaid'} /></span>}
                      meta={customerOf(o)}
                      sub={[`total ${fmt(o.totalAmount)}`, `paid ${fmt(paidSoFar(o))}`, bal > 0 ? `owes ${fmt(bal)} \u00b7 ${ageDays(o)}d` : 'settled'].join(' \u00b7 ')} />
                  );
                })}
              </PhoneList>
            )}
            <div style={{ padding: '12px 0' }}>
              <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
            </div>
          </>
        ) : (<>
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table className="pmp-rt" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                <tr><td colSpan={8} data-rt="full" style={{ padding: 0 }}><EmptyState message={emptyMessage} sub={emptySub} /></td></tr>
              ) : slice.map(o => {
                const bal = balanceOf(o);
                const bk = bucketOf(o);
                const days = ageDays(o);
                return (
                  <tr key={o._id || o.id} style={S.tr}>
                    <td data-rt="head" style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: 'var(--gold)' }}>
                      {orderNo(o)}{o.isArchived && <ArchivedTag />}
                    </td>
                    <td data-label="Customer" style={S.td}>{customerOf(o)}</td>
                    <td data-label="Total" style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(o.totalAmount)}</td>
                    <td data-label="Paid" style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', color: 'var(--st-green-fg)' }}>{fmt(paidSoFar(o))}</td>
                    <td data-label="Balance" style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: bal > 0 ? 'var(--st-red-fg)' : 'var(--gray)' }}>{fmt(bal)}</td>
                    <td data-label="Age" style={S.td}>
                      {bal > 0
                        ? <span style={{ ...S.badge, background: bk.tone.bg, color: bk.tone.fg, border: 'none', fontSize: 10, fontWeight: 700 }}>{days}d</span>
                        : <span style={{ color: 'var(--gray)' }}>-</span>}
                    </td>
                    <td data-label="Status" style={S.td}><StatusBadge status={o.paymentStatus || 'unpaid'} /></td>
                    <td data-rt="actions" style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {(o.paymentHistory?.length > 0) && (
                        <button onClick={() => setHistoryOrder(o)} style={S.btnSmGhost}>History</button>
                      )}
                      {mayRecord && bal > 0 && (
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

        </>)}

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
                value={payForm.amount} onChange={e => { setPayForm(f => ({ ...f, amount: e.target.value })); setPayReview(false); }}
                placeholder={String(balanceOf(modalOrder).toFixed(2))} style={S.input} disabled={paying} />

              <label style={{ ...S.label, marginTop: 12 }}>Payment method</label>
              <CustomSelect value={payForm.method} onChange={v => { setPayForm(f => ({ ...f, method: v })); setPayReview(false); }}
                options={PAYMENT_METHODS} style={{ width: '100%' }} disabled={paying} />

              <label style={{ ...S.label, marginTop: 12 }}>{needsRef ? 'Reference no. *' : 'Note (optional)'}</label>
              <input type="text" value={payForm.note} maxLength={200}
                onChange={e => { setPayForm(f => ({ ...f, note: e.target.value })); setPayReview(false); }}
                placeholder={needsRef ? 'From the GCash or bank receipt' : 'e.g. COD collected by rider'} style={S.input} disabled={paying} />


              {payError && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginTop: 12 }}>{payError}</div>}
              {paySuccess && <div style={{ ...S.note, background: 'var(--st-green-bg)', borderColor: 'rgba(34,197,94,0.35)', color: 'var(--st-green-fg)', marginTop: 12 }}>{paySuccess}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button onClick={() => setModalOrder(null)} disabled={paying} style={S.btnGhost}>Close</button>
                <button onClick={handleRecordPayment} disabled={paying} style={S.btnPrimary}>{paying ? 'Recording…' : 'Record payment'}</button>
              </div>
            </div>
          </div>
        )}
        {/* Its own dialog, on top - money is not written on the first click. */}
        <ConfirmModal
          open={!!modalOrder && payReview}
          onClose={() => !paying && setPayReview(false)}
          onConfirm={handleRecordPayment}
          loading={paying}
          title="Record this payment?"
          confirmStyle="primary"
          confirmLabel="Yes, record it"
          message={modalOrder ? `${fmt(Number(payForm.amount))} from ${customerOf(modalOrder)}${needsRef && payForm.note.trim() ? ` (ref ${payForm.note.trim()})` : ''}.\n\nOnly if the money is actually in hand or in the account. This updates what the order owes and emails the customer a receipt.` : ''}
        />

        {historyOrder && (
          <div onClick={() => setHistoryOrder(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
            <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: 460, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>Payment History</h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--gray)' }}>{orderNo(historyOrder)} · {customerOf(historyOrder)}</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {(historyOrder.paymentHistory || []).map((e, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ ...S.rowBetween, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: Number(e.amount) < 0 ? 'var(--st-red-fg)' : 'var(--st-green-fg)', textDecoration: e.voided ? 'line-through' : 'none' }}>
                        {Number(e.amount) < 0 ? '-' : ''}{fmt(Math.abs(Number(e.amount) || 0))}{e.voided ? ' (voided)' : ''}
                      </span>
                      <span style={{ ...S.badge, background: 'var(--dark)', color: 'var(--gray)', border: '1px solid var(--border)', fontSize: 10, textTransform: 'uppercase' }}>{e.method}</span>
                    </div>
                    {e.note && <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>{e.note}</div>}
                    <div style={{ fontSize: 11, color: 'var(--gray)', opacity: 0.8 }}>
                      {e.recordedBy ? `${e.recordedBy} · ` : ''}
                      {(e.recordedAt || e.paidAt) ? new Date(e.recordedAt || e.paidAt).toLocaleString('en-PH') : '-'}
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
