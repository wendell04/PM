/**
 * Order Status Badge - Reusable component
 * Used in orders-new module
 */

const ORDER_STATUS_CONFIG = {
  pending_payment: {
    label: 'Pending Payment',
    bg: 'rgba(245,158,11,0.12)',
    color: '#f59e0b',
    border: 'rgba(245,158,11,0.25)',
  },
  processing: {
    label: 'Processing',
    bg: 'rgba(59,130,246,0.12)',
    color: '#3b82f6',
    border: 'rgba(59,130,246,0.25)',
  },
  quality_check: {
    label: 'Quality Check',
    bg: 'rgba(139,92,246,0.12)',
    color: '#8b5cf6',
    border: 'rgba(139,92,246,0.25)',
  },
  ready_for_delivery: {
    label: 'Ready for Delivery',
    bg: 'rgba(34,197,94,0.12)',
    color: '#22c55e',
    border: 'rgba(34,197,94,0.25)',
  },
  awaiting_payment: {
    label: 'Awaiting Final Payment',
    bg: 'rgba(245,158,11,0.12)',
    color: '#f59e0b',
    border: 'rgba(245,158,11,0.25)',
  },
  delivered: {
    label: 'Delivered',
    bg: 'rgba(107,114,128,0.12)',
    color: '#9ca3af',
    border: 'rgba(107,114,128,0.25)',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    border: 'rgba(239,68,68,0.25)',
  },
};

const JO_STATUS_CONFIG = {
  queued: {
    label: 'Queued',
    bg: 'rgba(245,158,11,0.12)',
    color: '#f59e0b',
    border: 'rgba(245,158,11,0.25)',
  },
  in_progress: {
    label: 'In Progress',
    bg: 'rgba(59,130,246,0.12)',
    color: '#3b82f6',
    border: 'rgba(59,130,246,0.25)',
  },
  qc_pending: {
    label: 'QC Pending',
    bg: 'rgba(139,92,246,0.12)',
    color: '#8b5cf6',
    border: 'rgba(139,92,246,0.25)',
  },
  qc_passed: {
    label: 'QC Passed',
    bg: 'rgba(34,197,94,0.12)',
    color: '#22c55e',
    border: 'rgba(34,197,94,0.25)',
  },
  qc_failed: {
    label: 'QC Failed',
    bg: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    border: 'rgba(239,68,68,0.25)',
  },
  completed: {
    label: 'Completed',
    bg: 'rgba(107,114,128,0.12)',
    color: '#9ca3af',
    border: 'rgba(107,114,128,0.25)',
  },
};

export function OrderStatusBadge({ status, size = 'md' }) {
  const config = ORDER_STATUS_CONFIG[status] || ORDER_STATUS_CONFIG.processing;
  const sizes = {
    sm: { padding: '0.15rem 0.5rem', fontSize: '0.65rem' },
    md: { padding: '0.25rem 0.75rem', fontSize: '0.75rem' },
    lg: { padding: '0.375rem 1rem', fontSize: '0.875rem' },
  };
  const sizeStyle = sizes[size] || sizes.md;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: sizeStyle.padding,
        borderRadius: '999px',
        fontSize: sizeStyle.fontSize,
        fontWeight: 700,
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        whiteSpace: 'nowrap',
        textTransform: 'capitalize',
      }}
    >
      {config.label}
    </span>
  );
}

export function JOStatusBadge({ status, size = 'md' }) {
  const config = JO_STATUS_CONFIG[status] || JO_STATUS_CONFIG.queued;
  const sizes = {
    sm: { padding: '0.15rem 0.5rem', fontSize: '0.65rem' },
    md: { padding: '0.25rem 0.75rem', fontSize: '0.75rem' },
    lg: { padding: '0.375rem 1rem', fontSize: '0.875rem' },
  };
  const sizeStyle = sizes[size] || sizes.md;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: sizeStyle.padding,
        borderRadius: '999px',
        fontSize: sizeStyle.fontSize,
        fontWeight: 700,
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        whiteSpace: 'nowrap',
        textTransform: 'capitalize',
      }}
    >
      {config.label}
    </span>
  );
}

export function PaymentStatusBadge({ paymentStatus, size = 'md' }) {
  const configs = {
    unpaid: {
      label: 'Unpaid',
      bg: 'rgba(239,68,68,0.12)',
      color: '#ef4444',
      border: 'rgba(239,68,68,0.25)',
    },
    partial: {
      label: 'Partial',
      bg: 'rgba(245,158,11,0.12)',
      color: '#f59e0b',
      border: 'rgba(245,158,11,0.25)',
    },
    paid: {
      label: 'Paid',
      bg: 'rgba(34,197,94,0.12)',
      color: '#22c55e',
      border: 'rgba(34,197,94,0.25)',
    },
  };
  const config = configs[paymentStatus] || configs.unpaid;
  const sizes = {
    sm: { padding: '0.15rem 0.5rem', fontSize: '0.65rem' },
    md: { padding: '0.25rem 0.75rem', fontSize: '0.75rem' },
    lg: { padding: '0.375rem 1rem', fontSize: '0.875rem' },
  };
  const sizeStyle = sizes[size] || sizes.md;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: sizeStyle.padding,
        borderRadius: '999px',
        fontSize: sizeStyle.fontSize,
        fontWeight: 700,
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}
