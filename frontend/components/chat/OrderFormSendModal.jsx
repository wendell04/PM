'use client';

import React, { useEffect, useState } from 'react';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import OrderFormBuilder, { FORM_LIMITS, blankForm } from '@/components/dashboard/OrderFormBuilder';
// The server names a form's id `id` (laravel-mongodb 5); older copies said `_id`. Read both, and
// give back nothing when there is none - with both missing, every form's id was "undefined", so they
// all matched each other: the picker lit every card and saving an edit made a new form.
const tid = t => { const v = t?._id ?? t?.id; return v == null || v === '' ? undefined : String(v); };


const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Which order form to send - and, when the one this customer needs does not exist yet, writing it
 * here rather than leaving the conversation to go and make it.
 *
 * Three things can happen in this sheet:
 *   pick one       - send a saved form as it stands
 *   edit it        - change the wording for THIS send only; the saved form is untouched
 *   write a new one- the full builder, saved to the shop's forms and sent straightaway
 *
 * The builder is the same component Settings uses, so a form written in a hurry here is the same
 * object, with the same rules, as one written there.
 */
export default function OrderFormSendModal({ open, onClose, token, conversationId, onSent }) {
  const [templates, setTemplates] = useState(null);
  const [types, setTypes] = useState({});
  const [limits, setLimits] = useState(FORM_LIMITS);
  const [pickedId, setPickedId] = useState('');
  const [mode, setMode] = useState('pick');      // pick | edit | new
  const [draft, setDraft] = useState(null);      // the form being written or edited
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');          // '', 'sending', 'saving'

  useLockBodyScroll(open);

  useEffect(() => {
    if (!open || !token) return;
    setErr(''); setMode('pick'); setDraft(null);
    let dead = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/admin/order-forms`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 15000);
        const d = await res.json().catch(() => ({}));
        if (dead) return;
        if (!res.ok) throw new Error(d.message || 'Could not load the order forms.');
        const list = d?.data?.templates ?? [];
        setTemplates(list);
        setTypes(d?.data?.types ?? {});
        setLimits({ ...FORM_LIMITS, ...(d?.data?.limits ?? {}) });
        const def = list.find(t => t.isDefault) ?? list[0];
        setPickedId(String(tid(def) ?? ''));
      } catch (e) {
        if (!dead) { setTemplates([]); setErr(e.message || 'Could not load the order forms.'); }
      }
    })();
    return () => { dead = true; };
  }, [open, token]);

  if (!open) return null;

  const picked = (templates ?? []).find(t => String(tid(t)) === pickedId) ?? null;
  const shown = draft ?? picked;

  const startEdit = () => {
    if (!picked) return;
    setErr('');
    setDraft({ ...picked, questions: (picked.questions ?? []).map(q => ({ ...q, options: [...(q.options ?? [])] })) });
    setMode('edit');
  };
  const startNew = () => {
    if ((templates ?? []).length >= limits.templates) { setErr(`That is the ${limits.templates}-form limit. Delete one in Settings first.`); return; }
    setErr('');
    setDraft(blankForm());
    setMode('new');
  };
  const backToPick = () => { setDraft(null); setMode('pick'); setErr(''); };

  /** Write the form into the shop's list, so the next customer can be sent it by name. */
  const saveForm = async () => {
    if (!draft || busy) return;
    setBusy('saving'); setErr('');
    try {
      const isNew = !tid(draft);
      const res = await fetchWithTimeout(`${API_URL}/api/admin/order-forms${isNew ? '' : `/${tid(draft)}`}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: draft.name, description: draft.description, questions: draft.questions, isDefault: !!draft.isDefault }),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not save this form.');
      const saved = d?.data ?? null;
      // Refresh the list so the new form is in it, and pick it.
      const list = await fetchWithTimeout(`${API_URL}/api/admin/order-forms`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 15000)
        .then(r => r.json()).then(j => j?.data?.templates ?? []).catch(() => []);
      setTemplates(list);
      setPickedId(String(tid(saved) ?? tid(draft) ?? ''));
      setDraft(null);
      setMode('pick');
      return true;
    } catch (e) {
      setErr(e.message || 'Could not save this form.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const send = async (payload) => {
    if (!conversationId || busy) return;
    setBusy('sending'); setErr('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/chat/conversations/${conversationId}/order-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not send the order form.');
      onSent?.(d.data ?? d);
      onClose?.();
    } catch (e) {
      setErr(e.message || 'Could not send the order form.');
    } finally {
      setBusy('');
    }
  };

  const sendPicked = () => send({ templateId: pickedId });
  const sendEdited = () => send({ templateId: tid(draft) ?? pickedId, name: draft?.name, description: draft?.description, questions: draft?.questions });
  const saveAndSend = async () => { const ok = await saveForm(); if (ok !== false) { /* pickedId now points at it */ } };

  const cap = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--gray)' };
  const primary = { width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#d4a843', color: '#111', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' };
  const ghost = { width: '100%', padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'inherit', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' };

  return (
    <div onClick={onClose} className="pmp-sheet-scrim" style={{ zIndex: 100002 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Send an order form"
        className="pmp-sheet" style={{ background: 'var(--dark, #151515)', color: 'var(--white, #fff)', maxWidth: mode === 'pick' ? 520 : 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: '1rem', fontWeight: 800 }}>
            {mode === 'new' ? 'New order form' : mode === 'edit' ? 'Edit before sending' : 'Send an order form'}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--gray)', fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer' }}>&times;</button>
        </div>

        {templates === null ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {[0, 1].map(i => <div key={i} className="pmPulse" style={{ height: 52, borderRadius: 10, background: 'var(--dark2)' }} />)}
          </div>
        ) : mode !== 'pick' ? (
          <>
            {mode === 'edit' && (
              <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginBottom: 10, lineHeight: 1.5 }}>
                Send it changed for this customer only, or save the change to the form so every
                customer gets it from now on.
              </div>
            )}
            <OrderFormBuilder value={draft} onChange={setDraft} types={types} limits={limits} compact />

            {err && <div style={{ margin: '12px 0 0', padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: '0.8rem' }}>{err}</div>}

            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              {mode === 'edit' ? (
                <>
                  <button type="button" onClick={sendEdited} disabled={!!busy} style={{ ...primary, opacity: busy ? 0.7 : 1 }}>
                    {busy === 'sending' ? 'Sending...' : 'Send to this customer only'}
                  </button>
                  <button type="button" onClick={saveForm} disabled={!!busy} style={ghost}>
                    {busy === 'saving' ? 'Saving...' : 'Save the change to this form'}
                  </button>
                </>
              ) : (
                <button type="button" onClick={saveAndSend} disabled={!!busy} style={{ ...primary, opacity: busy ? 0.7 : 1 }}>
                  {busy === 'saving' ? 'Saving...' : 'Save this form'}
                </button>
              )}
              <button type="button" onClick={backToPick} disabled={!!busy} style={{ ...ghost, border: 'none', color: 'var(--gray)' }}>
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ ...cap, marginBottom: 6 }}>Which form</div>
            <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              {(templates ?? []).map(t => {
                const on = String(tid(t)) === pickedId;
                return (
                  <button key={tid(t)} type="button" onClick={() => setPickedId(String(tid(t)))}
                    style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}`, background: on ? 'var(--gold-subtle)' : 'transparent', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t.name}</span>
                      {t.isDefault && <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#d4a843', border: '1px solid rgba(212,168,67,0.45)', borderRadius: 999, padding: '1px 7px' }}>DEFAULT</span>}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--gray)', marginTop: 2 }}>
                      {(t.questions ?? []).length} question{(t.questions ?? []).length === 1 ? '' : 's'}
                    </div>
                  </button>
                );
              })}
              {/* The form this customer needs may not exist yet, and going to Settings to make it
                  means leaving the conversation you are in the middle of. */}
              <button type="button" onClick={startNew}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  border: '1px dashed rgba(212,168,67,0.55)', background: 'transparent', color: '#d4a843', fontWeight: 700, fontSize: '0.86rem' }}>
                + New form
              </button>
            </div>

            {picked && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={cap}>What they will see</span>
                  <button type="button" onClick={startEdit}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, color: '#d4a843', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                    Edit
                  </button>
                </div>

                {String(shown?.description ?? '').trim() !== '' && (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)',
                    fontSize: '0.78rem', color: 'var(--gray-light, #ddd)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                    {shown.description}
                  </div>
                )}

                <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                  {(shown?.questions ?? []).map((q, i) => (
                    <div key={q.id ?? i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'var(--dark2)' }}>
                      <span style={{ color: 'var(--gray)', fontSize: '0.78rem', flexShrink: 0 }}>{i + 1}.</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{q.label}</div>
                        {q.help ? <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: 3 }}>{q.help}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {err && <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: '0.8rem' }}>{err}</div>}

            <button type="button" onClick={sendPicked} disabled={!!busy || !pickedId}
              style={{ ...primary, background: busy || !pickedId ? 'var(--gray)' : '#d4a843', cursor: busy || !pickedId ? 'not-allowed' : 'pointer' }}>
              {busy === 'sending' ? 'Sending...' : 'Send this form'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
