"use client";

/**
 * Customer Tracking View
 * What the customer sees when tracking their order status
 */

import { OrderStatusBadge } from '@/app/dashboard/business/orders-preview/components/StatusBadges';

function formatDate(dateStr) {
  if (!dateStr) return '???';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPeso(amount) {
  if (amount == null) return '???';
  return `P${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Order flow steps for visual timeline
const ORDER_STEPS = [
  { key: 'pending_review', label: 'Order Placed',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'confirmed',      label: 'Confirmed',       icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'processing',     label: 'In Production',   icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { key: 'ready',          label: 'Ready',           icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
  { key: 'delivered',      label: 'Delivered',       icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
];

export default function CustomerTrackingView({ order }) {
  if (!order) return null;

  const currentStatus = order.status || 'pending_review';
  const currentStepIndex = ORDER_STEPS.findIndex((s) => s.key === currentStatus);
  const effectiveStepIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Order Tracking
        </div>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>
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
              background: 'var(--border)',
              borderRadius: '2px',
            }}
          >
            {/* Active portion */}
            <div
              style={{
                height: '100%',
                width: `${effectiveStepIndex >= ORDER_STEPS.length - 1 ? 100 : (effectiveStepIndex / (ORDER_STEPS.length - 1)) * 100}%`,
                background: 'var(--gold)',
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
                    background: isCompleted ? 'var(--gold)' : 'var(--border)',
                    color: isCompleted ? 'var(--black)' : 'var(--gray)',
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
                <div style={{ fontSize: '0.7rem', color: isCompleted ? 'var(--white)' : 'var(--gray)', fontWeight: isCurrent ? 700 : 500 }}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pricing Card */}
      <div
        style={{
          background: 'var(--dark2)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '12px' }}>
          Order Summary
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Estimated Price</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'monospace' }}>
              {order.suggestedPrice != null ? formatPeso(order.suggestedPrice) : 'Pending'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Final Price</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace' }}>
              {order.finalPrice != null ? formatPeso(order.finalPrice) : 'To be confirmed'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Estimated Completion</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'monospace' }}>
              {order.eta ? formatDate(order.eta) : '—'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Payment Status</span>
            {(() => {
              const BADGE = {
                unpaid:  { bg: 'rgba(196,30,58,0.15)',  color: 'var(--red)',   border: 'rgba(196,30,58,0.3)',  label: 'Unpaid' },
                partial: { bg: 'var(--gold-subtle)',     color: 'var(--gold)',  border: 'rgba(212,168,67,0.3)', label: 'Partially Paid' },
                paid:    { bg: 'rgba(74,222,128,0.15)', color: 'var(--green)', border: 'rgba(74,222,128,0.3)', label: 'Paid' },
              };
              const b = BADGE[order.paymentStatus];
              if (!b) return <span style={{ color: 'var(--gray)' }}>?</span>;
              return (
                <span style={{
                  background:   b.bg,
                  color:        b.color,
                  border:       `1px solid ${b.border}`,
                  borderRadius: '999px',
                  padding:      '4px 10px',
                  fontSize:     '0.75rem',
                  fontWeight:   700,
                }}>
                  {b.label}
                </span>
              );
            })()}
          </div>
        </div>

        {order.finalPrice == null && currentStatus === 'pending_review' && (
          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.5 }}>
            Final price will be set once our team reviews your order.
          </div>
        )}
      </div>

      {/* Info Card */}
      <div
        style={{
          background: 'var(--gold-subtle)',
          borderRadius: '12px',
          border: '1px solid rgba(212,168,67,0.2)',
          padding: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '0.25rem' }}>
              What happens next?
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--white)', lineHeight: 1.5 }}>
              {currentStatus === 'pending_review' && 'Your order is under review. Once confirmed by our team, production will begin.'}
              {currentStatus === 'confirmed' && 'Your order has been confirmed. We are preparing to start production shortly.'}
              {currentStatus === 'processing' && 'Your order is currently in production. We will notify you when it is ready.'}
              {currentStatus === 'ready' && 'Your order is ready! Please coordinate pickup or await delivery.'}
              {currentStatus === 'delivered' && 'Your order has been delivered. Thank you for choosing PersonalizeMe Prints!'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
