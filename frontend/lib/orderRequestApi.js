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

// expiresInDays was missing from this list, so "Valid for 14 days" reached the server as nothing and
// every re-sent or extended quotation got the server's default 7.
export async function updateOrderRequestStatus(token, id, { status, finalPrice, note, downPayment, paymentStatus, eta, adminComment, mockupUrl, materials, expiresInDays }) {
  const body = { status };
  if (finalPrice !== undefined && finalPrice !== null) body.finalPrice = finalPrice;
  if (expiresInDays) body.expiresInDays = expiresInDays;
  if (note) body.note = note;
  if (downPayment !== undefined && downPayment !== null) body.downPayment = downPayment;
  if (paymentStatus) body.paymentStatus = paymentStatus;
  if (eta) body.eta = eta;
  if (adminComment !== undefined) body.adminComment = adminComment;
  if (mockupUrl !== undefined) body.mockupUrl = mockupUrl;
  if (materials !== undefined) body.materials = materials;

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
  return { url: data.url, publicId: data.public_id, name: data.name ?? file?.name ?? null };
}

// Admin creates a quotation straight from the chat → confirmed OrderRequest + posts the View & Pay card.
// `items` is a list so one quote can cover several products and be paid in a single transaction.
/**
 * The forms this customer filled in that nobody has quoted yet, for the attach row on a new
 * quotation. Ids and summaries - the content is copied by the server from the ask itself.
 */
export async function fetchCustomerOrderForms(token, customerId) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/customers/${customerId}/order-forms`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...ngrokHeader },
  }, 15000);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.data) ? data.data : [];
}

// Every field is named here, so a field left off this list never leaves the browser - the whole
// set of attached designs was dropped that way (only the first reached the server).
export async function createAdminQuotation(token, { recipientId, items, designFee, deliveryFee, downPayment, expiresInDays, note, designUrl, designUrls, designNotes, orderFormAskIds, deliverTo }) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/quotations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...ngrokHeader,
    },
    body: JSON.stringify({
      recipientId,
      items,
      designFee: designFee || 0,
      deliveryFee: deliveryFee || 0,
      ...(downPayment ? { downPayment } : {}),
      ...(expiresInDays ? { expiresInDays } : {}),
      note: note || '',
      ...(designUrl ? { designUrl } : {}),
      ...(designUrls?.length ? { designUrls } : {}),
      ...(designNotes ? { designNotes } : {}),
      // Which filled-in forms this quotation answers. Ids only - the server copies the content.
      ...(orderFormAskIds?.length ? { orderFormAskIds } : {}),
      // The address the delivery fee was priced for.
      ...(deliverTo ? { deliverTo } : {}),
    }),
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to send quotation');
  return data.data ?? data;
}

export async function createOrderRequestPaymentLink(token, orderRequestId, type, deliveryAddress = null, terms = null, payment = null, extra = null) {
  const res = await fetchWithTimeout(`${API_URL}/api/payment/order-request-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...ngrokHeader,
    },
    body: JSON.stringify({
      orderRequestId, type,
      ...(deliveryAddress ? { deliveryAddress } : {}),
      ...(terms ? terms : {}),
      // With a method the backend builds a Payment Intent and the customer authorises it
      // directly; without one it falls back to PayMongo's hosted page, which is what every
      // older client will keep doing.
      ...(payment ? payment : {}),
      // The delivery speed the customer picked. It is not part of the quoted price - the goods
      // were agreed, the speed was not - so the server charges it on top and records it.
      ...(extra ? extra : {}),
    }),
  }, 30000);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to create payment link');
  return data.data ?? data;
}
