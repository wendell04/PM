/**
 * Product API Utility Functions
 * Connects admin dashboard to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Import timeout helper
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Fetch all products from MongoDB (admin view - includes unpublished/inactive)
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} List of products
 */
export async function fetchProducts(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/products`, {
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
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login again');
      }
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
}

/**
 * Fetch available inventory items (not linked to products)
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} List of available inventory items
 */
export async function fetchAvailableInventory(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/products/available-inventory`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      throw new Error('Failed to fetch available inventory');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching available inventory:', error);
    throw error;
  }
}

/**
 * Create a new product
 * @param {Object} productData - Product data to create
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Created product
 */
export async function createProduct(productData, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(productData),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      throw new Error(errorData.error || 'Failed to create product');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
}

/**
 * Update an existing product
 * @param {string} productId - MongoDB product ID
 * @param {Object} productData - Updated product data
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated product
 */
export async function updateProduct(productId, productData, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/products/${productId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(productData),
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
        throw new Error('Product not found');
      }
      throw new Error(errorData.error || 'Failed to update product');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
}

/**
 * Delete (deactivate) a product
 * @param {string} productId - MongoDB product ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteProduct(productId, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/products/${productId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      if (response.status === 404) {
        throw new Error('Product not found');
      }
      throw new Error(errorData.error || 'Failed to delete product');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
}

/**
 * Toggle product publish status
 * @param {string} productId - MongoDB product ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Result with new publish status
 */
export async function togglePublishProduct(productId, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/products/${productId}/toggle-publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      if (response.status === 404) {
        throw new Error('Product not found');
      }
      throw new Error(errorData.error || 'Failed to toggle publish status');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error toggling publish status:', error);
    throw error;
  }
}

/**
 * Upload image to Cloudinary via backend
 * @param {File} file - Image file to upload
 * @param {string} folder - Upload folder (optional)
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Upload result with URL and public_id
 */
export async function uploadImage(file, folder = 'pmp-products', token) {
  try {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folder', folder);

    const response = await fetchWithTimeout(`${API_URL}/api/admin/upload-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    }, 60000); // 60s — Cloudinary upload can be slow on dev

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      throw new Error(errorData.error || 'Failed to upload image');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

/**
 * Bulk update products (publish/unpublish/archive)
 * @param {Array<string>} productIds - List of product IDs to update
 * @param {Object} updates - Fields to update (e.g., { isPublished: true })
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Result of bulk update
 */
export async function bulkUpdateProducts(productIds, updates, token) {
  try {
    // Note: You may need to add a bulk update endpoint to your backend
    // For now, this is a placeholder for individual updates
    const results = await Promise.all(
      productIds.map(id => updateProduct(id, updates, token))
    );
    return { success: true, count: results.length };
  } catch (error) {
    console.error('Error bulk updating products:', error);
    throw error;
  }
}
