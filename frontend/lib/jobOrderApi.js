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
  }, 20000);
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
  }, 20000);
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
 * Batch create — one job order per selected printable item of a mixed order.
 * @param {string} token
 * @param {Object} payload — { orderId, items:[{itemIndex, product}], targetCompletion, isRush, notes }
 * @returns {Array} the created job orders
 */
export async function createJobOrdersBatch(token, payload) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/job-orders/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, 20000);
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Failed to create job orders');
  }
  const data = await res.json();
  return data.data ?? data ?? [];
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
 * Delete a job order (guarded server-side to Queued/Cancelled — test/junk cleanup).
 */
export async function deleteJobOrder(token, id) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/job-orders/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  }, 15000);
  if (res.status === 401) throw new Error('Unauthorized');
  if (res.status === 404) throw new Error('Job order not found');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Failed to delete job order');
  }
  return true;
}


/**
 * Attach print-ready artwork to a job order.
 *
 * Distinct from the customer's proof: the proof is a picture of the finished product for approval,
 * this is the file the machine consumes - a DTF layout at the right size, mirrored, with bleed - and
 * it differs per item even when the artwork is shared. The timeout scales with the batch because each
 * file is relayed to Cloudinary in turn.
 */
export async function uploadProductionFiles(token, id, files, note) {
  const form = new FormData();
  Array.from(files).forEach(f => form.append('files[]', f));
  if (note) form.append('note', note);

  const res = await fetchWithTimeout(`${API_URL}/api/admin/job-orders/${id}/production-files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: form,
  }, 60000 + files.length * 110000, 0);

  if (res.status === 401) throw new Error('Unauthorized');
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || 'Failed to upload production files');
  return d.data ?? d;
}

export async function deleteProductionFile(token, id, index) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/job-orders/${id}/production-files/${index}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  }, 15000);
  if (res.status === 401) throw new Error('Unauthorized');
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || 'Failed to remove file');
  return d.data ?? d;
}

/**
 * Report material ruined on the shop floor, against the job that ruined it.
 *
 * `kind` is required rather than inferred: normal spoilage is an expected rate that belongs in the
 * job's cost, abnormal spoilage is a mistake that is deliberately kept out of it.
 *
 * `materials` says WHICH components were actually lost. Spoilage at different stages destroys
 * different things - a mug that breaks before printing costs a mug and nothing else - so deducting the
 * whole BOM every time would write off material still sitting on the shelf.
 */
export async function reportSpoilage(token, id, { quantity, kind, reason, materials }) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/job-orders/${id}/spoilage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: JSON.stringify({ quantity, kind, reason, materials }),
  }, 20000);
  if (res.status === 401) throw new Error('Unauthorized');
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || d.error || 'Failed to record spoilage');
  return d.data ?? d;
}
