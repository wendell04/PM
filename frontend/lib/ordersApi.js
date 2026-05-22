/**
 * Orders API Utility Functions
 * Connects orders management to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Import timeout helper
import { fetchWithTimeout } from './fetchWithTimeout';

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER ORDER ENDPOINTS (for storefront)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new order (customer places order)
 * @param {Object} orderData - Order data to create
 * @returns {Promise<Object>} Created order
 */
export async function createOrder(orderData, token) {
  try {
    if (!token) throw new Error('Unauthorized');
    const response = await fetchWithTimeout(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(orderData),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login to place order');
      }
      throw new Error(errorData.message || 'Failed to create order');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ORDER ENDPOINTS (for admin dashboard)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get order statistics/summary
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Order statistics
 */
export async function fetchOrderStats(token) {
  const res = await fetchWithTimeout(
    `${API_URL}/api/admin/orders/stats`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
    15000,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch order stats (${res.status})`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW SCHEMA ADMIN ORDER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize API order response to frontend shape
 * @param {Object} apiOrder - Raw order from API
 * @returns {Object} Normalized order object
 */
function normalizeOrder(apiOrder) {
  const items = apiOrder.items || [];

  // Compute product name summary
  let productName = 'No items';
  if (items.length === 1) {
    const name    = items[0].product_name || items[0].productName || 'Product';
    const variant = items[0].variantName  || items[0].variant_name || null;
    productName   = variant ? `${name} — ${variant}` : name;
  } else if (items.length > 1) {
    const names       = items.map(i => i.product_name || i.productName || 'Product');
    const uniqueNames = [...new Set(names)];
    if (uniqueNames.length === 1) {
      productName = `${uniqueNames[0]} ×${items.length}`;
    } else {
      productName = `${uniqueNames[0]} +${uniqueNames.length - 1} more`;
    }
  }

  // Compute total quantity
  const quantity = items.reduce((sum, item) => sum + ((item.qty || item.quantity) || 0), 0);

  // Get first item category
  const category = items[0]?.category || '';
  const variant = items[0]?.variantName || items[0]?.variant_name || '';

  const paymentHistory = apiOrder.paymentHistory || [];
  const paid = paymentHistory.length > 0
    ? paymentHistory
        .filter(p => p.status === 'completed' || p.status === 'paid')
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    : parseFloat(apiOrder.downPayment || apiOrder.down_payment || 0);

  const designFilePath = apiOrder.designFilePath || apiOrder.design_file_path || null;
  const designs = designFilePath
    ? [{
        name: designFilePath.split('/').pop() || 'design-file',
        url: designFilePath.startsWith('http')
          ? designFilePath
          : `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/storage/${designFilePath}`,
        uploadedAt: apiOrder.createdAt || apiOrder.created_at || null,
      }]
    : [];

  const normalizedStatus = apiOrder.orderStatus || apiOrder.status || 'Pending';
  const totalAmount = parseFloat(
    apiOrder.totalAmount || apiOrder.total || apiOrder.totalPrice || 0
  );
  const isCustom = !!(items[0]?.isCustom || apiOrder.designFilePath || apiOrder.design_file_path);
  const productType = isCustom ? 'Customized' : 'Ready Made';

  return {
    id: apiOrder._id || apiOrder.id,
    isArchived: !!(apiOrder.isArchived),
    orderNumber: apiOrder.order_number || apiOrder.orderId,
    customer: {
      name:  apiOrder.userSnapshot?.name  || apiOrder.customer?.name  || apiOrder.customerName  || 'Unknown',
      email: apiOrder.userSnapshot?.email || apiOrder.customer?.email || apiOrder.customerEmail || '',
      phone: apiOrder.userSnapshot?.phone || apiOrder.customer?.phone || apiOrder.customerContact || '',
    },
    customerName:    apiOrder.userSnapshot?.name  || apiOrder.customer?.name  || apiOrder.customerName  || 'Unknown',
    customerEmail:   apiOrder.userSnapshot?.email || apiOrder.customer?.email || apiOrder.customerEmail || '',
    customerContact: apiOrder.userSnapshot?.phone || apiOrder.customer?.phone || apiOrder.customerContact || '',
    items: items,
    isCustom: isCustom,
    productType: productType,
    productName: productName,
    category: category,
    variant: variant,
    quantity: quantity,
    subtotal: apiOrder.subtotal || 0,
    shippingFee: apiOrder.shipping_fee || apiOrder.shippingFee || 0,
    total: totalAmount,
    totalPrice: totalAmount,
    paid: paid,
    downPayment: parseFloat(apiOrder.down_payment || apiOrder.downPayment || 0),
    balance: apiOrder.balance || 0,
    status: normalizedStatus,
    orderStatus: normalizedStatus,
    paymentStatus: apiOrder.payment_status || apiOrder.paymentStatus || 'unpaid',
    paymentMethod: apiOrder.payment_method || apiOrder.paymentMethod || '',
    shippingAddress: apiOrder.shipping_address || apiOrder.shippingAddress || {},
    courierName: apiOrder.courier_name || apiOrder.courierName || '',
    trackingNumber: apiOrder.tracking_number || apiOrder.trackingNumber || '',
    notes: apiOrder.notes || '',
    joId: apiOrder.jo_id || apiOrder.joId || '',
    joStatus: apiOrder.jo_status || apiOrder.joStatus || '',
    isRush: apiOrder.is_rush || apiOrder.isRush || false,
    targetCompletion: apiOrder.target_completion || apiOrder.targetCompletion || null,
    createdAt: apiOrder.created_at || apiOrder.createdAt || null,
    updatedAt: apiOrder.updated_at || apiOrder.updatedAt || null,
    paymentHistory: paymentHistory,
    orderSource: apiOrder.orderSource || 'online',
    designs: designs,
    bom: { verified: false, items: [] },
    timeline: [],
    jo: apiOrder.jobOrder
      ? {
          _id:        apiOrder.jobOrder._id || apiOrder.jobOrder.id || null,
          id:         apiOrder.jobOrder._id || apiOrder.jobOrder.id || null,
          targetDate: apiOrder.jobOrder.targetCompletion || null,
          assignedTo: apiOrder.jobOrder.assignedTo || null,
          rush:       apiOrder.jobOrder.isRush || false,
          status:     apiOrder.jobOrder.joStatus || null,
        }
      : null,
  };
}

/**
 * Fetch all orders (new schema - admin view)
 * @param {string} token - Authentication token
 * @param {{ page?: number, limit?: number }} [opts]
 * @returns {Promise<Array>} List of normalized orders
 */
export async function fetchAllOrdersNew(token, opts = {}) {
  try {
    const page = opts.page != null ? Math.max(1, parseInt(String(opts.page), 10) || 1) : 1;
    const limit = opts.limit != null ? Math.min(200, Math.max(1, parseInt(String(opts.limit), 10) || 50)) : 50;
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (opts.showArchived) qs.set('showArchived', '1');
    const response = await fetchWithTimeout(`${API_URL}/api/orders?${qs}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 20000);

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    const data = await response.json();
    const orders = data.orders || [];
    return orders.map(normalizeOrder);
  } catch (error) {
    console.error('Error fetching all orders (new schema):', error);
    throw error;
  }
}

/**
 * Fetch a single order by ID (new schema - admin view)
 * @param {string} orderId - MongoDB order ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Normalized order details
 */
export async function fetchOrderNew(orderId, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 20000);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Order not found');
      }
      throw new Error(`Failed to fetch order: ${response.statusText}`);
    }

    const data = await response.json();
    return normalizeOrder(data.order);
  } catch (error) {
    console.error('Error fetching order (new schema):', error);
    throw error;
  }
}

/**
 * Update order status (new schema endpoint)
 * @param {string} orderId - MongoDB order ID
 * @param {string} status - New status
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated order (normalized)
 */
export async function updateOrderStatusNew(orderId, status, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ orderStatus: status }),
    }, 15000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      if (response.status === 404) {
        throw new Error('Order not found');
      }
      throw new Error(errorData.message || 'Failed to update order status');
    }

    const data = await response.json();
    return normalizeOrder(data.order);
  } catch (error) {
    console.error('Error updating order status (new schema):', error);
    throw error;
  }
}

/**
 * Update order (admin) — maps to PATCH /orders/{id}/status
 * Accepts a partial order object; only orderStatus is sent to backend.
 * @param {string} orderId
 * @param {Object} updatedOrder - { orderStatus: string, ...rest ignored by backend }
 * @param {string} token
 * @returns {Promise<Object>} Normalized order
 */
export async function updateOrder(orderId, updatedOrder, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ orderStatus: updatedOrder.orderStatus }),
    }, 15000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      if (response.status === 404) {
        throw new Error('Order not found');
      }
      throw new Error(errorData.message || 'Failed to update order');
    }

    const data = await response.json();
    return normalizeOrder(data.order);
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
}

/**
 * Update a Job Order's status
 * Maps to PUT /api/admin/job-orders/{joId}
 * @param {string} joId - The JobOrder document _id
 * @param {string} joStatus - 'Queued' | 'In Progress' | 'Completed'
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function updateJobOrderStatus(joId, joStatus, token) {
  if (!joId) return;
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/admin/job-orders/${joId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': '1',
        },
        body: JSON.stringify({ joStatus }),
      },
      15000
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to update job order status:', errorData.message || response.status);
    }
  } catch (error) {
    console.error('Error updating job order status:', error);
    // Non-fatal — do not rethrow. Order status update already succeeded.
  }
}

/**
 * Alias: fetchAllOrders → fetchAllOrdersNew
 * Fixes broken imports in inventory, job-orders, orders, products pages.
 */
/**
 * Fetch all orders for admin orders-preview page
 * Maps to GET /api/admin/orders
 * @param {string} token
 * @returns {Promise<Array>} Normalized orders array
 */
export async function fetchAdminOrders(token) {
  const response = await fetchWithTimeout(
    `${API_URL}/api/admin/orders`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    },
    20000
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch admin orders (${response.status})`);
  }
  const data = await response.json();
  const orders = data.data || data.orders || [];
  return orders.map(normalizeOrder);
}

/**
 * Create a Job Order for an existing order (admin)
 * Maps to POST /api/admin/job-orders
 * @param {Object} payload - { orderId, product, targetCompletion, isRush, assignedTo, notes }
 * @param {string} token
 * @returns {Promise<Object>} Created job order
 */
export async function createJobOrder(payload, token) {
  const response = await fetchWithTimeout(
    `${API_URL}/api/admin/job-orders`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
    15000
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create job order (${response.status})`);
  }
  return response.json();
}

/**
 * Submit QC result for a Job Order (admin)
 * Maps to POST /api/admin/job-orders/{id}/qc
 * @param {string} jobOrderId - JobOrder _id (MongoDB)
 * @param {Object} payload - { passed: bool, defects: string, checkedBy: string }
 * @param {string} token
 * @returns {Promise<Object>} Updated job order
 */
export async function submitJobOrderQC(jobOrderId, payload, token) {
  const response = await fetchWithTimeout(
    `${API_URL}/api/admin/job-orders/${jobOrderId}/qc`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
    15000
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to submit QC result (${response.status})`);
  }
  return response.json();
}

/**
 * Record a cash payment against an order (admin)
 * Maps to POST /api/admin/orders/{id}/record-payment
 * @param {string} orderId - Order _id (MongoDB)
 * @param {Object} payload - { amount: float, method: string, note: string }
 * @param {string} token
 * @returns {Promise<Object>} Updated order (raw, not normalized)
 */
export async function recordOrderPayment(orderId, payload, token) {
  const response = await fetchWithTimeout(
    `${API_URL}/api/admin/orders/${orderId}/record-payment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
    15000
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to record payment (${response.status})`);
  }
  return response.json();
}

/**
 * Alias: fetchAllOrders → fetchAllOrdersNew
 * Fixes broken imports in inventory, job-orders, orders, products pages.
 */
export { fetchAllOrdersNew as fetchAllOrders };

/**
 * Soft-delete (archive) an order (admin/owner only)
 * Maps to DELETE /api/admin/orders/{id}
 */
export async function deleteOrder(orderId, token) {
  const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${orderId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  }, 15000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to archive order');
  }
  return res.json();
}
