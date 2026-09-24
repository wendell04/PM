'use client';

import React from 'react';
import { readAnswers } from '@/components/chat/OrderFormAnswers';

/**
 * What the customer filled in and agreed to, shown on a quotation, a checkout or an order.
 *
 * A frozen copy travels with the quote - the questions as they were sent and the answers as they
 * were given - so this never has to look anything up, and a template edited next month cannot
 * change what somebody is shown they agreed to. Read-only by design: a record that can be edited
 * afterwards is not a record of anything.
 *
 * The same reader the chat card uses, so one form reads the same in all four places it appears.
 */

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function OneForm({ snap, compact }) {
  const a = snap?.answers ?? snap;
  if (!a) return null;
  const { headline, rows } = readAnswers(a);
  const name = snap?.formName || a?.form?.name || 'Order form';
  const at = when(snap?.submittedAt || a?.agreedAt);

  const row = (k, v) => v ? (
    <div key={k + v} style={{ display: 'flex', gap: 10, fontSize: '0.8rem', lineHeight: 1.5, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--gray)', flex: '0 0 116px', wordBreak: 'break-word' }}>{k}</span>
      <span style={{ color: 'var(--white)', whiteSpace: 'pre-wrap', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  ) : null;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: compact ? '10px 12px' : '14px 16px', background: 'var(--dark2)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--white)' }}>{name}</span>
        {at && <span style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>filled in {at}</span>}
      </div>

      {headline.length > 0 && (
        <div style={{ display: 'grid', gap: 3, marginBottom: 8 }}>
          {headline.map((h, i) => (
            <div key={i} style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--white)', overflowWrap: 'anywhere' }}>{h}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 5 }}>
        {row('For', [a?.name, a?.contact, a?.email].filter(Boolean).join(' - '))}
        {row('Deliver to', a?.address)}
        {rows.map(([k, v]) => row(k, v))}
      </div>

      {/* The two ticks are the point of keeping this at all - without them it is a note, with
          them it is what was agreed. */}
      <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)', display: 'grid', gap: 4, fontSize: '0.75rem', color: 'var(--gray)' }}>
        <span>Confirmed the details were correct</span>
        <span>Agreed to the custom order terms</span>
      </div>
    </div>
  );
}

export default function OrderFormSnapshot({ forms, title = 'What you told us', compact = false, style = null }) {
  const list = (Array.isArray(forms) ? forms : (forms ? [forms] : [])).filter(Boolean);
  if (!list.length) return null;

  return (
    <div style={{ display: 'grid', gap: 10, ...(style || {}) }}>
      {title && (
        <div style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray)' }}>
          {title}{list.length > 1 ? ` (${list.length})` : ''}
        </div>
      )}
      {list.map((snap, i) => <OneForm key={snap?.askId ?? i} snap={snap} compact={compact} />)}
    </div>
  );
}
