'use client';

import { useState } from 'react';
import { S, Modal } from '@/app/dashboard/business/inventory-v2/shared';
import OrderFormSnapshot from '@/components/orders/OrderFormSnapshot';

/**
 * One quotation, as the customer was sent it.
 *
 * The screen this replaces was written for the first version of quotations - one product, one
 * price - and kept its fields after quotations grew lines: it showed "Selected Variants: None",
 * "Suggested Price" and "Est. Completion", and none of what is actually on a quotation now (the
 * lines, the design and delivery fees, the address the delivery was priced for, the files, the
 * order form). Its edit box changed the TOTAL only, which silently stopped matching the lines.
 *
 * So this reads like the quotation, in the same frame as Create Quotation, and the only changes it
 * offers are the ones that keep the lines true: give it more days, cancel it, or send a new one.
 */

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

const STAGE_CHIP = {
  ask:       { label: 'Waiting for a price', tone: 'amber' },
  quoted:    { label: 'Quoted',              tone: 'blue' },
  accepted:  { label: 'Paid - now an order', tone: 'green' },
  expired:   { label: 'Expired',             tone: 'gray' },
  cancelled: { label: 'Cancelled',           tone: 'red' },
  answered:  { label: 'Answered',            tone: 'gray' },
};

const HISTORY_WORDS = {
  pending_review: 'Asked for a price',
  confirmed:      'Quoted',
  cancelled:      'Closed',
  answered:       'Answered with a quotation',
  processing:     'In progress',
  ready:          'Ready',
  delivered:      'Delivered',
};

function Chip({ tone, children }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
      background: `var(--st-${tone}-bg)`, color: `var(--st-${tone}-fg)`,
      border: `1px solid color-mix(in srgb, var(--st-${tone}-fg) 35%, transparent)` }}>{children}</span>
  );
}

const label = { fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 };
const row = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '3px 0' };

export default function QuotationView({
  req, stage, left, onClose,
  mayQuote, mayClose, canOrders,
  busy, error, success,
  onExtend, onNewQuote, onDecline,
}) {
  const [days, setDays] = useState('7');
  // An ask has no price yet; the server still mirrors it into a priced-looking line at P0.00, which
  // read as a quotation for nothing.
  const lines = stage === 'ask' ? []
    : Array.isArray(req.lineItems) && req.lineItems.length ? req.lineItems
    : Array.isArray(req.items) && req.items.length ? req.items : [];
  const goods = lines.reduce((a, l) => a + Number(l.lineTotal ?? (Number(l.unitPrice ?? 0) * Number(l.qty ?? 0))), 0);
  const designFee = Number(req.designFee ?? 0);
  const delivery = Number(req.shippingFee ?? 0);
  const total = req.finalPrice != null ? Number(req.finalPrice) : goods + designFee + delivery;
  const setDown = req.downPayment != null && Number(req.downPayment) > 0;
  const down = setDown ? Number(req.downPayment) : Math.round(total * 50) / 100;
  const files = Array.isArray(req.designUrls) && req.designUrls.length ? req.designUrls
    : req.designUrl ? [{ url: req.designUrl, name: '' }] : [];
  const isImage = (u) => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(String(u || ''));
  const chip = STAGE_CHIP[stage] ?? STAGE_CHIP.quoted;
  const ref = `QT-${String(req.id ?? req._id ?? '').slice(-8).toUpperCase()}`;

  const when = stage === 'quoted' && left != null
    ? (left <= 0 ? 'Runs out today' : `${left} day${left === 1 ? '' : 's'} left to pay - until ${date(req.expiresAt)}`)
    : stage === 'expired' ? `Ran out on ${date(req.expiresAt)} unpaid`
    : stage === 'ask' ? `Asked ${date(req.createdAt)}`
    : stage === 'accepted' ? 'The customer paid it'
    : '';

  const footer = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
      {stage === 'quoted' && mayQuote && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
          <span style={{ fontSize: 12.5, color: 'var(--gray)' }}>Payable for</span>
          <input value={days} inputMode="numeric" maxLength={2} aria-label="Days to add"
            onChange={e => setDays(e.target.value.replace(/[^0-9]/g, ''))}
            style={{ ...S.input, width: 54, textAlign: 'center', padding: '7px 6px' }} />
          <span style={{ fontSize: 12.5, color: 'var(--gray)' }}>days from today</span>
          <button type="button" disabled={busy || !(Number(days) >= 1 && Number(days) <= 60)}
            onClick={() => onExtend(Math.min(60, Math.max(1, Number(days) || 7)))} style={S.btnGhost}>
            {busy ? 'Saving...' : 'Extend'}
          </button>
        </div>
      )}
      {(stage === 'ask' || stage === 'expired' || stage === 'quoted') && mayQuote && (
        <button type="button" onClick={onNewQuote} disabled={busy}
          style={stage === 'quoted' ? S.btnGhost : { ...S.btnPrimary, marginLeft: stage === 'quoted' ? 0 : 'auto' }}>
          {stage === 'ask' ? 'Send a quotation' : 'Send a new quotation'}
        </button>
      )}
      {stage === 'ask' && (
        <a href="/dashboard/business/chat" style={{ ...S.btnGhost, textDecoration: 'none' }}>Open Messages</a>
      )}
      {(stage === 'ask' || stage === 'quoted') && mayClose && (
        <button type="button" onClick={onDecline} disabled={busy}
          style={{ ...S.btnGhost, color: 'var(--st-red-fg)', borderColor: 'color-mix(in srgb, var(--st-red-fg) 40%, transparent)' }}>
          {stage === 'ask' ? 'Decline' : 'Cancel quotation'}
        </button>
      )}
      {stage === 'accepted' && req.convertedOrderId && canOrders && (
        <a href={`/dashboard/business/orders?order=${req.convertedOrderId}`} style={{ ...S.btnPrimary, textDecoration: 'none', marginLeft: 'auto' }}>
          Open the order
        </a>
      )}
      {/* The x closes it too; a Close button only where there is nothing else to press. */}
      {!['ask', 'quoted', 'expired'].includes(stage) && (
        <button type="button" onClick={onClose} disabled={busy} style={{ ...S.btnGhost, marginLeft: stage === 'accepted' ? 0 : 'auto' }}>Close</button>
      )}
    </div>
  );

  return (
    <Modal open onClose={onClose} title={`Quotation ${ref}`} width={720} footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{req.customerName || 'Customer'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray)' }}>{req.customerEmail || ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Chip tone={chip.tone}>{chip.label}</Chip>
            {when && <div style={{ fontSize: 12, color: stage === 'quoted' && left != null && left <= 2 ? 'var(--st-red-fg)' : 'var(--gray)', marginTop: 4 }}>{when}</div>}
          </div>
        </div>

        {/* The lines, exactly as quoted. */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {lines.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{req.productName || 'Request'}{req.quantity ? ` x ${req.quantity}` : ''}</span>
              <span style={{ color: 'var(--gray)' }}>No price yet</span>
            </div>
          ) : lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              {l.thumbnail ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={l.thumbnail} alt="" style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              ) : <div style={{ width: 38, height: 38, borderRadius: 6, background: 'var(--dark2)', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {l.productName || 'Item'}{l.variantName ? <span style={{ color: 'var(--gray)', fontWeight: 400 }}> - {l.variantName}</span> : null}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>{l.qty} pcs x {peso(l.unitPrice)}</div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{peso(l.lineTotal ?? Number(l.unitPrice ?? 0) * Number(l.qty ?? 0))}</div>
            </div>
          ))}
        </div>

        {lines.length > 0 && (
          <div style={{ background: 'var(--dark2)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={row}><span style={{ color: 'var(--gray)' }}>Goods</span><span>{peso(goods)}</span></div>
            {designFee > 0 && <div style={row}><span style={{ color: 'var(--gray)' }}>Design fee</span><span>{peso(designFee)}</span></div>}
            {delivery > 0 && (
              <div style={row}>
                <span style={{ color: 'var(--gray)', minWidth: 0 }}>
                  Delivery fee
                  {req.deliverTo?.text && <span style={{ display: 'block', fontSize: 11.5 }}>Priced for {req.deliverTo.text}</span>}
                </span>
                <span>{peso(delivery)}</span>
              </div>
            )}
            <div style={{ ...row, borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 8, fontWeight: 800 }}>
              <span>Total</span><span style={{ color: 'var(--gold)', fontSize: 15 }}>{peso(total)}</span>
            </div>
            <div style={row}>
              <span style={{ color: 'var(--gray)' }}>Downpayment{setDown ? '' : ' (50%, the default)'}</span>
              <span>{peso(down)}</span>
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div>
            <div style={label}>Design files</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {files.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, paddingRight: 10, borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--white)', fontSize: 12.5, maxWidth: 240 }}>
                  {isImage(f.url)
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={f.url} alt="" style={{ width: 34, height: 34, borderRadius: 5, objectFit: 'cover' }} />
                    : <span style={{ width: 34, height: 34, borderRadius: 5, background: 'var(--dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--gray)' }}>
                        {(String(f.url).split('?')[0].split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}
                      </span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || `File ${i + 1}`}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <OrderFormSnapshot forms={req.orderForms} title="Their order form" />

        {req.adminComment && (
          <div>
            <div style={label}>Your note to the customer</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, padding: '9px 12px', borderRadius: 8, background: 'var(--gold-subtle)', border: '1px solid color-mix(in srgb, var(--gold) 35%, transparent)' }}>
              {req.adminComment}
            </div>
          </div>
        )}

        {Array.isArray(req.statusHistory) && req.statusHistory.length > 0 && (
          <div>
            <div style={label}>History</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...req.statusHistory].reverse().map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: i === 0 ? 'var(--gold)' : 'var(--border)', marginTop: 6, flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <b>{HISTORY_WORDS[h.status] ?? h.status}</b>
                    <span style={{ color: 'var(--gray)' }}> - {date(h.timestamp ?? h.at)}</span>
                    {h.note && <span style={{ display: 'block', color: 'var(--gray)' }}>{h.note}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', borderColor: 'transparent' }}>{error}</div>}
        {success && <div style={{ ...S.note, background: 'var(--st-green-bg)', color: 'var(--st-green-fg)', borderColor: 'transparent' }}>{success}</div>}
      </div>
    </Modal>
  );
}
