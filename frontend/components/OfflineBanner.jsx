'use client';

import { useState, useEffect } from 'react';

/**
 * Connection status.
 *
 * This used to be a full-width bar pinned to top:0, plus a `--offline-banner-h` variable that pushed
 * the dashboard header down. Only the header consumed it, so the header slid down while the sidebar
 * stayed put and the bar covered the logo - losing connection broke the navigation, which is the
 * worst possible moment for that to happen.
 *
 * A status message must never move the page it is reporting on. So it is a floating pill in the
 * bottom corner instead: it overlaps nothing that is being used, needs no layout allowance from any
 * page, and works the same for the shop and the dashboard.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    let timer;

    const goOffline = () => {
      clearTimeout(timer);
      setOffline(true);
      setJustReconnected(false);
    };
    const goOnline = () => {
      setOffline(false);
      setJustReconnected(true);
      // Confirming the recovery matters as much as reporting the failure: without it the pill just
      // disappears and the reader is left unsure whether it is safe to retry what they were doing.
      timer = setTimeout(() => setJustReconnected(false), 4000);
    };

    setOffline(!navigator.onLine);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline && !justReconnected) return null;

  const tone = offline
    ? { bg: '#2a1113', border: 'rgba(239,68,68,0.45)', fg: '#fca5a5' }
    : { bg: '#0f2417', border: 'rgba(74,222,128,0.45)', fg: '#86efac' };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '20px',
        transform: 'translateX(-50%)',
        zIndex: 99998,
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '9px 15px',
        borderRadius: '999px',
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.fg,
        fontSize: '0.8125rem',
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
        animation: 'offlinePillIn 0.22s ease-out',
      }}
    >
      <style>{`@keyframes offlinePillIn {
        from { opacity: 0; transform: translate(-50%, 10px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
      }`}</style>

      {offline ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}

      <span>
        {offline
          ? 'No connection. Your changes will not save until this comes back.'
          : 'Back online'}
      </span>
    </div>
  );
}
