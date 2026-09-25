'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { S, ICONS, ConfirmModal, ToastContainer, useToast } from '../inventory-v2/shared';
import OrderFormBuilder, { FORM_LIMITS, blankForm } from '@/components/dashboard/OrderFormBuilder';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Settings > Order forms.
 *
 * Before a price can be given the shop has to know what is being made, and what it has to know
 * differs by job: a shirt order needs sizes, a tarpaulin needs measurements. So the questions are
 * written here rather than in the page, and the chat picks a form to send.
 *
 * Two things are deliberately not editable. The top of every form asks who the order is for and
 * where it goes, and the bottom carries the two ticks, because a quotation that cannot be
 * delivered or was never agreed to is not a quotation. And a form must ask how many, since a
 * price without a quantity is a guess.
 */

export default function OrderForms({ token }) {
  const { toasts, push: toast, dismiss } = useToast();
  const [templates, setTemplates] = useState(null);
  const [types, setTypes] = useState({});
  const [limits, setLimits] = useState(FORM_LIMITS);
  const [pickedId, setPickedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState(null);           // one confirm for the whole tab
  const [starter, setStarter] = useState(null);   // the shop's standard form, as the code has it
  const confirmAsk = (opts) => new Promise(resolve => setAsk({ ...opts, resolve }));

  const load = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/order-forms`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 15000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not load the order forms.');
      const list = d?.data?.templates ?? [];
      setTemplates(list);
      setStarter(d?.data?.starter ?? null);
      setTypes(d?.data?.types ?? {});
      setLimits({ ...FORM_LIMITS, ...(d?.data?.limits ?? {}) });
      setPickedId(prev => (list.some(t => String(t._id) === prev) ? prev : String(list[0]?._id ?? '')));
    } catch (e) {
      setTemplates([]);
      setErr(e.message || 'Could not load the order forms.');
    }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const picked = useMemo(() => (templates ?? []).find(t => String(t._id) === pickedId) ?? null, [templates, pickedId]);

  // The editor always works on a copy. Nothing reaches the server until Save, so a half-typed
  // question is never a form somebody could be sent.
  const editing = draft ?? (picked ? { ...picked, questions: (picked.questions ?? []).map(q => ({ ...q, options: [...(q.options ?? [])] })) } : null);
  const dirty = !!draft;

  const change = (patch) => setDraft(d => ({ ...(d ?? editing), ...patch }));

  const leaveGuard = async () => {
    if (!dirty) return true;
    return await confirmAsk({
      title: 'Leave without saving?',
      message: `"${editing?.name || 'This form'}" has changes that are not saved. Leaving loses them.`,
      confirmLabel: 'Leave it',
    });
  };

  const pick = async (id) => { if (await leaveGuard()) { setDraft(null); setErr(''); setPickedId(String(id)); } };
  const startNew = async () => {
    if (!(await leaveGuard())) return;
    if ((templates ?? []).length >= limits.templates) { toast(`That is the ${limits.templates}-form limit. Delete one first.`, 'error'); return; }
    setErr(''); setPickedId(''); setDraft(blankForm());
  };

  // The standard T-shirt form, opened as a NEW draft marked default. Nothing is written until Save,
  // so the owner reads it first; the forms already in the list stay exactly as they are.
  const startFromStandard = async () => {
    if (!starter) return;
    if (!(await leaveGuard())) return;
    if ((templates ?? []).length >= limits.templates) { toast(`That is the ${limits.templates}-form limit. Delete one first.`, 'error'); return; }
    setErr(''); setPickedId('');
    setDraft({
      ...starter,
      isDefault: true,
      questions: (starter.questions ?? []).map(q => ({ ...q, options: [...(q.options ?? [])] })),
    });
  };

  // Offered only while no saved form already IS the standard one, so it does not sit there as a
  // button that makes duplicates.
  const hasStandard = !!starter && (templates ?? []).some(t =>
    String(t.name ?? '').trim().toLowerCase() === String(starter.name ?? '').trim().toLowerCase()
    && (t.questions ?? []).some(q => q.type === 'print_area'));

  const save = async () => {
    if (!editing || saving) return;
    setSaving(true); setErr('');
    try {
      const isNew = !editing._id;
      const res = await fetchWithTimeout(`${API_URL}/api/admin/order-forms${isNew ? '' : `/${editing._id}`}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editing.name, description: editing.description, questions: editing.questions, isDefault: !!editing.isDefault }),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not save this form.');
      setDraft(null);
      setPickedId(String(d?.data?._id ?? editing._id ?? ''));
      await load();
      toast('Form saved. Forms already sent are unchanged.');
    } catch (e) {
      setErr(e.message || 'Could not save this form.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing?._id) { setDraft(null); return; }
    const ok = await confirmAsk({
      title: 'Delete this form?',
      message: `"${editing.name}" will be gone from the list the chat picks from. Forms already sent to customers stay exactly as they were sent.`,
      confirmLabel: 'Delete form',
    });
    if (!ok) return;
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/order-forms/${editing._id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }, 15000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not delete this form.');
      setDraft(null); setPickedId('');
      await load();
      toast('Form deleted.');
    } catch (e) {
      toast(e.message || 'Could not delete this form.', 'error');
    }
  };

  if (templates === null) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {[0, 1, 2].map(i => <div key={i} className="pmPulse" style={{ height: 64, borderRadius: 8, background: 'var(--dark2)' }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...S.cardSm, ...S.rowBetween, background: 'var(--dark2)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)' }}>Order forms</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: 2, lineHeight: 1.5 }}>
            The questions asked in chat before a price is given. Every form also asks who the order is
            for, where it goes, and the two ticks - those are not editable.
          </div>
        </div>
        <div style={{ ...S.row, gap: 8, flexWrap: 'wrap' }}>
          {starter && !hasStandard && (
            <button type="button" onClick={startFromStandard} style={S.btnGhost}>Use the standard form</button>
          )}
          <button type="button" onClick={startNew} style={S.btnPrimary}>{ICONS.plus} New form</button>
        </div>
      </div>

      {/* Said where the owner is looking, because the list is theirs and the code will not change it
          for them: a list saved before the standard form changed keeps the old one as its default. */}
      {starter && !hasStandard && (
        <div style={{ ...S.cardSm, border: '1px solid var(--gold)', background: 'var(--gold-subtle)', fontSize: '0.8rem', color: 'var(--white)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--gold)' }}>The standard form is newer than yours.</strong>{' '}
          It asks for colours, sizes and where the print goes, with your file-format note first.
          Press <strong>Use the standard form</strong> to open it as a new form, check it, and save - it
          becomes the one the chat sends. Your current forms are kept.
        </div>
      )}

      <div className="pmp-cols" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* The list. On a phone this wraps into a row of chips above the editor. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(templates ?? []).map(t => {
            const on = String(t._id) === pickedId;
            return (
              <button key={t._id} type="button" onClick={() => pick(t._id)}
                style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 8, cursor: 'pointer', border: '1px solid',
                  borderColor: on ? 'var(--gold)' : 'var(--border)', background: on ? 'rgba(212,168,67,0.1)' : 'transparent', color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: on ? 'var(--gold)' : 'var(--white)', overflowWrap: 'anywhere' }}>{t.name}</span>
                  {t.isDefault && <span style={{ ...S.badge, background: 'var(--gold-subtle)', color: 'var(--gold-dark)', fontSize: 10 }}>DEFAULT</span>}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: 2 }}>
                  {(t.questions ?? []).length} question{(t.questions ?? []).length === 1 ? '' : 's'}
                </div>
              </button>
            );
          })}
          {draft && !draft._id && (
            <div style={{ padding: '9px 11px', borderRadius: 8, border: '1px dashed var(--gold)', fontSize: '0.82rem', color: 'var(--gold)' }}>New form</div>
          )}
        </div>

        {/* The editor */}
        {!editing ? (
          <div style={{ ...S.card, color: 'var(--gray)', fontSize: '0.85rem' }}>Pick a form on the left, or start a new one.</div>
        ) : (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <OrderFormBuilder value={editing} onChange={next => change(next)} types={types} limits={limits} />

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--gray-light)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!editing.isDefault} onChange={e => change({ isDefault: e.target.checked })}
                style={{ width: 15, height: 15, accentColor: 'var(--gold)' }} />
              Send this one unless another is picked
            </label>

            {err && <div style={{ padding: '9px 12px', borderRadius: 6, background: 'rgba(224,82,82,0.12)', border: '1px solid rgba(224,82,82,0.35)', color: '#e05252', fontSize: 12.5 }}>{err}</div>}

            <div style={{ ...S.row, gap: 8 }}>
              <button type="button" onClick={save} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save form'}
              </button>
              {dirty && <button type="button" onClick={() => { setDraft(null); setErr(''); }} style={S.btnGhost}>Undo changes</button>}
              <button type="button" onClick={remove} style={{ ...S.btnSmDanger, marginLeft: 'auto', padding: '8px 18px' }}>
                {ICONS.trash} {editing._id ? 'Delete form' : 'Discard'}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!ask}
        onClose={() => { ask?.resolve(false); setAsk(null); }}
        onConfirm={() => { ask?.resolve(true); setAsk(null); }}
        title={ask?.title}
        message={ask?.message}
        confirmLabel={ask?.confirmLabel ?? 'Confirm'}
      />
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
