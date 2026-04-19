const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Submit a walk-in / POS order.
 * POST /api/admin/orders/walk-in
 */
export async function submitWalkInOrder(token, payload) {
  const res = await fetchWithTimeout(
    `${API_URL}/api/admin/orders/walk-in`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
    30000
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.message ||
      (typeof data.errors === 'object' && data.errors && JSON.stringify(data.errors)) ||
      'Failed to submit walk-in order.';
    throw new Error(msg);
  }
  return data;
}
