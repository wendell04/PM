/**
 * Order Timeline Component
 * Shows full audit trail of an order
 */

import { memo } from 'react';

const STATUS_LABELS = {
  pending_payment: 'Order Placed',
  payment_received: 'Payment Received',
  processing: 'Processing',
  in_production: 'In Production',
  quality_check: 'Quality Check',
  qc_passed: 'QC Passed',
  qc_failed: 'QC Failed',
  ready_for_delivery: 'Ready for Delivery',
  awaiting_payment: 'Awaiting Payment',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS = {
  pending_payment: 'var(--color-text-warning)',
  payment_received: 'var(--green)',
  processing: 'var(--blue)',
  in_production: 'var(--purple)',
  quality_check: 'var(--cyan)',
  qc_passed: 'var(--green)',
  qc_failed: 'var(--red)',
  ready_for_delivery: 'var(--green)',
  awaiting_payment: 'var(--color-text-warning)',
  delivered: 'var(--gray)',
  cancelled: 'var(--red)',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function OrderTimeline({ events }) {
  if (!events || events.length === 0) {
    return <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--gray)', fontSize: '0.8rem' }}>No timeline events yet.</div>;
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
      {/* Vertical Line */}
      <div style={{ position: 'absolute', left: '6px', top: '8px', bottom: '8px', width: '2px', background: 'rgba(255,255,255,0.08)' }} />

      {events.map((event, idx) => {
        const color = STATUS_COLORS[event.status] || 'var(--gray)';
        const label = STATUS_LABELS[event.status] || event.status;
        const isLast = idx === events.length - 1;

        return (
          <div key={idx} style={{ position: 'relative', paddingBottom: isLast ? 0 : '1rem' }}>
            {/* Dot */}
            <div style={{ position: 'absolute', left: '-1.5rem', top: '4px', width: '14px', height: '14px', borderRadius: '50%', background: color, border: '2px solid var(--dark)', zIndex: 1 }} />

            {/* Content */}
            <div style={{ marginLeft: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)' }}>{label}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{formatDate(event.date)}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>By: {event.by}</div>
              {event.note && (
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem', fontStyle: 'italic' }}>{event.note}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(OrderTimeline);
