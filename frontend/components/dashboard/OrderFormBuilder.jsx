'use client';

import { useState } from 'react';
import { S, ICONS, CustomSelect } from '@/app/dashboard/business/inventory-v2/shared';

/**
 * The order form builder, in one place.
 *
 * It is used from Settings, where forms are managed, and from the chat, where a form is written at
 * the moment somebody needs one that does not exist yet. Two copies of a builder is two builders
 * that drift, so this is controlled: it holds no form of its own, it draws the one it is given and
 * hands back the next one.
 *
 * Each question is a card carrying the control the customer will meet - radio circles, tick boxes,
 * the size rows, the item table - so the question is written in the shape it will be read.
 */

export const FORM_LIMITS = {
  templates: 20, questions: 20, name: 60, description: 2000,
  label: 120, help: 160, options: 20, option: 60, items: 10,
};

export const newQuestionId = () => 'q' + Math.random().toString(36).slice(2, 8);

export const blankQuestion = () => ({ id: newQuestionId(), type: 'short_text', label: '', help: '', required: false, options: [] });

/** A new form starts by asking what to make, because every form has to ask how many. */
export const blankForm = () => ({
  _id: null,
  name: '',
  description: '',
  questions: [{ id: newQuestionId(), type: 'item_list', label: 'What do you want made?', help: 'One row per item, with the quantity beside it.', required: true, options: [] }],
  isDefault: false,
});

export default function OrderFormBuilder({ value, onChange, types = {}, limits = FORM_LIMITS, compact = false }) {
  const [activeQ, setActiveQ] = useState(null);
  const form = value ?? blankForm();
  const lim = { ...FORM_LIMITS, ...limits };

  const set = (patch) => onChange({ ...form, ...patch });
  const setQ = (i, patch) => onChange({ ...form, questions: form.questions.map((q, j) => j === i ? { ...q, ...patch } : q) });

  const typeOptions = Object.entries(types).map(([v, t]) => ({ value: v, label: t.label }));
  const needsOptions = (type) => !!types[type]?.options;
  const asksHowMany = (form.questions ?? []).some(q => types[q.type]?.quantity && q.required);

  const addQuestion = () => {
    if (form.questions.length >= lim.questions) return;
    set({ questions: [...form.questions, blankQuestion()] });
  };
  const copyQuestion = (i) => {
    if (form.questions.length >= lim.questions) return;
    const src = form.questions[i];
    const copy = { ...src, id: newQuestionId(), options: [...(src.options ?? [])] };
    set({ questions: [...form.questions.slice(0, i + 1), copy, ...form.questions.slice(i + 1)] });
  };
  const moveQuestion = (i, by) => {
    const j = i + by;
    if (j < 0 || j >= form.questions.length) return;
    const qs = [...form.questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    set({ questions: qs });
  };
  const dropQuestion = (i) => set({ questions: form.questions.filter((_, j) => j !== i) });

  // The answer control as the customer will meet it. Drawn, not live - the only things typed here
  // are the choices themselves.
  const answerPreview = (q, i) => {
    const ghost = (text, style) => <div className="pmp-q-ghost" style={style}>{text}</div>;
    const optionRows = (round) => (
      <div style={{ display: 'grid', gap: 6 }}>
        {(q.options ?? []).map((o, oi) => (
          <div key={oi} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <span className={`pmp-q-mark ${round ? 'round' : 'square'}`} />
            <input className="pmp-q-opt" value={o} maxLength={lim.option} placeholder={`Option ${oi + 1}`}
              onChange={e => setQ(i, { options: q.options.map((x, j) => j === oi ? e.target.value : x) })} />
            <button type="button" aria-label="Remove option" onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== oi) })}
              style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}>{ICONS.x}</button>
          </div>
        ))}
        {(q.options ?? []).length < lim.options && (
          <button type="button" onClick={() => setQ(i, { options: [...(q.options ?? []), ''] })}
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
      // Same editor as Pick any - the rows ARE the areas. The hint underneath is where the
      // convention lives: "Front full - 30x40cm" splits on the dash into a place and a limit,
      // and nothing about a t-shirt is assumed, so a mug lid or a box base works the same way.
      case 'print_area': return (
        <div style={{ display: 'grid', gap: 6 }}>
          {optionRows(false)}
          <div style={{ fontSize: 11.5, color: 'var(--gray)', lineHeight: 1.5 }}>
            Write each area as <b>where - max size</b>, for example <i>Front full - 30x40cm</i>.
            The part after the dash is shown to the customer as the largest print that area takes.
          </div>
        </div>
      );
      case 'size_grid':
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            {(q.options ?? []).map((o, oi) => (
              <div key={oi} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 28px', gap: 8, alignItems: 'center' }}>
                <input className="pmp-q-opt" value={o} maxLength={lim.option} placeholder={`Size ${oi + 1}`}
                  onChange={e => setQ(i, { options: q.options.map((x, j) => j === oi ? e.target.value : x) })} />
                {ghost('0', { textAlign: 'center' })}
                <button type="button" aria-label="Remove size" onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== oi) })}
                  style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px 4px' }}>{ICONS.x}</button>
              </div>
            ))}
            {(q.options ?? []).length < lim.options && (
              <button type="button" onClick={() => setQ(i, { options: [...(q.options ?? []), ''] })}
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
            <span style={{ fontSize: 11.5, color: 'var(--gray)' }}>+ Add another item - up to {lim.items} rows</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.75rem' : '1rem' }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <label style={S.label}>Form name</label>
        <input style={S.input} value={form.name} maxLength={lim.name} placeholder="e.g. Shirt printing"
          onChange={e => set({ name: e.target.value })} />
        <span style={{ fontSize: 11, color: 'var(--gray)' }}>Only the shop sees this. It is how the form is picked in chat.</span>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={S.label}>What it says at the top</label>
        <textarea style={{ ...S.textarea, minHeight: compact ? 90 : 120 }} value={form.description} maxLength={lim.description}
          placeholder={'File formats, artwork rules, anything they should read before answering.'}
          onChange={e => set({ description: e.target.value })} />
        <span style={{ fontSize: 11, color: 'var(--gray)' }}>{(form.description ?? '').length} of {lim.description} characters.</span>
      </div>

      <div>
        <div style={{ marginBottom: 8 }}>
          <span style={S.label}>Questions ({form.questions.length} of {lim.questions})</span>
        </div>

        {!asksHowMany && (
          <div style={{ ...S.note, marginBottom: 10 }}>
            One question has to ask how many, and it has to be required. Use a number, a size grid
            or a list of items. A price without a quantity is a guess.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {form.questions.map((q, i) => (
            <div key={q.id ?? i} className={`pmp-q-card${activeQ === (q.id ?? i) ? ' is-active' : ''}`}
              onFocus={() => setActiveQ(q.id ?? i)}>
              <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 190px', gap: 12, alignItems: 'start' }} className="pmp-cols">
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <input className="pmp-q-title" value={q.label} maxLength={lim.label}
                    placeholder="Question" onChange={e => setQ(i, { label: e.target.value })} />
                  <input className="pmp-q-help" value={q.help ?? ''} maxLength={lim.help}
                    placeholder="Help text (optional)" onChange={e => setQ(i, { help: e.target.value })} />
                </div>
                <CustomSelect value={q.type} options={typeOptions}
                  onChange={(v) => setQ(i, { type: v, options: needsOptions(v) ? (q.options?.length ? q.options : ['', '']) : [] })} />
              </div>

              <div style={{ marginTop: 12 }}>{answerPreview(q, i)}</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label="Move up"
                  style={{ ...S.btnSmGhost, padding: '4px 8px', opacity: i === 0 ? 0.4 : 1 }}>{ICONS.chevU}</button>
                <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === form.questions.length - 1} aria-label="Move down"
                  style={{ ...S.btnSmGhost, padding: '4px 8px', opacity: i === form.questions.length - 1 ? 0.4 : 1 }}>{ICONS.chevD}</button>
                <button type="button" onClick={() => copyQuestion(i)} aria-label="Duplicate question"
                  style={{ ...S.btnSmGhost, padding: '4px 8px' }}>{ICONS.plus} Duplicate</button>
                {form.questions.length > 1 && (
                  <button type="button" onClick={() => dropQuestion(i)} style={{ ...S.btnSmDanger, padding: '4px 8px' }} aria-label="Remove question">{ICONS.trash}</button>
                )}
                <label style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--gray-light)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!q.required} onChange={e => setQ(i, { required: e.target.checked })}
                    style={{ width: 15, height: 15, accentColor: 'var(--gold)' }} />
                  Must be answered
                </label>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={addQuestion}
          style={{ ...S.btnSmGhost, marginTop: 10, width: '100%', justifyContent: 'center', padding: '10px', borderStyle: 'dashed' }}>
          {ICONS.plus} Add a question
        </button>

        {/* Shown rather than described, so the whole form reads in one place before it is sent. */}
        <div style={{ marginTop: 14, border: '1px dashed var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Always asked - cannot be changed</div>
          <div style={{ display: 'grid', gap: 7, fontSize: 12.5, color: 'var(--gray)' }}>
            <div>Their name, contact number and email</div>
            <div>Their complete shipping address</div>
            <div>The two ticks: the details are correct, and the custom order terms</div>
          </div>
        </div>
      </div>
    </div>
  );
}
