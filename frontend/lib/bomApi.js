const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

import { fetchWithTimeout } from "./fetchWithTimeout";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * GET /api/admin/bom
 * Returns all active BOMs.
 */
export async function fetchBOMs(token) {
  const res = await fetchWithTimeout(
    `${API_URL}/api/admin/bom`,
    { method: "GET", headers: authHeaders(token) },
    20000,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to fetch BOMs.");
  return data.data || [];
}

/**
 * GET /api/admin/bom/by-product/{name}
 */
export async function fetchBOMsByProduct(productGroupName, token) {
  const res = await fetchWithTimeout(
    `${API_URL}/api/admin/bom/by-product/${encodeURIComponent(productGroupName)}`,
    { method: "GET", headers: authHeaders(token) },
    20000,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to fetch BOMs by product.");
  return data.data || [];
}

/**
 * POST /api/admin/bom
 */
export async function createBOM(payload, token) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/bom`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  }, 20000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to create BOM.");
  return data.data;
}

/**
 * PUT /api/admin/bom/{id}
 */
export async function updateBOM(id, payload, token) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/bom/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  }, 20000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to update BOM.");
  return data.data;
}

/**
 * DELETE /api/admin/bom/{id}
 */
export async function deleteBOM(id, token) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/bom/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  }, 20000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to delete BOM.");
  return true;
}
