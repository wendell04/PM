/**
 * Canonical order FULFILLMENT status — frontend source of truth (Phase 1).
 * Mirrors backend App\Support\OrderStatus. Stored values are lowercase codes; UI shows labels.
 * normalizeStatus() maps any legacy/mixed-case value (incl. old design states once kept in
 * orderStatus) to a canonical code, so old and new data render/filter correctly during rollout.
 */

export const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  IN_PRODUCTION: 'in_production',
  FOR_QC: 'for_qc',
  READY_FOR_DELIVERY: 'ready_for_delivery',
  FOR_DELIVERY: 'for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
};

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  processing: 'Processing',
  in_production: 'In Production',
  for_qc: 'For QC',
  ready_for_delivery: 'Ready for Delivery',
  for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

// Legacy custom design states once stored in orderStatus collapse to their fulfillment equivalent
// (the design detail belongs in designStatus).
const LEGACY_MAP = {
  awaiting_production: 'processing',
  awaiting_payment: 'pending',
  design_approved: 'pending',
  pending_design: 'pending',
  pending_review: 'pending',
  proof_sent: 'pending',
  revision_requested: 'pending',
  confirmed: 'processing',
  canceled: 'cancelled',
};

export function normalizeStatus(v) {
  if (!v) return v;
  const k = String(v).toLowerCase().trim().replace(/[\s-]+/g, '_');
  return LEGACY_MAP[k] || k;
}

export function statusLabel(v) {
  const k = normalizeStatus(v);
  return ORDER_STATUS_LABELS[k] || (k ? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');
}

// Badge palette aligned with the shared dashboard look (gold=active, green=done, red=negative).
const GOLD  = { color: 'var(--gold)',        bg: 'var(--gold-subtle)', border: 'rgba(212,168,67,0.3)' };
const GREEN = { color: 'var(--st-green-fg)', bg: 'var(--st-green-bg)',  border: 'rgba(34,197,94,0.3)'  };
const RED   = { color: 'var(--st-red-fg)',   bg: 'var(--st-red-bg)',    border: 'rgba(239,68,68,0.3)'  };

const COLORS = {
  pending: GOLD, processing: GOLD, in_production: GOLD, for_qc: GOLD,
  ready_for_delivery: GOLD, for_delivery: GOLD,
  delivered: GREEN, cancelled: RED, returned: RED,
};

export function statusColor(v) {
  return COLORS[normalizeStatus(v)] || GOLD;
}

// Allowed forward transitions (mirror of backend).
export const ORDER_STATUS_TRANSITIONS = {
  pending: ['processing', 'in_production', 'cancelled'],
  processing: ['in_production', 'cancelled'],
  in_production: ['for_qc', 'cancelled'],
  for_qc: ['ready_for_delivery', 'for_delivery', 'in_production'],
  ready_for_delivery: ['for_delivery', 'cancelled'],
  for_delivery: ['delivered', 'returned'],
  delivered: [],
  cancelled: [],
  returned: [],
};

export function canTransition(from, to) {
  return (ORDER_STATUS_TRANSITIONS[normalizeStatus(from)] || []).includes(normalizeStatus(to));
}

export function isTerminal(v) {
  return ['delivered', 'cancelled', 'returned'].includes(normalizeStatus(v));
}

// Tab/filter order for admin lists (prepend 'all' in the UI).
export const ORDER_STATUS_ORDER = [
  'pending', 'processing', 'in_production', 'for_qc',
  'ready_for_delivery', 'for_delivery', 'delivered', 'returned', 'cancelled',
];
