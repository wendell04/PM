'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'http://127.0.0.1:8000';

export default function AuditLogsPage() {
  const { token } = useAuth();

  // Data
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);

  // Loading/error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterReason, setFilterReason] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterReason) params.set('reason', filterReason);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);

      const [logsRes, summaryRes] = await Promise.all([
        fetch(
          `${API_URL}/api/admin/audit-logs?${params}`,
          { headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          }}
        ),
        fetch(
          `${API_URL}/api/admin/audit-logs/summary?${params}`,
          { headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          }}
        ),
      ]);

      const logsData = await logsRes.json();
      const summaryData = await summaryRes.json();

      if (!logsRes.ok) throw new Error(
        logsData.message || 'Failed to fetch audit logs');

      setLogs(logsData.data || logsData || []);
      setSummary(summaryData.data || summaryData || null);
    } catch (err) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [token, filterReason, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (token) fetchLogs();
  }, [fetchLogs, token]);

  // Helpers
  const getReasonLabel = (reason) => {
    const labels = {
      'restock':           'Restock',
      'correction-add':    'Correction (Add)',
      'correction-deduct': 'Correction (Deduct)',
      'sale':              'Sale',
      'return':            'Return',
      'sales-outside':     'Manual Sale',
    };
    return labels[reason] || reason;
  };

  const getReasonStyle = (reason) => {
    const styles = {
      'restock': {
        background: 'rgba(74,222,128,0.12)',
        color: '#4ade80',
        border: '1px solid rgba(74,222,128,0.3)',
      },
      'correction-add': {
        background: 'rgba(99,102,241,0.12)',
        color: '#818cf8',
        border: '1px solid rgba(99,102,241,0.3)',
      },
      'correction-deduct': {
        background: 'rgba(251,191,36,0.12)',
        color: '#fbbf24',
        border: '1px solid rgba(251,191,36,0.3)',
      },
      'sale': {
        background: 'rgba(212,168,67,0.12)',
        color: 'var(--gold)',
        border: '1px solid rgba(212,168,67,0.3)',
      },
      'return': {
        background: 'rgba(156,163,175,0.12)',
        color: '#9ca3af',
        border: '1px solid rgba(156,163,175,0.3)',
      },
      'sales-outside': {
        background: 'rgba(251,146,60,0.12)',
        color: '#fb923c',
        border: '1px solid rgba(251,146,60,0.3)',
      },
    };
    return styles[reason] || {
      background: 'rgba(255,255,255,0.05)',
      color: 'var(--gray)',
      border: '1px solid var(--border)',
    };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Client-side search filter
  const filtered = logs.filter(log => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (log.productName || '').toLowerCase().includes(q) ||
      (log.category || '').toLowerCase().includes(q) ||
      (log.performedBy || '').toLowerCase().includes(q)
    );
  });

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">

        {/* Page Header */}
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">Audit Logs</h1>
              <p className="page-subtitle">
                Stock movement history — restocks, sales, corrections, and returns.
              </p>
            </div>
            <button
              onClick={fetchLogs}
              disabled={loading}
              style={{
                padding: '0.625rem 1.25rem',
                background: loading ? 'var(--dark3)' : 'var(--gold)',
                border: 'none',
                borderRadius: '8px',
                color: loading ? 'var(--gray)' : '#000',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36 L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Summary Cards */}
          {summary && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem',
              marginTop: '1.5rem',
            }}>
              {[
                {
                  label: 'Total Stock In',
                  value: summary.totalStockIn ?? 0,
                  color: '#4ade80',
                  bg: 'rgba(74,222,128,0.08)',
                  border: 'rgba(74,222,128,0.2)',
                  icon: 'M12 5v14M5 12l7-7 7 7',
                },
                {
                  label: 'Total Stock Out',
                  value: summary.totalStockOut ?? 0,
                  color: '#f87171',
                  bg: 'rgba(248,113,113,0.08)',
                  border: 'rgba(248,113,113,0.2)',
                  icon: 'M12 19V5M5 12l7 7 7-7',
                },
                {
                  label: 'Total Sales',
                  value: summary.totalSales ?? 0,
                  color: 'var(--gold)',
                  bg: 'rgba(212,168,67,0.08)',
                  border: 'rgba(212,168,67,0.2)',
                  icon: 'M13 10V3L4 14h7v7l9-11h-7z',
                },
                {
                  label: 'Total Restocks',
                  value: summary.totalRestocks ?? 0,
                  color: '#818cf8',
                  bg: 'rgba(99,102,241,0.08)',
                  border: 'rgba(99,102,241,0.2)',
                  icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10',
                },
              ].map(card => (
                <div key={card.label} style={{
                  padding: '1.25rem',
                  background: card.bg,
                  border: `1px solid ${card.border}`,
                  borderRadius: '12px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                  }}>
                    <svg width="16" height="16"
                      viewBox="0 0 24 24" fill="none"
                      stroke={card.color} strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d={card.icon}/>
                    </svg>
                    <span style={{
                      fontSize: '0.75rem',
                      color: 'var(--gray)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {card.label}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: card.color,
                  }}>
                    {card.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
          alignItems: 'center',
        }}>
          {/* Search */}
          <div className="search-wrapper" style={{ flex: 1, minWidth: '200px' }}>
            <span className="search-icon">
              <svg width="16" height="16"
                viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
            <input
              type="text"
              className="search-input"
              placeholder="Search product, category, or performed by..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => setSearchQuery('')}
              >×</button>
            )}
          </div>

          {/* Reason filter */}
          <select
            value={filterReason}
            onChange={e => setFilterReason(e.target.value)}
            style={{
              padding: '0.625rem 0.875rem',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: filterReason ? 'var(--white)' : 'var(--gray)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            <option value="">All Reasons</option>
            <option value="restock">Restock</option>
            <option value="correction-add">Correction (Add)</option>
            <option value="correction-deduct">Correction (Deduct)</option>
            <option value="sale">Sale</option>
            <option value="return">Return</option>
            <option value="sales-outside">Manual Sale</option>
          </select>

          {/* Start date */}
          <input
            type="date"
            value={filterStartDate}
            onChange={e => setFilterStartDate(e.target.value)}
            style={{
              padding: '0.625rem 0.875rem',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: filterStartDate ? 'var(--white)' : 'var(--gray)',
              fontSize: '0.875rem',
            }}
          />

          {/* End date */}
          <input
            type="date"
            value={filterEndDate}
            onChange={e => setFilterEndDate(e.target.value)}
            style={{
              padding: '0.625rem 0.875rem',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: filterEndDate ? 'var(--white)' : 'var(--gray)',
              fontSize: '0.875rem',
            }}
          />

          {/* Clear filters */}
          {(filterReason || filterStartDate || filterEndDate || searchQuery) && (
            <button
              onClick={() => {
                setFilterReason('');
                setFilterStartDate('');
                setFilterEndDate('');
                setSearchQuery('');
              }}
              style={{
                padding: '0.625rem 0.875rem',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--gray)',
                fontSize: '0.875rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div style={{
            padding: '1rem',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px',
            color: 'var(--red)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <svg width="18" height="18"
              viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="loading-state">
            <div className="loading-spinner"/>
            <p>Loading audit logs...</p>
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="48" height="48"
                    viewBox="0 0 24 24" fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                  </svg>
                </div>
                <h3 className="empty-title">
                  No Audit Logs Found
                </h3>
                <p className="empty-description">
                  {filterReason || filterStartDate || filterEndDate || searchQuery
                    ? 'Try adjusting your filters.'
                    : 'Stock movements will appear here once inventory is updated.'}
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.875rem',
                }}>
                  <thead>
                    <tr style={{
                      background: 'rgba(0,0,0,0.2)',
                      borderBottom: '2px solid var(--border)',
                    }}>
                      {[
                        'Date',
                        'Product',
                        'Category',
                        'Reason',
                        'Qty Change',
                        'Stock Before',
                        'Stock After',
                        'Unit Cost',
                        'Performed By',
                        'Remarks',
                      ].map(h => (
                        <th key={h} style={{
                          padding: '0.875rem 1rem',
                          textAlign: h === 'Qty Change'
                            || h === 'Stock Before'
                            || h === 'Stock After'
                            || h === 'Unit Cost'
                            ? 'center' : 'left',
                          color: 'var(--gray)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log, i) => {
                      const isPositive = log.quantity > 0;
                      return (
                        <tr key={log._id || i} style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                        }}>
                          {/* Date */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            color: 'var(--gray)',
                            whiteSpace: 'nowrap',
                            fontSize: '0.8rem',
                          }}>
                            {formatDate(log.createdAt)}
                          </td>

                          {/* Product */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            fontWeight: 600,
                            color: 'var(--white)',
                            maxWidth: '180px',
                          }}>
                            <div style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {log.productName || '—'}
                            </div>
                          </td>

                          {/* Category */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            color: 'var(--gray)',
                            fontSize: '0.8rem',
                          }}>
                            <span style={{
                              padding: '0.2rem 0.6rem',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                            }}>
                              {log.category || '—'}
                            </span>
                          </td>

                          {/* Reason badge */}
                          <td style={{ padding: '0.875rem 1rem' }}>
                            <span style={{
                              ...getReasonStyle(log.reason),
                              padding: '0.2rem 0.7rem',
                              borderRadius: '999px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                            }}>
                              {getReasonLabel(log.reason)}
                            </span>
                          </td>

                          {/* Qty Change */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            textAlign: 'center',
                            fontWeight: 700,
                            color: isPositive ? '#4ade80' : '#f87171',
                            fontSize: '0.9rem',
                          }}>
                            {isPositive ? '+' : ''}{log.quantity}
                          </td>

                          {/* Stock Before */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            textAlign: 'center',
                            color: 'var(--gray)',
                          }}>
                            {log.stockBefore ?? '—'}
                          </td>

                          {/* Stock After */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            textAlign: 'center',
                            color: 'var(--gold)',
                            fontWeight: 600,
                          }}>
                            {log.stockAfter ?? '—'}
                          </td>

                          {/* Unit Cost */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            textAlign: 'center',
                            color: 'var(--gray)',
                            fontSize: '0.8rem',
                          }}>
                            {log.unitCost
                              ? `₱${Number(log.unitCost).toLocaleString('en-PH', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2 })}`
                              : '—'}
                          </td>

                          {/* Performed By */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            color: 'var(--gray)',
                            fontSize: '0.8rem',
                          }}>
                            {log.performedBy || '—'}
                          </td>

                          {/* Remarks */}
                          <td style={{
                            padding: '0.875rem 1rem',
                            color: 'var(--gray)',
                            fontSize: '0.78rem',
                            maxWidth: '200px',
                          }}>
                            <div style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }} title={log.remarks || ''}>
                              {log.remarks || '—'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Row count */}
        {!loading && filtered.length > 0 && (
          <div style={{
            marginTop: '0.75rem',
            fontSize: '0.8rem',
            color: 'var(--gray)',
            textAlign: 'right',
          }}>
            Showing {filtered.length} of {logs.length}
            {' '}log{logs.length !== 1 ? 's' : ''}
            {logs.length === 100 && (
              <span style={{ color: '#fbbf24', marginLeft: '0.5rem' }}>
                (limit: 100 — use date filters to narrow results)
              </span>
            )}
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}
