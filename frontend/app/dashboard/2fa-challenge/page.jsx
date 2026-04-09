'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { sendTwoFactorOtp, verifyTwoFactorOtp, rememberDevice } from '@/lib/authApi';

// Token/user helpers — sessionStorage first (fresh login),
// then localStorage fallback (rememberMe=true)
function getToken() {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}
function getUser() {
  return sessionStorage.getItem('auth_user') || localStorage.getItem('auth_user');
}

export default function TwoFactorChallengePage() {
  const router = useRouter();
  const inputRefs = useRef([]);
  const hasSentInitial = useRef(false);

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [remember, setRemember] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');

  // Mask email: first 2 chars + *** @domain
  const maskEmail = (email) => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    return local.slice(0, 2) + '***@' + domain;
  };

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => {
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

  // On mount: check token, read user, send OTP
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/');
      return;
    }

    const userStr = getUser();
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserEmail(user.email || '');
        setUserRole(user.role || '');
      } catch {
        // ignore
      }
    }

    if (hasSentInitial.current) return;
    hasSentInitial.current = true;
    handleSendOtp(token);
  }, []);

  const handleSendOtp = async (token) => {
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
        const secs = err.retryAfter ?? 30;
        setCountdown(secs);
        setCanResend(false);
      } else {
        setError(err.message || 'Failed to send OTP');
      }
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (index, value) => {
    // Only accept numeric input
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    // Auto-advance to next box
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move to previous box and clear it
        inputRefs.current[index - 1]?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    // Focus the next empty input or the last one
    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleVerify = async () => {
    const token = getToken();
    if (!token) return;

    const code = digits.join('');
    if (code.length !== 6 || loading || sending || isLocked) return;

    setLoading(true);
    setError(null);
    try {
      const result = await verifyTwoFactorOtp(token, { code });
      if (result.verified) {
        // Remember device if checked
        if (remember) {
          try {
            const deviceResult = await rememberDevice(token);
            if (deviceResult.device_token) {
              localStorage.setItem('device_token', deviceResult.device_token);
            }
          } catch (err) {
            console.error('Failed to remember device:', err);
            // Continue anyway — device not remembered but 2FA passed
          }
        }
        sessionStorage.removeItem('pending_2fa');
        const role = userRole || '';
        if (role === 'admin' || role === 'business') {
          router.push('/dashboard/business');
        } else if (role === 'customer') {
          router.push('/shop');
        } else {
          router.push('/');
        }
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
    const token = getToken();
    if (!token) return;

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
        setCountdown(err.retryAfter ?? 30);
      } else {
        setError(err.message || 'Failed to resend OTP');
        setCanResend(true);
      }
    } finally {
      setSending(false);
    }
  };

  // Locked state UI
  if (isLocked) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '20px',
      }}>
        <div style={{
          maxWidth: '440px',
          width: '100%',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          padding: '40px 32px',
          textAlign: 'center',
        }}>
          {/* Lock icon */}
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '20px' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>

          <h1 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            margin: '0 0 12px',
          }}>
            Account Temporarily Locked
          </h1>

          <p style={{
            fontSize: '14px',
            color: 'var(--red)',
            margin: '0 0 24px',
            lineHeight: '1.6',
          }}>
            Too many attempts. Try again after {lockedUntil || '10 minutes'}.
          </p>

          <button
            onClick={() => router.push('/')}
            style={{
              width: '100%',
              height: '48px',
              background: 'var(--gold)',
              color: 'var(--bg)',
              fontWeight: '600',
              fontSize: '15px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '440px',
        width: '100%',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '40px 32px',
        textAlign: 'center',
      }}>
        {/* Lock icon */}
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '20px' }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        <h1 style={{
          fontSize: '24px',
          fontWeight: '600',
          color: 'var(--text-primary)',
          margin: '0 0 8px',
        }}>
          Two-Factor Authentication
        </h1>

        <p style={{
          fontSize: '14px',
          color: 'var(--text-muted)',
          margin: '0 0 4px',
          lineHeight: '1.6',
        }}>
          A 6-digit code was sent to your email.
        </p>

        {userEmail && (
          <p style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            margin: '0 0 28px',
          }}>
            {maskEmail(userEmail)}
          </p>
        )}

        {/* OTP Input — 6 digit boxes */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '16px',
        }}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInputChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={loading || sending}
              style={{
                width: '48px',
                height: '56px',
                fontSize: '24px',
                textAlign: 'center',
                border: `1px solid ${digit ? 'var(--gold)' : 'var(--border)'}`,
                borderRadius: '8px',
                background: digit ? 'var(--bg)' : 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--gold)';
              }}
              onBlur={(e) => {
                if (!digit) e.target.style.borderColor = 'var(--border)';
              }}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p style={{
            fontSize: '13px',
            color: 'var(--red)',
            margin: '0 0 16px',
            minHeight: '20px',
          }}>
            {error}
          </p>
        )}
        {!error && <div style={{ minHeight: '20px', marginBottom: '16px' }} />}

        {/* Verify Button */}
        <button
          onClick={handleVerify}
          disabled={loading || sending || digits.join('').length !== 6}
          style={{
            width: '100%',
            height: '48px',
            background: loading || sending || digits.join('').length !== 6 ? 'var(--border)' : 'var(--gold)',
            color: 'var(--bg)',
            fontWeight: '600',
            fontSize: '15px',
            border: 'none',
            borderRadius: '8px',
            cursor: loading || sending || digits.join('').length !== 6 ? 'not-allowed' : 'pointer',
            opacity: loading || sending || digits.join('').length !== 6 ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {loading ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Verifying...
            </>
          ) : (
            'Verify'
          )}
        </button>

        {/* Remember this device */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginTop: '16px',
        }}>
          <input
            type="checkbox"
            id="remember-device"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{
              width: '16px',
              height: '16px',
              accentColor: 'var(--gold)',
              cursor: 'pointer',
            }}
          />
          <label
            htmlFor="remember-device"
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Remember this device
          </label>
        </div>

        {/* Resend row */}
        <div style={{
          marginTop: '24px',
          fontSize: '14px',
          color: 'var(--text-muted)',
        }}>
          Didn&apos;t receive a code?{' '}
          <button
            onClick={handleResend}
            disabled={!canResend}
            style={{
              background: 'none',
              border: 'none',
              color: canResend ? 'var(--gold)' : 'var(--text-muted)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: canResend ? 'pointer' : 'not-allowed',
              textDecoration: canResend ? 'underline' : 'none',
              padding: 0,
            }}
          >
            {canResend ? 'Resend code' : `Resend in ${countdown}s`}
          </button>
        </div>
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
