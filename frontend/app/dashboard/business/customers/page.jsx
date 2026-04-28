'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

function Avatar({ customer, size = 40 }) {
  const initials = `${customer.firstName || ''}${customer.lastName || ''}`.trim();
  const letter = initials.charAt(0).toUpperCase() || customer.email?.charAt(0)?.toUpperCase() || '?';
  if (customer.avatar) {
    return (
      <img
        src={customer.avatar}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--gold)', color: 'var(--black)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4,
    }}>{letter}</div>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const { token, currentUser } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | locked | unlock_requested
  const [unlockActing, setUnlockActing] = useState({});
  const [page, setPage] = useState(1);
  const rpp = 15;

  const isPrivileged = ['admin', 'owner'].includes(currentUser?.role);

  useEffect(() => {
    if (currentUser && !isPrivileged) {
      router.replace('/dashboard/business/dashboardoverview');
    }
  }, [currentUser, isPrivileged, router]);

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/customers`, { headers: HEADERS(token) }, 15000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load customers.');
      setCustomers(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isPrivileged) fetchCustomers();
  }, [isPrivileged, fetchCustomers]);

  const handleUnlock = async (id) => {
    setUnlockActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetchWithTimeout(`${API_URL}/api/admin/customers/${id}/unlock`, {
        method: 'POST', headers: HEADERS(token),
      }, 10000);
      setCustomers(prev => prev.map(c =>
        c.id === id ? { ...c, is_locked: false, failed_login_attempts: 0, unlock_requested_at: null } : c
      ));
    } catch { /* silent */ }
    finally { setUnlockActing(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  const handleChat = (customer) => {
    router.push('/dashboard/business/chat');
  };

  const unlockRequests = customers.filter(c => c.unlock_requested_at);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q);
    const matchFilter =
      filter === 'all' ||
      (filter === 'locked' && c.is_locked) ||
      (filter === 'unlock_requested' && c.unlock_requested_at);
    return matchSearch && matchFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rpp));
  const paged = filtered.slice((page - 1) * rpp, page * rpp);

  if (currentUser && !isPrivileged) return null;

  return (
    <ErrorBoundary>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1rem' }}>

        <div style={{ marginBottom: '24px' }}>
          <h1 className="page-title">Customer Accounts</h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem', margin: '4px 0 0' }}>
            View and manage all registered customer accounts.
          </p>
        </div>

        {/* Unlock Requests Panel */}
        {!loading && unlockRequests.length > 0 && (
          <div style={{
            marginBottom: '24px', border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: '12px', overflow: 'hidden', background: 'rgba(251,191,36,0.04)',
          }}>
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid rgba(251,191,36,0.15)',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gold)' }}>Unlock Requests</span>
              <span style={{ fontSize: '0.72rem', background: '#D4A843', color: '#000', borderRadius: '999px', padding: '1px 8px', fontWeight: 700 }}>
                {unlockRequests.length}
              </span>
            </div>
            {unlockRequests.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', gap: '12px', flexWrap: 'wrap',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <Avatar customer={c} size={36} />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.875rem' }}>
                      {`${c.firstName} ${c.lastName}`.trim() || '—'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{c.email}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '2px' }}>
                      Requested: {c.unlock_requested_at ? new Date(c.unlock_requested_at).toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={!!unlockActing[c.id]}
                    onClick={() => handleUnlock(c.id)}
                    style={{
                      padding: '6px 14px', borderRadius: '8px', border: 'none',
                      background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: '0.8rem',
                      cursor: unlockActing[c.id] ? 'not-allowed' : 'pointer',
                      opacity: unlockActing[c.id] ? 0.6 : 1,
                    }}
                  >
                    {unlockActing[c.id] ? 'Unlocking...' : 'Approve & Unlock'}
                  </button>
                  <button
                    type="button"
                    disabled={!!unlockActing[c.id]}
                    onClick={async () => {
                      setUnlockActing(prev => ({ ...prev, [c.id]: true }));
                      try {
                        await fetchWithTimeout(`${API_URL}/api/admin/unlock-requests/${c.id}/deny`, {
                          method: 'POST', headers: HEADERS(token),
                        }, 10000);
                        setCustomers(prev => prev.map(x =>
                          x.id === c.id ? { ...x, unlock_requested_at: null } : x
                        ));
                      } catch { /* silent */ }
                      finally { setUnlockActing(prev => { const n = { ...prev }; delete n[c.id]; return n; }); }
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: '8px',
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--gray)', fontWeight: 600, fontSize: '0.8rem',
                      cursor: unlockActing[c.id] ? 'not-allowed' : 'pointer',
                      opacity: unlockActing[c.id] ? 0.6 : 1,
                    }}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search + Filter bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{
              flex: 1, minWidth: '200px', height: '40px', padding: '0 12px',
              borderRadius: '8px', border: '1px solid var(--border)',
              background: 'var(--dark)', color: 'var(--white)', fontSize: '0.875rem',
            }}
          />
          <select
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(1); }}
            style={{
              height: '40px', padding: '0 12px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--dark)',
              color: 'var(--white)', fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            <option value="all">All Customers</option>
            <option value="locked">Locked Accounts</option>
            <option value="unlock_requested">Unlock Requested</option>
          </select>
          <button
            type="button"
            onClick={fetchCustomers}
            style={{
              height: '40px', padding: '0 16px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--white)', fontSize: '0.875rem', cursor: 'pointer',
            }}
          >Refresh</button>
        </div>

        {/* Customer count */}
        {!loading && !error && (
          <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '12px' }}>
            {filtered.length} customer{filtered.length !== 1 ? 's' : ''}
            {filter !== 'all' ? ` (filtered)` : ''}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                height: '72px', borderRadius: '12px', background: 'var(--dark2)',
                border: '1px solid var(--border)',
                animation: 'custSkelPulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            padding: '16px', borderRadius: '12px', border: '1px solid var(--red)',
            background: 'rgba(239,68,68,0.08)', color: 'var(--red)', marginBottom: '16px',
          }}>
            {error}
            <button
              type="button"
              onClick={fetchCustomers}
              style={{ marginLeft: '12px', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--white)', cursor: 'pointer', fontSize: '0.8rem' }}
            >Retry</button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--gray)', fontSize: '0.875rem' }}>
            {search || filter !== 'all' ? 'No customers match your search.' : 'No customer accounts yet.'}
          </div>
        )}

        {/* Customer list */}
        {!loading && !error && paged.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {paged.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 18px', borderRadius: '12px',
                background: 'var(--dark2)', border: `1px solid ${c.is_locked ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                flexWrap: 'wrap',
              }}>
                <Avatar customer={c} size={42} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.9rem' }}>
                      {`${c.firstName} ${c.lastName}`.trim() || '—'}
                    </span>
                    {c.is_locked && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '999px', background: 'rgba(239,68,68,0.15)',
                        color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>Locked</span>
                    )}
                    {c.unlock_requested_at && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '999px', background: 'rgba(251,191,36,0.15)',
                        color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>Unlock Requested</span>
                    )}
                    {!c.is_verified && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '999px', background: 'rgba(156,163,175,0.15)',
                        color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>Unverified</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '3px' }}>{c.email}</div>
                  {c.created_at && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '2px', opacity: 0.7 }}>
                      Joined {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleChat(c)}
                    style={{
                      padding: '7px 14px', borderRadius: '8px',
                      border: '1px solid rgba(212,168,67,0.4)', background: 'transparent',
                      color: 'var(--gold)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                    Chat
                  </button>
                  {c.is_locked && (
                    <button
                      type="button"
                      disabled={!!unlockActing[c.id]}
                      onClick={() => handleUnlock(c.id)}
                      style={{
                        padding: '7px 14px', borderRadius: '8px',
                        border: '1px solid rgba(34,197,94,0.4)', background: 'transparent',
                        color: 'var(--green)', fontWeight: 600, fontSize: '0.8rem',
                        cursor: unlockActing[c.id] ? 'not-allowed' : 'pointer',
                        opacity: unlockActing[c.id] ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', gap: '5px',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
                      </svg>
                      {unlockActing[c.id] ? 'Unlocking...' : 'Unlock'}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {filtered.length > rpp && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', border: '1px solid var(--border)', borderRadius: '10px',
                fontSize: '0.8rem', color: 'var(--gray)', flexWrap: 'wrap', gap: '8px',
              }}>
                <span>{filtered.length} total · page {page} of {totalPages}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--dark)', color: page <= 1 ? 'var(--gray)' : 'var(--white)', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                  >‹ Prev</button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--dark)', color: page >= totalPages ? 'var(--gray)' : 'var(--white)', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                  >Next ›</button>
                </div>
              </div>
            )}
          </div>
        )}

        <style>{`
          @keyframes custSkelPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
