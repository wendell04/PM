'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import '../../../components/custom-styles.css';
import '../shop.css';
import AddressBook from '../../../components/profile/AddressBook'; // NEW: Address Book component
import { fetchMyOrders } from '../../../lib/orderTrackingApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { StatusBadge } from '@/lib/shopUtils';
import OrderQuickViewModal from '../../../components/orders/OrderQuickViewModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function getLocalUser() {
  try {
    const raw = localStorage.getItem('auth_user')
      || sessionStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function CustomerProfilePage() {
  const router = useRouter();
  const { currentUser, updateUser, logout, isLoading: authLoading, token } = useAuth();
  const searchParams = useSearchParams();

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    address: '',
  });

  // UI State
  const [activeTab, setActiveTab] = useState(
    () => searchParams?.get('tab') || 'overview'
  );
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileSnapshot, setProfileSnapshot] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    newPass: false,
    confirm: false,
  });

  // Avatar state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarHover, setAvatarHover] = useState(false);

  // Orders state
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Order Requests widget state (for Orders tab)
  const [recentOrders, setRecentOrders] = useState([]);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [widgetError, setWidgetError] = useState('');

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [revokingId, setRevokingId] = useState(null);
  const [revokeAllLoading, setRevokeAllLoading] = useState(false);
  const [sessionsSuccess, setSessionsSuccess] = useState('');
  const [deviceTokens, setDeviceTokens]       = useState([]);
  const [revokingDevice, setRevokingDevice]   = useState(null);
  const [deviceError, setDeviceError]         = useState('');

  // Ref to track if tab has mounted (to prevent reset on initial mount)
  const hasTabMounted = useRef(false);

  // Auth guard + role guard + populate form + fetch orders
  useEffect(() => {
    const localUser = getLocalUser();

    // Redirect only when auth fully resolved
    // AND no user in storage at all
    if (!authLoading && !currentUser && !localUser) {
      router.push('/');
      return;
    }

    // Use currentUser if available, else localUser
    const user = currentUser || localUser;

    if (!user) return;

    // Role guard
    if (user.role === 'admin' || user.role === 'owner') {
      router.push('/dashboard/business');
      return;
    }

    // Populate form
    setProfileForm({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phoneNumber: user.phoneNumber || '',
      address: user.address || '',
    });
  }, [currentUser, authLoading, router]);

  // Reset password form when switching away from Security tab
  useEffect(() => {
    if (!hasTabMounted.current) {
      hasTabMounted.current = true;
      return;
    }
    if (activeTab !== 'security') {
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setPasswordError('');
      setPasswordSuccess('');
    }
  }, [activeTab]);

  // Fetch orders when Orders tab is activated
  useEffect(() => {
    if (activeTab !== 'orders') return;
    if (!token) return;

    const load = async () => {
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const data = await fetchMyOrders(token);
        setOrders(data.data || data || []);
      } catch (err) {
        setOrdersError(err.message || 'Failed to load orders.');
      } finally {
        setOrdersLoading(false);
      }
    };

    load();
  }, [activeTab, token]);

  // Fetch order requests for Orders tab widget
  useEffect(() => {
    if (activeTab !== 'orders') return;
    if (!token) return;

    const loadWidget = async () => {
      setWidgetLoading(true);
      setWidgetError('');
      try {
        const data = await fetchMyOrders(token);
        const list = Array.isArray(data) ? data : [];
        setRecentOrders(list.slice(0, 3));
      } catch (err) {
        setWidgetError(err.message || 'Failed to load orders.');
      } finally {
        setWidgetLoading(false);
      }
    };

    loadWidget();
  }, [activeTab, token]);

  // Fetch sessions when Security tab is activated
  useEffect(() => {
    if (activeTab !== 'security') return;
    if (!token) return;

    const loadSessions = async () => {
      setSessionsLoading(true);
      setSessionsError('');
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 30000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message
          || 'Failed to load sessions');
        setSessions(data.sessions || []);
      } catch (err) {
        setSessionsError(err.message
          || 'Failed to load sessions');
      } finally {
        setSessionsLoading(false);
      }
    };

    loadSessions();
    // Populate device tokens from stored user
    const raw = localStorage.getItem('auth_user')
      || sessionStorage.getItem('auth_user');
    try {
      const u = raw ? JSON.parse(raw) : null;
      setDeviceTokens(Array.isArray(u?.device_tokens) ? u.device_tokens : []);
    } catch { setDeviceTokens([]); }
  }, [activeTab, token]);

  const handleProfileChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setSaveError('');
  };

  const handleSaveProfile = async () => {
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      setSaveError('First name and last name are required');
      return;
    }
    if (!profileForm.phoneNumber.trim()) {
      setSaveError('Phone number is required');
      return;
    }
    if (!profileForm.address.trim() || profileForm.address.trim().length < 3) {
      setSaveError('Address is required (min 3 characters)');
      return;
    }

    setIsSaving(true);
    setSaveError('');

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: profileForm.firstName.trim(),
          lastName: profileForm.lastName.trim(),
          phoneNumber: profileForm.phoneNumber.trim(),
          address: profileForm.address.trim(),
        }),
      }, 15000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update profile');
      updateUser(data.data || data);
      setIsEditingProfile(false);
      setSaveSuccess('Profile updated successfully!');
      setTimeout(() => setSaveSuccess(''), 2500);
    } catch (err) {
      setSaveError(err.message || 'An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/profile/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          password: passwordForm.newPassword,
          password_confirmation: passwordForm.confirmPassword,
        }),
      }, 15000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update password');
      setPasswordSuccess('Password changed! Redirecting to login...');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_user');
        sessionStorage.setItem('sessionExpired', 'true');
        router.replace('/');
      }, 2000);
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setAvatarError('Only JPG, PNG, or WEBP files are allowed.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Image must be under 2MB.');
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError('');

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetchWithTimeout(
        `${API_URL}/api/profile/upload-avatar`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
        30000
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Upload failed.');
      }

      const avatarUrl = data.data?.avatar;
      if (!avatarUrl) {
        throw new Error('No avatar URL returned.');
      }

      updateUser({ avatar: avatarUrl });
      window.dispatchEvent(new CustomEvent('pmp_user_updated'));
      setProfileForm(prev => ({ ...prev, avatar: avatarUrl }));
      setAvatarError('');

    } catch (err) {
      setAvatarError(err.message || 'Upload failed. Try again.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleEditProfile = () => {
    setProfileSnapshot({ ...profileForm });
    setIsEditingProfile(true);
    setActiveTab('personal');
  };

  const handleCancelEdit = () => {
    if (profileSnapshot) {
      setProfileForm(profileSnapshot);
    }
    setIsEditingProfile(false);
    setSaveError('');
  };

  const handleRevokeSession = async (sessionId) => {
    setRevokingId(sessionId);
    setSessionsError('');
    setSessionsSuccess('');
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/sessions/${sessionId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
        15000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message
        || 'Failed to revoke session');
      setSessions(prev =>
        prev.filter(s => s.id !== sessionId));
      setSessionsSuccess('Session revoked.');
      setTimeout(() => setSessionsSuccess(''), 3000);
    } catch (err) {
      setSessionsError(err.message
        || 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    setRevokeAllLoading(true);
    setSessionsError('');
    setSessionsSuccess('');
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/sessions/others/all`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
        15000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message
        || 'Failed to revoke sessions');
      setSessions(prev => prev.filter(s => s.is_current));
      setSessionsSuccess('All other sessions revoked.');
      setTimeout(() => setSessionsSuccess(''), 3000);
    } catch (err) {
      setSessionsError(err.message
        || 'Failed to revoke sessions');
    } finally {
      setRevokeAllLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceToken) => {
    setRevokingDevice(deviceToken);
    setDeviceError('');
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/2fa/device/${encodeURIComponent(deviceToken)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        10000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to remove device.');
      setDeviceTokens(prev => prev.filter(entry => {
        const t = typeof entry === 'string' ? entry : entry?.token;
        return t !== deviceToken;
      }));
      // Update stored user so device list stays consistent
      try {
        const key = localStorage.getItem('auth_user') ? 'localStorage' : 'sessionStorage';
        const storage = key === 'localStorage' ? localStorage : sessionStorage;
        const raw = storage.getItem('auth_user');
        if (raw) {
          const u = JSON.parse(raw);
          u.device_tokens = (u.device_tokens ?? []).filter(entry => {
            const t = typeof entry === 'string' ? entry : entry?.token;
            return t !== deviceToken;
          });
          storage.setItem('auth_user', JSON.stringify(u));
        }
      } catch {}
    } catch (err) {
      setDeviceError(err.message || 'Failed to remove device.');
    } finally {
      setRevokingDevice(null);
    }
  };

  const formatMemberSince = (dateStr) => {
    if (!dateStr) return 'Member since Recently';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Member since Recently';
    return `Member since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
  };

  const getOrderId = (order) => {
    if (order.orderId) return `#${order.orderId}`;
    if (order._id) return `#${order._id.slice(-8).toUpperCase()}`;
    return '#Unknown';
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
      { label: 'Too Weak',    color: 'var(--red)', width: '20%'  },
      { label: 'Weak',        color: 'var(--red)', width: '40%'  },
      { label: 'Fair',        color: 'var(--gold)', width: '60%'  },
      { label: 'Strong',      color: 'var(--green)', width: '80%'  },
      { label: 'Very Strong', color: 'var(--green)', width: '100%' },
    ];
    const current = levels[score - 1]
      || { label: 'Too Weak', color: 'var(--red)', width: '20%' };
    return current;
  };

  // Render loading state
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--darker)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--darker)' }}>
      {/* Back to Shop - standalone below global navbar */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0.75rem 2rem 0',
      }}>
        <Link href="/shop" className="back-to-shop-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Shop
        </Link>
      </div>

      {/* Main Content */}
      <main className="profile-layout" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', display: 'flex', gap: '2rem', flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* LEFT: Profile Card */}
        <aside style={{
          width: '260px',
          flexShrink: 0,
          background: 'var(--dark2)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '1.5rem',
          position: 'sticky',
          top: '5rem',
          height: 'fit-content',
        }}>
          {/* Avatar */}
          <div
            style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 1rem' }}
            onMouseEnter={() => setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}
          >
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt="avatar"
                style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'var(--gold)',
                color: 'var(--black)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '2rem',
              }}>
                {currentUser?.firstName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            )}
            {avatarHover && !isUploadingAvatar && (
              <label
                htmlFor="avatar-upload"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '40%',
                  borderBottomLeftRadius: '999px',
                  borderBottomRightRadius: '999px',
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--white)" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </label>
            )}
            {!avatarHover && !isUploadingAvatar && (
              <label
                htmlFor="avatar-upload"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: '2px solid var(--dark2)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--black)" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </label>
            )}
            {isUploadingAvatar && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid var(--dark2)',
                }}
              >
                <span className="spinner" style={{ width: '12px', height: '12px' }} />
              </div>
            )}
            <input
              id="avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              disabled={isUploadingAvatar}
              onChange={handleAvatarUpload}
            />
          </div>

          {/* Name */}
          <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--white)' }}>
              {currentUser?.firstName || ''} {currentUser?.lastName || ''}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
              {currentUser?.email || ''}
            </div>
          </div>

          {/* Role Badge and Member Since */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            marginTop: '8px',
          }}>
            {/* Role Badge */}
            {(() => {
              const role = (currentUser?.role || 'customer').toLowerCase();
              const badgeStyles = {
                admin: {
                  background: 'var(--red)',
                  color: 'var(--white)',
                  border: '1px solid var(--red)',
                },
                seller: {
                  background: 'var(--gold)',
                  color: 'var(--black)',
                  border: '1px solid var(--gold)',
                },
                customer: {
                  background: 'transparent',
                  color: 'var(--gray)',
                  border: '1px solid var(--border)',
                },
              };
              const style = badgeStyles[role] || badgeStyles.customer;
              return (
                <span style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  borderRadius: '999px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  ...style,
                }}>
                  {role}
                </span>
              );
            })()}

            {/* Member Since */}
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
              {formatMemberSince(currentUser?.createdAt || currentUser?.lastLogin)}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border)', margin: '1.25rem 0' }} />

          {/* Navigation Buttons */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('overview')}
              className={`profile-nav-item${activeTab === 'overview' ? ' active' : ''}`}
              style={{
                padding: '0.625rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Overview
            </button>
            <button
              onClick={() => setActiveTab('personal')}
              className={`profile-nav-item${activeTab === 'personal' ? ' active' : ''}`}
              style={{
                padding: '0.625rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Personal Info
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`profile-nav-item${activeTab === 'security' ? ' active' : ''}`}
              style={{
                padding: '0.625rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Security
            </button>
            <button
              onClick={() => setActiveTab('addresses')}
              className={`profile-nav-item${activeTab === 'addresses' ? ' active' : ''}`}
              style={{
                padding: '0.625rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Addresses
            </button>
            <button
              onClick={() => { setActiveTab('orders'); setSelectedOrder(null); }}
              className={`profile-nav-item${activeTab === 'orders' ? ' active' : ''}`}
              style={{
                padding: '0.625rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              My Orders
              {orders.length > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '1px 7px',
                  borderRadius: '999px',
                  background: activeTab === 'orders'
                    ? 'rgba(0,0,0,0.2)'
                    : 'rgba(212,168,67,0.15)',
                  color: activeTab === 'orders'
                    ? 'var(--black)'
                    : 'var(--gold)',
                  border: activeTab === 'orders'
                    ? 'none'
                    : '1px solid rgba(212,168,67,0.3)',
                }}>
                  {orders.length}
                </span>
              )}
            </button>
          </nav>
        </aside>

        {/* RIGHT: Tab Content */}
        <section style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            background: 'var(--dark2)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '2rem',
          }}>
            {/* TAB 1: Overview */}
            {activeTab === 'overview' && (
              <div>
                <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', color: 'var(--white)' }}>Profile Overview</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>First Name</div>
                    <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.firstName || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Last Name</div>
                    <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.lastName || '—'}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Email</div>
                    <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.email || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Phone</div>
                    <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.phoneNumber || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Address</div>
                    <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.address || '—'}</div>
                  </div>
                </div>
                {/* Edit action lives in Personal Info tab only — removed from Overview */}

                {/* Recent Orders Widget */}
                <div style={{
                  marginTop: '2rem',
                  borderTop: '1px solid var(--border)',
                  paddingTop: '1.5rem',
                }}>
                  <h4 style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--white)',
                    marginBottom: '0.75rem',
                  }}>
                    Recent Orders
                  </h4>

                  {orders.length === 0 ? (
                    <p style={{
                      fontSize: '0.8rem',
                      color: 'var(--gray)',
                    }}>
                      No orders yet.
                    </p>
                  ) : (
                    orders.slice(0, 2).map(order => (
                      <div key={order._id || order.orderId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.625rem 0',
                          borderBottom: '1px solid var(--border)',
                        }}>
                        <span style={{
                          fontSize: '0.8rem',
                          color: 'var(--gray)',
                        }}>
                          {getOrderId(order)}
                        </span>
                        <StatusBadge status={order.orderStatus || order.status} />
                      </div>
                    ))
                  )}

                  {orders.length > 2 && (
                    <button
                      onClick={() => setActiveTab('orders')}
                      style={{
                        marginTop: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--gold)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      View all orders →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Personal Info */}
            {activeTab === 'personal' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--white)' }}>Personal Information</h2>
                  {!isEditingProfile ? (
                    <button
                      onClick={handleEditProfile}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--white)',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >
                      Edit Profile
                    </button>
                  ) : (
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--gray)',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel Editing
                    </button>
                  )}
                </div>

                {saveSuccess && (
                  <div style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--gold)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    {saveSuccess}
                  </div>
                )}

                {saveError && (
                  <div style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--red)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {saveError}
                  </div>
                )}

                {!isEditingProfile ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>First Name</div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.firstName || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Last Name</div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.lastName || '—'}</div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Email</div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.email || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Phone</div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.phoneNumber || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Address</div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--white)' }}>{profileForm.address || '—'}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                        First Name <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={profileForm.firstName}
                        onChange={(e) => handleProfileChange('firstName', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          background: 'var(--dark)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--white)',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                        Last Name <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={profileForm.lastName}
                        onChange={(e) => handleProfileChange('lastName', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          background: 'var(--dark)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--white)',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                        Email Address <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>(cannot be changed)</span>
                      </label>
                      <input
                        type="email"
                        value={profileForm.email}
                        disabled
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          background: 'var(--dark3)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--gray)',
                          fontSize: '0.875rem',
                          cursor: 'not-allowed',
                          opacity: 0.6,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                          Phone Number <span style={{ color: 'var(--red)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={profileForm.phoneNumber}
                          onChange={(e) => handleProfileChange('phoneNumber', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            background: 'var(--dark)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            color: 'var(--white)',
                            fontSize: '0.875rem',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                          Address <span style={{ color: 'var(--red)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={profileForm.address}
                          onChange={(e) => handleProfileChange('address', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            background: 'var(--dark)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            color: 'var(--white)',
                            fontSize: '0.875rem',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          padding: '0.625rem 1.25rem',
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--gray)',
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        style={{
                          padding: '0.625rem 1.5rem',
                          background: isSaving ? 'var(--dark3)' : 'var(--gold)',
                          border: 'none',
                          borderRadius: '8px',
                          color: isSaving ? 'var(--gray)' : 'var(--black)',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Security */}
            {activeTab === 'security' && (
              <div style={{ maxWidth: '500px' }}>
                <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.25rem', color: 'var(--white)' }}>Change Password</h2>

                <div style={{
                  padding: '1rem',
                  background: 'rgba(212, 168, 67, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(212, 168, 67, 0.3)',
                  marginBottom: '1.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <strong style={{ color: 'var(--gold)' }}>Password Security</strong>
                  </div>
                  <p style={{ fontSize: '0.85rem', opacity: 0.8, margin: 0 }}>
                    Change it regularly to keep your account safe.
                  </p>
                </div>

                {passwordError && (
                  <div style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--red)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--gold)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    {passwordSuccess}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                      Current Password <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPasswords.current ? 'text' : 'password'}
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          paddingRight: '3rem',
                          background: 'var(--dark)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--white)',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--gray)',
                          cursor: 'pointer',
                          padding: '0.25rem',
                        }}
                      >
                        {showPasswords.current ? (
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
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                      New Password <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPasswords.newPass ? 'text' : 'password'}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          paddingRight: '3rem',
                          background: 'var(--dark)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--white)',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, newPass: !showPasswords.newPass })}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--gray)',
                          cursor: 'pointer',
                          padding: '0.25rem',
                        }}
                      >
                        {showPasswords.newPass ? (
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
                    {passwordForm.newPassword.length > 0 && (
                      <div style={{
                        marginTop: '0.5rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '0.75rem',
                      }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                        }}>
                          {[
                            {
                              label: 'At least 8 characters',
                              pass: passwordForm.newPassword.length >= 8,
                            },
                            {
                              label: 'One uppercase letter',
                              pass: /[A-Z]/.test(passwordForm.newPassword),
                            },
                            {
                              label: 'One lowercase letter',
                              pass: /[a-z]/.test(passwordForm.newPassword),
                            },
                            {
                              label: 'One number',
                              pass: /\d/.test(passwordForm.newPassword),
                            },
                            {
                              label: 'One special character',
                              pass: /[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword),
                            },
                          ].map((c, i) => (
                            <div key={i} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              fontSize: '0.78rem',
                              color: c.pass
                                ? 'var(--green)'
                                : 'var(--gray)',
                              transition: 'color 0.2s',
                            }}>
                              {c.pass ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12"/></svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.3}}><circle cx="12" cy="12" r="2"/></svg>
                              )}
                              {c.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(() => {
                      if (!passwordForm.newPassword) return null;
                      const strength = getPasswordStrength(passwordForm.newPassword);
                      if (!strength) return null;
                      return (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{
                            height: '4px',
                            borderRadius: '2px',
                            background: 'var(--border)',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%',
                              width: strength.width,
                              background: strength.color,
                              transition: 'width 0.3s ease',
                              borderRadius: '2px',
                            }} />
                          </div>
                          <span style={{
                            fontSize: '0.7rem',
                            color: strength.color,
                            marginTop: '4px',
                            display: 'block',
                          }}>
                            {strength.label}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                      Confirm New Password <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPasswords.confirm ? 'text' : 'password'}
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          paddingRight: '3rem',
                          background: 'var(--dark)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--white)',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--gray)',
                          cursor: 'pointer',
                          padding: '0.25rem',
                        }}
                      >
                        {showPasswords.confirm ? (
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
                  </div>

                  <button
                    onClick={handleSavePassword}
                    disabled={isSavingPassword}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem 1.5rem',
                      background: isSavingPassword ? 'var(--gray)' : 'var(--gold)',
                      border: 'none',
                      borderRadius: '8px',
                      color: isSavingPassword ? 'var(--dark)' : 'var(--black)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: isSavingPassword ? 'not-allowed' : 'pointer',
                      width: 'fit-content',
                    }}
                  >
                    {isSavingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>

                {/* Active Sessions Section */}
                <div style={{
                  marginTop: '2.5rem',
                  paddingTop: '2rem',
                  borderTop: '1px solid var(--border)',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1.25rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}>
                    <div>
                      <h3 style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--white)',
                      }}>
                        Active Sessions
                      </h3>
                      <p style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.8rem',
                        color: 'var(--gray)',
                      }}>
                        Devices currently logged into your account.
                      </p>
                    </div>
                    {sessions.filter(s => !s.is_current).length > 0 && (
                      <button
                        onClick={handleRevokeAllOthers}
                        disabled={revokeAllLoading}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: '8px',
                          color: 'var(--red)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: revokeAllLoading
                            ? 'not-allowed' : 'pointer',
                          opacity: revokeAllLoading ? 0.6 : 1,
                          transition: 'all 0.2s',
                        }}
                      >
                        {revokeAllLoading
                          ? 'Revoking...'
                          : 'Revoke All Others'}
                      </button>
                    )}
                  </div>

                  {sessionsSuccess && (
                    <div style={{
                      marginBottom: '1rem',
                      padding: '0.75rem 1rem',
                      background: 'rgba(74,222,128,0.08)',
                      border: '1px solid rgba(74,222,128,0.25)',
                      borderRadius: '8px',
                      color: 'var(--green)',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {sessionsSuccess}
                    </div>
                  )}

                  {sessionsError && (
                    <div style={{
                      marginBottom: '1rem',
                      padding: '0.75rem 1rem',
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: '8px',
                      color: 'var(--red)',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      {sessionsError}
                    </div>
                  )}

                  {sessionsLoading ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}>
                      {[1, 2].map(i => (
                        <div key={i} style={{
                          padding: '1rem',
                          background: 'var(--dark)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          height: '72px',
                          animation: 'pulse 1.5s ease-in-out infinite',
                        }}/>
                      ))}
                    </div>
                  ) : sessions.length === 0 ? (
                    <div style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: 'var(--gray)',
                      fontSize: '0.85rem',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                    }}>
                      No active sessions found.
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}>
                      {sessions.map(session => (
                        <div
                          key={session.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '1rem 1.25rem',
                            background: session.is_current
                              ? 'rgba(212,168,67,0.06)'
                              : 'var(--dark)',
                            border: session.is_current
                              ? '1px solid rgba(212,168,67,0.25)'
                              : '1px solid var(--border)',
                            borderRadius: '10px',
                            gap: '1rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.875rem',
                            flex: 1,
                            minWidth: 0,
                          }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              background: session.is_current
                                ? 'rgba(212,168,67,0.15)'
                                : 'rgba(255,255,255,0.05)',
                              border: session.is_current
                                ? '1px solid rgba(212,168,67,0.3)'
                                : '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              color: session.is_current
                                ? 'var(--gold)'
                                : 'var(--gray)',
                            }}>
                              <svg width="18" height="18"
                                viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round">
                                <rect x="2" y="3" width="20"
                                  height="14" rx="2" ry="2"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                                <line x1="12" y1="17" x2="12" y2="21"/>
                              </svg>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                flexWrap: 'wrap',
                              }}>
                                <span style={{
                                  fontSize: '0.875rem',
                                  fontWeight: 600,
                                  color: 'var(--white)',
                                  textTransform: 'capitalize',
                                }}>
                                  {session.name || 'Web Session'}
                                </span>
                                {session.is_current && (
                                  <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    padding: '1px 7px',
                                    borderRadius: '999px',
                                    background: 'rgba(212,168,67,0.15)',
                                    color: 'var(--gold)',
                                    border: '1px solid rgba(212,168,67,0.3)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}>
                                    Current
                                  </span>
                                )}
                              </div>
                              <div style={{
                                fontSize: '0.75rem',
                                color: 'var(--gray)',
                                marginTop: '0.2rem',
                              }}>
                                Last active: {session.last_used_at}
                                {' · '}
                                Since: {session.created_at}
                              </div>
                            </div>
                          </div>

                          {!session.is_current && (
                            <button
                              onClick={() =>
                                handleRevokeSession(session.id)}
                              disabled={revokingId === session.id}
                              style={{
                                padding: '0.4rem 0.875rem',
                                background: 'transparent',
                                border: '1px solid rgba(239,68,68,0.35)',
                                borderRadius: '7px',
                                color: 'var(--red)',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: revokingId === session.id
                                  ? 'not-allowed' : 'pointer',
                                opacity: revokingId === session.id
                                  ? 0.5 : 1,
                                flexShrink: 0,
                                transition: 'all 0.2s',
                              }}
                            >
                              {revokingId === session.id
                                ? 'Revoking...' : 'Revoke'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2FA status + connected devices — inside Security tab */}
            {activeTab === 'security' && (
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
                  gap: '0.5rem',
                }}>
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
                      background: 'rgba(74,222,128,0.12)',
                      color: 'var(--green)',
                    }}>
                      Active
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray-light)' }}>
                    Email verification is required at every login. A one-time
                    code is sent to your registered email address.
                  </p>
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

                  {deviceError && (
                    <div style={{
                      marginBottom: '0.75rem',
                      padding: '0.625rem 0.875rem',
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: '8px',
                      color: 'var(--red)',
                      fontSize: '0.8rem',
                    }}>
                      {deviceError}
                    </div>
                  )}

                  {deviceTokens.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray)' }}>
                      No trusted devices recorded for this account.
                    </p>
                  ) : (
                    <ul style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}>
                      {deviceTokens.map((entry) => {
                        const tokenStr = typeof entry === 'string'
                          ? entry : (entry?.token ?? '');
                        const short = tokenStr.length > 12
                          ? `${tokenStr.slice(0, 12)}...`
                          : (tokenStr || '(unknown)');
                        const addedAt = entry?.created_at
                          ? new Date(entry.created_at).toLocaleDateString(
                              'en-US', { month: 'short', day: 'numeric', year: 'numeric' }
                            )
                          : null;
                        return (
                          <li
                            key={tokenStr || JSON.stringify(entry)}
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
                            <div>
                              <code style={{
                                fontSize: '0.78rem',
                                color: 'var(--gray-light)',
                                wordBreak: 'break-all',
                              }}>
                                {short}
                              </code>
                              {addedAt && (
                                <div style={{
                                  fontSize: '0.7rem',
                                  color: 'var(--gray)',
                                  marginTop: '0.2rem',
                                }}>
                                  Added {addedAt}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleRevokeDevice(tokenStr)}
                              disabled={revokingDevice === tokenStr}
                              style={{
                                flexShrink: 0,
                                padding: '0.375rem 0.75rem',
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.25)',
                                borderRadius: '6px',
                                color: 'var(--red)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: revokingDevice === tokenStr
                                  ? 'not-allowed' : 'pointer',
                                opacity: revokingDevice === tokenStr ? 0.6 : 1,
                                transition: 'opacity 0.15s',
                              }}
                            >
                              {revokingDevice === tokenStr ? 'Removing...' : 'Remove'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: Addresses */}
            {activeTab === 'addresses' && <AddressBook />}

            {/* TAB 5: My Orders */}
            {activeTab === 'orders' && (
              <div>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--white)' }}>Recent Order Requests</h2>
                  <Link href="/shop/orders" style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>View All →</Link>
                </div>

                {/* Loading */}
                {widgetLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {[1, 2, 3].map(i => (
                      <div key={i} style={{ padding: '1rem', background: 'var(--dark)', borderRadius: '8px', border: '1px solid var(--border)', animation: 'pulse 1.5s ease-in-out infinite' }}>
                        <div style={{ height: '14px', background: 'var(--dark3)', borderRadius: '4px', width: '40%', marginBottom: '0.5rem' }} />
                        <div style={{ height: '12px', background: 'var(--dark3)', borderRadius: '4px', width: '60%' }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Error */}
                {widgetError && !widgetLoading && (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--red)' }}>
                    <p style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>Failed to load orders.</p>
                    <button onClick={() => { setWidgetError(''); setWidgetLoading(true); if (!token) return; fetchMyOrders(token).then(data => { const list = Array.isArray(data) ? data : []; setRecentOrders(list.slice(0, 3)); setWidgetError(''); }).catch(err => { setWidgetError(err.message); }).finally(() => { setWidgetLoading(false); }); }} style={{ background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
                  </div>
                )}

                {/* Empty */}
                {!widgetLoading && !widgetError && recentOrders.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--white)', marginBottom: '0.5rem' }}>No orders yet.</p>
                    <Link href="/shop" style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>Browse Products</Link>
                  </div>
                )}

                {/* Order rows */}
                {!widgetLoading && !widgetError && recentOrders.length > 0 && (
                  <div>
                    {recentOrders.map((order, idx) => (
                      <div key={order._id ?? order.id ?? `order-row-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 0', borderBottom: idx < recentOrders.length - 1 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--white)' }}>{order._id?.slice(-8).toUpperCase()}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.125rem' }}>{order.productName || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <StatusBadge status={order.status} />
                          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: '1rem' }}>
                      <Link href="/shop/orders" style={{ display: 'block', width: '100%', textAlign: 'center', padding: '0.625rem 1rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>View All Order Requests</Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

    </div>
  );
}
