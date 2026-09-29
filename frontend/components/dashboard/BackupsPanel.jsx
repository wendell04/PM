'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const when = (iso) => iso
  ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '-';
const kb = (b) => (b == null ? '-' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const STATUS = {
  ok:         { label: 'Saved to cloud', fg: 'var(--st-green-fg)',  bg: 'var(--st-green-bg)' },
  local_only: { label: 'Server only',    fg: 'var(--st-orange-fg)', bg: 'var(--st-orange-bg)' },
  failed:     { label: 'Failed',         fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
  running:    { label: 'Running',        fg: 'var(--gray)',         bg: 'var(--dark)' },
};

/**
 * Settings > Backups. When the last good backup was made, where it is, and a button to make one now.
 * A copy kept only on the server does not count: Railway wipes that disk on every deploy.
 */
export default function BackupsPanel({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/backups`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not load backups.');
      setData(d.data ?? d);
      setError('');
    } catch (e) { setError(e.message); }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const runNow = async () => {
    setBusy(true); setNote(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/backups/run`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 180000);
      const d = await res.json().catch(() => ({}));
      setNote({ ok: res.ok, text: d.message || (res.ok ? 'Backup saved.' : 'Backup failed.') });
    } catch (e) {
      setNote({ ok: false, text: e.message || 'Backup failed.' });
    } finally {
      setBusy(false);
      load();
    }
  };

  const lastGoodHours = data?.lastGood ? (Date.now() - new Date(data.lastGood).getTime()) / 3600000 : null;
  const health = !data ? null
    : !data.cloudConfigured ? { tone: 'bad', text: 'Cloud storage is not set up. Backups stay on the server and are wiped on every deploy, so there is no usable backup.' }
    : lastGoodHours == null ? { tone: 'bad', text: 'No backup has reached cloud storage yet. Press Back up now.' }
    : lastGoodHours > 26 ? { tone: 'warn', text: `The last good backup is ${Math.round(lastGoodHours)} hours old. The nightly one may have failed; check the list below.` }
    : { tone: 'good', text: `Last good backup ${when(data.lastGood)}, stored in cloud storage.` };
  const toneColor = { good: 'var(--st-green-fg)', warn: 'var(--st-orange-fg)', bad: 'var(--st-red-fg)' };
  const toneBg = { good: 'var(--st-green-bg)', warn: 'var(--st-orange-bg)', bad: 'var(--st-red-bg)' };

  return (
    <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Database backups</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
            {data ? `${data.schedule}, encrypted, kept ${data.keepDays} days.` : 'Loading...'}
          </div>
        </div>
        <button type="button" onClick={runNow} disabled={busy || !data}
          style={{ padding: '0.55rem 1rem', borderRadius: 8, border: '1px solid var(--gold)', background: 'var(--gold)', color: '#111', fontWeight: 700, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Backing up...' : 'Back up now'}
        </button>
      </div>

      <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {error && <div style={{ fontSize: '0.82rem', color: 'var(--st-red-fg)' }}>{error}</div>}
        {health && (
          <div style={{ padding: '0.7rem 0.9rem', borderRadius: 8, background: toneBg[health.tone], color: toneColor[health.tone], fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.5 }}>
            {health.text}
          </div>
        )}
        {note && <div style={{ fontSize: '0.82rem', color: note.ok ? 'var(--st-green-fg)' : 'var(--st-red-fg)' }}>{note.text}</div>}

        {data?.runs?.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>{['When', 'Result', 'Size', 'Records', 'By'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray)', padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data.runs.map(r => {
                  const st = STATUS[r.status] ?? STATUS.failed;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{when(r.startedAt)}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.fg, fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{st.label}</span>
                        {r.error && <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: 3, maxWidth: 420 }}>{r.error}</div>}
                      </td>
                      <td style={{ padding: '7px 8px', fontVariantNumeric: 'tabular-nums' }}>{kb(r.sizeBytes)}</td>
                      <td style={{ padding: '7px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.documents ?? '-'}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--gray)' }}>{r.trigger === 'manual' ? (r.by || 'Manual') : 'Nightly'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--gray)', lineHeight: 1.6 }}>
          To restore, a developer runs <code>php artisan db:restore NAME --into=personalizeme_restore</code>. It restores into a separate
          database for checking first and never overwrites the live one.
        </p>
      </div>
    </div>
  );
}
