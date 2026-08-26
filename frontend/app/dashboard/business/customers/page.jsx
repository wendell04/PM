'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import ErrorBoundary from '@/components/ErrorBoundary';
// The same components every other module is built from, so Customers stops being the one screen with
// its own hand-rolled cards, search box and pager.
import { S, ICONS, SummaryCard, SearchBar, PaginationBar, EmptyState, CustomSelect } from '../inventory-v2/shared';

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
  // Which customer's consent record is open. Read-only - evidence is not something to edit.
  const [termsProof, setTermsProof] = useState(null);
  useLockBodyScroll(!!termsProof);
  // Adjustable now that the shared pager offers the choice, instead of a constant the reader
  // cannot change when a long list needs scanning.
  const [rpp, setRpp] = useState(15);

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
    // The two new options answer questions the owner actually has: who still has not verified, and
    // whose consent was never captured. Both were only findable by eye before.
    const matchFilter =
      filter === 'all' ||
      (filter === 'locked' && c.is_locked) ||
      (filter === 'unlock_requested' && c.unlock_requested_at) ||
      (filter === 'unverified' && !c.is_verified) ||
      (filter === 'no_terms' && !c.acceptedTermsAt) ||
      // A year is the point where a customer has plainly stopped coming back. Two years is the
      // deletion threshold; this is the one that is actionable while they can still be won back.
      (filter === 'dormant' && (!c.last_login_at ||
        (Date.now() - new Date(c.last_login_at).getTime()) / 86400000 >= 365));
    return matchSearch && matchFilter;
  });

  const paged = filtered.slice((page - 1) * rpp, page * rpp);

  if (currentUser && !isPrivileged) return null;

  return (
    <ErrorBoundary>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Summary stats - the same SummaryCard every other module uses. `S` also names the
            shadowing hazard this block had: the map parameter was `s`, which is the shared style
            object's name everywhere else in the codebase. */}
        {!loading && !error && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <SummaryCard label="Total Customers" value={customers.length} accent />
            <SummaryCard label="Locked" value={customers.filter(c => c.is_locked).length}
              color={customers.some(c => c.is_locked) ? 'var(--st-red-fg)' : undefined} />
            <SummaryCard label="Unlock Requests" value={unlockRequests.length}
              color={unlockRequests.length > 0 ? 'var(--gold)' : undefined} />
            <SummaryCard label="Unverified" value={customers.filter(c => !c.is_verified).length} />
          </div>
        )}

        {/* Unlock Requests — always visible section */}
        {!loading && (
          <div style={{
            marginBottom: '24px',
            border: unlockRequests.length > 0
              ? '1px solid rgba(251,191,36,0.4)'
              : '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden',
            background: unlockRequests.length > 0
              ? 'rgba(251,191,36,0.05)'
              : 'rgba(255,255,255,0.02)',
          }}>
            {/* Header */}
            <div style={{
              padding: '12px 20px',
              borderBottom: unlockRequests.length > 0 ? '1px solid rgba(251,191,36,0.15)' : 'none',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke={unlockRequests.length > 0 ? '#D4A843' : 'var(--gray)'} strokeWidth="2">
                <rect x="5" y="11" width="14" height="10" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <span style={{
                fontWeight: 700, fontSize: '0.88rem',
                color: unlockRequests.length > 0 ? 'var(--gold)' : 'var(--gray)',
              }}>
                Account Unlock Requests
              </span>
              {unlockRequests.length > 0 ? (
                <span style={{
                  fontSize: '0.7rem', background: '#D4A843', color: '#000',
                  borderRadius: '999px', padding: '1px 8px', fontWeight: 700,
                }}>
                  {unlockRequests.length}
                </span>
              ) : (
                <span style={{
                  fontSize: '0.7rem', color: 'var(--green)', fontWeight: 600,
                  background: 'rgba(34,197,94,0.1)', borderRadius: '999px',
                  padding: '1px 10px',
                }}>
                  All clear
                </span>
              )}
            </div>

            {/* Empty state */}
            {unlockRequests.length === 0 && (
              <div style={{
                padding: '14px 20px',
                display: 'flex', alignItems: 'center', gap: '10px',
                color: 'var(--gray)', fontSize: '0.82rem',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                No pending unlock requests. Customers who get locked out can submit a request here.
              </div>
            )}

            {/* Request rows */}
            {unlockRequests.map((c, idx) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', gap: '12px', flexWrap: 'wrap',
                borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(251,191,36,0.03)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <Avatar customer={c} size={38} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.88rem' }}>
                        {`${c.firstName} ${c.lastName}`.trim() || '—'}
                      </span>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '999px', background: 'rgba(251,191,36,0.15)',
                        color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>Unlock Requested</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '2px' }}>{c.email}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '2px', opacity: 0.8 }}>
                      Requested: {c.unlock_requested_at ? new Date(c.unlock_requested_at).toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    type="button"
                    disabled={!!unlockActing[c.id]}
                    onClick={() => handleUnlock(c.id)}
                    style={{
                      padding: '7px 16px', borderRadius: '8px', border: 'none',
                      background: '#16a34a', color: 'var(--dark)', fontWeight: 600, fontSize: '0.8rem',
                      cursor: unlockActing[c.id] ? 'not-allowed' : 'pointer',
                      opacity: unlockActing[c.id] ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
                    </svg>
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
                      padding: '7px 14px', borderRadius: '8px',
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
          <SearchBar
            value={search}
            onChange={v => { setSearch(v); setPage(1); }}
            placeholder="Search by name or email..."
            style={{ flex: 1, minWidth: '200px' }}
          />
          {/* The native select was the last one on this screen - it renders with the OS chrome and
              ignores the theme, which is exactly why every other module uses CustomSelect. */}
          <div style={{ minWidth: '190px' }}>
            <CustomSelect
              value={filter}
              onChange={v => { setFilter(v); setPage(1); }}
              options={[
                { value: 'all',               label: 'All customers' },
                { value: 'locked',            label: 'Locked accounts' },
                { value: 'unlock_requested',  label: 'Unlock requested' },
                { value: 'unverified',        label: 'Unverified' },
                { value: 'no_terms',          label: 'No terms record' },
                { value: 'dormant',           label: 'Quiet over a year' },
              ]}
            />
          </div>
          <button type="button" onClick={fetchCustomers} style={{ ...S.btnSmGhost, height: '40px' }}>
            Refresh
          </button>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '12px' }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '12px', alignItems: 'start' }}>
            {paged.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 18px', borderRadius: '12px',
                background: 'var(--dark2)', border: `1px solid ${c.is_locked ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                flexWrap: 'wrap',
              }}>
                <Avatar customer={c} size={42} />

                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                    {/* A name is user input, and the field caps are generous. Without a hard limit
                        here one long name pushed its card out over the neighbouring column and off
                        the page. Truncated with the full value on hover. */}
                    <span
                      title={`${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()}
                      style={{
                        fontWeight: 700, color: 'var(--white)', fontSize: '0.9rem',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: '100%', display: 'block',
                      }}
                    >
                      {`${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '-'}
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
                  <div title={c.email} style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                  {/* "Joined" answers when they arrived. Only "last seen" answers whether they are
                      still here - which is the question behind churn, win-back, and any future
                      inactivity policy, since that clock resets every time someone logs in. */}
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '2px', opacity: 0.75, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {c.created_at && <span>Joined {new Date(c.created_at).toLocaleDateString()}</span>}
                    {(() => {
                      if (!c.last_login_at) return <span>Never signed in</span>;
                      const days = Math.floor((Date.now() - new Date(c.last_login_at).getTime()) / 86400000);
                      const label = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
                      return (
                        <span style={{ color: days >= 365 ? '#c2410c' : days >= 90 ? '#b45309' : 'var(--gray)' }}>
                          Last seen {label}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Clickwrap evidence. A ticked box proves nothing once the terms have been
                      edited, so what is shown here is the copy taken at the moment they agreed. */}
                  <div style={{ fontSize: '0.7rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {c.acceptedTermsAt ? (
                      <>
                        {/* Three states, not two. An account that agreed before the wording was ever
                            captured is not the same as one with a full record, and flattening them
                            would quietly overstate what the shop can actually produce. */}
                        <span style={{ color: c.acceptedTermsLegacy ? 'var(--gold)' : 'var(--st-green-fg)' }}>
                          {c.acceptedTermsLegacy
                            ? `Agreed at registration ${new Date(c.acceptedTermsAt).toLocaleDateString()} - wording not recorded`
                            : `Terms v${c.acceptedTermsVersion ?? 1} accepted ${new Date(c.acceptedTermsAt).toLocaleDateString()}`}
                        </span>
                        {Array.isArray(c.acceptedTermsSnapshot) && c.acceptedTermsSnapshot.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setTermsProof(c)}
                            style={{ padding: '1px 7px', borderRadius: '999px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gold)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            View what they agreed to
                          </button>
                        )}
                      </>
                    ) : (
                      /* Accounts created before consent was recorded. Saying "none recorded" is the
                         honest answer; showing nothing would let it pass for agreement. */
                      <span style={{ color: 'var(--gray)' }}>No terms record on this account</span>
                    )}
                  </div>

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
              <div style={{ marginTop: '4px' }}>
                <PaginationBar
                  total={filtered.length}
                  page={page}
                  perPage={rpp}
                  onPage={setPage}
                  onPerPage={n => { setRpp(n); setPage(1); }}
                />
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

      {/* The record itself. Deliberately read-only and deliberately verbatim: the value of this
          screen is that it shows the wording as it stood that day, not as it reads now. */}
      {termsProof && (
        <div
          onClick={() => setTermsProof(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '14px', width: '100%', maxWidth: '620px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)' }}>
                Terms accepted by {`${termsProof.firstName ?? ''} ${termsProof.lastName ?? ''}`.trim() || termsProof.email}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '4px' }}>
                Version {termsProof.acceptedTermsVersion ?? 1}
                {termsProof.acceptedTermsAt && ` on ${new Date(termsProof.acceptedTermsAt).toLocaleString()}`}
                {termsProof.acceptedTermsIp && ` from ${termsProof.acceptedTermsIp}`}
              </div>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: '0 0 14px', lineHeight: 1.6 }}>
                This is the wording that was on screen when this account was created. Later edits to the
                registration terms do not change it.
              </p>
              {(termsProof.acceptedTermsSnapshot ?? []).map((t, i) => (
                <div key={i} style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)', marginBottom: '4px' }}>
                    {i + 1}. {t.title}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-light)', lineHeight: 1.65 }}>{t.body}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setTermsProof(null)}
                style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>


  );
}
