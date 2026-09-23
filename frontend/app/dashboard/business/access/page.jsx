'use client';
/**
 * Access - who works here and what each of them may do.
 *
 * Replaces the Staff and Permissions pair. There, access could only be set on a ROLE and a person
 * could only be handed one, so two people sharing a job title but not the same duties needed two
 * roles - and the role list turned into a list of individuals with extra steps. Here the ticks
 * live on the person and a role is a template that fills them in, which is how Shopify, Square
 * and Lightspeed all do it.
 *
 * Built beside the old screens so they can be deleted once this is proven on real staff.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { S, ICONS, SummaryCard, EmptyState, CustomSelect, SearchBar, ToastContainer, useToast, ConfirmModal } from '../inventory-v2/shared';
import { useIsPhone, PhoneList, PhoneRow, PhoneSheet } from '@/components/dashboard/phone';

// A long list cut to a few lines, with "Show all" only when something is actually hidden. An
// administrator's access ran to twelve lines and pushed every other row off the screen.
function Clamp({ lines = 3, children }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && !open) setOver(el.scrollHeight > el.clientHeight + 1);
  }, [children, open]);
  return (
    <div>
      <div ref={ref} style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {children}
      </div>
      {(over || open) && (
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Names: letters in any language, spaces, hyphens, apostrophes, periods - "Ma. Clara", "O'Neil",
// "Dela Cruz-Santos". Anything else is dropped as it is typed rather than refused on save. The
// server holds the same rule. Email: one real address, checked before it is sent.
const NAME_MAX  = 50;
const EMAIL_MAX = 100;
const cleanName = (v) => String(v).replace(/[^\p{L}\s.'\-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, NAME_MAX);
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// One look for every role, the Super Admin one: gold on dark. The old Staff page painted each
// role its own colour, which said nothing and clashed with everything.
const RoleBadge = ({ label }) => (
  <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    background: 'rgba(212,168,67,0.16)', color: 'var(--gold)', border: '1px solid rgba(212,168,67,0.35)' }}>
    {label}
  </span>
);

export default function AccessPage() {
  const { token } = useAuth();
  const isPhone = useIsPhone();
  const { toasts, push: toast, dismiss } = useToast();

  // The same catalogue as rows - one per sidebar entry, each Off / See / Work plus a few extras.
  const [rows,      setRows]      = useState({});
  // One confirm for the whole page, opened by confirmAsk() and resolved by its two buttons.
  const [ask, setAsk] = useState(null);
  const confirmAsk = (opts) => new Promise(resolve => setAsk({ ...opts, resolve }));
  const [templates, setTemplates] = useState([]);
  const [staff,     setStaff]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [editing,   setEditing]   = useState(null);   // the staff row open in the editor
  const [draft,     setDraft]     = useState({});     // key -> true
  const [saving,    setSaving]    = useState(false);
  const [isNew,     setIsNew]     = useState(false);
  const [newFields, setNewFields] = useState({ firstName: '', lastName: '', email: '', role: '' });
  // Roles: the templates, with who holds each. Add one, delete one that nobody holds.
  const [roleForm,  setRoleForm]  = useState(null);     // { label, startFrom } while adding
  const [roleBusy,  setRoleBusy]  = useState('');       // role key being deleted / saved
  // Editing a role TEMPLATE (not a person): { role, label }. Shares the grid with the person editor.
  const [editingRole, setEditingRole] = useState(null);
  const [fieldErr,  setFieldErr]  = useState({});

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      const [c, s] = await Promise.all([
        fetchWithTimeout(`${API_URL}/api/admin/access/catalog`, { headers }, 20000),
        fetchWithTimeout(`${API_URL}/api/admin/access/staff`,   { headers }, 20000),
      ]);
      if (!c.ok || !s.ok) throw new Error('Could not load access settings.');
      const cd = await c.json(), sd = await s.json();
      setRows(cd?.data?.rows ?? {});
      setTemplates(cd?.data?.templates ?? []);
      setStaff(sd?.data ?? []);
    } catch (e) {
      setError(e.message || 'Could not load access settings.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openEditor = (row) => {
    setEditingRole(null);
    setEditing(row);
    setDraft({ ...(row.permissions ?? {}) });
    setIsNew(false);
  };

  const openRoleEditor = (t) => {
    setEditingRole({ role: t.role, label: t.label });
    setEditing({ id: null, firstName: t.label, lastName: '', email: '', role: t.role, permissions: t.permissions });
    setDraft({ ...(t.permissions ?? {}) });
    setIsNew(false);
  };

  const saveRoleEdit = async () => {
    const label = (editingRole?.label || '').trim();
    if (label.length < 2) { toast?.('Give the role a name.', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/role-permissions/${encodeURIComponent(editingRole.role)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label, permissions: draft }),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Could not save the role.');
      const who = holders(editingRole.role).filter(r => r.source === 'template');
      toast?.(`Saved. ${who.length ? `${who.map(w => w.firstName).join(', ')} now ${who.length === 1 ? 'has' : 'have'} exactly these ticks.` : 'Nobody follows this template yet.'}`, 'success');
      setEditing(null); setEditingRole(null);
      await load();
    } catch (e) { toast?.(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const openNew = () => {
    setEditingRole(null);
    setFieldErr({});
    setEditing({ id: null, firstName: '', lastName: '', email: '', role: '', permissions: {} });
    setDraft({});
    setNewFields({ firstName: '', lastName: '', email: '', role: '' });
    setIsNew(true);
  };

  const applyTemplate = (role) => {
    const t = templates.find(x => x.role === role);
    if (!t) return;
    setDraft({ ...(t.permissions ?? {}) });
    toast?.(`Filled in from the ${t.label} template. Adjust anything you like before saving.`, 'info');
  };

  const save = async () => {
    if (!editing) return;
    // A permission change alters what someone can do in the shop, so it is confirmed - with the
    // change spelled out, not "Are you sure?".
    if (!isNew) {
      const { gains, losses } = describeChange(editing.permissions ?? {}, draft);
      const renamed = editingRole && (editingRole.label || '').trim() !== (templates.find(t => t.role === editingRole.role)?.label ?? '');
      if (!gains.length && !losses.length && !renamed) { toast?.('Nothing changed.', 'info'); return; }
      const who = editingRole
        ? `Everyone on ${editingRole.label || 'this template'}`
        : editing.firstName;
      const lines = [
        ...(gains.length ? [`${who} will now have:`, ...gains.map(g => `- ${g}`)] : []),
        ...(losses.length ? [`${gains.length ? '\n' : ''}${who} will no longer have:`, ...losses.map(l => `- ${l}`)] : []),
        ...(renamed && !gains.length && !losses.length ? [`The role is renamed to "${(editingRole.label || '').trim()}".`] : []),
      ];
      if (!(await confirmAsk({ title: editingRole ? 'Save this role?' : `Save ${editing.firstName}'s access?`,
        message: lines.join('\n'), confirmLabel: 'Save', confirmStyle: 'primary' }))) return;
    }
    if (editingRole) { await saveRoleEdit(); return; }
    if (isNew) {
      const { firstName, lastName, email, role } = newFields;
      const errs = {};
      if (firstName.trim().length < 2) errs.firstName = 'At least 2 letters.';
      if (lastName.trim().length < 2)  errs.lastName  = 'At least 2 letters.';
      if (!EMAIL_RE.test(email.trim())) errs.email    = 'Enter a real email address, like name@gmail.com.';
      if (!role)                        errs.role     = 'Pick the role they start from.';
      setFieldErr(errs);
      if (Object.keys(errs).length) return;
    }
    setSaving(true);
    try {
      const send = (promoteExisting) => fetchWithTimeout(
        isNew ? `${API_URL}/api/admin/access/staff` : `${API_URL}/api/admin/access/staff/${editing.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(isNew ? { ...newFields, permissions: draft, promoteExisting } : { permissions: draft }),
      }, 20000);
      let res = await send(false);
      let d = await res.json().catch(() => ({}));
      // The email already shops here. One login per person: the same account gets the role,
      // keeps its password, name and orders, and can still shop. Removing them later hands the
      // account back as a customer. Asked, never assumed.
      let promoted = false;
      if (res.status === 409 && d.code === 'customer_account') {
        const ok = await confirmAsk({
          title: 'This email already shops here',
          message: `${newFields.email} already has a customer account.\n\nGive that same account staff access? They keep their password and their orders, and can still shop. Removing them from staff later turns it back into a customer account.`,
          confirmLabel: 'Give staff access', confirmStyle: 'primary',
        });
        if (!ok) { setSaving(false); return; }
        res = await send(true);
        d = await res.json().catch(() => ({}));
        promoted = true;
      }
      if (!res.ok) throw new Error(d.message || d.error || 'Could not save.');
      toast?.(isNew
        ? (promoted ? `${newFields.firstName}'s customer account is now a staff account.` : (d.message || `${newFields.firstName} was added.`))
        : `Saved. ${editing.firstName} can now do exactly what is ticked.`, 'success');
      setEditing(null);
      setIsNew(false);
      await load();
    } catch (e) {
      toast?.(e.message, 'error');
    } finally { setSaving(false); }
  };

  // Off the team. A customer's own account goes back to being a customer (orders kept, signed
  // out); a login the shop created is deleted unless it has orders, in which case it is kept as
  // a customer too. The server decides which; this only asks.
  const removeStaff = async (row) => {
    const msg = row.fromCustomer
      ? `Remove ${row.firstName} from staff? Their account goes back to being a customer - they keep their orders and can still shop.`
      : `Remove ${row.firstName} from staff? Their dashboard login is closed.`;
    if (!(await confirmAsk({ title: 'Remove from staff?', message: msg, confirmLabel: 'Remove' }))) return;
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/staff/${row.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Could not remove.');
      toast?.(d.message || `${row.firstName} is no longer staff.`, 'success');
      await load();
    } catch (e) { toast?.(e.message, 'error'); }
  };

  const holders = (role) => staff.filter(r => r.role === role);

  const saveRole = async () => {
    const label = (roleForm?.label || '').trim();
    if (!label) { toast?.('Give the role a name.', 'error'); return; }
    setRoleBusy('new');
    try {
      const from = templates.find(t => t.role === roleForm.startFrom);
      const res = await fetchWithTimeout(`${API_URL}/api/admin/role-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label, permissions: from?.permissions ?? {} }),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Could not add the role.');
      toast?.(`Role "${label}" added. Give it to someone from Add staff, or tick their access directly.`, 'success');
      setRoleForm(null);
      await load();
    } catch (e) { toast?.(e.message, 'error'); }
    finally { setRoleBusy(''); }
  };

  const deleteRole = async (t) => {
    const who = holders(t.role);
    if (who.length) { toast?.(`${t.label} is still held by ${who.map(w => w.firstName).join(', ')}. Move them first.`, 'error'); return; }
    if (!(await confirmAsk({ title: 'Delete this role?', message: `"${t.label}" will be gone. Nobody holds it.`, confirmLabel: 'Delete role' }))) return;
    setRoleBusy(t.role);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/role-permissions/${encodeURIComponent(t.role)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Could not delete the role.');
      toast?.(`Role "${t.label}" deleted.`, 'success');
      await load();
    } catch (e) { toast?.(e.message, 'error'); }
    finally { setRoleBusy(''); }
  };

  // A row's level, read from the grid: Work when every Work key is on, See when its See keys are,
  // otherwise Off. The server keeps saved grids in whole levels, so nothing is "half Work".
  const levelOf = (r, grid) => {
    const on = (k) => !!(grid || {})[k];
    if (r.work.keys.length && r.work.keys.every(on)) return 'work';
    if (r.view.keys.length && r.view.keys.every(on)) return 'see';
    return 'off';
  };
  const setLevel = (r, lvl) => setDraft(p => {
    const n = { ...p };
    if (lvl === 'off') {
      [...r.view.keys, ...r.work.keys, ...Object.keys(r.extras || {})].forEach(k => { delete n[k]; });
    } else {
      r.view.keys.forEach(k => { n[k] = true; });
      r.work.keys.forEach(k => { if (lvl === 'work') n[k] = true; else delete n[k]; });
    }
    return n;
  });
  // An extra needs its row open - ticking one turns See on with it.
  const toggleExtra = (r, k, checked) => setDraft(p => {
    const n = { ...p };
    if (checked) { n[k] = true; r.view.keys.forEach(v => { n[v] = true; }); } else delete n[k];
    return n;
  });

  // What a save would change, row by row, in words: "Orders: See to Work", "Refunds".
  const describeChange = (before, after) => {
    const rank = { off: 0, see: 1, work: 2 };
    const word = { off: 'Off', see: 'See', work: 'Work' };
    const gains = [], losses = [];
    for (const r of Object.values(rows)) {
      const lb = levelOf(r, before), la = levelOf(r, after);
      if (lb !== la) (rank[la] > rank[lb] ? gains : losses).push(`${r.label}: ${word[lb]} to ${word[la]}`);
      for (const [k, [label]] of Object.entries(r.extras || {})) {
        if (after[k] && !before[k]) gains.push(label);
        if (before[k] && !after[k]) losses.push(label);
      }
    }
    return { gains, losses };
  };

  // One short line for a list: "Work in 14 · See in 6 · 9 extra".
  const headline = (grid) => {
    let work = 0, see = 0, extras = 0;
    for (const r of Object.values(rows)) {
      const l = levelOf(r, grid);
      if (l === 'work') work++; else if (l === 'see') see++;
      extras += Object.keys(r.extras || {}).filter(k => (grid || {})[k]).length;
    }
    const parts = [];
    if (work) parts.push(`Work in ${work}`);
    if (see) parts.push(`See in ${see}`);
    if (extras) parts.push(`${extras} extra`);
    return parts.length ? parts.join(' \u00b7 ') : 'Home and their own Settings only';
  };

  // The plain-words summary. A grid of ticks tells you what was configured; this tells you what
  // the person can actually do, which is the question being asked.
  const summarise = (grid) => {
    const parts = [];
    for (const r of Object.values(rows)) {
      const lvl = levelOf(r, grid);
      const ex = Object.keys(r.extras || {}).filter(k => (grid || {})[k]).map(k => r.extras[k][0].toLowerCase());
      if (lvl === 'off' && !ex.length) continue;
      parts.push(`${r.label} (${lvl === 'work' ? 'work' : 'see'}${ex.length ? ' + ' + ex.join(', ') : ''})`);
    }
    return parts.length ? parts.join(', ') : 'Nothing yet - Home and their own Settings only.';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(r => `${r.firstName} ${r.lastName} ${r.email} ${r.roleLabel}`.toLowerCase().includes(q));
  }, [staff, search]);

  const counts = useMemo(() => ({
    total:     staff.length,
    unlimited: staff.filter(r => r.unlimited).length,
    person:    staff.filter(r => r.source === 'person').length,
    template:  staff.filter(r => r.source === 'template').length,
  }), [staff]);

  // A render FUNCTION, deliberately. As a component declared inside the page, React saw a new
  // type on every render, unmounted the form on each keystroke, and the box lost focus.
  const renderEditor = () => {
    if (!editing) return null;
    const total = Object.keys(rows).length;
    const on = Object.values(rows).filter(r => levelOf(r, draft) !== 'off').length;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...S.card, padding: '12px 14px' }}>
          {isNew ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Add someone to the team</div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
                <div>
                  <input placeholder="First name" value={newFields.firstName} autoComplete="given-name"
                    onChange={e => { setNewFields(p => ({ ...p, firstName: cleanName(e.target.value) })); setFieldErr(p => ({ ...p, firstName: '' })); }}
                    style={{ ...S.input, width: '100%', ...(fieldErr.firstName ? { borderColor: 'var(--st-red-fg, #dc2626)' } : {}) }} maxLength={NAME_MAX} />
                  {fieldErr.firstName && <div style={{ fontSize: 11, color: 'var(--st-red-fg, #dc2626)', marginTop: 3 }}>{fieldErr.firstName}</div>}
                </div>
                <div>
                  <input placeholder="Last name" value={newFields.lastName} autoComplete="family-name"
                    onChange={e => { setNewFields(p => ({ ...p, lastName: cleanName(e.target.value) })); setFieldErr(p => ({ ...p, lastName: '' })); }}
                    style={{ ...S.input, width: '100%', ...(fieldErr.lastName ? { borderColor: 'var(--st-red-fg, #dc2626)' } : {}) }} maxLength={NAME_MAX} />
                  {fieldErr.lastName && <div style={{ fontSize: 11, color: 'var(--st-red-fg, #dc2626)', marginTop: 3 }}>{fieldErr.lastName}</div>}
                </div>
              </div>
              <input placeholder="Email - name@gmail.com" type="email" inputMode="email" autoComplete="email" value={newFields.email}
                onChange={e => { setNewFields(p => ({ ...p, email: e.target.value.replace(/\s/g, '').slice(0, EMAIL_MAX) })); setFieldErr(p => ({ ...p, email: '' })); }}
                onBlur={e => { const v = e.target.value.trim(); if (v && !EMAIL_RE.test(v)) setFieldErr(p => ({ ...p, email: 'Enter a real email address, like name@gmail.com.' })); }}
                style={{ ...S.input, marginTop: 10, width: '100%', ...(fieldErr.email ? { borderColor: 'var(--st-red-fg, #dc2626)' } : {}) }} maxLength={EMAIL_MAX} />
              {fieldErr.email && <div style={{ fontSize: 11, color: 'var(--st-red-fg, #dc2626)', marginTop: 3 }}>{fieldErr.email}</div>}
              <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 6, lineHeight: 1.5 }}>
                No account needed first. A new email gets an invite to set its own password - you never type it.
                An email that already shops here is asked about, then that same account gets the access.
              </div>
            </>
          ) : editingRole ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Edit role template</div>
              <input value={editingRole.label} maxLength={40}
                onChange={e => setEditingRole(r => ({ ...r, label: e.target.value.replace(/[^\p{L}\p{N}\s&.'\-]/gu, '').slice(0, 40) }))}
                style={{ ...S.input, width: '100%', maxWidth: 320 }} />
              <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 6, lineHeight: 1.5 }}>
                Changes apply to everyone who follows this template
                {(() => { const w = holders(editingRole.role).filter(r => r.source === 'template'); return w.length ? ` (${w.map(x => x.firstName).join(', ')})` : ' (nobody yet)'; })()}.
                People whose access was set one by one keep their own ticks.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{editing.firstName} {editing.lastName}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>{editing.email}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 6, lineHeight: 1.5 }}>
                Starts from the <b>{editing.roleLabel || 'role'}</b> template. Tick or untick anything - it applies
                to {editing.firstName} only; the template and everyone else on it stay as they are.
              </div>
            </>
          )}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {fieldErr.role && <span style={{ fontSize: 11, color: 'var(--st-red-fg, #dc2626)', width: '100%' }}>{fieldErr.role}</span>}
            {!editingRole && <span style={{ fontSize: 12, color: 'var(--gray)' }}>Start from a template</span>}
            {!editingRole && (
            <CustomSelect
              value={isNew ? newFields.role : ''}
              onChange={(v) => { if (isNew) { setNewFields(p => ({ ...p, role: v })); setFieldErr(p => ({ ...p, role: '' })); } applyTemplate(v); }}
              options={[{ value: '', label: 'Choose one...' },
                ...templates.map(t => ({ value: t.role, label: t.label }))]}
              style={{ width: 190 }} />
            )}
            <button onClick={() => setDraft({})} style={S.btnSmGhost}>Clear all</button>
            <span style={{ fontSize: 12, color: 'var(--gray)', marginLeft: 'auto' }}>{on} of {total} areas open</span>
          </div>
        </div>

        {(() => {
          // Sections in sidebar order; rows keep the order the server sends (the sidebar's).
          const sections = [];
          for (const [id, r] of Object.entries(rows)) {
            let sec = sections.find(x => x.name === r.section);
            if (!sec) { sec = { name: r.section, rows: [] }; sections.push(sec); }
            sec.rows.push([id, r]);
          }
          const seg = (active) => ({
            padding: '6px 12px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', minHeight: 32,
            background: active ? 'var(--gold)' : 'transparent', color: active ? '#111' : 'var(--gray-light)',
          });
          return sections.map(sec => (
            <div key={sec.name} style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 12,
                textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--gray)' }}>{sec.name}</div>
              {sec.rows.map(([id, r], i) => {
                const lvl = levelOf(r, draft);
                const levels = r.work.keys.length ? ['off', 'see', 'work'] : ['off', 'see'];
                const extras = Object.entries(r.extras || {});
                return (
                  <div key={id} style={{ padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--white)' }}>{r.label}</span>
                        {r.note && <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>{r.note}</span>}
                      </span>
                      <div role="radiogroup" aria-label={r.label}
                        style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                        {levels.map(l => (
                          <button key={l} type="button" role="radio" aria-checked={lvl === l} onClick={() => setLevel(r, l)} style={seg(lvl === l)}>
                            {l === 'off' ? 'Off' : l === 'see' ? 'See' : 'Work'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {lvl !== 'off' && (
                      <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 5, lineHeight: 1.45 }}>
                        {lvl === 'work' ? r.work.hint : r.view.hint}
                      </div>
                    )}
                    {lvl !== 'off' && extras.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {extras.map(([k, [label, hint]]) => (
                          <label key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!draft[k]} onChange={e => toggleExtra(r, k, e.target.checked)}
                              style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: 'var(--gold)' }} />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ fontSize: 12.5, color: 'var(--white)' }}>{label}</span>
                              {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)' }}>{hint}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ));
        })()}

        <div style={{ ...S.card, padding: '12px 14px', background: 'var(--dark2)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>What this means</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-light)', lineHeight: 1.6 }}>
            {editingRole ? 'Anyone on this template' : (editing.firstName || 'This person')} will be able to reach: <b>{summarise(draft)}</b>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 6, lineHeight: 1.55 }}>
            See is read only. Work is the everyday job on that page. The ticks under a row are the
            risky actions - cancelling, refunds, deleting - and each is its own decision.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={() => { setEditing(null); setIsNew(false); setEditingRole(null); }} disabled={saving} style={S.btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} style={S.btnPrimary}>
            {saving ? 'Saving...' : editingRole ? 'Save role' : isNew ? 'Add and save access' : 'Save permissions'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: isPhone ? '10px 0' : '0' }}>
      <ConfirmModal
        open={!!ask}
        onClose={() => { ask?.resolve(false); setAsk(null); }}
        onConfirm={() => { ask?.resolve(true); setAsk(null); }}
        title={ask?.title}
        message={ask?.message}
        confirmLabel={ask?.confirmLabel ?? 'Confirm'}
        confirmStyle={ask?.confirmStyle ?? 'danger'}
      />
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      {!editing && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}><SummaryCard label="People" value={counts.total} accent /></div>
            <div style={{ flex: 1, minWidth: 120 }}><SummaryCard label="Set per person" value={counts.person} /></div>
            <div style={{ flex: 1, minWidth: 120 }}><SummaryCard label="Following a template" value={counts.template} /></div>
            <div style={{ flex: 1, minWidth: 120 }}><SummaryCard label="Unlimited" value={counts.unlimited} sub="owner and super admin" /></div>
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search name, email or role" />
            </div>
            <button onClick={openNew} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>+ Add staff</button>
          </div>

          {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', marginBottom: 12 }}>{error}</div>}

          {loading ? (
            <div style={{ ...S.card, padding: 24, fontSize: 13, color: 'var(--gray)' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ ...S.card, padding: 0 }}><EmptyState message="Nobody found" sub="Add someone with + Add staff." /></div>
          ) : isPhone ? (
            <PhoneList>
              {filtered.map((r, i) => (
                <PhoneRow key={r.id} first={i === 0} onClick={() => !r.unlimited && openEditor(r)}
                  title={`${r.firstName} ${r.lastName}`}
                  chip={<span style={{ fontSize: 11, fontWeight: 700, color: r.unlimited ? 'var(--gold)' : 'var(--gray)' }}>
                    {r.unlimited ? 'Unlimited' : r.source === 'person' ? 'Per person' : 'Template'}
                  </span>}
                  meta={<RoleBadge label={r.roleLabel} />}
                  sub={r.unlimited ? 'Cannot be limited' : headline(r.permissions)} />
              ))}
            </PhoneList>
          ) : (
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <table className="pmp-rt" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Name', 'Role', 'Can reach', 'Set by', ''].map((h, i) => <th key={i} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={S.tr}>
                      <td style={{ ...S.td, fontWeight: 500 }}>
                        {r.firstName} {r.lastName}
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>{r.email}</div>
                      </td>
                      <td style={S.td}><RoleBadge label={r.roleLabel} /></td>
                      <td style={{ ...S.td, fontSize: 12, color: 'var(--gray-light)', maxWidth: 340 }}>
                        {r.unlimited ? <i style={{ color: 'var(--gold)' }}>Everything - the owner and super admin cannot be limited</i> : (
                          <>
                            <div style={{ fontWeight: 700, color: 'var(--white)', marginBottom: 2 }}>{headline(r.permissions)}</div>
                            <Clamp lines={3}>{summarise(r.permissions)}</Clamp>
                          </>
                        )}
                      </td>
                      <td style={{ ...S.td, fontSize: 11.5 }}>
                        <span style={{ padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                          background: r.unlimited ? 'rgba(212,168,67,0.14)' : r.source === 'person' ? 'rgba(46,125,50,0.12)' : 'var(--dark2)',
                          color: r.unlimited ? 'var(--gold)' : r.source === 'person' ? '#2e7d32' : 'var(--gray)' }}>
                          {r.unlimited ? 'Unlimited' : r.source === 'person' ? 'Per person' : 'Template'}
                        </span>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!r.unlimited && (
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            <button onClick={() => openEditor(r)} style={S.btnSmGhost}>Edit access</button>
                            <button onClick={() => removeStaff(r)} style={{ ...S.btnSmGhost, color: 'var(--st-red-fg, #dc2626)' }}>Remove</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Roles are templates: a starting set of ticks for a new person. Listed with who
              holds each, so deleting one cannot strand anybody. */}
          {!loading && (
            <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginTop: 18 }}>
              <div style={{ ...S.rowBetween, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Roles</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gray)' }}>A role is a template - the ticks a new person starts with. What each person can actually do is set above.</div>
                </div>
                <button onClick={() => setRoleForm({ label: '', startFrom: '' })} style={S.btnSmGhost}>+ Add role</button>
              </div>
              {roleForm && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input placeholder="Role name, e.g. Cashier" value={roleForm.label} maxLength={60}
                    onChange={e => setRoleForm(f => ({ ...f, label: e.target.value }))} style={{ ...S.input, flex: '1 1 200px' }} />
                  <CustomSelect value={roleForm.startFrom} onChange={v => setRoleForm(f => ({ ...f, startFrom: v }))}
                    options={[{ value: '', label: 'Start empty' }, ...templates.map(t => ({ value: t.role, label: `Copy ${t.label}` }))]}
                    style={{ width: 200 }} />
                  <button onClick={saveRole} disabled={roleBusy === 'new'} style={S.btnPrimary}>{roleBusy === 'new' ? 'Saving...' : 'Add role'}</button>
                  <button onClick={() => setRoleForm(null)} style={S.btnGhost}>Cancel</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, padding: 12 }}>
                {templates.map(t => {
                  const who = holders(t.role);
                  return (
                    <div key={t.role} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--dark)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <RoleBadge label={t.label} />
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button onClick={() => openRoleEditor(t)} style={S.btnSmGhost}>Edit</button>
                        <button onClick={() => deleteRole(t)} disabled={roleBusy === t.role || who.length > 0}
                          title={who.length ? `Held by ${who.map(w => w.firstName).join(', ')}` : 'Delete this role'}
                          style={{ ...S.btnSmGhost, color: who.length ? 'var(--gray)' : 'var(--st-red-fg, #dc2626)', opacity: who.length ? 0.6 : 1 }}>
                          {roleBusy === t.role ? '...' : 'Delete'}
                        </button>
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginTop: 8 }}>{headline(t.permissions)}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 2 }}><Clamp lines={3}>{summarise(t.permissions)}</Clamp></div>
                      <div style={{ fontSize: 11.5, color: who.length ? 'var(--white)' : 'var(--gray)', marginTop: 4 }}>
                        {who.length ? `Held by ${who.map(w => w.firstName).join(', ')}` : 'Nobody holds it'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {editing && (isPhone
        ? <PhoneSheet open onClose={() => { setEditing(null); setEditingRole(null); }} title={editingRole ? 'Edit role' : isNew ? 'Add staff' : `${editing.firstName}'s access`}>{renderEditor()}</PhoneSheet>
        : renderEditor())}
    </div>
  );
}
