// The homepage price list, built from the published catalogue.
//
// The cards and the full pricelist used to be typed text (the Homepage CMS, or a hardcoded list
// behind it). Prices changed in the catalogue and the homepage kept the old ones, and products
// that were unpublished stayed advertised. Everything here is computed from the products the shop
// actually sells; the CMS keeps only what a person decides - which categories show, in what
// order, and a short note on each.

// Lowest and highest unit price a product lists, or null when it is priced by quotation.
// The same rules as the shop grid (ShopClient priceRange), so both say the same "from" price.
export function priceRange(product) {
  const mode = product.priceType || product.pricingMode || 'fixed';
  const tiers = product.priceTiers || product.tiers;
  if (mode === 'inquiry') return null;
  let prices = [];
  if (mode === 'fixed' && product.variantPrices && Object.keys(product.variantPrices).length > 0) {
    prices = Object.values(product.variantPrices).map(Number).filter(p => p > 0);
  } else if (mode === 'tiered' && tiers?.length) {
    prices = tiers.flatMap(t => Object.values(t.prices || {}).map(Number).filter(p => p > 0));
  } else {
    const p = Number(product.flatPrice || product.price);
    if (p > 0) prices = [p];
  }
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

export const pesoWhole = (n) => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const norm = (s) => String(s || '').trim().toLowerCase();
const published = (products) => (products || []).filter(p => p && p.isPublished !== false && p.isActive !== false && !p.isArchived);

// Every category the catalogue sells, with its lowest price and its products.
export function categorySummary(products) {
  const byCat = new Map();
  for (const p of published(products)) {
    const cat = String(p.category || 'Other').trim() || 'Other';
    const e = byCat.get(norm(cat)) ?? { category: cat, min: null, quoted: 0, names: [] };
    const r = priceRange(p);
    if (r) e.min = e.min == null ? r.min : Math.min(e.min, r.min);
    else e.quoted++;
    e.names.push(p.name);
    byCat.set(norm(cat), e);
  }
  return [...byCat.values()];
}

// The homepage cards: one per category, in the order and with the notes the CMS sets.
// cmsCards is [{ category, note, hidden }] - an older saved list also carries startingAt, which
// is ignored now: the price is the catalogue's.
export function pricingCards(products, cmsCards = []) {
  const cms = Array.isArray(cmsCards) ? cmsCards : [];
  const setting = (cat) => cms.find(c => norm(c.category) === norm(cat));
  const order = (cat) => { const i = cms.findIndex(c => norm(c.category) === norm(cat)); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  return categorySummary(products)
    .filter(e => !setting(e.category)?.hidden)
    .sort((a, b) => order(a.category) - order(b.category) || a.category.localeCompare(b.category))
    .map(e => {
      const listed = e.names.slice(0, 3).join(', ') + (e.names.length > 3 ? ` +${e.names.length - 3} more` : '');
      return {
        category: e.category,
        startingAt: e.min != null ? pesoWhole(e.min) : 'By quote',
        note: (setting(e.category)?.note || '').trim()
          || (e.min == null ? `Priced by quotation: ${listed}.` : listed + (e.quoted ? '. Some by quotation.' : '.')),
      };
    });
}

// The full pricelist: every published product with its quantity tiers per variant, in the shape
// the pricelist window renders ({ category: heading, note, startingAt, tiers | variants }).
export function fullPricelist(products) {
  const qtyLabel = (t) => (t.maxQty ? `${t.minQty}-${t.maxQty} pcs` : `${t.minQty}+ pcs`);
  return published(products)
    .slice()
    .sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')) || String(a.name).localeCompare(String(b.name)))
    .map(p => {
      const r = priceRange(p);
      const item = { category: p.name, note: p.category || '', startingAt: r ? pesoWhole(r.min) : 'By quote' };
      const mode = p.priceType || p.pricingMode || 'fixed';
      const combos = Array.isArray(p.combinations) ? p.combinations : [];
      const nameOf = (id) => combos.find(c => String(c.id) === String(id))?.name || null;
      if (mode === 'inquiry') {
        item.note = `${p.category || ''}${p.category ? ' - ' : ''}priced by quotation. Message us with the quantity and design.`;
      } else if (mode === 'tiered' && (p.priceTiers || []).length) {
        const tiers = p.priceTiers;
        const keys = [...new Set(tiers.flatMap(t => Object.keys(t.prices || {})))];
        const rows = (key) => tiers.filter(t => Number(t.prices?.[key]) > 0).map(t => [qtyLabel(t), Number(t.prices[key]).toLocaleString('en-PH')]);
        if (keys.length === 1) item.tiers = rows(keys[0]);
        else item.variants = keys.map(k => ({ name: nameOf(k) || k, tiers: rows(k) })).filter(v => v.tiers.length);
      } else if (mode === 'fixed' && p.variantPrices && Object.keys(p.variantPrices).length) {
        item.variants = Object.entries(p.variantPrices).filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => ({ name: nameOf(k) || 'Each', tiers: [['per piece', Number(v).toLocaleString('en-PH')]] }));
      }
      return item;
    });
}
