'use client';

import { useState, useEffect, useRef } from 'react';
import { sendTwoFactorOtp, verifyTwoFactorOtp, rememberDevice } from '@/lib/authApi';

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  return local.slice(0, 2) + '***@' + domain;
}

/**
 * TwoFactorModal
 *
 * Props:
 *   token       {string}   — auth token (already stored in sessionStorage/localStorage)
 *   userEmail   {string}   — email to display masked
 *   userRole    {string}   — 'admin' | 'business' | 'customer' (drives post-verify redirect)
 *   onSuccess   {function} — called with (redirectTo: string) after verified
 *   onBack      {function} — called when user clicks back/locked back button
 */
export default function TwoFactorModal({ token, userEmail, userRole, onSuccess, onBack }) {
  const inputRefs = useRef([]);
  const hasSentInitial = useRef(false);

  const [digits, setDigits]         = useState(['', '', '', '', '', '']);
  const [loading, setLoading]       = useState(false);
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState(null);
  const [isLocked, setIsLocked]     = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [remember, setRemember]     = useState(false);
  const [countdown, setCountdown]   = useState(30);
  const [canResend, setCanResend]   = useState(false);

  // Send OTP on first mount
  useEffect(() => {
    if (!token || hasSentInitial.current) return;
    hasSentInitial.current = true;
    handleSendOtp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Countdown timer — runs once when countdown is set to a
  // positive value, ticks down, then enables resend.
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    setCanResend(false);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendOtp = async () => {
    setSending(true);
    setError(null);
    try {
      await sendTwoFactorOtp(token);
      setCountdown(30);
      setCanResend(false);
    } catch (err) {
      if (err.status === 423) {
        setIsLocked(true);
        setLockedUntil(err.lockedUntil || '10 minutes');
      } else if (err.status === 429) {
        setCountdown(Math.min(err.retryAfter ?? 30, 30));
        setCanResend(false);
      } else {
        setError(err.message || 'Failed to send OTP');
      }
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = [...digits];
    for (let i = 0; i < pasted.length; i++) newDigits[i] = pasted[i];
    setDigits(newDigits);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerify = async () => {
    if (!token) return;
    const code = digits.join('');
    if (code.length !== 6 || loading || sending || isLocked) return;
    setLoading(true);
    setError(null);
    try {
      const result = await verifyTwoFactorOtp(token, { code });
      if (result.verified) {
        if (remember) {
          try {
            const deviceResult = await rememberDevice(token);
            if (deviceResult.device_token) {
              localStorage.setItem('device_token', deviceResult.device_token);
            }
          } catch { /* non-fatal */ }
        }
        const redirectTo = sessionStorage.getItem('post_2fa_redirect') || '/shop';
        sessionStorage.removeItem('pending_2fa');
        sessionStorage.removeItem('post_2fa_redirect');
        onSuccess(redirectTo);
      }
    } catch (err) {
      if (err.status === 423) {
        setIsLocked(true);
        setLockedUntil(err.lockedUntil || '10 minutes');
      } else {
        setError(err.message || 'Invalid code. Please try again.');
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setCanResend(false);
    setError(null);
    setIsLocked(false);
    setLockedUntil(null);
    setDigits(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
    setSending(true);
    try {
      await sendTwoFactorOtp(token);
      setCountdown(30);
    } catch (err) {
      if (err.status === 423) {
        setIsLocked(true);
        setLockedUntil(err.lockedUntil || '10 minutes');
      } else if (err.status === 429) {
        setCountdown(Math.min(err.retryAfter ?? 30, 30));
      } else {
        setError(err.message || 'Failed to resend OTP');
        setCanResend(true);
      }
    } finally {
      setSending(false);
    }
  };

  // ── Overlay wrapper (blocks interaction with page behind) ──
  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
  };

  const card = {
    maxWidth: '440px', width: '100%',
    background: 'var(--dark2, #161616)',
    borderRadius: '16px',
    border: '1px solid var(--border, rgba(255,255,255,0.07))',
    padding: '40px 32px', textAlign: 'center',
  };

  // ── Locked state ──
  if (isLocked) {
    return (
      <div style={overlay}>
        <div style={card}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
            stroke="var(--gold, #d4a843)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ marginBottom: '20px' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <h1 style={{ fontSize: '22px', fontWeight: 700,
            color: 'var(--white, #f5f5f5)', margin: '0 0 12px' }}>
            Account Temporarily Locked
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--danger, #ef4444)',
            margin: '0 0 24px', lineHeight: 1.6 }}>
            Too many attempts. Try again after {lockedUntil || '10 minutes'}.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem('pending_2fa');
              sessionStorage.removeItem('post_2fa_redirect');
              onBack();
            }}
            style={{
              width: '100%', height: '48px',
              background: 'var(--gold, #d4a843)',
              color: 'var(--dark, #0f0f0f)',
              fontWeight: 700, fontSize: '15px',
              border: 'none', borderRadius: '10px', cursor: 'pointer',
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── Main OTP UI ──
  const isDisabled = loading || sending || digits.join('').length !== 6;

  return (
    <div style={overlay}>
      <div style={card}>
        {/* Lock icon */}
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke="var(--gold, #d4a843)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ marginBottom: '20px' }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>

        <h1 style={{ fontSize: '22px', fontWeight: 700,
          color: 'var(--white, #f5f5f5)', margin: '0 0 8px' }}>
          Two-Factor Authentication
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--gray, #888)',
          margin: '0 0 4px', lineHeight: 1.6 }}>
          A 6-digit code was sent to your email.
        </p>
        {userEmail && (
          <p style={{ fontSize: '13px', color: 'var(--gray, #666)',
            margin: '0 0 28px' }}>
            {maskEmail(userEmail)}
          </p>
        )}

        {/* OTP boxes */}
        <div style={{ display: 'flex', justifyContent: 'center',
          gap: '8px', marginBottom: '16px' }}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={el => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleInputChange(index, e.target.value)}
              onKeyDown={e => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={loading || sending}
              style={{
                width: '48px', height: '56px', fontSize: '24px',
                textAlign: 'center', borderRadius: '10px',
                border: `1px solid ${digit
                  ? 'rgba(212,168,67,0.6)'
                  : 'rgba(255,255,255,0.1)'}`,
                background: digit ? 'rgba(212,168,67,0.06)' : 'var(--dark, #1a1a1a)',
                color: 'var(--white, #f5f5f5)', outline: 'none',
                transition: 'all 0.2s', fontFamily: 'monospace',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(212,168,67,0.6)'; }}
              onBlur={e => {
                if (!digit) e.target.style.borderColor = 'rgba(255,255,255,0.1)';
              }}
            />
          ))}
        </div>

        {/* Error */}
        <div style={{ minHeight: '24px', marginBottom: '12px' }}>
          {error && (
            <p style={{ fontSize: '13px',
              color: 'var(--danger, #ef4444)', margin: 0 }}>
              {error}
            </p>
          )}
        </div>

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={isDisabled}
          style={{
            width: '100%', height: '48px',
            background: isDisabled
              ? 'rgba(255,255,255,0.08)'
              : 'var(--gold, #d4a843)',
            color: isDisabled ? 'var(--gray, #555)' : 'var(--dark, #0f0f0f)',
            fontWeight: 700, fontSize: '15px',
            border: 'none', borderRadius: '10px',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          {loading ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                style={{ animation: 'spin2fa 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Verifying...
            </>
          ) : sending ? 'Sending code...' : 'Verify'}
        </button>

        {/* Remember device */}
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
          <input
            type="checkbox"
            id="tfa-remember-device"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            style={{ width: '16px', height: '16px',
              accentColor: 'var(--gold, #d4a843)', cursor: 'pointer' }}
          />
          <label htmlFor="tfa-remember-device" style={{
            fontSize: '14px', color: 'var(--gray, #888)', cursor: 'pointer',
          }}>
            Remember this device
          </label>
        </div>

        {/* Resend */}
        <div style={{ marginTop: '24px', fontSize: '14px',
          color: 'var(--gray, #666)' }}>
          Didn&apos;t receive a code?{' '}
          <button
            onClick={handleResend}
            disabled={!canResend}
            style={{
              background: 'none', border: 'none',
              color: canResend ? 'var(--gold, #d4a843)' : 'var(--gray, #555)',
              fontSize: '14px', fontWeight: 600,
              cursor: canResend ? 'pointer' : 'not-allowed',
              textDecoration: canResend ? 'underline' : 'none',
              padding: 0,
            }}
          >
            {canResend ? 'Resend code' : `Resend in ${countdown}s`}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin2fa {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
