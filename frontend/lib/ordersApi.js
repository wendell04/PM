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
 * Fetch current user's orders (customer view)
 * @returns {Promise<Array>} List of user's orders
 */
export async function fetchMyOrders(token) {
  try {
    if (!token) throw new Error('Unauthorized');
    const response = await fetchWithTimeout(`${API_URL}/api/orders/my`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login to view orders');
      }
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching my orders:', error);
    throw error;
  }
}

/**
 * Fetch a single order by ID (customer view)
 * @param {string} orderId - MongoDB order ID
 * @returns {Promise<Object>} Order details
 */
export async function fetchMyOrder(orderId, token) {
  try {
    if (!token) throw new Error('Unauthorized');
    const response = await fetchWithTimeout(`${API_URL}/api/orders/my/${orderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Order not found');
      }
      throw new Error(`Failed to fetch order: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
}

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
  const res = await fetch(`${API_URL}/api/admin/order-stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
    productName = items[0].product_name || items[0].productName || 'Product';
  } else if (items.length > 1) {
    const firstName = items[0].product_name || items[0].productName || 'Product';
    productName = `${firstName} +${items.length - 1} more`;
  }

  // Compute total quantity
  const quantity = items.reduce((sum, item) => sum + ((item.qty || item.quantity) || 0), 0);

  // Get first item category
  const category = items[0]?.category || '';

  return {
    id: apiOrder._id || apiOrder.id,
    orderNumber: apiOrder.order_number || apiOrder.orderId,
    customerName: apiOrder.customer?.name || apiOrder.userSnapshot?.name || apiOrder.customerName || 'Unknown',
    customerEmail: apiOrder.customer?.email || apiOrder.userSnapshot?.email || apiOrder.customerEmail || '',
    customerContact: apiOrder.customer?.phone || apiOrder.userSnapshot?.phone || apiOrder.customerContact || '',
    items: items,
    productName: productName,
    category: category,
    quantity: quantity,
    subtotal: apiOrder.subtotal || 0,
    shippingFee: apiOrder.shipping_fee || apiOrder.shippingFee || 0,
    totalPrice: apiOrder.total || apiOrder.totalAmount || apiOrder.totalPrice || 0,
    downPayment: apiOrder.down_payment || apiOrder.downPayment || 0,
    balance: apiOrder.balance || 0,
    orderStatus: apiOrder.order_status || apiOrder.orderStatus || apiOrder.status || 'Pending',
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
  };
}

/**
 * Fetch all orders (new schema - admin view)
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} List of normalized orders
 */
export async function fetchAllOrdersNew(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/orders`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000);

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
    }, 10000);

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
      body: JSON.stringify({ order_status: status }),
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
export { fetchAllOrdersNew as fetchAllOrders };
