/**
 * Order Utility Helpers
 * Shared badge logic for order status and payment status
 */

/**
 * Get badge styles for order status
 * @param {string} status - Order status
 * @returns {{ label: string, color: string, bg: string, border: string }}
 */
export function getStatusBadge(status) {
  if (!status) return { label: '', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)' };
  
  const map = {
    'Pending':            { label: 'Pending',             color: '#facc15', bg: 'rgba(250,204,21,0.15)',  border: 'rgba(250,204,21,0.4)'  },
    'In Production':      { label: 'In Production',       color: '#6366f1', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)'  },
    'For Delivery':       { label: 'For Delivery',        color: '#f97316', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)'  },
    'Delivered':          { label: 'Delivered',           color: '#4ade80', bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.4)'  },
    'Returned':           { label: 'Returned',            color: '#f87171', bg: 'rgba(248,113,113,0.15)',border: 'rgba(248,113,113,0.4)' },
    'Cancelled':          { label: 'Cancelled',           color: '#f87171', bg: 'rgba(248,113,113,0.15)',border: 'rgba(248,113,113,0.4)' },
    'Refunded':           { label: 'Refunded',            color: '#9ca3af', bg: 'rgba(156,163,175,0.15)',border: 'rgba(156,163,175,0.4)' },
    'pending_review':     { label: 'Under Review',        color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  border: 'rgba(96,165,250,0.4)'  },
    'awaiting_payment':   { label: 'Awaiting Payment',    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)'  },
    'pending_design':     { label: 'Pending Design',      color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)'  },
    'proof_sent':         { label: 'Proof Sent',          color: '#a78bfa', bg: 'rgba(167,139,250,0.15)',border: 'rgba(167,139,250,0.4)' },
    'revision_requested': { label: 'Revision Requested',  color: '#f97316', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)'  },
    'design_approved':    { label: 'Design Approved',     color: '#34d399', bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.4)'  },
    'awaiting_production':{ label: 'Awaiting Production', color: '#6366f1', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)'  },
    'in_production':      { label: 'In Production',       color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)'  },
    'ready_for_pickup':   { label: 'Ready for Pickup',    color: '#4ade80', bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.4)'  },
    'shipped':            { label: 'Shipped',             color: '#a78bfa', bg: 'rgba(167,139,250,0.15)',border: 'rgba(167,139,250,0.4)' },
    'delivered':          { label: 'Delivered',           color: '#4ade80', bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.4)'  },
  };
  
  return map[status] || { label: status, color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)' };
}

/**
 * Get badge styles for payment status
 * @param {string} status - Payment status
 * @returns {{ label: string, color: string, bg: string, border: string }}
 */
export function getPaymentBadge(status) {
  if (!status) return { label: '', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)' };
  
  const map = {
    'unpaid': { label: 'Unpaid', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.4)' },
    'partially_paid': { label: 'Partially Paid', color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.4)' },
    'paid': { label: 'Paid', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.4)' },
    'refunded': { label: 'Refunded', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.4)' },
  };
  
  return map[status] || { label: status, color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)' };
}
