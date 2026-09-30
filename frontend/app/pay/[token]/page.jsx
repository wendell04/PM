'use client';

/**
 * Pay the balance from the email, without signing in.
 *
 * Opened from the payment reminder (and from the proof page after approving). The token names one
 * order and can do one thing: start a PayMongo checkout for what is left on it. Opening the page never
 * charges - mail scanners open every link - paying is a button. PayMongo sends the customer back here,
 * and the page confirms the payment itself instead of waiting for the webhook.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const METHOD_NAMES = { gcash: 'GCash', paymaya: 'Maya', card: 'card' };
// Only what the owner has left on (Payment Methods) - the page never promises one that is off.
const methodsText = (m) => {
  const names = (Array.isArray(m) ? m : ['gcash', 'paymaya', 'card']).map(x => METHOD_NAMES[x] || x);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] || 'Online payment');
};
const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayPage() {
  const { token } = useParams();
  const params = useSearchParams();
  const back = params.get('done') === '1';
  const failed = params.get('failed') === '1';

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [payFull, setPayFull] = useState(false);
  const [withFee, setWithFee] = useState(true);
  // What had been paid when they left for PayMongo. A deposit leaves a balance behind, so "the
  // balance is zero" cannot be the test for "it went through"; more paid than before is.
  const paidKey = `pmp_pay_${token}_paid`;
  const paidBefore = () => { try { const v = sessionStorage.getItem(paidKey); return v == null ? null : Number(v); } catch { return null; } };

  const call = useCallback(async (path, method = 'GET', body) => {
    const res = await fetch(`${API_URL}/api/pay/${token}${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(d.message || 'Something went wrong. Try again.'); e.status = res.status; throw e; }
    return d.data;
  }, [token]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        if (back) {
          // Back from PayMongo: record it now. A wallet can take a few seconds to confirm, so ask
          // again a couple of times before saying it is still on its way.
          setChecking(true);
          const before = paidBefore();
          const landed = (x) => x.balance <= 0 || (before != null && x.paid > before);
          let d = await call('/verify', 'POST');
          for (let i = 0; i < 3 && !landed(d); i++) {
            await new Promise(r => setTimeout(r, 3000));
            d = await call('/verify', 'POST');
          }
          if (!dead) setData(d);
        } else if (!dead) setData(await call(''));
      } catch (e) { if (!dead) setError(e.status === 410 ? 'expired' : e.message); }
      finally { if (!dead) { setLoading(false); setChecking(false); } }
    })();
    return () => { dead = true; };
  }, [call, back]);

  // Same choices as My Orders. A parcel courier cannot be paid at the door, so there the fee is not optional.
  const feeIncluded = !!data?.deliveryFee && (withFee || !data?.riderCollects);
  const goods = data ? (data.downpaymentPercent && !payFull ? data.downpaymentAmount : data.balance) : 0;
  const charge = Math.round((goods + (feeIncluded ? data.deliveryFee : 0)) * 100) / 100;

  const pay = async () => {
    setBusy(true); setError('');
    try {
      const d = await call('/checkout', 'POST', { payFull: !data.downpaymentPercent || payFull, includeDeliveryFee: feeIncluded });
      try { sessionStorage.setItem(paidKey, String(data.paid)); } catch { /* the check falls back to the balance */ }
      window.location.href = d.checkoutUrl;
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const shell = (children) => (<div className="py-wrap"><div className="py-card">{children}</div><style jsx>{css}</style></div>);

  if (loading) return shell(<p className="py-lede">{checking ? 'Confirming your payment...' : 'Loading...'}</p>);

  if (error === 'expired' || (!data && error)) return shell(<>
    <h1 className="py-title">This payment link has expired</h1>
    <p className="py-lede">Payment links last two weeks. Open the order in My Orders to pay, or message us and we will send a fresh link.</p>
    <a className="py-btn ghost" href="/shop/orders-history">Open My Orders</a>
  </>);

  const head = (<>
    <div className="py-ref">Order {data.orderRef}</div>
  </>);

  if (data.cancelled) return shell(<>{head}
    <h1 className="py-title">This order was cancelled</h1>
    <p className="py-lede">There is nothing to pay. If this is a mistake, message us from My Orders.</p>
  </>);

  // Back from paying a deposit: it went through, and the rest is due later.
  const before = back ? paidBefore() : null;
  if (back && data.balance > 0 && before != null && data.paid > before) return shell(<>{head}
    <h1 className="py-title">Payment received - thank you</h1>
    <p className="py-lede">
      We have your {peso(data.paid - before)}{data.firstName ? `, ${data.firstName}` : ''}. Your receipt is on its way to your email.
      {` The remaining ${peso(data.balance)} is due before we release your order - we will remind you.`}
    </p>
    <a className="py-btn ghost" href="/shop/orders-history">See the order</a>
  </>);

  if (data.balance <= 0) return shell(<>{head}
    <h1 className="py-title">{back ? 'Payment received - thank you' : 'This order is fully paid'}</h1>
    <p className="py-lede">
      {back
        ? `We have your payment${data.firstName ? `, ${data.firstName}` : ''}. Your receipt is on its way to your email, and we will let you know as your order moves.`
        : 'There is nothing left to pay on this order.'}
    </p>
    <a className="py-btn ghost" href="/shop/orders-history">See the order</a>
  </>);

  if (data.cod) return shell(<>{head}
    <h1 className="py-title">Pay on delivery</h1>
    <p className="py-lede">This order is paid in cash when it arrives: {peso(data.balance)}. Nothing to pay online.</p>
  </>);

  return shell(<>
    {head}
    <h1 className="py-title">{back ? 'Your payment is still on its way' : `Pay ${peso(charge)}`}</h1>
    <p className="py-lede">
      {back
        ? 'We have not received the confirmation yet - it can take a minute. Refresh this page shortly; you will not be charged twice.'
        : `${data.firstName ? `Hi ${data.firstName}, t` : 'T'}his is what is left on your order. ${data.beforeProduction ? 'Production starts once your payment clears.' : 'Once it clears, we release it for delivery.'}`}
    </p>
    {failed && <div className="py-error">The payment did not go through. Nothing was charged - you can try again.</div>}
    <div className="py-sum">
      <div><span>Order total</span><b>{peso(data.total)}</b></div>
      <div><span>Already paid</span><b>{peso(data.paid)}</b></div>
      <div><span>Balance</span><b>{peso(data.balance)}</b></div>
      {data.deliveryFee > 0 && (
        <div className="py-sub"><span>Delivery fee <small>(not in the total)</small></span><b>{peso(data.deliveryFee)}</b></div>
      )}
    </div>
    {data.items?.length > 0 && <ul className="py-items">{data.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
    {!back && data.downpaymentPercent > 0 && (
      <div className="py-choice" role="radiogroup" aria-label="How much to pay">
        <button type="button" role="radio" aria-checked={!payFull} className={!payFull ? 'on' : ''} onClick={() => setPayFull(false)}>
          Pay {data.downpaymentPercent}% down<span>{peso(data.downpaymentAmount)}</span>
        </button>
        <button type="button" role="radio" aria-checked={payFull} className={payFull ? 'on' : ''} onClick={() => setPayFull(true)}>
          Pay in full<span>{peso(data.balance)}</span>
        </button>
      </div>
    )}
    {!back && data.deliveryFee > 0 && (
      <label className={`py-fee${feeIncluded ? ' on' : ''}`}>
        <input type="checkbox" checked={feeIncluded} disabled={!data.riderCollects} onChange={e => setWithFee(e.target.checked)} />
        <span>
          <b>Include the {peso(data.deliveryFee)} delivery fee</b>
          {data.riderCollects
            ? 'Settle it now and there is nothing to hand the rider. Untick to pay them in cash on arrival instead.'
            : 'This one ships by parcel courier, so it cannot be paid at your door. It is added to this payment.'}
        </span>
      </label>
    )}
    {!back && (
      <div className="py-due-row"><span>To pay now</span><b>{peso(charge)}</b></div>
    )}
    {error && <div className="py-error">{error}</div>}
    <div className="py-actions">
      {back
        ? <button type="button" className="py-btn" onClick={() => window.location.replace(`/pay/${token}?done=1`)}>Check again</button>
        : <button type="button" className="py-btn" onClick={pay} disabled={busy}>{busy ? 'Opening the payment page...' : `Pay ${peso(charge)}`}</button>}
    </div>
    {!back && data.deliveryFee > 0 && !feeIncluded && (
      <p className="py-fine">You will hand {peso(data.deliveryFee)} to the rider in cash when your order arrives.</p>
    )}
    <p className="py-fine">{methodsText(data.methods)}, through PayMongo. No sign-in needed; this link works for this one order only.</p>
  </>);
}

const css = `
  .py-wrap { min-height: 100vh; background: #f4f4f2; padding: 2.5rem 1rem 4rem; color-scheme: light;
             display: flex; justify-content: center; align-items: flex-start; font-family: Arial, Helvetica, sans-serif; }
  .py-card { width: 100%; max-width: 480px; background: #ffffff; border: 1px solid rgba(0,0,0,.08);
             border-radius: 14px; padding: 1.75rem; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .py-ref { font-size: .74rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #a67c1a; margin-bottom: .4rem; }
  .py-title { font-size: 1.45rem; font-weight: 800; color: #111111; margin: 0 0 .5rem; }
  .py-lede { font-size: .92rem; line-height: 1.6; color: #555555; margin: 0 0 1.25rem; }
  .py-sum { border: 1px solid rgba(0,0,0,.08); border-radius: 10px; overflow: hidden; margin-bottom: 1rem; }
  .py-sum div { display: flex; justify-content: space-between; padding: .65rem .9rem; font-size: .9rem; color: #444444; border-top: 1px solid rgba(0,0,0,.06); }
  .py-sum div:first-child { border-top: none; }
  .py-sum b { color: #111111; font-variant-numeric: tabular-nums; }
  .py-sum .py-sub span, .py-sum .py-sub b { color: #7a7a7a; font-weight: 400; }
  .py-sum small { font-size: .75rem; }
  .py-choice { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-bottom: .75rem; }
  .py-choice button { background: #ffffff; border: 1px solid rgba(0,0,0,.14); border-radius: 9px; padding: .7rem .5rem; cursor: pointer;
                      font: inherit; font-size: .85rem; font-weight: 700; color: #555555; line-height: 1.35; }
  .py-choice button span { display: block; font-weight: 600; font-size: .8rem; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .py-choice button.on { border-color: #D4A843; background: #faf6ea; color: #7a5a10; }
  .py-choice button:focus-visible, .py-fee input:focus-visible { outline: 2px solid #a67c1a; outline-offset: 2px; }
  .py-fee { display: flex; gap: .6rem; align-items: flex-start; border: 1px solid rgba(0,0,0,.12); border-radius: 9px; padding: .7rem .8rem;
            margin-bottom: .75rem; font-size: .8rem; line-height: 1.5; color: #666666; cursor: pointer; }
  .py-fee.on { border-color: #D4A843; background: #fdfaf1; }
  .py-fee input { accent-color: #D4A843; margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; }
  .py-fee b { display: block; color: #222222; font-size: .86rem; }
  .py-due-row { display: flex; justify-content: space-between; align-items: baseline; background: #faf6ea; border-radius: 9px;
                padding: .7rem .9rem; margin-bottom: .9rem; font-size: .92rem; color: #444444; }
  .py-due-row b { color: #a67c1a; font-size: 1.15rem; font-variant-numeric: tabular-nums; }
  .py-items { margin: 0 0 1.25rem; padding-left: 1.1rem; color: #555555; font-size: .85rem; }
  .py-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
  .py-btn { flex: 1 1 auto; background: #D4A843; color: #1a1a1a; border: none; border-radius: 8px; padding: .9rem 1.2rem;
            font-weight: 700; font-size: 1rem; cursor: pointer; text-align: center; text-decoration: none; display: inline-block; }
  .py-btn[disabled] { opacity: .6; cursor: wait; }
  .py-btn.ghost { background: #ffffff; color: #333333; border: 1px solid rgba(0,0,0,.2); }
  .py-error { background: #fdecea; border: 1px solid #f5c2bd; color: #b3261e; border-radius: 8px; padding: .65rem .8rem; font-size: .85rem; margin-bottom: 1rem; }
  .py-fine { font-size: .76rem; color: #7a7a7a; margin: 1.1rem 0 0; line-height: 1.5; }
  @media (max-width: 480px) { .py-card { padding: 1.25rem; } }
`;
