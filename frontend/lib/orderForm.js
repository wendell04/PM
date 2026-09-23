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

export const ORDER_FORM_VERSION = 2;

/**
 * The questions are the owner's now, written in Settings > Order forms, and a copy of them rides
 * on the message that was sent. Everything below marked "legacy" reads a form sent before that -
 * those messages have no copy, so they keep the fixed list they were sent with.
 */
export const LIMITS = {
  shortAnswer: 100,
  longAnswer: 1000,
  option: 60,
  items: 10,
  item: 160,
  itemDetails: 200,
  qty: 100000,
  number: 1000000,
};

/** One empty answer, shaped the way its question type expects. */
export function blankAnswer(q) {
  switch (q?.type) {
    case 'choice_many': return [];
    case 'size_grid':   return (q.options || []).map(size => ({ size, qty: '' }));
    case 'item_list':   return [blankOrderLine()];
    default:            return '';
  }
}

/** The core the shop always asks, plus a blank answer per question on the form it sent. */
export function blankFormState(user = {}, form = null) {
  const core = {
    name:    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim(),
    contact: user?.phoneNumber || user?.phone || '',
    email:   user?.email || '',
    address: '',
    shipment: 'delivery',
    confirmDetails: false,
    agreeTerms: false,
  };
  const answers = {};
  for (const q of form?.questions ?? []) answers[q.id] = blankAnswer(q);
  return { ...core, answers };
}

/** How many an answer says, for the questions that carry a quantity. */
export function answerQty(q, v) {
  if (q?.type === 'number')    return Number(v) > 0 ? Number(v) : 0;
  if (q?.type === 'size_grid') return (Array.isArray(v) ? v : []).reduce((n, r) => n + (Number(r?.qty) > 0 ? Number(r.qty) : 0), 0);
  if (q?.type === 'item_list') return (Array.isArray(v) ? v : []).reduce((n, r) => n + (Number(r?.qty) > 0 ? Number(r.qty) : 0), 0);
  return 0;
}

/**
 * What is still missing, worded the way the customer would say it. The server checks the same
 * things - this is so they are told before the round trip, not after it.
 */
export function validateForm(s, form) {
  const errs = [];
  if (!String(s.name ?? '').trim())    errs.push('Your name');
  if (!String(s.contact ?? '').trim()) errs.push('A contact number');
  if (!String(s.email ?? '').trim())   errs.push('Your email');
  if (s.shipment === 'delivery' && !String(s.address ?? '').trim()) errs.push('A delivery address');

  let total = 0;
  let asksQty = false;
  let qtyNamed = false;   // a quantity question that already reported itself missing
  for (const q of form?.questions ?? []) {
    const v = s.answers?.[q.id];
    const qty = ['number', 'size_grid', 'item_list'].includes(q.type);
    const before = errs.length;
    if (qty && q.required) asksQty = true;
    total += answerQty(q, v);
    if (!q.required) continue;
    switch (q.type) {
      case 'choice_many':
        if (!(Array.isArray(v) && v.length)) errs.push(q.label);
        break;
      case 'size_grid':
        if (!(Array.isArray(v) && v.some(r => Number(r?.qty) > 0))) errs.push(`${q.label} (put a quantity on at least one size)`);
        break;
      case 'item_list': {
        const rows = (Array.isArray(v) ? v : []).filter(r => String(r?.item ?? '').trim());
        if (!rows.length) errs.push(`${q.label} (at least one item)`);
        else if (rows.some(r => !(Number(r.qty) > 0))) errs.push(`${q.label} (a quantity on every item)`);
        break;
      }
      case 'number':
        if (!(Number(v) > 0)) errs.push(q.label);
        break;
      default:
        if (!String(v ?? '').trim()) errs.push(q.label);
    }
    if (errs.length > before && qty) qtyNamed = true;
  }
  // Only when no quantity question already named itself: "Sizes (put a quantity on at least one
  // size), How many you want made" says the same thing twice.
  if (asksQty && total < 1 && !qtyNamed) errs.push('How many you want made');

  if (!s.confirmDetails) errs.push('The "details are correct" tick');
  if (!s.agreeTerms)     errs.push('The "I agree to the terms" tick');
  return [...new Set(errs)];
}

/** The answers as label-and-value lines, for the card in the chat and the ask in the dashboard. */
export function summariseForm(form, answers) {
  const out = [];
  for (const q of form?.questions ?? []) {
    const v = answers?.[q.id];
    if (q.type === 'item_list') {
      for (const r of Array.isArray(v) ? v : []) {
        if (String(r?.item ?? '').trim()) out.push({ label: '', value: `${r.qty || '?'} x ${r.item}${r.details ? ` (${r.details})` : ''}` });
      }
    } else if (q.type === 'size_grid') {
      const bits = (Array.isArray(v) ? v : []).filter(r => Number(r?.qty) > 0).map(r => `${r.size} x ${r.qty}`);
      if (bits.length) out.push({ label: q.label, value: bits.join(', ') });
    } else if (q.type === 'choice_many') {
      if (Array.isArray(v) && v.length) out.push({ label: q.label, value: v.join(', ') });
    } else if (v !== null && v !== undefined && String(v).trim() !== '') {
      out.push({ label: q.label, value: String(v) });
    }
  }
  return out;
}

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
