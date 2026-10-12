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
/** Paid towards the goods - the design fee buys the drawing, not the item. Mirrors the server's
 *  DeliveryClock money gate, so the screens and the countdown agree on "has the deposit landed". */
export function goodsPaid(order) {
  const fee = order?.designFeePaid ? (Number(order?.designFee) || 0) : 0;
  return Math.max(0, Math.round((paidSoFar(order) - fee) * 100) / 100);
}

export function remainingDue(order) {
  return Math.max(0, Math.round((orderTotal(order) - paidSoFar(order)) * 100) / 100);
}

/**
 * What cancelling would do to the money, under the order terms: the shop keeps the downpayment and
 * a paid design fee, and everything above that goes back. Mirrors OrderController::cancelTerms, which
 * is the figure that is actually recorded - this one only lets the cancel dialog say it beforehand.
 * `deposit` is null when the order's lines disagree on the rate; the server works that case out.
 */
export function cancelPreview(order) {
  const paid = paidSoFar(order);
  const designKept = Math.min(paid, order?.designFeePaid ? (Number(order?.designFeePaidAmount ?? order?.designFee) || 0) : 0);
  const goodsPaid = Math.max(0, paid - designKept);
  const pct = Number(order?.downpaymentPercent ?? 0) || 0;
  let deposit = 0;
  // On a quotation order `requiresDownpayment` only says a balance is still open, so one paid in
  // full reads false while its deposit rate is still on the order.
  const isQuote = !!order?.orderRequestId || order?.orderSource === 'inquiry';
  if (order?.requiresDownpayment || (isQuote && pct > 0)) {
    if (pct > 0) deposit = Math.round(Math.max(0, orderTotal(order) - designKept) * Math.min(pct, 100)) / 100;
    else deposit = null;
  }
  const depositKept = deposit == null ? null : Math.min(goodsPaid, deposit);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    paid: round(paid),
    designKept: round(designKept),
    depositKept: depositKept == null ? null : round(depositKept),
    refund: depositKept == null ? null : round(Math.max(0, goodsPaid - depositKept)),
  };
}

/** The deposit share of what is still owed, not of the gross total - the customer should not be
 *  asked for a percentage of money they have already handed over. */
export function depositDue(order) {
  const pct = Number(order?.downpaymentPercent ?? 0) || 0;
  const owed = remainingDue(order);
  if (pct <= 0 || pct >= 100) return owed;
  return Math.round(owed * pct) / 100;
}
