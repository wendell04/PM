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
    if (decision === 'revision' && !notes.trim()) {
      setError('Tell us what to change, so we do not send the same thing back.');
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
        ? `We have your approval on ${data.orderRef} and production can start. You will hear from us when it is ready.`
        : `We have your notes on ${data.orderRef}. We will make the changes and send you a new proof.`}
    </p>
    <a className="pf-btn ghost" href="/shop/orders-history">See the order</a>
  </>);

  if (data?.answered) return shell(<>
    <h1 className="pf-title">You have already answered this</h1>
    <p className="pf-lede">
      We have your reply on {data.orderRef} - nothing more is needed from you. If you want to
      change something, open the order and message us.
    </p>
    <a className="pf-btn ghost" href="/shop/orders-history">Open the order</a>
  </>);

  return shell(<>
    <div className="pf-ref">Order {data.orderRef}</div>
    <h1 className="pf-title">Does this look right?</h1>
    <p className="pf-lede">
      This is how we will print it. Once you approve, it goes to production as it appears here -
      so please check the spelling, the colours and where everything sits.
    </p>

    <div className="pf-proofs">
      {(data.proofs || []).map((u, i) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img key={i} src={u} alt={`Proof ${i + 1}`} className="pf-img" />
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
          {busy === 'approve' ? 'Approving...' : 'Approve and print it'}
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
  .pf-wrap { min-height: 100vh; background: #0f0f0f; padding: 2.5rem 1rem 4rem;
             display: flex; justify-content: center; }
  .pf-card { width: 100%; max-width: 560px; background: #171717;
             border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 1.75rem; }
  .pf-ref { font-size: .74rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
            color: #D4A843; margin-bottom: .4rem; }
  .pf-title { font-size: 1.45rem; font-weight: 800; color: #f5f5f5; margin: 0 0 .5rem; }
  .pf-lede { font-size: .92rem; line-height: 1.6; color: rgba(245,245,245,.65); margin: 0 0 1.25rem; }
  .pf-proofs { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1.25rem; }
  .pf-img { width: 100%; border-radius: 10px; border: 1px solid rgba(255,255,255,.1); display: block; }
  .pf-items { margin: 0 0 1.25rem; padding-left: 1.1rem; color: rgba(245,245,245,.7); font-size: .88rem; }
  .pf-items li { margin-bottom: .25rem; }
  .pf-label { display: block; font-size: .78rem; font-weight: 700; letter-spacing: .4px;
              text-transform: uppercase; color: rgba(245,245,245,.55); margin-bottom: .35rem; }
  .pf-area { width: 100%; min-height: 110px; background: rgba(255,255,255,.04);
             border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: .7rem .85rem;
             color: #f5f5f5; font-size: .95rem; font-family: inherit; line-height: 1.55;
             margin-bottom: 1rem; resize: vertical; }
  .pf-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
  .pf-btn { flex: 1 1 auto; background: #D4A843; color: #1a1a1a; border: none; border-radius: 8px;
            padding: .85rem 1.2rem; font-weight: 700; font-size: .95rem; cursor: pointer;
            text-align: center; text-decoration: none; display: inline-block; }
  .pf-btn[disabled] { opacity: .6; cursor: wait; }
  .pf-btn.ghost { background: transparent; color: rgba(245,245,245,.78);
                  border: 1px solid rgba(255,255,255,.2); }
  .pf-error { background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35); color: #fca5a5;
              border-radius: 8px; padding: .65rem .8rem; font-size: .85rem; margin-bottom: 1rem; }
  .pf-fine { font-size: .76rem; color: rgba(245,245,245,.42); margin: 1.1rem 0 0; line-height: 1.5; }
  @media (max-width: 480px) { .pf-card { padding: 1.25rem; } }
`;
