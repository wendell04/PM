'use client';
/**
 * The proof page a customer reaches from the email, without signing in.
 *
 * Approving a proof is the step the whole order waits on. Before this it took: find the email,
 * remember you have an account, sign in, find the order, then approve. Every one of those is a
 * place a job stalls for a day, and the shop is left waiting on someone who does not know it is
 * their turn.
 *
 * The signed token in the URL is the identification. Opening this page changes nothing - the
 * answer is a POST from one of the two buttons - so a mail scanner fetching the link cannot
 * approve artwork on the customer's behalf.
 */
import { useState, useEffect, use } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function ProofPage({ params }) {
  const { token } = use(params);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState('');
  const [done,    setDone]    = useState('');
  const [payDue,  setPayDue]  = useState(false);
  // The no-sign-in pay link, handed back once approved while a balance is owed online.
  const [payUrl,  setPayUrl]  = useState(null);
  const [asking,  setAsking]  = useState(false);
  const [notes,   setNotes]   = useState('');

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/proof/${token}`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.message || 'This link is not valid any more.');
        if (!dead) setData(d.data);
      } catch (e) {
        if (!dead) setError(e.message);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [token]);

  const respond = async (decision) => {
    if (decision === 'revision' && notes.trim().length < 5) {
      // The server asks for at least 5 characters; say so here instead of letting it refuse.
      setError(notes.trim() ? 'Please say a little more about what to change.' : 'Tell us what to change, so we do not send the same thing back.');
      return;
    }
    setBusy(decision); setError('');
    try {
      const res = await fetch(`${API_URL}/api/proof/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: notes.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not record that. Please try again.');
      // Approved but nothing paid yet: production waits on them, and this page used to say it
      // could start - the last thing a customer reading it from their inbox should be told.
      setPayDue(String(d?.data?.orderStatus ?? '') === 'awaiting_payment');
      setPayUrl(d?.data?.payUrl || null);
      setDone(decision);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(''); }
  };

  const shell = (children) => (
    <div className="pf-wrap"><div className="pf-card">{children}</div><style jsx>{css}</style></div>
  );

  if (loading) return shell(<p className="pf-lede">Loading your proof...</p>);

  if (error && !data) return shell(<>
    <h1 className="pf-title">This link has expired</h1>
    <p className="pf-lede">
      Proof links last two weeks. Open the order in My Orders to see the latest proof, or reply to
      our message and we will send a fresh one.
    </p>
    <a className="pf-btn ghost" href="/shop/orders-history">Open My Orders</a>
  </>);

  if (done) return shell(<>
    <h1 className="pf-title">{done === 'approve' ? 'Approved - thank you' : 'Thanks, we are on it'}</h1>
    <p className="pf-lede">
      {done === 'approve'
        ? (payDue
          ? `We have your approval on ${data.orderRef}. One step left: pay and production starts${payUrl ? ' - right here, no sign-in needed' : ' - in My Orders'}.`
          : `We have your approval on ${data.orderRef} and production can start. You will hear from us when it is ready.`)
        : `We have your notes on ${data.orderRef}. We will make the changes and send you a new proof.`}
    </p>
    <div className="pf-actions">
      {done === 'approve' && payUrl && <a className={payDue ? 'pf-btn' : 'pf-btn ghost'} href={payUrl}>{payDue ? 'Pay now' : 'Pay the balance now'}</a>}
      <a className={done === 'approve' && payDue && !payUrl ? 'pf-btn' : 'pf-btn ghost'} href="/shop/orders-history">
        {done === 'approve' && payDue && !payUrl ? 'Pay in My Orders' : 'See the order'}
      </a>
    </div>
  </>);

  // A cancelled order - the hold ran out, the proof went unanswered, or it was cancelled - cannot be
  // approved back to life from an old email. Say why, and how to get it going again.
  if (data?.closed || data?.holdEnded) return shell(<>
    <h1 className="pf-title">{data.closed ? 'This order is closed' : 'The hold on this order has ended'}</h1>
    <p className="pf-lede">
      {data.closed
        ? (data.closedReason ? `${data.closedReason} ` : `Order ${data.orderRef} was cancelled, so this proof can no longer be answered. `)
        : `We held order ${data.orderRef}${data.heldUntil ? ` until ${data.heldUntil}` : ''} for payment, and it was not paid in time, so it can no longer be paid. `}
      If you still want it, message us in your order chat and we will set it up again.
    </p>
    <div className="pf-actions">
      <a className="pf-btn ghost" href="/shop/orders-history">Open My Orders</a>
    </div>
  </>);

  if (data?.answered) return shell(<>
    <h1 className="pf-title">You have already answered this</h1>
    <p className="pf-lede">
      We have your reply on {data.orderRef} - nothing more is needed from you. If you want to
      change something, open the order and message us.
    </p>
    <div className="pf-actions">
      {data.payUrl && <a className="pf-btn" href={data.payUrl}>Pay the balance now</a>}
      <a className="pf-btn ghost" href="/shop/orders-history">Open the order</a>
    </div>
  </>);

  return shell(<>
    <div className="pf-ref">Order {data.orderRef}</div>
    <h1 className="pf-title">Does this look right?</h1>
    <p className="pf-lede">
      This is how we will print it. {data?.payFirst
        ? 'Once you approve, you pay in My Orders and it goes to production exactly as it appears here'
        : 'Once you approve, it goes to production as it appears here'} -
      so please check the spelling, the colours and where everything sits.
    </p>

    <div className="pf-proofs">
      {(data.proofs || []).map((u, i) => (
        // A video proof was drawn as an <img> and showed nothing.
        /\.(mp4|webm|mov|m4v)(\?|$)|\/video\/upload\//i.test(u)
          ? <video key={i} src={u} className="pf-img" controls playsInline preload="metadata" />
          /* eslint-disable-next-line @next/next/no-img-element */
          : <img key={i} src={u} alt={`Proof ${i + 1}`} className="pf-img" />
      ))}
      {(data.proofs || []).length === 0 && (
        <p className="pf-lede">The proof did not load. Open the order in My Orders to see it.</p>
      )}
    </div>

    {(data.items || []).length > 0 && (
      <ul className="pf-items">
        {data.items.map((it, i) => (
          <li key={i}>{it.name}{it.variant ? ` - ${it.variant}` : ''} x{it.qty}</li>
        ))}
      </ul>
    )}

    {error && <div className="pf-error">{error}</div>}

    {!asking ? (
      <div className="pf-actions">
        <button className="pf-btn" disabled={!!busy} onClick={() => respond('approve')}>
          {busy === 'approve' ? 'Approving...' : (data?.payFirst ? 'Approve this design' : 'Approve and print it')}
        </button>
        <button className="pf-btn ghost" disabled={!!busy} onClick={() => { setAsking(true); setError(''); }}>
          Ask for a change
        </button>
      </div>
    ) : (
      <>
        <label className="pf-label" htmlFor="pf-notes">What should we change?</label>
        <textarea id="pf-notes" className="pf-area" value={notes} maxLength={1000}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. make the name bigger, move the logo to the left chest" />
        <div className="pf-actions">
          <button className="pf-btn" disabled={!!busy} onClick={() => respond('revision')}>
            {busy === 'revision' ? 'Sending...' : 'Send these notes'}
          </button>
          <button className="pf-btn ghost" disabled={!!busy} onClick={() => setAsking(false)}>Back</button>
        </div>
      </>
    )}

    <p className="pf-fine">
      You are seeing this because we sent you a proof. Nothing is charged here, and this link only
      works for this one order.
    </p>
  </>);
}

const css = `
  /* Light, like the email that opens it: a customer taps a white email and lands on the same look,
     not a black page. Colours are fixed (not the dashboard theme) - the customer is not signed in. */
  .pf-wrap { min-height: 100vh; background: #f4f4f2; padding: 2.5rem 1rem 4rem; color-scheme: light;
             display: flex; justify-content: center; align-items: flex-start; }
  .pf-card { width: 100%; max-width: 560px; background: #ffffff;
             border: 1px solid rgba(0,0,0,.08); border-radius: 14px; padding: 1.75rem;
             box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .pf-ref { font-size: .74rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
            color: #a67c1a; margin-bottom: .4rem; }
  .pf-title { font-size: 1.45rem; font-weight: 800; color: #111111; margin: 0 0 .5rem; }
  .pf-lede { font-size: .92rem; line-height: 1.6; color: #555555; margin: 0 0 1.25rem; }
  .pf-proofs { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1.25rem; }
  .pf-img { width: 100%; border-radius: 10px; border: 1px solid rgba(0,0,0,.1); display: block; }
  .pf-items { margin: 0 0 1.25rem; padding-left: 1.1rem; color: #444444; font-size: .88rem; }
  .pf-items li { margin-bottom: .25rem; }
  .pf-label { display: block; font-size: .78rem; font-weight: 700; letter-spacing: .4px;
              text-transform: uppercase; color: #6b6b6b; margin-bottom: .35rem; }
  .pf-area { width: 100%; min-height: 110px; background: #fafaf8;
             border: 1px solid rgba(0,0,0,.15); border-radius: 8px; padding: .7rem .85rem;
             color: #111111; font-size: .95rem; font-family: inherit; line-height: 1.55;
             margin-bottom: 1rem; resize: vertical; box-sizing: border-box; }
  .pf-area:focus { outline: 2px solid #D4A843; outline-offset: 1px; }
  .pf-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
  .pf-btn { flex: 1 1 auto; background: #D4A843; color: #1a1a1a; border: none; border-radius: 8px;
            padding: .85rem 1.2rem; font-weight: 700; font-size: .95rem; cursor: pointer;
            text-align: center; text-decoration: none; display: inline-block; }
  .pf-btn[disabled] { opacity: .6; cursor: wait; }
  .pf-btn.ghost { background: #ffffff; color: #333333; border: 1px solid rgba(0,0,0,.2); }
  .pf-error { background: #fdecea; border: 1px solid #f5c2bd; color: #b3261e;
              border-radius: 8px; padding: .65rem .8rem; font-size: .85rem; margin-bottom: 1rem; }
  .pf-fine { font-size: .76rem; color: #7a7a7a; margin: 1.1rem 0 0; line-height: 1.5; }
  @media (max-width: 480px) { .pf-card { padding: 1.25rem; } }
`;
