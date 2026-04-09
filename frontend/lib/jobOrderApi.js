import { fetchWithTimeout } from './fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Fetch all job orders with optional filters
 * @param {string} token
 * @param {Object} filters — { status, isRush, orderId }
 */
export async function fetchJobOrders(token, filters = {}) {
  const params = new URLSearchParams();
  if (filters.status)  params.append('status',  filters.status);
  if (filters.isRush !== undefined) params.append('isRush', filters.isRush);
  if (filters.orderId) params.append('orderId', filters.orderId);
  const url = `${API_URL}/api/admin/job-orders${params.toString() ? `?${params}` : ''}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  }, 10000);
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Failed to fetch job orders');
  }
  const data = await res.json();
  return data.data ?? data ?? [];
}

/**
 * Fetch a single job order by ID
 */
export async function fetchJobOrder(token, id) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/job-orders/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  }, 10000);
  if (res.status === 401) throw new Error('Unauthorized');
  if (res.status === 404) throw new Error('Job order not found');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Failed to fetch job order');
  }
  const data = await res.json();
  return data.data ?? data;
}

/**
 * Create a new job order
 */
export async function createJobOrder(token, payload) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/job-orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, 15000);
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Failed to create job order');
  }
  const data = await res.json();
  return data.data ?? data;
}

/**
 * Update a job order (status, targetCompletion, isRush,
 *                      assignedTo, notes)
 */
export async function updateJobOrder(token, id, payload) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/job-orders/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, 15000);
  if (res.status === 401) throw new Error('Unauthorized');
  if (res.status === 404) throw new Error('Job order not found');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Failed to update job order');
  }
  const data = await res.json();
  return data.data ?? data;
}

/**
 * Fetch schedule (non-completed JOs in date range)
 * @param {string} token
 * @param {Object} range — { startDate, endDate } YYYY-MM-DD strings
 */
export async function fetchJobOrderSchedule(token, range = {}) {
  const params = new URLSearchParams();
  if (range.startDate) params.append('startDate', range.startDate);
  if (range.endDate)   params.append('endDate',   range.endDate);
  const url = `${API_URL}/api/admin/job-orders/schedule${params.toString() ? `?${params}` : ''}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  }, 10000);
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Failed to fetch schedule');
  }
  const data = await res.json();
  return data.data ?? data ?? [];
}
