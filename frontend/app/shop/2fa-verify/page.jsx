'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { sendTwoFactorOtp, verifyTwoFactorOtp, rememberDevice } from '@/lib/authApi';

function getToken() {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}
function getUser() {
  return sessionStorage.getItem('auth_user') || localStorage.getItem('auth_user');
}

export default function ShopTwoFactorVerifyPage() {
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

  const maskEmail = (email) => {
    if (!email) return '';
    const [local, domain] = email.split(' @');
    return local.slice(0, 2) + '*** @' + domain;
  };

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); setCanResend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // On mount: guard, read user, send OTP
  useEffect(() => {
    const token = getToken();
    if (!token) { router.push('/shop'); return; }
    const pending = sessionStorage.getItem('pending_2fa');
    if (!pending) { router.push('/shop'); return; }
    const userStr = getUser();
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserEmail(user.email || '');
      } catch {}
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
    const token = getToken();
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
          } catch {}
        }
        sessionStorage.removeItem('pending_2fa');
        router.push('/shop');
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

  if (isLocked) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0f0f0f', padding: '20px',
      }}>
        <div style={{
          maxWidth: '440px', width: '100%', background: '#161616',
          borderRadius: '16px', border: '1px solid rgba(255,255,255,0.07)',
          padding: '40px 32px', textAlign: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
            stroke="#d4a843" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" style={{ marginBottom: '20px' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <h1 style={{ fontSize: '22px', fontWeight: 700,
            color: '#f5f5f5', margin: '0 0 12px' }}>
            Account Temporarily Locked
          </h1>
          <p style={{ fontSize: '14px', color: '#ef4444',
            margin: '0 0 24px', lineHeight: 1.6 }}>
            Too many attempts. Try again after {lockedUntil || '10 minutes'}.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem('pending_2fa');
              router.push('/shop');
            }}
            style={{
              width: '100%', height: '48px',
              background: 'linear-gradient(135deg, #d4a843 0%, #c4963a 100%)',
              color: '#0f0f0f', fontWeight: 700, fontSize: '15px',
              border: 'none', borderRadius: '10px', cursor: 'pointer',
            }}
          >
            Back to Shop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f0f0f', padding: '20px',
    }}>
      <div style={{
        maxWidth: '440px', width: '100%', background: '#161616',
        borderRadius: '16px', border: '1px solid rgba(255,255,255,0.07)',
        padding: '40px 32px', textAlign: 'center',
      }}>
        {/* Shield icon */}
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: 'rgba(212,168,67,0.1)',
          border: '1px solid rgba(212,168,67,0.25)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 20px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="#d4a843" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 700,
          color: '#f5f5f5', margin: '0 0 8px' }}>
          Verify Your Identity
        </h1>
        <p style={{ fontSize: '14px', color: '#888',
          margin: '0 0 4px', lineHeight: 1.6 }}>
          A 6-digit code was sent to your email.
        </p>
        {userEmail && (
          <p style={{ fontSize: '13px', color: '#666', margin: '0 0 28px' }}>
            {maskEmail(userEmail)}
          </p>
        )}

        {/* 6-digit OTP boxes */}
        <div style={{
          display: 'flex', justifyContent: 'center',
          gap: '8px', marginBottom: '16px',
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
                width: '48px', height: '56px', fontSize: '24px',
                textAlign: 'center', borderRadius: '10px',
                border: `1px solid ${digit
                  ? 'rgba(212,168,67,0.6)'
                  : 'rgba(255,255,255,0.1)'}`,
                background: digit
                  ? 'rgba(212,168,67,0.06)'
                  : '#1a1a1a',
                color: '#f5f5f5', outline: 'none',
                transition: 'all 0.2s',
                fontFamily: 'monospace',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(212,168,67,0.6)';
              }}
              onBlur={(e) => {
                if (!digit)
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
              }}
            />
          ))}
        </div>

        {/* Error */}
        <div style={{ minHeight: '24px', marginBottom: '12px' }}>
          {error && (
            <p style={{ fontSize: '13px', color: '#ef4444', margin: 0 }}>
              {error}
            </p>
          )}
        </div>

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={loading || sending || digits.join('').length !== 6}
          style={{
            width: '100%', height: '48px',
            background: (loading || sending || digits.join('').length !== 6)
              ? 'rgba(255,255,255,0.08)'
              : 'linear-gradient(135deg, #d4a843 0%, #c4963a 100%)',
            color: (loading || sending || digits.join('').length !== 6)
              ? '#555'
              : '#0f0f0f',
            fontWeight: 700, fontSize: '15px',
            border: 'none', borderRadius: '10px',
            cursor: (loading || sending || digits.join('').length !== 6)
              ? 'not-allowed'
              : 'pointer',
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
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '8px', marginTop: '16px',
        }}>
          <input
            type="checkbox"
            id="shop-remember-device"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: '16px', height: '16px',
              accentColor: '#d4a843', cursor: 'pointer' }}
          />
          <label htmlFor="shop-remember-device" style={{
            fontSize: '14px', color: '#888', cursor: 'pointer',
          }}>
            Remember this device
          </label>
        </div>

        {/* Resend */}
        <div style={{ marginTop: '24px', fontSize: '14px', color: '#666' }}>
          Didn&apos;t receive a code?{' '}
          <button
            onClick={handleResend}
            disabled={!canResend}
            style={{
              background: 'none', border: 'none',
              color: canResend ? '#d4a843' : '#555',
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
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
