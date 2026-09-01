'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  S, ICONS, SummaryCard, CustomSelect, PaginationBar, EmptyState,
  ConfirmModal, useToast, ToastContainer,
} from '../inventory-v2/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function apiHeaders(token) {
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (process.env.NODE_ENV === 'development') h['ngrok-skip-browser-warning'] = '1';
  return h;
}

// NOT the shared formatDate: that one does `new Date(d + 'T00:00:00')` because it is fed date-only
// strings elsewhere, and created_at is a full timestamp - appending a time to a timestamp yields
// Invalid Date. Same output shape, parsed correctly.
const reviewDate = (d) => {
  const dt = new Date(d);
  return isNaN(dt) ? '-' : dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

function Stars({ rating, size = 13 }) {
  return (
    <span style={{ display: 'inline-flex', gap: '1px', verticalAlign: 'middle' }} title={`${rating} of 5`}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24"
          fill={s <= rating ? 'var(--gold)' : 'none'}
          stroke={s <= rating ? 'var(--gold)' : 'var(--border)'}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

export default function AdminReviewsPage() {
  const { token } = useAuth();
  const { toasts, push, dismiss } = useToast();

  const [reviews, setReviews]       = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [page, setPage]             = useState(1);
  const [perPage, setPerPage]       = useState(25);
  const [total, setTotal]           = useState(0);
  const [rating, setRating]         = useState('');
  const [visibility, setVisibility] = useState('');
  const [busyId, setBusyId]         = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Which comments the reader has opened. Reviews run to 2000 characters and the table exists to be
  // scanned, so every row is clamped until someone asks for the rest.
  const [expanded, setExpanded]     = useState({});

  const load = useCallback(async (p = 1, pp = perPage) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p, per_page: pp });
      if (rating) params.set('rating', rating);
      if (visibility !== '') params.set('visible', visibility);

      const res  = await fetchWithTimeout(`${API_URL}/api/admin/reviews?${params}`, { headers: apiHeaders(token) }, 15000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load reviews.');
      const d = data.data ?? data;
      setReviews(d.reviews ?? []);
      setStats(d.stats ?? null);
      setTotal(d.total ?? 0);
      setPage(p);
    } catch (err) {
      setError(err.message || 'Failed to load reviews.');
    } finally {
      setLoading(false);
    }
  }, [token, rating, visibility, perPage]);

  useEffect(() => { load(1); }, [load]);

  const handleToggle = async (id, currentlyVisible) => {
    setBusyId(id);
    try {
      const res  = await fetchWithTimeout(`${API_URL}/api/admin/reviews/${id}/visibility`,
        { method: 'PATCH', headers: apiHeaders(token) }, 10000);
      const data = await res.json().catch(() => ({}));
      // This used to be a bare `if (!res.ok) return`. The button un-greyed, the row did not change,
      // and nothing said why - so a failed hide looked exactly like a hide that had worked and been
      // rendered wrong. Hiding a review is a moderation decision; it has to report whether it took.
      if (!res.ok) throw new Error(data.message || 'Could not change visibility.');
      const nowVisible = data.data?.is_visible ?? !currentlyVisible;
      setReviews(prev => prev.map(r => ((r._id ?? r.id) === id ? { ...r, is_visible: nowVisible } : r)));
      setStats(s => (s ? { ...s, visible: s.visible + (nowVisible ? 1 : -1), hidden: s.hidden + (nowVisible ? -1 : 1) } : s));
      push(nowVisible ? 'Review is now visible on the storefront.' : 'Review hidden from the storefront.', 'success');
    } catch (err) {
      push(err.message || 'Could not change visibility.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const id = deleteTarget?._id ?? deleteTarget?.id;
    if (!id) return;
    setBusyId(id);
    try {
      const res  = await fetchWithTimeout(`${API_URL}/api/admin/reviews/${id}`,
        { method: 'DELETE', headers: apiHeaders(token) }, 10000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not delete the review.');
      setReviews(prev => prev.filter(r => (r._id ?? r.id) !== id));
      setTotal(t => Math.max(0, t - 1));
      setStats(s => (s ? { ...s, total: Math.max(0, s.total - 1) } : s));
      push('Review deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      push(err.message || 'Could not delete the review.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const ratingOptions = [
    { value: '', label: 'All ratings' },
    ...[5, 4, 3, 2, 1].map(r => ({ value: String(r), label: `${r} star${r === 1 ? '' : 's'}` })),
  ];
  const visibilityOptions = [
    { value: '', label: 'All reviews' },
    { value: 'true', label: 'Visible' },
    { value: 'false', label: 'Hidden' },
  ];

  return (
    <div style={{ ...S.page, padding: '24px' }}>

      <div style={{ ...S.rowBetween, marginBottom: '18px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => load(page)} style={S.btnGhost}>{ICONS.reload} Refresh</button>
      </div>

      <div style={{ ...S.row, marginBottom: '18px' }}>
        <SummaryCard label="Total reviews" value={stats?.total ?? '-'} accent />
        <SummaryCard label="Visible" value={stats?.visible ?? '-'} sub="Shown on the storefront" />
        <SummaryCard label="Hidden" value={stats?.hidden ?? '-'} sub="Moderated out of view" />
        <SummaryCard label="Average rating" value={stats?.avgRating ? `${stats.avgRating} / 5` : '-'} color="var(--gold)" />
      </div>

      {/* No search box: the reviews endpoint takes rating, visible, page and per_page and nothing
          else, so a search field here would only appear to work. */}
      <div style={{ ...S.row, marginBottom: '14px', gap: '10px' }}>
        <div style={{ width: '170px' }}>
          <CustomSelect value={rating} onChange={setRating} options={ratingOptions} placeholder="All ratings" />
        </div>
        <div style={{ width: '170px' }}>
          <CustomSelect value={visibility} onChange={setVisibility} options={visibilityOptions} placeholder="All reviews" />
        </div>
      </div>

      {error && (
        <div style={{ ...S.card, borderColor: '#c62828', color: '#e05252', fontSize: '13px', marginBottom: '14px' }}>
          {error}{' '}
          <button type="button" onClick={() => load(page)}
            style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontWeight: 700 }}>
            Retry
          </button>
        </div>
      )}

      {!error && loading && (
        <div style={{ ...S.col, gap: '8px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ height: '54px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', animation: 'pmPulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {!error && !loading && reviews.length === 0 && (
        <EmptyState
          icon={ICONS.info}
          message={rating || visibility !== '' ? 'No reviews match these filters' : 'No reviews yet'}
          sub={rating || visibility !== ''
            ? 'Clear a filter to widen the list.'
            : 'A customer can review a product once their order is delivered.'}
        />
      )}

      {!error && !loading && reviews.length > 0 && (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
              <thead>
                <tr>
                  <th style={S.th}>Customer</th>
                  <th style={S.th}>Rating</th>
                  <th style={S.th}>Product</th>
                  <th style={{ ...S.th, width: '42%' }}>Review</th>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Status</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r, idx) => {
                  const id   = r._id ?? r.id ?? `rev-${idx}`;
                  const open = !!expanded[id];
                  const long = (r.comment || '').length > 140;
                  return (
                    <tr key={id} style={{ ...S.tr, opacity: r.is_visible ? 1 : 0.55 }}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{r.customerName || 'Customer'}</td>
                      <td style={S.td}><Stars rating={r.rating} /></td>
                      <td style={{ ...S.td, color: r.productName ? 'var(--white)' : 'var(--gray)', fontSize: '12px' }}>
                        {/* Older reviews were written against a whole order, before the per-product
                            split, so they legitimately name no product. Say so rather than blank. */}
                        {r.productName || (r.productId ? 'Unknown product' : 'Whole order')}
                      </td>
                      <td style={{ ...S.td, color: 'var(--gray)', lineHeight: 1.5 }}>
                        <span style={open ? undefined : {
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {r.comment}
                        </span>
                        {long && (
                          <button type="button" onClick={() => setExpanded(e => ({ ...e, [id]: !open }))}
                            style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, padding: '2px 0 0' }}>
                            {open ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </td>
                      <td style={{ ...S.td, color: 'var(--gray)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {r.created_at ? reviewDate(r.created_at) : '-'}
                      </td>
                      <td style={S.td}>
                        <span style={{
                          ...S.badge,
                          background: r.is_visible ? 'rgba(74,222,128,0.12)' : 'rgba(107,114,128,0.15)',
                          color: r.is_visible ? 'var(--green)' : 'var(--gray)',
                          border: `1px solid ${r.is_visible ? 'rgba(74,222,128,0.3)' : 'rgba(107,114,128,0.3)'}`,
                        }}>
                          {r.is_visible ? 'Visible' : 'Hidden'}
                        </span>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => handleToggle(r._id ?? r.id, r.is_visible)}
                          disabled={busyId === (r._id ?? r.id)}
                          style={{ ...S.btnSmGhost, marginRight: '6px', opacity: busyId === (r._id ?? r.id) ? 0.5 : 1 }}>
                          {ICONS.eye} {r.is_visible ? 'Hide' : 'Show'}
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(r)} style={S.btnSmDanger}>
                          {ICONS.trash} Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!error && !loading && total > 0 && (
        <PaginationBar
          total={total} page={page} perPage={perPage}
          onPage={p => load(p)}
          onPerPage={n => { setPerPage(n); load(1, n); }}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={!!busyId && busyId === (deleteTarget?._id ?? deleteTarget?.id)}
        title="Delete this review?"
        message={`This permanently deletes the ${deleteTarget?.rating ?? ''}-star review by ${deleteTarget?.customerName || 'this customer'}. It cannot be undone - if you only want it off the storefront, use Hide instead.`}
        confirmLabel="Delete"
      />

      <ToastContainer toasts={toasts} dismiss={dismiss} />

      <style>{`@keyframes pmPulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }`}</style>
    </div>
  );
}
