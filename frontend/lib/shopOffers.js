// The shop's two standing offers, worked out on the screen exactly as the server works them out.
//
//   Free delivery once the goods reach a figure
//   A discount on somebody's first order
//
// This is a deliberate mirror of App\Support\ShopOffers::apply(). The server is the authority -
// it decides what is charged - but a checkout that shows a different figure from the one that is
// about to be billed is worse than no offer at all, so the arithmetic lives in one file on each
// side and the two are kept identical. Order of operations, same as the server:
//
//   goods -> welcome discount (capped) -> voucher -> the two capped at the goods
//   -> free delivery decided on what is LEFT -> deposit worked out after all of it
//
// Neither offer applies to a quotation: that price was negotiated by hand.

const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * @param {object}  o
 * @param {number}  o.goods     the lines, before anything comes off
 * @param {number}  o.voucher   what a voucher already takes off the goods
 * @param {boolean} o.isFirst   has this customer never ordered here before
 * @param {number}  o.percent   the welcome discount, 0 = the shop is not running it
 * @param {number?} o.cap       the most it may take off, null = uncapped
 * @param {number?} o.freeFrom  goods figure at which delivery is free, null = not running
 */
export function applyOffers({ goods = 0, voucher = 0, isFirst = false, percent = 0, cap = null, freeFrom = null } = {}) {
  const g = money(Math.max(0, Number(goods) || 0));
  const v = money(Math.max(0, Number(voucher) || 0));
  const pct = Number(percent) > 0 && Number(percent) <= 100 ? Number(percent) : 0;
  const capped = cap !== null && cap !== undefined && Number(cap) > 0 ? Number(cap) : null;

  let firstOrder = 0;
  if (isFirst && pct > 0 && g > 0) {
    firstOrder = money(g * pct / 100);
    if (capped !== null) firstOrder = Math.min(firstOrder, capped);
  }
  // Two discounts may stack, but together they only ever reach the goods - never past them into
  // the design fee, the rush fee or the delivery.
  if (firstOrder + v > g) firstOrder = money(Math.max(0, g - v));

  const netGoods = money(Math.max(0, g - firstOrder - v));

  const from = freeFrom !== null && freeFrom !== undefined && Number(freeFrom) > 0 ? money(freeFrom) : null;
  const freeDelivery = from !== null && netGoods >= from;

  return {
    firstOrder,
    firstOrderPercent: firstOrder > 0 ? pct : null,
    firstOrderCap: firstOrder > 0 ? capped : null,
    voucher: v,
    netGoods,
    freeDelivery,
    freeDeliveryFrom: from,
    // How much more would have to go in the basket. Null when the offer is off or already earned.
    shortOfFreeDelivery: from !== null && !freeDelivery ? money(from - netGoods) : null,
  };
}

/** "First order (10%, max P200)" - what the discount line calls itself on a bill. */
export function firstOrderLabel(percent, cap) {
  const p = Number(percent) || 0;
  if (p <= 0) return 'First order';
  const c = Number(cap) || 0;
  return c > 0
    ? `First order (${p}%, max \u20B1${c.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : `First order (${p}%)`;
}

/** The nudge under a basket: what is still missing before delivery stops being charged. */
export function freeDeliveryNudge(offers) {
  if (!offers || offers.freeDeliveryFrom === null) return null;
  if (offers.freeDelivery) return 'Delivery is free on this order.';
  const short = Number(offers.shortOfFreeDelivery) || 0;
  if (short <= 0) return null;
  return `Add \u20B1${short.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more and delivery is free.`;
}
