// Built-in default Custom Order Terms. Shown to customers when the owner has not saved their own,
// AND pre-loaded into the Settings editor so the admin can SEE and edit them (instead of the clauses
// living invisibly in code). One shared source keeps the storefront and the admin editor in sync.
// mode: 'both' | 'upload' | 'request' - which design flow the clause applies to.
export const DEFAULT_CUSTOM_ORDER_TERMS = [
  { title: 'Design approval', mode: 'both',    body: 'Production starts only after you approve the design/proof. Once approved, changes may require a new order or fee.' },
  { title: 'Design fee',      mode: 'request', body: 'The design fee for requested artwork covers the designer\'s work and is non-refundable once work has begun.' },
  // The numbers are NOT written into the sentence - they come from shop settings through
  // renderTermsBody(), so the owner changes the allowance in one place and every screen that quotes
  // it follows. The wording itself stays fully editable.
  { title: 'Design revisions', mode: 'request', body: 'Your design fee includes {freeRevisions} revision rounds. Each further round costs {extraRevisionFee} and is added to your order balance. We can take at most {maxRevisions} rounds online; beyond that, message us and we will work it out with you directly.' },
  { title: 'Colour differences', mode: 'both', body: 'Screen colours (RGB) differ from print (CMYK). Slight colour variation between your screen and the final print is normal and not a defect.' },
  { title: 'File quality',    mode: 'upload',  body: 'For uploaded designs, print quality depends on your file. Low-resolution or incorrectly sized files may print blurry or cropped; this is not the shop\'s fault.' },
  { title: 'Delivery promise', mode: 'both',   body: 'The delivery date shown is our best effort and is not 100% guaranteed. Delays may happen (production load, couriers, force majeure); we will notify you in advance. We are not liable for damages from delays, so please order in advance for events.' },
  // Four lines, in the order they happen. An earlier draft billed the customer for production cost
  // ABOVE the downpayment when they cancelled mid-run, which is wrong: the shop is the one who chose
  // to make nine before collecting the balance, and the downpayment is what it set to cover that.
  // The deposit is the CAP on a cancellation, not a floor to build on. If it stops covering the risk,
  // the answer is to raise the deposit percentage, not to chase customers for the difference.
  { title: 'Cancelling before we start', mode: 'both', body: 'You can cancel your order yourself while it has not entered production. Everything you paid comes back except the downpayment, which secures your slot and covers setup{designFeeNote}.' },
  { title: 'Cancelling while we are making it', mode: 'both', body: 'Once production has started, message us and we will stop where we can. We keep your downpayment and nothing more - you will never be billed extra for materials already used, even if they cost more than the downpayment. Anything you paid above the downpayment is refunded.' },
  { title: 'Once your order is finished', mode: 'both', body: 'When every item is made it can no longer be cancelled, because it carries your design and cannot be sold to anyone else. The full amount is due. If the balance is not settled we will hold your goods for {unpaidReadyHoldDays} days and keep reminding you; after that the downpayment is forfeited and the items may be disposed of.' },
  // The clause that has to survive every other clause.
  { title: 'If the mistake is ours', mode: 'both', body: 'None of the above applies when we get it wrong. If we misprint, damage an item, use the wrong artwork, or send the wrong product, we remake it free or refund it in full, whichever you prefer. This overrides everything above.' },
  { title: 'How refunds are paid', mode: 'both',  body: 'Approved refunds go back to the payment method you used, within {refundDays} working days of us confirming the amount.' },
  { title: 'Reprints',        mode: 'both',    body: 'Free reprints only for defects that are our fault (e.g. misprint on our end). Errors approved by you or caused by your file are not covered.' },

  // Quotation-only. A listed price is the price; a quoted one is the answer to a specific question,
  // and stops being true when the question changes or enough time passes.
  { title: 'How long this price holds', mode: 'quote', body: 'This quotation is valid until the date shown on it. After that we may need to re-quote, because material prices move.' },
  { title: 'What this price covers',    mode: 'quote', body: 'The price is for the exact quantity, size, material and finish written on the quotation. Changing any of them means a new quote - it is not a discount or a surcharge on this one.' },
  { title: 'Estimates on services',     mode: 'quote', body: 'Where the work is quoted per piece or per metre, the final amount follows the quantity actually produced. We tell you before anything is made if that will differ from the quotation.' },
];

/**
 * Fill the {placeholders} in a clause body from shop settings.
 *
 * A term that quotes a number has to quote the number actually in force, or the shop is bound to
 * whatever the text happens to say. Keeping the figures out of the prose lets the owner edit the
 * wording without the risk of the two drifting apart.
 */
export function renderTermsBody(body, settings) {
  if (!body) return body;
  const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const map = {
    freeRevisions:    String(settings?.freeRevisions    ?? 3),
    maxRevisions:     String(settings?.maxRevisions     ?? 5),
    extraRevisionFee: peso(settings?.extraRevisionFee   ?? 50),
    designRequestFee: peso(settings?.designRequestFee   ?? 100),
    depositDueDays:   String(settings?.depositDueDays   ?? 7),
    unpaidReadyHoldDays: String(settings?.unpaidReadyHoldDays ?? 14),
    refundDays:       String(settings?.refundDays       ?? 7),
    // Only request orders ever pay a design fee, so the sentence grows a clause instead of the
    // policy growing a whole extra paragraph that half the customers must skip.
    designFeeNote:    settings?.designRequestFee
      ? ', and the design fee once the designer has started'
      : '',
  };
  return String(body).replace(/\{(\w+)\}/g, (m, key) => (key in map ? map[key] : m));
}
