// Delivery risk, derived at read time - no cron, no scheduler, no stored flag.
// The promised delivery date used to pass silently: if nobody created a Job Order, the order simply
// sat there and the customer waited. This turns that silence into a visible badge wherever orders or
// job orders are listed, so the owner sees "this needs attention" before the promise is broken.

const DONE_STATES = ['delivered', 'cancelled', 'returned'];
const norm = (s) => String(s || '').toLowerCase().replace(/[\s-]+/g, '_');

// Calendar days from today to the target date (negative = already past).
function daysUntil(dateLike) {
  const target = new Date(dateLike);
  if (isNaN(target)) return null;
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(target); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

/**
 * Assess an order against its delivery promise.
 * @param {Object} order
 * @param {number} riskWindowDays how close to the promise counts as "at risk" (default 2)
 * @returns {null|{level:'overdue'|'at_risk', label:string, reason:string, days:number, color:string}}
 *          null when the order is finished, has no promised date, or is comfortably on track.
 */
export function deliveryRisk(order, riskWindowDays = 2) {
  if (!order) return null;
  const state = norm(order.orderStatus);
  if (DONE_STATES.includes(state)) return null;

  const promise = order.needByDate || order.estimatedDeliveryMax || null;
  if (!promise) return null;

  const days = daysUntil(promise);
  if (days === null) return null;

  // Production is only genuinely finished once the order is past QC.
  const produced = ['ready_for_delivery', 'for_delivery'].includes(state);
  const hasJO = !!(order.joId || (Array.isArray(order.joIds) && order.joIds.length > 0));
  const designBlocked = !!order.isCustomOrder && order.designStatus && order.designStatus !== 'approved';

  const reason = designBlocked ? 'Design not approved yet'
    : !hasJO ? 'No job order created yet'
    : !produced ? 'Still in production'
    : 'Not dispatched yet';

  if (days < 0) {
    return {
      level: 'overdue',
      label: `OVERDUE ${Math.abs(days)}d`,
      reason: `Past the promised delivery date. ${reason}.`,
      days,
      color: 'red',
    };
  }

  // On or near the promise while production has not finished = the promise is in danger.
  if (days <= riskWindowDays && !produced) {
    return {
      level: 'at_risk',
      label: days === 0 ? 'DUE TODAY' : `AT RISK ${days}d`,
      reason: `${reason}. Create the job order or move the delivery date.`,
      days,
      color: 'orange',
    };
  }

  return null;
}

/** Same assessment for a Job Order row, judged against its own production deadline. */
export function joRisk(jobOrder, riskWindowDays = 1) {
  if (!jobOrder) return null;
  if (['Completed', 'QC_Passed', 'Cancelled'].includes(jobOrder.joStatus)) return null;
  if (!jobOrder.targetCompletion) return null;

  const days = daysUntil(jobOrder.targetCompletion);
  if (days === null) return null;

  if (days < 0) return { level: 'overdue', label: `LATE ${Math.abs(days)}d`, days, color: 'red' };
  if (days <= riskWindowDays) return { level: 'at_risk', label: days === 0 ? 'DUE TODAY' : `${days}d LEFT`, days, color: 'orange' };
  return null;
}

/** Badge styling shared by both lists. */
export const RISK_STYLE = {
  red:    { background: 'var(--st-red-bg)',    color: 'var(--st-red-fg)',    border: '1px solid rgba(239,68,68,0.35)' },
  orange: { background: 'var(--st-orange-bg)', color: 'var(--st-orange-fg)', border: '1px solid rgba(251,146,60,0.35)' },
};
