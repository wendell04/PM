'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function PaymentSuccessPage() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const { token }     = useAuth();
  const orderId       = searchParams.get('id');
  const method        = searchParams.get('method'); // 'cod' or null (online)
  const isCod         = method === 'cod';
  const isOrderRequest = searchParams.get('type') === 'order_request';

  // Clear checkout payload on confirmed success (online payment lands here after PayMongo)
  useEffect(() => {
    sessionStorage.removeItem('checkout_payload');
  }, []);

  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!orderId) {
      setError('No order reference found.');
      setLoading(false);
      return;
    }
    if (!token) return; // wait for auth hydration

    const fetchOrder = async () => {
      try {
        const endpoint = isOrderRequest
          ? `${API_URL}/api/shop/order-requests/${orderId}`
          : `${API_URL}/api/orders/my/${orderId}`;
        const res = await fetchWithTimeout(
          endpoint,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
          10000
        );
        if (!res.ok) throw new Error('Could not load order details.');
        const data = await res.json();
        setOrder(data.data ?? data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, token, isOrderRequest]);

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

        {loading && (
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
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}>
              <span style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>
                Order ID
              </span>
              <span style={{
                color: 'var(--white)',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
              }}>
                #{(order.id ?? order._id ?? '').slice(-8).toUpperCase()}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}>
              <span style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>
                {isCod ? 'Order Total' : 'Amount Paid'}
              </span>
              <span style={{ color: 'var(--gold)', fontSize: '0.85rem', fontWeight: 600 }}>
                ₱{Number(order.totalAmount ?? 0).toLocaleString('en-PH', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>
                Status
              </span>
              <span style={{
                color: order.paymentStatus === 'paid'
                  ? 'var(--green)'
                  : 'var(--gold)',
                fontSize: '0.85rem',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}>
                {order.paymentStatus ?? 'Processing'}
              </span>
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
