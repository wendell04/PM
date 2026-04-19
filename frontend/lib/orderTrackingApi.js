import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export async function fetchMyOrders(token) {
  const res = await fetchWithTimeout(`${API_URL}/api/shop/order-requests`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  }, 20000);
  if (res.status === 401) {
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to fetch orders');
  }

  const data = await res.json();
  return data.data ?? data ?? [];
}

export async function fetchMyOrder(token, id) {
  const res = await fetchWithTimeout(`${API_URL}/api/shop/order-requests/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  }, 20000);
  if (res.status === 401) {
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to fetch order');
  }

  const data = await res.json();
  return data.data ?? data;
}
