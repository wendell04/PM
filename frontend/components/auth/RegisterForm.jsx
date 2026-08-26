'use client';

import { useState, useRef, useEffect } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import Turnstile from '@/components/Turnstile';
import { PasswordGuide } from '@/components/auth/PasswordGuide';
import PhoneInput, { isValidPhone } from '@/components/auth/PhoneInput';
import { DEFAULT_REGISTRATION_TERMS } from '@/lib/registrationTerms';
// The .auth-* modal/field styles live here. Importing them from the shared form means every host
// (landing, shop, product pages) renders an identical modal — the shop layout only loaded shop.css,
// which has no auth styles, so its modal looked off. This file is entirely class-scoped (no global
// element selectors), so it cannot bleed into shop layouts.
import '@/components/custom-styles.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

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

const StepIndicator = ({ step }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 1.5rem',
    background: 'var(--dark2)', borderBottom: '1px solid var(--border)', gap: '0.5rem' }}>
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

const EMPTY = {
  firstName: '', middleInitial: '', lastName: '', phoneNumber: '',
  email: '', password: '', confirmPassword: '', agreeToTerms: false,
};

/**
 * Shared register form — the single source of truth used by BOTH the landing page and the shop
 * layout, so the sign-up experience (fields, CAPTCHA, password rules, T&C) can never drift apart.
 *
 * onSuccess(user, token, rememberMe, requires2fa) — the caller decides what happens next
 * (e.g. open its own email-verification step).
 */
export default function RegisterForm({ onSuccess, onSwitchToLogin, theme = 'light' }) {
  const [formData, setFormData]   = useState(EMPTY);
  const [errors, setErrors]       = useState({});
  const [loading, setLoading]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [pwFocused, setPwFocused]       = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [tAndCOpen, setTAndCOpen] = useState(false);
  // Gate the agree checkbox behind actually scrolling through the terms.
  const [tncRead, setTncRead] = useState(false);
  const tncContentRef = useRef(null);
  const [turnstileToken, setTurnstileToken] = useState('');

  // The clauses the shop is actually showing today, plus the version, so the account records exactly
  // which wording was accepted. Falls back to the built-in text if the fetch fails - a sign-up must
  // never be blocked by a settings call, but it must never present terms it cannot identify either.
  const [terms, setTerms] = useState(DEFAULT_REGISTRATION_TERMS);
  const [termsVersion, setTermsVersion] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/public/registration-terms`, {}, 10000);
        const d = await res.json();
        if (cancelled || !res.ok) return;
        const rows = d.data?.registrationTerms;
        if (Array.isArray(rows) && rows.length) setTerms(rows);
        setTermsVersion(Number(d.data?.registrationTermsVersion ?? 1));
      } catch { /* built-in text stands */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const turnstileRef = useRef(null);

  // Reset the read-gate each time the terms open; if the text is short enough that it
  // doesn't scroll, count it as read immediately so the box isn't stuck disabled.
  useEffect(() => {
    if (!tAndCOpen) return;
    setTncRead(false);
    const el = tncContentRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) setTncRead(true);
  }, [tAndCOpen]);

  const handleTncScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setTncRead(true);
  };

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
      case 'phoneNumber':
        if (!value.trim()) return 'Phone number is required';
        // Length/format is validated against the SELECTED country, not hard-coded to PH.
        if (!isValidPhone(value)) return 'Please enter a valid phone number for the selected country';
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
      default:
        return '';
    }
  };

  const handleChange = (field, value) => {
    // Names: letters (incl. accented / ñ / José), spaces, hyphens, apostrophes only — no digits
    // or other symbols; capped at 50 chars so an absurdly long value can't be typed or pasted.
    if (['firstName', 'lastName'].includes(field)) value = value.replace(/[^\p{L}\s'-]/gu, '').slice(0, 50);
    if (field === 'middleInitial') value = value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
    if (field === 'email') value = value.slice(0, 254);
    setFormData(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    ['firstName', 'middleInitial', 'lastName', 'phoneNumber', 'email', 'password', 'confirmPassword']
      .forEach(field => {
        const err = validateField(field, formData[field]);
        if (err) newErrors[field] = err;
      });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitRegistration = async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          middleInitial: formData.middleInitial.trim(),
          lastName: formData.lastName.trim(),
          phoneNumber: formData.phoneNumber.trim(),
          email: formData.email.trim(),
          password: formData.password,
          password_confirmation: formData.confirmPassword,
          turnstileToken,
          // Proof of consent. A ticked box on its own proves nothing later - what matters is WHICH
          // wording was on screen, so the version and a copy of the text go with it.
          acceptedTermsVersion: termsVersion,
          acceptedTermsSnapshot: terms.map(t => ({ title: t.title, body: t.body })),
          acceptedTermsAt: new Date().toISOString(),
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
        setTAndCOpen(false);
        return;
      }

      onSuccess?.(data.data.user, data.data.token, false, data.data.requires_2fa);
    } catch (err) {
      setErrors({ email: 'Network error. Make sure the backend server is running.' });
      setTAndCOpen(false);
    } finally {
      setLoading(false);
      // Turnstile tokens are single-use — reset so a retry gets a fresh one.
      turnstileRef.current?.reset();
    }
  };

  return (
    <>
      <StepIndicator step={tAndCOpen ? 2 : 1} />
      <div className="auth-modal-body">
        <form onSubmit={(e) => { e.preventDefault(); if (validateForm()) setTAndCOpen(true); }} autoComplete="off">
          <div className="auth-fields-grid">
            <div className="auth-field">
              <label>First Name</label>
              <input type="text" placeholder="Juan" value={formData.firstName}
                onChange={e => handleChange('firstName', e.target.value)}
                onBlur={e => handleChange('firstName', e.target.value.trim())}
                className={errors.firstName ? 'error' : ''} />
              {errors.firstName && <span className="error-message">{errors.firstName}</span>}
            </div>
            <div className="auth-field">
              <label>Middle Initial</label>
              <input type="text" placeholder="D." value={formData.middleInitial} maxLength="2"
                onChange={e => handleChange('middleInitial', e.target.value.toUpperCase())}
                className={errors.middleInitial ? 'error' : ''} />
              {errors.middleInitial && <span className="error-message">{errors.middleInitial}</span>}
            </div>
            <div className="auth-field">
              <label>Last Name</label>
              <input type="text" placeholder="Dela Cruz" value={formData.lastName}
                onChange={e => handleChange('lastName', e.target.value)}
                onBlur={e => handleChange('lastName', e.target.value.trim())}
                className={errors.lastName ? 'error' : ''} />
              {errors.lastName && <span className="error-message">{errors.lastName}</span>}
            </div>
          </div>

          <div className="auth-field">
            <label>Phone Number</label>
            <PhoneInput
              value={formData.phoneNumber}
              onChange={(e164) => handleChange('phoneNumber', e164)}
              error={!!errors.phoneNumber}
            />
            {errors.phoneNumber && <span className="error-message">{errors.phoneNumber}</span>}
          </div>

          <div className="auth-field">
            <label>Email Address</label>
            <input type="email" placeholder="you@example.com" value={formData.email}
              onChange={e => handleChange('email', e.target.value)}
              className={errors.email ? 'error' : ''} />
            {errors.email && <span className="error-message">{errors.email}</span>}
          </div>

          <div className="auth-fields-grid">
            <div className="auth-field">
              <label>Password</label>
              {/* Anchor the popover to the INPUT, not the grid cell — the cell stretches to match the
                  taller confirm-password column, which would leave a gap under the field. */}
              <div style={{ position: 'relative' }}>
                <div className="auth-input-wrap">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Create Password"
                    autoComplete="new-password" maxLength={64} value={formData.password}
                    onChange={e => handleChange('password', e.target.value)}
                    onFocus={() => setPwFocused(true)}
                    onBlur={() => setPwFocused(false)}
                    className={errors.password ? 'error' : ''} />
                  <button type="button" className="auth-eye" onClick={() => setShowPassword(v => !v)}>
                    {showPassword ? <EyeOpen /> : <EyeClosed />}
                  </button>
                </div>
                <PasswordGuide password={formData.password} focused={pwFocused} />
              </div>
              {errors.password && <span className="error-message">{errors.password}</span>}
            </div>

            <div className="auth-field">
              <label>Confirm Password</label>
              <div className="auth-input-wrap">
                <input type={showConfirm ? 'text' : 'password'} placeholder="Repeat Password"
                  autoComplete="new-password" value={formData.confirmPassword}
                  onChange={e => handleChange('confirmPassword', e.target.value)}
                  onFocus={() => setConfirmTouched(true)}
                  className={errors.confirmPassword ? 'error' : ''} />
                <button type="button" className="auth-eye" onClick={() => setShowConfirm(v => !v)}>
                  {showConfirm ? <EyeOpen /> : <EyeClosed />}
                </button>
              </div>
              {(confirmTouched || formData.confirmPassword.length > 0) && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem',
                  color: formData.confirmPassword.length === 0
                    ? 'var(--gray)'
                    : (formData.confirmPassword === formData.password ? 'var(--black)' : 'var(--red)') }}>
                  {formData.confirmPassword.length === 0
                    ? 'Re-enter your password to confirm.'
                    : (formData.confirmPassword === formData.password ? 'Passwords match' : 'Passwords do not match')}
                </div>
              )}
              {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
            </div>
          </div>

          <Turnstile ref={turnstileRef} onVerify={setTurnstileToken} theme={theme} />

          <button type="submit" className="btn-auth-submit" disabled={loading}>
            Proceed to Terms &amp; Conditions
          </button>
        </form>
        <p className="auth-switch">Already have an account? <button type="button" onClick={onSwitchToLogin}>Sign In</button></p>
      </div>

      {tAndCOpen && (
        <div className="tnc-overlay" onClick={() => setTAndCOpen(false)}>
          <div className="tnc-modal" onClick={e => e.stopPropagation()}>
            <div className="tnc-header">
              <h3>Terms and Conditions</h3>
              <button className="tnc-close" onClick={() => setTAndCOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <StepIndicator step={2} />
            <div className="tnc-content" ref={tncContentRef} onScroll={handleTncScroll}>
              {terms.map((t, i) => (
                <div key={i}>
                  <p><strong>{i + 1}. {t.title}</strong></p>
                  <p>{t.body}</p>
                </div>
              ))}
            </div>
            {!tncRead && (
              <div style={{ padding: '0.5rem 1.5rem 0', fontSize: '0.78rem', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                Please scroll to the bottom to read all the terms first.
              </div>
            )}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input type="checkbox" id="tnc-agree" checked={formData.agreeToTerms}
                disabled={!tncRead}
                onChange={e => handleChange('agreeToTerms', e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: tncRead ? 'pointer' : 'not-allowed', accentColor: 'var(--gold)', opacity: tncRead ? 1 : 0.5 }} />
              <label htmlFor="tnc-agree" style={{ fontSize: '0.85rem', color: tncRead ? 'var(--gray)' : 'var(--border)', cursor: tncRead ? 'pointer' : 'not-allowed' }}>
                I have read and agree to the Terms and Conditions
              </label>
            </div>
            <div style={{ padding: '0 1.5rem 1.25rem', display: 'flex', gap: '0.75rem' }}>
              <button className="btn-auth-submit" style={{ flex: 1 }}
                disabled={!formData.agreeToTerms || loading}
                onClick={submitRegistration}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setTAndCOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
