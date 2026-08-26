// Human-friendly order reference derived from the order id. Display-only: the URL and all lookups
// still use the real _id (safe, no payment-redirect changes), but the customer/admin/receipt see a
// clean "ORD-37088462" instead of a raw MongoDB ObjectId.
export function orderNo(order) {
  const id = String(order?._id ?? order?.id ?? order?.orderNumber ?? order ?? '');
  return id ? `ORD-${id.slice(-8).toUpperCase()}` : 'ORD-';
}
