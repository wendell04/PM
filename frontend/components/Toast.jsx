'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg, duration) => addToast(msg, 'success', duration),
    error:   (msg, duration) => addToast(msg, 'error',   duration),
    info:    (msg, duration) => addToast(msg, 'info',    duration),
    warning: (msg, duration) => addToast(msg, 'warning', duration),
  };

  const colorMap = {
    success: { bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)',  text: '#4ade80', icon: '✓' },
    error:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#ef4444', icon: '✕' },
    warning: { bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.3)',   text: '#eab308', icon: '!' },
    info:    { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  text: '#60a5fa', icon: 'i' },
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        pointerEvents: 'none',
        maxWidth: '360px',
        width: 'calc(100vw - 2rem)',
      }}>
        {toasts.map(t => {
          const c = colorMap[t.type] || colorMap.info;
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.625rem',
                padding: '0.75rem 1rem',
                background: 'var(--dark2, #1a1a1a)',
                border: `1px solid ${c.border}`,
                borderLeft: `3px solid ${c.text}`,
                borderRadius: '10px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                pointerEvents: 'auto',
                animation: 'toast-in 0.2s ease',
              }}
            >
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: c.bg,
                color: c.text,
                fontSize: '0.65rem',
                fontWeight: 900,
                flexShrink: 0,
                marginTop: '1px',
              }}>
                {c.icon}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--white, #f5f5f5)', lineHeight: 1.5, flex: 1 }}>
                {t.message}
              </span>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--gray, #888)', cursor: 'pointer',
                  padding: '0', fontSize: '0.9rem', flexShrink: 0, lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
