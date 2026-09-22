'use client';
/**
 * Ask for a price on something the shop does not list.
 *
 * Every other way into a quotation starts from a product page, so a customer wanting a run of
 * shirts they are supplying, an event giveaway, or a service had nowhere to ask but the chat box -
 * and a conversation is not a queue. This lands in the same Quotations list as everything else.
 *
 * Deliberately short. A long form on a page that exists because someone could not find what they
 * wanted is a second way to lose them; five fields is enough to price most jobs, and the rest is
 * a conversation.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import '../shop.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function RequestAQuotePage() {
  const { currentUser: user, token } = useAuth();
  const router = useRouter();

  const [summary,  setSummary]  = useState('');
  const [details,  setDetails]  = useState('');
  const [quantity, setQuantity] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [budget,   setBudget]   = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!summary.trim() || !details.trim()) {
      setError('Tell us what you need and a little about it - those two are enough to start.');
      return;
    }
    setSending(true); setError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/order-requests/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          summary: summary.trim(),
          details: details.trim(),
          ...(quantity ? { quantity: Number(quantity) } : {}),
          ...(neededBy ? { neededBy } : {}),
          ...(budget   ? { budget: Number(budget) } : {}),
        }),
      }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'We could not send that. Please try again.');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <div className="rq-wrap">
        <div className="rq-card">
          <h1 className="rq-title">Ask for a price</h1>
          <p className="rq-lede">Sign in first so we can send the quotation back to you.</p>
          {/* The message said "sign in" and the only button went to the shop. Signing in here brings
              them straight back to this form. */}
          <div className="rq-actions">
            <button className="rq-btn" onClick={() => window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'login' } }))}>Sign in</button>
            <button className="rq-btn ghost" onClick={() => window.dispatchEvent(new CustomEvent('pmp_open_auth', { detail: { type: 'register' } }))}>Create an account</button>
          </div>
        </div>
        <style jsx>{css}</style>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rq-wrap">
        <div className="rq-card">
          <h1 className="rq-title">We have your request</h1>
          <p className="rq-lede">
            We will come back to you with a price. It arrives in your chat with us, and you can pay
            it from there - nothing is charged until you do.
          </p>
          <div className="rq-actions">
            <button className="rq-btn" onClick={() => router.push('/shop/orders-history')}>My orders</button>
            <button className="rq-btn ghost" onClick={() => router.push('/shop')}>Keep browsing</button>
          </div>
        </div>
        <style jsx>{css}</style>
      </div>
    );
  }

  return (
    <div className="rq-wrap">
      <form className="rq-card" onSubmit={submit}>
        <h1 className="rq-title">Ask for a price</h1>
        <p className="rq-lede">
          For anything you do not see in the shop - printing on shirts you supply, a bulk order, an
          event giveaway. Tell us what you need and we will send you a price.
        </p>

        <label className="rq-label" htmlFor="rq-summary">What do you need?</label>
        <input id="rq-summary" className="rq-input" value={summary} maxLength={120}
          onChange={e => setSummary(e.target.value)}
          placeholder="e.g. Silkscreen printing on 50 shirts I will provide" />

        <label className="rq-label" htmlFor="rq-details">Tell us a bit more</label>
        <textarea id="rq-details" className="rq-input rq-area" value={details} maxLength={2000}
          onChange={e => setDetails(e.target.value)}
          placeholder="Sizes, colours, where the print goes, anything you have already decided. If you have a design, mention it and we will ask for the file in chat." />

        <div className="rq-row">
          <div>
            <label className="rq-label" htmlFor="rq-qty">How many?</label>
            <input id="rq-qty" className="rq-input" type="number" min="1" value={quantity}
              onChange={e => setQuantity(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="rq-label" htmlFor="rq-when">Needed by</label>
            <input id="rq-when" className="rq-input" type="date" value={neededBy}
              onChange={e => setNeededBy(e.target.value)} />
          </div>
        </div>

        <label className="rq-label" htmlFor="rq-budget">Budget, if you have one</label>
        <input id="rq-budget" className="rq-input" type="number" min="0" value={budget}
          onChange={e => setBudget(e.target.value)} placeholder="Optional - it helps us suggest the right option" />

        {error && <div className="rq-error">{error}</div>}

        <button className="rq-btn" type="submit" disabled={sending}>
          {sending ? 'Sending...' : 'Send my request'}
        </button>
        <p className="rq-fine">
          This is not an order and nothing is charged. We reply with a price you can accept or ignore.
        </p>
      </form>
      <style jsx>{css}</style>
    </div>
  );
}

const css = `
  .rq-wrap { max-width: 640px; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
  .rq-card { background: var(--dark, #151515); border: 1px solid var(--border, rgba(255,255,255,0.08));
             border-radius: 14px; padding: 1.75rem; display: flex; flex-direction: column; }
  .rq-title { font-size: 1.5rem; font-weight: 800; margin: 0 0 .5rem; color: var(--white, #f5f5f5); }
  .rq-lede { font-size: .92rem; line-height: 1.6; color: var(--gray-light, #aaa); margin: 0 0 1.5rem; }
  .rq-label { font-size: .78rem; font-weight: 700; letter-spacing: .4px; text-transform: uppercase;
              color: var(--gray, #888); margin-bottom: .35rem; }
  .rq-input { width: 100%; background: var(--dark2, #222); border: 1px solid var(--border, rgba(255,255,255,.12));
              border-radius: 8px; padding: .7rem .85rem; color: var(--white, #f5f5f5);
              font-size: .95rem; margin-bottom: 1.1rem; font-family: inherit; }
  .rq-input:focus { outline: 2px solid var(--gold, #D4A843); outline-offset: 1px; }
  .rq-area { min-height: 120px; resize: vertical; line-height: 1.55; }
  .rq-row { display: grid; grid-template-columns: 1fr 1fr; gap: .9rem; }
  .rq-btn { background: var(--gold, #D4A843); color: #1a1a1a; border: none; border-radius: 8px;
            padding: .8rem 1.2rem; font-weight: 700; font-size: .95rem; cursor: pointer; }
  .rq-btn[disabled] { opacity: .6; cursor: wait; }
  .rq-btn.ghost { background: transparent; color: var(--gray-light, #aaa);
                  border: 1px solid var(--border, rgba(255,255,255,.18)); }
  .rq-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
  .rq-error { background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35);
              color: var(--st-red-fg, #f87171); border-radius: 8px; padding: .65rem .8rem; font-size: .85rem;
              margin-bottom: 1rem; }
  .rq-fine { font-size: .78rem; color: var(--gray, #888); margin: .9rem 0 0; line-height: 1.5; }
  @media (max-width: 480px) { .rq-row { grid-template-columns: minmax(0, 1fr); } .rq-row > * { min-width: 0; } .rq-card { padding: 1.25rem; } }
`;
