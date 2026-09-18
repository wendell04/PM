'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import OrderReceipt from '@/components/shop/OrderReceipt';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * A receipt at an address that says receipt.
 *
 * The only way to reach one used to be /shop/payment-success?id=...&view=1 - a URL that announces
 * a payment succeeded, on an order where a design fee has been taken and a thousand pesos have
 * not. It is the link the confirmation email hands out, so it was the first thing a customer read.
 *
 * Same component the print portal on payment-success uses, so the page and the printout cannot
 * drift apart.
 */
export default function ReceiptPage() {
  const { id }    = useParams();
  const { token } = useAuth();

  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!id) return;
    let dropped = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(
          `${API_URL}/api/orders/${id}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          20000,
        );
        const d = await res.json().catch(() => ({}));
        if (dropped) return;
        if (!res.ok) throw new Error(d.message || 'We could not find that order.');
        setOrder(d.data ?? d);
      } catch (e) {
        if (!dropped) setError(e.message || 'We could not load this receipt.');
      } finally {
        if (!dropped) setLoading(false);
      }
    })();
    return () => { dropped = true; };
  }, [id, token]);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem 3rem' }}>
      {/* Hidden when printing - the receipt is the document, not the page around it. */}
      <div className="pmp-receipt-chrome" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <Link href="/shop/orders-history" style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '.85rem', textDecoration: 'none' }}>
          &larr; Back to My Orders
        </Link>
        {order && (
          <button type="button" onClick={() => window.print()}
            style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--gold)', color: '#111', fontWeight: 800, fontSize: '.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            Print receipt
          </button>
        )}
      </div>

      {loading && <p style={{ color: 'var(--gray)', fontSize: '.9rem' }}>Loading your receipt&hellip;</p>}
      {error && !loading && <p style={{ color: '#b45309', fontSize: '.9rem' }}>{error}</p>}

      {order && (
        <div style={{ background: '#ffffff', borderRadius: 12, padding: '28px 30px', boxShadow: '0 2px 18px rgba(0,0,0,0.12)' }}>
          <OrderReceipt order={order} />
        </div>
      )}

      {/* The shared component hides itself on screen for the print portal on payment-success.
          Here it IS the page, so it is shown, and the chrome around it is what disappears on print. */}
      <style jsx global>{`
        #pmp-print-receipt { display: block !important; }
        @media print {
          .pmp-receipt-chrome { display: none !important; }
          @page { margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
