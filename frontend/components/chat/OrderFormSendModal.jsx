'use client';

import React, { useEffect, useState } from 'react';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Which order form to send, and whether to change it for this one customer.
 *
 * The shop asks a shirt order different questions than a tarpaulin order, so the forms are the
 * owner's to write in Settings and this picks one. An edit here travels with this send only: the
 * template is not touched, and neither is any form already sitting in somebody else's chat.
 */
export default function OrderFormSendModal({ open, onClose, token, conversationId, onSent }) {
  const [templates, setTemplates] = useState(null);
  const [pickedId, setPickedId] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);       // { description, questions } for this send only
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);

  useLockBodyScroll(open);

  useEffect(() => {
    if (!open || !token) return;
    setErr(''); setEditing(false); setDraft(null);
    let dead = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/admin/order-forms`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 15000);
        const d = await res.json().catch(() => ({}));
        if (dead) return;
        if (!res.ok) throw new Error(d.message || 'Could not load the order forms.');
        const list = d?.data?.templates ?? [];
        setTemplates(list);
        const def = list.find(t => t.isDefault) ?? list[0];
        setPickedId(String(def?._id ?? ''));
      } catch (e) {
        if (!dead) { setTemplates([]); setErr(e.message || 'Could not load the order forms.'); }
      }
    })();
    return () => { dead = true; };
  }, [open, token]);

  if (!open) return null;

  const picked = (templates ?? []).find(t => String(t._id) === pickedId) ?? null;
  const shown = draft ?? { description: picked?.description ?? '', questions: picked?.questions ?? [] };

  const startEditing = () => {
    setDraft({ description: picked?.description ?? '', questions: (picked?.questions ?? []).map(q => ({ ...q })) });
    setEditing(true);
  };
  const stopEditing = () => { setDraft(null); setEditing(false); };

  const send = async () => {
    if (!conversationId || sending) return;
    setSending(true); setErr('');
    try {
      const body = { templateId: pickedId };
      if (draft) { body.description = draft.description; body.questions = draft.questions; }
      const res = await fetchWithTimeout(`${API_URL}/api/chat/conversations/${conversationId}/order-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not send the order form.');
      onSent?.(d.data ?? d);
      onClose?.();
    } catch (e) {
      setErr(e.message || 'Could not send the order form.');
    } finally {
      setSending(false);
    }
  };

  const field = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--white, #fff)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };
  const cap = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--gray)' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100002, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Send an order form"
        style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: 'var(--dark, #151515)', color: 'var(--white, #fff)',
          borderRadius: '16px 16px 0 0', padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: '1rem', fontWeight: 800 }}>Send an order form</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--gray)', fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer' }}>&times;</button>
        </div>

        {templates === null ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {[0, 1].map(i => <div key={i} className="pmPulse" style={{ height: 52, borderRadius: 10, background: 'rgba(255,255,255,0.06)' }} />)}
          </div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.6 }}>
            No order forms yet. Settings has an Order forms tab where the questions are written.
          </div>
        ) : (
          <>
            <div style={{ ...cap, marginBottom: 6 }}>Which form</div>
            <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
              {templates.map(t => {
                const on = String(t._id) === pickedId;
                return (
                  <button key={t._id} type="button" onClick={() => { setPickedId(String(t._id)); stopEditing(); }}
                    style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${on ? '#d4a843' : 'rgba(255,255,255,0.14)'}`, background: on ? 'rgba(212,168,67,0.12)' : 'transparent', color: 'inherit' }}>
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
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={cap}>What they will see</span>
              <button type="button" onClick={editing ? stopEditing : startEditing}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, color: '#d4a843', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                {editing ? 'Use the saved form' : 'Edit before sending'}
              </button>
            </div>
            {editing && (
              <div style={{ fontSize: '0.74rem', color: 'var(--gray)', marginBottom: 8, lineHeight: 1.5 }}>
                Changes here go to this customer only. The saved form stays as it is.
              </div>
            )}

            {editing ? (
              <textarea style={{ ...field, minHeight: 84, resize: 'vertical', marginBottom: 10 }} maxLength={2000}
                placeholder="What the form says at the top - file formats, artwork rules, anything they should read first."
                value={shown.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
            ) : (
              String(shown.description ?? '').trim() !== '' && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)',
                  fontSize: '0.78rem', color: 'var(--gray-light, #ddd)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                  {shown.description}
                </div>
              )
            )}

            <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
              {(shown.questions ?? []).map((q, i) => (
                <div key={q.id ?? i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--gray)', fontSize: '0.78rem', flexShrink: 0, paddingTop: editing ? 9 : 0 }}>{i + 1}.</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {editing ? (
                      <input style={{ ...field, fontSize: '0.82rem' }} maxLength={120} value={q.label}
                        onChange={e => setDraft(d => ({ ...d, questions: d.questions.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))} />
                    ) : (
                      <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{q.label}</div>
                    )}
                    {q.help ? <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: 3 }}>{q.help}</div> : null}
                  </div>
                  {editing && (shown.questions ?? []).length > 1 && (
                    <button type="button" aria-label="Take this question out"
                      onClick={() => setDraft(d => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }))}
                      style={{ background: 'none', border: 'none', color: 'var(--gray)', fontSize: '1.1rem', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>&times;</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {err && <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: '0.8rem' }}>{err}</div>}

        <button type="button" onClick={send} disabled={sending || !pickedId}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: sending || !pickedId ? 'var(--gray)' : '#d4a843', color: '#111', fontWeight: 800, fontSize: '0.9rem', cursor: sending || !pickedId ? 'not-allowed' : 'pointer' }}>
          {sending ? 'Sending...' : 'Send this form'}
        </button>
      </div>
    </div>
  );
}
