'use client';

/**
 * UNIFIED CHECKOUT - preview / mock.
 *
 * One checkout for everything in the cart: ready-made items and customised items side by
 * side. This is the industry pattern (Vistaprint, Printful, Zazzle, Moo): customisation
 * happens on the product page, and once configured an item is an ordinary cart line that
 * happens to carry its artwork. Nobody splits checkout by product type.
 *
 * What it demonstrates:
 *   - ONE delivery fee for the whole order, not one per customised product
 *   - ONE design fee per artwork, not one per product (the sore point today)
 *   - the payment schedule is READ FROM the cart's contents instead of being a
 *     reason to build a second checkout
 *   - payment methods come from the owner's CMS toggles, so a disabled method is
 *     genuinely unavailable
 *
 * Nothing here replaces the live checkout. Delete this folder to undo.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/context/CartContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const peso = (n) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARD = { background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 };
const LABEL = {
  display: 'block', fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em',
  textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10,
};

const METHODS = [
  { id: 'cod',     label: 'Cash on Delivery', sub: 'Pay when the order arrives.' },
  { id: 'gcash',   label: 'GCash',            sub: 'Redirect to GCash to authorise.' },
  { id: 'paymaya', label: 'Maya',             sub: 'Redirect to Maya to authorise.' },
  { id: 'card',    label: 'Credit / Debit Card', sub: 'Visa or Mastercard.' },
];

export default function UnifiedCheckoutPreview() {
  const { token } = useAuth();
  const { cartItems } = useCart();

  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState('');
  const [payEnabled, setPayEnabled] = useState({});
  const [method, setMethod] = useState('');
  const [schedule, setSchedule] = useState('down');   // 'down' | 'full'
  const [store, setStore] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/addresses`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const list = d?.addresses ?? d?.data ?? [];
        setAddresses(Array.isArray(list) ? list : []);
        const def = list.find(a => a.is_default) ?? list[0];
        if (def) setAddressId(String(def.id ?? def._id ?? ''));
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    fetch(`${API_URL}/api/storefront/content/payment_methods`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.data?.enabled && typeof d.data.enabled === 'object') setPayEnabled(d.data.enabled); })
      .catch(() => {});
    fetch(`${API_URL}/api/public/settings`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setStore(d?.data ?? d ?? null))
      .catch(() => {});
  }, []);

  const items = Array.isArray(cartItems) ? cartItems : [];

  // A line is "made to order" when it has to be produced - a customised item, or a product
  // flagged as made-to-order. That single fact drives the payment schedule below.
  const isMade = (it) => !!(it.isCustom || it.isMadeToOrder || it.designFileUrl || it.designMode);
  const hasMadeToOrder = items.some(isMade);

  // ONE design fee for the whole order, not one per product. The fee pays for the artwork,
  // and one artwork used on a mug and a totebag is still one piece of work - so the highest
  // product fee wins rather than the sum of them.
  const designFee = useMemo(() => {
    const requested = items.filter(it => it.designMode === 'request');
    if (!requested.length) return 0;
    return Math.max(...requested.map(it => Number(it.designFee) || 0));
  }, [items]);

  const subtotal = items.reduce((s, it) => s + (Number(it.lineTotal) || (Number(it.unitPrice) || 0) * (Number(it.qty) || 0)), 0);

  // ONE delivery fee for the order. Courier-booked stores quote it after pinning, so it is
  // shown as pending rather than as zero.
  const courierBooked = !store?.shippingMode || store?.shippingMode === 'courier_booked';
  const shipping = courierBooked ? null : Number(store?.flatShippingFee) || 0;

  const total = subtotal + designFee + (shipping ?? 0);
  const dpPct = Number(store?.downpaymentPercent) || 50;
  const downNow = Math.round(total * (dpPct / 100) * 100) / 100;
  const payNow = hasMadeToOrder && schedule === 'down' ? downNow : total;

  // COD cannot settle a downpayment, so it drops out when the cart has to be produced.
  const available = METHODS.filter(m => {
    if (payEnabled[m.id] === false) return false;
    if (m.id === 'cod') return !hasMadeToOrder;
    return true;
  });

  useEffect(() => {
    if (available.length && !available.some(m => m.id === method)) setMethod(available[0].id);
  }, [available.map(m => m.id).join(','), method]); // eslint-disable-line react-hooks/exhaustive-deps

  const addr = addresses.find(a => String(a.id ?? a._id) === addressId);
  const addrLine = addr
    ? [addr.house_number, addr.street, addr.barangay, addr.city, addr.province, addr.zip].filter(Boolean).join(', ')
    : '';

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 16px 48px' }}>

        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fcd34d', marginBottom: 16 }}>
          <strong style={{ fontSize: '.82rem' }}>Preview only</strong>
          <p style={{ margin: '4px 0 0', fontSize: '.78rem', color: 'var(--gray)', lineHeight: 1.5 }}>
            One checkout for the whole cart - ready-made and customised together, one delivery
            fee, one design fee. The live checkout is untouched.
          </p>
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 4px' }}>Checkout</h1>
        <p style={{ color: 'var(--gray)', fontSize: '.85rem', margin: '0 0 18px' }}>
          {items.length} item{items.length === 1 ? '' : 's'} in this order.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 16, alignItems: 'start' }}>

          {/* LEFT - address, schedule, payment */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <section style={CARD}>
              <span style={LABEL}>Delivery address</span>
              {addresses.length === 0 ? (
                <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--gray)' }}>
                  No saved address yet. <Link href="/shop/profile" style={{ color: '#b8860b', fontWeight: 600 }}>Add one</Link>.
                </p>
              ) : (
                <>
                  <select
                    value={addressId}
                    onChange={e => setAddressId(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--dark)', fontSize: '.85rem', color: 'var(--white)' }}
                  >
                    {addresses.map(a => (
                      <option key={String(a.id ?? a._id)} value={String(a.id ?? a._id)}>
                        {a.label || 'Address'} - {[a.house_number, a.street, a.city].filter(Boolean).join(', ')}
                      </option>
                    ))}
                  </select>
                  {addr && (
                    <p style={{ margin: '8px 0 0', fontSize: '.78rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                      {addrLine}<br />{addr.phone}
                      {addr.delivery_notes && <><br /><span style={{ color: '#b8860b' }}>Note: {addr.delivery_notes}</span></>}
                    </p>
                  )}
                </>
              )}
            </section>

            {/* The schedule is a consequence of what is in the cart - not a separate flow. */}
            {hasMadeToOrder && (
              <section style={CARD}>
                <span style={LABEL}>How much to pay now</span>
                <p style={{ margin: '0 0 10px', fontSize: '.78rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                  This order has made-to-order items, so a downpayment is required before production.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { id: 'down', title: `Downpayment (${dpPct}%)`, amount: downNow, sub: `Balance ${peso(total - downNow)} due before delivery` },
                    { id: 'full', title: 'Pay in full', amount: total, sub: 'Nothing left to pay later' },
                  ].map(opt => (
                    <button key={opt.id} type="button" onClick={() => setSchedule(opt.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                        textAlign: 'left', padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${schedule === opt.id ? 'var(--white)' : 'var(--border)'}`, background: 'var(--dark)' }}>
                      <span>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: '.85rem' }}>{opt.title}</span>
                        <span style={{ fontSize: '.74rem', color: 'var(--gray)' }}>{opt.sub}</span>
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '.9rem', flexShrink: 0 }}>{peso(opt.amount)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section style={CARD}>
              <span style={LABEL}>Payment method</span>
              {available.length === 0 ? (
                <p style={{ margin: 0, fontSize: '.82rem', color: '#dc2626' }}>
                  No payment method is currently available. Please contact the store.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {available.map(m => (
                    <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                        textAlign: 'left', padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${method === m.id ? 'var(--white)' : 'var(--border)'}`, background: 'var(--dark)' }}>
                      <span>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: '.85rem' }}>{m.label}</span>
                        <span style={{ fontSize: '.74rem', color: 'var(--gray)' }}>{m.sub}</span>
                      </span>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${method === m.id ? 'var(--white)' : 'var(--border)'}`,
                        background: method === m.id ? 'var(--white)' : 'transparent' }} />
                    </button>
                  ))}
                </div>
              )}
              {hasMadeToOrder && payEnabled.cod !== false && (
                <p style={{ margin: '10px 0 0', fontSize: '.72rem', color: 'var(--gray)' }}>
                  Cash on delivery is unavailable because this order needs a downpayment before production.
                </p>
              )}
            </section>
          </div>

          {/* RIGHT - the order */}
          <div style={{ ...CARD, position: 'sticky', top: 80 }}>
            <span style={LABEL}>Your order</span>

            {items.length === 0 ? (
              <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--gray)' }}>Your cart is empty.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {items.map((it, i) => (
                  <div key={it.lineId ?? i} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--dark2)', flexShrink: 0, overflow: 'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {it.image && <img src={it.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 700, lineHeight: 1.3 }}>
                        {it.productName}
                        {it.variantName && <span style={{ fontWeight: 500, color: 'var(--gray)' }}> - {it.variantName}</span>}
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--gray)' }}>
                        {it.qty} x {peso(it.unitPrice)}
                      </div>
                      {/* Each customised line carries its own artwork - this is the whole point. */}
                      {isMade(it) && (
                        <div style={{ fontSize: '.7rem', color: '#b8860b', marginTop: 2 }}>
                          {it.designMode === 'request' ? 'Design requested' : it.designFileUrl ? 'Design attached' : 'Made to order'}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '.8rem', fontWeight: 700, flexShrink: 0 }}>
                      {peso(it.lineTotal ?? (it.unitPrice || 0) * (it.qty || 0))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '.82rem' }}>
              <Row label="Subtotal" value={peso(subtotal)} />
              {designFee > 0 && (
                <Row label="Design fee" value={peso(designFee)}
                  hint="One fee for the artwork, however many products it goes on." />
              )}
              <Row label="Delivery" value={shipping == null ? 'Quoted after pinning' : peso(shipping)}
                hint="One delivery fee for the whole order." />
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)',
                paddingTop: 8, marginTop: 2, fontWeight: 800, fontSize: '.95rem' }}>
                <span>Total</span><span>{peso(total)}</span>
              </div>
              {hasMadeToOrder && schedule === 'down' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#b8860b' }}>
                  <span>Pay now</span><span>{peso(payNow)}</span>
                </div>
              )}
            </div>

            <button type="button" disabled
              style={{ width: '100%', marginTop: 14, padding: '12px', borderRadius: 10, border: 'none',
                background: 'var(--white)', color: 'var(--dark)', fontWeight: 800, fontSize: '.9rem', opacity: .55, cursor: 'not-allowed' }}>
              Pay {peso(payNow)}
            </button>
            <p style={{ margin: '8px 0 0', fontSize: '.7rem', color: 'var(--gray)', textAlign: 'center' }}>
              Disabled in preview - no order is placed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--gray)' }}>{label}</span>
        <span>{value}</span>
      </div>
      {hint && <div style={{ fontSize: '.68rem', color: 'var(--gray)', marginTop: 1 }}>{hint}</div>}
    </div>
  );
}
