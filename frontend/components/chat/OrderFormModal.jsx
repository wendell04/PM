'use client';

import React, { useEffect, useState } from 'react';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import PhoneInput from '@/components/auth/PhoneInput';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  blankAnswers, blankOrderLine, validateAnswers, MAX_ORDER_LINES,
  SHIPMENT_OPTIONS, PAYMENT_OPTIONS,
} from '@/lib/orderForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * The order form the shop sent into the chat, opened for the customer to fill in.
 *
 * One screen, top to bottom: who you are, what you want made, how it reaches you, how you pay,
 * anything else, and two ticks. Name, contact and email come from the account; the address comes
 * from the address book when there is one. The customer is here because they asked "how much" -
 * the form exists so the answer can be exact the first time.
 */
export default function OrderFormModal({ open, onClose, token, user, message, onFilled }) {
  const [a, setA] = useState(() => blankAnswers(user));
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);

  useLockBodyScroll(open);

  // The default address, if the account has one. Typed over freely.
  useEffect(() => {
    if (!open || !token) return;
    setA(blankAnswers(user));
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
  }, [open, token, user]);

  if (!open) return null;

  const set = (k, v) => setA(prev => ({ ...prev, [k]: v }));
  const setLine = (i, k, v) => setA(prev => ({ ...prev, lines: prev.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) }));
  const addLine = () => setA(prev => prev.lines.length >= MAX_ORDER_LINES ? prev : ({ ...prev, lines: [...prev.lines, blankOrderLine()] }));
  const dropLine = (i) => setA(prev => ({ ...prev, lines: prev.lines.length === 1 ? prev.lines : prev.lines.filter((_, j) => j !== i) }));

  const submit = async () => {
    const missing = validateAnswers(a);
    if (missing.length) { setErr(`Still needed: ${missing.join(', ')}.`); return; }
    setSending(true); setErr('');
    try {
      const body = {
        ...a,
        lines: a.lines.filter(l => String(l.item ?? '').trim()).map(l => ({ item: l.item.trim(), details: String(l.details ?? '').trim(), qty: Number(l.qty) })),
        confirmDetails: a.confirmDetails ? 1 : 0,
        agreeTerms: a.agreeTerms ? 1 : 0,
      };
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
  const section = { marginBottom: 18 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Order form"
        style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', background: 'var(--dark, #151515)', color: 'var(--white, #fff)',
          borderRadius: '16px 16px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>Order form</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--gray)', fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer' }}>&times;</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'var(--gray)', lineHeight: 1.5 }}>
          Tell us exactly what you want made and we will send an exact price here in the chat.
        </p>

        <div style={section}>
          <label style={label}>Who to make it for</label>
          <div style={{ display: 'grid', gap: 8 }}>
            <input style={field} placeholder="Your name" value={a.name} maxLength={120} onChange={e => set('name', e.target.value)} />
            <PhoneInput value={a.contact} onChange={v => set('contact', v)} inputStyle={field} />
            <input style={field} placeholder="Email" inputMode="email" value={a.email} maxLength={160} onChange={e => set('email', e.target.value)} />
          </div>
        </div>

        <div style={section}>
          <label style={label}>What you want made</label>
          {a.lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 28px', gap: 6, marginBottom: 6 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <input style={field} placeholder={i === 0 ? 'e.g. Cotton shirt, front print' : 'Another item'} value={l.item} maxLength={160} onChange={e => setLine(i, 'item', e.target.value)} />
                <input style={{ ...field, fontSize: '0.82rem' }} placeholder="Size, colour, design notes" value={l.details} maxLength={200} onChange={e => setLine(i, 'details', e.target.value)} />
              </div>
              <input style={{ ...field, textAlign: 'center' }} placeholder="Qty" inputMode="numeric" value={l.qty} maxLength={6} onChange={e => setLine(i, 'qty', e.target.value.replace(/[^0-9]/g, ''))} />
              <button type="button" onClick={() => dropLine(i)} aria-label="Remove item" disabled={a.lines.length === 1}
                style={{ background: 'none', border: 'none', color: a.lines.length === 1 ? 'transparent' : 'var(--gray)', fontSize: '1.2rem', cursor: 'pointer', padding: 0 }}>&times;</button>
            </div>
          ))}
          {a.lines.length < MAX_ORDER_LINES && (
            <button type="button" onClick={addLine} style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--gray)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', width: '100%' }}>
              + Add another item
            </button>
          )}
        </div>

        <div style={section}>
          <label style={label}>How it reaches you</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {SHIPMENT_OPTIONS.map(o => (
              <button key={o.value} type="button" onClick={() => set('shipment', o.value)}
                style={{ flex: '1 1 140px', padding: '9px 10px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${a.shipment === o.value ? '#d4a843' : 'rgba(255,255,255,0.14)'}`,
                  background: a.shipment === o.value ? 'rgba(212,168,67,0.14)' : 'transparent', color: a.shipment === o.value ? '#d4a843' : 'var(--white, #fff)' }}>
                {o.label}
              </button>
            ))}
          </div>
          {a.shipment === 'delivery' && (
            <textarea style={{ ...field, minHeight: 64, resize: 'vertical' }} placeholder="Delivery address" value={a.address} maxLength={400} onChange={e => set('address', e.target.value)} />
          )}
        </div>

        <div style={section}>
          <label style={label}>How you will pay</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PAYMENT_OPTIONS.filter(o => o.value !== 'cash' || a.shipment === 'pickup').map(o => (
              <button key={o.value} type="button" onClick={() => set('payment', o.value)}
                style={{ flex: '1 1 120px', padding: '9px 10px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${a.payment === o.value ? '#d4a843' : 'rgba(255,255,255,0.14)'}`,
                  background: a.payment === o.value ? 'rgba(212,168,67,0.14)' : 'transparent', color: a.payment === o.value ? '#d4a843' : 'var(--white, #fff)' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div style={section}>
          <label style={label}>Anything else</label>
          <textarea style={{ ...field, minHeight: 72, resize: 'vertical' }} placeholder="Deadline, reference, where the print goes, anything we should know" value={a.instructions} maxLength={2000} onChange={e => set('instructions', e.target.value)} />
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
