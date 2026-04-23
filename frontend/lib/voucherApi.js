import { fetchWithTimeout } from './fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// ── Admin ────────────────────────────────────────────────────────────────────

export async function fetchVouchers(token) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/vouchers`, {
    headers: { Authorization: `Bearer ${token}` },
  }, 30000);
  if (!res.ok) throw new Error('Failed to fetch vouchers.');
  return res.json();
}

export async function createVoucher(token, payload) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/vouchers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to create voucher.');
  return data;
}

export async function updateVoucher(token, id, payload) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/vouchers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to update voucher.');
  return data;
}

export async function deleteVoucher(token, id) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/vouchers/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to delete voucher.');
  return data;
}

export async function toggleVoucher(token, id) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/vouchers/${id}/toggle`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to toggle voucher.');
  return data;
}

// ── Customer ─────────────────────────────────────────────────────────────────

export async function applyVoucher(token, code, subtotal) {
  const res = await fetchWithTimeout(`${API_URL}/api/vouchers/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, subtotal }),
  }, 15000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Invalid voucher code.');
  return data;
}
