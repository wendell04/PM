'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TwoFactorModal from '@/components/auth/TwoFactorModal';

function getToken() {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}
function getUser() {
  try {
    const raw = sessionStorage.getItem('auth_user') || localStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function TwoFactorChallengePage() {
  const router = useRouter();
  const [token, setToken]       = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole]   = useState('');
  const [ready, setReady]         = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace('/'); return; }
    const pending = sessionStorage.getItem('pending_2fa');
    if (!pending) { router.replace('/'); return; }
    const user = getUser();
    setToken(t);
    setUserEmail(user?.email || '');
    setUserRole(user?.role || '');
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <TwoFactorModal
      token={token}
      userEmail={userEmail}
      userRole={userRole}
      onSuccess={(redirectTo) => {
        window.location.href = redirectTo;
      }}
      onBack={() => {
        sessionStorage.removeItem('pending_2fa');
        sessionStorage.removeItem('post_2fa_redirect');
        router.replace('/');
      }}
    />
  );
}
