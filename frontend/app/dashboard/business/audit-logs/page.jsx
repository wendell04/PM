'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  S, ICONS, CustomSelect, EmptyState, PaginationBar, SearchBar, SummaryCard,
} from '../inventory-v2/shared';
import { useIsPhone, KpiStrip, PhoneList, PhoneRow, PhoneSheet } from '@/components/dashboard/phone';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * The audit trail.
 *
 * This page used to read /api/admin/audit-logs, which despite its name is the INVENTORY movement
 * log - so the security screen was showing Total Stock In, Total Stock Out, Total Sales and Total
 * Restocks, four figures that belong to the inventory module and say nothing whatever about who
 * has been in the system. It reads activity_logs now, which is the record of who did what, from
 * where, and when: sign-ins and the ones that were refused, password changes, permission changes,
 * staff added and removed, settings moved, orders and money touched - and this page being opened,
 * because "who had access, including me looking at it" is exactly what an audit trail is for.
 */

// How each kind of entry reads at a glance. Colour carries the same meaning as everywhere else in
// the dashboard: red is a refusal, amber is a change to who can do what, green is ordinary access.
// 'all' rather than an empty string: CustomSelect shows its placeholder when the value is empty,
// so the filter read "Select..." while it was in fact showing everything.
const GROUPS = [
  { id: 'all',      label: 'Everything' },
  { id: 'access',   label: 'Getting in' },
  { id: 'account',  label: 'Accounts' },
  { id: 'people',   label: 'Staff and permissions' },
  { id: 'orders',   label: 'Orders' },
  { id: 'money',    label: 'Money' },
  { id: 'catalog',  label: 'Catalogue' },
  { id: 'stock',    label: 'Stock' },
  { id: 'settings', label: 'Settings' },
];

// Keyed on the action names the server actually writes. Anything not named here falls back to
// its GROUP, so a new kind of entry arrives in a sensible colour instead of grey - and the map
// cannot silently go stale the way a per-action list does.
const TONE = {
  'auth.login':           { fg: 'var(--st-green-fg)',  bg: 'var(--st-green-bg)' },
  'auth.2fa_passed':      { fg: 'var(--st-green-fg)',  bg: 'var(--st-green-bg)' },
  'auth.logout':          { fg: 'var(--st-gray-fg)',   bg: 'var(--st-gray-bg)' },
  'audit.viewed':         { fg: 'var(--st-gray-fg)',   bg: 'var(--st-gray-bg)' },
  'auth.login_failed':    { fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
  'auth.login_locked':    { fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
  'auth.2fa_failed':      { fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
  'auth.2fa_disabled':    { fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
  'auth.password_reset':  { fg: 'var(--st-amber-fg)',  bg: 'var(--st-amber-bg)' },
  'auth.password_changed':{ fg: 'var(--st-amber-fg)',  bg: 'var(--st-amber-bg)' },
  'auth.session_revoked': { fg: 'var(--st-amber-fg)',  bg: 'var(--st-amber-bg)' },
  'auth.2fa_enabled':     { fg: 'var(--st-green-fg)',  bg: 'var(--st-green-bg)' },
  'user.deleted':         { fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
  'role.deleted':         { fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
  'job_order_deleted':    { fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
  'design_rejected':      { fg: 'var(--st-red-fg)',    bg: 'var(--st-red-bg)' },
};

// The fallback: colour by what KIND of thing it was, so nothing lands as an unexplained grey.
const GROUP_TONE = {
  access:   { fg: 'var(--st-gray-fg)',   bg: 'var(--st-gray-bg)' },
  people:   { fg: 'var(--st-amber-fg)',  bg: 'var(--st-amber-bg)' },
  orders:   { fg: 'var(--st-blue-fg)',   bg: 'var(--st-blue-bg)' },
  money:    { fg: 'var(--st-orange-fg)', bg: 'var(--st-orange-bg)' },
  catalog:  { fg: 'var(--st-blue-fg)',   bg: 'var(--st-blue-bg)' },
  settings: { fg: 'var(--st-purple-fg)', bg: 'var(--st-purple-bg)' },
};

const toneFor = (action, group) =>
  TONE[action] ?? GROUP_TONE[group] ?? { fg: 'var(--st-gray-fg)', bg: 'var(--st-gray-bg)' };

/** "Chrome on Windows" out of a user-agent string nobody should have to read. */
function readDevice(ua) {
  if (!ua) return '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os = /Windows NT/.test(ua) ? 'Windows'
    : /Macintosh/.test(ua) ? 'Mac'
    : /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  return os ? `${browser} on ${os}` : browser;
}

function whenText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function AuditLogsPage() {
  const { token } = useAuth();

  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [group, setGroup] = useState('all');
  const [range, setRange] = useState('7');       // days, or 'all'
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [openId, setOpenId] = useState(null);
  // The dashboard's phone kit, the same one Orders, Payments and the inventory tabs use. A row
  // that is a person, a badge, a time and an address does not survive being squeezed to 360px -
  // on a phone it becomes a list and a full-screen sheet instead.
  const isPhone = useIsPhone();

  const startDate = useMemo(() => {
    if (range === 'all') return '';
    const d = new Date();
    d.setDate(d.getDate() - Number(range));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [range]);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const p = new URLSearchParams();
      p.set('limit', '200');
      if (group && group !== 'all') p.set('group', group);
      if (startDate) p.set('startDate', startDate);
      if (query.trim()) p.set('q', query.trim());

      const sp = new URLSearchParams();
      if (startDate) sp.set('startDate', startDate);

      const [logsRes, sumRes] = await Promise.all([
        fetchWithTimeout(`${API_URL}/api/admin/activity-logs?${p}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 20000),
        fetchWithTimeout(`${API_URL}/api/admin/activity-logs/summary?${sp}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 20000),
      ]);

      const logsData = await logsRes.json();
      if (!logsRes.ok) throw new Error(logsData.message || 'Could not load the audit trail.');
      setLogs(logsData.data?.data ?? []);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData.data ?? null);
      }
    } catch (e) {
      setError(e.message || 'Could not load the audit trail.');
    } finally {
      setIsLoading(false);
    }
  }, [token, group, startDate, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [group, range, query]);

  const paged = logs.slice((page - 1) * perPage, page * perPage);
  const rangeLabel = range === 'all' ? 'all time' : range === '1' ? 'today' : `the last ${range} days`;

  return (
    <ErrorBoundary>
      <div style={{ ...S.page, padding: '24px' }}>

        {/* What this screen is, said once. It is easy to mistake for the inventory log next to
            it in the sidebar - which is exactly the mistake this page itself used to make. */}
        <div style={{ ...S.card, padding: '12px 16px', marginBottom: 16, fontSize: 12.5, color: 'var(--gray-light)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--white)' }}>The audit trail</b> is who did what in this system, from
          where, and when: every sign-in and every one that was refused, passwords and 2FA, staff added
          or removed, permissions widened, settings moved, orders and money touched. Opening this page
          is recorded too. For where the <i>material</i> went - stock in, stock out, corrections -
          that is Inventory, not here.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>Audit Logs</h1>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
              Showing {logs.length} entr{logs.length === 1 ? 'y' : 'ies'} from {rangeLabel}
            </div>
          </div>
          <button type="button" onClick={load} disabled={isLoading} aria-label="Reload the audit trail"
            style={{ ...S.btnGhost, opacity: isLoading ? 0.6 : 1 }}>
            {ICONS.refresh ?? null}
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* The four figures a security screen is actually for. Access and change - not stock. */}
        {summary && isPhone && (
          <KpiStrip items={[
            { key: 'in',      value: summary.signIns ?? 0, label: 'Sign-ins' },
            { key: 'people',  value: summary.people ?? 0,  label: 'People' },
            { key: 'refused', value: summary.refused ?? 0, label: 'Refused',
              color: summary.refused > 0 ? 'var(--st-red-fg)' : undefined,
              title: summary.refused > 0 ? `from ${summary.refusedFrom} address(es)` : 'nothing turned away' },
            { key: 'changes', value: summary.changes ?? 0, label: 'Changes' },
          ]} />
        )}

        {summary && !isPhone && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <SummaryCard label="Sign-ins" value={summary.signIns ?? 0} sub={`in ${rangeLabel}`} accent />
            <SummaryCard label="People who signed in" value={summary.people ?? 0} sub="separate accounts" />
            <SummaryCard
              label="Refused"
              value={summary.refused ?? 0}
              sub={summary.refused > 0 ? `from ${summary.refusedFrom} address${summary.refusedFrom === 1 ? '' : 'es'}` : 'nothing turned away'}
              color={summary.refused > 0 ? 'var(--st-red-fg)' : 'var(--white)'}
            />
            <SummaryCard label="Changes made" value={summary.changes ?? 0} sub="not counting sign-ins" />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <SearchBar value={query} onChange={setQuery} placeholder="Search a person, an action, an address…" style={{ width: '100%' }} />
          </div>
          <CustomSelect
            value={group}
            onChange={setGroup}
            options={GROUPS.map(g => ({ value: g.id, label: g.label }))}
            style={{ flex: '0 0 200px' }}
          />
          <CustomSelect
            value={range}
            onChange={setRange}
            options={[
              { value: '1',  label: 'Today' },
              { value: '7',  label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
              { value: 'all', label: 'All time' },
            ]}
            style={{ flex: '0 0 160px' }}
          />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13,
            background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: '1px solid var(--st-red-fg)' }}>
            {error}
          </div>
        )}

        {/* Announced, so a screen reader is told when the list reloads under a filter rather
            than silently showing something else. */}
        <div role="feed" aria-busy={isLoading} aria-label="Audit trail entries"
          style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 20, display: 'grid', gap: 10 }}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ height: 46, borderRadius: 8, background: 'var(--dark2)', animation: 'pmPulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : paged.length === 0 ? (
            <div style={{ padding: 28 }}>
              <EmptyState
                message="Nothing recorded in this window"
                sub={query || group !== 'all' ? 'Try a wider date range, or clear the filters.' : 'Entries appear here as people sign in and change things.'}
              />
            </div>
          ) : isPhone ? (
            // A row here is a person, a badge, a time and an IP address. Squeezed to 360px that
            // becomes four things fighting for one line, so on a phone it is a list and the
            // detail opens full screen - the same shape Orders and Payments use.
            <PhoneList>
              {paged.map((l, i) => (
                <PhoneRow
                  key={l.id}
                  first={i === 0}
                  mono={false}
                  title={l.actorName}
                  chip={(
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                      background: toneFor(l.action, l.group).bg, color: toneFor(l.action, l.group).fg,
                    }}>{l.label}</span>
                  )}
                  meta={l.description}
                  sub={`${whenText(l.at)}${l.ip ? ' \u00b7 ' + l.ip : ''}`}
                  onClick={() => setOpenId(l.id)}
                />
              ))}
            </PhoneList>
          ) : (
            paged.map((l, i) => {
              const tone = toneFor(l.action, l.group);
              const open = openId === l.id;
              const device = readDevice(l.device);
              return (
                <div key={l.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : l.id)}
                    aria-expanded={open}
                    aria-label={`${l.actorName}: ${l.label}. ${l.description}`}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                      background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    {/* Who, not what - a security log is read by looking for a person first. */}
                    <span aria-hidden="true" style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                      background: tone.bg, color: tone.fg,
                    }}>{initialsOf(l.actorName)}</span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>{l.actorName}</span>
                        {l.actorRole && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--gray)' }}>
                            {l.actorRole}
                          </span>
                        )}
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                          background: tone.bg, color: tone.fg,
                        }}>{l.label}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--gray-light)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.description}
                      </span>
                    </span>

                    <span style={{ flexShrink: 0, textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gray)', whiteSpace: 'nowrap' }}>{whenText(l.at)}</span>
                      {l.ip && (
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray)', fontFamily: 'monospace' }}>{l.ip}</span>
                      )}
                    </span>
                  </button>

                  {open && (
                    <div style={{ padding: '0 14px 12px 58px', display: 'grid', gap: 5, fontSize: 11.5, color: 'var(--gray-light)' }}>
                      {l.actorEmail && <div><span style={{ color: 'var(--gray)' }}>Account:</span> {l.actorEmail}</div>}
                      <div><span style={{ color: 'var(--gray)' }}>When:</span> {l.at ? new Date(l.at).toLocaleString('en-PH') : 'unknown'}</div>
                      {l.ip && <div><span style={{ color: 'var(--gray)' }}>From:</span> {l.ip}{device ? ` - ${device}` : ''}</div>}
                      {l.entityType && (
                        <div>
                          <span style={{ color: 'var(--gray)' }}>About:</span> {l.entityType}
                          {l.entityId ? ` ${l.entityId}` : ''}
                        </div>
                      )}
                      {l.metadata && Object.keys(l.metadata).length > 0 && (
                        <div style={{ marginTop: 3 }}>
                          <span style={{ color: 'var(--gray)' }}>Details:</span>
                          <div style={{ marginTop: 3, padding: '7px 9px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 7, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {JSON.stringify(l.metadata, null, 2)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* The detail of one entry, full screen. The inline expansion the desktop uses has no
            room on a phone, and a modal has less. */}
        {isPhone && (() => {
          const l = paged.find(x => x.id === openId);
          if (!l) return null;
          const device = readDevice(l.device);
          const line = (label, value) => value ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--gray)', flexShrink: 0 }}>{label}</span>
              <span style={{ color: 'var(--white)', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
            </div>
          ) : null;
          return (
            <PhoneSheet
              open
              mono={false}
              title={l.actorName}
              subtitle={l.label}
              onClose={() => setOpenId(null)}
            >
              <div style={{ padding: '0 14px' }}>
                <div style={{ fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6, padding: '10px 0' }}>{l.description}</div>
                {line('Account', l.actorEmail)}
                {line('Role', l.actorRole)}
                {line('When', l.at ? new Date(l.at).toLocaleString('en-PH') : null)}
                {line('From', l.ip)}
                {line('Device', device)}
                {line('About', l.entityType ? `${l.entityType}${l.entityId ? ' ' + l.entityId : ''}` : null)}
                {l.metadata && Object.keys(l.metadata).length > 0 && (
                  <div style={{ padding: '10px 0' }}>
                    <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 5 }}>Details</div>
                    <div style={{ padding: '8px 10px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(l.metadata, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            </PhoneSheet>
          );
        })()}

        {logs.length > perPage && (
          <div style={{ marginTop: 12 }}>
            <PaginationBar
              total={logs.length}
              page={page}
              perPage={perPage}
              onPage={setPage}
              onPerPage={(n) => { setPerPage(n); setPage(1); }}
            />
          </div>
        )}
        {/* The skeleton's own keyframes - the dashboard declares them per page rather than
            globally, and a missing @keyframes is a skeleton that simply does not move. */}
        <style>{`@keyframes pmPulse { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }`}</style>
      </div>
    </ErrorBoundary>
  );
}
