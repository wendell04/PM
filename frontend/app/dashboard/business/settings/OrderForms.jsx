'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { S, ICONS, ConfirmModal, CustomSelect, ToastContainer, useToast } from '../inventory-v2/shared';

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

const FALLBACK_LIMITS = { templates: 20, questions: 20, name: 60, description: 2000, label: 120, help: 160, options: 20, option: 60, items: 10 };

const newId = () => 'q' + Math.random().toString(36).slice(2, 8);

const blankQuestion = () => ({ id: newId(), type: 'short_text', label: '', help: '', required: false, options: [] });

const blankTemplate = () => ({
  _id: null,
  name: '',
  description: '',
  questions: [{ id: newId(), type: 'item_list', label: 'What do you want made?', help: 'One row per item, with the quantity beside it.', required: true, options: [] }],
  isDefault: false,
});

export default function OrderForms({ token }) {
  const { toasts, push: toast, dismiss } = useToast();
  const [templates, setTemplates] = useState(null);
  const [types, setTypes] = useState({});
  const [limits, setLimits] = useState(FALLBACK_LIMITS);
  const [pickedId, setPickedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [activeQ, setActiveQ] = useState(null);   // the card being written, for the gold rail
  const [ask, setAsk] = useState(null);           // one confirm for the whole tab
  const confirmAsk = (opts) => new Promise(resolve => setAsk({ ...opts, resolve }));

  const load = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/order-forms`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 15000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not load the order forms.');
      const list = d?.data?.templates ?? [];
      setTemplates(list);
      setTypes(d?.data?.types ?? {});
      setLimits({ ...FALLBACK_LIMITS, ...(d?.data?.limits ?? {}) });
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
  const changeQ = (i, patch) => setDraft(d => {
    const base = d ?? editing;
    return { ...base, questions: base.questions.map((q, j) => j === i ? { ...q, ...patch } : q) };
  });

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
    setErr(''); setPickedId(''); setDraft(blankTemplate());
  };

  const addQuestion = () => {
    const base = draft ?? editing;
    if (!base) return;
    if (base.questions.length >= limits.questions) { toast(`A form can ask at most ${limits.questions} questions.`, 'error'); return; }
    change({ questions: [...base.questions, blankQuestion()] });
  };
  const moveQuestion = (i, by) => {
    const base = draft ?? editing;
    const j = i + by;
    if (j < 0 || j >= base.questions.length) return;
    const qs = [...base.questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    change({ questions: qs });
  };
  const dropQuestion = (i) => {
    const base = draft ?? editing;
    change({ questions: base.questions.filter((_, j) => j !== i) });
  };
  // Most questions are a near-copy of the one above - sizes for shirts, then sizes for hoodies.
  const copyQuestion = (i) => {
    const base = draft ?? editing;
    if (base.questions.length >= limits.questions) { toast(`A form can ask at most ${limits.questions} questions.`, 'error'); return; }
    const src = base.questions[i];
    const copy = { ...src, id: newId(), options: [...(src.options ?? [])] };
    change({ questions: [...base.questions.slice(0, i + 1), copy, ...base.questions.slice(i + 1)] });
  };

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

  const typeOptions = Object.entries(types).map(([value, t]) => ({ value, label: t.label }));
  const needsOptions = (type) => !!types[type]?.options;
  const countsQuantity = (type) => !!types[type]?.quantity;
  const asksHowMany = (editing?.questions ?? []).some(q => countsQuantity(q.type) && q.required);

  /**
   * The answer control as the customer will meet it. Radio circles for a pick-one, tick boxes for
   * a pick-any, the item rows for a list: the question is written in the shape it will be read,
   * instead of a settings row that has to be imagined into a form. The controls are drawn, not
   * live - the only things typed here are the choices themselves.
   */
  const answerPreview = (q, i) => {
    const ghost = (text, style) => <div className="pmp-q-ghost" style={style}>{text}</div>;
    const optionRows = (round) => (
      <div style={{ display: 'grid', gap: 6 }}>
        {(q.options ?? []).map((o, oi) => (
          <div key={oi} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <span className={`pmp-q-mark ${round ? 'round' : 'square'}`} />
            <input className="pmp-q-opt" value={o} maxLength={limits.option}
              placeholder={`Option ${oi + 1}`}
              onChange={e => changeQ(i, { options: q.options.map((x, j) => j === oi ? e.target.value : x) })} />
            <button type="button" aria-label="Remove option" onClick={() => changeQ(i, { options: q.options.filter((_, j) => j !== oi) })}
              style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}>{ICONS.x}</button>
          </div>
        ))}
        {(q.options ?? []).length < limits.options && (
          <button type="button" onClick={() => changeQ(i, { options: [...(q.options ?? []), ''] })}
            style={{ display: 'flex', gap: 9, alignItems: 'center', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', color: 'var(--gray)', fontSize: 13 }}>
            <span className={`pmp-q-mark ${round ? 'round' : 'square'}`} style={{ opacity: 0.5 }} />
            Add option
          </button>
        )}
      </div>
    );

    switch (q.type) {
      case 'short_text':  return ghost('Short answer', { maxWidth: 320 });
      case 'long_text':   return ghost('Long answer', { minHeight: 52 });
      case 'number':      return ghost('0', { maxWidth: 120, textAlign: 'center' });
      case 'date':        return ghost('dd / mm / yyyy', { maxWidth: 190 });
      case 'choice_one':  return optionRows(true);
      case 'choice_many': return optionRows(false);
      case 'size_grid':
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            {(q.options ?? []).map((o, oi) => (
              <div key={oi} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 28px', gap: 8, alignItems: 'center' }}>
                <input className="pmp-q-opt" value={o} maxLength={limits.option} placeholder={`Size ${oi + 1}`}
                  onChange={e => changeQ(i, { options: q.options.map((x, j) => j === oi ? e.target.value : x) })} />
                {ghost('0', { textAlign: 'center' })}
                <button type="button" aria-label="Remove size" onClick={() => changeQ(i, { options: q.options.filter((_, j) => j !== oi) })}
                  style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px 4px' }}>{ICONS.x}</button>
              </div>
            ))}
            {(q.options ?? []).length < limits.options && (
              <button type="button" onClick={() => changeQ(i, { options: [...(q.options ?? []), ''] })}
                style={{ ...S.btnSmGhost, alignSelf: 'start' }}>{ICONS.plus} Add a size</button>
            )}
          </div>
        );
      case 'item_list':
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8 }}>
              {ghost('Item')}
              {ghost('Qty', { textAlign: 'center' })}
            </div>
            {ghost('Size, colour, design notes')}
            <span style={{ fontSize: 11.5, color: 'var(--gray)' }}>+ Add another item - up to {limits.items} rows</span>
          </div>
        );
      default:
        return null;
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
            for, whether it is delivered or picked up, and the two ticks - those are not editable.
          </div>
        </div>
        <button type="button" onClick={startNew} style={S.btnPrimary}>{ICONS.plus} New form</button>
      </div>

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
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={S.label}>Form name</label>
              <input style={S.input} value={editing.name} maxLength={limits.name} placeholder="e.g. Shirt printing"
                onChange={e => change({ name: e.target.value })} />
              <span style={{ fontSize: 11, color: 'var(--gray)' }}>Only the shop sees this. It is how the form is picked in chat.</span>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={S.label}>What it says at the top</label>
              <textarea style={{ ...S.textarea, minHeight: 120 }} value={editing.description} maxLength={limits.description}
                placeholder={'File formats, artwork rules, anything they should read before answering.\nFiles come through this chat or the order - never by email.'}
                onChange={e => change({ description: e.target.value })} />
              <span style={{ fontSize: 11, color: 'var(--gray)' }}>{(editing.description ?? '').length} of {limits.description} characters.</span>
            </div>

            <div>
              <div style={{ marginBottom: 8 }}>
                <span style={S.label}>Questions ({editing.questions.length} of {limits.questions})</span>
              </div>

              {!asksHowMany && (
                <div style={{ ...S.note, marginBottom: 10 }}>
                  One question has to ask how many, and it has to be required. Use a number, a size
                  grid or a list of items. A price without a quantity is a guess.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {editing.questions.map((q, i) => (
                  <div key={q.id ?? i} className={`pmp-q-card${activeQ === (q.id ?? i) ? ' is-active' : ''}`}
                    onFocus={() => setActiveQ(q.id ?? i)}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px', gap: 12, alignItems: 'start' }} className="pmp-cols">
                      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                        <input className="pmp-q-title" value={q.label} maxLength={limits.label}
                          placeholder="Question" onChange={e => changeQ(i, { label: e.target.value })} />
                        <input className="pmp-q-help" value={q.help ?? ''} maxLength={limits.help}
                          placeholder="Help text (optional)" onChange={e => changeQ(i, { help: e.target.value })} />
                      </div>
                      <CustomSelect value={q.type} options={typeOptions}
                        onChange={(v) => changeQ(i, { type: v, options: needsOptions(v) ? (q.options?.length ? q.options : ['', '']) : [] })} />
                    </div>

                    {/* The answer, as the customer will meet it. */}
                    <div style={{ marginTop: 12 }}>{answerPreview(q, i)}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label="Move up"
                        style={{ ...S.btnSmGhost, padding: '4px 8px', opacity: i === 0 ? 0.4 : 1 }}>{ICONS.chevU}</button>
                      <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === editing.questions.length - 1} aria-label="Move down"
                        style={{ ...S.btnSmGhost, padding: '4px 8px', opacity: i === editing.questions.length - 1 ? 0.4 : 1 }}>{ICONS.chevD}</button>
                      <button type="button" onClick={() => copyQuestion(i)} aria-label="Duplicate question"
                        style={{ ...S.btnSmGhost, padding: '4px 8px' }}>{ICONS.plus} Duplicate</button>
                      {editing.questions.length > 1 && (
                        <button type="button" onClick={() => dropQuestion(i)} style={{ ...S.btnSmDanger, padding: '4px 8px' }} aria-label="Remove question">{ICONS.trash}</button>
                      )}
                      <label style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--gray-light)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!q.required} onChange={e => changeQ(i, { required: e.target.checked })}
                          style={{ width: 15, height: 15, accentColor: 'var(--gold)' }} />
                        Must be answered
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addQuestion} style={{ ...S.btnSmGhost, marginTop: 10, width: '100%', justifyContent: 'center', padding: '10px', borderStyle: 'dashed' }}>
                {ICONS.plus} Add a question
              </button>

              {/* The parts of the form nobody can change, shown rather than described - so the
                  whole thing can be read in one place before it is sent. */}
              <div style={{ marginTop: 14, border: '1px dashed var(--border)', borderRadius: 10, padding: '12px 16px', background: 'transparent' }}>
                <div style={{ ...S.label, marginBottom: 8 }}>Always asked - cannot be changed</div>
                <div style={{ display: 'grid', gap: 7, fontSize: 12.5, color: 'var(--gray)' }}>
                  <div>Their name, contact number and email</div>
                  <div>Delivery or pickup, with the delivery address</div>
                  <div>The two ticks: the details are correct, and the custom order terms</div>
                </div>
              </div>
            </div>

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
