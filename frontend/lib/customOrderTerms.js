// Built-in default Custom Order Terms. Shown to customers when the owner has not saved their own,
// AND pre-loaded into the Settings editor so the admin can SEE and edit them (instead of the clauses
// living invisibly in code). One shared source keeps the storefront and the admin editor in sync.
// Which flows a clause belongs to. There are THREE ways to buy here, not two: a customer uploads
// artwork, asks us to draw it, or accepts a quotation we priced by hand. 'both' means the two
// custom flows - it never meant the quotation, and a file-quality warning has nothing to say to
// somebody paying a quote. 'all' is the one that covers every route.
export const TERMS_MODES = [
  { value: 'all',     label: 'Apply to all' },
  { value: 'both',    label: 'Upload/Req' },
  { value: 'upload',  label: 'Uploaded design only' },
  { value: 'request', label: 'Design request only' },
  { value: 'quote',   label: 'Quotation only' },
];

/**
 * Does this clause belong on a screen running `flow`?
 *
 * flow is 'upload', 'request', 'quote', or 'both' - which the custom-order page uses before the
 * customer has chosen how they are giving us the artwork. Everything but a quotation-only clause
 * belongs on that screen, because either flow is still ahead of them.
 */
export function clauseApplies(clause, flow) {
  // A clause saved before modes existed has none. It showed everywhere then, and it still does -
  // silently dropping somebody's published term because a field is missing is the worse failure.
  const mode = clause?.mode || 'all';
  if (mode === 'all') return true;
  if (flow === 'both') return mode !== 'quote';
  if (mode === 'both') return flow === 'upload' || flow === 'request';
  return mode === flow;
}

// mode: 'all' | 'both' | 'upload' | 'request' | 'quote' - see TERMS_MODES above.
export const DEFAULT_CUSTOM_ORDER_TERMS = [
  { title: 'Design approval', mode: 'all' ,    body: 'Production starts only after you approve the design/proof. Once approved, changes may require a new order or fee.' },
  { title: 'Design fee',      mode: 'request', body: 'The design fee for requested artwork covers the designer\'s work and is non-refundable once work has begun.' },
  // The numbers are NOT written into the sentence - they come from shop settings through
  // renderTermsBody(), so the owner changes the allowance in one place and every screen that quotes
  // it follows. The wording itself stays fully editable.
  { title: 'Design revisions', mode: 'request', body: 'Your design fee includes {freeRevisions} revision rounds. Each further round costs {extraRevisionFee} and is added to your order balance. We can take at most {maxRevisions} rounds online; beyond that, message us and we will work it out with you directly.' },
  // What the system already does (orders:expire-unpaid-proofs), said where the customer agrees to
  // it. A cancellation the contract never mentioned is one the customer can fairly dispute.
  { title: 'Paying after you approve', mode: 'request', body: 'Once you approve the proof, the goods fall due. Pay the downpayment or the full amount in My Orders within {depositDueDays} days - we remind you the day before. If it is still unpaid after that, the order is cancelled automatically, the materials held for it are released, and the design fee stays with the designer for the work already done.' },
  // Proof links are emailed and answered without signing in; this makes that answer binding.
  { title: 'Approving by email', mode: 'request', body: 'Every proof we send also arrives by email with a link. Approving it, or asking for changes, through that link counts exactly the same as doing it in My Orders. The link works for two weeks; after that, open the order in My Orders to see the latest proof.' },
  // The reprint clause says an approved mistake is not covered; this one says what to look for first.
  { title: 'Check it before you approve', mode: 'both', body: 'Please check every name, spelling, number, date and colour before you approve. We print exactly what you approve - a mistake in an approved design or an uploaded file is not reprinted for free.' },
  { title: 'Your artwork', mode: 'all', body: 'You confirm that you own, or have permission to use, every logo, photo, character and piece of text you send us. We may refuse artwork that copies someone else\'s work or brand, or is offensive - we will then ask you for another file, or refund what you paid for that item if you would rather not. Your files are used only to make your order.' },
  { title: 'Colour differences', mode: 'all' , body: 'Screen colours (RGB) differ from print (CMYK). Slight colour variation between your screen and the final print is normal and not a defect.' },
  { title: 'File quality',    mode: 'upload',  body: 'For uploaded designs, print quality depends on your file. Low-resolution or incorrectly sized files may print blurry or cropped; this is not the shop\'s fault.' },
  // The clause above says whose fault a bad print is; this one says how to avoid needing it. The
  // accepted list is the one the uploader actually enforces - promising a format the server refuses
  // is worse than not offering it.
  { title: 'What file to send', mode: 'upload', body: 'We accept JPG, PNG, WEBP, PDF, AI, PSD and SVG, up to 10 MB each. Send your artwork at 300 dpi or higher, already sized for the item you are ordering. We print the file as you send it - we do not redraw, resize or correct it unless you ask us for a design request.' },
  // Turnaround and transit come from Settings > Shipping, so the promise in the terms and the date
  // on the order can never disagree.
  { title: 'How long production takes', mode: 'all' , body: 'Small orders take about {productionLeadDays} working days to make, not counting delivery. Larger quantities take longer: the date shown on your order is the one we are working to, and we tell you if it moves.' },
  { title: 'Getting it to you', mode: 'all' , body: 'Once your order leaves us, Metro Manila addresses usually arrive within {shippingDaysMin}-{shippingDaysMax} days. Provincial and island addresses take longer and follow the courier\'s own schedule. We send you the tracking number as soon as the courier gives us one.' },
  { title: 'While it is with the courier', mode: 'all' , body: 'Fragile items are bubble-wrapped before we hand them over. After that the parcel is in the courier\'s hands: we are not liable for damage or loss in transit. Tell us straight away if something arrives broken or never arrives - we file the claim with the courier and follow it up for you.' },
  { title: 'Delivery promise', mode: 'all' ,   body: 'The delivery date shown is our best effort and is not 100% guaranteed. Delays may happen (production load, couriers, force majeure); we will notify you in advance. We are not liable for damages from delays, so please order in advance for events.' },
  // Four lines, in the order they happen. An earlier draft billed the customer for production cost
  // ABOVE the downpayment when they cancelled mid-run, which is wrong: the shop is the one who chose
  // to make nine before collecting the balance, and the downpayment is what it set to cover that.
  // The deposit is the CAP on a cancellation, not a floor to build on. If it stops covering the risk,
  // the answer is to raise the deposit percentage, not to chase customers for the difference.
  { title: 'Cancelling before we start', mode: 'all' , body: 'You can cancel your order yourself while it has not entered production. Everything you paid comes back except the downpayment, which secures your slot and covers setup{designFeeNote}.' },
  { title: 'Cancelling while we are making it', mode: 'all' , body: 'Once production has started, message us and we will stop where we can. We keep your downpayment and nothing more - you will never be billed extra for materials already used, even if they cost more than the downpayment. Anything you paid above the downpayment is refunded.' },
  { title: 'Once your order is finished', mode: 'all' , body: 'When every item is made it can no longer be cancelled, because it carries your design and cannot be sold to anyone else. The full amount is due. If the balance is not settled we will hold your goods for {unpaidReadyHoldDays} days and keep reminding you; after that the downpayment is forfeited and the items may be disposed of.' },
  // The clause that has to survive every other clause.
  { title: 'If the mistake is ours', mode: 'all' , body: 'None of the above applies when we get it wrong. If we misprint, damage an item, use the wrong artwork, or send the wrong product, we remake it free or refund it in full, whichever you prefer. This overrides everything above.' },
  { title: 'How refunds are paid', mode: 'all' ,  body: 'Approved refunds go back to the payment method you used, within {refundDays} working days of us confirming the amount.' },
  { title: 'Reprints',        mode: 'all' ,    body: 'Free reprints only for defects that are our fault (e.g. misprint on our end). Errors approved by you or caused by your file are not covered.' },

  // Quotation-only. A listed price is the price; a quoted one is the answer to a specific question,
  // and stops being true when the question changes or enough time passes.
  { title: 'How long this price holds', mode: 'quote', body: 'This quotation is valid until the date shown on it. After that we may need to re-quote, because material prices move.' },
  { title: 'What this price covers',    mode: 'quote', body: 'The price is for the exact quantity, size, material and finish written on the quotation. Changing any of them means a new quote - it is not a discount or a surcharge on this one.' },
  { title: 'Estimates on services',     mode: 'quote', body: 'Where the work is quoted per piece or per metre, the final amount follows the quantity actually produced. We tell you before anything is made if that will differ from the quotation.' },
  // Nothing is set aside while a quote waits to be paid, so the shelf can change underneath it. The
  // payment is refused rather than taken for goods that are no longer there - this is what makes
  // that refusal something the customer agreed to, not a surprise.
  { title: 'Price, not stock',          mode: 'quote', body: 'This quotation holds the price, not the stock. If an item runs out before you pay, we will tell you and offer a new date or a new quote.' },
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
    productionLeadDays: String(settings?.productionLeadDays ?? 3),
    shippingDaysMin:    String(settings?.shippingDaysMin    ?? 1),
    shippingDaysMax:    String(settings?.shippingDaysMax    ?? 2),
    // Only request orders ever pay a design fee, so the sentence grows a clause instead of the
    // policy growing a whole extra paragraph that half the customers must skip.
    designFeeNote:    settings?.designRequestFee
      ? ', and the design fee once the designer has started'
      : '',
  };
  return String(body).replace(/\{(\w+)\}/g, (m, key) => (key in map ? map[key] : m));
}
