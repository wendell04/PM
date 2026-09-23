'use client';

import React, { useEffect, useMemo, useState } from 'react';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import PhoneInput from '@/components/auth/PhoneInput';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  blankFormState, blankOrderLine, validateForm, LIMITS,
  SHIPMENT_OPTIONS, PAYMENT_OPTIONS, MAX_ORDER_LINES,
} from '@/lib/orderForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * The order form the shop sent into the chat, opened for the customer to fill in.
 *
 * The questions are not written here any more - they are written by the owner in Settings and
 * copied onto the message when it is sent, so this draws whatever arrived with the message. What
 * stays fixed is the part every order needs however it was quoted: who you are, where it goes,
 * and the two ticks.
 */

// A form sent before the owner could write their own. Those messages carry no questions, so they
// are drawn from the list they were sent with, and answered in the shape that endpoint still takes.
const legacyForm = (shipment) => ({
  name: 'Order form',
  description: '',
  questions: [
    { id: 'lines', type: 'item_list', label: 'What you want made', help: 'One row per item. Size, colour and where the print goes belong in the details.', required: true, options: [] },
    { id: 'payment', type: 'choice_one', label: 'How you will pay', help: '', required: true,
      options: PAYMENT_OPTIONS.filter(o => o.value !== 'cash' || shipment === 'pickup').map(o => o.label) },
    { id: 'instructions', type: 'long_text', label: 'Anything else', help: 'Deadline, reference, anything we should know.', required: false, options: [] },
  ],
});

export default function OrderFormModal({ open, onClose, token, user, message, onFilled }) {
  const sent = message?.metadata?.form ?? null;
  const [a, setA] = useState(() => blankFormState(user, sent));
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);

  useLockBodyScroll(open);

  // Cash on pickup is only on the table when they are picking up, so the legacy form is rebuilt
  // when that changes. A form the owner wrote is used exactly as it was sent.
  const form = useMemo(() => sent ?? legacyForm(a.shipment), [sent, a.shipment]);

  // The default address, if the account has one. Typed over freely.
  useEffect(() => {
    if (!open || !token) return;
    setA(blankFormState(user, sent));
    setErr('');
    let dead = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/addresses`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 10000);
        const d = await res.json().catch(() => ({}));
        const list = Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : []);
        const def = list.find(x => x.isDefault || x.is_default) ?? list[0];
        if (!def || dead) return;
        const parts = [def.house_number ?? def.houseNumber, def.street, def.subdivision, def.barangay, def.city, def.province, def.zip]
          .map(x => String(x ?? '').trim()).filter(Boolean);
        if (parts.length) setA(prev => ({ ...prev, address: prev.address || parts.join(', '), contact: prev.contact || def.phone || '' }));
      } catch { /* the field stays typeable */ }
    })();
    return () => { dead = true; };
    // Keyed on the message, not on the objects: a parent that re-creates `user` or the metadata
    // on every render would otherwise wipe what the customer has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, message?._id ?? message?.id]);

  if (!open) return null;

  const set = (k, v) => setA(prev => ({ ...prev, [k]: v }));
  const setAns = (id, v) => setA(prev => ({ ...prev, answers: { ...prev.answers, [id]: v } }));
  const answer = (q) => {
    const v = a.answers?.[q.id];
    // A choice that has left the list is no answer: cash on pickup stops being one the moment
    // they switch to delivery.
    if (q.type === 'choice_one') return (q.options || []).includes(v) ? v : '';
    if (v !== undefined) return v;
    return q.type === 'choice_many' ? [] : q.type === 'item_list' ? [blankOrderLine()] : q.type === 'size_grid' ? (q.options || []).map(size => ({ size, qty: '' })) : '';
  };

  const submit = async () => {
    const missing = validateForm({ ...a, answers: Object.fromEntries((form.questions ?? []).map(q => [q.id, answer(q)])) }, form);
    if (missing.length) { setErr(`Still needed: ${missing.join(', ')}.`); return; }
    setSending(true); setErr('');
    try {
      const core = {
        name: a.name, contact: a.contact, email: a.email,
        address: a.shipment === 'delivery' ? a.address : '',
        shipment: a.shipment,
        confirmDetails: a.confirmDetails ? 1 : 0,
        agreeTerms: a.agreeTerms ? 1 : 0,
      };
      let body;
      if (sent) {
        const answers = {};
        for (const q of form.questions ?? []) {
          const v = answer(q);
          if (q.type === 'item_list') {
            answers[q.id] = (Array.isArray(v) ? v : []).filter(l => String(l.item ?? '').trim())
              .map(l => ({ item: l.item.trim(), details: String(l.details ?? '').trim(), qty: Number(l.qty) }));
          } else if (q.type === 'size_grid') {
            answers[q.id] = (Array.isArray(v) ? v : []).filter(r => Number(r.qty) > 0).map(r => ({ size: r.size, qty: Number(r.qty) }));
          } else if (q.type === 'number') {
            answers[q.id] = String(v ?? '').trim();
          } else {
            answers[q.id] = v;
          }
        }
        body = { ...core, answers };
      } else {
        // The old endpoint shape, from the same answers.
        const lines = (answer(form.questions[0]) || []).filter(l => String(l.item ?? '').trim())
          .map(l => ({ item: l.item.trim(), details: String(l.details ?? '').trim(), qty: Number(l.qty) }));
        const payLabel = answer(form.questions[1]);
        body = {
          ...core,
          lines,
          payment: PAYMENT_OPTIONS.find(o => o.label === payLabel)?.value ?? 'gcash',
          instructions: answer(form.questions[2]) || '',
        };
      }
      const res = await fetchWithTimeout(`${API_URL}/api/chat/messages/${message._id || message.id}/order-form`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not send the form.');
      onFilled?.(d.data ?? d);
      onClose?.();
    } catch (e) {
      setErr(e.message || 'Could not send the form.');
    } finally {
      setSending(false);
    }
  };

  const field = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--white, #fff)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };
  const label = { display: 'block', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--gray)', margin: '0 0 6px' };
  const help = { display: 'block', fontSize: '0.74rem', color: 'var(--gray)', margin: '-2px 0 6px', lineHeight: 1.45 };
  const section = { marginBottom: 18 };
  const pill = (on) => ({ flex: '1 1 140px', padding: '9px 10px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${on ? '#d4a843' : 'rgba(255,255,255,0.14)'}`, background: on ? 'rgba(212,168,67,0.14)' : 'transparent', color: on ? '#d4a843' : 'var(--white, #fff)' });

  const digits = (s, max) => String(s ?? '').replace(/[^0-9]/g, '').slice(0, max);

  const renderQuestion = (q) => {
    const v = answer(q);
    switch (q.type) {
      case 'short_text':
        return <input style={field} value={v} maxLength={LIMITS.shortAnswer} onChange={e => setAns(q.id, e.target.value)} />;
      case 'long_text':
        return <textarea style={{ ...field, minHeight: 72, resize: 'vertical' }} value={v} maxLength={LIMITS.longAnswer} onChange={e => setAns(q.id, e.target.value)} />;
      case 'number':
        return <input style={{ ...field, maxWidth: 160 }} inputMode="numeric" value={v} onChange={e => setAns(q.id, digits(e.target.value, 7))} />;
      case 'date':
        return <input type="date" style={{ ...field, maxWidth: 200, colorScheme: 'dark' }} value={v}
          min={new Date().toISOString().slice(0, 10)} onChange={e => setAns(q.id, e.target.value)} />;
      case 'choice_one':
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(q.options || []).map(o => (
              <button key={o} type="button" onClick={() => setAns(q.id, o)} style={pill(v === o)}>{o}</button>
            ))}
          </div>
        );
      case 'choice_many':
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(q.options || []).map(o => {
              const on = Array.isArray(v) && v.includes(o);
              return (
                <button key={o} type="button" style={pill(on)}
                  onClick={() => setAns(q.id, on ? v.filter(x => x !== o) : [...(Array.isArray(v) ? v : []), o])}>{o}</button>
              );
            })}
          </div>
        );
      case 'size_grid':
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            {(Array.isArray(v) ? v : []).map((row, i) => (
              <div key={row.size ?? i} style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.86rem' }}>{row.size}</span>
                <input style={{ ...field, textAlign: 'center' }} inputMode="numeric" placeholder="0" value={row.qty}
                  onChange={e => setAns(q.id, v.map((r, j) => j === i ? { ...r, qty: digits(e.target.value, 6) } : r))} />
              </div>
            ))}
          </div>
        );
      case 'item_list': {
        const rows = Array.isArray(v) ? v : [blankOrderLine()];
        return (
          <>
            {rows.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 28px', gap: 6, marginBottom: 6 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <input style={field} placeholder={i === 0 ? 'e.g. Cotton shirt, front print' : 'Another item'} value={l.item} maxLength={LIMITS.item}
                    onChange={e => setAns(q.id, rows.map((r, j) => j === i ? { ...r, item: e.target.value } : r))} />
                  <input style={{ ...field, fontSize: '0.82rem' }} placeholder="Size, colour, design notes" value={l.details} maxLength={LIMITS.itemDetails}
                    onChange={e => setAns(q.id, rows.map((r, j) => j === i ? { ...r, details: e.target.value } : r))} />
                </div>
                <input style={{ ...field, textAlign: 'center' }} placeholder="Qty" inputMode="numeric" value={l.qty}
                  onChange={e => setAns(q.id, rows.map((r, j) => j === i ? { ...r, qty: digits(e.target.value, 6) } : r))} />
                <button type="button" onClick={() => setAns(q.id, rows.length === 1 ? rows : rows.filter((_, j) => j !== i))}
                  aria-label="Remove item" disabled={rows.length === 1}
                  style={{ background: 'none', border: 'none', color: rows.length === 1 ? 'transparent' : 'var(--gray)', fontSize: '1.2rem', cursor: 'pointer', padding: 0 }}>&times;</button>
              </div>
            ))}
            {rows.length < MAX_ORDER_LINES && (
              <button type="button" onClick={() => setAns(q.id, [...rows, blankOrderLine()])}
                style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--gray)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', width: '100%' }}>
                + Add another item
              </button>
            )}
          </>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={form.name || 'Order form'}
        style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', background: 'var(--dark, #151515)', color: 'var(--white, #fff)',
          borderRadius: '16px 16px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{form.name || 'Order form'}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--gray)', fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer' }}>&times;</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'var(--gray)', lineHeight: 1.5 }}>
          Tell us exactly what you want made and we will send an exact price here in the chat.
        </p>

        {String(form.description ?? '').trim() !== '' && (
          <div style={{ marginBottom: 16, padding: '11px 13px', borderRadius: 10, background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)',
            fontSize: '0.82rem', color: 'var(--gray-light, #ddd)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {form.description}
          </div>
        )}

        <div style={section}>
          <label style={label}>Who to make it for</label>
          <div style={{ display: 'grid', gap: 8 }}>
            <input style={field} placeholder="Your name" value={a.name} maxLength={120} onChange={e => set('name', e.target.value)} />
            <PhoneInput value={a.contact} onChange={v => set('contact', v)} inputStyle={field} />
            <input style={field} placeholder="Email" inputMode="email" value={a.email} maxLength={160} onChange={e => set('email', e.target.value)} />
          </div>
        </div>

        {(form.questions ?? []).map(q => (
          <div key={q.id} style={section}>
            <label style={label}>{q.label}{!q.required && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}> (optional)</span>}</label>
            {q.help ? <span style={help}>{q.help}</span> : null}
            {renderQuestion(q)}
          </div>
        ))}

        <div style={section}>
          <label style={label}>How it reaches you</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {SHIPMENT_OPTIONS.map(o => (
              <button key={o.value} type="button" onClick={() => set('shipment', o.value)} style={pill(a.shipment === o.value)}>{o.label}</button>
            ))}
          </div>
          {a.shipment === 'delivery' && (
            <textarea style={{ ...field, minHeight: 64, resize: 'vertical' }} placeholder="Delivery address" value={a.address} maxLength={400} onChange={e => set('address', e.target.value)} />
          )}
        </div>

        <div style={{ ...section, display: 'grid', gap: 8 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.82rem', color: 'var(--white, #fff)', cursor: 'pointer' }}>
            <input type="checkbox" checked={a.confirmDetails} onChange={e => set('confirmDetails', e.target.checked)} style={{ marginTop: 3 }} />
            <span>The details above are correct.</span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.82rem', color: 'var(--white, #fff)', cursor: 'pointer' }}>
            <input type="checkbox" checked={a.agreeTerms} onChange={e => set('agreeTerms', e.target.checked)} style={{ marginTop: 3 }} />
            <span>I agree to the custom order terms, which are shown in full when I pay the quotation. A quotation is a price for what is written here; changes after it is sent may change the price.</span>
          </label>
        </div>

        {err && <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: '0.82rem' }}>{err}</div>}

        <button type="button" onClick={submit} disabled={sending}
          style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: sending ? 'var(--gray)' : '#d4a843', color: '#111', fontWeight: 800, fontSize: '0.95rem', cursor: sending ? 'not-allowed' : 'pointer' }}>
          {sending ? 'Sending...' : 'Send my details'}
        </button>
      </div>
    </div>
  );
}
