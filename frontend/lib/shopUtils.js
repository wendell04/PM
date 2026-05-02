export const STATUS_MAP = {
  // Standard order statuses (OrderController)
  Pending:              { label: 'Pending',              color: '#d4a843' },
  'In Production':      { label: 'In Production',        color: '#d4a843' },
  'For QC':             { label: 'For QC',               color: '#d4a843' },
  'For Delivery':       { label: 'For Delivery',         color: '#d4a843' },
  Delivered:            { label: 'Delivered',            color: '#22c55e' },
  Returned:             { label: 'Returned',             color: '#ef4444' },
  Cancelled:            { label: 'Cancelled',            color: '#ef4444' },
  Refunded:             { label: 'Refunded',             color: '#ef4444' },
  // Job order statuses (JobOrderController)
  Processing:           { label: 'Processing',           color: '#d4a843' },
  Paid:                 { label: 'Paid',                 color: '#22c55e' },
  Queued:               { label: 'Queued',               color: '#d4a843' },
  'In Progress':        { label: 'In Progress',          color: '#d4a843' },
  Completed:            { label: 'Completed',            color: '#22c55e' },
  // Custom order statuses
  pending_review:       { label: 'Under Review',         color: '#d4a843' },
  awaiting_payment:     { label: 'Awaiting Payment',     color: '#d4a843' },
  pending_design:       { label: 'Pending Design',       color: '#d4a843' },
  proof_sent:           { label: 'Proof Sent',           color: '#d4a843' },
  revision_requested:   { label: 'Revision Requested',   color: '#d4a843' },
  design_approved:      { label: 'Design Approved',      color: '#d4a843' },
  awaiting_production:  { label: 'Awaiting Production',  color: '#d4a843' },
  in_production:        { label: 'In Production',        color: '#d4a843' },
  for_qc:               { label: 'For QC',               color: '#d4a843' },
  ready_for_pickup:     { label: 'Ready for Pickup',     color: '#d4a843' },
  shipped:              { label: 'Shipped',              color: '#d4a843' },
};

const STATUS_KEY_MAP = {
  'pending':              'Pending',
  'processing':           'Processing',
  'paid':                 'Paid',
  'in production':        'In Production',
  'for qc':               'For QC',
  'for delivery':         'For Delivery',
  'delivered':            'Delivered',
  'cancelled':            'Cancelled',
  'returned':             'Returned',
  'refunded':             'Refunded',
  'queued':               'Queued',
  'in progress':          'In Progress',
  'completed':            'Completed',
  'pending_review':       'pending_review',
  'awaiting_payment':     'awaiting_payment',
  'pending_design':       'pending_design',
  'proof_sent':           'proof_sent',
  'revision_requested':   'revision_requested',
  'design_approved':      'design_approved',
  'awaiting_production':  'awaiting_production',
  'in_production':        'in_production',
  'for_qc':               'for_qc',
  'ready_for_pickup':     'ready_for_pickup',
  'shipped':              'shipped',
};

export function normalizeOrderStatus(status) {
  if (!status) return status;
  const lower = status.toLowerCase();
  return STATUS_KEY_MAP[lower] ?? status;
}

export function StatusBadge({ status }) {
  const key = normalizeOrderStatus(status);
  const s = STATUS_MAP[key] || { label: key ?? '—', color: '#9ca3af' };
  return (
    <span style={{
      display: 'inline-block',
      background: `${s.color}22`,
      color: s.color,
      borderRadius: '999px',
      padding: '0.25rem 0.75rem',
      fontSize: '0.75rem',
      fontWeight: 700,
    }}>
      {s.label}
    </span>
  );
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatTimestamp(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatPeso(n) {
  if (n == null) return '—';
  return `₱${Number(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
