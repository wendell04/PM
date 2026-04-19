/**
 * Status Badge Components
 * Used across the orders preview module
 */

import { memo } from 'react';

const ORDER_STATUS_CONFIG = {
  pending_payment: { label: 'Pending Payment', bg: 'rgba(245,158,11,0.15)', color: 'var(--color-text-warning)', border: 'rgba(245,158,11,0.3)' },
  processing: { label: 'Processing', bg: 'rgba(59,130,246,0.15)', color: 'var(--blue)', border: 'rgba(59,130,246,0.3)' },
  in_production: { label: 'In Production', bg: 'rgba(139,92,246,0.15)', color: 'var(--purple)', border: 'rgba(139,92,246,0.3)' },
  quality_check: { label: 'Quality Check', bg: 'rgba(6,182,212,0.15)', color: 'var(--cyan)', border: 'rgba(6,182,212,0.3)' },
  ready_for_delivery: { label: 'Ready for Delivery', bg: 'rgba(34,197,94,0.15)', color: 'var(--green)', border: 'rgba(34,197,94,0.3)' },
  awaiting_payment: { label: 'Awaiting Payment', bg: 'rgba(245,158,11,0.15)', color: 'var(--color-text-warning)', border: 'rgba(245,158,11,0.3)' },
  delivered: { label: 'Delivered', bg: 'rgba(107,114,128,0.15)', color: 'var(--gray)', border: 'rgba(107,114,128,0.3)' },
  cancelled: { label: 'Cancelled', bg: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: 'rgba(239,68,68,0.3)' },
};

const JO_STATUS_CONFIG = {
  queued: { label: 'Queued', bg: 'rgba(245,158,11,0.15)', color: 'var(--color-text-warning)', border: 'rgba(245,158,11,0.3)' },
  in_progress: { label: 'In Progress', bg: 'rgba(59,130,246,0.15)', color: 'var(--blue)', border: 'rgba(59,130,246,0.3)' },
  qc_pending: { label: 'QC Pending', bg: 'rgba(139,92,246,0.15)', color: 'var(--purple)', border: 'rgba(139,92,246,0.3)' },
  qc_passed: { label: 'QC Passed', bg: 'rgba(34,197,94,0.15)', color: 'var(--green)', border: 'rgba(34,197,94,0.3)' },
  qc_failed: { label: 'QC Failed', bg: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: 'rgba(239,68,68,0.3)' },
  completed: { label: 'Completed', bg: 'rgba(107,114,128,0.15)', color: 'var(--gray)', border: 'rgba(107,114,128,0.3)' },
};

const PAYMENT_CONFIG = {
  unpaid: { label: 'Unpaid', bg: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: 'rgba(239,68,68,0.3)' },
  partial: { label: 'Partial', bg: 'rgba(245,158,11,0.15)', color: 'var(--color-text-warning)', border: 'rgba(245,158,11,0.3)' },
  paid: { label: 'Paid', bg: 'rgba(34,197,94,0.15)', color: 'var(--green)', border: 'rgba(34,197,94,0.3)' },
};

function getPaymentStatus(paid, total) {
  if (paid <= 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}

function OrderStatusBadgeInner({ status, size = 'md' }) {
  const config = ORDER_STATUS_CONFIG[status] || ORDER_STATUS_CONFIG.processing;
  const sizes = { sm: { padding: '0.15rem 0.5rem', fontSize: '0.65rem' }, md: { padding: '0.25rem 0.75rem', fontSize: '0.75rem' }, lg: { padding: '0.375rem 1rem', fontSize: '0.875rem' } };
  const s = sizes[size] || sizes.md;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: s.padding, borderRadius: '999px', fontSize: s.fontSize, fontWeight: 700, background: config.bg, color: config.color, border: `1px solid ${config.border}`, whiteSpace: 'nowrap' }}>
      {config.label}
    </span>
  );
}

export const OrderStatusBadge = memo(OrderStatusBadgeInner);

function JOStatusBadgeInner({ status, size = 'md' }) {
  const config = JO_STATUS_CONFIG[status] || JO_STATUS_CONFIG.queued;
  const sizes = { sm: { padding: '0.15rem 0.5rem', fontSize: '0.65rem' }, md: { padding: '0.25rem 0.75rem', fontSize: '0.75rem' }, lg: { padding: '0.375rem 1rem', fontSize: '0.875rem' } };
  const s = sizes[size] || sizes.md;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: s.padding, borderRadius: '999px', fontSize: s.fontSize, fontWeight: 700, background: config.bg, color: config.color, border: `1px solid ${config.border}`, whiteSpace: 'nowrap' }}>
      {config.label}
    </span>
  );
}

export const JOStatusBadge = memo(JOStatusBadgeInner);

function PaymentBadgeInner({ paid, total, size = 'md' }) {
  const status = getPaymentStatus(paid, total);
  const config = PAYMENT_CONFIG[status];
  const sizes = { sm: { padding: '0.15rem 0.5rem', fontSize: '0.65rem' }, md: { padding: '0.25rem 0.75rem', fontSize: '0.75rem' }, lg: { padding: '0.375rem 1rem', fontSize: '0.875rem' } };
  const s = sizes[size] || sizes.md;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: s.padding, borderRadius: '999px', fontSize: s.fontSize, fontWeight: 700, background: config.bg, color: config.color, border: `1px solid ${config.border}`, whiteSpace: 'nowrap' }}>
      {config.label}
    </span>
  );
}

export const PaymentBadge = memo(PaymentBadgeInner);
