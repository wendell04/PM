'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '24px',
      background: 'var(--bg, #0f0f0f)',
      color: 'var(--text, #f5f5f5)',
      fontFamily: 'inherit',
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Something went wrong</h2>
      <p style={{ fontSize: '0.875rem', color: '#888', margin: 0, textAlign: 'center', maxWidth: '360px' }}>
        An unexpected error occurred. You can try again or return to the home page.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={reset}
          style={{
            padding: '8px 20px',
            background: '#d4a843',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{
            padding: '8px 20px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'inherit',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Go home
        </button>
      </div>
    </div>
  );
}
