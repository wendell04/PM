'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useCart } from '@/context/CartContext';
import { orderNo } from '@/lib/orderNumber';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';


// Payment rows were labelled by POSITION - first is a "Downpayment", the rest are "Balance payment".
// On a request-design order the first payment is the DESIGN FEE, so the receipt called the design fee
// a downpayment and the actual downpayment a balance payment. Read the note the payment carries
// instead; it says what the payment was for.
function paymentLabel(pmt, index, total) {
  // Payments recorded from now on carry what they were FOR. Older rows have only the gateway
  // reference in their note, so they still fall through to the guesses below.
  const byType = { design_fee: 'Design fee', downpayment: 'Downpayment', balance: 'Balance payment', payment: 'Payment' };
  if (pmt?.type && byType[pmt.type]) return byType[pmt.type];

  const note = String(pmt?.note ?? '').toLowerCase();
  if (note.includes('design fee') || note.includes('design_fee')) return 'Design fee';
  if (note.includes('downpayment') || note.includes('deposit'))   return 'Downpayment';
  if (note.includes('balance'))                                   return 'Balance payment';
  if (total <= 1) return 'Payment';
  return index === 0 ? 'Downpayment' : 'Balance payment';
}

export default function PaymentSuccessPage() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const { token }     = useAuth();
  const { clearCart, bulkRemove } = useCart();
  const orderId       = searchParams.get('id');
  const method        = searchParams.get('method'); // 'cod' or null (online)
  const isCod         = method === 'cod';
  const isOrderRequest = searchParams.get('type') === 'order_request';
  // Re-opening the receipt later (from My Orders) - just show it; no payment verify/poll/redirect.
  const viewOnly      = searchParams.get('view') === '1';
  // PayMongo hands this back on the redirect and it names THIS payment. It was on screen the whole
  // time and never used, so a second payment on the same order re-verified the first intent and the
  // new one was never recorded.
  const intentId      = searchParams.get('payment_intent_id');

  useEffect(() => {
    sessionStorage.removeItem('checkout_payload');
    sessionStorage.removeItem('pending_payment_order_id');
    // Cart is cleared only once the order is confirmed settled (see fetchOrder), not on mount —
    // otherwise a payment that fails verification would have already emptied the cart.
  }, [orderId]);

  const [order,        setOrder]        = useState(null);
  const [mounted,      setMounted]      = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [verifying,    setVerifying]    = useState(!isCod && !isOrderRequest && !viewOnly);
  // Confirmation is taking longer than the poll window. The money may well be through - we simply
  // cannot say yet, and saying the wrong thing here is worse than saying nothing.
  const [unconfirmed,  setUnconfirmed]  = useState(false);

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

    // What the gateway last told us about THIS payment. Without it the page could only count
    // failed polls, and a slow confirmation was indistinguishable from a real failure.
    let lastVerify = null;

    const pushVerify = async () => {
      try {
        const r = await fetchWithTimeout(`${API_URL}/api/payment/verify-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId, ...(intentId ? { intentId } : {}) }),
        }, 10000);
        lastVerify = await r.json().catch(() => null);
      } catch {}
    };

    const fetchOrder = async (attempt = 0) => {
      try {
        // On online payment flows, push a verify-intent call before the first two polls
        // so the order gets marked paid in the DB even without a webhook (local dev).
        if (!isCod && !isOrderRequest && !viewOnly && attempt <= 1) {
          await pushVerify();
        }

        const res = await fetchWithTimeout(endpoint, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        }, 10000);
        if (!res.ok) throw new Error('Could not load order details.');
        const data = await res.json();
        const fetched = data.data ?? data;
        setOrder(fetched);

        // Re-opening the receipt later: just render it, never poll or redirect to "failed".
        if (viewOnly) {
          setVerifying(false);
          setLoading(false);
          return;
        }

        // `pendingPaymentType` is set the moment a pay link is created and cleared only when that
        // payment is confirmed, so while it is present THIS payment has not landed yet - whatever the
        // order was paid previously. Without that clause a returning customer looked settled instantly,
        // because an earlier design fee had already set designFeePaid, and the page stopped waiting for
        // the deposit it was actually there to confirm.
        const stillPending = !!fetched.pendingPaymentType;
        // "partial" was already true from the deposit, so on the FINAL payment this said settled on
        // the very first poll and the page rendered the state from one payment ago. When we know
        // which intent we are confirming, the only proof it landed is that intent appearing in the
        // history - the order's general payment state cannot tell one payment from another.
        const landed = intentId
          ? (fetched.paymentHistory ?? []).some(pmt => String(pmt?.note ?? '').includes(intentId))
          : true;
        const isSettled = !stillPending && landed && (
          fetched.paymentStatus === 'paid' || fetched.paymentStatus === 'partial' || fetched.designFeePaid === true
        );
        if (!isCod && !isOrderRequest && !isSettled && attempt < 6) {
          setTimeout(() => fetchOrder(attempt + 1), 2000);
        } else if (!isCod && !isOrderRequest && !isSettled) {
          // Only call it failed when the GATEWAY says so. Running out of polls means we could not
          // confirm in time, which is not the same thing - and telling someone their payment failed
          // when the money has actually left their account is the worst thing this page can do.
          const gwStatus = String(lastVerify?.data?.paymentStatus ?? '');
          const reallyFailed = ['failed', 'cancelled', 'expired', 'awaiting_payment_method'].includes(gwStatus);
          if (!reallyFailed) {
            setUnconfirmed(true);
            setVerifying(false);
            setLoading(false);
            return;
          }
          // Payment failed/expired - clear the orphan order then redirect to failed page
          if (token && orderId) {
            fetch(`${API_URL}/api/payment/cancel-pending/${orderId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            }).catch(() => {});
          }
          router.replace(`/shop/payment-failed?id=${orderId}`);
        } else {
          // Only the lines that were actually ordered. A cart can hold items the customer
          // deliberately left unticked, and clearing everything deleted them.
          let ordered = [];
          try { ordered = JSON.parse(sessionStorage.getItem('checkout_line_ids') || '[]'); } catch { ordered = []; }
          if (Array.isArray(ordered) && ordered.length) bulkRemove(ordered); else clearCart();
          sessionStorage.removeItem('checkout_line_ids');
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

  if (unconfirmed) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(212,168,67,0.1)', border: '2px solid rgba(212,168,67,0.4)' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 10px' }}>Still confirming your payment</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--gray)', lineHeight: 1.6, margin: '0 0 20px' }}>
            Your payment may already be through - it is just taking longer than usual to confirm.
            Do not pay again. Check My Orders in a moment, and message us if it has not updated.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => window.location.reload()}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#d4a843', color: '#000', fontWeight: 700, cursor: 'pointer' }}>
              Check again
            </button>
            <button onClick={() => router.push('/shop/orders-history')}
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--gray)', cursor: 'pointer' }}>
              My Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
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
          {verifying ? (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
              </path>
            </svg>
          ) : (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round"
              strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>

        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'var(--white)',
          marginBottom: '8px',
        }}>
          {verifying ? 'Confirming your payment…' : isCod ? 'Order Placed!' : order?.paymentStatus === 'partial' ? 'Downpayment Received!' : (order?.designFeePaid && order?.paymentStatus !== 'paid') ? 'Design Fee Paid!' : 'Payment Successful'}
        </h1>

        <p style={{
          color: 'var(--gray)',
          fontSize: '0.95rem',
          marginBottom: '32px',
          lineHeight: 1.6,
        }}>
          {verifying
            ? "Please wait a moment while we confirm your payment with the provider. Don't close this page."
            : isCod
            ? "Thank you for your order. Our team will contact you to confirm delivery and payment details."
            : order?.paymentStatus === 'partial'
              ? `Your downpayment of ₱${Number(order?.downPayment ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} has been received. The remaining balance of ₱${Number(order?.balance ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} is due before delivery.`
              : (order?.designFeePaid && order?.paymentStatus !== 'paid')
                ? "Your design fee has been received. Our designer will send you a proof via chat within 24–48 hours. The remaining order balance is due after you approve the design."
                : "Thank you for your order. We've received your payment and will begin processing shortly."}
        </p>

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
          <div id="pmp-receipt" style={{
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
                {orderNo(order)}
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

            {/* Design fee - charged once for the order (was missing, so the totals looked short). */}
            {Number(order.designFee) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Design fee</span>
                <span style={{ color: 'var(--white)', fontSize: '0.82rem' }}>
                  ₱{Number(order.designFee).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Rush fee */}
            {Number(order.rushFee) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Rush fee</span>
                <span style={{ color: 'var(--white)', fontSize: '0.82rem' }}>
                  ₱{Number(order.rushFee).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Shipping */}
            {/* The receipt hid the shipping row entirely at zero, so a courier-booked order looked
                like delivery was included in what was just paid. It is not - the rider collects. */}
            {!(order.shippingFee > 0) && order.shippingMode === 'courier_booked' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Shipping</span>
                <span style={{ color: '#d4a843', fontSize: '0.82rem' }}>Paid to the rider on delivery</span>
              </div>
            )}
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
              {order.paymentStatus === 'partial' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.88rem' }}>Downpayment Paid</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.95rem' }}>
                      ₱{Number(order.downPayment ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Remaining Balance</span>
                    <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>
                      ₱{Number(order.balance ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Payment Status</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>
                      Downpayment Paid · Balance Due
                    </span>
                  </div>
                </>
              ) : order.designFeePaid && order.paymentStatus !== 'paid' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.88rem' }}>Design Fee Paid</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.95rem' }}>
                      ₱{Number(order.designFeePaidAmount ?? order.designFee ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Order Total (due after approval)</span>
                    <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>
                      ₱{Number(order.totalAmount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gray)', fontSize: '0.82rem' }}>Payment Status</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>
                      Design Fee Paid · Order Unpaid
                    </span>
                  </div>
                </>
              ) : (
                <>
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
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isCod ? 'var(--gold)' : '#4ade80' }}>
                      {isCod ? 'Cash on Delivery' : 'Paid'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Payment history - so a downpaid-then-settled order shows BOTH payments on the ONE
                receipt (no need for two separate receipts). */}
            {Array.isArray(order.paymentHistory) && order.paymentHistory.length > 0 && (
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--border)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>Payments</div>
                {order.paymentHistory.map((p, i) => {
                  const when = p.recordedAt ?? p.date ?? p.at ?? p.paidAt;
                  const label = paymentLabel(p, i, order.paymentHistory.length);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--gray)' }}>
                        {label}{when ? ` · ${new Date(when).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}{p.method ? ` · ${String(p.method).toUpperCase()}` : ''}
                      </span>
                      <span style={{ color: 'var(--white)', fontWeight: 600 }}>₱{Number(p.amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Professional invoice-style receipt - portaled to <body> so print can hide everything else
            (no leftover blank page). Hidden on screen, shown only when printing. */}
        {order && mounted && createPortal((() => {
          const rItems = order.items ?? [];
          const rSubtotal = rItems.reduce((s, i) => s + Number(i.lineTotal ?? ((i.unitPrice ?? 0) * (i.qty ?? 1))), 0);
          const rNum = String(order._id ?? order.id ?? '').slice(-8).toUpperCase();
          const rName = order.userSnapshot?.name || 'Customer';
          const rDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
          const a = order.deliveryAddress || {};
          const rAddr = [a.house_number, a.street, a.subdivision, a.barangay, a.city, a.province, a.zip].filter(Boolean).join(', ');
          const rPhone = a.phone || order.userSnapshot?.phone || '';
          const rPayments = order.paymentHistory ?? [];
          const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          // Only paymentStatus can say an order is settled. `balance` sits at 0 before the goods have
          // been billed at all, which is exactly the state a request-design order is in right after
          // the design fee clears - and reading that as paid printed a receipt claiming a P2,157.89
          // order was settled by P100.
          const receiptPaid = (order.paymentHistory ?? []).reduce((t, x) => t + (Number(x.amount) || 0), 0);
          const settled     = order.paymentStatus === 'paid';
          const receiptOwed = Math.max(0, Number(order.totalAmount ?? order.finalPrice ?? 0) - receiptPaid);
          const GOLD = '#c8922e';
          const th = { padding: '9px 12px', fontWeight: 700 };
          const tot = (label, val, strong) => (
            <tr><td style={{ textAlign: 'right', padding: strong ? '6px 12px 2px' : '2px 12px', fontWeight: strong ? 800 : 700, fontSize: strong ? 13.5 : 12.5, color: strong ? '#111' : '#333' }}>{label}</td>
                <td style={{ textAlign: 'right', padding: strong ? '6px 0 2px' : '2px 0', fontWeight: strong ? 800 : 400, fontSize: strong ? 13.5 : 12.5, color: strong ? '#111' : '#333' }}>{val}</td></tr>
          );
          return (
            <div id="pmp-print-receipt" style={{ textAlign: 'left', color: '#111', fontFamily: 'Arial, Helvetica, sans-serif' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: 1, color: '#111' }}>Receipt</div>
                <div style={{ textAlign: 'right', fontSize: 11.5, color: '#555', lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 800, color: GOLD, fontSize: 15 }}>Personalize Me Prints</div>
                  <div>Custom Printing Services</div>
                  <div>personalizemeprints.com</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 40, fontSize: 12, color: '#333', borderTop: '2px solid #111', borderBottom: '1px solid #ddd', padding: '10px 0', marginBottom: 20 }}>
                <div><div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order No.</div><div style={{ fontWeight: 700, marginTop: 2 }}>{orderNo(order)}</div></div>
                <div><div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Date</div><div style={{ fontWeight: 700, marginTop: 2 }}>{rDate || '-'}</div></div>
                <div><div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</div><div style={{ fontWeight: 700, marginTop: 2, color: settled ? '#166534' : '#b45309' }}>{settled ? 'Fully Paid' : receiptOwed > 0 && Number(order.balance) > 0 ? 'Downpayment Paid' : 'Design Fee Paid - Order Unpaid'}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 40, marginBottom: 22 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Bill To</div>
                  <div style={{ fontSize: 12, color: '#333', lineHeight: 1.6 }}>{rName}{order.userSnapshot?.email ? <><br />{order.userSnapshot.email}</> : null}{rPhone ? <><br />{rPhone}</> : null}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Ship To</div>
                  <div style={{ fontSize: 12, color: '#333', lineHeight: 1.6 }}>{rName}<br />{rAddr || '-'}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Summary</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 10 }}>
                <thead><tr style={{ background: GOLD, color: '#fff' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Product</th><th style={{ ...th, textAlign: 'center' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Price</th>
                </tr></thead>
                <tbody>
                  {rItems.map((i, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '9px 12px', color: '#222' }}>{(i.productName || i.product_name || 'Item')}{i.variantName ? ` - ${i.variantName}` : ''}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: '#222' }}>{i.qty ?? i.quantity ?? 1}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#222' }}>{peso(i.lineTotal ?? ((i.unitPrice ?? 0) * (i.qty ?? 1)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <table><tbody>
                  {tot('Sub-Total:', peso(rSubtotal))}
                  {Number(order.designFee) > 0 && tot('Design fee:', peso(order.designFee))}
                  {Number(order.rushFee) > 0 && tot('Rush fee:', peso(order.rushFee))}
                  {Number(order.shippingFee) > 0 && tot('Delivery:', peso(order.shippingFee))}
                  {tot('Total:', peso(order.totalAmount ?? order.finalPrice), true)}
                </tbody></table>
              </div>
              {rPayments.length > 0 && (
                <div style={{ borderTop: '1px solid #ddd', marginTop: 16, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Payments</div>
                  {rPayments.map((p, idx) => {
                    const when = p.recordedAt ?? p.date ?? p.at ?? p.paidAt;
                    const label = paymentLabel(p, idx, rPayments.length);
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#333', marginBottom: 3 }}>
                        <span>{label}{when ? ` - ${new Date(when).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}{p.method ? ` - ${String(p.method).toUpperCase()}` : ''}</span>
                        <span style={{ fontWeight: 700 }}>{peso(p.amount)}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 6, fontWeight: 800, color: settled ? '#166534' : '#b45309' }}>
                    <span>{settled ? 'Fully Paid' : 'Still Due'}</span>
                    <span>{settled ? peso(order.totalAmount ?? order.finalPrice) : peso(receiptOwed)}</span>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 28, borderTop: '1px solid #eee', paddingTop: 12, fontSize: 10.5, color: '#777', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, color: '#555', marginBottom: 3, fontSize: 11 }}>Notes</div>
                Production starts once your design/proof is approved and the required payment clears. For any queries, reach us at personalizemeprints.com. Thank you for your order.<br />
                <span style={{ color: '#aaa' }}>&copy; {new Date().getFullYear()} Personalize Me Prints</span>
              </div>
            </div>
          );
        })(), document.body)}

        {/* On print: the receipt is a direct child of <body> (portaled), so we hide every OTHER body
            child (display:none removes their height -> no leftover blank page) and show the receipt. */}
        <style>{`
          #pmp-print-receipt { display: none; }
          @media print {
            body > *:not(#pmp-print-receipt) { display: none !important; }
            #pmp-print-receipt { display: block !important; width: 100%; padding: 6px 10px; background: #fff !important; color: #111 !important; text-align: left !important; }
            @page { margin: 12mm; }
          }
        `}</style>

        {/* Four equal buttons in one wrapping row gave the page no hierarchy - every action shouted
            as loudly as the rest and the row broke untidily. One primary act, a pair of secondaries
            under it, and the way out as a quiet link. */}
        {!verifying && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '10px', maxWidth: '420px', margin: '0 auto', width: '100%' }}>
            <Link
              href="/shop/orders-history"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '13px 20px', background: 'var(--gold)', color: 'var(--black)',
                borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none',
              }}
            >
              View my order
            </Link>

            <div style={{ display: 'flex', gap: '10px' }}>
              {order && (
                <button
                  onClick={() => window.print()}
                  style={{
                    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '10px 14px', background: 'transparent', color: 'var(--gold)',
                    border: '1px solid var(--gold)', borderRadius: '10px', fontWeight: 600,
                    fontSize: '0.85rem', cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Receipt
                </button>
              )}
              {/* A design order is a conversation, not a transaction - the revisions all happen here.
                  Offered as a button rather than a redirect: the customer has just paid and wants their
                  receipt, and a chat window opened over it is an interruption, not a service. The thread
                  is created on first use, so an order nobody has questions about leaves no empty thread. */}
              {/* Mixed carts store designType as 'upload', so keying on it hid the chat button from
                  exactly the orders that need it most - the ones with a design being drawn. */}
              {(order?.designType === 'request' || order?.designType === 'upload'
                || (order?.items ?? []).some(i => i?.designRequested || i?.designMode === 'request'
                    || i?.designUrl || i?.designFiles?.length || i?.isCustom)) && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('pmp_open_chat', { detail: { orderCard: {
                    orderId: String(order._id ?? order.id ?? ''),
                    orderNo: orderNo(order),
                    products: (order.items ?? []).map(i => i.productName ?? i.product_name).filter(Boolean).join(', '),
                    brief: order.designNotes || '',
                    body: 'Hi! I just placed this design order.',
                  } } }))}
                  style={{
                    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px 14px', background: 'transparent', color: 'var(--gold)',
                    border: '1px solid var(--gold)', borderRadius: '10px', fontWeight: 600,
                    fontSize: '0.85rem', cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                  Message designer
                </button>
              )}
            </div>

            <Link
              href="/shop"
              style={{
                textAlign: 'center', padding: '6px', color: 'var(--gray)',
                fontSize: '0.85rem', textDecoration: 'none',
              }}
            >
              Continue shopping
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
