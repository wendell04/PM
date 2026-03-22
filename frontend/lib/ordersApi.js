/**
 * Orders API Utility Functions
 * Connects orders management to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Import timeout helper
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Get authentication token from storage
 */
function getAuthToken() {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER ORDER ENDPOINTS (for storefront)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch current user's orders (customer view)
 * @returns {Promise<Array>} List of user's orders
 */
export async function fetchMyOrders() {
  try {
    const token = getAuthToken();
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
export async function fetchMyOrder(orderId) {
  try {
    const token = getAuthToken();
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
    const token = getAuthToken();
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
      throw new Error(errorData.error || 'Failed to create order');
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
 * @returns {Promise<Array>} List of all orders
 */
export async function fetchAllOrders(filters = {}) {
  try {
    const token = getAuthToken();
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
 * @returns {Promise<Object>} Order details
 */
export async function fetchOrder(orderId) {
  try {
    const token = getAuthToken();
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
 * @returns {Promise<Object>} Updated order
 */
export async function updateOrder(orderId, orderData) {
  try {
    const token = getAuthToken();
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
      throw new Error(errorData.error || 'Failed to update order');
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
 * @returns {Promise<Object>} Updated order
 */
export async function updateOrderStatus(orderId, status) {
  try {
    return await updateOrder(orderId, { status });
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
}

/**
 * Cancel an order (sets status to 'cancelled')
 * @param {string} orderId - MongoDB order ID
 * @returns {Promise<Object>} Updated order
 */
export async function cancelOrder(orderId) {
  try {
    return await updateOrder(orderId, { status: 'cancelled' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    throw error;
  }
}

/**
 * Get order statistics/summary
 * @returns {Promise<Object>} Order statistics
 */
export async function fetchOrderStats() {
  try {
    const token = getAuthToken();
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
