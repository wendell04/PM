/**
 * Shared utilities for shop-facing pages.
 * Import from here instead of defining locally in each page.
 */

export const STATUS_MAP = {
  // orderStatus values (orders-history / OrderController)
  Pending:          { label: 'Pending',        color: 'var(--warning, #d4a843)' },
  'In Production':  { label: 'In Production',  color: 'var(--info, #3b82f6)'    },
  'For Delivery':   { label: 'For Delivery',   color: '#a78bfa'                  },
  Delivered:        { label: 'Delivered',      color: 'var(--success, #22c55e)' },
  Returned:         { label: 'Returned',       color: '#f97316'                  },
  Cancelled:        { label: 'Cancelled',      color: 'var(--danger, #ef4444)'  },
  Refunded:         { label: 'Refunded',       color: 'var(--gray)'             },
  // joStatus values (JobOrderController)
  Queued:           { label: 'Queued',         color: 'var(--warning, #d4a843)' },
  'In Progress':    { label: 'In Progress',    color: 'var(--info, #3b82f6)'    },
  Completed:        { label: 'Completed',      color: 'var(--success, #22c55e)' },
  // order-request statuses (orders / OrderRequestController)
  pending_review:        { label: 'Pending Review',    color: 'var(--warning, #d4a843)' },
  confirmed:             { label: 'Confirmed',         color: 'var(--info, #3b82f6)'    },
  processing:            { label: 'Processing',        color: '#8b5cf6'                  },
  ready:                 { label: 'Ready',             color: 'var(--success, #22c55e)' },
  delivered:             { label: 'Delivered',         color: 'var(--success, #22c55e)' },
  cancelled:             { label: 'Cancelled',         color: 'var(--danger, #ef4444)'  },
  // custom order statuses
  pending_review:        { label: 'Under Review',      color: '#60a5fa'                  },
  awaiting_payment:      { label: 'Awaiting Payment',  color: '#f59e0b'                  },
  pending_design:        { label: 'Pending Design',    color: '#f59e0b'                  },
  proof_sent:            { label: 'Proof Sent',        color: '#a78bfa'                  },
  revision_requested:    { label: 'Revision Requested', color: '#f97316'                 },
  design_approved:       { label: 'Design Approved',   color: '#34d399'                  },
  awaiting_production:   { label: 'Awaiting Production', color: 'var(--info, #3b82f6)'  },
  in_production:         { label: 'In Production',     color: '#3b82f6'                  },
  ready_for_pickup:      { label: 'Ready for Pickup',  color: 'var(--success, #22c55e)' },
  shipped:               { label: 'Shipped',           color: '#a78bfa'                  },
};

const STATUS_KEY_MAP = {
  'pending':        'Pending',
  'in production':  'In Production',
  'for delivery':   'For Delivery',
  'delivered':      'Delivered',
  'cancelled':      'Cancelled',
  'returned':       'Returned',
  'refunded':       'Refunded',
  'queued':         'Queued',
  'in progress':    'In Progress',
  'completed':      'Completed',
  'pending_review':       'pending_review',
  'confirmed':            'confirmed',
  'processing':           'processing',
  'ready':                'ready',
  'pending_review':       'pending_review',
  'awaiting_payment':    'awaiting_payment',
  'pending_design':       'pending_design',
  'proof_sent':           'proof_sent',
  'revision_requested':   'revision_requested',
  'design_approved':      'design_approved',
  'awaiting_production':  'awaiting_production',
  'in_production':        'in_production',
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
  const s = STATUS_MAP[key] || { label: key ?? '—', color: 'var(--gray)' };
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

/**
 * Format a date string as "Jan 1, 2025"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/**
 * Format a date string as "Jan 1, 2025, 02:30 PM"
 */
export function formatTimestamp(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Format a number as Philippine Peso with 2 decimal places.
 * Returns '—' for null/undefined, not null, so it is always safe to render.
 */
export function formatPeso(n) {
  if (n == null) return '—';
  return `₱${Number(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
