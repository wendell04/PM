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
  
  const GOLD  = { color: '#d4a843', bg: 'rgba(212,168,67,0.15)',  border: 'rgba(212,168,67,0.4)'  };
  const GREEN = { color: '#4ade80', bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.4)'  };
  const RED   = { color: '#f87171', bg: 'rgba(248,113,113,0.15)',border: 'rgba(248,113,113,0.4)' };

  const map = {
    // ── Admin statuses (PascalCase) ──────────────────────────────
    'Pending':             { ...GOLD,  label: 'Pending'            },
    'Confirmed':           { ...GOLD,  label: 'Confirmed'          },
    'Processing':          { ...GOLD,  label: 'Processing'         },
    'In Production':       { ...GOLD,  label: 'In Production'      },
    'For Delivery':        { ...GOLD,  label: 'For Delivery'       },
    'Delivered':           { ...GOLD,  label: 'Delivered'          },
    'Paid':                { ...GREEN, label: 'Paid'               },
    'Returned':            { ...RED,   label: 'Returned'           },
    'Cancelled':           { ...RED,   label: 'Cancelled'          },
    'Refunded':            { ...RED,   label: 'Refunded'           },
    // ── Customer / shop statuses (snake_case) ───────────────────
    'pending':             { ...GOLD,  label: 'Pending'            },
    'confirmed':           { ...GOLD,  label: 'Confirmed'          },
    'processing':          { ...GOLD,  label: 'Processing'         },
    'pending_review':      { ...GOLD,  label: 'Under Review'       },
    'awaiting_payment':    { ...GOLD,  label: 'Awaiting Payment'   },
    'pending_design':      { ...GOLD,  label: 'Pending Design'     },
    'proof_sent':          { ...GOLD,  label: 'Proof Sent'         },
    'revision_requested':  { ...GOLD,  label: 'Revision Requested' },
    'design_approved':     { ...GOLD,  label: 'Design Approved'    },
    'awaiting_production': { ...GOLD,  label: 'Awaiting Production'},
    'in_production':       { ...GOLD,  label: 'In Production'      },
    'for_qc':              { ...GOLD,  label: 'For QC'             },
    'ready_for_delivery':  { ...GOLD,  label: 'Ready for Delivery' },
    'for_delivery':        { ...GOLD,  label: 'For Delivery'       },
    'ready_for_pickup':    { ...GOLD,  label: 'Ready for Pickup'   },
    'ready':               { ...GOLD,  label: 'Ready'              },
    'shipped':             { ...GOLD,  label: 'Shipped'            },
    'delivered':           { ...GOLD,  label: 'Delivered'          },
    'paid':                { ...GREEN, label: 'Paid'               },
    'cancelled':           { ...RED,   label: 'Cancelled'          },
    'returned':            { ...RED,   label: 'Returned'           },
    'rejected':            { ...RED,   label: 'Rejected'           },
    'refunded':            { ...RED,   label: 'Refunded'           },
  };

  return map[status] || { label: status, ...GOLD };
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
