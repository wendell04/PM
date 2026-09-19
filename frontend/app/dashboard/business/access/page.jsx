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
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { S, ICONS, SummaryCard, EmptyState, CustomSelect, SearchBar, ToastContainer, useToast } from '../inventory-v2/shared';
import { useIsPhone, PhoneList, PhoneRow, PhoneSheet } from '@/components/dashboard/phone';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AccessPage() {
  const { token } = useAuth();
  const isPhone = useIsPhone();
  const { toasts, push: toast, dismiss } = useToast();

  const [groups,    setGroups]    = useState({});
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
      setGroups(cd?.data?.groups ?? {});
      setTemplates(cd?.data?.templates ?? []);
      setStaff(sd?.data ?? []);
    } catch (e) {
      setError(e.message || 'Could not load access settings.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openEditor = (row) => {
    setEditing(row);
    setDraft({ ...(row.permissions ?? {}) });
    setIsNew(false);
  };

  const openNew = () => {
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
    if (isNew) {
      const { firstName, lastName, email, role } = newFields;
      if (!firstName.trim() || !lastName.trim() || !email.trim() || !role) {
        toast?.('Name, email and a starting role are needed before saving.', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetchWithTimeout(
        isNew ? `${API_URL}/api/admin/access/staff` : `${API_URL}/api/admin/access/staff/${editing.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(isNew ? { ...newFields, permissions: draft } : { permissions: draft }),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || d.error || 'Could not save.');
      toast?.(isNew
        ? `${newFields.firstName} was added. They get an email to set their password.`
        : `Saved. ${editing.firstName} can now do exactly what is ticked.`, 'success');
      setEditing(null);
      setIsNew(false);
      await load();
    } catch (e) {
      toast?.(e.message, 'error');
    } finally { setSaving(false); }
  };

  // The plain-words summary. A grid of ticks tells you what was configured; this tells you what
  // the person can actually do, which is the question being asked.
  const summarise = (grid) => {
    const on = Object.keys(grid || {}).filter(k => grid[k]);
    if (!on.length) return 'Nothing yet - they can sign in and see nothing.';
    const byGroup = [];
    for (const [gk, g] of Object.entries(groups)) {
      const hits = Object.keys(g.items || {}).filter(k => grid[k]);
      if (hits.length) byGroup.push(`${g.label.toLowerCase()} (${hits.length})`);
    }
    return byGroup.join(', ');
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

  const Editor = () => {
    if (!editing) return null;
    const total = Object.values(groups).reduce((n, g) => n + Object.keys(g.items || {}).length, 0);
    const on = Object.keys(draft).filter(k => draft[k]).length;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...S.card, padding: '12px 14px' }}>
          {isNew ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Add someone to the team</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input placeholder="First name" value={newFields.firstName}
                  onChange={e => setNewFields(p => ({ ...p, firstName: e.target.value }))} style={S.input} />
                <input placeholder="Last name" value={newFields.lastName}
                  onChange={e => setNewFields(p => ({ ...p, lastName: e.target.value }))} style={S.input} />
              </div>
              <input placeholder="Work email" type="email" value={newFields.email}
                onChange={e => setNewFields(p => ({ ...p, email: e.target.value }))}
                style={{ ...S.input, marginTop: 10, width: '100%' }} />
              <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 6 }}>
                They get an email to set their own password. You never type it.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{editing.firstName} {editing.lastName}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>{editing.email}</div>
            </>
          )}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--gray)' }}>Start from a template</span>
            <CustomSelect
              value={isNew ? newFields.role : ''}
              onChange={(v) => { if (isNew) setNewFields(p => ({ ...p, role: v })); applyTemplate(v); }}
              options={[{ value: '', label: 'Choose one...' },
                ...templates.map(t => ({ value: t.role, label: t.label }))]}
              style={{ width: 190 }} />
            <button onClick={() => setDraft({})} style={S.btnSmGhost}>Clear all</button>
            <span style={{ fontSize: 12, color: 'var(--gray)', marginLeft: 'auto' }}>{on} of {total} granted</span>
          </div>
        </div>

        {Object.entries(groups).map(([gk, g]) => {
          const keys = Object.keys(g.items || {});
          const allOn = keys.every(k => draft[k]);
          return (
            <div key={gk} style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ ...S.rowBetween, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{g.label}</span>
                <button onClick={() => setDraft(p => {
                  const next = { ...p };
                  keys.forEach(k => { if (allOn) delete next[k]; else next[k] = true; });
                  return next;
                })} style={S.btnSmGhost}>{allOn ? 'None' : 'All'}</button>
              </div>
              <div style={{ padding: '6px 14px 12px' }}>
                {keys.map(k => {
                  const [label, hint] = g.items[k];
                  return (
                    <label key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!draft[k]}
                        onChange={e => setDraft(p => { const n = { ...p }; if (e.target.checked) n[k] = true; else delete n[k]; return n; })}
                        style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: 'var(--gold)' }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13, color: 'var(--white)' }}>{label}</span>
                        {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)' }}>{hint}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{ ...S.card, padding: '12px 14px', background: 'var(--dark2)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>What this means</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-light)', lineHeight: 1.6 }}>
            {editing.firstName} will be able to reach: <b>{summarise(draft)}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => { setEditing(null); setIsNew(false); }} disabled={saving} style={S.btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} style={S.btnPrimary}>
            {saving ? 'Saving...' : isNew ? 'Add and save access' : 'Save permissions'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: isPhone ? '10px 0' : '0' }}>
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
            <div style={{ ...S.card, padding: 0 }}><EmptyState message="Nobody found" sub="Add staff from the Staff page for now." /></div>
          ) : isPhone ? (
            <PhoneList>
              {filtered.map((r, i) => (
                <PhoneRow key={r.id} first={i === 0} onClick={() => !r.unlimited && openEditor(r)}
                  title={`${r.firstName} ${r.lastName}`}
                  chip={<span style={{ fontSize: 11, fontWeight: 700, color: r.unlimited ? 'var(--gold)' : 'var(--gray)' }}>
                    {r.unlimited ? 'Unlimited' : r.source === 'person' ? 'Per person' : 'Template'}
                  </span>}
                  meta={r.roleLabel}
                  sub={r.unlimited ? 'Cannot be limited' : summarise(r.permissions)} />
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
                      <td style={{ ...S.td, fontSize: 12 }}>{r.roleLabel}</td>
                      <td style={{ ...S.td, fontSize: 12, color: 'var(--gray-light)', maxWidth: 340 }}>
                        {r.unlimited ? <i style={{ color: 'var(--gold)' }}>Everything - the owner and super admin cannot be limited</i> : summarise(r.permissions)}
                      </td>
                      <td style={{ ...S.td, fontSize: 11.5 }}>
                        <span style={{ padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                          background: r.unlimited ? 'rgba(212,168,67,0.14)' : r.source === 'person' ? 'rgba(46,125,50,0.12)' : 'var(--dark2)',
                          color: r.unlimited ? 'var(--gold)' : r.source === 'person' ? '#2e7d32' : 'var(--gray)' }}>
                          {r.unlimited ? 'Unlimited' : r.source === 'person' ? 'Per person' : 'Template'}
                        </span>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right' }}>
                        {!r.unlimited && <button onClick={() => openEditor(r)} style={S.btnSmGhost}>Edit access</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && (isPhone
        ? <PhoneSheet open onClose={() => setEditing(null)} title={`${editing.firstName}'s access`}><Editor /></PhoneSheet>
        : <Editor />)}
    </div>
  );
}
