'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function apiHeaders(token) {
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (process.env.NODE_ENV === 'development') h['ngrok-skip-browser-warning'] = '1';
  return h;
}

function StarDisplay({ rating, size = 14 }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24"
          fill={s <= rating ? 'var(--gold)' : 'none'}
          stroke="var(--gold)" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  );
}

export default function AdminReviewsPage() {
  const { token } = useAuth();

  const [reviews, setReviews]           = useState([]);
  const [stats, setStats]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [total, setTotal]               = useState(0);
  const [filterRating, setFilterRating] = useState('');
  const [filterVisible, setFilterVisible] = useState('');
  const [togglingId, setTogglingId]     = useState(null);
  const [deletingId, setDeletingId]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const PER_PAGE = 20;

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p, per_page: PER_PAGE });
      if (filterRating) params.set('rating', filterRating);
      if (filterVisible !== '') params.set('visible', filterVisible);

      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/reviews?${params}`,
        { headers: apiHeaders(token) },
        15000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load reviews.');
      const d = data.data ?? data;
      setReviews(d.reviews ?? []);
      setStats(d.stats ?? null);
      setTotal(d.total ?? 0);
      setTotalPages(d.totalPages ?? 1);
      setPage(p);
    } catch (err) {
      setError(err.message || 'Failed to load reviews.');
    } finally {
      setLoading(false);
    }
  }, [token, filterRating, filterVisible]);

  useEffect(() => { load(1); }, [load]);

  const handleToggleVisibility = async (id, currentVisible) => {
    setTogglingId(id);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/reviews/${id}/visibility`,
        { method: 'PATCH', headers: apiHeaders(token) },
        10000
      );
      const data = await res.json();
      if (!res.ok) return;
      setReviews(prev => prev.map(r =>
        (r._id ?? r.id) === id ? { ...r, is_visible: data.data?.is_visible ?? !currentVisible } : r
      ));
      if (stats) {
        const delta = currentVisible ? -1 : 1;
        setStats(s => ({ ...s, visible: s.visible + delta, hidden: s.hidden - delta }));
      }
    } catch {}
    finally { setTogglingId(null); }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/reviews/${id}`,
        { method: 'DELETE', headers: apiHeaders(token) },
        10000
      );
      if (!res.ok) return;
      setReviews(prev => prev.filter(r => (r._id ?? r.id) !== id));
      setTotal(t => t - 1);
      if (stats) setStats(s => ({ ...s, total: s.total - 1 }));
    } catch {}
    finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div style={{ padding: '24px' }}>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total Reviews', value: stats.total },
            { label: 'Visible', value: stats.visible, color: 'var(--green)' },
            { label: 'Hidden', value: stats.hidden, color: 'var(--gray)' },
            { label: 'Avg Rating', value: stats.avgRating ? `${stats.avgRating} ★` : '—', color: 'var(--gold)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              flex: '1 1 160px',
              padding: '16px 20px',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                {label}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color || 'var(--white)' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filterRating}
          onChange={e => setFilterRating(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--dark2)', color: 'var(--white)',
            fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          <option value="">All Ratings</option>
          {[5,4,3,2,1].map(r => <option key={r} value={r}>{r} Stars</option>)}
        </select>
        <select
          value={filterVisible}
          onChange={e => setFilterVisible(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--dark2)', color: 'var(--white)',
            fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          <option value="">All Visibility</option>
          <option value="true">Visible</option>
          <option value="false">Hidden</option>
        </select>
        <span style={{ fontSize: '0.8rem', color: 'var(--gray)', marginLeft: 'auto' }}>
          {total} result{total !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: 'var(--red)', fontSize: '0.875rem',
          marginBottom: '16px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => load(page)} style={{ background: 'none', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: '80px', background: 'var(--dark2)', borderRadius: '10px', border: '1px solid var(--border)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {!loading && reviews.length === 0 && !error && (
        <div style={{
          textAlign: 'center', padding: '3rem',
          background: 'var(--dark2)', border: '1px solid var(--border)',
          borderRadius: '12px', color: 'var(--gray)',
        }}>
          No reviews found.
        </div>
      )}

      {!loading && reviews.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: '12px', alignItems: 'start' }}>
          {reviews.map((r, idx) => {
            const id = r._id ?? r.id;
            return (
              <div key={id || `rev-${idx}`} style={{
                padding: '16px',
                background: 'var(--dark2)',
                border: `1px solid ${r.is_visible ? 'var(--border)' : 'rgba(107,114,128,0.3)'}`,
                borderRadius: '10px',
                opacity: r.is_visible ? 1 : 0.65,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--white)' }}>
                        {r.customerName || 'Customer'}
                      </span>
                      <StarDisplay rating={r.rating} />
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
                        background: r.is_visible ? 'rgba(74,222,128,0.1)' : 'rgba(107,114,128,0.15)',
                        color: r.is_visible ? 'var(--green)' : 'var(--gray)',
                        border: `1px solid ${r.is_visible ? 'rgba(74,222,128,0.3)' : 'rgba(107,114,128,0.3)'}`,
                      }}>
                        {r.is_visible ? 'Visible' : 'Hidden'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gray)', marginLeft: 'auto' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                      {r.comment}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggleVisibility(id, r.is_visible)}
                      disabled={togglingId === id}
                      title={r.is_visible ? 'Hide review' : 'Show review'}
                      style={{
                        padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                        border: `1px solid ${r.is_visible ? 'rgba(107,114,128,0.4)' : 'rgba(74,222,128,0.4)'}`,
                        background: 'transparent',
                        color: r.is_visible ? 'var(--gray)' : 'var(--green)',
                        cursor: togglingId === id ? 'not-allowed' : 'pointer',
                        opacity: togglingId === id ? 0.5 : 1,
                      }}
                    >
                      {togglingId === id ? '...' : r.is_visible ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      title="Delete review"
                      style={{
                        padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                        border: '1px solid rgba(239,68,68,0.4)',
                        background: 'transparent', color: 'var(--red)',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: '1px solid var(--border)',
              background: page <= 1 ? 'transparent' : 'var(--dark2)',
              color: page <= 1 ? 'var(--border)' : 'var(--gray)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ← Prev
          </button>
          <span style={{ padding: '8px 16px', fontSize: '0.875rem', color: 'var(--gray)', alignSelf: 'center' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= totalPages}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: '1px solid var(--border)',
              background: page >= totalPages ? 'transparent' : 'var(--dark2)',
              color: page >= totalPages ? 'var(--border)' : 'var(--gray)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Next →
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div
          onClick={() => setDeleteTarget(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%', maxWidth: '400px',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
              Delete Review?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              This will permanently delete the review by{' '}
              <strong style={{ color: 'var(--white)' }}>{deleteTarget.customerName || 'Customer'}</strong>.
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={!!deletingId}
                style={{
                  padding: '9px 20px', borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--dark)',
                  color: 'var(--gray)', fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget._id ?? deleteTarget.id)}
                disabled={!!deletingId}
                style={{
                  padding: '9px 20px', borderRadius: '8px',
                  border: 'none',
                  background: deletingId ? 'rgba(239,68,68,0.4)' : 'var(--red)',
                  color: 'var(--white)', fontSize: '0.875rem',
                  fontWeight: 700, cursor: deletingId ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
