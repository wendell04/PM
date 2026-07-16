'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyOrderRequests, createOrderRequestPaymentLink } from '@/lib/orderRequestApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { formatPeso, formatDate } from '@/lib/shopUtils';
import '@/app/shop/shop.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// A quote can be paid once the store owner has confirmed it and set a final price,
// and it has not been paid or already turned into an order.
function isPayable(r) {
  return ['confirmed', 'processing', 'ready'].includes(r.status)
    && Number(r.finalPrice) > 0
    && r.paymentStatus === 'unpaid'
    && !r.convertedOrderId;
}

const STATUS_LABEL = {
  pending_review: 'Under Review',
  confirmed:      'Quote Ready',
  processing:     'Quote Ready',
  ready:          'Quote Ready',
  declined:       'Declined',
  cancelled:      'Cancelled',
};

function addressLine(a) {
  return [a.house_number, a.street, a.subdivision, a.barangay, a.city, a.province, a.zip]
    .filter(Boolean).join(', ');
}

export default function MyQuotesPage() {
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payingId, setPayingId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [reqs, addrRes] = await Promise.all([
        fetchMyOrderRequests(token),
        fetchWithTimeout(`${API_URL}/api/addresses`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 30000).then(r => r.ok ? r.json() : { addresses: [] }).catch(() => ({ addresses: [] })),
      ]);
      const list = Array.isArray(reqs) ? reqs : (reqs?.data ?? []);
      setRequests(list);
      const addrList = addrRes.addresses || [];
      setAddresses(addrList);
      const def = addrList.find(a => a.isDefault) || addrList[0];
      if (def) setSelectedAddressId(def.id);
    } catch (e) {
      setError(e.message || 'Failed to load your quotes.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const selectedAddress = addresses.find(a => a.id === selectedAddressId) ?? null;

  function buildAddressPayload(a) {
    return {
      label:        a.label,
      house_number: a.house_number,
      street:       a.street,
      subdivision:  a.subdivision,
      region:       a.region ?? null,
      barangay:     a.barangay,
      city:         a.city,
      province:     a.province,
      zip:          a.zip,
      phone:        a.phone,
      lat:          a.lat ?? null,
      lng:          a.lng ?? null,
    };
  }

  async function handlePay(request, type) {
    setError(null);
    if (!selectedAddress) {
      setError('Please select a delivery address first.');
      return;
    }
    if (!selectedAddress.lat || !selectedAddress.lng) {
      setError('Your selected address has no map pin. Please pin its location in Checkout or your Profile so the courier can be booked.');
      return;
    }
    const missing = ['street', 'barangay', 'city', 'province'].find(f => !selectedAddress[f]?.trim?.());
    if (missing) {
      setError('Your selected address is incomplete. Please update it in your Profile.');
      return;
    }
    setPayingId(`${request._id}:${type}`);
    try {
      const res = await createOrderRequestPaymentLink(token, request._id, type, buildAddressPayload(selectedAddress));
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setError('Could not start the payment. Please try again.');
        setPayingId(null);
      }
    } catch (e) {
      setError(e.message || 'Could not start the payment.');
      setPayingId(null);
    }
  }

  return (
    <div className="shop-container" style={{ maxWidth: 860, margin: '0 auto', padding: '1.25rem 1rem 4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>My Quotes</h1>
          <p style={{ color: '#6b7280', fontSize: '.86rem', margin: '4px 0 0' }}>
            Custom / inquiry requests and their prices. Pay to send them into production.
          </p>
        </div>
        <Link href="/shop/orders-history" style={{ fontSize: '.82rem', fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
          My Orders &rarr;
        </Link>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 12px', borderRadius: 10, fontSize: '.84rem', marginBottom: 14 }}>
          {error}
        </div>
      )}

      {addresses.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>
            Delivery address
          </label>
          <select
            value={selectedAddressId}
            onChange={(e) => setSelectedAddressId(e.target.value)}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid #d1d5db', borderRadius: 9, fontSize: '.86rem', background: '#fff' }}
          >
            {addresses.map(a => (
              <option key={a.id} value={a.id}>
                {(a.label ? `${a.label} — ` : '') + addressLine(a)}
              </option>
            ))}
          </select>
          {selectedAddress && (!selectedAddress.lat || !selectedAddress.lng) && (
            <p style={{ color: '#b45309', fontSize: '.78rem', margin: '8px 0 0' }}>
              This address has no map pin. Pin it in <Link href="/shop/checkout" style={{ color: '#2563eb' }}>Checkout</Link> or your Profile before paying.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Loading your quotes&hellip;</p>
      ) : requests.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <p style={{ fontWeight: 700, margin: '0 0 4px' }}>No quotes yet</p>
          <p style={{ color: '#6b7280', fontSize: '.86rem', margin: 0 }}>
            Inquire about a made-to-order product and it will appear here once the store sends a price.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {requests.map(r => {
            const finalPrice = Number(r.finalPrice) || 0;
            const down = r.downPayment !== null && Number(r.downPayment) > 0 ? Number(r.downPayment) : Math.round(finalPrice * 0.5 * 100) / 100;
            const dpPct = finalPrice > 0 ? Math.round((down / finalPrice) * 100) : 50;
            const payable = isPayable(r);
            const paying = payingId && payingId.startsWith(`${r._id}:`);
            return (
              <div key={r._id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, display: 'flex', gap: 13 }}>
                <div style={{ width: 66, height: 66, borderRadius: 10, overflow: 'hidden', background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {r.productThumbnail
                    ? <img src={r.productThumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: '#9ca3af', fontSize: '.7rem' }}>No image</span>}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: '.95rem', lineHeight: 1.25 }}>{r.productName}</div>
                    <span style={{ fontSize: '.68rem', fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: payable ? '#ecfdf5' : '#f3f4f6', color: payable ? '#047857' : '#6b7280', whiteSpace: 'nowrap', height: 'fit-content' }}>
                      {r.convertedOrderId ? 'Ordered' : (STATUS_LABEL[r.status] || r.status)}
                    </span>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '.78rem', marginTop: 2 }}>
                    {r.category ? `${r.category} · ` : ''}Qty {r.quantity || 1}{r.createdAt ? ` · ${formatDate(r.createdAt)}` : ''}
                  </div>

                  {r.adminComment && (
                    <div style={{ marginTop: 8, fontSize: '.8rem', color: '#374151', background: '#f9fafb', border: '1px solid #f0f1f3', borderRadius: 8, padding: '7px 9px' }}>
                      <span style={{ fontWeight: 700 }}>Note from store:</span> {r.adminComment}
                    </div>
                  )}

                  {finalPrice > 0 ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
                        <span style={{ color: '#6b7280' }}>Quoted total</span>
                        <span style={{ fontWeight: 800 }}>{formatPeso(finalPrice)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', marginTop: 2 }}>
                        <span style={{ color: '#6b7280' }}>Downpayment ({dpPct}%)</span>
                        <span style={{ fontWeight: 700 }}>{formatPeso(down)}</span>
                      </div>

                      {r.convertedOrderId ? (
                        <Link href="/shop/orders-history" style={{ display: 'inline-block', marginTop: 10, fontSize: '.82rem', fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                          Track this order &rarr;
                        </Link>
                      ) : payable ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handlePay(r, 'downpayment')}
                            disabled={!!paying}
                            style={{ flex: '1 1 150px', padding: '9px 12px', borderRadius: 9, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, fontSize: '.84rem', cursor: paying ? 'wait' : 'pointer', opacity: paying ? 0.7 : 1 }}
                          >
                            {payingId === `${r._id}:downpayment` ? 'Opening…' : `Pay Downpayment (${formatPeso(down)})`}
                          </button>
                          <button
                            onClick={() => handlePay(r, 'full')}
                            disabled={!!paying}
                            style={{ flex: '1 1 150px', padding: '9px 12px', borderRadius: 9, border: '1px solid #111827', background: '#fff', color: '#111827', fontWeight: 700, fontSize: '.84rem', cursor: paying ? 'wait' : 'pointer', opacity: paying ? 0.7 : 1 }}
                          >
                            {payingId === `${r._id}:full` ? 'Opening…' : `Pay in Full (${formatPeso(finalPrice)})`}
                          </button>
                        </div>
                      ) : (
                        <p style={{ color: '#6b7280', fontSize: '.78rem', margin: '9px 0 0' }}>
                          {r.paymentStatus !== 'unpaid' ? 'Payment received. Thank you!' : 'Waiting for the store to finalize this quote.'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', fontSize: '.8rem', margin: '10px 0 0' }}>
                      The store is preparing your price. You will be notified in chat once the quote is ready.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
