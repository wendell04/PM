/**
 * The order form the shop sends into a chat before quoting.
 *
 * A customer says "how much for 30 shirts?" and every answer depends on things they have not
 * said: sizes, colours, where to, how they pay. The old site (artsnstyle.weebly.com) asked all of
 * that on one form before a price was given. Same here: the shop sends this into the thread, the
 * customer fills it in, and the answers land back as a card the shop can quote from.
 *
 * The field list lives here, once, and rides on the message as it was when it was sent - so a
 * form sent this year still renders the same after the list changes next year.
 */

export const ORDER_FORM_VERSION = 1;

export const SHIPMENT_OPTIONS = [
  { value: 'delivery', label: 'Deliver to my address' },
  { value: 'pickup',   label: 'I will pick it up' },
];

export const PAYMENT_OPTIONS = [
  { value: 'gcash', label: 'GCash' },
  { value: 'maya',  label: 'Maya' },
  { value: 'card',  label: 'Credit / debit card' },
  { value: 'cash',  label: 'Cash on pickup' },
];

export const MAX_ORDER_LINES = 10;

/** One empty line of the "what do you want made" table. */
export const blankOrderLine = () => ({ item: '', details: '', qty: '' });

/** Everything the customer fills in, blank, with what the account already knows filled. */
export function blankAnswers(user = {}) {
  return {
    name:     [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim(),
    contact:  user?.phoneNumber || user?.phone || '',
    email:    user?.email || '',
    address:  '',
    lines:    [blankOrderLine()],
    shipment: 'delivery',
    payment:  'gcash',
    instructions: '',
    confirmDetails: false,
    agreeTerms: false,
  };
}

/** What is still missing, in the order the form shows it. Empty means it can be sent. */
export function validateAnswers(a) {
  const errs = [];
  if (!String(a.name ?? '').trim())    errs.push('Your name');
  if (!String(a.contact ?? '').trim()) errs.push('A contact number');
  if (!String(a.email ?? '').trim())   errs.push('Your email');
  const lines = (a.lines ?? []).filter(l => String(l.item ?? '').trim());
  if (lines.length === 0) errs.push('At least one item');
  if (lines.some(l => !(Number(l.qty) > 0))) errs.push('A quantity on every item');
  if (a.shipment === 'delivery' && !String(a.address ?? '').trim()) errs.push('A delivery address');
  if (!a.confirmDetails) errs.push('The "details are correct" tick');
  if (!a.agreeTerms)     errs.push('The "I agree to the terms" tick');
  return errs;
}

/** The answers as a few lines of text - for the quotation note, and for a plain card. */
export function summariseAnswers(a) {
  if (!a) return '';
  const lines = (a.lines ?? []).filter(l => String(l.item ?? '').trim())
    .map(l => `${l.qty || '?'} x ${l.item}${l.details ? ` (${l.details})` : ''}`);
  const out = [];
  if (lines.length) out.push(lines.join('\n'));
  out.push(`${a.shipment === 'pickup' ? 'Pickup' : 'Delivery'}${a.shipment !== 'pickup' && a.address ? ` - ${a.address}` : ''}`);
  const pay = PAYMENT_OPTIONS.find(p => p.value === a.payment)?.label;
  if (pay) out.push(`Pays by ${pay}`);
  if (String(a.instructions ?? '').trim()) out.push(`Notes: ${a.instructions.trim()}`);
  return out.join('\n');
}
