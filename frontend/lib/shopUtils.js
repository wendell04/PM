// `tone` picks a theme-aware chip palette (--st-* in custom-styles.css): a light tint with
// DARK text in light mode, a translucent tint with BRIGHT text in dark mode. The old flat
// brand-gold chips read washed-out on light cards; these stay legible on both themes.
export const STATUS_MAP = {
  // Standard order statuses (OrderController)
  Pending:              { label: 'Pending',              tone: 'amber' },
  'In Production':      { label: 'In Production',        tone: 'blue' },
  'For QC':             { label: 'Quality Check',         tone: 'purple' },
  'For Delivery':       { label: 'For Delivery',         tone: 'blue' },
  Delivered:            { label: 'Delivered',            tone: 'green' },
  Returned:             { label: 'Returned',             tone: 'red' },
  Cancelled:            { label: 'Cancelled',            tone: 'red' },
  Refunded:             { label: 'Refunded',             tone: 'red' },
  // Job order statuses (JobOrderController)
  Processing:           { label: 'Processing',           tone: 'blue' },
  Paid:                 { label: 'Paid',                 tone: 'green' },
  Queued:               { label: 'Queued',               tone: 'amber' },
  'In Progress':        { label: 'In Progress',          tone: 'blue' },
  Completed:            { label: 'Completed',            tone: 'green' },
  QC_Pending:           { label: 'Quality Check',         tone: 'purple' },
  QC_Passed:            { label: 'QC Passed',             tone: 'green' },
  QC_Failed:            { label: 'QC Failed',             tone: 'red' },
  // Fulfillment stages that had no entry: ready = packed and waiting, for_delivery = with the courier.
  ready_for_delivery:   { label: 'Ready for Delivery',    tone: 'blue' },
  for_delivery:         { label: 'Out for Delivery',      tone: 'blue' },
  // designStatus values, which reach the same badge
  draft_ready:          { label: 'Proof Ready',           tone: 'amber' },
  rejected:             { label: 'Rejected',              tone: 'red' },
  approved:             { label: 'Approved',              tone: 'green' },
  downpayment_paid:     { label: 'Downpayment Paid',      tone: 'green' },
  // Custom order statuses
  pending_review:       { label: 'Under Review',         tone: 'gray' },
  awaiting_payment:     { label: 'Awaiting Payment',     tone: 'amber' },
  pending_design:       { label: 'Pending Design',       tone: 'gray' },
  proof_sent:           { label: 'Proof Sent',           tone: 'amber' },
  revision_requested:   { label: 'Revision Requested',   tone: 'orange' },
  design_approved:      { label: 'Design Approved',      tone: 'green' },
  awaiting_production:  { label: 'Awaiting Production',  tone: 'amber' },
  in_production:        { label: 'In Production',        tone: 'blue' },
  for_qc:               { label: 'Quality Check',         tone: 'purple' },
  ready_for_pickup:     { label: 'Ready for Pickup',     tone: 'blue' },
  shipped:              { label: 'Shipped',              tone: 'blue' },
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
  'ready_for_delivery':   'ready_for_delivery',
  'for_delivery':         'for_delivery',
  'ready_for_pickup':     'ready_for_pickup',
  'shipped':              'shipped',
};

export function normalizeOrderStatus(status) {
  if (!status) return status;
  const lower = status.toLowerCase();
  return STATUS_KEY_MAP[lower] ?? status;
}

/**
 * Status chip. Pass a `status` (mapped via STATUS_MAP) or an explicit `label`+`tone`
 * for things that aren't order statuses (e.g. quotes).
 *
 * Borderless - flat tint + dark text, matching the quote cards. This only reads correctly
 * on a pure-white card (--dark in light mode); on --dark2 (#f5f7fa) the grey tint (#f3f4f6)
 * is the same value as the card and the chip disappears.
 */
/**
 * Last resort for a status no map has heard of. Unmapped values used to reach the customer verbatim,
 * underscores and all ("ready_for_delivery"), so a new backend value now degrades to something
 * readable rather than leaking a database key onto the page.
 */
export function humanizeStatus(status) {
  if (!status) return '';
  return String(status)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bQc\b/g, 'QC');
}

export function StatusBadge({ status, label, tone }) {
  const key = normalizeOrderStatus(status);
  const s = STATUS_MAP[key] || { label: humanizeStatus(key), tone: 'gray' };
  // Deliberately simple, consistent scheme for the customer's order/quote cards: GREEN only when
  // delivered/completed, RED when cancelled/returned/refunded/declined, GREY for everything else
  // (no amber/blue/purple). Overrides the per-status tone + any explicit tone on purpose.
  const hay = `${status ?? ''} ${label ?? s.label ?? ''}`.toLowerCase();
  const t = /cancel|return|refund|declin/.test(hay) ? 'red'
    : /delivered|completed/.test(hay) ? 'green'
    : 'gray';
  return (
    <span style={{
      display: 'inline-block',
      background: `var(--st-${t}-bg)`,
      color: `var(--st-${t}-fg)`,
      border: 'none',
      borderRadius: '999px',
      padding: '3px 8px',
      fontSize: '0.68rem',
      fontWeight: 800,
      whiteSpace: 'nowrap',
    }}>
      {label ?? s.label}
    </span>
  );
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatTimestamp(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatPeso(n) {
  if (n == null) return '-';
  return `₱${Number(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
