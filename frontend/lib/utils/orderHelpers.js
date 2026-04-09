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
    'Pending': { label: 'Pending', color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.4)' },
    'In Production': { label: 'In Production', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.4)' },
    'For Delivery': { label: 'For Delivery', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)' },
    'Delivered': { label: 'Delivered', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.4)' },
    'Returned': { label: 'Returned', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.4)' },
    'Cancelled': { label: 'Cancelled', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.4)' },
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
