'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// Public site key (safe to expose). Overridable via NEXT_PUBLIC_TURNSTILE_SITE_KEY.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAD1-pxPTFv49e8yl';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/**
 * Cloudflare Turnstile (CAPTCHA) widget. Theme-aware (light/dark to match the app) and centered/
 * responsive. Calls onVerify(token) when solved, onVerify('') on expire/error. Tokens are
 * single-use — call the exposed reset() (via ref) after each submit for a fresh token.
 */
const Turnstile = forwardRef(function Turnstile({ onVerify, theme = 'light' }, ref) {
  const containerRef = useRef(null);
  const widgetIdRef  = useRef(null);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
          onVerify?.(''); // clear the stale token until the widget re-solves
        } catch { /* ignore */ }
      }
    },
  }), [onVerify]);

  useEffect(() => {
    let cancelled = false;
    let pollId = null;

    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current !== null) return; // guard against StrictMode double-mount
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: theme === 'dark' ? 'dark' : 'light',
          callback: (token) => onVerify?.(token),
          'expired-callback': () => onVerify?.(''),
          'error-callback': () => onVerify?.(''),
        });
      } catch { /* ignore duplicate render */ }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
        const s = document.createElement('script');
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      }
      pollId = setInterval(() => {
        if (window.turnstile) {
          clearInterval(pollId);
          pollId = null;
          renderWidget();
        }
      }, 200);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (widgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
        widgetIdRef.current = null;
      }
    };
    // Re-render when the theme changes so the widget matches light/dark.
  }, [onVerify, theme]);

  // Centered + never overflows narrow (mobile) screens.
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        maxWidth: '100%',
        overflowX: 'auto',
      }}
    >
      <div ref={containerRef} style={{ margin: '10px 0' }} />
    </div>
  );
});

export default Turnstile;
