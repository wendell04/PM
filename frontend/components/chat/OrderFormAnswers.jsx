'use client';

import React from 'react';
import { summariseForm, PAYMENT_OPTIONS } from '@/lib/orderForm';

/**
 * The customer's answers, drawn once for both chat windows.
 *
 * Two shapes arrive here: a form sent since the owner could write their own carries its questions
 * with it, so the card is drawn from those; a form sent before that has the old fixed fields.
 * Both end up as a few bold lines of what to make and label/value rows underneath.
 */

/** The answers as a list: bold lines first (what to make), then label/value rows. */
export function readAnswers(a) {
  const headline = [];
  const rows = [];
  if (a?.form) {
    for (const { label, value } of summariseForm(a.form, a.answers)) {
      if (label === '') headline.push(value); else rows.push([label, value]);
    }
  } else {
    for (const l of Array.isArray(a?.lines) ? a.lines : []) {
      headline.push(`${l.qty} x ${l.item}${l.details ? ` (${l.details})` : ''}`);
    }
    const pay = PAYMENT_OPTIONS.find(p => p.value === a?.payment)?.label;
    if (pay) rows.push(['Pays by', pay]);
    if (String(a?.instructions ?? '').trim()) rows.push(['Notes', a.instructions]);
  }
  return { headline, rows };
}

/** The same thing as plain text, for the note on the quotation the shop sends back. */
export function noteFromAnswers(a) {
  const { headline, rows } = readAnswers(a);
  return [
    ...headline,
    a?.shipment === 'pickup' ? 'Pickup' : `Delivery - ${a?.address || ''}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean).join('\n');
}

export default function OrderFormAnswers({ a }) {
  const { headline, rows } = readAnswers(a);
  const row = (k, v) => v ? (
    <div key={k + v} style={{ display: 'flex', gap: 8, fontSize: '0.78rem', lineHeight: 1.45 }}>
      <span style={{ color: 'var(--gray)', flex: '0 0 92px', wordBreak: 'break-word' }}>{k}</span>
      <span style={{ color: 'var(--white, #111)', whiteSpace: 'pre-wrap', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  ) : null;

  return (
    <div style={{ padding: '8px 12px', display: 'grid', gap: 5 }}>
      {headline.map((h, i) => (
        <div key={i} style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--white, #111)', overflowWrap: 'anywhere' }}>{h}</div>
      ))}
      {headline.length > 0 && <div style={{ height: 4 }} />}
      {row('For', [a?.name, a?.contact, a?.email].filter(Boolean).join(' - '))}
      {row(a?.shipment === 'pickup' ? 'Pickup' : 'Deliver to', a?.shipment === 'pickup' ? 'At the shop' : a?.address)}
      {rows.map(([k, v]) => row(k, v))}
    </div>
  );
}
