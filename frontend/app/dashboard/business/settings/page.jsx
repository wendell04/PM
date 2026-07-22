'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';
import ImageCropper from '@/components/ImageCropper';

// Google Places (New) — best PH landmark coverage for the store-location search. Falls back to OSM when unset/failed.
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Structured store-address parts (himay-himay, like the customer address) + helpers to combine/parse them.
const EMPTY_STORE_PARTS = { house_number: '', street: '', barangay: '', city: '', province: '', zip: '' };
const combineStoreAddress = (p = {}) => [
  [p.house_number, p.street].filter(Boolean).join(' '),
  p.barangay, p.city, p.province, p.zip,
].filter(Boolean).join(', ');
const googleComponentsToParts = (components = []) => {
  const get = (t) => components.find(c => (c.types || []).includes(t));
  return {
    house_number: get('street_number')?.longText || '',
    street:       get('route')?.longText || '',
    barangay:     get('sublocality_level_1')?.longText || get('neighborhood')?.longText || get('sublocality')?.longText || '',
    city:         get('locality')?.longText || get('administrative_area_level_2')?.longText || '',
    province:     get('administrative_area_level_1')?.longText || '',
    zip:          get('postal_code')?.longText || '',
  };
};
const osmAddressToParts = (a = {}) => ({
  house_number: a.house_number || '',
  street:       a.road || a.pedestrian || a.footway || '',
  barangay:     a.suburb || a.village || a.neighbourhood || a.quarter || '',
  city:         a.city || a.town || a.municipality || a.county || '',
  province:     a.state || '',
  zip:          (a.postcode || '').replace(/\D/g, '').slice(0, 4),
});

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
  const { theme, toggleTheme } = useTheme();

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
  const [avatarCropSrc, setAvatarCropSrc]           = useState(null);
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
    storeAddress: '', storeAddressParts: { ...EMPTY_STORE_PARTS }, storeLat: null, storeLng: null,
    shippingMode: 'courier_booked',
    shippingBaseRate: '50', shippingPerKmRate: '15',
    flatRateInsideMetro: '150', flatRateOutsideMetro: '250',
  });
  const [isSavingShipping, setIsSavingShipping]   = useState(false);
  const [shippingError, setShippingError]         = useState('');
  const [shippingSuccess, setShippingSuccess]     = useState('');
  const [addrSearch, setAddrSearch]               = useState('');
  const [addrSuggestions, setAddrSuggestions]     = useState([]);
  const [addrShowSug, setAddrShowSug]             = useState(false);
  const [addrSearching, setAddrSearching]         = useState(false);
  const [addrMapGeocoding, setAddrMapGeocoding]   = useState(false);
  const addrTimerRef                              = useRef(null);
  const addrGoogleSessionRef                      = useRef(null);

  // ── 2FA toggle ────────────────────────────────────────────
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFaToggling, setTwoFaToggling]       = useState(false);
  const [twoFaError, setTwoFaError]             = useState('');
  const [twoFaSuccess, setTwoFaSuccess]         = useState('');

  const [totpConfirmed, setTotpConfirmed] = useState(false);
  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const [totpQr, setTotpQr] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState('');
  const [totpSuccess, setTotpSuccess] = useState('');
  const [totpRemoveOpen, setTotpRemoveOpen] = useState(false);
  const [totpRemovePassword, setTotpRemovePassword] = useState('');
  const [totpRemoveLoading, setTotpRemoveLoading] = useState(false);
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);
  const [businessError, setBusinessError] = useState('');
  const [businessSuccess, setBusinessSuccess] = useState('');

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
      setTotpConfirmed(!!currentUser.totp_confirmed);
      setIsLoading(false);
    }
  }, [currentUser]);

  // ── Load shipping settings ────────────────────────────────
  useEffect(() => {
    if (!token || activeTab !== 'shipping') return;
    fetchWithTimeout(`${API_URL}/api/admin/settings`, { headers: { Authorization: `Bearer ${token}` } }, 10000)
      .then(r => r.json())
      .then(d => {
        if (d?.data) {
          setShippingForm({
            storeAddress:         d.data.storeAddress         || '',
            storeAddressParts:    d.data.storeAddressParts    || { ...EMPTY_STORE_PARTS },
            storeLat:             d.data.storeLat             ?? null,
            storeLng:             d.data.storeLng             ?? null,
            shippingMode:         d.data.shippingMode         || 'courier_booked',
            shippingBaseRate:     d.data.shippingBaseRate     != null ? String(d.data.shippingBaseRate)     : '50',
            shippingPerKmRate:    d.data.shippingPerKmRate    != null ? String(d.data.shippingPerKmRate)    : '15',
            designRequestFee:     d.data.designRequestFee     != null ? String(d.data.designRequestFee)     : '100',
            flatRateInsideMetro:  d.data.flatRateInsideMetro  != null ? String(d.data.flatRateInsideMetro)  : '150',
            flatRateOutsideMetro: d.data.flatRateOutsideMetro != null ? String(d.data.flatRateOutsideMetro) : '250',
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
        const raw = localStorage.getItem('auth_user');
        if (raw) {
          const u = JSON.parse(raw);
          u.two_factor_enabled = next;
          localStorage.setItem('auth_user', JSON.stringify(u));
        }
      } catch {}
    } catch (err) {
      setTwoFaError(err.message || 'Failed to update 2FA setting.');
    } finally {
      setTwoFaToggling(false);
    }
  };

  const handleSetupTotp = async () => {
    setTotpLoading(true);
    setTotpError('');
    setTotpQr('');
    setTotpSecret('');
    setTotpCode('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/2fa/totp/setup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }, 10000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to start setup.');
      setTotpQr(data.qr_code_svg || '');
      setTotpSecret(data.secret || '');
      setTotpSetupOpen(true);
    } catch (err) {
      setTotpError(err.message || 'Failed to set up authenticator.');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleConfirmTotp = async () => {
    if (!totpCode.trim()) { setTotpError('Enter the 6-digit code from your app.'); return; }
    setTotpLoading(true);
    setTotpError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/2fa/totp/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode.trim() }),
      }, 10000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Invalid code.');
      setTotpConfirmed(true);
      setTotpSetupOpen(false);
      setTotpSuccess('Google Authenticator activated successfully.');
      setTimeout(() => setTotpSuccess(''), 4000);
      if (typeof setCurrentUser === 'function') {
        setCurrentUser(prev => ({ ...prev, totp_confirmed: true, two_factor_enabled: true }));
      }
      setTwoFactorEnabled(true);
      setTwoFactorMethod('totp');
    } catch (err) {
      setTotpError(err.message || 'Failed to verify code.');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleRemoveTotp = async () => {
    if (!totpRemovePassword.trim()) { setTotpError('Password is required.'); return; }
    setTotpRemoveLoading(true);
    setTotpError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/2fa/totp`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: totpRemovePassword }),
      }, 10000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to remove authenticator.');
      setTotpConfirmed(false);
      setTotpRemoveOpen(false);
      setTotpRemovePassword('');
      setTotpSetupOpen(false);
      setTotpSuccess('Authenticator app removed.');
      setTimeout(() => setTotpSuccess(''), 4000);
      if (typeof setCurrentUser === 'function') {
        setCurrentUser(prev => ({ ...prev, totp_confirmed: false }));
      }
    } catch (err) {
      setTotpError(err.message || 'Failed to remove authenticator.');
    } finally {
      setTotpRemoveLoading(false);
    }
  };

  // ── Avatar upload ─────────────────────────────────────────
  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Only JPEG, PNG, GIF, or WebP images are allowed.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setAvatarError('Image must be smaller than 15 MB.');
      return;
    }
    // Square-crop before upload (avatar renders as a circle).
    setAvatarError('');
    setAvatarCropSrc(URL.createObjectURL(file));
  };

  const uploadAvatarFile = async (file) => {
    if (avatarCropSrc) { URL.revokeObjectURL(avatarCropSrc); setAvatarCropSrc(null); }
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

  // ── Store address autocomplete ────────────────────────────
  const handleAddrSearchChange = (e) => {
    const q = e.target.value;
    setAddrSearch(q);
    setAddrShowSug(false);
    clearTimeout(addrTimerRef.current);
    if (q.length < 3) { setAddrSuggestions([]); return; }
    setAddrSearching(true);
    addrTimerRef.current = setTimeout(async () => {
      try {
        let results = [];
        if (GOOGLE_KEY) {
          try {
            if (!addrGoogleSessionRef.current) addrGoogleSessionRef.current = (globalThis.crypto?.randomUUID?.() || String(Date.now()));
            const body = {
              input: q,
              includedRegionCodes: ['ph'],
              sessionToken: addrGoogleSessionRef.current,
              ...(shippingForm.storeLat && shippingForm.storeLng
                ? { locationBias: { circle: { center: { latitude: shippingForm.storeLat, longitude: shippingForm.storeLng }, radius: 30000 } } }
                : {}),
            };
            const gres = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY }, body: JSON.stringify(body),
            });
            if (gres.ok) {
              const gdata = await gres.json();
              results = (gdata.suggestions || []).map(x => x.placePrediction).filter(Boolean).map(p => ({
                google_place_id: p.placeId,
                title:        p.structuredFormat?.mainText?.text || p.text?.text || '',
                subtitle:     p.structuredFormat?.secondaryText?.text || '',
                display_name: p.text?.text || '',
              })).filter(x => x.google_place_id);
            }
          } catch { /* fall through to OSM */ }
        }
        if (results.length === 0) {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=ph&q=${encodeURIComponent(q)}`,
            { headers: { 'Accept-Language': 'en' } }
          );
          results = await res.json();
        }
        setAddrSuggestions(results);
        setAddrShowSug(results.length > 0);
      } catch { setAddrSuggestions([]); }
      finally { setAddrSearching(false); }
    }, 280);
  };

  const handleAddrSuggestionSelect = async (s) => {
    setAddrShowSug(false);
    setAddrSuggestions([]);
    setAddrSearch('');
    // Google prediction → resolve coordinates + formatted address via Place Details.
    if (s.google_place_id) {
      try {
        const res = await fetch(
          `https://places.googleapis.com/v1/places/${s.google_place_id}?sessionToken=${addrGoogleSessionRef.current || ''}`,
          { headers: { 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': 'location,formattedAddress,addressComponents' } }
        );
        addrGoogleSessionRef.current = null;
        if (res.ok) {
          const d = await res.json();
          const sp = googleComponentsToParts(d.addressComponents);
          setShippingForm(f => ({ ...f, storeAddressParts: sp, storeAddress: d.formattedAddress || combineStoreAddress(sp) || s.display_name, storeLat: d.location?.latitude, storeLng: d.location?.longitude }));
          return;
        }
      } catch { /* fall through to OSM shape */ }
    }
    const sp = osmAddressToParts(s.address || {});
    setShippingForm(f => ({
      ...f,
      storeAddressParts: sp,
      storeAddress: combineStoreAddress(sp) || s.display_name,
      storeLat:     parseFloat(s.lat),
      storeLng:     parseFloat(s.lon),
    }));
  };

  const handleMapLocationSelect = async (lat, lng) => {
    setShippingForm(f => ({ ...f, storeLat: lat, storeLng: lng }));
    setAddrMapGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data?.address) {
        const sp = osmAddressToParts(data.address);
        const formatted = combineStoreAddress(sp);
        if (formatted) setShippingForm(f => ({ ...f, storeAddressParts: sp, storeAddress: formatted }));
      }
    } catch { /* keep existing */ }
    finally { setAddrMapGeocoding(false); }
  };

  // ── Save shipping settings ────────────────────────────────
  const handleSaveShipping = async () => {
    setShippingError('');
    setShippingSuccess('');
    const noFee  = shippingForm.shippingMode === 'courier_booked';
    const isFlat = shippingForm.shippingMode === 'flat';
    const base    = parseFloat(shippingForm.shippingBaseRate);
    const perKm   = parseFloat(shippingForm.shippingPerKmRate);
    const inside  = parseFloat(shippingForm.flatRateInsideMetro);
    const outside = parseFloat(shippingForm.flatRateOutsideMetro);
    if (!noFee) {
      if (!isFlat) {
        if (isNaN(base) || base < 0)   { setShippingError('Base rate must be a valid positive number.'); return; }
        if (isNaN(perKm) || perKm < 0) { setShippingError('Per km rate must be a valid positive number.'); return; }
      } else {
        if (isNaN(inside)  || inside  < 0) { setShippingError('Inside Metro rate must be a valid positive number.'); return; }
        if (isNaN(outside) || outside < 0) { setShippingError('Outside Metro rate must be a valid positive number.'); return; }
      }
    }
    setIsSavingShipping(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/settings/shipping`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          storeAddress:         shippingForm.storeAddress,
          storeAddressParts:    shippingForm.storeAddressParts,
          storeLat:             shippingForm.storeLat,
          storeLng:             shippingForm.storeLng,
          shippingMode:         shippingForm.shippingMode,
          designRequestFee:     parseFloat(shippingForm.designRequestFee) || 0,
          shippingBaseRate:     isFlat ? 50  : base,
          shippingPerKmRate:    isFlat ? 15  : perKm,
          flatRateInsideMetro:  inside,
          flatRateOutsideMetro: outside,
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

  const handleSaveBusinessSettings = async () => {
    setBusinessError('');
    setBusinessSuccess('');
    setIsSavingBusiness(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessForm.businessName,
          businessAddress: businessForm.businessAddress,
          operatingHours: businessForm.operatingHours,
          contactEmail: businessForm.contactEmail,
        }),
      }, 10000);
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Failed to save business settings.');
      setBusinessSuccess('Business settings saved.');
      setTimeout(() => setBusinessSuccess(''), 3000);
    } catch (err) {
      setBusinessError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSavingBusiness(false);
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

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
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

          <div style={{ flex: 1, minWidth: 0 }}>

          {activeTab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.5rem', alignItems: 'start' }}>

            {/* ── Left: Avatar sidebar card ──────────────────── */}
            <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '1.75rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.625rem' }}>
                <div style={{ position: 'relative' }}>
                  {currentUser?.avatar && !showAvatarFallback ? (
                    <Image
                      src={currentUser.avatar}
                      alt="avatar"
                      width={88}
                      height={88}
                      onError={() => setShowAvatarFallback(true)}
                      style={{ borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--gold)', display: 'block' }}
                      unoptimized
                    />
                  ) : (
                    <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: 'var(--gold)', color: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.75rem', border: '2px solid var(--gold)' }}>
                      {getInitials(currentUser)}
                    </div>
                  )}
                  <label htmlFor="settings-avatar-upload" style={{ position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isUploadingAvatar ? 'not-allowed' : 'pointer', border: '2px solid var(--dark2)', zIndex: 2 }}>
                    {isUploadingAvatar ? <span className="spinner" style={{ width: '10px', height: '10px' }} /> : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--black)" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    )}
                  </label>
                  <input id="settings-avatar-upload" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} disabled={isUploadingAvatar} onChange={handleAvatarUpload} />
                  {avatarCropSrc && (
                    <ImageCropper src={avatarCropSrc} aspect={1} round outputSize={512} title="Crop profile photo"
                      onCancel={() => { URL.revokeObjectURL(avatarCropSrc); setAvatarCropSrc(null); }}
                      onConfirm={uploadAvatarFile} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--white)', lineHeight: 1.3 }}>
                    {currentUser?.firstName && currentUser?.lastName ? `${currentUser.firstName} ${currentUser.lastName}` : currentUser?.email || ''}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '0.2rem' }}>{currentUser?.email}</div>
                </div>
                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', border: '1px solid var(--gold)', color: 'var(--gold)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {ROLE_LABELS[currentUser?.role] ?? 'Staff'}
                </span>
                {avatarError && (
                  <div style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.78rem' }}>{avatarError}</div>
                )}
                {avatarSuccess && (
                  <div style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'color-mix(in srgb, var(--green) 15%, transparent)', border: '1px solid var(--green)', borderRadius: '8px', color: 'var(--green)', fontSize: '0.78rem' }}>Avatar updated successfully.</div>
                )}
              </div>
            </div>

            {/* ── Right: Personal info ──────────────────────── */}
            <div>
            {!isEditing ? (
            <>
              {/* Section header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Personal Information</h2>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--gray)' }}>Manage your name, contact details, and display information</p>
                </div>
                <button type="button" onClick={() => { setSnapshot({ ...profileForm }); setIsEditing(true); setSaveError(''); setSaveSuccess(''); }}
                  style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--gold)', borderRadius: '8px', color: 'var(--gold)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit Profile
                </button>
              </div>

              {saveSuccess && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  {saveSuccess}
                </div>
              )}

              {/* Identity card */}
              <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '1rem', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Identity</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Your name as it appears on your account.</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {[{ label: 'First Name', value: profileForm.firstName }, { label: 'Last Name', value: profileForm.lastName }].map(({ label, value }, i) => (
                    <div key={label} style={{ padding: '1rem 1.25rem', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>{label}</div>
                      <div style={{ fontSize: '0.925rem', color: 'var(--white)', fontWeight: 500 }}>{value || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact card */}
              <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Contact</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Email, phone, and address on file.</span>
                </div>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Email Address</div>
                    <div style={{ fontSize: '0.925rem', color: 'var(--white)', fontWeight: 500 }}>{profileForm.email || '—'}</div>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--gray)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Locked</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {[{ label: 'Phone Number', value: profileForm.phoneNumber }, { label: 'Address', value: profileForm.address }].map(({ label, value }, i) => (
                    <div key={label} style={{ padding: '1rem 1.25rem', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>{label}</div>
                      <div style={{ fontSize: '0.925rem', color: 'var(--white)', fontWeight: 500 }}>{value || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
            ) : (
              <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Edit Profile</h2>
                  <button type="button" onClick={() => { setProfileForm({ ...snapshot }); setIsEditing(false); setSaveError(''); }} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
                </div>
                {saveError && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {saveError}
                  </div>
                )}
                <div className="profile-form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="profile-form-field">
                    <label>First Name <span className="required">*</span></label>
                    <input type="text" value={profileForm.firstName} onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))} placeholder="e.g., Juan" maxLength={64} autoComplete="given-name" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); } }} />
                  </div>
                  <div className="profile-form-field">
                    <label>Last Name <span className="required">*</span></label>
                    <input type="text" value={profileForm.lastName} onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))} placeholder="e.g., Dela Cruz" maxLength={64} autoComplete="family-name" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); } }} />
                  </div>
                  <div className="profile-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Email Address <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>(cannot be changed)</span></label>
                    <input type="email" value={profileForm.email} disabled readOnly tabIndex={-1} autoComplete="off" style={{ opacity: 0.5, cursor: 'not-allowed', background: 'var(--dark3)', userSelect: 'none' }} />
                  </div>
                  <div className="profile-form-field">
                    <label>Phone <span className="required">*</span></label>
                    <input type="tel" value={profileForm.phoneNumber} onChange={e => setProfileForm(p => ({ ...p, phoneNumber: e.target.value }))} placeholder="e.g., 09123456789" maxLength={20} autoComplete="tel" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); } }} />
                  </div>
                  <div className="profile-form-field">
                    <label>Address <span className="required">*</span></label>
                    <input type="text" value={profileForm.address} onChange={e => setProfileForm(p => ({ ...p, address: e.target.value }))} placeholder="e.g., 123 Main Street" maxLength={200} autoComplete="street-address" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); } }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => { setProfileForm({ ...snapshot }); setIsEditing(false); setSaveError(''); }} style={{ padding: '0.625rem 1.25rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={handleSaveProfile} disabled={isSaving} style={{ padding: '0.625rem 1.5rem', background: isSaving ? 'var(--dark3)' : 'var(--gold)', border: 'none', borderRadius: '8px', color: isSaving ? 'var(--gray)' : 'var(--black)', fontSize: '0.875rem', fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isSaving ? <><span className="spinner" />Saving...</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save Changes</>}
                  </button>
                </div>
              </div>
            )}
            </div>

          </div>
          )}

          {/* ── Security Tab ──────────────────────────────── */}
          {activeTab === 'security' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

    {/* ── Change Password ─────────────────────────── */}
    <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Change Password</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Change it regularly to keep your account safe.</span>
      </div>
      <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '520px' }}>

        {[
          { key: 'currentPassword', label: 'Current Password', showKey: 'current', placeholder: 'Enter current password' },
          { key: 'newPassword', label: 'New Password', showKey: 'newPass', placeholder: 'Enter new password' },
          { key: 'confirmPassword', label: 'Confirm New Password', showKey: 'confirm', placeholder: 'Confirm new password' },
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
                style={{ width: '100%', padding: '0.75rem 0.875rem', paddingRight: '3rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShowPasswords(p => ({ ...p, [showKey]: !p[showKey] }))} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0.25rem' }}>
                {showPasswords[showKey]
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            {key === 'newPassword' && passwordForm.newPassword.length > 0 && (
              <>
                <div style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem' }}>
                  {[
                    { label: 'At least 8 characters', pass: passwordForm.newPassword.length >= 8 },
                    { label: 'One uppercase letter', pass: /[A-Z]/.test(passwordForm.newPassword) },
                    { label: 'One lowercase letter', pass: /[a-z]/.test(passwordForm.newPassword) },
                    { label: 'One number', pass: /\d/.test(passwordForm.newPassword) },
                    { label: 'One special character', pass: /[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword) },
                  ].map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: c.pass ? 'var(--green)' : 'var(--gray)', transition: 'color 0.2s', marginBottom: i < 4 ? '0.4rem' : 0 }}>
                      <span style={{ display: 'inline-flex', width: '14px', justifyContent: 'center', flexShrink: 0 }}>
                        {c.pass ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg> : <span style={{ opacity: 0.45 }}>|</span>}
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
                      <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: strength.width, background: strength.color, transition: 'width 0.3s ease', borderRadius: '2px' }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: strength.color, marginTop: '4px', display: 'block' }}>{strength.label}</span>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        ))}

        {passwordError && (
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {passwordError}
          </div>
        )}
        {passwordSuccess && (
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            {passwordSuccess}
          </div>
        )}

        <button type="button" onClick={handleSavePassword} disabled={isSavingPassword} style={{ padding: '0.625rem 1.5rem', background: isSavingPassword ? 'var(--dark3)' : 'var(--gold)', border: 'none', borderRadius: '8px', color: isSavingPassword ? 'var(--gray)' : 'var(--black)', fontWeight: 600, fontSize: '0.875rem', cursor: isSavingPassword ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content' }}>
          {isSavingPassword ? <><span className="spinner" />Updating...</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Update Password</>}
        </button>
      </div>
      </div>
    </div>

    {/* ── Active Sessions ──────────────────────────── */}
    <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Active Sessions</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Devices currently logged into your account.</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {sessions.filter(s => !s.is_current).length > 0 && (
            <button type="button" onClick={revokeAllSessions} disabled={revokeAllBusy} style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', fontWeight: 600, borderRadius: '8px', border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: 'var(--red)', cursor: revokeAllBusy ? 'not-allowed' : 'pointer', opacity: revokeAllBusy ? 0.6 : 1 }}>
              {revokeAllBusy ? 'Revoking...' : 'Revoke All Others'}
            </button>
          )}
          <button type="button" onClick={() => setSessionsOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontSize: '0.8rem', fontWeight: 600, padding: '0.25rem 0.5rem' }}>
            {sessionsOpen ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div style={{ padding: '1rem 1.5rem' }}>

      {sessionsOpen && (
        <>
          {sessionsSuccess && (
            <div style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: '8px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              {sessionsSuccess}
            </div>
          )}
          {sessionsError && (
            <div style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {sessionsError}
            </div>
          )}
          {sessionsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[1, 2].map(i => (
                <div key={i} style={{ padding: '1rem', borderRadius: '10px', height: '72px', background: 'linear-gradient(90deg, var(--dark2) 25%, var(--dark3) 50%, var(--dark2) 75%)', backgroundSize: '400px 100%', animation: 'shimmer 1.4s ease-in-out infinite' }}/>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              No active sessions found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sessions.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '1rem 1.25rem', background: s.is_current ? 'rgba(212,168,67,0.06)' : 'var(--dark)', border: `1px solid ${s.is_current ? 'rgba(212,168,67,0.25)' : 'var(--border)'}`, borderRadius: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: s.is_current ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${s.is_current ? 'rgba(212,168,67,0.3)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: s.is_current ? 'var(--gold)' : 'var(--gray)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {s.name}
                        {s.is_current && <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '20px', background: 'rgba(234,179,8,0.12)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current</span>}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Last used: {s.last_used_at} · Created: {s.created_at}</span>
                    </div>
                  </div>
                  {!s.is_current && (
                    <button type="button" onClick={() => revokeSession(s.id)} disabled={revokingId === s.id} style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', fontWeight: 600, borderRadius: '8px', border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: 'var(--red)', cursor: revokingId === s.id ? 'not-allowed' : 'pointer', opacity: revokingId === s.id ? 0.6 : 1, flexShrink: 0 }}>
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

    {/* ── Two-Factor Authentication ────────────────── */}
    <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Two-Factor Authentication</span>
      </div>
      <div style={{ padding: '1.5rem' }}>

      {/* Toggle row */}
      <div style={{ padding: '0.875rem 1rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', background: twoFactorEnabled ? 'rgba(74,222,128,0.12)' : 'rgba(156,163,175,0.12)', color: twoFactorEnabled ? 'var(--green)' : 'var(--gray)' }}>
          {twoFactorEnabled ? 'Enabled' : 'Disabled'}
        </span>
        <button onClick={handleToggle2FA} disabled={twoFaToggling} aria-pressed={twoFactorEnabled} style={{ position: 'relative', width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: twoFaToggling ? 'not-allowed' : 'pointer', background: twoFactorEnabled ? 'var(--gold)' : 'var(--border)', transition: 'background 0.2s', padding: 0, opacity: twoFaToggling ? 0.6 : 1, flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: '3px', left: twoFactorEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--dark)', transition: 'left 0.2s' }} />
        </button>
      </div>

      {twoFaError && <p style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: 'var(--red)' }}>{twoFaError}</p>}
      {twoFaSuccess && <p style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: 'var(--green)' }}>{twoFaSuccess}</p>}
      {totpSuccess && <p style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: 'var(--green)' }}>{totpSuccess}</p>}

      {twoFactorEnabled && !totpSetupOpen && !totpRemoveOpen && (
        <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.73rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Verification Methods
          </p>

          {/* Email OTP — always available */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem', borderRadius: '10px', border: '1.5px solid rgba(96,165,250,0.35)', background: 'rgba(96,165,250,0.05)' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '9px', flexShrink: 0, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#60a5fa', marginBottom: '0.15rem' }}>Email OTP</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--gray)' }}>A 6-digit code sent to your email at each login.</div>
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', whiteSpace: 'nowrap' }}>
              Always available
            </span>
          </div>

          {/* Authenticator App */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem', borderRadius: '10px', border: `1.5px solid ${totpConfirmed ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.09)'}`, background: totpConfirmed ? 'rgba(74,222,128,0.05)' : 'rgba(255,255,255,0.02)' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '9px', flexShrink: 0, background: totpConfirmed ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${totpConfirmed ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={totpConfirmed ? '#4ade80' : 'var(--gray)'} strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: totpConfirmed ? '#4ade80' : 'var(--white)', marginBottom: '0.15rem' }}>Authenticator App</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--gray)' }}>
                {totpConfirmed ? 'Google Authenticator / Authy is linked to your account.' : 'Link Google Authenticator or Authy for offline codes.'}
              </div>
            </div>
            {totpConfirmed ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>ACTIVE</span>
                <button type="button" onClick={() => { setTotpRemoveOpen(true); setTotpError(''); }} style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: 'var(--red)', cursor: 'pointer' }}>
                  Remove
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleSetupTotp} disabled={totpLoading} style={{ fontSize: '0.78rem', fontWeight: 700, padding: '0.4rem 0.9rem', borderRadius: '8px', border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.1)', color: '#4ade80', cursor: totpLoading ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: totpLoading ? 0.6 : 1 }}>
                {totpLoading ? 'Loading…' : 'Set Up'}
              </button>
            )}
          </div>

          {totpError && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--red)' }}>{totpError}</p>}
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.4 }}>
            At login you can choose which method to use. Both can be active simultaneously.
          </p>
        </div>
      )}

      {/* TOTP setup flow */}
      {totpSetupOpen && (
        <div style={{ marginTop: '1.25rem', padding: '1.25rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--white)', marginBottom: '1rem' }}>Scan this QR code with your authenticator app</div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {totpQr && (
              <div dangerouslySetInnerHTML={{ __html: totpQr }} style={{ width: '160px', height: '160px', background: 'var(--dark)', borderRadius: '8px', padding: '8px', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {totpSecret && (
                <div>
                  <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', color: 'var(--gray)' }}>Can&apos;t scan? Enter this key manually:</p>
                  <code style={{ display: 'block', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--gold)', letterSpacing: '0.1em', wordBreak: 'break-all' }}>{totpSecret}</code>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="text" inputMode="numeric" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={e => { if (e.key === 'Enter') handleConfirmTotp(); }} placeholder="6-digit code" maxLength={6} style={{ flex: 1, padding: '0.625rem 0.75rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '1rem', letterSpacing: '0.2em', textAlign: 'center' }} />
                <button type="button" onClick={handleConfirmTotp} disabled={totpLoading || totpCode.length !== 6} style={{ padding: '0.625rem 1rem', background: totpCode.length === 6 ? 'var(--gold)' : 'var(--dark3)', border: 'none', borderRadius: '8px', color: totpCode.length === 6 ? 'var(--black)' : 'var(--gray)', fontSize: '0.875rem', fontWeight: 600, cursor: totpCode.length === 6 ? 'pointer' : 'not-allowed' }}>
                  {totpLoading ? <span className="spinner" style={{ width: '14px', height: '14px' }} /> : 'Verify'}
                </button>
              </div>
              {totpError && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--red)' }}>{totpError}</p>}
            </div>
          </div>
          <button type="button" onClick={() => { setTotpSetupOpen(false); setTotpCode(''); setTotpError(''); }} style={{ marginTop: '0.875rem', background: 'none', border: 'none', color: 'var(--gray)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>
            Cancel setup
          </button>
        </div>
      )}

      {/* Remove TOTP confirmation */}
      {totpRemoveOpen && (
        <div style={{ marginTop: '1.25rem', padding: '1.25rem', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--red)', marginBottom: '0.35rem' }}>Remove authenticator app</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.875rem' }}>Enter your account password to confirm removal.</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="password" value={totpRemovePassword} onChange={e => setTotpRemovePassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRemoveTotp(); }} placeholder="Your password" style={{ flex: 1, padding: '0.625rem 0.75rem', background: 'var(--dark)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem' }} />
            <button type="button" onClick={handleRemoveTotp} disabled={totpRemoveLoading} style={{ padding: '0.625rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              {totpRemoveLoading ? <span className="spinner" style={{ width: '14px', height: '14px' }} /> : 'Confirm'}
            </button>
          </div>
          {totpError && <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--red)' }}>{totpError}</p>}
          <button type="button" onClick={() => { setTotpRemoveOpen(false); setTotpRemovePassword(''); setTotpError(''); }} style={{ marginTop: '0.625rem', background: 'none', border: 'none', color: 'var(--gray)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>
            Cancel
          </button>
        </div>
      )}
      </div>
    </div>
  </div>
)}

          {activeTab === 'business' && (
  <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
    <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Business Details</span>
      <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Public information shown to your customers.</span>
    </div>
    <div style={{ padding: '1.5rem' }}>

    {businessSuccess && (
      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        {businessSuccess}
      </div>
    )}
    {businessError && (
      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {businessError}
      </div>
    )}

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div className="profile-form-field">
        <label>Business name</label>
        <input type="text" value={businessForm.businessName} onChange={e => setBusinessForm(f => ({ ...f, businessName: e.target.value }))} placeholder="PersonalizeMe Prints" maxLength={100} />
      </div>
      <div className="profile-form-field">
        <label>Operating hours</label>
        <input type="text" value={businessForm.operatingHours} onChange={e => setBusinessForm(f => ({ ...f, operatingHours: e.target.value }))} placeholder="Mon–Sat 9:00–18:00" maxLength={100} />
      </div>
      <div className="profile-form-field">
        <label>Business address</label>
        <input type="text" value={businessForm.businessAddress} onChange={e => setBusinessForm(f => ({ ...f, businessAddress: e.target.value }))} placeholder="Street, city" maxLength={200} />
      </div>
      <div className="profile-form-field">
        <label>Customer contact email</label>
        <input type="email" value={businessForm.contactEmail} onChange={e => setBusinessForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="support@example.com" maxLength={100} />
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
        <button type="button" onClick={handleSaveBusinessSettings} disabled={isSavingBusiness} style={{ padding: '0.625rem 1.5rem', background: isSavingBusiness ? 'var(--dark3)' : 'var(--gold)', border: 'none', borderRadius: '8px', color: isSavingBusiness ? 'var(--gray)' : 'var(--black)', fontSize: '0.875rem', fontWeight: 600, cursor: isSavingBusiness ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isSavingBusiness ? <><span className="spinner" />Saving...</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save Changes</>}
        </button>
      </div>
    </div>
    </div>
  </div>
)}

          {activeTab === 'shipping' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Store Location */}
              <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'visible' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Store Location</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Pin your store on the map. Shipping fee is calculated from this point.</span>
                </div>
                <div style={{ padding: '1.5rem' }}>
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.8125rem', color: 'var(--gray)', display: 'none' }}>
                  Pin your store on the map. Shipping fee is calculated from this point to the customer's address.
                </p>

                <StoreLocationMap
                  lat={shippingForm.storeLat}
                  lng={shippingForm.storeLng}
                  onLocationSelect={handleMapLocationSelect}
                />

                {shippingForm.storeLat && shippingForm.storeLng && (
                  <div style={{
                    marginTop: '0.75rem', padding: '0.625rem 0.875rem',
                    background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)',
                    borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    {addrMapGeocoding
                      ? <span style={{ fontSize: '0.8125rem', color: 'var(--gray)' }}>Detecting address…</span>
                      : <span style={{ fontSize: '0.8125rem', color: 'var(--gray-light)' }}>
                          Pinned: {shippingForm.storeAddress || `${shippingForm.storeLat.toFixed(6)}, ${shippingForm.storeLng.toFixed(6)}`}
                        </span>
                    }
                  </div>
                )}
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                  Map coordinates may be inaccurate. Pin the exact location on the map to overwrite the address field with the correct address.
                </p>

                {/* Search → auto-fills address below */}
                <div className="profile-form-field" style={{ marginTop: '1rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem', display: 'block' }}>
                    Search Address <span style={{ fontWeight: 400 }}>(auto-fills the field below)</span>
                  </label>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input
                      type="text"
                      value={addrSearch}
                      onChange={handleAddrSearchChange}
                      onBlur={() => setTimeout(() => setAddrShowSug(false), 200)}
                      onFocus={() => addrSuggestions.length > 0 && setAddrShowSug(true)}
                      placeholder="Type a street, barangay, or landmark…"
                      style={{ width: '100%', paddingRight: '2.2rem', boxSizing: 'border-box' }}
                    />
                    <span style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--gray)' }}>
                      {addrSearching
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite', display: 'block' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      }
                    </span>
                    {addrShowSug && addrSuggestions.length > 0 && (
                      <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', margin: '4px 0 0', padding: '0.25rem 0', listStyle: 'none', zIndex: 200, maxHeight: '220px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                        {addrSuggestions.map((s, i) => (
                          <li
                            key={i}
                            onMouseDown={() => handleAddrSuggestionSelect(s)}
                            style={{ padding: '0.55rem 0.85rem', fontSize: '0.8125rem', color: 'var(--gray-light)', cursor: 'pointer', borderBottom: i < addrSuggestions.length - 1 ? '1px solid var(--border)' : 'none' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--dark3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            {s.title ? (
                              <>
                                <div style={{ fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.subtitle}</div>
                              </>
                            ) : s.display_name}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!addrSearching && addrSearch.length >= 3 && !addrShowSug && addrSuggestions.length === 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', margin: '4px 0 0', padding: '0.75rem 0.875rem', fontSize: '0.8125rem', color: 'var(--gray)', zIndex: 200 }}>
                        No results. Try a more specific address with correct spelling.
                      </div>
                    )}
                  </div>
                </div>

                {/* Store Address — structured by-fields (auto-fills from search/pin, editable) */}
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.5rem', display: 'block' }}>
                    Store Address <span style={{ fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 400 }}>(displayed to customers — auto-fills from the search/pin, editable)</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {[
                      ['house_number', 'House/Unit/Bldg No.', 'e.g. 168'],
                      ['street', 'Street', 'e.g. General Luis St.'],
                      ['barangay', 'Barangay', 'e.g. Nagkaisang Nayon'],
                      ['city', 'City / Municipality', 'e.g. Quezon City'],
                      ['province', 'Province / Region', 'e.g. Metro Manila'],
                      ['zip', 'ZIP Code', 'e.g. 1117'],
                    ].map(([key, lbl, ph]) => (
                      <div className="profile-form-field" key={key}>
                        <label>{lbl}</label>
                        <input
                          type="text"
                          value={shippingForm.storeAddressParts?.[key] || ''}
                          onChange={e => setShippingForm(f => {
                            const sp = { ...(f.storeAddressParts || {}), [key]: key === 'zip' ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value };
                            return { ...f, storeAddressParts: sp, storeAddress: combineStoreAddress(sp) };
                          })}
                          placeholder={ph}
                          maxLength={key === 'zip' ? 4 : 100}
                        />
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.72rem', color: 'var(--gray)' }}>
                    Full address (shown to customers): <span style={{ color: 'var(--gray-light)' }}>{shippingForm.storeAddress || '—'}</span>
                  </p>
                </div>
                </div>
              </div>

              {/* Shipping Rates */}
              <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Shipping Rate</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Choose how shipping is calculated at checkout.</span>
                </div>
                <div style={{ padding: '1.5rem' }}>
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.8125rem', color: 'var(--gray)', display: 'none' }}>
                  Choose how shipping is calculated at checkout.
                </p>

                {/* Mode toggle */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                  {[
                    { id: 'courier_booked', label: 'Courier Booked', sub: 'No system fee — you book on-demand' },
                    { id: 'distance', label: 'Distance-based', sub: 'Base + ₱/km via OSRM route' },
                    { id: 'flat',     label: 'Flat Rate',      sub: 'Fixed by Metro / Non-Metro' },
                  ].map(({ id, label, sub }) => {
                    const active = shippingForm.shippingMode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setShippingForm(f => ({ ...f, shippingMode: id }))}
                        style={{
                          flex: 1, padding: '0.75rem 1rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                          border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                          background: active ? 'rgba(212,168,67,0.08)' : 'var(--dark)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: active ? 'var(--gold)' : 'var(--white)', marginBottom: '0.2rem' }}>{label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* One fee for the artwork, set once for the whole store. A design costs
                    what it costs to draw - it is not worth more because it ends up on a
                    mug rather than a totebag - so this is charged ONCE per order however
                    many customised products share the same artwork. A product can still
                    override it for genuinely harder work. */}
                <div style={{ maxWidth: '480px', marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gray-light)', marginBottom: '0.35rem' }}>
                    Design fee (₱)
                  </label>
                  <input
                    type="text" inputMode="decimal" maxLength={7}
                    value={shippingForm.designRequestFee ?? ''}
                    onChange={e => setShippingForm(f => ({ ...f, designRequestFee: e.target.value.replace(/[^0-9.]/g, '') }))}
                    placeholder="100.00"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark2)', color: 'var(--white)', fontSize: '0.9rem' }}
                  />
                  <p style={{ fontSize: '0.72rem', color: 'var(--gray)', margin: '0.35rem 0 0', lineHeight: 1.5 }}>
                    Charged once per order when a customer asks you to create the artwork -
                    not per product. Three items sharing one design are still one fee.
                  </p>
                </div>

                {shippingForm.shippingMode === 'courier_booked' && (
                  <div style={{ maxWidth: '560px', padding: '1rem 1.25rem', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--gray-light)', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: '0.4rem' }}>No system-calculated shipping fee</div>
                    Checkout shows <em>“Shipping: arranged after order.”</em> Customers pay only the item total upfront.
                    After an order comes in, you book your courier (Lalamove / Grab) using the customer’s pinned drop-off —
                    the order page gives you one-tap <strong>Google Maps / Waze / copy-coordinates</strong> links. You can then
                    add the real courier fee to the order, and the customer’s total updates. Recommended when you have no
                    partnered logistics.
                  </div>
                )}

                {shippingForm.shippingMode === 'distance' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '480px' }}>
                      <div className="profile-form-field">
                        <label>Base Rate (₱) <span className="required">*</span></label>
                        <input
                          type="text" inputMode="decimal"
                          value={shippingForm.shippingBaseRate}
                          onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setShippingForm(f => ({ ...f, shippingBaseRate: v })); }}
                          placeholder="50"
                        />
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.25rem' }}>Flat fee regardless of distance</div>
                      </div>
                      <div className="profile-form-field">
                        <label>Per km Rate (₱) <span className="required">*</span></label>
                        <input
                          type="text" inputMode="decimal"
                          value={shippingForm.shippingPerKmRate}
                          onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setShippingForm(f => ({ ...f, shippingPerKmRate: v })); }}
                          placeholder="15"
                        />
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.25rem' }}>Added per kilometer of distance</div>
                      </div>
                    </div>
                    {shippingForm.shippingBaseRate && shippingForm.shippingPerKmRate && (
                      <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.8125rem', color: 'var(--gray-light)' }}>
                        Example — 5 km:{' '}<strong style={{ color: 'var(--white)' }}>₱{(parseFloat(shippingForm.shippingBaseRate || 0) + parseFloat(shippingForm.shippingPerKmRate || 0) * 5).toFixed(2)}</strong>
                        {' '}· 10 km:{' '}<strong style={{ color: 'var(--white)' }}>₱{(parseFloat(shippingForm.shippingBaseRate || 0) + parseFloat(shippingForm.shippingPerKmRate || 0) * 10).toFixed(2)}</strong>
                      </div>
                    )}
                  </>
                )}

                {shippingForm.shippingMode === 'flat' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '480px' }}>
                    <div className="profile-form-field">
                      <label>Inside Metro Manila (₱) <span className="required">*</span></label>
                      <input
                        type="text" inputMode="decimal"
                        value={shippingForm.flatRateInsideMetro}
                        onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setShippingForm(f => ({ ...f, flatRateInsideMetro: v })); }}
                        placeholder="150"
                      />
                      <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.25rem' }}>NCR / Metro Manila cities</div>
                    </div>
                    <div className="profile-form-field">
                      <label>Outside Metro Manila (₱) <span className="required">*</span></label>
                      <input
                        type="text" inputMode="decimal"
                        value={shippingForm.flatRateOutsideMetro}
                        onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setShippingForm(f => ({ ...f, flatRateOutsideMetro: v })); }}
                        placeholder="250"
                      />
                      <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.25rem' }}>All other provinces</div>
                    </div>
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

              <div style={{
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem',
                background: 'var(--dark2)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '1rem 1.25rem', flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--gray)', marginRight: 'auto' }}>
                  Changes apply to checkout immediately after saving.
                </span>
                <button
                  type="button"
                  onClick={handleSaveShipping}
                  disabled={isSavingShipping}
                  style={{
                    padding: '0.7rem 1.75rem',
                    background: isSavingShipping ? 'var(--dark3)' : 'var(--gold)',
                    border: 'none', borderRadius: '8px',
                    color: isSavingShipping ? 'var(--gray)' : 'var(--black)',
                    fontSize: '0.875rem', fontWeight: 700,
                    cursor: isSavingShipping ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
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
            </div>

          )}

          {activeTab === 'notifications' && (
            <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Notifications</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Preferences are stored on this device.</span>
              </div>
              <div style={{ padding: '1.5rem' }}>
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
            </div>
          )}

          {activeTab === 'appearance' && (
  <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
    <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray-light)" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Appearance</span>
      <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>— Choose how the dashboard looks to you.</span>
    </div>
    <div style={{ padding: '1.5rem' }}>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {[
        { id: 'dark', label: 'Dark', desc: 'Easy on the eyes in low-light environments', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> },
        { id: 'light', label: 'Light', desc: 'Classic light theme for bright environments', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> },
      ].map(({ id, label, desc, icon }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => { if (!active) toggleTheme(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.125rem', borderRadius: '10px', border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'rgba(212,168,67,0.07)' : 'var(--dark)', cursor: active ? 'default' : 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: active ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${active ? 'rgba(212,168,67,0.3)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: active ? 'var(--gold)' : 'var(--gray)' }}>
              {icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: active ? 'var(--white)' : 'var(--gray-light)' }}>{label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{desc}</div>
            </div>
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${active ? 'var(--gold)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {active && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gold)' }} />}
            </div>
          </button>
        );
      })}
    </div>
    </div>
  </div>
)}

        </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
