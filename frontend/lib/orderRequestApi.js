const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export async function fetchOrderRequests(token, status = null) {
  const url = status
    ? `${API_URL}/api/admin/order-requests?status=${encodeURIComponent(status)}`
    : `${API_URL}/api/admin/order-requests`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to fetch order requests');
  }

  const data = await res.json();
  return {
    data: data.data ?? data.requests ?? data ?? [],
    total: data.total ?? (data.data ?? data.requests ?? data)?.length ?? 0,
  };
}

export async function fetchOrderRequest(token, id) {
  const res = await fetch(`${API_URL}/api/admin/order-requests/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to fetch order request');
  }

  const data = await res.json();
  return data.data ?? data;
}

export async function updateOrderRequestStatus(token, id, { status, finalPrice, note }) {
  const body = { status };
  if (finalPrice !== undefined && finalPrice !== null) body.finalPrice = finalPrice;
  if (note) body.note = note;

  const res = await fetch(`${API_URL}/api/admin/order-requests/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to update order request status');
  }

  const data = await res.json();
  return data.data ?? data;
}
