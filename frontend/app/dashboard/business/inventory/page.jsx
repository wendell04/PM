'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchInventory, fetchRecentMovements } from '@/lib/inventoryApi';

function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputCard = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
};

const thStyle = {
  color: 'var(--gray)',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 700,
  textAlign: 'left',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
};

const tdStyle = {
  padding: '0.75rem 1rem',
  fontSize: '0.8125rem',
  color: 'var(--white)',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const btnGhost = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  padding: '0.625rem 0.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--white)',
  fontWeight: 600,
  fontSize: '0.875rem',
  textDecoration: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

function IconDatabase() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="7" ry="3" stroke="var(--gold)" strokeWidth="1.25" />
      <path d="M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5" stroke="var(--gold)" strokeWidth="1.25" />
      <path d="M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" stroke="var(--gold)" strokeWidth="1.25" />
    </svg>
  );
}

function IconArrowIn() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v12m0 0l-4-4m4 4l4-4" stroke="var(--gold)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" stroke="var(--gold)" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L3 7l9 5 9-5-9-5z" stroke="var(--gold)" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M3 12l9 5 9-5M3 17l9 5 9-5" stroke="var(--gold)" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 9v4m0 3h.01M4.93 4.93l14.14 14.14M12 2a10 10 0 100 20 10 10 0 000-20z" stroke="var(--gold)" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 13V5a2 2 0 012-2h12a2 2 0 012 2v8" stroke="var(--gray)" strokeWidth="1.25" />
      <path d="M4 13l4 4h8l4-4M4 13h6v4h4v-4h6" stroke="var(--gray)" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function SummarySkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ ...inputCard, padding: '1.25rem', minHeight: '96px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ height: '10px', width: '40%', background: 'var(--dark2)', borderRadius: '4px', marginBottom: '0.75rem' }} />
          <div style={{ height: '22px', width: '55%', background: 'var(--dark2)', borderRadius: '4px' }} />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div style={inputCard}>
      <div style={{ padding: '1rem' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ height: '14px', background: 'var(--dark2)', borderRadius: '4px', marginBottom: '0.65rem', opacity: 0.7 }} />
        ))}
      </div>
    </div>
  );
}

export default function InventoryDashboardPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [movementsError, setMovementsError] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMovementsError(null);
    try {
      const [invRaw, mov] = await Promise.all([
        fetchInventory(token),
        fetchRecentMovements(token).catch(err => {
          setMovementsError(err.message || 'Could not load movements.');
          return [];
        }),
      ]);
      const inv = Array.isArray(invRaw) ? invRaw : [];
      setItems(inv);
      setMovements(mov);
    } catch (e) {
      setError(e.message || 'Failed to load inventory.');
      setItems([]);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = items.filter(i => i.isActive !== false);
    const tracked = active.filter(i => !i.isOnDemand);
    const totalMaterials = active.length;
    const lowStock = tracked.filter(
      i => (i.stockQty ?? 0) > 0 && (i.stockQty ?? 0) <= (i.minStockLevel ?? 0)
    ).length;
    const outOfStock = tracked.filter(
      i => (i.stockQty ?? 0) === 0 && Array.isArray(i.batches) && i.batches.length > 0
    ).length;
    const totalValue = tracked.reduce((sum, i) => {
      const unit = i.baseCost ?? i.averageCost ?? i.lastUnitCost ?? 0;
      return sum + (i.stockQty ?? 0) * Number(unit);
    }, 0);
    return { totalMaterials, lowStock, outOfStock, totalValue };
  }, [items]);

  const quickLinks = [
    { href: '/dashboard/business/inventory/master-data', label: 'Master Data', Icon: IconDatabase },
    { href: '/dashboard/business/inventory/stock-in', label: 'Stock In', Icon: IconArrowIn },
    { href: '/dashboard/business/inventory/stocks', label: 'Stock Overview', Icon: IconLayers },
    { href: '/dashboard/business/inventory/returns', label: 'Bad Orders', Icon: IconAlert },
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title">Inventory</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--gray)' }}>
          Summary, recent stock activity, and shortcuts
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <SummarySkeleton />
          <TableSkeleton />
        </div>
      ) : error ? (
        <div
          style={{
            ...inputCard,
            padding: '2rem',
            textAlign: 'center',
            color: 'rgba(239,68,68,1)',
            background: 'rgba(239,68,68,0.08)',
            borderColor: 'rgba(239,68,68,0.25)',
          }}
        >
          <p style={{ margin: '0 0 1rem' }}>{error}</p>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              ...btnGhost,
              width: 'auto',
              display: 'inline-flex',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? <span className="spinner" /> : 'Retry'}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ ...inputCard, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.5rem' }}>
                Total materials
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>{stats.totalMaterials}</div>
            </div>
            <div style={{ ...inputCard, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.5rem' }}>
                Low stock
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)' }}>{stats.lowStock}</div>
            </div>
            <div style={{ ...inputCard, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.5rem' }}>
                Out of stock
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>{stats.outOfStock}</div>
            </div>
            <div style={{ ...inputCard, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.5rem' }}>
                Total stock value
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--white)' }}>{formatMoney(stats.totalValue)}</div>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Recent movements</h2>
            {movementsError && (
              <div style={{ marginBottom: '0.75rem', padding: '0.625rem 0.75rem', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'rgba(239,68,68,1)', fontSize: '0.8125rem' }}>
                {movementsError}
              </div>
            )}
            {movements.length === 0 && !movementsError ? (
              <div style={{ ...inputCard, padding: '2.5rem', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}><IconInbox /></div>
                <p style={{ margin: 0, color: 'var(--gray)', fontSize: '0.875rem' }}>No stock movements yet.</p>
              </div>
            ) : movements.length > 0 ? (
              <div style={{ overflowX: 'auto', ...inputCard }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Material</th>
                      <th style={thStyle}>Type</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Quantity</th>
                      <th style={thStyle}>Reason</th>
                      <th style={thStyle}>Performed by</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((row, idx) => {
                      const isIn = row.type === 'in';
                      const typeColor = isIn ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';
                      return (
                        <tr key={`${row.item}-${row.time}-${idx}`}>
                          <td style={tdStyle}>{row.item}</td>
                          <td style={{ ...tdStyle, color: typeColor, fontWeight: 600 }}>
                            {isIn ? 'In' : 'Out'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.qty}</td>
                          <td style={{ ...tdStyle, color: 'var(--gray)' }}>{row.label}</td>
                          <td style={{ ...tdStyle, color: 'var(--gray)' }}>{row.performedBy ?? '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--gray)', whiteSpace: 'nowrap' }}>{row.time}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Quick links</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {quickLinks.map(({ href, label, Icon }) => (
                <Link key={href} href={href} style={btnGhost}>
                  <Icon />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
