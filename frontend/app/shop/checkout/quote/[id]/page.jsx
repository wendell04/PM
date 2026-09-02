'use client';
import NoImage from '@/components/NoImage';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyOrderRequest, createOrderRequestPaymentLink } from '@/lib/orderRequestApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { formatPeso } from '@/lib/shopUtils';
import '@/app/shop/shop.css';

const AddressBook = dynamic(() => import('@/components/profile/AddressBook'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function addressLine(a) {
  return [a.house_number, a.street, a.subdivision, a.barangay, a.city, a.province, a.zip]
    .filter(Boolean).join(', ');
}

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
  const { token } = useAuth();

  const [quote, setQuote] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [payType, setPayType] = useState('downpayment');
  const [paying, setPaying] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

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

  async function handlePay() {
    setError(null);
    if (!selectedAddress) { setError('Please select a delivery address first.'); return; }
    if (!selectedAddress.lat || !selectedAddress.lng) {
      setError('Please pin your delivery location so the seller can book your courier accurately.');
      setShowPinModal(true);
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
      const res = await createOrderRequestPaymentLink(token, id, payType, buildAddressPayload(selectedAddress));
      if (res.checkoutUrl) {
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
      <Link href="/shop/orders-history" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>Back to My Orders</Link>
    </div>;
  }

  if (quote.convertedOrderId) {
    return <div className="shop-container" style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>This quote is already an order</p>
      <p style={{ color: 'var(--gray)', fontSize: '.88rem', marginBottom: 16 }}>You&apos;ve paid for this quote — track it in your orders.</p>
      <Link href="/shop/orders-history" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>Go to My Orders &rarr;</Link>
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
      <Link href="/shop/orders-history" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>Back to My Orders</Link>
    </div>;
  }

  return (
    <div className="shop-container" style={{ maxWidth: 860, margin: '0 auto', padding: '1.25rem 1rem 4rem' }}>
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
        {/* LEFT — address + payment choice */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--gray)' }}>
                Delivery address
              </span>
              <button
                onClick={() => setShowPinModal(true)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                {addresses.length ? 'Edit / Pin' : 'Add address'}
              </button>
            </div>

            {addresses.length === 0 ? (
              <p style={{ color: 'var(--gray)', fontSize: '.82rem', margin: 0 }}>
                You have no saved address yet. Add one to continue.
              </p>
            ) : (
              <>
                <select
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 9, fontSize: '.86rem', background: 'var(--dark)' }}
                >
                  {addresses.map(a => (
                    <option key={a.id} value={a.id}>
                      {(a.label ? `${a.label} — ` : '') + addressLine(a)}
                    </option>
                  ))}
                </select>
                {selectedAddress && (
                  <p style={{ color: 'var(--gray)', fontSize: '.78rem', margin: '8px 0 0' }}>{selectedAddress.phone}</p>
                )}
                {selectedAddress && (!selectedAddress.lat || !selectedAddress.lng) && (
                  <p style={{ color: '#b45309', fontSize: '.78rem', margin: '8px 0 0' }}>
                    This address has no map pin. The seller needs it to book your courier —{' '}
                    <button onClick={() => setShowPinModal(true)} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '.78rem' }}>
                      pin it now
                    </button>.
                  </p>
                )}
              </>
            )}
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
            <p style={{ color: 'var(--gray)', fontSize: '.75rem', margin: '10px 0 0' }}>
              You&apos;ll choose GCash, Maya or card on the secure payment page.
            </p>
          </section>
        </div>

        {/* RIGHT — quote summary */}
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

          {quote.designUrl && (
            <a href={quote.designUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 10px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 8, textDecoration: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={quote.designUrl} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--white)' }}>Your design</span>
                <span style={{ display: 'block', fontSize: '.72rem', color: '#2563eb' }}>View full artwork</span>
              </span>
            </a>
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
                : `Quote valid — expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${new Date(quote.expiresAt).toLocaleDateString()}).`}
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

      {showPinModal && (
        // No backdrop-close: holds the address + map-pin form; a stray click would wipe it.
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
        >
          <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '580px', marginTop: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--white)', fontWeight: 700 }}>Pin Your Delivery Location</h2>
              <button onClick={() => setShowPinModal(false)} style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <AddressBook
              initialEditAddress={selectedAddress}
              onSaved={() => { fetchAddresses(true); setShowPinModal(false); }}
            />
          </div>
        </div>
      )}

      <style jsx>{`
        @media (max-width: 820px) {
          .quote-checkout-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
