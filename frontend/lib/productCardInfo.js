/**
 * What a product card says about price and availability - decided once.
 *
 * The same product appears on the shop grid, on the landing page's featured row and under "You may
 * also like", and each place had grown its own arithmetic. The landing said "From P95" for a mug
 * the grid priced at "P60.00 - P200.00", and only the grid carried the stock badge at all - so the
 * same mug looked like two products depending on the page somebody arrived through.
 */

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The price as a customer reads it: one figure, a range across variants or tiers, or the plain
 * truth that it has to be quoted.
 */
export function priceLabel(product) {
  if (!product) return 'Price on request';
  const mode  = product.priceType || product.pricingMode || 'fixed';
  const tiers = product.priceTiers || product.tiers;

  if (mode === 'inquiry') return 'Price on request';

  const spread = (values) => {
    const nums = values.map(v => parseFloat(v)).filter(v => v > 0);
    if (!nums.length) return null;
    const min = Math.min(...nums), max = Math.max(...nums);
    return min === max ? peso(min) : `${peso(min)} - ${peso(max)}`;
  };

  if (mode === 'tiered' && tiers?.length) {
    const all = tiers.flatMap(t => (t.price != null ? [t.price] : Object.values(t.prices || {})));
    const out = spread(all);
    if (out) return out;
  }

  if (product.variantPrices && Object.keys(product.variantPrices).length) {
    const out = spread(Object.values(product.variantPrices));
    if (out) return out;
  }

  const flat = parseFloat(product.flatPrice ?? product.price);
  return flat > 0 ? peso(flat) : 'Price on request';
}

/**
 * The availability badge: what can be had, and whether to hurry.
 *
 * A count is per VARIANT, never the variants added together - 104 white + 180 inner + 190 magic is
 * 474, and no single order can take that. A product with variants shows the range over the ones
 * that have stock; a standalone product shows its own figure.
 *
 * Returns null when there is nothing honest to say: a made-to-order product with no counted
 * material behind it has no shelf to report.
 */
export function stockBadge(product) {
  if (!product) return null;
  const mode = product.priceType || product.pricingMode || 'fixed';
  if (mode === 'inquiry') return null;          // quoted per job; there is no shelf

  const perVariant = Object.values(product.variantCanProduce ?? {})
    .filter(v => v != null).map(Number).filter(v => !Number.isNaN(v));

  const total = perVariant.length ? null
    : (product.canProduceTotal ?? product.canProduce ?? product.availableQty ?? product.stock ?? null);

  const most  = perVariant.length ? Math.max(...perVariant) : (total == null ? null : Number(total));
  const inStk = perVariant.filter(v => v > 0);
  const least = inStk.length ? Math.min(...inStk) : most;

  const canPreorder = !!product.allowPreorder
    || Object.values(product.variantPreorder ?? {}).some(Boolean)
    || Object.values(product.variantBackorder ?? {}).some(Boolean);

  if (most === 0) return canPreorder ? { label: 'Pre-order', tone: 'wait' } : { label: 'Out of Stock', tone: 'gone' };
  if (most == null) return product.isMadeToOrder ? null : { label: 'In Stock', tone: 'have' };
  if (most <= 10) return { label: `Only ${most} left!`, tone: 'low' };
  return { label: least !== most ? `${least}-${most} pcs` : `${most} pcs`, tone: 'have' };
}

/** How many variants a customer will have to choose between, or 0. */
export function variantCount(product) {
  if (!product) return 0;
  const combos = product.combinations?.length ?? 0;
  if (combos) return combos;
  return (product.variantGroups ?? []).reduce((n, g) => n + (g.options?.length ?? 0), 0);
}
