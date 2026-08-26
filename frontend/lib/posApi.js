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

/**
 * What can actually be built right now, per variant.
 *
 * Reuses the endpoint the quotation modal already relies on: it returns every variant with its own
 * `canBuild` count, derived from each material's stock minus what is already reserved. `canBuild` is
 * null when nothing constrains it (every material is bought per order), which is not the same as
 * zero and must not be treated as "out of stock".
 */
export async function fetchProductAvailability(token, productId) {
  const res = await fetchWithTimeout(
    `${API_URL}/api/admin/products/${productId}/bom-components`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    15000
  );
  if (!res.ok) return { hasBom: false, variants: [] };
  const data = await res.json().catch(() => ({}));
  return data.data ?? { hasBom: false, variants: [] };
}
