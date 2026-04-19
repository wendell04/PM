/**
 * Sales API Utility Functions
 * Connects sales management to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Import timeout helper
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Fetch all sales records from MongoDB
 * @param {Object} filters - Optional filters { source, status, startDate, endDate, inventoryId }
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} List of sales records
 */
export async function fetchSales(filters = {}, token) {
  try {
    // Build query string from filters
    const queryParams = new URLSearchParams();
    if (filters.source) queryParams.append('source', filters.source);
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);
    if (filters.inventoryId) queryParams.append('inventoryId', filters.inventoryId);
    if (filters.limit != null) queryParams.append('limit', String(filters.limit));

    const url = `${API_URL}/api/admin/sales${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

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
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login again');
      }
      throw new Error(`Failed to fetch sales: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching sales:', error);
    throw error;
  }
}

/**
 * Fetch sales summary/statistics
 * @param {Object} filters - Optional filters { startDate, endDate }
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Sales summary object
 */
export async function fetchSalesSummary(filters = {}, token) {
  try {
    // Build query string from filters
    const queryParams = new URLSearchParams();
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);

    const url = `${API_URL}/api/admin/sales/summary${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

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
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login again');
      }
      throw new Error(`Failed to fetch sales summary: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    throw error;
  }
}

/**
 * Fetch a single sale by ID
 * @param {string} saleId - MongoDB sale ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Sale object
 */
export async function fetchSale(saleId, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/sales/${saleId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Sale not found');
      }
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login again');
      }
      throw new Error(`Failed to fetch sale: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching sale:', error);
    throw error;
  }
}

/**
 * Create a new sale record
 * @param {Object} saleData - Sale data to create
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Created sale object
 */
export async function createSale(saleData, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(saleData),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login again');
      }
      throw new Error(errorData.error || 'Failed to create sale');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error creating sale:', error);
    throw error;
  }
}

/**
 * Update an existing sale record
 * @param {string} saleId - MongoDB sale ID
 * @param {Object} saleData - Updated sale data
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated sale object
 */
export async function updateSale(saleId, saleData, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/sales/${saleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(saleData),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 404) {
        throw new Error('Sale not found');
      }
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      if (response.status === 401) {
        throw new Error('Unauthenticated: Please login again');
      }
      throw new Error(errorData.error || 'Failed to update sale');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error updating sale:', error);
    throw error;
  }
}
