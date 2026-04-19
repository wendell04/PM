const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

import { fetchWithTimeout } from "./fetchWithTimeout";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * GET /api/admin/units
 */
export async function fetchUnits(token) {
  const res = await fetchWithTimeout(
    `${API_URL}/api/admin/units`,
    { method: "GET", headers: authHeaders(token) },
    20000,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to fetch units.");
  return data.data ?? [];
}

/**
 * POST /api/admin/units — create or update (upsert)
 */
export async function saveUnit(payload, token) {
  const res = await fetchWithTimeout(
    `${API_URL}/api/admin/units`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    },
    20000,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to save unit.");
  return data.data ?? data;
}

export const createUnit = saveUnit;
