// The lowest price a customer actually pays for ONE piece.
//
// Not the lowest number in the pricing table: a tiered product's cheapest row needs hundreds of
// pieces, so "From P60" on a card that costs P95 to buy one of is a promise the cart breaks. This
// reads the first tier (the smallest minQty) and takes the cheapest variant in it.
export function priceFrom(product) {
  if (!product) return null;
  const nums = [];
  const push = (v) => { const n = parseFloat(v); if (Number.isFinite(n) && n > 0) nums.push(n); };

  const tiers = product.priceTiers || product.pricingTiers || [];
  if (Array.isArray(tiers) && tiers.length) {
    const first = [...tiers].sort((a, b) => (Number(a?.minQty) || 0) - (Number(b?.minQty) || 0))[0];
    if (first?.price != null) push(first.price);
    Object.values(first?.prices || {}).forEach(push);
    if (nums.length) return Math.min(...nums);
  }

  Object.values(product.variantPrices || {}).forEach(push);
  push(product.flatPrice);
  push(product.price);
  push(product.basePrice);
  return nums.length ? Math.min(...nums) : null;
}

export default priceFrom;
