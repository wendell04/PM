/**
 * What a customer pays for the shop to make the artwork - mirrors backend/app/Support/DesignFee.php.
 *
 *   per_order  one fee for the whole order, the highest of the store fee and any product override
 *   per_item   one fee for every line that asks for a design
 *
 * The owner chooses the rule once in Settings (designFeeMode). The cart shows the same figure the
 * server charges, because they run the same arithmetic on the same lines.
 */
const asksForDesign = (i) => i?.designMode === 'request' || !!i?.designRequested;

export function designFeeFor(items, settings = {}) {
  const lines = (items ?? []).filter(asksForDesign);
  if (lines.length === 0) return 0;
  const store = Math.max(0, Number(settings?.designRequestFee) || 0);
  const fees  = lines.map(i => Math.max(0, Number(i.designFee) || 0));
  if (settings?.designFeeMode === 'per_item') {
    return Math.round(fees.reduce((s, f) => s + (f > 0 ? f : store), 0) * 100) / 100;
  }
  return Math.max(store, ...fees);
}
