/**
 * Products API Utility Functions
 * Connects products storefront to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Import timeout helper
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Fetch all products (public storefront)
 * @param {Object} filters - Optional filters { category, tag, search }
 * @returns {Promise<Array>} List of products
 */
export async function fetchProducts(filters = {}) {
  try {
    const queryParams = new URLSearchParams();

    if (filters.category) queryParams.append('category', filters.category);
    if (filters.tag) queryParams.append('tag', filters.tag);
    if (filters.search) queryParams.append('search', filters.search);

    const url = `${API_URL}/api/products${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 20000);

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

/**
 * Fetch a single product by ID (public storefront)
 * @param {string} productId - MongoDB product ID
 * @returns {Promise<Object>} Product details
 */
export async function fetchProduct(productId) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/products/${productId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 20000);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Product not found');
      }
      throw new Error(`Failed to fetch product: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

/**
 * Search products by query string (public endpoint)
 * @param {string} query - Search query (min 2 characters)
 * @param {string} category - Optional category filter
 * @returns {Promise<Array>} List of matching products (max 8)
 */
export async function fetchProductSearch(query, category = '') {
  try {
    const queryParams = new URLSearchParams();
    queryParams.append('q', query);
    if (category) queryParams.append('category', category);

    const url = `${API_URL}/api/products/search?${queryParams.toString()}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 8000);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error searching products:', error);
    return [];
  }
}
