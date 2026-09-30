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

  const call = useCallback(async (path, method = 'GET') => {
    const res = await fetch(`${API_URL}/api/pay/${token}${path}`, { method, headers: { Accept: 'application/json' } });
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
          let d = await call('/verify', 'POST');
          for (let i = 0; i < 3 && d.balance > 0; i++) {
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

  const pay = async () => {
    setBusy(true); setError('');
    try {
      const d = await call('/checkout', 'POST');
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
    <h1 className="py-title">{back ? 'Your payment is still on its way' : `Pay ${peso(data.balance)}`}</h1>
    <p className="py-lede">
      {back
        ? 'We have not received the confirmation yet - it can take a minute. Refresh this page shortly; you will not be charged twice.'
        : `${data.firstName ? `Hi ${data.firstName}, t` : 'T'}his is what is left on your order. Once it clears, we release it for delivery.`}
    </p>
    {failed && <div className="py-error">The payment did not go through. Nothing was charged - you can try again.</div>}
    <div className="py-sum">
      <div><span>Order total</span><b>{peso(data.total)}</b></div>
      <div><span>Already paid</span><b>{peso(data.paid)}</b></div>
      <div className="py-due"><span>To pay now</span><b>{peso(data.balance)}</b></div>
    </div>
    {data.items?.length > 0 && <ul className="py-items">{data.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
    {error && <div className="py-error">{error}</div>}
    <div className="py-actions">
      {back
        ? <button type="button" className="py-btn" onClick={() => window.location.replace(`/pay/${token}?done=1`)}>Check again</button>
        : <button type="button" className="py-btn" onClick={pay} disabled={busy}>{busy ? 'Opening the payment page...' : `Pay ${peso(data.balance)}`}</button>}
    </div>
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
  .py-sum .py-due { background: #faf6ea; }
  .py-sum .py-due b { color: #a67c1a; font-size: 1.1rem; }
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
