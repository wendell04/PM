// How a payment row is named on a receipt, and what the receipt says about the money overall.
//
// Both used to live inside payment-success. When the receipt became its own component they were
// left behind, so the receipt threw "orderNo is not defined" the moment it rendered - the page a
// customer reaches by clicking Print receipt. They are shared now, and mirrored in PHP by
// app/Support/ReceiptPdf.php for the emailed PDF.

// Payment rows were labelled by POSITION - first is a "Downpayment", the rest are "Balance payment".
// On a request-design order the first payment is the DESIGN FEE, so the receipt called the design fee
// a downpayment and the actual downpayment a balance payment. Read the note the payment carries
// instead; it says what the payment was for.
export function paymentLabel(pmt, index, total) {
  // Payments recorded from now on carry what they were FOR. Older rows have only the gateway
  // reference in their note, so they still fall through to the guesses below.
  const byType = { design_fee: 'Design fee', downpayment: 'Downpayment', balance: 'Balance payment', payment: 'Payment' };
  if (pmt?.type && byType[pmt.type]) return byType[pmt.type];

  const note = String(pmt?.note ?? '').toLowerCase();
  if (note.includes('design fee') || note.includes('design_fee')) return 'Design fee';
  if (note.includes('downpayment') || note.includes('deposit'))   return 'Downpayment';
  if (note.includes('balance'))                                   return 'Balance payment';
  if (total <= 1) return 'Payment';
  return index === 0 ? 'Downpayment' : 'Balance payment';
}

// The old rule read "not settled and something owed" as "Design Fee Paid", which printed that on a
// COD order nobody had paid a peso towards. Say what the payments actually show.
export function receiptStatus(order, payments, paid) {
  if (order?.paymentStatus === 'paid') return 'Fully Paid';
  if (!(paid > 0)) return 'Unpaid';
  const labels = payments.map((p, i) => paymentLabel(p, i, payments.length));
  return labels.every((l) => l === 'Design fee') ? 'Design Fee Paid - Balance Due' : 'Partially Paid';
}
