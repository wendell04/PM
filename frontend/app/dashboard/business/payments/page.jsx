'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';

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
  paid:    { bg: 'rgba(34,197,94,0.12)',  color: 'var(--green)',  label: 'Paid' },
  partial: { bg: 'rgba(251,191,36,0.12)', color: 'var(--gold)',   label: 'Partial' },
  unpaid:  { bg: 'rgba(239,68,68,0.12)',  color: 'var(--red)',    label: 'Unpaid' },
};

function fmt(n) {
  return '₱' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentsPage() {
  const { token } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const rpp = 15;

  // Record payment modal state
  const [modalOrder, setModalOrder] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', note: '' });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState('');

  // History modal
  const [historyOrder, setHistoryOrder] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders`, { headers: HEADERS(token) }, 20000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
      const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      setOrders(list);
    } catch (err) {
      setError(err.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const openRecordPayment = (order) => {
    setModalOrder(order);
    setPayForm({ amount: '', method: 'cash', note: '' });
    setPayError('');
    setPaySuccess('');
  };

  const handleRecordPayment = async () => {
    if (!payForm.amount || isNaN(Number(payForm.amount)) || Number(payForm.amount) <= 0) {
      setPayError('Enter a valid amount greater than 0.');
      return;
    }
    setPaying(true);
    setPayError('');
    setPaySuccess('');
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/orders/${modalOrder._id || modalOrder.id}/record-payment`,
        {
          method: 'POST',
          headers: HEADERS(token),
          body: JSON.stringify({
            amount: Number(payForm.amount),
            method: payForm.method,
            note: payForm.note.trim() || undefined,
          }),
        },
        15000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to record payment.');
      setPaySuccess('Payment recorded successfully.');
      // Update the order in local state
      const updated = data.data || data;
      setOrders(prev => prev.map(o => (o._id || o.id) === (modalOrder._id || modalOrder.id) ? { ...o, ...updated } : o));
      setModalOrder(prev => ({ ...prev, ...updated }));
      setPayForm({ amount: '', method: 'cash', note: '' });
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  };

  // Filter and search
  const filtered = orders.filter(o => {
    const orderNum = (o.orderNumber || o.orderId || o._id || '').toString().toLowerCase();
    const customer = (o.userSnapshot?.name || o.customerName || `${o.customer?.firstName || ''} ${o.customer?.lastName || ''}`.trim()).toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !q || orderNum.includes(q) || customer.includes(q);
    const matchStatus =
      statusFilter === 'all' ||
      (o.paymentStatus || 'unpaid') === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rpp));
  const paged = filtered.slice((page - 1) * rpp, page * rpp);

  // Aggregate totals
  const totalRevenue = orders.reduce((s, o) => s + Number(o.totalAmount ?? 0), 0);
  const totalCollected = orders.reduce((s, o) => s + Number(o.downPayment ?? 0), 0);
  const totalBalance = orders.reduce((s, o) => s + Number(o.balance ?? 0), 0);
  const unpaidCount = orders.filter(o => (o.paymentStatus || 'unpaid') === 'unpaid').length;
  const partialCount = orders.filter(o => o.paymentStatus === 'partial').length;

  return (
    <ErrorBoundary>
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '2rem 1rem' }}>

        <div style={{ marginBottom: '24px' }}>
          <h1 className="page-title">Payments</h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem', margin: '4px 0 0' }}>
            Track payments, downpayments, and outstanding balances.
          </p>
        </div>

        {/* Summary cards */}
        {!loading && !error && (
          <div style={{ display: 'flex', gap: '14px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {[
              { label: 'Total Order Value', value: fmt(totalRevenue), color: 'var(--white)' },
              { label: 'Collected', value: fmt(totalCollected), color: 'var(--green)' },
              { label: 'Outstanding Balance', value: fmt(totalBalance), color: totalBalance > 0 ? 'var(--red)' : 'var(--green)' },
              { label: 'Unpaid Orders', value: unpaidCount, color: 'var(--red)' },
              { label: 'Partial Orders', value: partialCount, color: 'var(--gold)' },
            ].map(card => (
              <div key={card.label} style={{
                flex: '1 1 160px', padding: '16px 20px',
                background: 'var(--dark2)', border: '1px solid var(--border)',
                borderRadius: '12px',
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{card.label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by order # or customer..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{
              flex: 1, minWidth: '200px', height: '40px', padding: '0 12px',
              borderRadius: '8px', border: '1px solid var(--border)',
              background: 'var(--dark)', color: 'var(--white)', fontSize: '0.875rem',
            }}
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{
              height: '40px', padding: '0 12px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--dark)',
              color: 'var(--white)', fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
          <button
            type="button" onClick={fetchOrders}
            style={{ height: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--white)', cursor: 'pointer', fontSize: '0.875rem' }}
          >Refresh</button>
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: '64px', borderRadius: '10px', background: 'var(--dark2)', border: '1px solid var(--border)', animation: 'paySkel 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--red)', background: 'rgba(239,68,68,0.08)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 100px 100px 80px 120px',
              gap: '12px', padding: '10px 16px',
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border)',
            }}>
              <span>Order</span>
              <span>Customer</span>
              <span>Total</span>
              <span>Paid</span>
              <span>Balance</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {paged.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray)', fontSize: '0.875rem' }}>
                No orders found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {paged.map(o => {
                  const orderId = o._id || o.id;
                  const orderNum = o.orderNumber || o.orderId || orderId?.slice(-8) || '—';
                  const customer = o.userSnapshot?.name || o.customerName ||
                    (o.customer ? `${o.customer.firstName || o.customer.name || ''} ${o.customer.lastName || ''}`.trim() : '') ||
                    '—';
                  const status = o.paymentStatus || 'unpaid';
                  const badge = STATUS_BADGE[status] || STATUS_BADGE.unpaid;
                  const total = Number(o.totalAmount ?? 0);
                  const paid = Number(o.downPayment ?? 0);
                  const balance = Number(o.balance ?? total);
                  const canRecord = !['Cancelled', 'Returned'].includes(o.orderStatus) && status !== 'paid';

                  return (
                    <div key={orderId} style={{
                      display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 100px 100px 80px 120px',
                      gap: '12px', padding: '14px 16px', alignItems: 'center',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.85rem' }}>#{orderNum}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '2px' }}>
                          {o.orderStatus || '—'}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {customer}
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.85rem' }}>{fmt(total)}</div>
                      <div style={{ fontWeight: 700, color: paid > 0 ? 'var(--green)' : 'var(--gray)', fontSize: '0.85rem' }}>{fmt(paid)}</div>
                      <div style={{ fontWeight: 700, color: balance > 0 ? 'var(--red)' : 'var(--green)', fontSize: '0.85rem' }}>{fmt(balance)}</div>
                      <div>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px',
                          borderRadius: '999px', background: badge.bg, color: badge.color,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>{badge.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {canRecord && (
                          <button
                            type="button"
                            onClick={() => openRecordPayment(o)}
                            style={{
                              padding: '5px 10px', borderRadius: '6px', border: 'none',
                              background: 'var(--gold)', color: 'var(--black)', cursor: 'pointer',
                              fontSize: '0.72rem', fontWeight: 700,
                            }}
                          >
                            Record
                          </button>
                        )}
                        {(o.paymentHistory?.length > 0) && (
                          <button
                            type="button"
                            onClick={() => setHistoryOrder(o)}
                            style={{
                              padding: '5px 8px', borderRadius: '6px',
                              border: '1px solid var(--border)', background: 'transparent',
                              color: 'var(--gray)', cursor: 'pointer', fontSize: '0.75rem',
                            }}
                            title="View payment history"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {filtered.length > rpp && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', marginTop: '8px', border: '1px solid var(--border)',
                borderRadius: '10px', fontSize: '0.8rem', color: 'var(--gray)',
              }}>
                <span>{filtered.length} orders · page {page} of {totalPages}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--dark)', color: page <= 1 ? 'var(--gray)' : 'var(--white)', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--dark)', color: page >= totalPages ? 'var(--gray)' : 'var(--white)', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>›</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Record Payment Modal */}
        {modalOrder && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)' }}>
            <div style={{ width: '100%', maxWidth: '420px', padding: '1.5rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px' }}>
              <h3 style={{ margin: '0 0 4px', color: 'var(--white)', fontSize: '1.1rem' }}>Record Payment</h3>
              <p style={{ margin: '0 0 20px', color: 'var(--gray)', fontSize: '0.82rem' }}>
                Order #{modalOrder.orderNumber || (modalOrder._id || '').slice(-8)} · Balance: {fmt(modalOrder.balance ?? modalOrder.totalAmount)}
              </p>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '6px' }}>Amount (₱)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '6px' }}>Payment Method</label>
                <select
                  value={payForm.method}
                  onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}
                  style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', fontSize: '0.875rem', cursor: 'pointer' }}
                >
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '6px' }}>Note (optional)</label>
                <input
                  type="text"
                  value={payForm.note}
                  onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Downpayment, Full settlement..."
                  style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              {payError && <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: 'var(--red)', fontSize: '0.82rem', marginBottom: '12px' }}>{payError}</div>}
              {paySuccess && <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(34,197,94,0.1)', color: 'var(--green)', fontSize: '0.82rem', marginBottom: '12px' }}>{paySuccess}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setModalOrder(null)} disabled={paying}
                  style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--white)', cursor: paying ? 'not-allowed' : 'pointer', opacity: paying ? 0.6 : 1 }}>
                  Close
                </button>
                <button type="button" onClick={handleRecordPayment} disabled={paying}
                  style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', background: 'var(--gold)', color: 'var(--black)', fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer', opacity: paying ? 0.7 : 1 }}>
                  {paying ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment History Modal */}
        {historyOrder && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)' }}>
            <div style={{ width: '100%', maxWidth: '480px', padding: '1.5rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 4px', color: 'var(--white)', fontSize: '1.1rem' }}>Payment History</h3>
              <p style={{ margin: '0 0 20px', color: 'var(--gray)', fontSize: '0.82rem' }}>
                Order #{historyOrder.orderNumber || (historyOrder._id || '').slice(-8)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(historyOrder.paymentHistory || []).map((entry, i) => (
                  <div key={i} style={{ padding: '12px 14px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.95rem' }}>{fmt(entry.amount)}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600 }}>{entry.method}</span>
                    </div>
                    {entry.note && <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginBottom: '4px' }}>{entry.note}</div>}
                    <div style={{ fontSize: '0.7rem', color: 'var(--gray)', opacity: 0.7 }}>
                      {entry.recordedBy} · {entry.recordedAt ? new Date(entry.recordedAt).toLocaleString() : '—'}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '20px', textAlign: 'right' }}>
                <button type="button" onClick={() => setHistoryOrder(null)}
                  style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--white)', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes paySkel {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
