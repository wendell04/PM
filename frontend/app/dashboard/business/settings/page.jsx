'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';

const StoreLocationMap = dynamic(() => import('@/components/maps/StoreLocationMap'), { ssr: false });

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
    { label: 'Fair',      color: 'var(--orange)', width: '60%' },
    { label: 'Strong',    color: 'var(--green)', width: '80%' },
    { label: 'Very Strong', color: 'var(--green)', width: '100%' },
  ];
  return levels[score - 1] ?? levels[0];
};

export default function SettingsPage() {
  const { token, currentUser, setCurrentUser } = useAuth();

  const deviceTokens = useMemo(
    () => (Array.isArray(currentUser?.device_tokens) ? currentUser.device_tokens : []),
    [currentUser?.device_tokens],
  );

  // ── Tab ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('profile');

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

  const [businessForm, setBusinessForm] = useState({
    businessName: '',
    businessAddress: '',
    operatingHours: '',
    contactEmail: '',
  });

  const [notifPrefs, setNotifPrefs] = useState({
    newOrders: true,
    lowStock: true,
    paymentReceived: true,
    orderStatus: true,
  });

  // ── Active Sessions (Sanctum tokens) ──────────────────────
  const [sessions, setSessions]         = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError]     = useState('');
  const [sessionsSuccess, setSessionsSuccess] = useState('');
  const [sessionsOpen, setSessionsOpen]       = useState(false);
  const [revokingId, setRevokingId]     = useState(null);
  const [revokeAllBusy, setRevokeAllBusy] = useState(false);

  // ── Shipping ──────────────────────────────────────────────
  const [shippingForm, setShippingForm] = useState({
    storeAddress: '', storeLat: null, storeLng: null,
    shippingBaseRate: '50', shippingPerKmRate: '15',
  });
  const [isSavingShipping, setIsSavingShipping]   = useState(false);
  const [shippingError, setShippingError]         = useState('');
  const [shippingSuccess, setShippingSuccess]     = useState('');

  // ── 2FA toggle ────────────────────────────────────────────
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFaToggling, setTwoFaToggling]       = useState(false);
  const [twoFaError, setTwoFaError]             = useState('');
  const [twoFaSuccess, setTwoFaSuccess]         = useState('');

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
      setBusinessForm({
        businessName: currentUser.businessName || '',
        businessAddress: currentUser.address || '',
        operatingHours: '',
        contactEmail: currentUser.email || '',
      });
      setTwoFactorEnabled(!!currentUser.two_factor_enabled);
      setIsLoading(false);
    }
  }, [currentUser]);

  // ── Load shipping settings ────────────────────────────────
  useEffect(() => {
    if (!token || activeTab !== 'shipping') return;
    fetchWithTimeout(`${API_URL}/api/settings`, { headers: { Authorization: `Bearer ${token}` } }, 10000)
      .then(r => r.json())
      .then(d => {
        if (d?.data) {
          setShippingForm({
            storeAddress:      d.data.storeAddress      || '',
            storeLat:          d.data.storeLat          ?? null,
            storeLng:          d.data.storeLng          ?? null,
            shippingBaseRate:  d.data.shippingBaseRate  != null ? String(d.data.shippingBaseRate)  : '50',
            shippingPerKmRate: d.data.shippingPerKmRate != null ? String(d.data.shippingPerKmRate) : '15',
          });
        }
      })
      .catch(() => {});
  }, [token, activeTab]);

  // ── Reset password form when leaving Security tab ─────────
  useEffect(() => {
    if (activeTab !== 'security') {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordError('');
      setPasswordSuccess('');
    }
  }, [activeTab]);

  // ── Active Sessions + device revoke handlers ──────────────
  const fetchSessions = useCallback(async () => {
    if (!token) return;
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/sessions`,
        { headers: { Authorization: `Bearer ${token}` } },
        10000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load sessions.');
      setSessions(data.sessions ?? []);
    } catch (err) {
      setSessionsError(err.message);
    } finally {
      setSessionsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'security') fetchSessions();
  }, [activeTab, fetchSessions]);

  const revokeSession = useCallback(async (id) => {
    setRevokingId(id);
    setSessionsError('');
    setSessionsSuccess('');
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/sessions/${id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        10000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to revoke session.');
      setSessions(prev => prev.filter(s => s.id !== id));
      setSessionsSuccess('Session revoked successfully.');
    } catch (err) {
      setSessionsError(err.message);
    } finally {
      setRevokingId(null);
    }
  }, [token]);

  const revokeAllSessions = useCallback(async () => {
    setRevokeAllBusy(true);
    setSessionsError('');
    setSessionsSuccess('');
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/sessions/others/all`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        10000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to revoke sessions.');
      await fetchSessions();
      setSessionsSuccess('All other sessions revoked.');
    } catch (err) {
      setSessionsError(err.message);
    } finally {
      setRevokeAllBusy(false);
    }
  }, [token, fetchSessions]);

  const revokeDevice = useCallback(async (deviceToken) => {
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/2fa/device/${encodeURIComponent(deviceToken)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        10000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to remove device.');
      // Update local UI by filtering out the revoked token from currentUser.device_tokens
      if (typeof setCurrentUser === 'function' && currentUser) {
        const remaining = (currentUser.device_tokens ?? []).filter((entry) => {
          const t = typeof entry === 'string' ? entry : entry?.token;
          return t !== deviceToken;
        });
        setCurrentUser(prev => ({ ...prev, device_tokens: remaining }));
      }
    } catch (err) {
      setSessionsError(err.message);
    }
  }, [token, currentUser, setCurrentUser]);

  // ── 2FA toggle ────────────────────────────────────────────
  const handleToggle2FA = async () => {
    if (twoFaToggling) return;
    setTwoFaToggling(true);
    setTwoFaError('');
    setTwoFaSuccess('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/2fa/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      }, 10000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update 2FA setting.');
      const next = !!data.two_factor_enabled;
      setTwoFactorEnabled(next);
      setTwoFaSuccess(data.message || (next ? 'Two-factor authentication enabled.' : 'Two-factor authentication disabled.'));
      setTimeout(() => setTwoFaSuccess(''), 3000);
      // Persist into stored user so it survives a page refresh
      if (typeof setCurrentUser === 'function') {
        setCurrentUser(prev => ({ ...prev, two_factor_enabled: next }));
      }
      try {
        const ss = sessionStorage.getItem('auth_user');
        const ls = localStorage.getItem('auth_user');
        const storage = ss ? sessionStorage : localStorage;
        const raw = ss || ls;
        if (raw) {
          const u = JSON.parse(raw);
          u.two_factor_enabled = next;
          storage.setItem('auth_user', JSON.stringify(u));
        }
      } catch {}
    } catch (err) {
      setTwoFaError(err.message || 'Failed to update 2FA setting.');
    } finally {
      setTwoFaToggling(false);
    }
  };

  // ── Avatar upload ─────────────────────────────────────────
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Only JPEG, PNG, GIF, or WebP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be smaller than 5 MB.');
      return;
    }
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
    if (!profileForm.firstName.trim()) { setSaveError('First name is required.'); return; }
    if (!profileForm.lastName.trim())  { setSaveError('Last name is required.'); return; }
    setIsSaving(true);
    const sanitized = {
      ...profileForm,
      firstName:   profileForm.firstName.trim().slice(0, 64),
      lastName:    profileForm.lastName.trim().slice(0, 64),
      phoneNumber: profileForm.phoneNumber.trim().slice(0, 20),
      address:     profileForm.address.trim().slice(0, 200),
    };
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sanitized),
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
    const pw = passwordForm.newPassword;
    if (pw.length < 8)                      { setPasswordError('New password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(pw))                  { setPasswordError('New password must contain at least one uppercase letter.'); return; }
    if (!/[a-z]/.test(pw))                  { setPasswordError('New password must contain at least one lowercase letter.'); return; }
    if (!/\d/.test(pw))                     { setPasswordError('New password must contain at least one number.'); return; }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw)) { setPasswordError('New password must contain at least one special character.'); return; }
    if (pw !== passwordForm.confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setIsSavingPassword(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/profile/password`, {
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
      }, 15000);
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

  // ── Save shipping settings ────────────────────────────────
  const handleSaveShipping = async () => {
    setShippingError('');
    setShippingSuccess('');
    const base = parseFloat(shippingForm.shippingBaseRate);
    const perKm = parseFloat(shippingForm.shippingPerKmRate);
    if (isNaN(base) || base < 0)   { setShippingError('Base rate must be a valid positive number.'); return; }
    if (isNaN(perKm) || perKm < 0) { setShippingError('Per km rate must be a valid positive number.'); return; }
    setIsSavingShipping(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          storeName:         currentUser?.storeName        || '',
          storeDescription:  currentUser?.storeDescription || '',
          storeEmail:        currentUser?.storeEmail       || currentUser?.email || '',
          storePhone:        currentUser?.storePhone       || '',
          storeAddress:      shippingForm.storeAddress,
          storeLat:          shippingForm.storeLat,
          storeLng:          shippingForm.storeLng,
          shippingBaseRate:  base,
          shippingPerKmRate: perKm,
        }),
      }, 15000);
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Failed to save shipping settings.');
      setShippingSuccess('Shipping settings saved.');
      setTimeout(() => setShippingSuccess(''), 3000);
    } catch (err) {
      setShippingError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSavingShipping(false);
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

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', maxWidth: '960px' }}>
          <nav
            aria-label="Settings sections"
            style={{
              width: 200,
              flexShrink: 0,
              position: 'sticky',
              top: '1rem',
              alignSelf: 'flex-start',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              paddingRight: '1rem',
              borderRight: '1px solid var(--border)',
            }}
          >
            {[
              { id: 'profile', label: 'Profile' },
              { id: 'security', label: 'Security' },
              { id: 'business', label: 'Business' },
              { id: 'shipping', label: 'Shipping' },
              { id: 'notifications', label: 'Notifications' },
              { id: 'appearance', label: 'Appearance' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                style={{
                  height: 36,
                  padding: '0 0.75rem',
                  borderRadius: 8,
                  border: 'none',
                  margin: '1px 0',
                  textAlign: 'left',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: activeTab === id ? 'rgba(212,168,67,0.12)' : 'transparent',
                  color: activeTab === id ? 'var(--gold)' : 'var(--gray-light)',
                  boxShadow: activeTab === id ? 'inset 2px 0 0 var(--gold)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <div style={{ flex: 1, minWidth: 0, maxWidth: 640 }}>

          {activeTab === 'profile' && (
          <>
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
                  <Image
                    src={currentUser.avatar}
                    alt="avatar"
                    width={72}
                    height={72}
                    onError={() => setShowAvatarFallback(true)}
                    style={{
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid var(--gold)',
                    }}
                    unoptimized
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

          {/* ── Profile: personal info ──────────────────────────────── */}
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
                        maxLength={64}
                        autoComplete="given-name"
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
                        maxLength={64}
                        autoComplete="family-name"
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
                        autoComplete="off"
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
                        maxLength={20}
                        autoComplete="tel"
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
                        maxLength={200}
                        autoComplete="street-address"
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
          </>
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
                  {isSavingPassword ? 'Updating...' : (
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

                <div style={{
                  marginTop: '2rem',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid var(--border)',
                }}>
                  <h3 style={{
                    margin: '0 0 0.75rem',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    color: 'var(--white)',
                  }}>
                    Two-factor authentication
                  </h3>
                  <div style={{
                    padding: '1rem',
                    background: 'var(--dark)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '20px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          background: twoFactorEnabled ? 'rgba(74,222,128,0.12)' : 'rgba(156,163,175,0.12)',
                          color: twoFactorEnabled ? 'var(--green)' : 'var(--gray)',
                        }}>
                          {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <button
                        onClick={handleToggle2FA}
                        disabled={twoFaToggling}
                        aria-pressed={twoFactorEnabled}
                        aria-label="Toggle two-factor authentication"
                        style={{
                          position: 'relative',
                          width: '44px',
                          height: '24px',
                          borderRadius: '12px',
                          border: 'none',
                          cursor: twoFaToggling ? 'not-allowed' : 'pointer',
                          background: twoFactorEnabled ? 'var(--gold)' : 'var(--border)',
                          transition: 'background 0.2s',
                          padding: 0,
                          opacity: twoFaToggling ? 0.6 : 1,
                          flexShrink: 0,
                        }}
                      >
                        <span style={{
                          position: 'absolute',
                          top: '3px',
                          left: twoFactorEnabled ? '23px' : '3px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray-light)' }}>
                      {twoFactorEnabled
                        ? 'A one-time code is sent to your email at every login. Trusted devices can skip this step.'
                        : 'Enable to require email verification on each login for extra account security.'}
                    </p>
                    {twoFaError && (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--red)' }}>{twoFaError}</p>
                    )}
                    {twoFaSuccess && (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--green)' }}>{twoFaSuccess}</p>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <h3 style={{
                    margin: '0 0 0.75rem',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    color: 'var(--white)',
                  }}>
                    Connected Devices ({deviceTokens.length})
                  </h3>
                  {deviceTokens.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray)' }}>
                      No connected devices recorded for this account.
                    </p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {deviceTokens.map((t) => {
                        const tokenStr = typeof t === 'string' ? t : (t?.token ?? '');
                        const short = tokenStr.length > 12 ? `${tokenStr.slice(0, 12)}...` : (tokenStr || '(unknown)');
                        return (
                          <li
                            key={tokenStr || JSON.stringify(t)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.75rem',
                              padding: '0.75rem 1rem',
                              background: 'var(--dark)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                            }}
                          >
                            <code style={{ fontSize: '0.78rem', color: 'var(--gray-light)', wordBreak: 'break-all' }}>
                              {short}
                            </code>
                            <button
                              type="button"
                              onClick={() => revokeDevice(t.token ?? '')}
                              style={{
                                padding: '0.375rem 0.75rem',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                borderRadius: '8px',
                                border: '1px solid rgba(239,68,68,0.25)',
                                background: 'rgba(239,68,68,0.08)',
                                color: 'var(--red)',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              Revoke
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Active Sessions */}
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.75rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--white)' }}>
                        Active Sessions
                      </h3>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray)' }}>
                        Devices currently logged into your account.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {sessions.filter(s => !s.is_current).length > 0 && (
                        <button
                          type="button"
                          onClick={revokeAllSessions}
                          disabled={revokeAllBusy}
                          style={{
                            padding: '0.375rem 0.75rem',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: '1px solid rgba(239,68,68,0.25)',
                            background: 'rgba(239,68,68,0.08)',
                            color: 'var(--red)',
                            cursor: revokeAllBusy ? 'not-allowed' : 'pointer',
                            opacity: revokeAllBusy ? 0.6 : 1,
                          }}
                        >
                          {revokeAllBusy ? 'Revoking...' : 'Revoke All Others'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSessionsOpen(v => !v)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--gold)', fontSize: '0.8rem', fontWeight: 600,
                          padding: '0.25rem 0.5rem',
                        }}
                      >
                        {sessionsOpen ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  {sessionsOpen && (
                    <>
                      {sessionsSuccess && (
                        <div style={{
                          marginBottom: '0.75rem', padding: '0.75rem 1rem',
                          background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
                          borderRadius: '8px', color: 'var(--green)',
                          display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
                        }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          {sessionsSuccess}
                        </div>
                      )}
                      {sessionsError && (
                        <div style={{
                          marginBottom: '0.75rem', padding: '0.75rem 1rem',
                          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: '8px', color: 'var(--red)',
                          display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
                        }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          {sessionsError}
                        </div>
                      )}
                      {sessionsLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {[1, 2].map(i => (
                            <div key={i} style={{
                              padding: '1rem', background: 'var(--dark)',
                              border: '1px solid var(--border)', borderRadius: '10px',
                              height: '72px',
                              background: 'linear-gradient(90deg, var(--dark2) 25%, var(--dark3) 50%, var(--dark2) 75%)',
                              backgroundSize: '400px 100%',
                              animation: 'shimmer 1.4s ease-in-out infinite',
                            }}/>
                          ))}
                        </div>
                      ) : sessions.length === 0 ? (
                        <div style={{
                          padding: '2rem', textAlign: 'center', color: 'var(--gray)',
                          fontSize: '0.875rem', background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border)', borderRadius: '10px',
                        }}>
                          No active sessions found.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {sessions.map((s) => (
                            <div
                              key={s.id}
                              style={{
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.75rem', padding: '1rem 1.25rem',
                                background: s.is_current ? 'rgba(212,168,67,0.06)' : 'var(--dark)',
                                border: `1px solid ${s.is_current ? 'rgba(212,168,67,0.25)' : 'var(--border)'}`,
                                borderRadius: '10px', flexWrap: 'wrap',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                                <div style={{
                                  width: '36px', height: '36px', borderRadius: '8px',
                                  background: s.is_current ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.05)',
                                  border: `1px solid ${s.is_current ? 'rgba(212,168,67,0.3)' : 'var(--border)'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexShrink: 0, color: s.is_current ? 'var(--gold)' : 'var(--gray)',
                                }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                                    <line x1="8" y1="21" x2="16" y2="21"/>
                                    <line x1="12" y1="17" x2="12" y2="21"/>
                                  </svg>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                                  <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {s.name}
                                    {s.is_current && (
                                      <span style={{
                                        fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.4rem',
                                        borderRadius: '20px', background: 'rgba(234,179,8,0.12)',
                                        color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em',
                                      }}>
                                        Current
                                      </span>
                                    )}
                                  </span>
                                  <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                                    Last used: {s.last_used_at} · Created: {s.created_at}
                                  </span>
                                </div>
                              </div>
                              {!s.is_current && (
                                <button
                                  type="button"
                                  onClick={() => revokeSession(s.id)}
                                  disabled={revokingId === s.id}
                                  style={{
                                    padding: '0.375rem 0.75rem', fontSize: '0.8125rem', fontWeight: 600,
                                    borderRadius: '8px', border: '1px solid rgba(239,68,68,0.25)',
                                    background: 'rgba(239,68,68,0.08)', color: 'var(--red)',
                                    cursor: revokingId === s.id ? 'not-allowed' : 'pointer',
                                    opacity: revokingId === s.id ? 0.6 : 1, flexShrink: 0,
                                  }}
                                >
                                  {revokingId === s.id ? 'Revoking...' : 'Revoke'}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'business' && (
            <div style={{
              background: 'var(--dark2)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '1.5rem',
            }}>
              <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                Business details
              </h2>
              <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: 'var(--gray)' }}>
                Information shown to customers (saved to your profile when backend fields are available).
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '480px' }}>
                <div className="profile-form-field">
                  <label>Business name</label>
                  <input
                    type="text"
                    value={businessForm.businessName}
                    onChange={e => setBusinessForm(f => ({ ...f, businessName: e.target.value }))}
                    placeholder="PersonalizeMe Prints"
                  />
                </div>
                <div className="profile-form-field">
                  <label>Business address</label>
                  <input
                    type="text"
                    value={businessForm.businessAddress}
                    onChange={e => setBusinessForm(f => ({ ...f, businessAddress: e.target.value }))}
                    placeholder="Street, city"
                  />
                </div>
                <div className="profile-form-field">
                  <label>Operating hours</label>
                  <input
                    type="text"
                    value={businessForm.operatingHours}
                    onChange={e => setBusinessForm(f => ({ ...f, operatingHours: e.target.value }))}
                    placeholder="Mon–Sat 9:00–18:00"
                  />
                </div>
                <div className="profile-form-field">
                  <label>Customer contact email</label>
                  <input
                    type="email"
                    value={businessForm.contactEmail}
                    onChange={e => setBusinessForm(f => ({ ...f, contactEmail: e.target.value }))}
                    placeholder="support@example.com"
                  />
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--gray)', margin: 0 }}>
                  Logo upload and API sync for business fields can be wired in a follow-up.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'shipping' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Store Location */}
              <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
                <h2 style={{ margin: '0 0 0.375rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                  Store Location
                </h2>
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.8125rem', color: 'var(--gray)' }}>
                  Pin your store on the map. Shipping fee is calculated from this point to the customer's address.
                </p>

                <StoreLocationMap
                  lat={shippingForm.storeLat}
                  lng={shippingForm.storeLng}
                  onLocationSelect={(lat, lng) => setShippingForm(f => ({ ...f, storeLat: lat, storeLng: lng }))}
                />

                {shippingForm.storeLat && shippingForm.storeLng && (
                  <div style={{
                    marginTop: '0.75rem', padding: '0.625rem 0.875rem',
                    background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)',
                    borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--gray-light)' }}>
                      Pinned: {shippingForm.storeLat.toFixed(6)}, {shippingForm.storeLng.toFixed(6)}
                    </span>
                  </div>
                )}

                <div className="profile-form-field" style={{ marginTop: '1rem' }}>
                  <label>Store Address <span style={{ fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 400 }}>(displayed to customers)</span></label>
                  <input
                    type="text"
                    value={shippingForm.storeAddress}
                    onChange={e => setShippingForm(f => ({ ...f, storeAddress: e.target.value }))}
                    placeholder="e.g., 123 Rizal St., Brgy. San Antonio, Quezon City"
                    maxLength={300}
                  />
                </div>
              </div>

              {/* Shipping Rates */}
              <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
                <h2 style={{ margin: '0 0 0.375rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                  Shipping Rate Formula
                </h2>
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.8125rem', color: 'var(--gray)' }}>
                  Fee = Base Rate + (Per km Rate × Distance). Used to estimate delivery cost shown at checkout.
                  Set these to approximate what your courier (Lalamove / Grab) charges.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '480px' }}>
                  <div className="profile-form-field">
                    <label>Base Rate (₱) <span className="required">*</span></label>
                    <input
                      type="text" inputMode="decimal"
                      value={shippingForm.shippingBaseRate}
                      onChange={e => {
                        const v = e.target.value.replace(/[^\d.]/g, '');
                        setShippingForm(f => ({ ...f, shippingBaseRate: v }));
                      }}
                      placeholder="50"
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                      Flat fee regardless of distance
                    </div>
                  </div>
                  <div className="profile-form-field">
                    <label>Per km Rate (₱) <span className="required">*</span></label>
                    <input
                      type="text" inputMode="decimal"
                      value={shippingForm.shippingPerKmRate}
                      onChange={e => {
                        const v = e.target.value.replace(/[^\d.]/g, '');
                        setShippingForm(f => ({ ...f, shippingPerKmRate: v }));
                      }}
                      placeholder="15"
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                      Added per kilometer of distance
                    </div>
                  </div>
                </div>

                {/* Example */}
                {shippingForm.shippingBaseRate && shippingForm.shippingPerKmRate && (
                  <div style={{
                    marginTop: '1rem', padding: '0.75rem 1rem',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                    borderRadius: '8px', fontSize: '0.8125rem', color: 'var(--gray-light)',
                  }}>
                    Example — 5 km away:{' '}
                    <strong style={{ color: 'var(--white)' }}>
                      ₱{(parseFloat(shippingForm.shippingBaseRate || 0) + parseFloat(shippingForm.shippingPerKmRate || 0) * 5).toFixed(2)}
                    </strong>
                    {' '}· 10 km away:{' '}
                    <strong style={{ color: 'var(--white)' }}>
                      ₱{(parseFloat(shippingForm.shippingBaseRate || 0) + parseFloat(shippingForm.shippingPerKmRate || 0) * 10).toFixed(2)}
                    </strong>
                  </div>
                )}
              </div>

              {/* Feedback + Save */}
              {shippingError && (
                <div style={{
                  padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '8px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {shippingError}
                </div>
              )}
              {shippingSuccess && (
                <div style={{
                  padding: '0.75rem 1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: '8px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  {shippingSuccess}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleSaveShipping}
                  disabled={isSavingShipping}
                  style={{
                    padding: '0.625rem 1.5rem',
                    background: isSavingShipping ? 'var(--dark3)' : 'var(--gold)',
                    border: 'none', borderRadius: '8px',
                    color: isSavingShipping ? 'var(--gray)' : 'var(--black)',
                    fontSize: '0.875rem', fontWeight: 600,
                    cursor: isSavingShipping ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}
                >
                  {isSavingShipping ? (
                    <><span className="spinner" />Saving...</>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                      </svg>
                      Save Shipping Settings
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

          {activeTab === 'notifications' && (
            <div style={{
              background: 'var(--dark2)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '1.5rem',
            }}>
              <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                Notifications
              </h2>
              <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: 'var(--gray)' }}>
                Preferences are stored on this device for now.
              </p>
              {[
                { key: 'newOrders', label: 'New order notifications' },
                { key: 'lowStock', label: 'Low stock alerts' },
                { key: 'paymentReceived', label: 'Payment received' },
                { key: 'orderStatus', label: 'Order status updates' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 0', borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>{label}</span>
                  <button
                    type="button"
                    aria-pressed={notifPrefs[key]}
                    onClick={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: notifPrefs[key] ? 'var(--gold)' : 'var(--border)',
                      position: 'relative', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: notifPrefs[key] ? 22 : 2,
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'var(--white)', transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'appearance' && (
            <div style={{
              background: 'var(--dark2)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '1.5rem',
            }}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                Appearance
              </h2>
              <div style={{
                padding: '2rem 1.5rem', textAlign: 'center',
                border: '1px dashed var(--border)', borderRadius: '12px', color: 'var(--gray)',
                fontSize: '0.875rem',
              }}>
                Theme options coming soon.
              </div>
            </div>
          )}

        </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
