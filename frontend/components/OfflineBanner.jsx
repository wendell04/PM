'use client';

import { useState, useEffect } from 'react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const onOffline = () => {
      setOffline(true);
      setJustReconnected(false);
    };
    const onOnline = () => {
      setOffline(false);
      setJustReconnected(true);
      setTimeout(() => setJustReconnected(false), 3000);
    };

    setOffline(!navigator.onLine);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline && !justReconnected) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99998,
      padding: '0.5rem 1rem',
      textAlign: 'center',
      fontSize: '0.8125rem',
      fontWeight: 600,
      letterSpacing: '0.02em',
      background: offline ? '#1a0a0a' : 'rgba(74,222,128,0.12)',
      borderBottom: `1px solid ${offline ? 'rgba(239,68,68,0.4)' : 'rgba(74,222,128,0.3)'}`,
      color: offline ? '#ef4444' : '#4ade80',
      transition: 'background 0.3s, color 0.3s',
    }}>
      {offline
        ? '⚠ You are offline — some features may be unavailable'
        : '✓ Back online'}
    </div>
  );
}
