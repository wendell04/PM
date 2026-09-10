'use client';

import { orderNo } from '@/lib/orderNumber';
import { paymentLabel, receiptStatus } from '@/lib/paymentLabel';

/**
 * The printed receipt for one order.
 *
 * It lived inside payment-success, portaled to <body> and hidden until someone hit print - which
 * made the only way to see a receipt a URL that says "payment-success" on an order that is not
 * paid. It is a component now, so the same markup serves that portal and the /shop/receipt/[id]
 * page the confirmation email links to, and the two cannot say different things.
 *
 * Deliberately plain: black on white, no shop palette, sized for A4. It is a document.
 */
export default function OrderReceipt({ order }) {
  if (!order) return null;

  const rItems = order.items ?? [];
  const rSubtotal = rItems.reduce((s, i) => s + Number(i.lineTotal ?? ((i.unitPrice ?? 0) * (i.qty ?? 1))), 0);
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
  const statusText  = receiptStatus(order, order.paymentHistory ?? [], receiptPaid);
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
        <div><div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</div><div style={{ fontWeight: 700, marginTop: 2, color: settled ? '#166534' : '#b45309' }}>{statusText}</div></div>
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
}
