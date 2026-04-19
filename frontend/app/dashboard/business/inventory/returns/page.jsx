'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchBadOrders,
  fetchBadOrderStats,
  updateBadOrderStatus,
} from '@/lib/badOrdersApi';

const card = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
};

const input = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#E5E2E1',
  fontSize: '14px',
  boxSizing: 'border-box',
};

const th = {
  color: 'var(--gray)',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 700,
  textAlign: 'left',
  padding: '0.75rem 0.75rem',
  borderBottom: '1px solid var(--border)',
};

const btnPrimary = {
  background: 'var(--gold)',
  color: '#000',
  fontWeight: 700,
  border: 'none',
  borderRadius: '8px',
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const btnGhost = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border)',
  color: 'var(--white)',
  borderRadius: '8px',
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

function formatPhp(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  try {
    const x = new Date(d);
    return x.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

const DAMAGE_STYLES = {
  damaged: { bg: 'rgba(239,68,68,0.15)', color: 'rgba(239,68,68,0.95)', label: 'Damaged' },
  defective: { bg: 'rgba(249,115,22,0.15)', color: 'rgba(249,115,22,0.95)', label: 'Defective' },
  shortage: { bg: 'rgba(234,179,8,0.15)', color: 'rgba(234,179,8,0.95)', label: 'Shortage' },
  wrong_item: { bg: 'rgba(168,85,247,0.15)', color: 'rgba(168,85,247,0.95)', label: 'Wrong item' },
  expired: { bg: 'rgba(156,163,175,0.2)', color: 'var(--gray)', label: 'Expired' },
  other: { bg: 'rgba(255,255,255,0.06)', color: 'var(--gray)', label: 'Other' },
};

const STATUS_STYLES = {
  pending: { bg: 'rgba(234,179,8,0.15)', color: 'rgba(234,179,8,0.95)', label: 'Pending' },
  replaced: { bg: 'rgba(34,197,94,0.15)', color: 'rgba(34,197,94,0.95)', label: 'Replaced' },
  written_off: { bg: 'rgba(156,163,175,0.2)', color: 'var(--gray)', label: 'Written off' },
};

function IconEmpty() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 13V7a2 2 0 00-2-2H6L4 7v12a2 2 0 002 2h14" stroke="var(--gray)" strokeWidth="1.25" />
      <path d="M8 21h12v-8H8v8z" stroke="var(--gray)" strokeWidth="1.25" />
    </svg>
  );
}

function SkeletonRows() {
  return (
    <div style={card}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            padding: '0.75rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            animation: 'bo-shimmer 1.2s ease-in-out infinite',
            opacity: 0.7,
          }}
        >
          <div style={{ height: '12px', background: 'var(--dark2)', borderRadius: '4px', width: '60%' }} />
        </div>
      ))}
      <style>{`
        @keyframes bo-shimmer { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }
      `}</style>
    </div>
  );
}

export default function BadOrdersPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterDamage, setFilterDamage] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [list, st] = await Promise.all([
        fetchBadOrders(token, { status: filterStatus || undefined }),
        fetchBadOrderStats(token),
      ]);
      setRows(list);
      setStats(st);
    } catch (e) {
      setError(e.message || 'Failed to load.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterDamage && (r.damageType || '') !== filterDamage) return false;
      const t = r.createdAt ? new Date(r.createdAt).getTime() : 0;
      if (dateFrom) {
        const a = new Date(dateFrom).setHours(0, 0, 0, 0);
        if (t < a) return false;
      }
      if (dateTo) {
        const b = new Date(dateTo).setHours(23, 59, 59, 999);
        if (t > b) return false;
      }
      return true;
    });
  }, [rows, filterDamage, dateFrom, dateTo]);

  async function applyStatus(id, status) {
    if (!token) return;
    setConfirm(null);
    try {
      await updateBadOrderStatus(token, id, { status });
      await load();
    } catch (e) {
      setError(e.message || 'Update failed.');
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1280px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>Bad Orders</h1>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: 'var(--gray)' }}>
          Damaged, defective, shortage, or wrong items received from suppliers
        </p>
      </div>

      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          {[
            { label: 'Pending', value: stats.pendingCount ?? 0 },
            { label: 'Replaced', value: stats.replacedCount ?? 0 },
            { label: 'Written off', value: stats.writtenOffCount ?? 0 },
            { label: 'Total loss', value: formatPhp(stats.totalLoss ?? 0) },
          ].map((s) => (
            <div key={s.label} style={{ ...card, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                {s.label}
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--white)', marginTop: '0.35rem' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          ...card,
          padding: '1rem',
          marginBottom: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>API status</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={input}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="replaced">Replaced</option>
            <option value="written_off">Written off</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Damage type</label>
          <select value={filterDamage} onChange={(e) => setFilterDamage(e.target.value)} style={input}>
            <option value="">All</option>
            <option value="damaged">Damaged</option>
            <option value="defective">Defective</option>
            <option value="shortage">Shortage</option>
            <option value="wrong_item">Wrong item</option>
            <option value="expired">Expired</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={input} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={input} />
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: 'rgba(239,68,68,1)',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span>{error}</span>
          <button type="button" onClick={load} style={btnGhost}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonRows />
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: '3rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <IconEmpty />
          </div>
          <p style={{ margin: 0, color: 'var(--gray)' }}>No bad order records match your filters.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', ...card }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Material</th>
                <th style={th}>Vendor</th>
                <th style={th}>Damage</th>
                <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                <th style={{ ...th, textAlign: 'right' }}>Total loss</th>
                <th style={th}>Status</th>
                <th style={th}>Date</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const id = r._id ?? r.id;
                const dmg = DAMAGE_STYLES[r.damageType] || DAMAGE_STYLES.other;
                const st = STATUS_STYLES[r.status] || STATUS_STYLES.pending;
                return (
                  <tr key={String(id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--white)' }}>{r.materialName || '—'}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--gray)' }}>{r.vendorName || '—'}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: dmg.bg,
                          color: dmg.color,
                        }}
                      >
                        {dmg.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--white)', fontVariantNumeric: 'tabular-nums' }}>{r.quantity ?? r.qty ?? '—'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gold)', fontWeight: 600 }}>{formatPhp(r.totalLoss)}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: st.bg,
                          color: st.color,
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--gray)', whiteSpace: 'nowrap' }}>{formatDate(r.createdAt)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button type="button" style={btnPrimary} onClick={() => setConfirm({ id, status: 'replaced', label: 'Mark as replaced?' })}>
                            Replaced
                          </button>
                          <button
                            type="button"
                            style={{
                              background: 'rgba(239,68,68,0.1)',
                              border: '1px solid rgba(239,68,68,0.25)',
                              color: '#ef4444',
                              fontWeight: 600,
                              borderRadius: '8px',
                              padding: '0.5rem 0.75rem',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                            }}
                            onClick={() => setConfirm({ id, status: 'written_off', label: 'Write off this loss?' })}
                          >
                            Write off
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ ...card, padding: '1.5rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--white)', fontSize: '1.05rem' }}>Confirm status</h3>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--gray)', fontSize: '0.9rem' }}>{confirm.label}</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={() => applyStatus(confirm.id, confirm.status)}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
