'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import useLockBodyScroll from '@/lib/useLockBodyScroll';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * The shop's policies, read in a modal rather than on a page of their own.
 *
 * Each document lives in site content under its own key, so the shop can rewrite any of them
 * without a deploy. Until one is written, the draft below is what a customer sees - a policy that
 * says nothing is worse than a plain one, and an empty page worse still. The drafts describe what
 * this shop ACTUALLY does (deposits, proof approval, made-to-order returns); they are a starting
 * point for the owner to check, not legal advice.
 */
const DRAFTS = {
  policy_privacy: {
    title: 'Privacy Policy',
    sections: [
      { title: 'What we collect', body: 'Your name, email address, mobile number and delivery address, the artwork and instructions you send with an order, and the record of your orders and messages with us. Card details are never collected or stored by us - card payments are handled on PayMongo’s systems.' },
      { title: 'Why we collect it', body: 'To produce and deliver your order, to send you updates about it, to answer your messages, and to keep our own records of sales as the law requires.' },
      { title: 'Who else sees it', body: 'Our couriers receive the delivery details needed to bring your order to you. Our payment provider receives what a payment needs. Nobody else receives your information, and we never sell it.' },
      { title: 'Your artwork', body: 'Files you upload are used to produce your order. We may show finished work as samples, but never a file that carries your name, photo or private details unless you tell us we may.' },
      { title: 'How long we keep it', body: 'Order records are kept for as long as our accounting obligations require. You may ask us to delete your account at any time; order records that the law requires us to keep will remain.' },
      { title: 'Contact', body: 'Questions about your information: personalizemeprints.admin@gmail.com.' },
    ],
  },
  policy_terms: {
    title: 'Terms and Conditions',
    sections: [
      { title: 'Ordering', body: 'Placing an order means you accept these terms. Prices shown are in Philippine peso. We may change prices, but never on an order already confirmed.' },
      { title: 'Payment', body: 'Custom orders require a deposit before production begins; the rest is due before your order is released for delivery. Ready-made items are paid in full at checkout. A design fee, where one applies, is charged before the designer starts and is not refundable once the work has begun.' },
      { title: 'Proof and approval', body: 'For custom work we send a proof and wait for your approval before printing. What you approve is what we print, so please check spelling, sizes and colours carefully.' },
      { title: 'Colour and material', body: 'Screens and printed ink differ. Slight variation in colour, and small differences between production batches of blanks, are normal and are not defects.' },
      { title: 'Delivery', body: 'The courier’s fee is separate from your order total and is shown separately. Where the rider collects it, have the amount ready in cash on arrival. Delivery dates are estimates; we tell you as soon as anything changes.' },
      { title: 'Your artwork', body: 'You confirm that you own the rights to whatever you send us, or have permission to use it. We decline work that infringes someone else’s rights.' },
      { title: 'Cancelling', body: 'You may cancel before production starts. Once your design is approved and production has begun, a custom order cannot be cancelled, because personalised goods cannot be resold.' },
      { title: 'Returns and refunds - what we replace', body: 'If an item arrives damaged, or differs from the proof you approved, tell us within 3 days of delivery with photos. We remake it, or refund it, whichever you prefer.' },
      { title: 'Returns and refunds - what we cannot take back', body: 'Personalised items that came out as approved cannot be returned: a name, a date or a photo on a mug makes it unsellable to anyone else. This is why we send a proof first. Unused ready-made stock may be returned within 7 days in its original condition; return postage is yours unless the item was faulty.' },
      { title: 'Returns and refunds - how a refund is paid', body: 'Refunds go back the way you paid. Online payments return through PayMongo, which can take a few banking days; cash payments are refunded by GCash or Maya to the number you give us. A delivery fee already paid to the courier is not ours to return, except where we cancelled the order before it was booked.' },
    ],
  },
};

export default function PolicyModal({ docKey, onClose }) {
  const [doc, setDoc] = useState(null);
  const [mounted, setMounted] = useState(false);
  useLockBodyScroll(!!docKey);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!docKey) return;
    const fallback = DRAFTS[docKey];
    setDoc(fallback);
    // A shop-written version replaces the draft; a failed fetch quietly leaves the draft, because
    // a customer asking to read a policy should never be met with an error.
    fetch(`${API_URL}/api/storefront/content/${docKey}`)
      .then(r => r.json())
      .then(d => {
        const data = d?.data;
        if (data && Array.isArray(data.sections) && data.sections.length) {
          setDoc({ title: data.title || fallback?.title || 'Policy', sections: data.sections });
        }
      })
      .catch(() => {});
  }, [docKey]);

  if (!docKey || !mounted || !doc) return null;

  return createPortal(
    <div
      className="policy-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
    >
      {/* Styles travel with the component: it is opened from the landing page and from the shop,
          which load different stylesheets. */}
      <style>{`
        .policy-overlay {
          position: fixed; inset: 0; z-index: 4000;
          background: rgba(0,0,0,0.72);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .policy-panel {
          background: #ffffff; color: #1a1a1a;
          width: 100%; max-width: 720px; max-height: 86vh;
          border-radius: 16px; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 70px rgba(0,0,0,0.4);
          font-family: Arial, Arimo, Helvetica, sans-serif;
        }
        .policy-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 16px 20px; border-bottom: 1px solid #ececec;
        }
        .policy-head h2 { margin: 0; font-size: 1.15rem; font-weight: 800; }
        .policy-head button {
          background: none; border: none; cursor: pointer; color: #6b6b6b;
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
        }
        .policy-head button:hover { background: #f2f2f2; color: #111; }
        .policy-body {
          padding: 18px 20px; overflow-y: auto; -webkit-overflow-scrolling: touch;
          font-size: 0.9rem; line-height: 1.7; color: #333;
        }
        .policy-body h3 {
          margin: 18px 0 6px; font-size: 0.95rem; font-weight: 800; color: #111;
        }
        .policy-body section:first-child h3 { margin-top: 0; }
        .policy-body p { margin: 0; }
        .policy-updated { margin-top: 22px !important; font-size: 0.78rem; color: #777; }
        .policy-foot {
          padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
          border-top: 1px solid #ececec; display: flex; justify-content: flex-end;
        }
        .policy-foot button {
          background: #d4a843; color: #111; border: none;
          border-radius: 10px; padding: 10px 22px;
          font-size: 0.88rem; font-weight: 800; cursor: pointer;
        }
        @media (max-width: 640px) {
          .policy-overlay { padding: 0; align-items: stretch; }
          .policy-panel { max-width: 100%; max-height: 100%; height: 100%; border-radius: 0; }
        }
      `}</style>

      <div className="policy-panel" onClick={e => e.stopPropagation()}>
        <div className="policy-head">
          <h2>{doc.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="policy-body">
          {doc.sections.map((s, i) => (
            <section key={i}>
              {s.title && <h3>{s.title}</h3>}
              <p>{s.body}</p>
            </section>
          ))}
          <p className="policy-updated">Last reviewed {new Date().getFullYear()}. Message us if anything here is unclear.</p>
        </div>

        <div className="policy-foot">
          <button type="button" onClick={onClose}>I understand</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
