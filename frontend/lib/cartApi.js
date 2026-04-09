/**
 * Cart API Utility Functions
 * Connects cart management to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Import timeout helper
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Get authentication token from storage
 */
function getAuthToken() {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}

/**
 * Fetch current user's cart from MongoDB
 * @returns {Promise<Object|null>} Cart object or null if empty
 */
export async function fetchCart(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/cart`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login to view cart');
      }
      throw new Error(`Failed to fetch cart: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching cart:', error);
    throw error;
  }
}

/**
 * Sync cart items to backend (save/replace entire cart)
 * @param {Array} items - Array of cart items to save
 * @returns {Promise<Object>} Updated cart object
 */
export async function syncCart(items, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/cart/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ items }),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login to sync cart');
      }
      throw new Error(errorData.error || 'Failed to sync cart');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error syncing cart:', error);
    throw error;
  }
}

/**
 * Merge guest cart items with user's cart (on login)
 * @param {Array} guestItems - Array of guest cart items to merge
 * @returns {Promise<Object>} Merged cart object
 */
export async function mergeCart(guestItems, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/cart/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ items: guestItems }),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login to merge cart');
      }
      throw new Error(errorData.error || 'Failed to merge cart');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error merging cart:', error);
    throw error;
  }
}

/**
 * Clear user's cart
 * @returns {Promise<Object>} Result of clear operation
 */
export async function clearCart(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/cart/clear`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login to clear cart');
      }
      throw new Error(errorData.error || 'Failed to clear cart');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error clearing cart:', error);
    throw error;
  }
}
