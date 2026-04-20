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
  }, []);

  if (!ready) return null;

  return (
    <TwoFactorModal
      token={token}
      userEmail={userEmail}
      userRole={userRole}
      onSuccess={(redirectTo) => {
        // OTP verified — now write credentials to final storage
        const pendingToken = sessionStorage.getItem('pmp_pending_token');
        const pendingUserRaw = sessionStorage.getItem('pmp_pending_user');
        const remember = sessionStorage.getItem('pmp_pending_remember') === '1';

        if (pendingToken && pendingUserRaw) {
          const storage = remember ? localStorage : sessionStorage;
          storage.setItem('auth_token', pendingToken);
          storage.setItem('auth_user', pendingUserRaw);
          try {
            const bc = new BroadcastChannel('pmp_auth');
            bc.postMessage({
              type: 'AUTH_UPDATE',
              token: pendingToken,
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
