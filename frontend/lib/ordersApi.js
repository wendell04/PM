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
export async function createOrder(orderData) {
  try {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
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
 * Fetch all orders (admin view)
 * @param {Object} filters - Optional filters { status, startDate, endDate }
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} List of all orders
 */
export async function fetchAllOrders(filters = {}, token) {
  try {
    const queryParams = new URLSearchParams();

    if (filters.status) queryParams.append('status', filters.status);
    if (filters.startDate) queryParams.append('start_date', filters.startDate);
    if (filters.endDate) queryParams.append('end_date', filters.endDate);

    const url = `${API_URL}/api/admin/orders${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching all orders:', error);
    throw error;
  }
}

/**
 * Fetch a single order by ID (admin view)
 * @param {string} orderId - MongoDB order ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Order details
 */
export async function fetchOrder(orderId, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/orders/${orderId}`, {
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
 * Update an order (admin - change status, etc.)
 * @param {string} orderId - MongoDB order ID
 * @param {Object} orderData - Updated order data
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated order
 */
export async function updateOrder(orderId, orderData, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/orders/${orderId}`, {
      method: 'PUT',
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
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      if (response.status === 404) {
        throw new Error('Order not found');
      }
      throw new Error(errorData.message || 'Failed to update order');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
}

/**
 * Update order status
 * @param {string} orderId - MongoDB order ID
 * @param {string} status - New status (pending, processing, completed, cancelled)
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated order
 */
export async function updateOrderStatus(orderId, status, token) {
  try {
    return await updateOrder(orderId, { status }, token);
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
}

/**
 * Cancel an order (sets status to 'cancelled')
 * @param {string} orderId - MongoDB order ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated order
 */
export async function cancelOrder(orderId, token) {
  try {
    return await updateOrder(orderId, { status: 'cancelled' }, token);
  } catch (error) {
    console.error('Error cancelling order:', error);
    throw error;
  }
}

/**
 * Get order statistics/summary
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Order statistics
 */
export async function fetchOrderStats(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/orders/stats`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      // Fallback if endpoint doesn't exist yet
      console.warn('Order stats endpoint not available yet');
      return {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        cancelled: 0,
        revenue: 0
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching order stats:', error);
    return {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0
    };
  }
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
