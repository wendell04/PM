'use client';

/**
 * Settings > Payments: which ways the shop takes money, and the smallest online payment.
 *
 * It lived in the Homepage editor because the footer shows the logos, but it decides what every
 * checkout, My Orders and the emailed pay link offer - a shop decision, not page copy. The server
 * refuses to turn off the last online method: deposits, design fees and pay links need one.
 */

import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const METHODS = [
  { id: 'cod',     label: 'Cash on Delivery',    sub: 'Paid to the rider. Never offered on orders that need a deposit.', online: false },
  { id: 'gcash',   label: 'GCash',               sub: 'Through PayMongo.', online: true },
  { id: 'paymaya', label: 'Maya',                sub: 'Through PayMongo.', online: true },
  { id: 'card',    label: 'Credit / Debit Card', sub: 'Visa and Mastercard through PayMongo, with the bank\'s 3D Secure check.', online: true },
];
const ALL_ON = { cod: true, gcash: true, paymaya: true, card: true };

const inputStyle = { width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--dark2)', color: 'var(--white)', fontSize: '0.9rem', boxSizing: 'border-box' };

export default function PaymentsPanel({ token, readOnly, minOnline, setMinOnline, saveMin }) {
  const [enabled, setEnabled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  useEffect(() => {
    let dead = false;
    fetchWithTimeout(`${API_URL}/api/storefront/content/payment_methods`, { headers: { Accept: 'application/json' } }, 15000)
      .then(r => r.json()).then(d => {
        const e = d?.data?.enabled;
        if (!dead) setEnabled(e && typeof e === 'object' ? { ...ALL_ON, ...e } : ALL_ON);
      })
      .catch(() => { if (!dead) setEnabled(ALL_ON); });
    return () => { dead = true; };
  }, []);

  const onlineOn = enabled ? METHODS.filter(m => m.online && enabled[m.id] !== false).length : 0;

  const toggle = (m) => {
    const on = enabled[m.id] !== false;
    // The one rule, said where it applies rather than after a failed save.
    if (on && m.online && onlineOn === 1) {
      setNotice({ type: 'error', text: `Keep at least one online method on. ${m.label} is the last one - deposits, design fees and pay links can only be paid online.` });
      return;
    }
    setNotice({ type: '', text: '' });
    setEnabled(p => ({ ...p, [m.id]: !on }));
  };

  const save = async () => {
    setBusy(true); setNotice({ type: '', text: '' });
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/content/payment_methods`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: { enabled } }),
      }, 15000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not save. Try again.');
      // Not loaded yet means unknown, not empty: saving the default then would overwrite the real value.
      if (minOnline != null) await saveMin(Math.min(5000, Math.max(20, parseInt(minOnline, 10) || 100)));
      setNotice({ type: 'success', text: 'Saved. Checkout, My Orders and pay links use these now.' });
    } catch (e) {
      setNotice({ type: 'error', text: e.message || 'Could not save. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return <div style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>Loading...</div>;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)', margin: '0 0 0.35rem' }}>Payment methods</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>
          What customers can pay with at checkout, in My Orders and on the pay link in their email. A method turned off
          also drops its logo from the homepage footer. At least one online method stays on.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {METHODS.map(m => {
          const on = enabled[m.id] !== false;
          const locked = on && m.online && onlineOn === 1;
          return (
            <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.8rem 1rem', background: 'var(--dark2)', display: 'flex', alignItems: 'center', gap: '0.9rem', opacity: on ? 1 : 0.65 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)' }}>
                  {m.label}
                  <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 600, color: 'var(--gray)', letterSpacing: '.03em' }}>{m.online ? 'ONLINE' : 'IN PERSON'}</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--gray)', marginTop: 2 }}>
                  {m.sub}{locked ? ' The last online method - it stays on.' : ''}
                </div>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: on ? 'var(--gold)' : 'var(--gray)', minWidth: 28 }}>{on ? 'ON' : 'OFF'}</span>
              <button type="button" role="switch" aria-checked={on} aria-label={`${m.label} ${on ? 'on' : 'off'}`}
                disabled={readOnly} onClick={() => toggle(m)}
                style={{ flex: '0 0 auto', width: 46, height: 26, borderRadius: 999, border: 'none', cursor: readOnly ? 'default' : 'pointer', background: on ? 'linear-gradient(135deg,var(--gold-light),var(--gold-dark))' : 'var(--dark3)', position: 'relative', transition: 'background 0.18s', opacity: locked ? 0.75 : 1 }}>
                <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--dark)', transition: 'left 0.18s' }} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="pmp-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: '0.5rem 1.5rem', alignItems: 'start' }}>
        <div>
          <label htmlFor="set-min-online" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gray-light)', marginBottom: '0.35rem' }}>
            Minimum online payment (PHP)
          </label>
          <input id="set-min-online" type="text" inputMode="numeric" maxLength={4} disabled={readOnly}
            value={minOnline ?? ''} onChange={e => setMinOnline(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="100" style={inputStyle} />
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--gray)', margin: '0.35rem 0 0', lineHeight: 1.5 }}>
          The smallest amount a customer can pay by GCash, Maya or card. A deposit under it is raised to it (never past the order total).
          Lowest allowed is 20, which is PayMongo&apos;s own minimum.
        </p>
      </div>

      {notice.text && (
        <div role={notice.type === 'error' ? 'alert' : 'status'} style={{ fontSize: '0.8rem', lineHeight: 1.5, padding: '0.6rem 0.8rem', borderRadius: 8,
          background: notice.type === 'error' ? 'var(--st-red-bg)' : 'var(--st-green-bg)', color: notice.type === 'error' ? 'var(--st-red-fg)' : 'var(--st-green-fg)' }}>
          {notice.text}
        </div>
      )}

      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={save} disabled={busy}
            style={{ padding: '0.6rem 1.4rem', borderRadius: 8, border: 'none', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', background: 'linear-gradient(135deg,var(--gold-light),var(--gold-dark))', color: '#1a1a1a', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
