'use client';

/**
 * The payment method tiles, and the card details a card needs.
 *
 * The cart checkout has had these since the beginning; the quote checkout had nothing and handed
 * the customer to PayMongo's hosted page to pick a method there instead - a second picker, in
 * someone else's design, after they had already decided. This is that choice made once, on our
 * own screen, so both screens can go straight to authorising it.
 *
 * COD is deliberately absent. A quote is a priced offer with an expiry that the shop has already
 * scheduled work against; there is nothing to collect from a rider at the door.
 */

export const ONLINE_METHODS = [
  {
    id: 'gcash',
    label: 'GCash',
    sub: 'Pay using your GCash wallet.',
    accent: '#2E7DF7',
    accentBg: 'rgba(46,125,247,0.07)',
    logo: '/logos/Gcash-Logo-1024x1024.png',
  },
  {
    id: 'paymaya',
    label: 'Maya',
    sub: 'Pay using your Maya wallet.',
    accent: '#00B14F',
    accentBg: 'rgba(0,177,79,0.07)',
    logo: '/logos/maya logo.png',
  },
  {
    id: 'card',
    label: 'Credit / Debit Card',
    sub: 'Pay securely with Visa or Mastercard.',
    accent: '#9C7BE8',
    accentBg: 'rgba(156,123,232,0.07)',
    logo: '/logos/credit-card.svg',
    filterImg: true,
  },
];

const input = {
  width: '100%', padding: '0.65rem 0.8rem', borderRadius: 9,
  border: '1px solid var(--border)', background: 'var(--dark)',
  color: 'var(--white)', fontSize: '0.875rem', fontFamily: 'inherit',
};

export default function PaymentMethods({
  value,
  onChange,
  enabled = {},
  theme = 'dark',
  eWalletPhone = '',
  onEWalletPhone,
  card = {},
  onCard,
}) {
  // Missing key means enabled - the owner turns a method OFF, they do not turn one on.
  const options = ONLINE_METHODS.filter(o => enabled[o.id] !== false);

  if (options.length === 0) {
    return (
      <p style={{ fontSize: '0.82rem', color: '#b45309', margin: 0 }}>
        No online payment method is switched on right now. Message the shop and they will sort it out.
      </p>
    );
  }

  const setCard = (k, v) => onCard?.({ ...card, [k]: v });

  return (
    <div>
      {options.map(opt => {
        const on = value === opt.id;
        return (
          <div key={opt.id}>
            <div
              onClick={() => onChange?.(opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.875rem',
                padding: '0.875rem 1rem', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${on ? opt.accent : 'var(--border)'}`,
                background: on ? opt.accentBg : 'var(--dark)',
                marginBottom: on ? 0 : '0.625rem', transition: 'all 0.18s',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: on ? opt.accentBg : 'var(--dark2)',
                border: `1px solid ${on ? opt.accent : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={opt.logo} alt={opt.label}
                  style={{
                    width: 30, height: 30, objectFit: 'contain',
                    ...(opt.filterImg
                      ? { filter: theme === 'light' ? 'brightness(0) opacity(0.55)' : 'brightness(0) invert(1)', opacity: on ? 1 : 0.45 }
                      : { borderRadius: 6 }),
                  }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--white)' }}>{opt.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{opt.sub}</div>
              </div>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${on ? opt.accent : 'var(--gray)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {on && <div style={{ width: 9, height: 9, borderRadius: '50%', background: opt.accent }} />}
              </div>
            </div>

            {on && (opt.id === 'gcash' || opt.id === 'paymaya') && (
              <div style={{ padding: '0.75rem 1rem 0.875rem', border: `1px solid ${opt.accent}`, borderTop: 'none', borderRadius: '0 0 10px 10px', marginBottom: '0.625rem', background: opt.accentBg }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: 4 }}>
                  Mobile number <span style={{ opacity: 0.7 }}>(optional - we use your account number if blank)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>+63</span>
                  <input value={eWalletPhone} inputMode="numeric" maxLength={10}
                    onChange={e => onEWalletPhone?.(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="912 345 6789" style={input} />
                </div>
              </div>
            )}

            {on && opt.id === 'card' && (
              <div style={{ padding: '0.75rem 1rem 0.875rem', border: `1px solid ${opt.accent}`, borderTop: 'none', borderRadius: '0 0 10px 10px', marginBottom: '0.625rem', background: opt.accentBg, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={card.number || ''} inputMode="numeric" maxLength={19}
                  onChange={e => setCard('number', e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim())}
                  placeholder="Card number" style={input} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={card.expiry || ''} maxLength={5}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setCard('expiry', v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v);
                    }}
                    placeholder="MM/YY" style={input} />
                  <input value={card.cvc || ''} inputMode="numeric" maxLength={4}
                    onChange={e => setCard('cvc', e.target.value.replace(/\D/g, ''))}
                    placeholder="CVC" style={input} />
                </div>
                <input value={card.name || ''} maxLength={80}
                  onChange={e => setCard('name', e.target.value)}
                  placeholder="Name on card" style={input} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Turn card details into a PayMongo payment method id, in the browser, so the number never
 * touches our server. Same call the cart checkout makes.
 */
export async function tokenizeCard(card, user) {
  const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
  if (!publicKey || publicKey.includes('REPLACE')) {
    throw new Error('Card payments are not configured. Please choose GCash or Maya.');
  }
  const [expMonth, expYear] = String(card.expiry || '').split('/');
  const res = await fetch('https://api.paymongo.com/v1/payment_methods', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(publicKey + ':')}` },
    body: JSON.stringify({ data: { attributes: {
      type: 'card',
      details: {
        card_number: String(card.number || '').replace(/\s/g, ''),
        exp_month: parseInt(expMonth, 10),
        exp_year: parseInt('20' + (expYear || ''), 10),
        cvc: card.cvc || '',
      },
      billing: {
        name: (card.name || '').trim() || [user?.firstName, user?.lastName].filter(Boolean).join(' '),
        email: user?.email || '',
        phone: '',
      },
    } } }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.errors?.[0]?.detail || 'That card was not accepted. Check the details and try again.');
  }
  return data.data.id;
}
