const BASE = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api`;

async function req(path, token, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message ?? `HTTP ${res.status}`);
  return json.data !== undefined ? json.data : json;
}

export function normProduct(raw, collectionMap = {}) {
  const id = String(raw._id ?? raw.id ?? '');
  const isMulti = Array.isArray(raw.variantGroups) && raw.variantGroups.length > 0;

  const tiers = (Array.isArray(raw.priceTiers) ? raw.priceTiers : []).map(t => ({
    id:     String(t.id ?? ''),
    minQty: Number(t.minQty ?? 1),
    maxQty: t.maxQty != null ? Number(t.maxQty) : null,
    prices: t.prices ?? {},
  }));

  const variants = isMulti
    ? (Array.isArray(raw.combinations) ? raw.combinations : []).map(c => ({
        id:    String(c.id ?? c._id ?? ''),
        name:  c.name ?? '',
        bomId: String(c.bomId ?? ''),
        price: Number(c.price ?? 0),
      }))
    : [];

  return {
    id,
    name:               raw.name ?? '',
    description:        raw.description ?? '',
    images:             Array.isArray(raw.images) ? raw.images.filter(u => typeof u === 'string') : [],
    thumbnail:          raw.thumbnail ?? '',
    type:               isMulti ? 'multi-variant' : 'standalone',
    bomId:              raw.bomId ? String(raw.bomId) : '',
    variants,
    pricingMode:        raw.priceType ?? 'fixed',
    price:              Number(raw.price ?? raw.flatPrice ?? 0),
    tiers,
    collectionIds:      collectionMap[id] ?? [],
    isCustomizable:     !!(raw.isCustom),
    allowCOD:           !!(raw.allowCOD ?? true),
    isMadeToOrder:      !!(raw.isMadeToOrder),
    downpaymentPct:     Number(raw.downpaymentPercent ?? 0),
    hideWhenOutOfStock: !!(raw.hideWhenOutOfStock),
    isPublished:        !!(raw.isPublished),
    designFee:          Number(raw.designFee ?? 0),
    minOrderQty:        Number(raw.minOrderQty ?? 1),
    category:           raw.category ?? '',
    subCategoryName:    raw.subCategoryName ?? '',
    variantImageUrls:   raw.variantImageUrls ?? {},
    createdAt:          typeof raw.createdAt === 'string' ? raw.createdAt.split('T')[0] : '',
  };
}

export function normCollection(raw) {
  return {
    id:          String(raw._id ?? raw.id ?? ''),
    title:       raw.title ?? '',
    slug:        raw.slug ?? '',
    description: raw.description ?? '',
    image:       raw.image ?? '',
    isPublished: !!(raw.isPublished),
    productIds:  Array.isArray(raw.productIds) ? raw.productIds.map(String) : [],
  };
}

export async function loadProductsAndCollections(token) {
  const [rawProds, rawCols] = await Promise.all([
    req('/admin/products', token),
    req('/admin/collections', token),
  ]);

  const cols = (Array.isArray(rawCols) ? rawCols : []).map(normCollection);

  const collectionMap = {};
  cols.forEach(col => {
    col.productIds.forEach(pid => {
      if (!collectionMap[pid]) collectionMap[pid] = [];
      collectionMap[pid].push(col.id);
    });
  });

  const prods = (Array.isArray(rawProds) ? rawProds : []).map(p => normProduct(p, collectionMap));
  return { prods, cols };
}

export const createProduct           = (token, data)     => req('/admin/products',                         token, { method: 'POST',  body: JSON.stringify(data) });
export const updateProduct           = (token, id, data) => req(`/admin/products/${id}`,                   token, { method: 'PUT',   body: JSON.stringify(data) });
export const deleteProduct           = (token, id)       => req(`/admin/products/${id}`,                   token, { method: 'DELETE' });
export const toggleProductPublish    = (token, id)       => req(`/admin/products/${id}/toggle-publish`,    token, { method: 'POST' });

export const createCollection        = (token, data)     => req('/admin/collections',                      token, { method: 'POST',  body: JSON.stringify(data) });
export const updateCollection        = (token, id, data) => req(`/admin/collections/${id}`,                token, { method: 'PUT',   body: JSON.stringify(data) });
export const deleteCollection        = (token, id)       => req(`/admin/collections/${id}`,                token, { method: 'DELETE' });
export const toggleCollectionPublish = (token, id)       => req(`/admin/collections/${id}/toggle-publish`, token, { method: 'PATCH' });
