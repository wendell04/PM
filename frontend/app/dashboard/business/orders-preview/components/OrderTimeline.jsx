/**
 * Order Timeline Component
 * Shows full audit trail of an order
 */

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
  pending_payment: '#f59e0b',
  payment_received: '#22c55e',
  processing: '#3b82f6',
  in_production: '#8b5cf6',
  quality_check: '#06b6d4',
  qc_passed: '#22c55e',
  qc_failed: '#ef4444',
  ready_for_delivery: '#22c55e',
  awaiting_payment: '#f59e0b',
  delivered: '#9ca3af',
  cancelled: '#ef4444',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrderTimeline({ events }) {
  if (!events || events.length === 0) {
    return <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', fontSize: '0.8rem' }}>No timeline events yet.</div>;
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
      {/* Vertical Line */}
      <div style={{ position: 'absolute', left: '6px', top: '8px', bottom: '8px', width: '2px', background: 'rgba(255,255,255,0.08)' }} />

      {events.map((event, idx) => {
        const color = STATUS_COLORS[event.status] || '#9ca3af';
        const label = STATUS_LABELS[event.status] || event.status;
        const isLast = idx === events.length - 1;

        return (
          <div key={idx} style={{ position: 'relative', paddingBottom: isLast ? 0 : '1rem' }}>
            {/* Dot */}
            <div style={{ position: 'absolute', left: '-1.5rem', top: '4px', width: '14px', height: '14px', borderRadius: '50%', background: color, border: '2px solid #1a1a1a', zIndex: 1 }} />

            {/* Content */}
            <div style={{ marginLeft: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E5E2E1' }}>{label}</span>
                <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>{formatDate(event.date)}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>By: {event.by}</div>
              {event.note && (
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem', fontStyle: 'italic' }}>{event.note}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
