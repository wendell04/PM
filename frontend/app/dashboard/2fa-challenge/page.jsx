'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TwoFactorModal from '@/components/auth/TwoFactorModal';

export default function TwoFactorChallengePage() {
  const router = useRouter();
  const [token, setToken]         = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole]   = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [ready, setReady]         = useState(false);

  useEffect(() => {
    const check = () => {
      const pending = sessionStorage.getItem('pending_2fa');
      if (!pending) { router.replace('/'); return; }

      const pendingToken = sessionStorage.getItem('pmp_pending_token');
      if (!pendingToken) { router.replace('/'); return; }

      let pendingUser = null;
      try {
        pendingUser = JSON.parse(
          sessionStorage.getItem('pmp_pending_user') || 'null'
        );
      } catch {}

      const remember = sessionStorage.getItem('pmp_pending_remember') === '1';

      setToken(pendingToken);
      setUserEmail(pendingUser?.email || '');
      setUserRole(pendingUser?.role || '');
      setRememberMe(remember);
      setReady(true);
    };

    requestAnimationFrame(check);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (!ready) return null;

  return (
    <TwoFactorModal
      token={token}
      userEmail={userEmail}
      userRole={userRole}
      persistLogin={rememberMe}
      onSuccess={(redirectTo, sessionToken) => {
        // OTP verified — write the real full-access token (minted by the server on verify)
        // to final storage. The pending token never becomes a usable session.
        const finalToken = sessionToken || sessionStorage.getItem('pmp_pending_token');
        const pendingUserRaw = sessionStorage.getItem('pmp_pending_user');

        if (finalToken && pendingUserRaw) {
          // Always store in localStorage — AuthContext, the admin route guard, and the
          // shop all read auth from localStorage only. A sessionStorage token is invisible
          // to them, so the user would appear logged out and get bounced to the landing.
          // "Remember me" duration is enforced server-side by the token's expiry.
          localStorage.setItem('auth_token', finalToken);
          localStorage.setItem('auth_user', pendingUserRaw);
          try {
            const bc = new BroadcastChannel('pmp_auth');
            bc.postMessage({
              type: 'AUTH_UPDATE',
              token: finalToken,
              user: JSON.parse(pendingUserRaw),
            });
            bc.close();
          } catch {}
        }

        // Clean up pending keys
        sessionStorage.removeItem('pmp_pending_token');
        sessionStorage.removeItem('pmp_pending_user');
        sessionStorage.removeItem('pmp_pending_remember');
        sessionStorage.removeItem('pending_2fa');
        sessionStorage.removeItem('post_2fa_redirect');

        window.location.href = redirectTo;
      }}
      onBack={() => {
        // Clean up all pending keys on back/cancel
        sessionStorage.removeItem('pmp_pending_token');
        sessionStorage.removeItem('pmp_pending_user');
        sessionStorage.removeItem('pmp_pending_remember');
        sessionStorage.removeItem('pending_2fa');
        sessionStorage.removeItem('post_2fa_redirect');
        router.replace('/');
      }}
    />
  );
}
