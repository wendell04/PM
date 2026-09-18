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
  if (!res.ok) {
    // The API already names the offending fields; this used to read json.message alone and show a
    // bare "Validation failed", which says nothing a person can act on and turns a one-glance fix
    // into an investigation.
    const detail = json.errors && typeof json.errors === 'object'
      ? Object.entries(json.errors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(' ') : msgs}`)
          .join(' | ')
      : '';
    throw new Error(detail ? `${json.message ?? 'Request failed'} - ${detail}` : (json.message ?? `HTTP ${res.status}`));
  }
  return json.data !== undefined ? json.data : json;
}

// ── Normalizers ───────────────────────────────────────────────────────────────

export function normInventory(item) {
  const id = String(item._id ?? item.id ?? '');
  const rawBatches = Array.isArray(item.batches) ? item.batches : [];
  const batches = rawBatches.map(b => ({
    id:           b.batchId ?? String(b._id ?? ''),
    matId:        id,
    invoiceNo:    b.invoiceNumber ?? '',
    date:         (b.dateReceived ?? b.createdAt ?? '').split('T')[0],
    vendorId:     b.supplierId ?? null,
    vendorName:   b.vendorName ?? '',
    qtyReceived:  Number(b.goodQty ?? 0),
    unitCost:     Number(b.unitCost ?? 0),
    remainingQty: Number(b.remainingQty ?? 0),
    notes:        b.notes ?? '',
  }));
  const mat = {
    id,
    sku:      item.sku ?? '',
    name:     item.name ?? '',
    unit:     item.uom ?? 'pcs',
    category: item.category ?? '',
    vendorId: item.supplierId ?? null,
    baseCost: Number(item.baseCost ?? item.lastUnitCost ?? 0),
    minStock: Number(item.minStockLevel ?? 0),
    leadTime: Number(item.leadTimeDays ?? 7),
    // Read all over the app - reports, To Buy, the forecast, the quotation modal - and set by
    // no screen at all, so nobody could ever switch it on.
    isOnDemand: !!item.isOnDemand,
    stockQty: Number(item.stockQty ?? 0),
    // The API selects these, but the normalizer used to drop them - so `mat.reservedQty` was
    // undefined everywhere, freeStock() silently returned the GROSS stock, and every screen that
    // claims to net off open orders was quietly reporting full capacity. The Catalog said
    // "100 can build" on a mug with 10 already held for an order.
    reservedQty: Number(item.reservedQty ?? 0),
    consumedQty: Number(item.consumedQty ?? 0),
    badOrderQty: Number(item.badOrderQty ?? 0),
  };
  return { mat, batches };
}

export function normSupplier(s) {
  return {
    id:            String(s._id ?? s.id ?? ''),
    name:          s.name ?? '',
    contact:       s.phone ?? s.contactPerson ?? '',
    email:         s.email ?? '',
    address:       s.address ?? '',
    itemsSupplied: Array.isArray(s.itemsSupplied) ? s.itemsSupplied : [],
  };
}

export function normBom(b) {
  return {
    id:          String(b._id ?? b.id ?? ''),
    productName: b.productName ?? '',
    items:       (Array.isArray(b.components) ? b.components : []).map(c => ({
      matId: String(c.inventoryId ?? ''),
      qty:   Number(c.qty ?? 1),
    })),
  };
}

export function normReturn(r) {
  return {
    id:            String(r._id ?? r.id ?? ''),
    batchId:       r.batchId ?? null,
    matId:         String(r.materialId ?? r.matId ?? ''),
    matName:       r.materialName ?? r.matName ?? '',
    vendorId:      r.vendorId ?? null,
    vendorName:    r.vendorName ?? '',
    invoiceNo:     r.invoiceNo ?? '',
    date:          (r.createdAt ?? '').split('T')[0],
    qty:           Number(r.quantity ?? r.qty ?? 0),
    type:          r.damageType ?? r.type ?? 'damaged',
    notes:         r.notes ?? '',
    status:        r.status ?? 'pending',
    resolvedDate:  r.resolvedAt ? r.resolvedAt.split('T')[0] : null,
    resolvedNotes: r.resolvedNotes ?? '',
  };
}

export function normStockOut(h) {
  const id = String(h._id ?? h.id ?? '');
  const orderId = h.orderId ?? null;
  return {
    id,
    ref: orderId
      ? `ORD-${String(orderId).slice(-8).toUpperCase()}`
      : h.invoiceNumber
        ? `INV-${h.invoiceNumber}`
        : `ADJ-${id.slice(-8).toUpperCase()}`,
    type:         orderId ? 'sale' : h.reason === 'production' ? 'production' : 'adjustment',
    matId:        String(h.inventoryId ?? ''),
    matName:      h.materialName ?? '',
    date:         (h.createdAt ?? '').split('T')[0],
    qty:          Number(h.quantity ?? 0),
    remainingQty: Number(h.remainingQty ?? 0),
    reason:       h.reason ?? '',
    unitCost:     Number(h.unitCost ?? 0),
    totalCost:    Number(h.totalCost ?? 0),
    notes:        h.remarks ?? '',
    performedBy:  h.performedBy ?? null,
    orderId,
    productId:    h.productId ?? null,
    productName:  h.productName ?? '',
    customerName: h.customerName ?? '',
  };
}

// ── Loaders ───────────────────────────────────────────────────────────────────

export async function loadInventory(token) {
  const raw  = await req('/admin/inventory', token);
  const list = Array.isArray(raw) ? raw : [];
  const mats = [];
  const bats = [];
  list.forEach(item => {
    const { mat, batches } = normInventory(item);
    mats.push(mat);
    bats.push(...batches);
  });
  return { mats, bats };
}

export async function loadSuppliers(token) {
  const raw = await req('/admin/suppliers', token);
  return (Array.isArray(raw) ? raw : []).map(normSupplier);
}

export async function loadBoms(token) {
  const raw = await req('/admin/bom', token);
  return (Array.isArray(raw) ? raw : []).map(normBom);
}

export async function loadReturns(token) {
  const raw = await req('/admin/returns', token);
  return (Array.isArray(raw) ? raw : []).map(normReturn);
}

export async function loadStockOuts(token) {
  const raw = await req('/admin/inventory/stock-outs', token);
  return (Array.isArray(raw) ? raw : []).map(normStockOut);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export const createMat    = (token, data)     => req('/admin/inventory',            token, { method:'POST',   body:JSON.stringify(data) });
export const updateMat    = (token, id, data) => req(`/admin/inventory/${id}`,      token, { method:'PUT',    body:JSON.stringify(data) });
export const deleteMat    = (token, id)       => req(`/admin/inventory/${id}`,      token, { method:'DELETE' });
export const adjustStock  = (token, id, data) => req(`/admin/inventory/${id}/adjust-stock`, token, { method:'POST', body:JSON.stringify(data) });

export const createSupplier = (token, data)     => req('/admin/suppliers',           token, { method:'POST',   body:JSON.stringify(data) });
export const updateSupplier = (token, id, data) => req(`/admin/suppliers/${id}`,     token, { method:'PUT',    body:JSON.stringify(data) });
export const deleteSupplier = (token, id)       => req(`/admin/suppliers/${id}`,     token, { method:'DELETE' });

export const createBom  = (token, data)     => req('/admin/bom',        token, { method:'POST',   body:JSON.stringify(data) });
export const updateBom  = (token, id, data) => req(`/admin/bom/${id}`,  token, { method:'PUT',    body:JSON.stringify(data) });
export const deleteBom  = (token, id)       => req(`/admin/bom/${id}`,  token, { method:'DELETE' });

export const createReturn  = (token, data)     => req('/admin/returns',       token, { method:'POST', body:JSON.stringify(data) });
export const resolveReturn = (token, id, data) => req(`/admin/returns/${id}`, token, { method:'PUT',  body:JSON.stringify(data) });

export async function loadAdminProducts(token) {
  const raw  = await req('/admin/products', token);
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return list.map(p => ({
    id:           String(p._id ?? p.id ?? ''),
    name:         p.name ?? '',
    category:     p.category ?? '',
    bomId:        p.bomId ? String(p.bomId) : null,
    combinations: (Array.isArray(p.combinations) ? p.combinations : []).map(c => ({
      id:    String(c.id ?? ''),
      name:  c.name ?? '',
      bomId: c.bomId ? String(c.bomId) : null,
    })),
  }));
}
