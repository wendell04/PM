'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchOrderRequests,
  updateOrderRequestStatus,
} from '@/lib/orderRequestApi';

const STATUS_LABELS = {
  pending_review: 'Pending Review',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready for Pickup',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS = {
  pending_review: { bg: 'var(--gold)', color: '#000' },
  confirmed: { bg: '#3b82f6', color: '#fff' },
  processing: { bg: '#8b5cf6', color: '#fff' },
  ready: { bg: 'var(--green)', color: '#000' },
  delivered: { bg: 'var(--gray)', color: '#000' },
  cancelled: { bg: 'var(--red)', color: '#fff' },
};

const VALID_NEXT_STATUSES = {
  pending_review: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

function formatPeso(n) {
  if (n == null) return '—';
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status, size = 'sm' }) {
  const colors = STATUS_COLORS[status] || { bg: 'var(--gray)', color: '#000' };
  const label = STATUS_LABELS[status] || status;
  return (
    <span style={{
      display: 'inline-block',
      background: colors.bg,
      color: colors.color,
      borderRadius: '999px',
      padding: size === 'lg' ? '0.375rem 1rem' : '0.25rem 0.75rem',
      fontSize: size === 'lg' ? '0.875rem' : '0.75rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export default function OrderRequestsPage() {
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [modalSuccess, setModalSuccess] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updatePrice, setUpdatePrice] = useState('');
  const [updateNote, setUpdateNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Fetch on mount
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchOrderRequests(token);
        if (!cancelled) setRequests(result.data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token]);

  // Auto-refresh every 30s — skipped when a modal is active or submitting
  const pollRef = useRef(null);
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(async () => {
      if (submitting || selectedRequest != null) return;
      try {
        const result = await fetchOrderRequests(token);
        setRequests(result.data);
      } catch {
        // silent — do not overwrite existing error state on poll failure
      }
    }, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, submitting, selectedRequest]);

  // Filtered requests
  const filtered = useCallback(() => {
    let list = requests;
    if (activeFilter !== 'all') {
      list = list.filter(r => r.status === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r =>
        (r.customerName || '').toLowerCase().includes(q) ||
        (r.customerEmail || '').toLowerCase().includes(q) ||
        (r.productName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, activeFilter, searchQuery]);

  // Counts for summary cards
  const counts = useCallback(() => {
    const c = { all: requests.length };
    FILTER_OPTIONS.forEach(f => { if (f.key !== 'all') c[f.key] = 0; });
    requests.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
    return c;
  }, [requests]);

  // Open review modal
  function openReview(req) {
    setSelectedRequest(req);
    setUpdateStatus('');
    setUpdatePrice(req.finalPrice != null ? String(req.finalPrice) : '');
    setUpdateNote('');
    setModalError(null);
    setModalSuccess(null);
  }

  // Close review modal
  function closeReview() {
    setSelectedRequest(null);
    setUpdateStatus('');
    setUpdatePrice('');
    setUpdateNote('');
    setModalError(null);
    setModalSuccess(null);
  }

  // Submit status update
  async function handleSubmitUpdate() {
    if (!selectedRequest || !token) return;
    const nextStatus = updateStatus;
    if (!nextStatus) {
      setModalError('Please select a status.');
      return;
    }
    if (nextStatus === 'confirmed' && (!updatePrice || Number(updatePrice) <= 0)) {
      setModalError('Final price is required and must be greater than 0 when confirming.');
      return;
    }

    setSubmitting(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      const payload = {
        status: nextStatus,
        finalPrice: updatePrice ? Number(updatePrice) : undefined,
        note: updateNote.trim() || undefined,
      };
      const updated = await updateOrderRequestStatus(token, selectedRequest.id, payload);
      // Update local state
      setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
      setSelectedRequest(updated);
      setModalSuccess(`Status updated to "${STATUS_LABELS[updated.status] || updated.status}".`);
      setUpdateNote('');
      setUpdateStatus('');
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Get valid next statuses for current request
  function getNextStatuses(currentStatus) {
    return VALID_NEXT_STATUSES[currentStatus] || [];
  }

  const filteredRequests = filtered();
  const cardCounts = counts();

  return (
    <div style={{ padding: '2rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            <path d="M9 12h6M9 16h6"/>
          </svg>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>Order Requests</h1>
        </div>
        <p style={{ margin: 0, color: 'var(--gray)', fontSize: '0.9rem' }}>Review and manage customer print orders</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {FILTER_OPTIONS.map(opt => {
          const isActive = activeFilter === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setActiveFilter(opt.key)}
              style={{
                flex: '1 1 120px',
                minWidth: '100px',
                padding: '0.75rem 1rem',
                background: isActive ? 'rgba(212,168,67,0.1)' : 'var(--dark2)',
                border: isActive ? '2px solid var(--gold)' : '1px solid var(--border)',
                borderRadius: '10px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isActive ? 'var(--gold)' : 'var(--white)' }}>
                {cardCounts[opt.key] ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.25rem' }}>{opt.label}</div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search customer or product..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem 0.625rem 2.5rem',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--white)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--gold)' }} />
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--red)' }}>
          <p style={{ marginBottom: '1rem' }}>{error}</p>
          <button
            disabled={isRetrying}
            onClick={async () => {
              if (isRetrying) return;
              setIsRetrying(true);
              setLoading(true);
              setError(null);
              try {
                const r = await fetchOrderRequests(token);
                setRequests(r.data);
              } catch (e) {
                setError(e.message);
              } finally {
                setLoading(false);
                setIsRetrying(false);
              }
            }}
            style={{
              background: isRetrying ? 'var(--dark3)' : 'var(--gold)',
              color: isRetrying ? 'var(--gray)' : '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '0.625rem 1.25rem',
              fontWeight: 700,
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              opacity: isRetrying ? 0.6 : 1,
            }}
          >
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          {filteredRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5" style={{ marginBottom: '1rem' }}>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
              <p style={{ fontSize: '1rem', color: 'var(--white)', marginBottom: '0.5rem' }}>No order requests found</p>
              <p style={{ fontSize: '0.85rem' }}>
                {activeFilter !== 'all' ? `No ${STATUS_LABELS[activeFilter]?.toLowerCase() || activeFilter} requests` : 'No requests yet'}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                <thead>
                  <tr style={{ background: 'var(--dark2)', borderBottom: '1px solid var(--border)' }}>
                    {['#', 'Customer', 'Product', 'Qty', 'Suggested', 'Final Price', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req, idx) => (
                    <tr key={req.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--dark)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--gray)' }}>{idx + 1}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>{req.customerName || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{req.customerEmail || '—'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {req.productThumbnail ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={req.productThumbnail} alt="" style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'var(--dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--white)', fontWeight: 600 }}>{req.productName || '—'}</div>
                            {req.category && (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', color: 'var(--gray)', padding: '0.125rem 0.5rem', borderRadius: '999px', marginTop: '0.25rem', display: 'inline-block' }}>{req.category}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--white)', fontWeight: 600 }}>{req.quantity}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--gray)' }}>{formatPeso(req.suggestedPrice)}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: req.finalPrice != null ? 'var(--gold)' : 'var(--gray)' }}>{formatPeso(req.finalPrice)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}><StatusBadge status={req.status} /></td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--gray)', whiteSpace: 'nowrap' }}>{formatDate(req.createdAt)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          onClick={() => openReview(req)}
                          style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Review Modal */}
      {selectedRequest && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={closeReview}>
          <div style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '16px', maxWidth: '860px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>
                Order Request #{selectedRequest.id?.slice(0, 8).toUpperCase()}
              </h2>
              <button onClick={closeReview} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--gray)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', flexWrap: 'wrap' }}>
              {/* Left Column — Order Details */}
              <div style={{ flex: '1 1 340px', minWidth: '280px' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order Details</h3>

                {/* Product */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-start' }}>
                  {selectedRequest.productThumbnail ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={selectedRequest.productThumbnail} alt="" style={{ width: '120px', height: '120px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '120px', height: '120px', borderRadius: '12px', background: 'var(--dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.375rem' }}>{selectedRequest.productName || '—'}</div>
                    {selectedRequest.category && (
                      <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.08)', color: 'var(--gray)', padding: '0.125rem 0.5rem', borderRadius: '999px' }}>{selectedRequest.category}</span>
                    )}
                  </div>
                </div>

                {/* Customer */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Customer</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>{selectedRequest.customerName || '—'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{selectedRequest.customerEmail || '—'}</div>
                </div>

                {/* Quantity */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Quantity</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>{selectedRequest.quantity}</div>
                </div>

                {/* Variants */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Selected Variants</div>
                  {selectedRequest.selectedVariants && Object.keys(selectedRequest.selectedVariants).length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {Object.entries(selectedRequest.selectedVariants).map(([key, val]) => (
                        <span key={key} style={{ fontSize: '0.8rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.25rem 0.625rem', color: 'var(--white)' }}>
                          {key}: {val}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>None</div>
                  )}
                </div>

                {/* Suggested Price */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Suggested Price</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>{formatPeso(selectedRequest.suggestedPrice)}</div>
                </div>

                {/* Design File */}
                {selectedRequest.designUrl && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Design File</div>
                    <a href={selectedRequest.designUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.85rem', color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      View Design File
                    </a>
                  </div>
                )}

                {/* Design Notes */}
                {selectedRequest.designNotes && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Design Notes</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--white)', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.625rem 0.875rem', lineHeight: 1.5 }}>{selectedRequest.designNotes}</div>
                  </div>
                )}

                {/* Submitted Date */}
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Submitted</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--white)' }}>{formatTimestamp(selectedRequest.createdAt)}</div>
                </div>
              </div>

              {/* Right Column — Status Management */}
              <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status Management</h3>

                {/* Current Status */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>Current Status</div>
                  <StatusBadge status={selectedRequest.status} size="lg" />
                </div>

                {/* Status History */}
                {selectedRequest.statusHistory && selectedRequest.statusHistory.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Status History</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {[...selectedRequest.statusHistory].reverse().map((entry, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gold)', marginTop: '0.375rem', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <StatusBadge status={entry.status} />
                              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{formatTimestamp(entry.timestamp)}</span>
                            </div>
                            {entry.note && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.25rem', fontStyle: 'italic' }}>{entry.note}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

                {/* Update Form */}
                {getNextStatuses(selectedRequest.status).length > 0 ? (
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.75rem' }}>Update Status</div>

                    {/* Status Dropdown */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>New Status</label>
                      <select
                        value={updateStatus}
                        onChange={e => setUpdateStatus(e.target.value)}
                        style={{ width: '100%', padding: '0.625rem 0.875rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                      >
                        <option value="">Select status...</option>
                        {getNextStatuses(selectedRequest.status).map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>

                    {/* Final Price */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>
                        Final Price {updateStatus === 'confirmed' && <span style={{ color: 'var(--red)' }}>*</span>}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', fontSize: '0.875rem' }}>₱</span>
                        <input
                          type="number"
                          value={updatePrice}
                          onChange={e => setUpdatePrice(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 1.75rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    {/* Note */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>Note (optional)</label>
                      <textarea
                        value={updateNote}
                        onChange={e => setUpdateNote(e.target.value)}
                        placeholder="Add a note about this update..."
                        maxLength={500}
                        rows={3}
                        style={{ width: '100%', padding: '0.625rem 0.875rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Messages */}
                    {modalError && (
                      <div style={{ marginBottom: '0.75rem', padding: '0.625rem 0.875rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.85rem' }}>{modalError}</div>
                    )}
                    {modalSuccess && (
                      <div style={{ marginBottom: '0.75rem', padding: '0.625rem 0.875rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: 'var(--green)', fontSize: '0.85rem' }}>{modalSuccess}</div>
                    )}

                    {/* Submit */}
                    <button
                      onClick={handleSubmitUpdate}
                      disabled={submitting}
                      style={{ width: '100%', padding: '0.75rem', background: submitting ? 'var(--gray)' : 'var(--gold)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.875rem', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
                    >
                      {submitting ? 'Updating...' : 'Update Status'}
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--gray)' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5" style={{ marginBottom: '0.75rem' }}>
                      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M15 9l-6 6M9 9l6 6"/>
                    </svg>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>This request is closed.</p>
                    <p style={{ fontSize: '0.8rem' }}>No further status updates can be made.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              <button onClick={closeReview} disabled={submitting} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.625rem 1.25rem', color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
