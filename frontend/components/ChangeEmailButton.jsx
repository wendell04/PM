'use client';

import { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import useLockBodyScroll from '@/lib/useLockBodyScroll';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Change email, the safe way: the current password, then a 6-digit code sent to the NEW address.
 * The account only moves once the code comes back, the old address is told, and other devices are
 * signed out. Used on the staff Settings profile and the shop profile.
 */
export default function ChangeEmailButton({ token, currentEmail, onChanged, style }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('ask');          // ask -> code
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  useLockBodyScroll(open);

  const close = () => { setOpen(false); setStep('ask'); setEmail(''); setPassword(''); setCode(''); setError(''); setNote(''); };
  const call = async (path, body) => {
    const res = await fetchWithTimeout(`${API_URL}/api/profile/email${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 30000);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.errors ? Object.values(d.errors).flat()[0] : (d.message || 'Something went wrong. Try again.'));
    return d;
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password) { setError('Enter the new email and your current password.'); return; }
    setBusy(true); setError('');
    try {
      const d = await call('', { email: email.trim(), currentPassword: password });
      setNote(d.message || `We sent a code to ${email.trim()}.`);
      setPassword(''); setStep('code');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const confirm = async (e) => {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError('The code is 6 digits.'); return; }
    setBusy(true); setError('');
    try {
      const d = await call('/confirm', { code });
      const newEmail = d?.data?.email ?? email.trim();
      try {
        const u = JSON.parse(localStorage.getItem('auth_user') || 'null');
        if (u) localStorage.setItem('auth_user', JSON.stringify({ ...u, email: newEmail }));
      } catch {}
      onChanged?.(newEmail, d.message);
      close();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const input = { width: '100%', padding: '0.625rem 0.75rem', background: 'var(--dark3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--white)', fontSize: '0.875rem', boxSizing: 'border-box' };
  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-light)', marginBottom: 6 };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--white)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', ...style }}>
        Change email
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Change email" onClick={(e) => { if (e.target === e.currentTarget && !busy) close(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onSubmit={step === 'ask' ? sendCode : confirm}
            style={{ width: '100%', maxWidth: 420, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Change email</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: 4, lineHeight: 1.5 }}>
                {step === 'ask'
                  ? <>Now: <b style={{ color: 'var(--gray-light)' }}>{currentEmail}</b>. We send a code to the new address; nothing changes until you enter it.</>
                  : note}
              </div>
            </div>
            {step === 'ask' ? (
              <>
                <div>
                  <label style={label} htmlFor="ce-email">New email</label>
                  <input id="ce-email" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={100} autoComplete="email" autoFocus style={input} />
                </div>
                <div>
                  <label style={label} htmlFor="ce-pass">Current password</label>
                  <input id="ce-pass" type="password" value={password} onChange={e => setPassword(e.target.value)} maxLength={128} autoComplete="current-password" style={input} />
                </div>
              </>
            ) : (
              <div>
                <label style={label} htmlFor="ce-code">6-digit code</label>
                <input id="ce-code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} autoComplete="one-time-code" autoFocus
                  style={{ ...input, fontSize: '1.2rem', letterSpacing: '0.35em', textAlign: 'center' }} />
              </div>
            )}
            {error && <div style={{ fontSize: '0.8rem', color: 'var(--st-red-fg, #dc2626)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={close} disabled={busy}
                style={{ padding: '0.55rem 1rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--gray-light)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busy}
                style={{ padding: '0.55rem 1rem', background: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 8, color: '#111', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? 'Please wait...' : step === 'ask' ? 'Send code' : 'Change email'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
