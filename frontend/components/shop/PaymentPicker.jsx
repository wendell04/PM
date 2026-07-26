'use client';

import { useState } from 'react';

/**
 * One payment picker, used the same way everywhere (checkout, order detail, pay balance)
 * so the customer never meets two different payment UIs. GCash and Maya redirect to their
 * own secure pages - there is no number to enter here, and entering one would not decide
 * which account pays, so the field was dropped. Only a card is filled inline.
 *
 * Props:
 *   methods   ['gcash','paymaya','card'] - already filtered by the store's CMS toggles
 *   amount    number to charge (for the button label)
 *   onPay     (method, cardData|null) => void   cardData: {number, expiry, cvc, name}
 *   loading   boolean
 *   error     string | null
 *   ctaLabel  optional override, default "Pay <amount>"
 */

const METHODS = {
  gcash:   { label: 'GCash',               sub: "You'll confirm on GCash's secure page", accent: '#0066FF', logo: '/logos/Gcash-Logo-1024x1024.png' },
  paymaya: { label: 'Maya',                sub: "You'll confirm on Maya's secure page",  accent: '#00B14F', logo: '/logos/maya logo.png' },
  card:    { label: 'Credit / Debit Card', sub: 'Visa or Mastercard',                    accent: '#9C7BE8', logo: '/logos/credit-card.svg', filterImg: true },
};

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtCardNumber(v) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function fmtExpiry(v) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export default function PaymentPicker({ methods = ['gcash', 'paymaya', 'card'], amount = 0, onPay, loading = false, error = null, ctaLabel }) {
  const [selected, setSelected] = useState(null);
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', name: '' });
  const [localErr, setLocalErr] = useState(null);

  const list = methods.filter((m) => METHODS[m]);

  function submit() {
    if (!selected) { setLocalErr('Choose a payment method.'); return; }
    if (selected === 'card') {
      if (card.number.replace(/\s/g, '').length < 16) { setLocalErr('Enter a valid 16-digit card number.'); return; }
      if (card.expiry.length < 5) { setLocalErr('Enter a valid expiry (MM/YY).'); return; }
      if (card.cvc.length < 3) { setLocalErr('Enter a valid security code.'); return; }
      if (!card.name.trim()) { setLocalErr('Enter the name on the card.'); return; }
    }
    setLocalErr(null);
    onPay(selected, selected === 'card' ? card : null);
  }

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.7rem', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--dark2)',
    color: 'var(--white)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {list.map((id) => {
        const m = METHODS[id];
        const active = selected === id;
        return (
          <div key={id}>
            <button
              type="button"
              onClick={() => { setSelected(id); setLocalErr(null); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 11px', borderRadius: '9px', cursor: 'pointer',
                border: `1px solid ${active ? m.accent : 'var(--border)'}`,
                background: active ? `${m.accent}10` : 'transparent',
                transition: 'border-color 0.15s, background 0.15s', textAlign: 'left',
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--dark)', border: '1px solid var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', ...(m.filterImg ? { filter: 'brightness(0) invert(0.7)' } : {}) }} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)' }}>{m.label}</span>
                <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--gray)', marginTop: 1 }}>{m.sub}</span>
              </span>
              <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? m.accent : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.accent }} />}
              </span>
            </button>

            {active && id === 'card' && (
              <div style={{ marginTop: '7px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <input inputMode="numeric" placeholder="1234 1234 1234 1234" value={card.number}
                  onChange={(e) => setCard((c) => ({ ...c, number: fmtCardNumber(e.target.value) }))} style={inputStyle} />
                <div style={{ display: 'flex', gap: '7px' }}>
                  <input inputMode="numeric" placeholder="MM/YY" value={card.expiry}
                    onChange={(e) => setCard((c) => ({ ...c, expiry: fmtExpiry(e.target.value) }))} style={{ ...inputStyle, flex: 1 }} />
                  <input inputMode="numeric" placeholder="CVC" value={card.cvc}
                    onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))} style={{ ...inputStyle, flex: 1 }} />
                </div>
                <input placeholder="Name on card" value={card.name}
                  onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))} style={inputStyle} />
              </div>
            )}
          </div>
        );
      })}

      {(localErr || error) && (
        <div style={{ padding: '8px 11px', borderRadius: '7px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.76rem' }}>
          {localErr || error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        style={{
          width: '100%', marginTop: '2px', padding: '11px', borderRadius: '9px', border: 'none',
          background: loading ? 'var(--border)' : 'var(--gold, #d4a843)',
          color: loading ? 'var(--gray)' : '#000', fontSize: '0.9rem', fontWeight: 800,
          cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}
      >
        {loading ? 'Processing...' : (ctaLabel || `Pay ${peso(amount)}`)}
      </button>
    </div>
  );
}
