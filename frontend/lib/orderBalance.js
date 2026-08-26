// What an order still owes, in one place.
//
// The stored `balance` field cannot answer this on its own: it is only written once a payment lands,
// so it sits at 0 on an order that has been billed nothing yet - which is exactly the state a
// request-design order is in after its design fee clears. Reading it there reported "Balance P0.00"
// beside a P2,157.89 total, and the owner, given no better number, typed the TOTAL into the amount
// box and overpaid by the design fee they had already collected.
//
// Payments received is the reliable figure, because every payment - the design fee included - is
// appended to paymentHistory.

export function paidSoFar(order) {
  const history = (order?.paymentHistory ?? []).reduce(
    (sum, p) => sum + (Number(p?.amount) || 0), 0,
  );
  // `downPayment` is the older single-figure record. Take whichever is larger so an order written
  // before payment history existed is not reported as unpaid.
  return Math.max(history, Number(order?.downPayment ?? 0) || 0);
}

export function orderTotal(order) {
  return Number(order?.totalAmount ?? order?.totalPrice ?? order?.finalPrice ?? 0) || 0;
}

/** Still owed. Never negative - an overpaid order owes nothing, it is owed TO. */
export function remainingDue(order) {
  return Math.max(0, Math.round((orderTotal(order) - paidSoFar(order)) * 100) / 100);
}

/** The deposit share of what is still owed, not of the gross total - the customer should not be
 *  asked for a percentage of money they have already handed over. */
export function depositDue(order) {
  const pct = Number(order?.downpaymentPercent ?? 0) || 0;
  const owed = remainingDue(order);
  if (pct <= 0 || pct >= 100) return owed;
  return Math.round(owed * pct) / 100;
}
