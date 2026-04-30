'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useCart } from '@/context/CartContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function PaymentSuccessPage() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const { token }     = useAuth();
  const { clearCart } = useCart();
  const orderId       = searchParams.get('id');
  const method        = searchParams.get('method'); // 'cod' or null (online)
  const isCod         = method === 'cod';
  const isOrderRequest = searchParams.get('type') === 'order_request';

  useEffect(() => {
    sessionStorage.removeItem('checkout_payload');
    sessionStorage.removeItem('pending_payment_order_id');
    if (orderId) clearCart();
  }, [orderId]);

  const [order,        setOrder]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [verifying,    setVerifying]    = useState(!isCod && !isOrderRequest);

  useEffect(() => {
    if (!orderId) {
      setError('No order reference found.');
      setLoading(false);
      return;
    }
    if (!token) return;

    const endpoint = isOrderRequest
      ? `${API_URL}/api/shop/order-requests/${orderId}`
      : `${API_URL}/api/orders/my/${orderId}`;

    const pushVerify = async () => {
      try {
        await fetchWithTimeout(`${API_URL}/api/payment/verify-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId }),
        }, 10000);
      } catch {}
    };

    const fetchOrder = async (attempt = 0) => {
      try {
        // On online payment flows, push a verify-intent call before the first two polls
        // so the order gets marked paid in the DB even without a webhook (local dev).
        if (!isCod && !isOrderRequest && attempt <= 1) {
          await pushVerify();
        }

        const res = await fetchWithTimeout(endpoint, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        }, 10000);
        if (!res.ok) throw new Error('Could not load order details.');
        const data = await res.json();
        const fetched = data.data ?? data;
        setOrder(fetched);

        if (!isCod && !isOrderRequest && fetched.paymentStatus !== 'paid' && attempt < 6) {
          setTimeout(() => fetchOrder(attempt + 1), 2000);
        } else {
          setVerifying(false);
          setLoading(false);
        }
      } catch (err) {
        setError(err.message);
        setVerifying(false);
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, token, isOrderRequest, isCod]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        background: 'var(--dark2)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '48px 40px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
      }}>

        {/* Icon */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'rgba(212,168,67,0.12)',
          border: '2px solid var(--gold)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round"
            strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'var(--white)',
          marginBottom: '8px',
        }}>
          {isCod ? 'Order Placed!' : 'Payment Successful'}
        </h1>

        <p style={{
          color: 'var(--gray)',
          fontSize: '0.95rem',
          marginBottom: '32px',
          lineHeight: 1.6,
        }}>
          {isCod
            ? "Thank you for your order. Our team will contact you to confirm delivery and payment details."
            : "Thank you for your order. We've received your payment and will begin processing shortly."}
        </p>

        {verifying && (
          <p style={{ color: 'var(--gold)', fontSize: '0.875rem', marginBottom: '8px' }}>
            Verifying payment...
          </p>
        )}
        {loading && !verifying && (
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
            Loading order details...
          </p>
        )}

        {error && !loading && (
          <p style={{
            color: 'var(--red)',
            fontSize: '0.875rem',
            marginBottom: '24px',
          }}>
            {error}
          </p>
        )}

        {order && !loading && (
          <div style={{
            background: 'var(--dark3)',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '32px',
            textAlign: 'left',
          }}>
            {/* Header row */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              marginBottom: '12px', paddingBottom: '10px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ color: 'var(--gray)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Order Receipt
              </span>
              <span style={{ color: 'var(--white)', fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600 }}>
                #{(order.id ?? order._id ?? '').slice(-8).toUpperCase()}
              </span>
            </div>

            {/* Line items */}
            {(order.items ?? []).length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                {(order.items ?? []).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--gray)', fontSize: '0.82rem', flex: 1, paddingRight: '8px' }}>
                      {item.productName ?? item.product_name ?? 'Item'}
                      {item.variantName ? ` — ${item.variantName}` : ''} ×{item.qty ?? item.quantity ?? 1}
                    </span>
                    <span style={{ color: 'var(--white)', fontSize: '0.82rem', flexShrink: 0 }}>
                      ₱{Number(item.lineTotal ?? ((item.unitPrice ?? 0) * (item.qty ?? 1))).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Shipping */}
            {order.shippingFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Shipping</span>
                <span style={{ color: 'var(--white)', fontSize: '0.82rem' }}>
                  ₱{Number(order.shippingFee).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Discount */}
            {order.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#22c55e', fontSize: '0.82rem' }}>Discount</span>
                <span style={{ color: '#22c55e', fontSize: '0.82rem' }}>
                  −₱{Number(order.discountAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Total + Status */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '8px', paddingTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.88rem' }}>
                  {isCod ? 'Order Total' : 'Total Paid'}
                </span>
                <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.95rem' }}>
                  ₱{Number(order.totalAmount ?? order.finalPrice ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Payment Status</span>
                <span style={{
                  fontSize: '0.82rem', fontWeight: 700,
                  color: (order.paymentStatus === 'paid' || (!isCod && !isOrderRequest)) ? '#4ade80' : 'var(--gold)',
                }}>
                  {order.paymentStatus === 'paid'
                    ? 'Paid'
                    : isCod
                      ? 'Cash on Delivery'
                      : 'Paid'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link
            href="/shop/orders-history"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              background: 'var(--gold)',
              color: 'var(--black)',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              textDecoration: 'none',
            }}
          >
            View Orders
          </Link>
          <Link
            href="/shop"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              background: 'transparent',
              color: 'var(--white)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.9rem',
              textDecoration: 'none',
            }}
          >
            Continue Shopping
          </Link>
        </div>

      </div>
    </div>
  );
}
