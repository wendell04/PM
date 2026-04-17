const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Fetch all active + published products for the POS product picker.
 * Reuses the existing public products endpoint.
 */
export async function fetchPosProducts(token, search = '') {
  const params = new URLSearchParams();
  if (search) params.set('search', search);

  const res = await fetch(`${API_URL}/api/products?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch products.');
  const data = await res.json();
  // Support both { data: [] } and plain array shapes
  return Array.isArray(data) ? data : (data.data ?? []);
}

/**
 * Submit a walk-in / POS order.
 */
export async function submitWalkInOrder(token, payload) {
  const res = await fetch(`${API_URL}/api/admin/orders/walk-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to submit walk-in order.');
  return data;
}

