'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { S, CustomSelect, PaginationBar, SummaryCard, SearchBar, EmptyState } from '../inventory-v2/shared';
import ErrorBoundary from '@/components/ErrorBoundary';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function getPasswordStrength(pwd) {
  if (!pwd) return null;
  const checks = [
    pwd.length >= 8,
    /[A-Z]/.test(pwd),
    /[a-z]/.test(pwd),
    /\d/.test(pwd),
    /[!@#$%^&*(),.?":{}|<>]/.test(pwd),
  ];
  const score = checks.filter(Boolean).length;
  const levels = [
    { label: 'Too Weak',   color: 'var(--red)',    width: '20%' },
    { label: 'Weak',       color: 'var(--red)',    width: '40%' },
    { label: 'Fair',       color: 'var(--gold)',   width: '60%' },
    { label: 'Strong',     color: 'var(--green)',  width: '80%' },
    { label: 'Very Strong',color: 'var(--green)',  width: '100%' },
  ];
  return levels[score - 1] || levels[0];
}

const PASSWORD_CHECKS = (pwd) => [
  { label: 'At least 8 characters', pass: pwd.length >= 8 },
  { label: 'Uppercase letter',       pass: /[A-Z]/.test(pwd) },
  { label: 'Lowercase letter',       pass: /[a-z]/.test(pwd) },
  { label: 'Number',                 pass: /\d/.test(pwd) },
  { label: 'Special character',      pass: /[!@#$%^&*(),.?":{}|<>]/.test(pwd) },
];

const PROTECTED_ROLE_LABELS = {
  admin: 'Administrator',
  owner: 'Owner',
  customer: 'Customer',
};

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
});

const BADGE_PALETTE = [
  { background: 'var(--blue)',   color: 'var(--white)' },
  { background: 'var(--purple)', color: 'var(--white)' },
  { background: 'var(--green)',  color: 'var(--white)' },
  { background: 'var(--orange)', color: 'var(--white)' },
  { background: 'var(--cyan)',   color: 'var(--white)' },
  { background: '#8b5cf6',       color: 'var(--white)' },
  { background: '#ec4899',       color: 'var(--white)' },
];

function getRoleBadgeStyle(role, availableRoles = []) {
  if (role === 'admin' || role === 'owner') return { background: 'var(--gold)', color: 'var(--black)' };
  const idx = availableRoles.findIndex((r) => r.value === role);
  return idx >= 0 ? BADGE_PALETTE[idx % BADGE_PALETTE.length] : { background: 'var(--gray)', color: 'var(--white)' };
}

function emptyForm(firstRole = '') {
  return {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: firstRole,
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
  const [availableRoles, setAvailableRoles] = useState([]);
  const [uPage, setUPage] = useState(1);
  const [uRpp, setURpp] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [form, setForm] = useState(() => emptyForm());

  const [staffSearch, setStaffSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  // Any click outside closes it. Without this a menu left open floats over whatever the reader
  // scrolls to next, and clicking a second card opens a second menu beside the first.
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openMenuId]);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [addRoleLabel, setAddRoleLabel] = useState('');
  const [addRoleError, setAddRoleError] = useState('');
  const [addRoleSubmitting, setAddRoleSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = React.useRef(null);

  const showToast = (message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  React.useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const isPrivilegedRole = (role) => role === 'admin' || role === 'owner';

  useEffect(() => {
    if (!currentUser) return;
    if (!isPrivilegedRole(currentUser.role)) {
      router.replace('/dashboard/business/dashboardoverview');
    }
  }, [currentUser, router]);

  const fetchRoles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/role-permissions`, { headers: HEADERS(token) }, 10000);
      const data = await res.json();
      if (res.ok && data.data) {
        const roles = Object.entries(data.data).map(([value, info]) => ({
          value,
          label: info.label || value,
        }));
        setAvailableRoles(roles);
      }
    } catch { /* silent — form shows empty dropdown if roles fail */ }
  }, [token]);

  const handleAddRole = async () => {
    if (!addRoleLabel.trim()) { setAddRoleError('Role name is required.'); return; }
    setAddRoleSubmitting(true);
    setAddRoleError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/role-permissions`, {
        method: 'POST',
        headers: HEADERS(token),
        body: JSON.stringify({ label: addRoleLabel.trim() }),
      }, 15000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create role.');
      setAddRoleOpen(false);
      setAddRoleLabel('');
      await fetchRoles();
      showToast(`Role "${addRoleLabel.trim()}" created successfully.`);
    } catch (err) {
      setAddRoleError(err.message || 'Failed to create role.');
    } finally {
      setAddRoleSubmitting(false);
    }
  };

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


  useEffect(() => {
    if (!currentUser) return;
    if (!isPrivilegedRole(currentUser.role)) return;
    if (!token) {
      setLoading(false);
      setError('Missing authentication.');
      return;
    }
    fetchStaff();
    fetchRoles();
  }, [token, currentUser, fetchStaff, fetchRoles]);

  const openCreate = () => {
    setSelectedStaff(null);
    setForm(emptyForm(availableRoles[0]?.value || ''));
    setFormError(null);
    setShowPassword(false);
    setModalOpen(true);
  };

  const openEdit = (member) => {
    setSelectedStaff(member);
    setForm({
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: member.email || '',
      password: '',
      role: member.role || availableRoles[0]?.value || '',
      phoneNumber: member.phoneNumber || '',
    });
    setFormError(null);
    setShowPassword(false);
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
    if (!availableRoles.some((r) => r.value === form.role)) {
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
      const wasCreate = selectedStaff == null;
      setModalOpen(false);
      setSelectedStaff(null);
      setForm(emptyForm());
      await fetchStaff();
      showToast(wasCreate ? 'Staff account created successfully.' : 'Staff account updated successfully.');
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
    ...S.input,
    height: '40px',
    padding: '0 12px',
    boxSizing: 'border-box',
  };

  const labelStyle = { ...S.label, display: 'block', marginBottom: '8px' };
  const fieldGap = { marginBottom: '16px' };

  return (
    <ErrorBoundary>
    {/* Was capped at 1200px with its own padding while its neighbours run full width off
        S.page - two screens one click apart, visibly different widths. */}
    <div style={{ ...S.page, padding: '24px' }}>
      <style>{`
        @keyframes usersSkelPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Built to the Customers shape: what the numbers are, then how to narrow them, then the
          list. Two buttons over an empty page told the reader nothing about the people they were
          about to manage - how many there are, how many can be edited, which roles exist at all. */}
      <div style={{ ...S.row, marginBottom: '16px' }}>
        <SummaryCard label="Staff accounts" value={staff.length} accent />
        <SummaryCard label="Protected"
          value={staff.filter(m => isPrivilegedRole(m.role)).length}
          sub="Admin and owner - cannot be edited here" />
        <SummaryCard label="Editable"
          value={staff.filter(m => !isPrivilegedRole(m.role)).length}
          sub="Department staff" />
        <SummaryCard label="Roles defined" value={availableRoles.length}
          color={availableRoles.length === 0 ? '#e05252' : 'var(--gold)'}
          sub={availableRoles.length === 0 ? 'Add one before adding staff' : 'Assignable to staff'} />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchBar
          value={staffSearch}
          onChange={v => { setStaffSearch(v); setUPage(1); }}
          placeholder="Search by name or email..."
          style={{ flex: 1, minWidth: '200px' }}
        />
        <button
          type="button"
          onClick={() => { setAddRoleOpen(true); setAddRoleLabel(''); setAddRoleError(''); }}
          style={{ ...S.btnOutline, whiteSpace: 'nowrap' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Role
        </button>
        <button type="button" onClick={openCreate} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>
          Add Staff
        </button>
      </div>


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
        const q = staffSearch.trim().toLowerCase();
        const shown = !q ? staff : staff.filter(m =>
          `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase().includes(q) ||
          String(m.email || '').toLowerCase().includes(q));
        const pagedStaff = shown.slice((uPage - 1) * uRpp, uPage * uRpp);
        if (shown.length === 0) {
          return <EmptyState message="Nobody matches that search" sub="Clear the box to see everyone again." />;
        }
        return (
        <>
        <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '12px' }}>
          {shown.length} account{shown.length !== 1 ? 's' : ''}{q ? ' (filtered)' : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '12px', alignItems: 'start' }}>
          {pagedStaff.map((member) => {
            const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || '—';
            const role = member.role;
            const badge = getRoleBadgeStyle(role, availableRoles);
            const roleLabel = PROTECTED_ROLE_LABELS[role] ?? availableRoles.find((r) => r.value === role)?.label ?? role;
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
                    {roleLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {locked ? (
                    <span title="Protected account" style={{ display: 'inline-flex', padding: '8px' }}>
                      <LockIcon />
                    </span>
                  ) : (
                    <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="Actions"
                        onClick={() => { const k = String(member._id ?? member.id ?? member.email); setOpenMenuId(openMenuId === k ? null : k); }}
                        style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--gray)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
                        </svg>
                      </button>

                      {openMenuId === String(member._id ?? member.id ?? member.email) && (
                        <div style={{
                          position: 'absolute', top: '36px', right: 0, zIndex: 30,
                          minWidth: '150px', background: 'var(--dark)',
                          border: '1px solid var(--border)', borderRadius: '8px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.28)', overflow: 'hidden',
                        }}>
                          <button
                            type="button"
                            onClick={() => { setOpenMenuId(null); openEdit(member); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                              padding: '9px 12px', background: 'transparent', border: 'none',
                              color: 'var(--white)', fontSize: '0.82rem', fontWeight: 500,
                              cursor: 'pointer', textAlign: 'left',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--dark2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit
                          </button>
                          <div style={{ height: '1px', background: 'var(--border)' }} />
                          <button
                            type="button"
                            onClick={() => { setOpenMenuId(null); setDeleteTarget(member); setDeleteError(null); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                              padding: '9px 12px', background: 'transparent', border: 'none',
                              color: '#e05252', fontSize: '0.82rem', fontWeight: 500,
                              cursor: 'pointer', textAlign: 'left',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Was hidden until the list outgrew one page - so the rows-per-page control, the one
            thing that could have shown more, only appeared once you no longer needed it. */}
        {shown.length > uRpp && (
          <PaginationBar total={shown.length} page={uPage} perPage={uRpp}
            onPage={setUPage} onPerPage={setURpp} />
        )}
        </>
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
            background: 'rgba(0,0,0,0.7)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-modal-title"
            style={{
              width: '100%',
              maxWidth: '480px',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(212,168,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <h2 id="staff-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                  {selectedStaff ? 'Edit Staff' : 'Add Staff'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '4px', borderRadius: '6px', lineHeight: 1 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Row: First + Last name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label htmlFor="staff-first" style={labelStyle}>
                    First Name <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input id="staff-first" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} style={inputBase} autoComplete="given-name" />
                </div>
                <div>
                  <label htmlFor="staff-last" style={labelStyle}>
                    Last Name <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input id="staff-last" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} style={inputBase} autoComplete="family-name" />
                </div>
              </div>

              <div>
                <label htmlFor="staff-email" style={labelStyle}>
                  Email {!selectedStaff && <span style={{ color: 'var(--red)' }}>*</span>}
                  {selectedStaff && <span style={{ color: 'var(--gray)', fontWeight: 400, marginLeft: 4 }}>(cannot be changed)</span>}
                </label>
                <input
                  id="staff-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  disabled={!!selectedStaff}
                  style={{ ...inputBase, opacity: selectedStaff ? 0.5 : 1, cursor: selectedStaff ? 'not-allowed' : 'text' }}
                  autoComplete="email"
                />
              </div>

              {!selectedStaff && (
                <div>
                  <label htmlFor="staff-phone" style={labelStyle}>
                    Phone Number <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input id="staff-phone" value={form.phoneNumber} onChange={(e) => setField('phoneNumber', e.target.value)} style={inputBase} autoComplete="tel" />
                </div>
              )}

              <div>
                <label htmlFor="staff-role" style={labelStyle}>
                  Role <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                {availableRoles.length === 0 ? (
                  <div style={{ ...inputBase, display: 'flex', alignItems: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                    No roles yet — use <strong style={{ color: 'var(--gold)', margin: '0 4px' }}>+ Add Role</strong> to create one first.
                  </div>
                ) : (
                  <CustomSelect
                    value={form.role}
                    onChange={(v) => setField('role', v)}
                    options={availableRoles.map((r) => ({ value: r.value, label: r.label }))}
                    placeholder="Choose a role"
                  />
                )}

              </div>

              <div>
                <label htmlFor="staff-pass" style={labelStyle}>
                  Password{' '}
                  {!selectedStaff
                    ? <span style={{ color: 'var(--red)' }}>*</span>
                    : <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(optional — leave blank to keep current)</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="staff-pass"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setField('password', e.target.value)}
                    placeholder={selectedStaff ? 'Leave blank to keep current' : 'Min. 8 characters'}
                    style={{ ...inputBase, paddingRight: '42px' }}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px', lineHeight: 1 }}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Password strength — only show when typing */}
              {form.password && (() => {
                const strength = getPasswordStrength(form.password);
                const checks = PASSWORD_CHECKS(form.password);
                return (
                  <div style={{ marginTop: '-8px' }}>
                    <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden', marginBottom: '6px' }}>
                      <div style={{ height: '100%', width: strength.width, background: strength.color, transition: 'width 0.3s ease', borderRadius: '2px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.7rem', color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
                      {checks.map((c) => (
                        <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: c.pass ? 'var(--green)' : 'var(--gray)' }}>
                          <span style={{ flexShrink: 0, lineHeight: 1 }}>
                            {c.pass
                              ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                              : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4 }}><circle cx="12" cy="12" r="2"/></svg>}
                          </span>
                          {c.label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {formError && (
                <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)', fontSize: '0.85rem' }}>
                  {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--white)', fontWeight: 600, fontSize: '0.875rem', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--gold)', color: 'var(--black)', fontWeight: 700, fontSize: '0.875rem', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? (selectedStaff ? 'Saving...' : 'Creating...') : selectedStaff ? 'Save Changes' : 'Create Staff'}
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

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 18px', borderRadius: '10px',
          background: toast.type === 'success' ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)',
          color: '#fff', fontWeight: 600, fontSize: '0.875rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          animation: 'fadeInUp 0.2s ease',
        }}>
          {toast.type === 'success'
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
          {toast.message}
        </div>
      )}

      {/* Add Role Modal */}
      {addRoleOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)' }}
        >
          <div role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: '420px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.125rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 30, height: 30, borderRadius: '8px', background: 'rgba(212,168,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--white)' }}>Add New Role</span>
              </div>
              <button type="button" onClick={() => setAddRoleOpen(false)} disabled={addRoleSubmitting} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                Enter a name for the new role (e.g. <em>Graphic Designer</em>, <em>Logistics Staff</em>). Once created, it will appear in the role dropdown when adding staff.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '8px' }}>
                  Role Name <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  autoFocus
                  value={addRoleLabel}
                  onChange={(e) => { setAddRoleLabel(e.target.value); setAddRoleError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddRole(); }}
                  placeholder="e.g. Graphic Designer"
                  style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: `1px solid ${addRoleError ? 'var(--red)' : 'var(--border)'}`, background: 'var(--dark)', color: 'var(--white)', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>
              {addRoleError && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)', fontSize: '0.82rem' }}>
                  {addRoleError}
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setAddRoleOpen(false)} disabled={addRoleSubmitting} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--white)', fontWeight: 600, fontSize: '0.875rem', cursor: addRoleSubmitting ? 'not-allowed' : 'pointer', opacity: addRoleSubmitting ? 0.6 : 1 }}>
                Cancel
              </button>
              <button type="button" onClick={handleAddRole} disabled={addRoleSubmitting || !addRoleLabel.trim()} style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--gold)', color: 'var(--black)', fontWeight: 700, fontSize: '0.875rem', cursor: (addRoleSubmitting || !addRoleLabel.trim()) ? 'not-allowed' : 'pointer', opacity: (addRoleSubmitting || !addRoleLabel.trim()) ? 0.7 : 1 }}>
                {addRoleSubmitting ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
