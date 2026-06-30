'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Warn an active customer this long before their session actually expires.
const WARN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function SessionExpiryWarning() {
  const { expiresAt, refreshSession, logout, currentUser } = useAuth();
  const [msLeft, setMsLeft] = useState(Infinity);
  const [show, setShow] = useState(false);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    if (!expiresAt || currentUser?.role !== 'customer') {
      setShow(false);
      return;
    }
    const expMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expMs)) return;

    const tick = () => {
      const left = expMs - Date.now();
      setMsLeft(left);
      if (left <= 0) {
        setShow(false);
        logout();
      } else {
        setShow(left <= WARN_THRESHOLD_MS);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, currentUser, logout]);

  const stayLoggedIn = useCallback(async () => {
    setExtending(true);
    const ok = await refreshSession();
    setExtending(false);
    if (ok) setShow(false);
  }, [refreshSession]);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: '400px',
          background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '14px',
          padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', textAlign: 'center',
        }}
      >
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%', margin: '0 auto 1rem',
          background: 'var(--st-amber-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--st-amber-fg)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
        </div>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>
          Your session is about to expire
        </h2>
        <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', color: 'var(--gray)' }}>
          For your security, you&apos;ll be signed out in
        </p>
        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums', marginBottom: '1.25rem' }}>
          {fmt(msLeft)}
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button
            type="button"
            onClick={logout}
            style={{
              flex: 1, padding: '0.6rem', borderRadius: '8px', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray)',
              fontSize: '0.85rem', fontWeight: 600,
            }}
          >
            Log out
          </button>
          <button
            type="button"
            onClick={stayLoggedIn}
            disabled={extending}
            style={{
              flex: 1, padding: '0.6rem', borderRadius: '8px', cursor: extending ? 'default' : 'pointer',
              background: 'var(--gold)', border: 'none', color: '#1a1a1a',
              fontSize: '0.85rem', fontWeight: 700, opacity: extending ? 0.6 : 1,
            }}
          >
            {extending ? 'Staying in…' : 'Stay logged in'}
          </button>
        </div>
      </div>
    </div>
  );
}
