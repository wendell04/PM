'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const STAFF_ROLES = [
  { value: 'salesRep', label: 'Sales Representative' },
  { value: 'productionOperator', label: 'Production Operator' },
  { value: 'qualityControl', label: 'Quality Control Officer' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'inventoryManager', label: 'Inventory Manager' },
];

const ROLE_LABELS = {
  admin: 'Administrator',
  owner: 'Owner',
  salesRep: 'Sales Representative',
  productionOperator: 'Production Operator',
  qualityControl: 'Quality Control Officer',
  cashier: 'Cashier',
  inventoryManager: 'Inventory Manager',
  customer: 'Customer',
};

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
});

function getRoleBadgeStyle(role) {
  switch (role) {
    case 'admin':
    case 'owner':
      return { background: 'var(--gold)', color: 'var(--black)' };
    case 'salesRep':
      return { background: 'var(--blue)', color: 'var(--white)' };
    case 'productionOperator':
      return { background: 'var(--purple)', color: 'var(--white)' };
    case 'qualityControl':
      return { background: 'var(--green)', color: 'var(--white)' };
    case 'cashier':
      return { background: 'var(--orange)', color: 'var(--white)' };
    case 'inventoryManager':
      return { background: 'var(--cyan)', color: 'var(--white)' };
    default:
      return { background: 'var(--gray)', color: 'var(--black)' };
  }
}

function emptyForm() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'salesRep',
    phoneNumber: '',
  };
}

function SkeletonRow() {
  return (
    <div
      style={{
        padding: '1rem 1.25rem',
        background: 'var(--dark2)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        animation: 'usersSkelPulse 1.5s ease-in-out infinite',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ height: '16px', background: 'var(--dark3)', borderRadius: '4px', width: '40%', marginBottom: '8px' }} />
          <div style={{ height: '12px', background: 'var(--dark3)', borderRadius: '4px', width: '60%', marginBottom: '8px' }} />
          <div style={{ height: '20px', background: 'var(--dark3)', borderRadius: '999px', width: '120px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ width: '72px', height: '32px', background: 'var(--dark3)', borderRadius: '8px' }} />
          <div style={{ width: '72px', height: '32px', background: 'var(--dark3)', borderRadius: '8px' }} />
        </div>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export default function UserManagementPage() {
  const router = useRouter();
  const { token, currentUser } = useAuth();

  const [staff, setStaff] = useState([]);
  const [uPage, setUPage] = useState(1);
  const [uRpp, setURpp] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [unlockRequests, setUnlockRequests] = useState([]);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockActing, setUnlockActing] = useState({});

  const isPrivilegedRole = (role) => role === 'admin' || role === 'owner';

  useEffect(() => {
    if (!currentUser) return;
    if (!isPrivilegedRole(currentUser.role)) {
      router.replace('/dashboard/business/dashboardoverview');
    }
  }, [currentUser, router]);

  const fetchStaff = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/staff`, {
        headers: HEADERS(token),
      }, 15000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load staff.');
      setStaff(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load staff.');
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchUnlockRequests = useCallback(async () => {
    if (!token) return;
    setUnlockLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/unlock-requests`, { headers: HEADERS(token) }, 15000);
      const data = await res.json();
      setUnlockRequests(res.ok ? (data.data || []) : []);
    } catch { setUnlockRequests([]); }
    finally { setUnlockLoading(false); }
  }, [token]);

  const handleUnlockAction = async (id, action) => {
    setUnlockActing(prev => ({ ...prev, [id]: action }));
    try {
      await fetchWithTimeout(`${API_URL}/api/admin/unlock-requests/${id}/${action}`, {
        method: 'POST', headers: HEADERS(token),
      }, 10000);
      await fetchUnlockRequests();
    } catch { /* silent */ }
    finally { setUnlockActing(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  useEffect(() => {
    if (!currentUser) return;
    if (!isPrivilegedRole(currentUser.role)) return;
    if (!token) {
      setLoading(false);
      setError('Missing authentication.');
      return;
    }
    fetchStaff();
    fetchUnlockRequests();
  }, [token, currentUser, fetchStaff, fetchUnlockRequests]);

  const openCreate = () => {
    setSelectedStaff(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (member) => {
    setSelectedStaff(member);
    setForm({
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: member.email || '',
      password: '',
      role: member.role || 'salesRep',
      phoneNumber: member.phoneNumber || '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setSelectedStaff(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const validate = (isCreate) => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return 'First name and last name are required.';
    }
    if (isCreate) {
      if (!form.email.trim()) return 'Email is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        return 'Please enter a valid email address.';
      }
      if (!form.password || form.password.length < 8) {
        return 'Password must be at least 8 characters.';
      }
    }
    if (!STAFF_ROLES.some((r) => r.value === form.role)) {
      return 'Please select a valid role.';
    }
    if (!isCreate && form.password && form.password.length > 0 && form.password.length < 8) {
      return 'Password must be at least 8 characters.';
    }
    return null;
  };

  const handleSubmit = async () => {
    const isCreate = selectedStaff == null;
    const msg = validate(isCreate);
    if (msg) {
      setFormError(msg);
      return;
    }
    if (!token) {
      setFormError('Not authenticated.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (isCreate) {
        const body = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          phoneNumber: form.phoneNumber.trim(),
        };
        const res = await fetchWithTimeout(`${API_URL}/api/admin/staff`, {
          method: 'POST',
          headers: HEADERS(token),
          body: JSON.stringify(body),
        }, 15000);
        const data = await res.json();
        if (!res.ok) {
          const m = data.message || (data.errors && Object.values(data.errors).flat().join(' ')) || 'Create failed.';
          throw new Error(m);
        }
      } else {
        const id = selectedStaff._id ?? selectedStaff.id;
        const payload = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          role: form.role,
        };
        if (form.password && form.password.length >= 8) {
          payload.password = form.password;
        }
        const res = await fetchWithTimeout(`${API_URL}/api/admin/staff/${encodeURIComponent(String(id))}`, {
          method: 'PUT',
          headers: HEADERS(token),
          body: JSON.stringify(payload),
        }, 15000);
        const data = await res.json();
        if (!res.ok) {
          const m = data.message || (data.errors && Object.values(data.errors).flat().join(' ')) || 'Update failed.';
          throw new Error(m);
        }
      }
      setModalOpen(false);
      setSelectedStaff(null);
      setForm(emptyForm());
      await fetchStaff();
    } catch (err) {
      setFormError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !token) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const id = deleteTarget._id ?? deleteTarget.id;
      const res = await fetchWithTimeout(`${API_URL}/api/admin/staff/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        headers: HEADERS(token),
      }, 15000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete account.');
      }
      setDeleteTarget(null);
      await fetchStaff();
    } catch (err) {
      setDeleteError(err.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  if (currentUser && !isPrivilegedRole(currentUser.role)) {
    return null;
  }

  const inputBase = {
    width: '100%',
    height: '40px',
    padding: '0 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--dark)',
    color: 'var(--white)',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
  };

  const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '8px' };
  const fieldGap = { marginBottom: '16px' };

  return (
    <ErrorBoundary>
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>
      <style>{`
        @keyframes usersSkelPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <h1 className="page-title">Users</h1>
        <button
          type="button"
          onClick={openCreate}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--gold)',
            color: 'var(--black)',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Add Staff
        </button>
      </div>

      {/* Unlock Requests Panel */}
      {(unlockRequests.length > 0 || unlockLoading) && (
        <div style={{ marginBottom: '24px', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '12px', overflow: 'hidden', background: 'rgba(251,191,36,0.04)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gold)' }}>Unlock Requests</span>
            <span style={{ fontSize: '0.75rem', background: '#D4A843', color: '#000', borderRadius: '999px', padding: '1px 8px', fontWeight: 700 }}>{unlockRequests.length}</span>
          </div>
          {unlockLoading ? (
            <div style={{ padding: '16px 20px', color: 'var(--gray)', fontSize: '0.85rem' }}>Loading...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {unlockRequests.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.88rem' }}>{u.name || '—'}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--gray)', marginTop: '2px' }}>{u.email}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '2px' }}>
                      Requested: {u.unlock_requested_at ? new Date(u.unlock_requested_at).toLocaleString() : '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      disabled={!!unlockActing[u.id]}
                      onClick={() => handleUnlockAction(u.id, 'approve')}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: unlockActing[u.id] ? 'not-allowed' : 'pointer', opacity: unlockActing[u.id] ? 0.6 : 1 }}
                    >
                      {unlockActing[u.id] === 'approve' ? 'Unlocking...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={!!unlockActing[u.id]}
                      onClick={() => handleUnlockAction(u.id, 'deny')}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', fontWeight: 600, fontSize: '0.8rem', cursor: unlockActing[u.id] ? 'not-allowed' : 'pointer', opacity: unlockActing[u.id] ? 0.6 : 1 }}
                    >
                      {unlockActing[u.id] === 'deny' ? 'Denying...' : 'Deny'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--red)',
            background: 'rgba(239, 68, 68, 0.08)',
            color: 'var(--red)',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'flex-start',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchStaff()}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--dark2)',
              color: 'var(--white)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && staff.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--gray)', padding: '48px 16px', margin: 0 }}>
          No staff accounts yet.
        </p>
      )}

      {!loading && !error && staff.length > 0 && (() => {
        const uTotalPages = Math.max(1, Math.ceil(staff.length / uRpp));
        const pagedStaff = staff.slice((uPage - 1) * uRpp, uPage * uRpp);
        return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pagedStaff.map((member) => {
            const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || '—';
            const role = member.role;
            const badge = getRoleBadgeStyle(role);
            const locked = isPrivilegedRole(role);

            return (
              <div
                key={String(member._id ?? member.id ?? member.email)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem 1.25rem',
                  background: 'var(--dark2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--white)', marginBottom: '4px' }}>{fullName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '8px', wordBreak: 'break-all' }}>
                    {member.email || '—'}
                  </div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      ...badge,
                    }}
                  >
                    {ROLE_LABELS[role] || role}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {locked ? (
                    <span title="Protected account" style={{ display: 'inline-flex', padding: '8px' }}>
                      <LockIcon />
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(member)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: '1px solid var(--gold)',
                          background: 'transparent',
                          color: 'var(--gold)',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(member);
                          setDeleteError(null);
                        }}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: '1px solid var(--red)',
                          background: 'transparent',
                          color: 'var(--red)',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {staff.length > uRpp && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1rem', border: '1px solid var(--border)', borderRadius: '10px', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--gray)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Rows per page:
                <select value={uRpp} onChange={e => { setURpp(Number(e.target.value)); setUPage(1); }} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--white)', padding: '0.2rem 0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <button onClick={() => setUPage(p => Math.max(1, p - 1))} disabled={uPage <= 1} style={{ padding: '0.25rem 0.625rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: uPage <= 1 ? 'var(--gray)' : 'var(--white)', cursor: uPage <= 1 ? 'not-allowed' : 'pointer' }}>‹</button>
                <button onClick={() => setUPage(p => Math.min(uTotalPages, p + 1))} disabled={uPage >= uTotalPages} style={{ padding: '0.25rem 0.625rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: uPage >= uTotalPages ? 'var(--gray)' : 'var(--white)', cursor: uPage >= uTotalPages ? 'not-allowed' : 'pointer' }}>›</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Page: <span style={{ padding: '0.2rem 0.6rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--white)', minWidth: '28px', textAlign: 'center' }}>{uPage}</span> of {uTotalPages}
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.65)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-modal-title"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '1.5rem',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h2 id="staff-modal-title" style={{ margin: '0 0 16px', fontSize: '1.125rem', color: 'var(--white)' }}>
              {selectedStaff ? 'Edit Staff' : 'Add Staff'}
            </h2>

            <div style={fieldGap}>
              <label htmlFor="staff-first" style={labelStyle}>First Name</label>
              <input
                id="staff-first"
                value={form.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
                style={inputBase}
                autoComplete="given-name"
              />
            </div>
            <div style={fieldGap}>
              <label htmlFor="staff-last" style={labelStyle}>Last Name</label>
              <input
                id="staff-last"
                value={form.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
                style={inputBase}
                autoComplete="family-name"
              />
            </div>
            <div style={fieldGap}>
              <label htmlFor="staff-email" style={labelStyle}>Email</label>
              <input
                id="staff-email"
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                disabled={!!selectedStaff}
                style={{ ...inputBase, opacity: selectedStaff ? 0.7 : 1 }}
                autoComplete="email"
              />
            </div>
            {!selectedStaff && (
              <div style={fieldGap}>
                <label htmlFor="staff-phone" style={labelStyle}>Phone Number (optional)</label>
                <input
                  id="staff-phone"
                  value={form.phoneNumber}
                  onChange={(e) => setField('phoneNumber', e.target.value)}
                  style={inputBase}
                  autoComplete="tel"
                />
              </div>
            )}
            <div style={fieldGap}>
              <label htmlFor="staff-role" style={labelStyle}>Role</label>
              <select
                id="staff-role"
                value={form.role}
                onChange={(e) => setField('role', e.target.value)}
                style={{ ...inputBase, cursor: 'pointer' }}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ ...fieldGap, marginBottom: '8px' }}>
              <label htmlFor="staff-pass" style={labelStyle}>
                Password {selectedStaff ? '(optional)' : ''}
              </label>
              <input
                id="staff-pass"
                type="password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                placeholder={selectedStaff ? 'Leave blank to keep current' : ''}
                style={inputBase}
                autoComplete={selectedStaff ? 'new-password' : 'new-password'}
              />
            </div>

            {formError && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--red)',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--white)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--gold)',
                  color: 'var(--black)',
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? (selectedStaff ? 'Saving...' : 'Creating...') : selectedStaff ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.7)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '1.5rem',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
            }}
          >
            <h3 style={{ margin: '0 0 12px', color: 'var(--white)', fontSize: '1.1rem' }}>Delete Staff Account?</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--gray)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              This will permanently remove{' '}
              <strong style={{ color: 'var(--white)' }}>
                {`${deleteTarget.firstName || ''} ${deleteTarget.lastName || ''}`.trim() || 'this user'}
              </strong>
              {' '}from staff. This action cannot be undone.
            </p>
            {deleteError && (
              <div
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--red)',
                  fontSize: '0.85rem',
                }}
              >
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--white)',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--red)',
                  color: 'var(--white)',
                  fontWeight: 700,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.75 : 1,
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
