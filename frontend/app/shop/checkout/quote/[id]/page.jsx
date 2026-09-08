'use client';
import NoImage from '@/components/NoImage';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyOrderRequest, createOrderRequestPaymentLink } from '@/lib/orderRequestApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { formatPeso } from '@/lib/shopUtils';
import { DEFAULT_CUSTOM_ORDER_TERMS, renderTermsBody } from '@/lib/customOrderTerms';
import '@/app/shop/shop.css';

import AddressPicker from '@/components/shop/AddressPicker';
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
  const { token, user } = useAuth();

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
  const [payType, setPayType] = useState('downpayment');
  const [paying, setPaying] = useState(false);

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

  const finalPrice = Number(quote?.finalPrice) || 0;
  const isExpired = quote?.expiresAt ? new Date(quote.expiresAt).getTime() < Date.now() : false;
  const daysLeft = quote?.expiresAt ? Math.ceil((new Date(quote.expiresAt).getTime() - Date.now()) / 86400000) : null;
  const alreadyPaid = quote ? (quote.paymentStatus && quote.paymentStatus !== 'unpaid') || !!quote.convertedOrderId : false;
  const down = quote && quote.downPayment != null && Number(quote.downPayment) > 0
    ? Number(quote.downPayment)
    : Math.round(finalPrice * 0.5 * 100) / 100;
  const dpPct = finalPrice > 0 ? Math.round((down / finalPrice) * 100) : 50;
  const lines = quote?.lineItems ?? [];
  const designFee = Number(quote?.designFee) || 0;
  const deliveryFee = Number(quote?.shippingFee) || 0;
  const amountDue = payType === 'full' ? finalPrice : down;

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
  const activeClauses = rawTerms.filter(t => !t.mode || t.mode === 'both' || t.mode === 'quote');
  const termsSnapshot = activeClauses.map(t => ({ title: t.title, body: t.body, mode: t.mode || 'both' }));
  const termsVersion  = settings?.termsVersion ?? 1;

  async function handlePay() {
    setError(null);
    if (!agreed) { setError('Please read and agree to the Custom Order Terms before paying.'); return; }
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

      const res = await createOrderRequestPaymentLink(token, id, payType, buildAddressPayload(selectedAddress), {
        agreedToTerms: true,
        termsVersion,
        termsAgreedAt: new Date().toISOString(),
        termsSnapshot,
      }, payment);

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
                      border: active ? '2px solid var(--white)' : '1px solid var(--border)',
                      background: active ? 'var(--dark2)' : 'var(--dark)',
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
            {lines.map((li, i) => (
              <div key={li.productId ?? i} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: 'var(--dark2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {li.thumbnail
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={li.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <NoImage size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '.84rem', lineHeight: 1.3 }}>
                    {li.productName}
                    {li.variantName && (
                      <span style={{ fontWeight: 500, color: 'var(--gray)' }}> - {li.variantName}</span>
                    )}
                  </div>
                  <div style={{ color: 'var(--gray)', fontSize: '.74rem', marginTop: 1 }}>
                    {li.qty} &times; {formatPeso(li.unitPrice)}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '.82rem', whiteSpace: 'nowrap' }}>{formatPeso(li.lineTotal)}</div>
              </div>
            ))}
          </div>

          {quote.adminComment && (
            <div style={{ fontSize: '.78rem', color: 'var(--gray-light)', background: 'var(--dark2)', border: '1px solid #f0f1f3', borderRadius: 8, padding: '7px 9px', marginBottom: 12 }}>
              <span style={{ fontWeight: 700 }}>Note from store:</span> {quote.adminComment}
            </div>
          )}

          {/* A quote has no separate proof step - the terms say so - so paying it IS the
              approval. Showing the artwork as a 44px thumbnail labelled "Your design" asked
              the customer to approve something they could not actually see. It is the size of
              the decision now, and says plainly what paying means. */}
          {quote.designUrl && (
            <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--dark2)' }}>
              <a href={quote.designUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={quote.designUrl} alt="Mockup for this quote"
                  style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'contain', background: 'var(--dark3)' }} />
              </a>
              <div style={{ padding: '9px 11px' }}>
                <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--white)' }}>This is what we will print</div>
                <div style={{ fontSize: '.72rem', color: 'var(--gray)', lineHeight: 1.5, marginTop: 2 }}>
                  There is no separate approval step on a quote - paying it approves this artwork.
                  Check it first, and{' '}
                  <a href={quote.designUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', fontWeight: 600 }}>open it full size</a>
                  {' '}if you need a closer look. Message us if anything is wrong.
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
              <span style={{ fontWeight: 800 }}>{formatPeso(finalPrice)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
              <span style={{ fontWeight: 800, fontSize: '.9rem' }}>Pay now</span>
              <span style={{ fontWeight: 900, fontSize: '1.05rem' }}>{formatPeso(amountDue)}</span>
            </div>
          </div>

          {!alreadyPaid && !isExpired && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input id="quote-terms" type="checkbox" checked={agreed}
                onChange={e => { setAgreed(e.target.checked); if (e.target.checked) setError(null); }}
                style={{ marginTop: 2, width: 15, height: 15, accentColor: 'var(--gold)', cursor: 'pointer', flexShrink: 0 }} />
              <label htmlFor="quote-terms" style={{ fontSize: '.8rem', lineHeight: 1.5, color: 'var(--gray-light)', cursor: 'pointer' }}>
                I have read and agree to the{' '}
                <button type="button" onClick={e => { e.preventDefault(); setShowTerms(true); }}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: '.8rem', fontFamily: 'inherit' }}>
                  Custom Order Terms
                </button>{' '}
                for this quotation.
              </label>
            </div>
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
                <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
                  {activeClauses.map((c, i) => (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: '.84rem', marginBottom: 3 }}>{c.title}</div>
                      <div style={{ fontSize: '.8rem', color: 'var(--gray)', lineHeight: 1.6 }}>{c.body}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--gray)' }}>Terms v{termsVersion}</span>
                  <button onClick={() => { setAgreed(true); setShowTerms(false); setError(null); }}
                    style={{ padding: '8px 18px', background: 'var(--gold)', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '.85rem' }}>
                    I agree
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
          {!alreadyPaid && (
            <button
              onClick={handlePay}
              disabled={paying || !selectedAddress || isExpired}
              style={{
                width: '100%', marginTop: 12, padding: '11px 12px', borderRadius: 10, border: 'none',
                background: 'var(--white)', color: 'var(--dark)', fontWeight: 800, fontSize: '.88rem',
                cursor: (paying || !selectedAddress || isExpired) ? 'not-allowed' : 'pointer',
                opacity: (paying || !selectedAddress || isExpired) ? 0.6 : 1,
              }}
            >
              {isExpired ? 'Quote expired' : paying ? 'Opening payment…' : `Pay ${formatPeso(amountDue)}`}
            </button>
          )}
          <Link href="/shop/orders-history" style={{ display: 'block', textAlign: 'center', marginTop: 10, fontSize: '.78rem', color: 'var(--gray)', textDecoration: 'none' }}>
            Back to My Orders
          </Link>
        </aside>
      </div>

      <style jsx>{`
        @media (max-width: 820px) {
          .quote-checkout-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
