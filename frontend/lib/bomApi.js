const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * GET /api/admin/bom
 * Returns all active BOMs.
 */
export async function fetchBOMs(token) {
  const res = await fetch(`${API_URL}/api/admin/bom`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch BOMs.");
  return data.data || [];
}

/**
 * GET /api/admin/bom/by-product/{name}
 * Returns BOMs filtered by productGroupName.
 */
export async function fetchBOMsByProduct(productGroupName, token) {
  const res = await fetch(
    `${API_URL}/api/admin/bom/by-product/${encodeURIComponent(productGroupName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch BOMs by product.");
  return data.data || [];
}

/**
 * POST /api/admin/bom
 * Creates a new BOM.
 * Payload: { productName, productGroupName, variantName, variantCombo?, components }
 * components shape: [{ inventoryId, materialName, qty, unit, unitCost }]
 */
export async function createBOM(payload, token) {
  const res = await fetch(`${API_URL}/api/admin/bom`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to create BOM.");
  return data.data;
}

/**
 * PUT /api/admin/bom/{id}
 * Updates an existing BOM.
 */
export async function updateBOM(id, payload, token) {
  const res = await fetch(`${API_URL}/api/admin/bom/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update BOM.");
  return data.data;
}

/**
 * DELETE /api/admin/bom/{id}
 */
export async function deleteBOM(id, token) {
  const res = await fetch(`${API_URL}/api/admin/bom/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to delete BOM.");
  return true;
}
