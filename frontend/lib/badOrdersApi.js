const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

import { fetchWithTimeout } from './fetchWithTimeout';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchBadOrders(token, params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.materialId) q.set('materialId', params.materialId);
  const url = `${API_URL}/api/admin/returns${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithTimeout(url, { method: 'GET', headers: authHeaders(token) }, 15000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to load bad orders.');
  const inner = data.data ?? data;
  return Array.isArray(inner) ? inner : [];
}

export async function fetchBadOrderStats(token) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/returns/stats`, {
    method: 'GET',
    headers: authHeaders(token),
  }, 15000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to load stats.');
  return data.data ?? data;
}

export async function updateBadOrderStatus(token, id, body) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/returns/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, 15000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to update status.');
  return data.data ?? data;
}

export async function createBadOrder(token, body) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/returns`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, 20000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to record bad order.');
  return data.data ?? data;
}
