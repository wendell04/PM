'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const skeletonStyles = `
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  .skeleton-page { padding: 0; }
  .skeleton-header { margin-bottom: 2rem; }
  .skeleton-title,
  .skeleton-subtitle,
  .skeleton-card,
  .skeleton-table-header,
  .skeleton-cell {
    background: linear-gradient(90deg, var(--dark2) 25%, var(--dark3) 50%, var(--dark2) 75%);
    background-size: 400px 100%;
    animation: shimmer 1.4s ease-in-out infinite;
    border-radius: 6px;
  }
  .skeleton-title  { height: 28px; width: 200px; margin-bottom: 0.5rem; }
  .skeleton-subtitle { height: 16px; width: 320px; }
  .skeleton-cards {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }
  .skeleton-card { height: 90px; flex: 1; min-width: 160px; border-radius: 10px; }
  .skeleton-table { display: flex; flex-direction: column; gap: 0.5rem; }
  .skeleton-table-header { height: 40px; border-radius: 8px; margin-bottom: 0.25rem; }
  .skeleton-row {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 0.5rem 0;
  }
  .skeleton-cell        { height: 16px; border-radius: 4px; }
  .skeleton-cell-short  { width: 80px; }
  .skeleton-cell-mid    { width: 140px; }
  .skeleton-cell-wide   { flex: 1; }
`;

const ROLE_LABELS = {
  admin: 'Admin',
  owner: 'Owner',
  salesRep: 'Sales Rep',
  productionOperator: 'Production',
  qualityControl: 'QC Staff',
  cashier: 'Cashier',
  inventoryManager: 'Inventory',
};

const getInitials = (user) => {
  if (!user) return '?';
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (!name) return user.email?.charAt(0)?.toUpperCase() || '?';
  return name.split(' ').filter(Boolean).map(n => n[0].toUpperCase()).slice(0, 2).join('');
};

const getPasswordStrength = (pwd) => {
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
    { label: 'Too Weak',  color: 'var(--red)',   width: '20%' },
    { label: 'Weak',      color: 'var(--red)',   width: '40%' },
    { label: 'Fair',      color: '#f59e0b',      width: '60%' },
    { label: 'Strong',    color: '#84cc16',      width: '80%' },
    { label: 'Very Strong', color: 'var(--green)', width: '100%' },
  ];
  return levels[score - 1] ?? levels[0];
};

export default function SettingsPage() {
  const { token, currentUser, setCurrentUser } = useAuth();

  // ── Tab ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('personal');

  // ── Loading ───────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);

  // ── Avatar ────────────────────────────────────────────────
  const [showAvatarFallback, setShowAvatarFallback] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar]   = useState(false);
  const [avatarError, setAvatarError]               = useState('');
  const [avatarSuccess, setAvatarSuccess]           = useState(false);

  // ── Personal ──────────────────────────────────────────────
  const [profileForm, setProfileForm] = useState({
    firstName: '', lastName: '', email: '', phoneNumber: '', address: '',
  });
  const [isEditing, setIsEditing]       = useState(false);
  const [snapshot, setSnapshot]         = useState(null);
  const [isSaving, setIsSaving]         = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [saveSuccess, setSaveSuccess]   = useState('');

  // ── Security ──────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false, newPass: false, confirm: false,
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError]       = useState('');
  const [passwordSuccess, setPasswordSuccess]   = useState('');

  // ── Populate form from currentUser ────────────────────────
  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        firstName:   currentUser.firstName   || '',
        lastName:    currentUser.lastName    || '',
        email:       currentUser.email       || '',
        phoneNumber: currentUser.phoneNumber || '',
        address:     currentUser.address     || '',
      });
      setIsLoading(false);
    }
  }, [currentUser]);

  // ── Reset password form when leaving Security tab ─────────
  useEffect(() => {
    if (activeTab !== 'security') {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordError('');
      setPasswordSuccess('');
    }
  }, [activeTab]);

  // ── Avatar upload ─────────────────────────────────────────
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    setAvatarError('');
    setAvatarSuccess(false);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetchWithTimeout(`${API_URL}/api/profile/upload-avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Upload failed.');
      if (setCurrentUser) setCurrentUser(prev => ({ ...prev, avatar: d.data?.avatar }));
      setAvatarSuccess(true);
      setShowAvatarFallback(false);
      setTimeout(() => setAvatarSuccess(false), 3000);
    } catch (err) {
      setAvatarError(err.message || 'Failed to upload avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // ── Save personal profile ─────────────────────────────────
  const handleSaveProfile = async () => {
    setSaveError('');
    setSaveSuccess('');
    setIsSaving(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Failed to save profile.');
      if (setCurrentUser) setCurrentUser(prev => ({ ...prev, ...d.data }));
      setSaveSuccess('Profile updated successfully.');
      setIsEditing(false);
      setSnapshot(null);
    } catch (err) {
      setSaveError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Save password ─────────────────────────────────────────
  const handleSavePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!passwordForm.currentPassword) { setPasswordError('Current password is required.'); return; }
    if (passwordForm.newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setIsSavingPassword(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/password`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          password: passwordForm.newPassword,
          password_confirmation: passwordForm.confirmPassword,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Failed to update password.');
      setPasswordSuccess('Password updated successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // ── Skeleton ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <ErrorBoundary>
        <style dangerouslySetInnerHTML={{ __html: skeletonStyles }} />
        <div className="skeleton-page">
          <div className="skeleton-header">
            <div className="skeleton-title" />
            <div className="skeleton-subtitle" />
          </div>
          <div className="skeleton-cards">
            {[...Array(3)].map((_, i) => (
              <div className="skeleton-card" key={i} />
            ))}
          </div>
          <div className="skeleton-table">
            <div className="skeleton-table-header" />
            {[...Array(4)].map((_, i) => (
              <div className="skeleton-row" key={i}>
                <div className="skeleton-cell skeleton-cell-short" />
                <div className="skeleton-cell skeleton-cell-wide" />
                <div className="skeleton-cell skeleton-cell-mid" />
                <div className="skeleton-cell skeleton-cell-short" />
              </div>
            ))}
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">

        {/* Header */}
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">Settings</h1>
              <p className="page-subtitle">Manage your profile, avatar, and account security.</p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '680px' }}>

          {/* ── Avatar Card ───────────────────────────────── */}
          <div className="profile-modal" style={{
            position: 'static',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            padding: '1.5rem',
            background: 'var(--dark2)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>

              {/* Avatar */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {currentUser?.avatar && !showAvatarFallback ? (
                  <img
                    src={currentUser.avatar}
                    alt="avatar"
                    onError={() => setShowAvatarFallback(true)}
                    style={{
                      width: '72px', height: '72px', borderRadius: '50%',
                      objectFit: 'cover', border: '2px solid var(--gold)',
                    }}
                  />
                ) : (
                  <div style={{
                    width: '72px', height: '72px', borderRadius: '50%',
                    background: 'var(--gold)', color: 'var(--black)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1.5rem', border: '2px solid var(--gold)',
                  }}>
                    {getInitials(currentUser)}
                  </div>
                )}
                <label
                  htmlFor="settings-avatar-upload"
                  style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: 'var(--gold)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: isUploadingAvatar ? 'not-allowed' : 'pointer',
                    border: '2px solid var(--dark2)', zIndex: 2,
                  }}
                >
                  {isUploadingAvatar ? (
                    <span className="spinner" style={{ width: '10px', height: '10px' }} />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="var(--black)" strokeWidth="2.5">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  )}
                </label>
                <input
                  id="settings-avatar-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  disabled={isUploadingAvatar}
                  onChange={handleAvatarUpload}
                />
              </div>

              {/* Identity */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--white)' }}>
                  {currentUser?.firstName && currentUser?.lastName
                    ? `${currentUser.firstName} ${currentUser.lastName}`
                    : currentUser?.email || ''}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                  {currentUser?.email}
                </div>
                <span style={{
                  display: 'inline-block', marginTop: '6px',
                  padding: '2px 10px', borderRadius: '999px',
                  border: '1px solid var(--gold)', color: 'var(--gold)',
                  fontSize: '0.7rem', fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {ROLE_LABELS[currentUser?.role] ?? 'Staff'}
                </span>
              </div>
            </div>

            {/* Avatar feedback */}
            {avatarError && (
              <div style={{
                marginTop: '0.75rem', padding: '0.5rem 0.75rem',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px', color: 'var(--red)', fontSize: '0.8rem',
              }}>{avatarError}</div>
            )}
            {avatarSuccess && (
              <div style={{
                marginTop: '0.75rem', padding: '0.5rem 0.75rem',
                background: 'color-mix(in srgb, var(--green) 15%, transparent)',
                border: '1px solid var(--green)',
                borderRadius: '8px', color: 'var(--green)', fontSize: '0.8rem',
              }}>Avatar updated successfully.</div>
            )}
          </div>

          {/* ── Tabs ──────────────────────────────────────── */}
          <div className="profile-tabs" style={{ marginBottom: '1.5rem' }}>
            <button
              className={`profile-tab ${activeTab === 'personal' ? 'active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Personal
            </button>
            <button
              className={`profile-tab ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Security
            </button>
          </div>

          {/* ── Personal Tab ──────────────────────────────── */}
          {activeTab === 'personal' && (
            <div style={{
              background: 'var(--dark2)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '1.5rem',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', marginBottom: '1.25rem',
              }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                  Personal Information
                </h2>
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => { setSnapshot({ ...profileForm }); setIsEditing(true); setSaveError(''); setSaveSuccess(''); }}
                    style={{
                      padding: '0.5rem 1rem', background: 'transparent',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: 'var(--white)', fontSize: '0.875rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit Profile
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setProfileForm({ ...snapshot }); setIsEditing(false); setSaveError(''); }}
                    style={{
                      padding: '0.5rem 1rem', background: 'transparent',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer',
                    }}
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              {/* Feedback */}
              {saveSuccess && (
                <div style={{
                  marginBottom: '1rem', padding: '0.75rem 1rem',
                  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: '8px', color: 'var(--green)',
                  display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  {saveSuccess}
                </div>
              )}
              {saveError && (
                <div style={{
                  marginBottom: '1rem', padding: '0.75rem 1rem',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '8px', color: 'var(--red)',
                  display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {saveError}
                </div>
              )}

              {/* Read-only view */}
              {!isEditing && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '1rem', marginBottom: '0.5rem',
                }}>
                  {[
                    { label: 'First Name',    value: profileForm.firstName   },
                    { label: 'Last Name',     value: profileForm.lastName    },
                    { label: 'Email',         value: profileForm.email,   full: true },
                    { label: 'Phone',         value: profileForm.phoneNumber },
                    { label: 'Address',       value: profileForm.address     },
                  ].map(({ label, value, full }) => (
                    <div key={label} style={full ? { gridColumn: '1 / -1' } : {}}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginBottom: '0.2rem' }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.925rem', color: 'var(--white)' }}>
                        {value || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Edit form */}
              {isEditing && (
                <>
                  <div className="profile-form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="profile-form-field">
                      <label>First Name <span className="required">*</span></label>
                      <input
                        type="text"
                        value={profileForm.firstName}
                        onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))}
                        placeholder="e.g., Juan"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); } }}
                      />
                    </div>
                    <div className="profile-form-field">
                      <label>Last Name <span className="required">*</span></label>
                      <input
                        type="text"
                        value={profileForm.lastName}
                        onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))}
                        placeholder="e.g., Dela Cruz"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); } }}
                      />
                    </div>
                    <div className="profile-form-field" style={{ gridColumn: '1 / -1' }}>
                      <label>
                        Email Address
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
                          (cannot be changed)
                        </span>
                      </label>
                      <input
                        type="email"
                        value={profileForm.email}
                        disabled
                        readOnly
                        tabIndex={-1}
                        style={{
                          opacity: 0.5, cursor: 'not-allowed',
                          background: 'var(--dark3)', userSelect: 'none',
                        }}
                      />
                    </div>
                    <div className="profile-form-field">
                      <label>Phone <span className="required">*</span></label>
                      <input
                        type="tel"
                        value={profileForm.phoneNumber}
                        onChange={e => setProfileForm(p => ({ ...p, phoneNumber: e.target.value }))}
                        placeholder="e.g., 09123456789"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); } }}
                      />
                    </div>
                    <div className="profile-form-field">
                      <label>Address <span className="required">*</span></label>
                      <input
                        type="text"
                        value={profileForm.address}
                        onChange={e => setProfileForm(p => ({ ...p, address: e.target.value }))}
                        placeholder="e.g., 123 Main Street"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); } }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => { setProfileForm({ ...snapshot }); setIsEditing(false); setSaveError(''); }}
                      style={{
                        padding: '0.625rem 1.25rem', background: 'transparent',
                        border: '1px solid var(--border)', borderRadius: '8px',
                        color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      style={{
                        padding: '0.625rem 1.5rem',
                        background: isSaving ? 'var(--dark3)' : 'var(--gold)',
                        border: 'none', borderRadius: '8px',
                        color: isSaving ? 'var(--gray)' : 'var(--black)',
                        fontSize: '0.875rem', fontWeight: 600,
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                      }}
                    >
                      {isSaving ? (
                        <><span className="spinner" />Saving...</>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                            <polyline points="17 21 17 13 7 13 7 21"/>
                            <polyline points="7 3 7 8 15 8"/>
                          </svg>
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Security Tab ──────────────────────────────── */}
          {activeTab === 'security' && (
            <div style={{
              background: 'var(--dark2)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '1.5rem',
            }}>
              <h2 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                Change Password
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '480px' }}>

                {/* Security notice */}
                <div style={{
                  padding: '1rem',
                  background: 'color-mix(in srgb, var(--gold) 10%, transparent)',
                  borderRadius: '8px',
                  border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                      stroke="var(--gold)" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <strong style={{ color: 'var(--gold)' }}>Password Security</strong>
                  </div>
                  <p style={{ fontSize: '0.85rem', opacity: 0.8, margin: 0 }}>
                    Your password is securely encrypted. Change it regularly to keep your account safe.
                  </p>
                </div>

                {/* Current password */}
                {[
                  { key: 'currentPassword', label: 'Current Password',     showKey: 'current', placeholder: 'Enter current password' },
                  { key: 'newPassword',     label: 'New Password',         showKey: 'newPass', placeholder: 'Enter new password'     },
                  { key: 'confirmPassword', label: 'Confirm New Password', showKey: 'confirm', placeholder: 'Confirm new password'   },
                ].map(({ key, label, showKey, placeholder }) => (
                  <div className="profile-form-field" key={key}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--white)' }}>
                      {label} <span className="required" style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPasswords[showKey] ? 'text' : 'password'}
                        placeholder={placeholder}
                        value={passwordForm[key]}
                        onChange={e => setPasswordForm(p => ({ ...p, [key]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSavePassword(); } }}
                        style={{
                          width: '100%', padding: '0.75rem 0.875rem', paddingRight: '3rem',
                          background: 'var(--dark)', border: '1px solid var(--border)',
                          borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(p => ({ ...p, [showKey]: !p[showKey] }))}
                        style={{
                          position: 'absolute', right: '0.75rem', top: '50%',
                          transform: 'translateY(-50%)', background: 'transparent',
                          border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0.25rem',
                        }}
                      >
                        {showPasswords[showKey] ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Strength meter — only on newPassword */}
                    {key === 'newPassword' && passwordForm.newPassword.length > 0 && (
                      <>
                        <div style={{
                          marginTop: '0.5rem', background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem',
                        }}>
                          {[
                            { label: 'At least 8 characters',  pass: passwordForm.newPassword.length >= 8 },
                            { label: 'One uppercase letter',    pass: /[A-Z]/.test(passwordForm.newPassword) },
                            { label: 'One lowercase letter',    pass: /[a-z]/.test(passwordForm.newPassword) },
                            { label: 'One number',              pass: /\d/.test(passwordForm.newPassword) },
                            { label: 'One special character',   pass: /[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword) },
                          ].map((c, i) => (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                              fontSize: '0.78rem', color: c.pass ? 'var(--green)' : 'var(--gray)',
                              transition: 'color 0.2s', marginBottom: i < 4 ? '0.4rem' : 0,
                            }}>
                              <span style={{ display: 'inline-flex', width: '14px', justifyContent: 'center', flexShrink: 0 }} aria-hidden>
                                {c.pass ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                ) : (
                                  <span style={{ opacity: 0.45 }} aria-hidden="true">|</span>
                                )}
                              </span>
                              {c.label}
                            </div>
                          ))}
                        </div>
                        {(() => {
                          const strength = getPasswordStrength(passwordForm.newPassword);
                          if (!strength) return null;
                          return (
                            <div style={{ marginTop: '6px' }}>
                              <div style={{
                                height: '4px', borderRadius: '2px',
                                background: 'var(--border)', overflow: 'hidden',
                              }}>
                                <div style={{
                                  height: '100%', width: strength.width,
                                  background: strength.color,
                                  transition: 'width 0.3s ease', borderRadius: '2px',
                                }} />
                              </div>
                              <span style={{
                                fontSize: '0.7rem', color: strength.color,
                                marginTop: '4px', display: 'block',
                              }}>{strength.label}</span>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                ))}

                {/* Feedback */}
                {passwordError && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px', color: 'var(--red)',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: '8px', color: 'var(--green)',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    {passwordSuccess}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSavePassword}
                  disabled={isSavingPassword}
                  style={{
                    padding: '0.875rem 1.5rem',
                    background: isSavingPassword ? 'var(--gray)' : 'var(--gold)',
                    border: 'none', borderRadius: '8px',
                    color: isSavingPassword ? 'var(--dark)' : 'var(--black)',
                    fontWeight: 600, fontSize: '0.9rem',
                    cursor: isSavingPassword ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    width: 'fit-content',
                  }}
                >
                  {isSavingPassword ? (
                    <><span className="spinner" />Updating...</>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      Update Password
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </ErrorBoundary>
  );
}
