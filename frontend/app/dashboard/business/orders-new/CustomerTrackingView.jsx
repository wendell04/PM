"use client";

/**
 * Customer Tracking View
 * What the customer sees when tracking their order status
 */

import { OrderStatusBadge } from './OrderStatusBadge';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPeso(amount) {
  if (amount == null || amount === 0) return '—';
  return `P${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Order flow steps for visual timeline
const ORDER_STEPS = [
  { key: 'pending_payment', label: 'Order Placed', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'processing', label: 'In Production', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { key: 'quality_check', label: 'Quality Check', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'ready_for_delivery', label: 'Ready for Delivery', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
  { key: 'delivered', label: 'Delivered', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
];

export default function CustomerTrackingView({ order }) {
  if (!order) return null;

  const currentStatus = order.status || order.orderStatus || 'pending_payment';
  const currentStepIndex = ORDER_STEPS.findIndex((s) => s.key === currentStatus);
  const effectiveStepIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

  const total = order.totalAmount || order.total || 0;
  const paid = order.totalPaid || order.downPayment || 0;
  const balance = total - paid;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Order Tracking
        </div>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#E5E2E1' }}>
          Order #{order.id || order._id}
        </h2>
        <div style={{ marginTop: '0.5rem' }}>
          <OrderStatusBadge status={currentStatus} size="lg" />
        </div>
      </div>

      {/* Timeline */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          {/* Connecting Line */}
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '40px',
              right: '40px',
              height: '3px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '2px',
            }}
          >
            {/* Active portion */}
            <div
              style={{
                height: '100%',
                width: `${effectiveStepIndex >= ORDER_STEPS.length - 1 ? 100 : (effectiveStepIndex / (ORDER_STEPS.length - 1)) * 100}%`,
                background: '#D4A843',
                borderRadius: '2px',
                transition: 'width 0.5s',
              }}
            />
          </div>

          {ORDER_STEPS.map((step, index) => {
            const isCompleted = index <= effectiveStepIndex;
            const isCurrent = index === effectiveStepIndex;

            return (
              <div key={step.key} style={{ flex: 1, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: isCompleted ? '#D4A843' : 'rgba(255,255,255,0.08)',
                    color: isCompleted ? '#000' : '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 0.5rem',
                    border: isCurrent ? '3px solid rgba(212,168,67,0.3)' : 'none',
                    boxShadow: isCurrent ? '0 0 0 4px rgba(212,168,67,0.1)' : 'none',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d={step.icon} />
                  </svg>
                </div>
                <div style={{ fontSize: '0.7rem', color: isCompleted ? '#E5E2E1' : '#6b7280', fontWeight: isCurrent ? 700 : 500 }}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Order Details Card */}
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
          Order Details
        </h3>

        {/* Items */}
        <div style={{ marginBottom: '1rem' }}>
          {(order.items || order.orderItems || []).map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: idx < (order.items || order.orderItems || []).length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}
            >
              <div>
                <div style={{ fontSize: '0.85rem', color: '#E5E2E1', fontWeight: 600 }}>
                  {item.productName || item.name || '—'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                  Qty: {item.qty || item.quantity || 1}
                </div>
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>
                {formatPeso(item.price || item.unitPrice || item.total)}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Total</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace' }}>
              {formatPeso(total)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Paid</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>
              {formatPeso(paid)}
            </span>
          </div>
          {balance > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Balance Due</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>
                {formatPeso(balance)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div
        style={{
          background: 'rgba(212,168,67,0.08)',
          borderRadius: '12px',
          border: '1px solid rgba(212,168,67,0.2)',
          padding: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#D4A843', marginBottom: '0.25rem' }}>
              What happens next?
            </div>
            <div style={{ fontSize: '0.75rem', color: '#E5E2E1', lineHeight: 1.5 }}>
              {currentStatus === 'pending_payment' && 'Please complete your payment to start production. Once paid, your order will move to production.'}
              {currentStatus === 'processing' && 'Your order is being produced. We will notify you when it passes quality check.'}
              {currentStatus === 'quality_check' && 'Your order is undergoing final quality inspection. Almost ready!'}
              {currentStatus === 'ready_for_delivery' && 'Your order is ready! We will arrange delivery soon.'}
              {currentStatus === 'delivered' && 'Your order has been delivered. Thank you for your purchase!'}
              {currentStatus === 'awaiting_payment' && 'Your order is ready but waiting for final payment. Please complete your balance to proceed with delivery.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
