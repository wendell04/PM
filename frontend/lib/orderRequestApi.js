import { fetchWithTimeout } from './fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export async function fetchOrderRequests(token, status = null) {
  const url = status
    ? `${API_URL}/api/admin/order-requests?status=${encodeURIComponent(status)}`
    : `${API_URL}/api/admin/order-requests`;

  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  }, 30000);

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
  const res = await fetchWithTimeout(`${API_URL}/api/admin/order-requests/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, 30000);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to fetch order request');
  }

  const data = await res.json();
  return data.data ?? data;
}

export async function updateOrderRequestStatus(token, id, { status, finalPrice, note, downPayment, paymentStatus, eta, adminComment, mockupUrl }) {
  const body = { status };
  if (finalPrice !== undefined && finalPrice !== null) body.finalPrice = finalPrice;
  if (note) body.note = note;
  if (downPayment !== undefined && downPayment !== null) body.downPayment = downPayment;
  if (paymentStatus) body.paymentStatus = paymentStatus;
  if (eta) body.eta = eta;
  if (adminComment !== undefined) body.adminComment = adminComment;
  if (mockupUrl !== undefined) body.mockupUrl = mockupUrl;

  const res = await fetchWithTimeout(`${API_URL}/api/admin/order-requests/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  }, 30000);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to update order request status');
  }

  const data = await res.json();
  return data.data ?? data;
}

const ngrokHeader = API_URL.includes('ngrok')
  ? { 'ngrok-skip-browser-warning': '1' }
  : {};

export async function submitOrderRequest(token, {
  productId,
  quantity,
  selectedVariants,
  designUrl,
  designNotes,
  isCustom,
}) {
  const res = await fetchWithTimeout(`${API_URL}/api/order-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...ngrokHeader,
    },
    body: JSON.stringify({
      productId,
      quantity,
      selectedVariants: selectedVariants ?? {},
      designUrl: designUrl ?? null,
      designNotes: designNotes ?? null,
      isCustom: isCustom ?? true,
    }),
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to submit order request');
  return data.data ?? data;
}

export async function fetchMyOrderRequests(token) {
  const res = await fetchWithTimeout(`${API_URL}/api/my/order-requests`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...ngrokHeader,
    },
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch order requests');
  return data.data ?? data ?? [];
}

export async function fetchMyOrderRequest(token, id) {
  const res = await fetchWithTimeout(`${API_URL}/api/shop/order-requests/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...ngrokHeader,
    },
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch order request');
  return data.data ?? data;
}

export async function cancelMyOrderRequest(token, id) {
  const res = await fetchWithTimeout(`${API_URL}/api/order-requests/my/${id}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...ngrokHeader,
    },
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to cancel order request');
  return data.data ?? data;
}

export async function uploadDesignFile(token, file) {
  const formData = new FormData();
  formData.append('design', file);
  const res = await fetchWithTimeout(`${API_URL}/api/order-requests/upload-design`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...ngrokHeader,
    },
    body: formData,
  }, 60000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to upload design file');
  return { url: data.url, publicId: data.public_id };
}

export async function createOrderRequestPaymentLink(token, orderRequestId, type) {
  const res = await fetchWithTimeout(`${API_URL}/api/payment/order-request-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...ngrokHeader,
    },
    body: JSON.stringify({ orderRequestId, type }),
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to create payment link');
  return data.data ?? data;
}
