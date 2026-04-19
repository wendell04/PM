'use client';
// TwoFactorModal imported for inline 2FA — no page redirect needed
import TwoFactorModal from '@/components/auth/TwoFactorModal';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCart as useGlobalCart } from '../../context/CartContext';
import { syncCart, mergeCart } from '@/lib/cartApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { forgotPassword, sendResetCode, verifyResetCode, resetPassword } from '@/lib/authApi';
import {
  fetchUnreadCount,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/notificationApi';
import './shop.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Re-export the global useCart for shop pages to use
export { useGlobalCart as useCart };

// ─── Auth Helper ──────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

function getUser() {
  try {
    const raw = localStorage.getItem('auth_user') || sessionStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ─── Cart Conversion Helpers ──────────────────────────────────────────────────
// Convert MongoDB format → Layout format
function toLayoutItem(item) {
  const qty = Math.max(1, parseInt(item.qty) || 1);
  const unitPrice = item.unitPrice || 0;
  return {
    product: {
      _id: item.productId,
      name: item.productName,
      image: item.image,
      thumbnail: item.image,
      price: unitPrice,
      flatPrice: unitPrice,
    },
    variantId: item.variantId || null,
    variantName: item.variantName || null,
    qty,
    unitPrice,
    lineTotal: item.lineTotal || (qty * unitPrice),
  };
}

// Convert Layout format → MongoDB format
function toMongoItem(item) {
  const unitPrice = item.unitPrice || item.product?.flatPrice || item.product?.price || 0;
  const qty = Math.max(1, parseInt(item.qty) || 1);
  const mongo = {
    productId: item.product?.id ?? item.product?._id ?? item.productId,
    productName: item.product?.name || item.productName,
    qty,
    unitPrice,
    lineTotal: qty * unitPrice,
    image: item.product?.image || item.product?.thumbnail || item.image || null,
  };
  if (item.variantId) mongo.variantId = String(item.variantId);
  if (item.variantName) mongo.variantName = String(item.variantName);
  return mongo;
}

// ─── Login Form Component ─────────────────────────────────────────────────────
function LoginForm({ onSuccess, onSwitchToRegister, onForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({ email: '', password: '' });
    setLoading(true);

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }, 15000);

      const data = await res.json();
      if (!res.ok) {
        const authError = new Error('Incorrect email or password.');
        authError.isAuthError = true;
        throw authError;
      }

      onSuccess(data.data.user, data.data.token, rememberMe, data.data.requires_2fa);
    } catch (err) {
      if (err.isAuthError) {
        setErrors({ email: '', password: err.message });
      } else {
        setErrors({ email: '', password: 'Something went wrong. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off">

      <div className="auth-field">
        <label>Email Address</label>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={errors.email ? 'error' : ''}
          required
        />
        {errors.email && <span className="error-message">{errors.email}</span>}
      </div>

      <div className="auth-field">
        <label>Password</label>
        <div className="auth-input-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={errors.password ? 'error' : ''}
            required
          />
          <button type="button" className="auth-eye" onClick={() => setShowPassword(v => !v)}>
            {showPassword ? <EyeOpen /> : <EyeClosed />}
          </button>
        </div>
        {errors.password && <span className="error-message">{errors.password}</span>}
      </div>

      <div className="auth-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <label className="auth-check" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--gray)' }}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--gold)' }}
          />
          <span>Remember Me</span>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '14px', height: '14px', borderRadius: '50%', verticalAlign: 'middle',
              background: 'var(--border)', color: 'var(--gray)', fontSize: '0.65rem',
              cursor: 'help', flexShrink: 0
            }}
            title="Keep you logged in for 30 days. Don't use on shared devices."
          >?</span>
        </label>
        <button
          type="button"
          className="auth-link"
          style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.88rem', textDecoration: 'underline' }}
          onClick={onForgotPassword}
        >
          Forgot Password
        </button>
      </div>

      <button type="submit" className="btn-auth-submit" disabled={loading}>
        {loading ? 'Signing In...' : 'Sign In'}
      </button>

      <p className="auth-switch">
        Don't have an account? <button type="button" onClick={onSwitchToRegister}>Create one</button>
      </p>
    </form>
  );
}

// ─── Password Strength Component ──────────────────────────────────────────────
function PasswordStrength({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*(),.?":{}|<>]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const levels = [
    { label: 'Too Weak',    color: 'var(--red)',   width: '20%'  },
    { label: 'Weak',        color: 'var(--red)',   width: '40%'  },
    { label: 'Fair',        color: 'var(--gold)',  width: '60%'  },
    { label: 'Strong',      color: 'var(--green)', width: '80%'  },
    { label: 'Very Strong', color: 'var(--green)', width: '100%' },
  ];
  const isTooShort = password.length > 0 && password.length < 8;
  const isTooLong = password.length > 32;
  const current = levels[score - 1] || { label: 'Too Weak', color: 'var(--red)', width: '20%' };
  return (
    <div style={{ marginTop: '0.4rem' }}>
      {(isTooShort || isTooLong) && (
        <div style={{ fontSize: '0.7rem', marginBottom: '0.4rem', padding: '0.25rem 0.6rem', borderRadius: '6px',
          background: isTooLong ? 'rgba(239,68,68,0.12)' : 'rgba(249,115,22,0.12)',
          border: `1px solid ${isTooLong ? 'var(--red)' : '#f97316'}`,
          color: isTooLong ? 'var(--red)' : '#f97316' }}>
          {isTooLong ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:'4px'}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>{' '}Too long
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:'4px'}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>{' '}Too short
            </>
          )}
        </div>
      )}
      <div style={{ height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '999px',
          width: isTooLong ? '100%' : current.width,
          background: isTooLong ? 'var(--red)' : current.color,
          transition: 'width 0.3s ease, background 0.3s ease' }}/>
      </div>
      <div style={{ fontSize: '0.72rem', marginTop: '0.25rem', color: isTooLong ? 'var(--red)' : current.color, transition: 'color 0.3s' }}>
        {isTooLong ? 'Too Long — recommended max 32 characters' : current.label}
      </div>
    </div>
  );
}

// ─── Step Indicator Component ─────────────────────────────────────────────────
function StepIndicator({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 1.5rem',
      background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem',
        color: step === 1 ? 'var(--gold)' : 'var(--gray)', fontWeight: '600' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', fontWeight: '700',
          background: step === 1 ? 'var(--gold)' : 'rgba(212,168,67,0.2)',
          color: step === 1 ? 'var(--black)' : 'var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
          {step > 1 ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          ) : '1'}
        </div>
        Fill in Details
      </div>
      <div style={{ flex: 1, height: '2px', borderRadius: '999px', margin: '0 0.25rem',
        background: step > 1 ? 'var(--gold)' : 'var(--border)' }}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem',
        color: step === 2 ? 'var(--gold)' : 'var(--gray)', fontWeight: '600' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', fontWeight: '700',
          background: step === 2 ? 'var(--gold)' : 'var(--border)',
          color: step === 2 ? 'var(--black)' : 'var(--gray)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>2</div>
        Review T&amp;C
      </div>
    </div>
  );
}

// ─── Eye Icons ────────────────────────────────────────────────────────────────
const EyeOpen = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
  </svg>
);
const EyeClosed = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.23 0-2.41.2-3.51.57l2.17 2.17C11.13 7.09 11.56 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
  </svg>
);

// ─── Register Form Component ──────────────────────────────────────────────────
function RegisterForm({ onSuccess, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    firstName: '',
    middleInitial: '',
    lastName: '',
    address: '',
    phoneNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [tAndCModalOpen, setTAndCModalOpen] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const validateField = (field, value) => {
    switch (field) {
      case 'firstName':
        if (!value.trim()) return 'First name is required';
        if (value.trim().length < 2) return 'First name must be at least 2 characters';
        return '';
      case 'middleInitial':
        if (value && !/^[A-Z]{1,2}$/.test(value)) return 'Middle initial must be 1-2 uppercase letters';
        return '';
      case 'lastName':
        if (!value.trim()) return 'Last name is required';
        if (value.trim().length < 2) return 'Last name must be at least 2 characters';
        return '';
      case 'address':
        if (!value.trim()) return 'Address is required';
        if (value.trim().length < 10) return 'Address must be at least 10 characters';
        return '';
      case 'phoneNumber':
        if (!value.trim()) return 'Phone number is required';
        if (!/^(\+63|0)\d{10}$/.test(value.replace(/\s/g, ''))) return 'Please enter a valid Philippine phone number';
        return '';
      case 'email':
        if (!value.trim()) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
        return '';
      case 'password':
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (value.length > 64) return 'Password must not exceed 64 characters';
        if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
        if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter';
        if (!/\d/.test(value)) return 'Password must contain at least one number';
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return 'Password must contain at least one special character';
        return '';
      case 'confirmPassword':
        if (!value) return 'Please confirm your password';
        if (value !== formData.password) return 'Passwords do not match';
        return '';
      case 'agreeToTerms':
        if (!value) return 'You must agree to the Terms and Conditions';
        return '';
      default:
        return '';
    }
  };

  const handleRegisterChange = (field, value) => {
    if (['firstName', 'lastName'].includes(field)) value = value.replace(/[^a-zA-Z\s]/g, '');
    if (field === 'middleInitial') value = value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    setFormData(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    ['firstName', 'middleInitial', 'lastName', 'address', 'phoneNumber', 'email', 'password', 'confirmPassword', 'agreeToTerms']
      .forEach(field => {
        const err = validateField(field, formData[field]);
        if (err) newErrors[field] = err;
      });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          middleInitial: formData.middleInitial.trim(),
          lastName: formData.lastName.trim(),
          address: formData.address.trim(),
          phoneNumber: formData.phoneNumber.trim(),
          email: formData.email.trim(),
          password: formData.password,
          password_confirmation: formData.confirmPassword,
        }),
      }, 15000);

      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          const serverErrors = {};
          Object.keys(data.errors).forEach(k => { serverErrors[k] = data.errors[k][0]; });
          setErrors(serverErrors);
        } else {
          setErrors({ email: data.error || data.message || 'Registration failed. Please try again.' });
        }
        return;
      }

      onSuccess(data.data.user, data.data.token, rememberMe, data.data.requires_2fa);
    } catch (err) {
      setErrors({ email: 'Network error. Make sure the backend server is running.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StepIndicator step={1} />
      <div className="auth-modal-body">
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="auth-fields-grid">
            <div className="auth-field">
              <label>First Name</label>
              <input
                type="text"
                placeholder="Juan"
                value={formData.firstName}
                onChange={e => handleRegisterChange('firstName', e.target.value)}
                onBlur={e => handleRegisterChange('firstName', e.target.value.trim())}
                className={errors.firstName ? 'error' : ''}
              />
              {errors.firstName && <span className="error-message">{errors.firstName}</span>}
            </div>
            <div className="auth-field">
              <label>Middle Initial</label>
              <input
                type="text"
                placeholder="D."
                value={formData.middleInitial}
                onChange={e => handleRegisterChange('middleInitial', e.target.value.toUpperCase())}
                maxLength="2"
                className={errors.middleInitial ? 'error' : ''}
              />
              {errors.middleInitial && <span className="error-message">{errors.middleInitial}</span>}
            </div>
            <div className="auth-field">
              <label>Last Name</label>
              <input
                type="text"
                placeholder="Dela Cruz"
                value={formData.lastName}
                onChange={e => handleRegisterChange('lastName', e.target.value)}
                onBlur={e => handleRegisterChange('lastName', e.target.value.trim())}
                className={errors.lastName ? 'error' : ''}
              />
              {errors.lastName && <span className="error-message">{errors.lastName}</span>}
            </div>
          </div>

          <div className="auth-field">
            <label>Address</label>
            <input
              type="text"
              placeholder="123 Main Street, City, Province, ZIP Code"
              value={formData.address}
              onChange={e => handleRegisterChange('address', e.target.value)}
              className={errors.address ? 'error' : ''}
            />
            {errors.address && <span className="error-message">{errors.address}</span>}
          </div>

          <div className="auth-field">
            <label>Phone Number</label>
            <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ background: 'var(--dark3)', borderRight: '1px solid var(--border)', padding: '0 1rem', display: 'flex', alignItems: 'center', color: 'var(--white)', fontWeight: '700', fontSize: '0.95rem', flexShrink: 0, userSelect: 'none' }}>+63</div>
              <input
                type="tel"
                placeholder="912 345 6789"
                value={formData.phoneNumber.replace(/^\+63/, '')}
                onChange={e => { const d = e.target.value.replace(/\D/g, '').slice(0, 10); handleRegisterChange('phoneNumber', '+63' + d); }}
                className={errors.phoneNumber ? 'error' : ''}
                maxLength={10}
                style={{ border: 'none', borderRadius: '0', flex: '1', background: 'transparent' }}
              />
            </div>
            {errors.phoneNumber && <span className="error-message">{errors.phoneNumber}</span>}
          </div>

          <div className="auth-field">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={e => handleRegisterChange('email', e.target.value)}
              className={errors.email ? 'error' : ''}
            />
            {errors.email && <span className="error-message">{errors.email}</span>}
          </div>

          <div className="auth-fields-grid">
            <div className="auth-field" style={{ position: 'relative' }}>
              <label>Password</label>
              <div className="auth-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create Password"
                  autoComplete="new-password"
                  maxLength={64}
                  value={formData.password}
                  onChange={e => handleRegisterChange('password', e.target.value)}
                  onFocus={() => setPasswordTouched(true)}
                  className={errors.password ? 'error' : ''}
                />
                <button type="button" className="auth-eye" onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <EyeOpen /> : <EyeClosed />}
                </button>
              </div>
              {(passwordTouched || formData.password.length > 0) && (
                <div style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {[
                      { label: 'At least 8 characters', pass: formData.password.length >= 8 },
                      { label: 'One uppercase letter', pass: /[A-Z]/.test(formData.password) },
                      { label: 'One lowercase letter', pass: /[a-z]/.test(formData.password) },
                      { label: 'One number', pass: /\d/.test(formData.password) },
                      { label: 'One special character', pass: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password) },
                    ].map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: c.pass ? 'var(--green)' : 'var(--gray)', transition: 'color 0.2s' }}>
                        <span style={{ fontSize: '0.72rem' }}>{c.pass ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.3}}><circle cx="12" cy="12" r="2"/></svg>
                        )}</span>{c.label}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '0.55rem' }}>
                    <PasswordStrength password={formData.password} />
                  </div>
                </div>
              )}
              {errors.password && <span className="error-message">{errors.password}</span>}
            </div>

            <div className="auth-field">
              <label>Confirm Password</label>
              <div className="auth-input-wrap">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repeat Password"
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={e => handleRegisterChange('confirmPassword', e.target.value)}
                  onFocus={() => setConfirmTouched(true)}
                  className={errors.confirmPassword ? 'error' : ''}
                />
                <button type="button" className="auth-eye" onClick={() => setShowConfirm(v => !v)}>
                  {showConfirm ? <EyeOpen /> : <EyeClosed />}
                </button>
              </div>
              {(confirmTouched || formData.confirmPassword.length > 0) && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: formData.confirmPassword.length === 0 ? 'var(--gray)' : (formData.confirmPassword === formData.password ? 'var(--green)' : 'var(--red)') }}>
                  {formData.confirmPassword.length === 0
                    ? 'Re-enter your password to confirm.'
                    : (formData.confirmPassword === formData.password ? (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:'4px'}}><polyline points="20 6 9 17 4 12"/></svg> Passwords match</>
                      ) : 'Passwords do not match')}
                </div>
              )}
              {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
            </div>
          </div>

          <div className="auth-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <label className="auth-check" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--gray)' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--gold)' }}
              />
              <span>Remember Me</span>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '14px', height: '14px', borderRadius: '50%', verticalAlign: 'middle',
                  background: 'var(--border)', color: 'var(--gray)', fontSize: '0.65rem',
                  cursor: 'help', flexShrink: 0
                }}
                title="Keep you logged in for 30 days. Don't use on shared devices."
              >?</span>
            </label>
          </div>

          <button type="button" className="btn-auth-submit"
            onClick={() => { if (!validateForm()) return; setTAndCModalOpen(true); }}>
            Proceed to Terms &amp; Conditions
          </button>
        </form>
        <p className="auth-switch">Already have an account? <button onClick={onSwitchToLogin}>Sign In</button></p>
      </div>

      {/* T&C Modal */}
      {tAndCModalOpen && (
        <div className="tnc-overlay" onClick={() => setTAndCModalOpen(false)}>
          <div className="tnc-modal" onClick={e => e.stopPropagation()}>
            <div className="tnc-header">
              <h3>Terms and Conditions</h3>
              <button className="tnc-close" onClick={() => setTAndCModalOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <StepIndicator step={2} />
            <div className="tnc-content">
              <p><strong>1. Acceptance of Terms</strong></p>
              <p>By creating an account with Personalize Me Prints, you agree to comply with and be bound by these Terms and Conditions. If you do not agree with any part of these terms, please do not use our services.</p>
              <p><strong>2. Account Registration</strong></p>
              <p>You must provide accurate and complete information when registering for an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>
              <p><strong>3. Product Quality</strong></p>
              <p>We strive to provide high-quality custom printing services. All products are subject to quality inspection before shipment. We are not responsible for damages caused by improper use or handling of printed products.</p>
              <p><strong>4. Intellectual Property</strong></p>
              <p>You warrant that any designs or content you upload for printing do not infringe upon any third-party rights. You grant us a non-exclusive license to use your designs solely for the purpose of fulfilling your order.</p>
              <p><strong>5. Payment and Pricing</strong></p>
              <p>All prices are subject to change without notice. Payment is required before production begins. We reserve the right to refuse any order for any reason.</p>
              <p><strong>6. Shipping and Delivery</strong></p>
              <p>Delivery times are estimates and not guaranteed. We are not responsible for delays caused by shipping carriers or customs processing.</p>
              <p><strong>7. Returns and Refunds</strong></p>
              <p>Due to the custom nature of our products, all sales are final. We will only accept returns or provide refunds for products that are damaged or significantly different from the approved proof.</p>
              <p><strong>8. Limitation of Liability</strong></p>
              <p>Personalize Me Prints shall not be liable for any indirect, incidental, or consequential damages arising from the use of our products or services.</p>
              <p><strong>9. Changes to Terms</strong></p>
              <p>We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting on our website. Your continued use of our services after any changes constitutes acceptance of the new terms.</p>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="checkbox"
                id="tnc-agree-shop"
                checked={formData.agreeToTerms}
                onChange={e => handleRegisterChange('agreeToTerms', e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--gold)', flexShrink: 0 }}
              />
              <label htmlFor="tnc-agree-shop" style={{ fontSize: '0.88rem', color: 'var(--white)', cursor: 'pointer', userSelect: 'none' }}>
                I have read and agree to the Terms and Conditions
              </label>
            </div>
            <div className="tnc-actions">
              <button className="btn-primary" disabled={!formData.agreeToTerms || loading}
                onClick={async () => { setTAndCModalOpen(false); await handleSubmit({ preventDefault: () => {} }); }}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
              <button className="btn-secondary" onClick={() => setTAndCModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function ShopLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setCartItems, cartCount: globalCartCount } = useGlobalCart();
  const [user, setUser]       = useState(null);
  const [cart, setCart]       = useState([]);
  const [cartInitialized, setCartInitialized] = useState(false);
  const pendingCartAdds = useRef([]);
  const syncTimeoutRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [authModalOpen, setAuthModalOpen]       = useState(false);
  const [authModalSubtitle, setAuthModalSubtitle] = useState('');
  const [twoFaOpen, setTwoFaOpen]               = useState(false);
  const [twoFaToken, setTwoFaToken]       = useState(null);
  const [twoFaEmail, setTwoFaEmail]       = useState('');
  const [twoFaRole, setTwoFaRole]         = useState('');

  // Call this instead of setAuthModalOpen(true) when login is
  // triggered by a protected action so we can redirect after login.
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    window.dispatchEvent(new CustomEvent('pmp_search', { detail: { query: val } }));
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    window.dispatchEvent(new CustomEvent('pmp_search', { detail: { query: '' } }));
  };

  const openAuthModalWithRedirect = (returnPath) => {
    if (returnPath) sessionStorage.setItem('pre_login_redirect', returnPath);
    setAuthModalOpen(true);
  };

  const [authModalType, setAuthModalType] = useState('login'); // 'login' or 'register'
  const [authModalInstanceKey, setAuthModalInstanceKey] = useState(0);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  // Forgot password state
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [forgotResendSuccess, setForgotResendSuccess] = useState(false);
  const [forgotResendCooldown, setForgotResendCooldown] = useState(0);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForgotConfirm, setShowForgotConfirm] = useState(false);

  // Notification state
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef(null);

  // Load user info (public access - no login required to browse)
  useEffect(() => {
    setMounted(true);
    const u = getUser();
    setUser(u);

    // Auto-open login modal if session expired or user just logged out
    const sessionExpired = sessionStorage.getItem('sessionExpired');
    const justLoggedOut  = sessionStorage.getItem('justLoggedOut');
    if (sessionExpired) {
      sessionStorage.removeItem('sessionExpired');
      setAuthModalType('login');
      setAuthModalSubtitle('Your session expired. Please sign in again.');
      setAuthModalOpen(true);
      setAuthModalInstanceKey(k => k + 1);
    } else if (justLoggedOut) {
      sessionStorage.removeItem('justLoggedOut');
      setAuthModalType('login');
      setAuthModalSubtitle('You have been signed out.');
      setAuthModalOpen(true);
      setAuthModalInstanceKey(k => k + 1);
    }

    // Listen for avatar/profile updates from other components
    const handleUserUpdate = () => {
      setUser(getUser());
    };
    window.addEventListener('storage', (e) => {
      if (e.key === 'auth_user') handleUserUpdate();
    });
    window.addEventListener('pmp_user_updated', handleUserUpdate);

    // Cart is managed entirely by CartContext — no fetch needed here
    setCartInitialized(true);
    processPendingAdds();

    // Listen for auth modal open requests from child pages
    const handleOpenAuth = (e) => {
      const type = e.detail?.type ?? 'login';
      setAuthModalType(type);
      const returnPath = e.detail?.returnPath ?? `${window.location.pathname}${window.location.search}`;
      openAuthModalWithRedirect(returnPath);
      setAuthModalInstanceKey(k => k + 1);
    };
    window.addEventListener('pmp_open_auth', handleOpenAuth);

    return () => {
      window.removeEventListener('storage', handleUserUpdate);
      window.removeEventListener('pmp_user_updated', handleUserUpdate);
      window.removeEventListener('pmp_open_auth', handleOpenAuth);
    };
  }, []);

  // Process pending cart items added before initialization
  function processPendingAdds() {
    if (pendingCartAdds.current.length === 0) return;
    const pending = [...pendingCartAdds.current];
    pendingCartAdds.current = [];
    pending.forEach(({ product, variantId, variantName, qty }) => {
      setTimeout(() => addToCartCore(product, variantId, variantName, qty), 0);
    });
  }

  // Handle login/register button clicks
  const handleLoginClick = () => {
    setAuthModalType('login');
    setAuthModalOpen(true);
    setAuthModalInstanceKey(k => k + 1);
  };

  const handleRegisterClick = () => {
    setAuthModalType('register');
    setAuthModalOpen(true);
    setAuthModalInstanceKey(k => k + 1);
  };

  // Handle successful login
  const handleLoginSuccess = async (userData, token, rememberMe = false, requires2fa = false) => {
    if (requires2fa) {
      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem('auth_token', token);
      storage.setItem('auth_user', JSON.stringify(userData));
      try {
        const bc = new BroadcastChannel('pmp_auth');
        bc.postMessage({ type: 'AUTH_UPDATE', token, user: userData });
        bc.close();
      } catch {}
      sessionStorage.setItem('pending_2fa', 'true');
      // Save redirect destination for after 2FA
      const currentPath = window.location.pathname;
      const dashboardRoles = ['admin', 'owner', 'salesRep', 'productionOperator', 'qualityControl', 'cashier', 'inventoryManager'];
      const isAdminUser = dashboardRoles.includes(userData.role);
      const returnTo = isAdminUser
        ? '/dashboard/business/dashboardoverview'
        : (currentPath === '/shop/2fa-verify' || currentPath === '/')
          ? '/shop'
          : currentPath;
      sessionStorage.setItem('post_2fa_redirect', returnTo);
      // Show inline modal — no page navigation
      setTwoFaToken(token);
      setTwoFaEmail(userData.email || '');
      setTwoFaRole(userData.role || '');
      setAuthModalOpen(false);
      setTwoFaOpen(true);
      return;
    }

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('auth_token', token);
    storage.setItem('auth_user', JSON.stringify(userData));
    try {
      const bc = new BroadcastChannel('pmp_auth');
      bc.postMessage({ type: 'AUTH_UPDATE', token, user: userData });
      bc.close();
    } catch {}

    // Redirect admin/owner to dashboard
    const dashboardRolesLogin = ['admin', 'owner', 'salesRep', 'productionOperator', 'qualityControl', 'cashier', 'inventoryManager'];
    if (dashboardRolesLogin.includes(userData.role)) {
      sessionStorage.removeItem('pre_login_redirect');
      window.location.href = '/dashboard/business/dashboardoverview';
      return;
    }

    setUser(userData);
    setAuthModalOpen(false);
    setAuthModalInstanceKey(k => k + 1);

    // Merge guest cart with user cart after login
    // This must happen AFTER token is saved so cartApi can use it
    try {
      const guestCart = localStorage.getItem('pmp_guest_cart');
      if (guestCart) {
        const guestItems = JSON.parse(guestCart);
        if (guestItems && guestItems.length > 0) {
          const mergedCart = await mergeCart(guestItems, getToken());
          // Update both cart systems
          const mongoItems = (mergedCart?.data ?? mergedCart)?.items || [];
          const layoutItems = mongoItems.map(toLayoutItem);
          setCart(layoutItems);        // local display
          setCartItems(mongoItems);    // cart badge
          localStorage.removeItem('pmp_guest_cart');
        }
      }
    } catch (err) {
      console.warn('Cart merge failed:', err);
      // Don't block login if merge fails
    }

    // Navigate to pre-login destination after cart merge completes
    const pendingRedirect = sessionStorage.getItem('pre_login_redirect');
    if (pendingRedirect) {
      sessionStorage.removeItem('pre_login_redirect');
      router.push(pendingRedirect);
    }
  };

  // Handle successful registration
  const handleRegisterSuccess = async (userData, token, rememberMe = false) => {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('auth_token', token);
    storage.setItem('auth_user', JSON.stringify(userData));
    try {
      const bc = new BroadcastChannel('pmp_auth');
      bc.postMessage({ type: 'AUTH_UPDATE', token, user: userData });
      bc.close();
    } catch {}

    // Redirect admin/owner to dashboard
    const dashboardRolesReg = ['admin', 'owner', 'salesRep', 'productionOperator', 'qualityControl', 'cashier', 'inventoryManager'];
    if (dashboardRolesReg.includes(userData.role)) {
      window.location.href = '/dashboard/business/dashboardoverview';
      return;
    }

    setUser(userData);
    setAuthModalOpen(false);
    setAuthModalInstanceKey(k => k + 1);

    // Merge guest cart with user cart after registration
    // This must happen AFTER token is saved so cartApi can use it
    try {
      const guestCart = localStorage.getItem('pmp_guest_cart');
      if (guestCart) {
        const guestItems = JSON.parse(guestCart);
        if (guestItems && guestItems.length > 0) {
          const mergedCart = await mergeCart(guestItems, getToken());
          // Update both cart systems
          const mongoItems = (mergedCart?.data ?? mergedCart)?.items || [];
          const layoutItems = mongoItems.map(toLayoutItem);
          setCart(layoutItems);        // local display
          setCartItems(mongoItems);    // cart badge
          localStorage.removeItem('pmp_guest_cart');
        }
      }
    } catch (err) {
      console.warn('Cart merge failed:', err);
      // Don't block registration if merge fails
    }
  };

  // Persist cart changes
  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem('shop_cart', JSON.stringify(cart));
    }
  }, [cart, mounted]);

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Cart helpers ────────────────────────────────────────────────────────────

  // Core add logic (used by both addToCart and pending)
  function addToCartCore(product, variantId, variantName, qty = 1) {
    setCart(prev => {
      const key = `${product.id ?? product._id}_${variantId ?? 'none'}`;
      const exists = prev.find(i =>
        `${(i.product.id ?? i.product._id)}_${i.variantId ?? 'none'}` === key
      );
      if (exists) {
        return prev.map(i =>
          `${(i.product.id ?? i.product._id)}_${i.variantId ?? 'none'}` === key
            ? { ...i, qty: i.qty + qty, lineTotal: (i.qty + qty) * i.unitPrice }
            : i
        );
      }
      const unitPrice = product.flatPrice || product.price || 0;
      return [...prev, {
        product,
        variantId: variantId || null,
        variantName: variantName || null,
        qty,
        unitPrice,
        lineTotal: qty * unitPrice,
      }];
    });
  }

  function addToCart(product, variantId, variantName, qty = 1) {
    if (!cartInitialized) {
      // Queue for when cart is ready
      pendingCartAdds.current.push({ product, variantId, variantName, qty });
      return;
    }
    addToCartCore(product, variantId, variantName, qty);
  }

  function removeFromCart(productId, variantId) {
    setCart(prev => prev.filter(i =>
      !((i.product.id ?? i.product._id) === productId && (i.variantId ?? null) === (variantId ?? null))
    ));
  }

  function updateQty(productId, variantId, newQty) {
    const qty = Math.max(0, parseInt(newQty) || 0);
    setCart(prev => {
      if (qty === 0) {
        return prev.filter(i =>
          !((i.product.id ?? i.product._id) === productId && (i.variantId ?? null) === (variantId ?? null))
        );
      }
      return prev.map(i =>
        (i.product.id ?? i.product._id) === productId && (i.variantId ?? null) === (variantId ?? null)
          ? { ...i, qty, lineTotal: qty * i.unitPrice }
          : i
      );
    });
  }

  function clearCartLocal() {
    setCart([]);
    setCartItems([]);
    syncCartToStorage([]);
  }

  // Sync cart to correct storage based on auth state
  function syncCartToStorage(mongoItems) {
    if (!mongoItems || mongoItems.length === 0) {
      return;
    }
    const token = getToken();
    if (token) {
      // Logged in: sync to MongoDB (non-blocking)
      syncCart(mongoItems, getToken()).catch(err =>
        console.warn('Cart sync failed:', err)
      );
    } else {
      // Guest: save to localStorage
      try {
        localStorage.setItem('pmp_guest_cart', JSON.stringify(mongoItems));
      } catch {}
    }
  }

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  // Sync cart to CartContext and storage whenever cart changes
  useEffect(() => {
    // Skip sync before cart is initialized
    if (!cartInitialized) return;

    // Skip sync if local cart is empty — CartContext owns the real data
    if (cart.length === 0) return;

    // Convert to MongoDB format
    const mongoItems = cart.map(toMongoItem);

    // Sync to CartContext (badge count)
    setCartItems(mongoItems);

    // Debounce the storage sync to avoid spamming the backend
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncCartToStorage(mongoItems);
    }, 800);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [cart, cartInitialized]);

  // ── Forgot Password Handlers ────────────────────────────────────────────────
  // STEP 1 — Send reset code to email
  const handleForgotSubmit = async () => {
    if (!forgotEmail.trim()) { setForgotError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      setForgotError('Please enter a valid email address');
      return;
    }
    setForgotError('');
    setIsSendingReset(true);
    try {
      const result = await forgotPassword({ email: forgotEmail });
      setForgotSent(true);
      setForgotStep(2); // Move to code entry step
    } catch (err) {
      setForgotError(err.message || 'Failed to send reset code.');
    } finally {
      setIsSendingReset(false);
    }
  };

  // STEP 2 — Verify the 6-digit code
  const handleForgotVerifyCode = async () => {
    if (forgotCode.length !== 6) { setForgotError('Please enter the 6-digit code'); return; }
    setForgotError('');
    setIsSendingReset(true);
    try {
      await verifyResetCode({ email: forgotEmail, code: forgotCode });
      setForgotStep(3); // Move to password reset step
    } catch (err) {
      setForgotError(err.message || 'Invalid or expired code.');
    } finally {
      setIsSendingReset(false);
    }
  };

  // Resend verification code
  const handleForgotResend = async () => {
    if (forgotResendCooldown > 0) return;
    setForgotResendSuccess(false);
    setForgotError('');
    try {
      await sendResetCode({ email: forgotEmail });
      setForgotCode('');
      setForgotResendSuccess(true);
      setForgotResendCooldown(60);
      setTimeout(() => setForgotResendSuccess(false), 5000);
    } catch (err) {
      setForgotError(err.message || 'Failed to resend code.');
    }
  };

  // STEP 3 — Submit new password
  const handleForgotResetPassword = async () => {
    if (!forgotNewPassword) { setForgotError('Password is required'); return; }
    if (forgotNewPassword.length < 8) { setForgotError('Password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(forgotNewPassword)) { setForgotError('Password must contain at least one uppercase letter'); return; }
    if (!/[a-z]/.test(forgotNewPassword)) { setForgotError('Password must contain at least one lowercase letter'); return; }
    if (!/\d/.test(forgotNewPassword)) { setForgotError('Password must contain at least one number'); return; }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(forgotNewPassword)) { setForgotError('Password must contain at least one special character'); return; }
    if (forgotNewPassword !== forgotConfirmPassword) { setForgotError('Passwords do not match'); return; }
    setForgotError('');
    setIsSendingReset(true);
    try {
      await resetPassword({ email: forgotEmail, code: forgotCode, password: forgotNewPassword, password_confirmation: forgotConfirmPassword });
      // Success — close and show login
      setForgotPasswordOpen(false);
      setForgotStep(1);
      setForgotCode('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setAuthModalOpen(true);
      setAuthModalType('login');
    } catch (err) {
      setForgotError(err.message || 'Failed to reset password.');
    } finally {
      setIsSendingReset(false);
    }
  };

  // Reset forgot password state when closing modal
  const closeForgotPassword = () => {
    setForgotPasswordOpen(false);
    setForgotStep(1);
    setForgotEmail('');
    setForgotCode('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotError('');
    setForgotSent(false);
  };

  // Cooldown ticker
  useEffect(() => {
    if (forgotResendCooldown <= 0) return;
    const t = setTimeout(() => setForgotResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [forgotResendCooldown]);

  // Poll unread count every 60 seconds (logged-in only)
  // Stops polling after 3 consecutive failures to prevent console spam
  useEffect(() => {
    const token = getToken();
    if (!token || !user) return;
    let failCount = 0;
    let interval;
    const poll = async () => {
      try {
        const data = await fetchUnreadCount(token);
        setUnreadCount(data.unread_count ?? 0);
        failCount = 0;
      } catch {
        failCount += 1;
        if (failCount >= 3) {
          clearInterval(interval);
        }
      }
    };
    poll();
    interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Close notification panel on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current &&
          !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener(
        'mousedown', handleClickOutside);
  }, []);

  const handleOpenNotifications = useCallback(async () => {
    const isOpening = !notifOpen;
    setNotifOpen(isOpening);
    if (!isOpening) return;
    setNotifLoading(true);
    try {
      const token = getToken();
      const data = await fetchNotifications(token);
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // silent fail
    } finally {
      setNotifLoading(false);
    }
  }, [notifOpen]);

  const handleMarkRead = useCallback(async (id) => {
    try {
      const token = getToken();
      const data = await markNotificationRead(id, token);
      setUnreadCount(data.unread_count ?? 0);
      setNotifications(prev =>
        prev.map(n =>
          (n._id === id || n.id === id)
            ? { ...n, is_read: true }
            : n
        )
      );
    } catch {
      // silent fail
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      const token = getToken();
      await markAllNotificationsRead(token);
      setUnreadCount(0);
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
    } catch {
      // silent fail
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function handleLogout() {
    const token = getToken();
    try {
      await fetchWithTimeout(`${API_URL}/api/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }, 30000);
    } catch {}
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_user');
    sessionStorage.removeItem('shop_cart');
    sessionStorage.setItem('justLoggedOut', 'true');
    router.replace('/');
  }

  if (!mounted) return null;

  return (
    <>
      <div className="shop-wrapper">
        {/* ── Navbar ── */}
        <nav className={`shop-navbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="shop-navbar-container">
            {/* Left side - Logo and Back button (only show back button when NOT logged in) */}
            <div className="shop-navbar-left">
              {/* Back to Home button - Only show when not logged in */}
              {!user && (
                <Link href="/" className="shop-navbar-back" title="Back to Home">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </Link>
              )}

              {/* Logo - Not clickable */}
              <div className="shop-navbar-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/PersonalizeMe logo.png" alt="Personalize Me Prints" className="shop-navbar-logo-img" />
                <div className="shop-navbar-logo-text">
                  PERSONALIZE <span>ME</span><br />PRINTS
                </div>
              </div>
            </div>

            {/* Center — Search bar — B-01 */}
            {pathname !== '/shop/cart' && (
              <div className="shop-navbar-search">
                <svg
                  className="shop-navbar-search-icon"
                  width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  className="shop-navbar-search-input"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="shop-navbar-search-clear"
                    onClick={handleSearchClear}
                    aria-label="Clear search"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Right side */}
            <div className="shop-navbar-right">
              {/* Cart button */}
              <Link href="/shop/cart" className="shop-navbar-cart">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"/>
                  <circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                {globalCartCount > 0 && (
                  <span className="shop-navbar-cart-badge">
                    {globalCartCount > 99 ? '99+' : globalCartCount}
                  </span>
                )}
              </Link>

              {/* User section - Show Login/Register if not logged in, or User menu if logged in */}
              {user ? (
                <>
                  {/* Notification Bell — logged-in customers only */}
                  <div ref={notifRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="shop-navbar-notif-btn"
                      onClick={handleOpenNotifications}
                      aria-label="Notifications"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ flexShrink: 0 }}>
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                      {unreadCount > 0 && (
                        <span className="shop-navbar-notif-badge">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {notifOpen && (
                      <div className="shop-notif-panel">
                        {/* Panel header */}
                        <div className="shop-notif-panel-header">
                          <div className="shop-notif-panel-title">
                            Notifications
                            {unreadCount > 0 && (
                              <span className="shop-notif-count-badge">
                                {unreadCount}
                              </span>
                            )}
                          </div>
                          {unreadCount > 0 && (
                            <button
                              type="button"
                              onClick={handleMarkAllRead}
                              className="shop-notif-mark-all"
                            >
                              Mark all read
                            </button>
                          )}
                        </div>

                        {/* Panel body */}
                        <div className="shop-notif-panel-body">
                          {notifLoading ? (
                            <div style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {[...Array(3)].map((_, i) => (
                                <div key={i} style={{
                                  display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                                  animation: 'shopSkeletonPulse 1.4s ease-in-out infinite',
                                  animationDelay: `${i * 0.1}s`,
                                }}>
                                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--border)', flexShrink: 0, marginTop: '5px' }} />
                                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ height: '13px', background: 'var(--border)', borderRadius: '4px', width: '65%' }} />
                                    <div style={{ height: '11px', background: 'var(--border)', borderRadius: '4px', width: '85%' }} />
                                    <div style={{ height: '10px', background: 'var(--border)', borderRadius: '4px', width: '35%' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : notifications.length === 0 ? (
                            <div className="shop-notif-empty">
                              <svg width="40" height="40"
                                viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="1.5"
                                style={{ marginBottom: '0.75rem',
                                  opacity: 0.4 }}>
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3
                                  9h18s-3-2-3-9"/>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                              </svg>
                              <div style={{ fontWeight: 600,
                                color: 'var(--white)',
                                marginBottom: '0.25rem' }}>
                                No notifications
                              </div>
                              <div style={{ fontSize: '0.8rem' }}>
                                You are all caught up.
                              </div>
                            </div>
                          ) : (
                            notifications.map((n) => {
                              const id = n._id || n.id;
                              return (
                                <div
                                  key={id}
                                  onClick={() =>
                                    !n.is_read && handleMarkRead(id)}
                                  className={`shop-notif-item${
                                    n.is_read ? '' : ' unread'}`}
                                >
                                  <div className={`shop-notif-dot${
                                    n.is_read ? ' read' : ''}`} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="shop-notif-item-title"
                                      style={{
                                        fontWeight: n.is_read ? 400 : 600,
                                      }}>
                                      {n.title}
                                    </div>
                                    <div className="shop-notif-item-msg">
                                      {n.message}
                                    </div>
                                    <div className="shop-notif-item-time">
                                      {new Date(n.created_at)
                                        .toLocaleDateString('en-PH', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Logged in - Show user menu */}
                  <div className="shop-navbar-user">
                    <button
                      onClick={() => setMenuOpen(o => !o)}
                      className="shop-navbar-user-btn"
                    >
                      {user?.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatar}
                          alt="avatar"
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      )}
                      <span className="shop-navbar-user-name">
                        {user?.firstName || 'Account'}
                      </span>
                      <svg className={`shop-navbar-user-chevron ${menuOpen ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>

                    {menuOpen && (
                      <>
                        <div className="shop-navbar-user-backdrop" onClick={() => setMenuOpen(false)} />
                        <div className="shop-navbar-user-menu">
                          <div className="shop-navbar-user-info">
                            <div className="shop-navbar-user-label">Signed in as</div>
                            <div className="shop-navbar-user-name-full">
                              {user?.firstName} {user?.lastName}
                            </div>
                          </div>
                          <Link href="/shop/profile" className="shop-navbar-menu-item" onClick={() => setMenuOpen(false)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                              <circle cx="12" cy="7" r="4"/>
                            </svg>
                            My Profile
                          </Link>
                          <Link href="/shop/orders" className="shop-navbar-menu-item" onClick={() => setMenuOpen(false)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="16" y1="13" x2="8" y2="13"/>
                              <line x1="16" y1="17" x2="8" y2="17"/>
                            </svg>
                            Order Requests
                          </Link>
                          <Link href="/shop/orders-history" className="shop-navbar-menu-item" onClick={() => setMenuOpen(false)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            My Orders
                          </Link>
                          <button onClick={handleLogout} className="shop-navbar-menu-item shop-navbar-logout">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                              <polyline points="16 17 21 12 16 7"/>
                              <line x1="21" y1="12" x2="9" y2="12"/>
                            </svg>
                            Log Out
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                /* Not logged in - Show Login/Register buttons */
                <div className="shop-navbar-auth">
                  <button onClick={handleLoginClick} className="shop-navbar-login-btn">
                    Login
                  </button>
                  <button onClick={handleRegisterClick} className="shop-navbar-register-btn">
                    Register
                  </button>
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* ── Page Content ── */}
        <main className="shop-main-content">
          {children}
        </main>

        {/* ── Auth Modal (Same as Landing Page) ── */}
        {authModalOpen && (
          <div className="auth-overlay" onClick={() => { setAuthModalOpen(false); setAuthModalSubtitle(''); setAuthModalInstanceKey(k => k + 1); }} style={{ zIndex: 1000 }}>
            <div className="auth-modal" onClick={e => e.stopPropagation()}>
              <div className="auth-modal-header">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/PersonalizeMe logo.png" alt="Logo" className="auth-modal-logo"/>
                <div>
                  <h2>{authModalType === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
                  <p>{authModalSubtitle || (authModalType === 'login' ? 'Sign in to continue shopping' : 'Join Personalize Me Prints')}</p>
                </div>
                <button className="auth-close" onClick={() => { setAuthModalOpen(false); setAuthModalSubtitle(''); setAuthModalInstanceKey(k => k + 1); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <div className="auth-modal-body">
                {authModalType === 'login' ? (
                  <LoginForm
                    key={`login-${authModalInstanceKey}`}
                    onSuccess={handleLoginSuccess}
                    onSwitchToRegister={() => setAuthModalType('register')}
                    onForgotPassword={() => { setAuthModalOpen(false); setForgotPasswordOpen(true); }}
                  />
                ) : (
                  <RegisterForm key={`register-${authModalInstanceKey}`} onSuccess={handleRegisterSuccess} onSwitchToLogin={() => setAuthModalType('login')} />
                )}
              </div>
            </div>
          </div>
        )}

        {twoFaOpen && twoFaToken && (
          <TwoFactorModal
            token={twoFaToken}
            userEmail={twoFaEmail}
            userRole={twoFaRole}
            onSuccess={(redirectTo) => {
              setTwoFaOpen(false);
              setTwoFaToken(null);
              sessionStorage.removeItem('pending_2fa');
              sessionStorage.removeItem('post_2fa_redirect');
              window.location.href = redirectTo;
            }}
            onBack={() => {
              setTwoFaOpen(false);
              setTwoFaToken(null);
              sessionStorage.removeItem('pending_2fa');
              sessionStorage.removeItem('post_2fa_redirect');
            }}
          />
        )}

        {/* ── Forgot Password Modal — 3 Step Flow ── */}
        {forgotPasswordOpen && (
          <div className="auth-overlay" onClick={closeForgotPassword} style={{ zIndex: 1000 }}>
            <div className="auth-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
              <div className="auth-modal-header">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/PersonalizeMe logo.png" alt="Logo" className="auth-modal-logo"/>
                <div>
                  <h2>Forgot Password</h2>
                  <p>
                    {forgotStep === 1 ? "We'll send you a reset code" :
                     forgotStep === 2 ? "Enter verification code" : "Set a new password"}
                  </p>
                </div>
                <button className="auth-close" onClick={closeForgotPassword}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="auth-modal-body">
                {/* STEP 1 — Enter Email */}
                {forgotStep === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ color: 'var(--gray)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                      Enter the email address associated with your account and we'll send you a reset code.
                    </p>
                    <div className="auth-field">
                      <label>Email Address</label>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={forgotEmail}
                        onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                        className={forgotError ? 'error' : ''}
                        onKeyDown={e => e.key === 'Enter' && handleForgotSubmit()}
                      />
                      {forgotError && <span className="error-message">{forgotError}</span>}
                    </div>
                    {forgotSent && (
                      <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: 'var(--green)', fontSize: '0.85rem' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:'6px'}}><polyline points="20 6 9 17 4 12"/></svg> A reset code has been sent to your email.
                      </div>
                    )}
                    <button className="btn-auth-submit" disabled={isSendingReset} onClick={handleForgotSubmit}>
                      {isSendingReset ? 'Sending...' : 'Send Reset Code'}
                    </button>
                    <p className="auth-switch" style={{ margin: 0 }}>
                      Remember your password?{' '}
                      <button type="button" onClick={() => { closeForgotPassword(); setAuthModalOpen(true); }}>Back to Login</button>
                    </p>
                  </div>
                )}

                {/* STEP 2 — Enter Verification Code */}
                {forgotStep === 2 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.25)', margin: '0 auto 1rem' }}>
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                      </div>
                      <p style={{ color: 'var(--gray)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
                        We sent a 6-digit code to <strong style={{ color: 'var(--white)' }}>{forgotEmail}</strong>. Check your inbox and spam folder.
                      </p>
                    </div>
                    <div className="auth-field">
                      <label>6-Digit Verification Code</label>
                      <input
                        type="text"
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        value={forgotCode}
                        onChange={e => { setForgotCode(e.target.value.replace(/\D/g,'')); setForgotError(''); }}
                        className={forgotError ? 'error' : ''}
                        style={{ letterSpacing: '0.25em', fontSize: '1.1rem', textAlign: 'center' }}
                        onKeyDown={e => e.key === 'Enter' && handleForgotVerifyCode()}
                      />
                      {forgotError && <span className="error-message">{forgotError}</span>}
                      {forgotResendSuccess && (
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--green)', marginTop: '0.4rem' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:'4px'}}><polyline points="20 6 9 17 4 12"/></svg> A new code has been sent
                        </span>
                      )}
                    </div>
                    <button className="btn-auth-submit" disabled={isSendingReset} onClick={handleForgotVerifyCode}>
                      {isSendingReset ? 'Verifying...' : 'Verify Code'}
                    </button>
                    <p className="auth-switch" style={{ margin: 0 }}>
                      Didn't receive the code?{' '}
                      <button
                        type="button"
                        className="auth-link"
                        disabled={forgotResendCooldown > 0}
                        style={forgotResendCooldown > 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                        onClick={handleForgotResend}
                      >
                        {forgotResendCooldown > 0 ? `Resend in ${forgotResendCooldown}s` : 'Resend Code'}
                      </button>
                    </p>
                  </div>
                )}

                {/* STEP 3 — New Password */}
                {forgotStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ color: 'var(--gray)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                      Create a strong new password for your account.
                    </p>
                    <div className="auth-field">
                      <label>New Password</label>
                      <div className="auth-input-wrap">
                        <input
                          type={showForgotPassword ? 'text' : 'password'}
                          placeholder="Enter new password"
                          maxLength={64}
                          value={forgotNewPassword}
                          onChange={e => { setForgotNewPassword(e.target.value); setForgotError(''); }}
                          className={forgotError ? 'error' : ''}
                        />
                        <button type="button" className="auth-eye" onClick={() => setShowForgotPassword(v => !v)}>
                          {showForgotPassword ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.23 0-2.41.2-3.51.57l2.17 2.17C11.13 7.09 11.56 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                            </svg>
                          )}
                        </button>
                      </div>
                      {forgotError && <span className="error-message">{forgotError}</span>}
                    </div>
                    <div className="auth-field">
                      <label>Confirm New Password</label>
                      <div className="auth-input-wrap">
                        <input
                          type={showForgotConfirm ? 'text' : 'password'}
                          placeholder="Repeat new password"
                          maxLength={64}
                          value={forgotConfirmPassword}
                          onChange={e => { setForgotConfirmPassword(e.target.value); setForgotError(''); }}
                          className={forgotError ? 'error' : ''}
                        />
                        <button type="button" className="auth-eye" onClick={() => setShowForgotConfirm(v => !v)}>
                          {showForgotConfirm ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.23 0-2.41.2-3.51.57l2.17 2.17C11.13 7.09 11.56 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                            </svg>
                          )}
                        </button>
                      </div>
                      {forgotError && <span className="error-message">{forgotError}</span>}
                    </div>
                    <button className="btn-auth-submit" disabled={isSendingReset} onClick={handleForgotResetPassword}>
                      {isSendingReset ? 'Resetting...' : 'Reset Password'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

    </>
  );
}