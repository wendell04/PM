'use client';
import NoImage from '@/components/NoImage';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyOrderRequest, createOrderRequestPaymentLink } from '@/lib/orderRequestApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { formatPeso } from '@/lib/shopUtils';
import OrderFormSnapshot from '@/components/orders/OrderFormSnapshot';
import { DEFAULT_CUSTOM_ORDER_TERMS, renderTermsBody, clauseApplies } from '@/lib/customOrderTerms';
import '@/app/shop/shop.css';

import AddressPicker from '@/components/shop/AddressPicker';
import PhotoLightbox from '@/components/chat/PhotoLightbox';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import PaymentMethods, { ONLINE_METHODS, tokenizeCard } from '@/components/shop/PaymentMethods';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';


/**
 * Checkout for a single quote.
 *
 * Deliberately NOT folded into /shop/checkout: that page prices every line from the catalog
 * via /api/payment/initiate, while a quote's price is admin-set and can't be re-derived. This
 * page hands the quote id to /api/payment/order-request-link, which prices server-side from
 * the stored quote and converts it into an Order on the payment webhook.
 */
export default function QuoteCheckoutPage() {
  const { id } = useParams();
  const router = useRouter();
  const { token, currentUser: user } = useAuth();

  const [quote, setQuote] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  // The method is chosen here now, not on PayMongo's page. COD is not offered: a quote is a priced
  // offer the shop has already scheduled work against, with nothing to collect at a door.
  const [payEnabled,   setPayEnabled]   = useState({});
  const [payMethod,    setPayMethod]    = useState('gcash');
  const [eWalletPhone, setEWalletPhone] = useState('');
  const [card,         setCard]         = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  // A quotation is an offer; paying it is the acceptance. This page collected money and recorded no
  // agreement to anything but the amount - the one route into the shop with no terms on it, and the
  // one carrying the largest orders.
  const [settings, setSettings]     = useState(null);
  const [agreed, setAgreed]         = useState(false);
  const [showTerms, setShowTerms]   = useState(false);
  // Agreeing to something nobody opened is not agreement. The tick lives INSIDE the terms now,
  // at the end of them, so the only way to reach it is to have scrolled past what it covers.
  const [termsSeen, setTermsSeen]   = useState(false);
  // Rush is the one thing about a quote the customer still chooses: the goods were priced by
  // hand, the speed was not.
  const [rush, setRush]             = useState(false);
  const [lightbox, setLightbox]     = useState(null);
  const [payType, setPayType] = useState('downpayment');
  const [paying, setPaying] = useState(false);
  useLockBodyScroll(showTerms);

  const fetchAddresses = useCallback(async (keepSelection = false) => {
    if (!token) return;
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 30000);
      const data = await res.json();
      const list = data.addresses || [];
      setAddresses(list);
      if (!keepSelection) {
        const def = list.find(a => a.isDefault || a.is_default);
        setSelectedAddressId(def?.id ?? list[0]?.id ?? '');
      }
    } catch {
      setError('Failed to load your addresses.');
    }
  }, [token]);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    setLoading(true);
    // The shop's own clauses, when it has saved any. Falls back to the built-in defaults, so the
    // terms are never simply absent.
    fetchWithTimeout(`${API_URL}/api/public/settings`, {}, 10000)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setSettings(d.data ?? d); })
      .catch(() => {});

    Promise.all([fetchMyOrderRequest(token, id), fetchAddresses()])
      .then(([q]) => {
        if (cancelled) return;
        setQuote(q);
      })
      .catch((e) => { if (!cancelled) setLoadError(e.message || 'This quote could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, id, fetchAddresses]);

  const selectedAddress = addresses.find(a => a.id === selectedAddressId) ?? null;

  useEffect(() => {
    fetch(`${API_URL}/api/storefront/content/payment_methods`)
      .then(r => r.json())
      .then(d => { if (d?.data?.enabled && typeof d.data.enabled === 'object') setPayEnabled(d.data.enabled); })
      .catch(() => {});
  }, []);

  // If the owner switches off whatever was selected, fall to the first one still offered rather
  // than leaving a dead choice on screen.
  const offered = ONLINE_METHODS.filter(m => payEnabled[m.id] !== false).map(m => m.id);
  useEffect(() => {
    if (offered.length && !offered.includes(payMethod)) setPayMethod(offered[0]);
  }, [offered.join(','), payMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving mid-page. The customer came from a chat card or from My Orders, and the browser
  // keeps the scroll position of the page they left - so checkout opened somewhere in the middle
  // of the payment methods, below the breakdown they are here to read.
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const quotedPrice = Number(quote?.finalPrice) || 0;
  const isExpired = quote?.expiresAt ? new Date(quote.expiresAt).getTime() < Date.now() : false;
  const daysLeft = quote?.expiresAt ? Math.ceil((new Date(quote.expiresAt).getTime() - Date.now()) / 86400000) : null;
  const alreadyPaid = quote ? (quote.paymentStatus && quote.paymentStatus !== 'unpaid') || !!quote.convertedOrderId : false;
  // ── Delivery speed ────────────────────────────────────────────────────────
  // Rush buys priority in the production queue, so it is charged on TOP of the quoted price
  // rather than folded into it. Same arithmetic as the server's createOrderRequestLink; the two
  // disagreeing would be a balance nobody could settle.
  const rushEnabled  = !!(settings?.rushEnabled ?? false);
  const rushFeeAmt   = Number(settings?.rushFee ?? 0);
  const prodLead     = Number(settings?.productionLeadDays ?? 3);
  const rushLead     = Number(settings?.rushLeadDays ?? 1);
  const shipMin      = Number(settings?.shippingDaysMin ?? 1);
  const shipMax      = Number(settings?.shippingDaysMax ?? 2);
  const rushOffered  = rushEnabled && rushFeeAmt > 0;
  const rushCharge   = rush && rushOffered ? rushFeeAmt : 0;
  // Working days, counted from payment: a quote has no proof step, so the clock starts the moment
  // the money lands rather than at an approval that never happens.
  const daysText = (lead) => {
    const a = lead + shipMin;
    const b = lead + shipMax;
    return a === b ? `${a} working day${a === 1 ? '' : 's'}` : `${a}-${b} working days`;
  };

  const finalPrice = Math.round((quotedPrice + rushCharge) * 100) / 100;
  // The deposit the shop set covers the goods; the rush fee is work that starts at once, so it
  // rides on the first payment in full instead of being split across a deposit and a balance.
  const down = quote && quote.downPayment != null && Number(quote.downPayment) > 0
    ? Math.round((Number(quote.downPayment) + rushCharge) * 100) / 100
    : Math.round((quotedPrice * 0.5 + rushCharge) * 100) / 100;
  const dpPct = finalPrice > 0 ? Math.round((down / finalPrice) * 100) : 50;
  const lines = quote?.lineItems ?? [];
  const designFee = Number(quote?.designFee) || 0;
  const deliveryFee = Number(quote?.shippingFee) || 0;
  const amountDue = payType === 'full' ? finalPrice : down;

  // ── What is actually being sold ───────────────────────────────────────────
  // A quotation for goods off a shelf is a purchase, not a commission: there is no artwork, no
  // proof, no revisions and no design fee, so asking the customer to accept the custom order
  // terms before paying is asking them to agree to a contract about none of their order.
  const isBespoke = lines.some(l => l.isCustom || l.isMadeToOrder)
    || designFee > 0
    || !!quote?.designUrl;

  // Every file the shop attached, whatever kind it is. A single url rendered as an <img> showed a
  // PDF or an AI file as a broken picture, and a job with a front and a back could only show one.
  const designFiles = (() => {
    const list = Array.isArray(quote?.designUrls) ? quote.designUrls : [];
    const out = list.map(f => ({ url: f?.url || '', name: f?.name || '' })).filter(f => f.url);
    if (!out.length && quote?.designUrl) out.push({ url: quote.designUrl, name: '' });
    return out;
  })();
  const isImage = (u) => /\.(png|jpe?g|webp|gif|bmp|avif)(\?|$)/i.test(String(u || ''));
  const fileLabel = (f) => f.name || (String(f.url).split('/').pop() || 'attachment').split('?')[0];

  const payable = quote
    && ['confirmed', 'processing', 'ready'].includes(quote.status)
    && finalPrice > 0
    && quote.paymentStatus === 'unpaid'
    && !quote.convertedOrderId;

  function buildAddressPayload(a) {
    return {
      label: a.label, house_number: a.house_number, street: a.street,
      subdivision: a.subdivision, region: a.region ?? null, barangay: a.barangay,
      city: a.city, province: a.province, zip: a.zip, phone: a.phone,
      delivery_notes: a.delivery_notes ?? null,
      lat: a.lat ?? null, lng: a.lng ?? null,
    };
  }

  // 'both' plus the quotation-only clauses. A quote needs everything a custom order needs, and
  // three things a listed product never does: how long the price holds, exactly what it covers, and
  // that a per-piece service is billed on what is actually produced.
  const rawTerms = (() => {
    const saved = settings?.customOrderTerms?.length ? settings.customOrderTerms : null;
    const base = saved
      ? [...saved, ...DEFAULT_CUSTOM_ORDER_TERMS.filter(d =>
          !saved.some(t => (t.title || '').trim().toLowerCase() === d.title.trim().toLowerCase()))]
      : DEFAULT_CUSTOM_ORDER_TERMS;
    return base.map(c => ({ ...c, body: renderTermsBody(c.body, settings) }));
  })();
  // Only what a quotation is actually governed by. 'both' means the two CUSTOM flows - a warning
  // about the resolution of a file you never sent, or a design fee you were never charged, was
  // being shown to somebody paying a price the shop worked out by hand.
  const activeClauses = rawTerms.filter(t => clauseApplies(t, 'quote'));
  const termsSnapshot = activeClauses.map(t => ({ title: t.title, body: t.body, mode: t.mode || 'both' }));
  const termsVersion  = settings?.termsVersion ?? 1;

  async function handlePay() {
    setError(null);
    if (isBespoke && !agreed) {
      setShowTerms(true);
      setError('Please read the Custom Order Terms and tick the box at the end before paying.');
      return;
    }
    if (!selectedAddress) { setError('Please select a delivery address first.'); return; }
    if (!selectedAddress.lat || !selectedAddress.lng) {
      // The picker shows "No map pin yet - pin it" on the address itself, which opens the form
      // in place; this only has to say why the payment stopped.
      setError('Please pin your delivery location so the seller can book your courier accurately - use "pin it" on the address above.');
      return;
    }
    if (!selectedAddress.phone?.trim()) {
      setError('Your delivery address is missing a contact number. Please update it first.');
      return;
    }
    const missing = ['street', 'barangay', 'city', 'province'].find(f => !selectedAddress[f]?.trim?.());
    if (missing) { setError('Your delivery address is incomplete. Please update it first.'); return; }

    setPaying(true);
    try {
      const payment = { paymentType: payMethod };
      if (payMethod === 'card') {
        payment.paymentMethodId = await tokenizeCard(card, user);
      } else if (eWalletPhone.trim()) {
        payment.eWalletPhone = `+63${eWalletPhone.trim()}`;
      }

      // A ready-made quote records no agreement, because it was shown none. Writing
      // agreedToTerms: true there would put a signature on a contract nobody read.
      const res = await createOrderRequestPaymentLink(token, id, payType, buildAddressPayload(selectedAddress), isBespoke ? {
        agreedToTerms: true,
        termsVersion,
        termsAgreedAt: new Date().toISOString(),
        termsSnapshot,
      } : {}, payment, { isRush: rush && rushOffered });

      // An intent that needs authorising hands back a redirect; one that cleared outright (a saved
      // card, no 3DS) is already done. checkoutUrl is the hosted-page fallback.
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else if (res.status === 'succeeded') {
        window.location.href = `/shop/payment-success?id=${id}&type=order_request`;
      } else if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setError('Could not start the payment. Please try again.');
        setPaying(false);
      }
    } catch (e) {
      setError(e.message || 'Could not start the payment.');
      setPaying(false);
    }
  }

  if (loading) {
    return <div className="shop-container" style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem' }}>
      <p style={{ color: 'var(--gray)' }}>Loading your quote&hellip;</p>
    </div>;
  }

  if (loadError || !quote) {
    return <div className="shop-container" style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>Quote unavailable</p>
      <p style={{ color: 'var(--gray)', fontSize: '.88rem', marginBottom: 16 }}>{loadError || 'This quote could not be found.'}</p>
      <Link href="/shop/orders-history" style={{ color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }}>Back to My Orders</Link>
    </div>;
  }

  if (quote.convertedOrderId) {
    return <div className="shop-container" style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>This quote is already an order</p>
      <p style={{ color: 'var(--gray)', fontSize: '.88rem', marginBottom: 16 }}>You&apos;ve paid for this quote - track it in your orders.</p>
      <Link href="/shop/orders-history" style={{ color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }}>Go to My Orders &rarr;</Link>
    </div>;
  }

  if (!payable) {
    return <div className="shop-container" style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>Not ready for payment yet</p>
      <p style={{ color: 'var(--gray)', fontSize: '.88rem', marginBottom: 16 }}>
        {quote.paymentStatus !== 'unpaid'
          ? 'Payment for this quote has already been received.'
          : 'The store is still preparing your price. You will be notified in chat once the quote is ready.'}
      </p>
      <Link href="/shop/orders-history" style={{ color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }}>Back to My Orders</Link>
    </div>;
  }

  return (
    <div className="shop-container" style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem 1rem 4rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Checkout</h1>
      <p style={{ color: 'var(--gray)', fontSize: '.86rem', margin: '4px 0 18px' }}>
        Paying your quote sends it straight into production.
      </p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 12px', borderRadius: 10, fontSize: '.84rem', marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div className="quote-checkout-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 16, alignItems: 'start' }}>
        {/* LEFT - address + payment choice */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            {/* Same picker as the custom-order page. The blue "Edit / Pin" link belonged to no
                palette in this app, and the two screens had drifted into different cards. */}
            <AddressPicker
              addresses={addresses}
              selectedId={selectedAddressId}
              onSelect={setSelectedAddressId}
              onSaved={() => fetchAddresses(true)}
              requirePin
            />
          </section>

          <section style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <span style={{ display: 'block', fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10 }}>
              How much to pay now
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'downpayment', title: `Downpayment (${dpPct}%)`, amount: down, sub: `Balance ${formatPeso(finalPrice - down)} due before delivery` },
                { key: 'full', title: 'Pay in full', amount: finalPrice, sub: 'Nothing left to pay later' },
              ].map(opt => {
                const active = payType === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setPayType(opt.key)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      textAlign: 'left', width: '100%', padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                      // Gold, like the selected address directly above it and like every other
                      // chosen thing in this app. A black ring here was the only one of its kind
                      // on the page, and read as disabled rather than as chosen.
                      border: active ? '2px solid var(--gold)' : '1px solid var(--border)',
                      background: active ? 'rgba(212,168,67,0.08)' : 'var(--dark)',
                    }}
                  >
                    <span>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '.86rem' }}>{opt.title}</span>
                      <span style={{ display: 'block', color: 'var(--gray)', fontSize: '.75rem', marginTop: 2 }}>{opt.sub}</span>
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '.9rem', whiteSpace: 'nowrap' }}>{formatPeso(opt.amount)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* How fast, and what that actually promises. The quote said what it costs and never
              said when it arrives; "sends it straight into production" was the only hint, and a
              customer paying five figures deserves a date they can hold the shop to. Counted in
              WORKING days from payment - a quote has no proof step, so the clock starts here. */}
          <section style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <span style={{ display: 'block', fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10 }}>
              Delivery speed
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: false, label: 'Standard', lead: prodLead, fee: 0 },
                ...(rushOffered ? [{ key: true, label: 'Rush', lead: rushLead, fee: rushFeeAmt }] : []),
              ].map(opt => {
                const active = rush === opt.key;
                return (
                  <button key={String(opt.key)} type="button" onClick={() => setRush(opt.key)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      padding: '11px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: `1.5px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                      background: active ? 'rgba(212,168,67,0.08)' : 'transparent',
                    }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${active ? 'var(--gold)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {active && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '.88rem', fontWeight: 700, color: active ? 'var(--gold)' : 'var(--white)' }}>{opt.label}</span>
                        <span style={{ fontSize: '.74rem', color: 'var(--gray)' }}>{daysText(opt.lead)} after payment</span>
                      </span>
                    </span>
                    {opt.fee > 0 && (
                      <span style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--gold)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        +{formatPeso(opt.fee)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {/* A ceiling, said as a range, so an early arrival reads as expected rather than
                  as a surprise. Word for word what the cart checkout promises. */}
              <span style={{ fontSize: '.75rem', color: 'var(--gray)', lineHeight: 1.55 }}>
                This is the longest you should wait.{' '}
                <strong style={{ color: '#166534' }}>Orders often arrive earlier</strong> when our
                production queue is light - we message you as soon as yours is ready.
              </span>
            </div>
            {rush && rushOffered && (
              <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 9, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <span style={{ fontSize: '.75rem', color: 'var(--st-amber-fg)', lineHeight: 1.5 }}>
                  Rush is <strong>subject to our confirmation</strong>. If other orders are still in
                  production ahead of yours it may take longer - we will tell you either way.
                </span>
              </div>
            )}
          </section>

          <section style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <span style={{ display: 'block', fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10 }}>
              Payment method
            </span>
            {/* Picked here rather than on PayMongo's page. The line that used to sit under the
                amount - "You'll choose GCash, Maya or card on the secure payment page" - was an
                apology for making the customer decide twice. */}
            <PaymentMethods
              value={payMethod}
              onChange={setPayMethod}
              enabled={payEnabled}
              eWalletPhone={eWalletPhone}
              onEWalletPhone={setEWalletPhone}
              card={card}
              onCard={setCard}
            />
          </section>
        </div>

        {/* RIGHT - quote summary */}
        <aside style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, position: 'sticky', top: 16 }}>
          <span style={{ display: 'block', fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10 }}>
            Your quote
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {/* Same shape as the custom-order page's summary: the name on its own line, the
                variant under it rather than trailing off the end of it, then the maths. Run
                together on one line, a long product name pushed the variant into a third row
                and the price into a column of its own. */}
            {lines.map((li, i) => (
              <div key={li.productId ?? i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: 'var(--dark2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {li.thumbnail
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={li.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <NoImage size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '.86rem', lineHeight: 1.35, color: 'var(--white)' }}>
                    {li.productName}
                  </div>
                  {li.variantName && (
                    <div style={{ fontSize: '.76rem', color: 'var(--gray)', marginTop: 1 }}>{li.variantName}</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                    <span style={{ color: 'var(--gray)', fontSize: '.76rem' }}>
                      {formatPeso(li.unitPrice)} &times; {li.qty} pc{li.qty === 1 ? '' : 's'}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '.82rem', whiteSpace: 'nowrap' }}>{formatPeso(li.lineTotal)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Their own answers, above the store's note: this is the price for THAT, and the
              moment to check it is before paying, not after the shirts are printed. */}
          {Array.isArray(quote.orderForms) && quote.orderForms.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <OrderFormSnapshot forms={quote.orderForms} compact />
            </div>
          )}

          {quote.adminComment && (
            <div style={{ fontSize: '.78rem', color: 'var(--gray-light)', background: 'var(--dark2)', border: '1px solid #f0f1f3', borderRadius: 8, padding: '7px 9px', marginBottom: 12 }}>
              <span style={{ fontWeight: 700 }}>Note from store:</span> {quote.adminComment}
            </div>
          )}

          {/* A quote has no separate proof step - the terms say so - so paying it IS the
              approval. Showing the artwork as a 44px thumbnail labelled "Your design" asked
              the customer to approve something they could not actually see. It is the size of
              the decision now, and says plainly what paying means. */}
          {designFiles.length > 0 && (
            <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--dark2)' }}>
              {designFiles.map((f, i) => (
                isImage(f.url) ? (
                  // Tapping opens it properly, the way an attachment opens everywhere else here,
                  // instead of handing the browser a new tab to render however it likes.
                  <button key={i} type="button"
                    onClick={() => setLightbox({ urls: designFiles.filter(x => isImage(x.url)).map(x => x.url), index: designFiles.filter(x => isImage(x.url)).findIndex(x => x.url === f.url) })}
                    style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={fileLabel(f)}
                      style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'contain', background: 'var(--dark3)',
                        borderTop: i > 0 ? '1px solid var(--border)' : 'none' }} />
                  </button>
                ) : (
                  // A PDF, an AI file, a PSD. There is nothing to show inline, and showing it as a
                  // broken image is worse than saying plainly what it is and letting them open it.
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', textDecoration: 'none',
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none', color: 'var(--white)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.8" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>
                    </svg>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileLabel(f)}</span>
                      <span style={{ display: 'block', fontSize: '.72rem', color: 'var(--gray)' }}>Opens in a new tab</span>
                    </span>
                  </a>
                )
              ))}
              <div style={{ padding: '9px 11px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--white)' }}>
                  {designFiles.length === 1 ? 'This is what we will print' : `This is what we will print (${designFiles.length} files)`}
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--gray)', lineHeight: 1.5, marginTop: 2 }}>
                  There is no separate approval step on a quote - paying it approves this artwork.
                  Check it first{designFiles.length > 1 ? ', all of it,' : ''} and message us if anything is wrong.
                </div>
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {designFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                <span style={{ color: 'var(--gray)' }}>Design fee</span><span>{formatPeso(designFee)}</span>
              </div>
            )}
            {deliveryFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                <span style={{ color: 'var(--gray)' }}>Delivery fee</span><span>{formatPeso(deliveryFee)}</span>
              </div>
            )}
            {/* At zero the line simply vanished, leaving a total that said nothing about
                delivery - which reads as "included" to anyone who is not looking for it. */}
            {deliveryFee === 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '.86rem' }}>
                <span style={{ color: 'var(--gray)' }}>Delivery</span>
                <span style={{ color: 'var(--gray)', textAlign: 'right', maxWidth: 260, lineHeight: 1.45 }}>
                  Not included. The seller books a courier to your address after this is paid and
                  sends you the exact fee in chat.
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.86rem', marginTop: 2 }}>
              <span style={{ color: 'var(--gray)' }}>Quoted total</span>
              <span style={{ fontWeight: rushCharge > 0 ? 600 : 800 }}>{formatPeso(quotedPrice)}</span>
            </div>
            {/* On its own line, outside the quoted total, because that is exactly what it is: the
                quote priced the goods, this is what the customer added afterwards. */}
            {rushCharge > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.86rem' }}>
                <span style={{ color: 'var(--gray)' }}>Rush</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>+{formatPeso(rushCharge)}</span>
              </div>
            )}
            {rushCharge > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.86rem' }}>
                <span style={{ color: 'var(--gray)' }}>Total</span>
                <span style={{ fontWeight: 800 }}>{formatPeso(finalPrice)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              <span style={{ fontWeight: 800, fontSize: '.9rem' }}>Pay now</span>
              <span style={{ fontWeight: 900, fontSize: '1.05rem' }}>{formatPeso(amountDue)}</span>
            </div>
          </div>

          {/* There is no tick out here any more. A checkbox beside a link is agreement to
              something nobody opened - the box is at the END of the terms now, so reaching it
              means having scrolled past what it covers. A ready-made quote shows none of this:
              there is no artwork, no proof and no revisions to agree about. */}
          {isBespoke && !alreadyPaid && !isExpired && (
            <button type="button" onClick={() => setShowTerms(true)}
              style={{
                width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit',
                border: `1px solid ${agreed ? 'rgba(34,197,94,0.35)' : 'var(--gold)'}`,
                background: agreed ? 'rgba(34,197,94,0.08)' : 'rgba(212,168,67,0.08)',
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={agreed ? '#22c55e' : 'var(--gold)'} strokeWidth="2" style={{ flexShrink: 0 }}>
                {agreed
                  ? <><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></>
                  : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>}
              </svg>
              <span style={{ fontSize: '.8rem', lineHeight: 1.45, color: agreed ? '#22c55e' : 'var(--white)', fontWeight: 700 }}>
                {agreed ? 'You agreed to the Custom Order Terms' : 'Read the Custom Order Terms'}
                <span style={{ display: 'block', fontWeight: 400, fontSize: '.72rem', color: 'var(--gray)', marginTop: 1 }}>
                  {agreed ? 'Tap to read them again' : 'Required before you can pay this quotation'}
                </span>
              </span>
            </button>
          )}

          {/* The exact clauses being agreed to, so the acceptance means something. The same set is
              recorded on the order as the snapshot. */}
          {showTerms && (
            <div onClick={() => setShowTerms(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div onClick={e => e.stopPropagation()}
                style={{ background: 'var(--dark)', color: 'var(--white)', borderRadius: 14, maxWidth: 560, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: '.95rem' }}>
                  Custom Order Terms
                </div>
                <div
                  onScroll={e => {
                    // Reached the bottom. The tick below stays out of reach until then, so
                    // "I have read this" is at least true of the scrollbar.
                    const el = e.currentTarget;
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setTermsSeen(true);
                  }}
                  ref={el => {
                    // Short enough not to scroll at all - then there was nothing to reach and the
                    // tick would have stayed locked forever.
                    if (el && el.scrollHeight <= el.clientHeight + 24) setTermsSeen(true);
                  }}
                  style={{ padding: '14px 18px', overflowY: 'auto' }}>
                  {activeClauses.map((c, i) => (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: '.84rem', marginBottom: 3 }}>{c.title}</div>
                      <div style={{ fontSize: '.8rem', color: 'var(--gray)', lineHeight: 1.6 }}>{c.body}</div>
                    </div>
                  ))}

                  {/* The tick is here, at the end of what it covers, rather than on the page
                      outside the modal where it could be ticked without any of this being seen. */}
                  <label htmlFor="quote-terms"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 12px', borderRadius: 10,
                      border: '1px solid var(--gold)', background: 'rgba(212,168,67,0.08)',
                      cursor: termsSeen ? 'pointer' : 'not-allowed', opacity: termsSeen ? 1 : 0.55,
                    }}>
                    <input id="quote-terms" type="checkbox" checked={agreed} disabled={!termsSeen}
                      onChange={e => { setAgreed(e.target.checked); if (e.target.checked) setError(null); }}
                      style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'inherit', flexShrink: 0 }} />
                    <span style={{ fontSize: '.8rem', lineHeight: 1.5, color: 'var(--white)' }}>
                      I have read and agree to these Custom Order Terms for this quotation.
                      {!termsSeen && (
                        <span style={{ display: 'block', fontSize: '.72rem', color: 'var(--gray)', marginTop: 2 }}>
                          Scroll to the end of the terms first.
                        </span>
                      )}
                    </span>
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--gray)' }}>Terms v{termsVersion}</span>
                  <button onClick={() => setShowTerms(false)}
                    style={{ padding: '8px 18px', background: agreed ? 'var(--gold)' : 'transparent', border: agreed ? 'none' : '1px solid var(--border)', borderRadius: 8, color: agreed ? '#000' : 'var(--white)', fontWeight: 700, cursor: 'pointer', fontSize: '.85rem' }}>
                    {agreed ? 'Done' : 'Close'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {alreadyPaid ? (
            <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 10, fontSize: '.8rem', fontWeight: 700,
              background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
              This quote has already been paid. Track it in <Link href="/shop/orders-history" style={{ color: '#1e40af', textDecoration: 'underline' }}>My Orders</Link>.
            </div>
          ) : quote?.expiresAt && (
            <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 10, fontSize: '.8rem', fontWeight: 700,
              background: isExpired ? '#fef2f2' : '#f0fdf4', color: isExpired ? '#991b1b' : '#166534',
              border: `1px solid ${isExpired ? '#fecaca' : '#bbf7d0'}` }}>
              {isExpired
                ? 'This quote has expired. Please ask the seller for a new quote.'
                : `Quote valid - expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${new Date(quote.expiresAt).toLocaleDateString()}).`}
            </div>
          )}
          {!alreadyPaid && (() => {
            // Paying is blocked until the terms are agreed, not merely scolded afterwards - and
            // the button says which of the three things is in the way rather than going grey
            // and leaving the customer to guess.
            const needsTerms = isBespoke && !agreed;
            const blocked = paying || !selectedAddress || isExpired || needsTerms;
            const label = isExpired ? 'Quote expired'
              : paying ? 'Opening payment…'
              : !selectedAddress ? 'Choose a delivery address'
              : needsTerms ? 'Read the terms to continue'
              : `Pay ${formatPeso(amountDue)}`;
            return (
              <button
                onClick={handlePay}
                disabled={paying || !selectedAddress || isExpired}
                style={{
                  // The same gold as Add to cart and Place custom order. This was the one paying
                  // button in the shop wearing a different colour, on the screen where the money
                  // actually leaves.
                  width: '100%', marginTop: 12, padding: '12px 14px', borderRadius: 10, border: 'none',
                  background: 'var(--gold)', color: '#1a1a1a', fontWeight: 800, fontSize: '.92rem',
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  opacity: blocked ? 0.6 : 1,
                }}
              >
                {label}
              </button>
            );
          })()}
          <Link href="/shop/orders-history" style={{ display: 'block', textAlign: 'center', marginTop: 10, fontSize: '.78rem', color: 'var(--gray)', textDecoration: 'none' }}>
            Back to My Orders
          </Link>
        </aside>
      </div>

      {lightbox && (
        <PhotoLightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onIndexChange={i => setLightbox(l => ({ ...l, index: i }))}
          onClose={() => setLightbox(null)}
        />
      )}

      <style jsx>{`
        @media (max-width: 820px) {
          .quote-checkout-grid { grid-template-columns: minmax(0, 1fr) !important; } .quote-checkout-grid > * { min-width: 0; }
        }
      `}</style>
    </div>
  );
}
