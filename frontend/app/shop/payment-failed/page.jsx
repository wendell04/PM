'use client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function PaymentFailedPage() {
  const searchParams = useSearchParams();
  const orderId      = searchParams.get('id');
  const cancelled    = searchParams.get('cancelled') === '1';

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
          background: 'rgba(239,68,68,0.1)',
          border: '2px solid var(--red)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round"
            strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>

        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'var(--white)',
          marginBottom: '8px',
        }}>
          {cancelled ? 'Payment Cancelled' : 'Payment Failed'}
        </h1>

        <p style={{
          color: 'var(--gray)',
          fontSize: '0.95rem',
          marginBottom: '32px',
          lineHeight: 1.6,
        }}>
          {cancelled
            ? 'You cancelled the payment. Your order has been saved — you can retry from your order history.'
            : 'Your payment was not completed. Your order has been saved — you can retry from your order history.'}
        </p>

        {orderId && (
          <div style={{
            background: 'var(--dark3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>
              Order Reference
            </span>
            <span style={{
              color: 'var(--white)',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
            }}>
              #{orderId.slice(-8).toUpperCase()}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link
            href="/shop/orders-history"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
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
            Back to Shop
          </Link>
        </div>

      </div>
    </div>
  );
}
