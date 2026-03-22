/**
 * Inventory API Utility Functions
 * Connects inventory management to MongoDB backend via Laravel API
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

/**
 * Fetch all inventory items from MongoDB
 * @returns {Promise<Array>} List of inventory items
 */
export async function fetchInventory() {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/inventory`, {
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
      throw new Error(`Failed to fetch inventory: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching inventory:', error);
    throw error;
  }
}

/**
 * Fetch a single inventory item by ID
 * @param {string} inventoryId - MongoDB inventory ID
 * @returns {Promise<Object>} Inventory item
 */
export async function fetchInventoryItem(inventoryId) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/inventory/${inventoryId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Inventory item not found');
      }
      throw new Error(`Failed to fetch inventory: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    throw error;
  }
}

/**
 * Fetch inventory stock history
 * @param {string} inventoryId - MongoDB inventory ID
 * @returns {Promise<Array>} Stock history records
 */
export async function fetchInventoryHistory(inventoryId) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/inventory/${inventoryId}/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      throw new Error(`Failed to fetch inventory history: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching inventory history:', error);
    throw error;
  }
}

/**
 * Create a new inventory item
 * @param {Object} inventoryData - Inventory data to create
 * @returns {Promise<Object>} Created inventory item
 */
export async function createInventory(inventoryData) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(inventoryData),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      if (response.status === 403) {
        throw new Error('Unauthorized: Admin access required');
      }
      throw new Error(errorData.error || 'Failed to create inventory');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating inventory:', error);
    throw error;
  }
}

/**
 * Update an existing inventory item
 * @param {string} inventoryId - MongoDB inventory ID
 * @param {Object} inventoryData - Updated inventory data
 * @returns {Promise<Object>} Updated inventory item
 */
export async function updateInventory(inventoryId, inventoryData) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/inventory/${inventoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(inventoryData),
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
        throw new Error('Inventory item not found');
      }
      throw new Error(errorData.error || 'Failed to update inventory');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating inventory:', error);
    throw error;
  }
}

/**
 * Adjust stock level for an inventory item
 * @param {string} inventoryId - MongoDB inventory ID
 * @param {Object} adjustment - Stock adjustment data { adjustmentType: 'add'|'subtract'|'set', quantity: number }
 * @returns {Promise<Object>} Updated inventory item
 */
export async function adjustInventoryStock(inventoryId, adjustment) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/inventory/${inventoryId}/adjust-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(adjustment),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 422 && errorData.errors) {
        throw new Error(JSON.stringify(errorData.errors));
      }
      throw new Error(errorData.error || 'Failed to adjust stock');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error adjusting inventory stock:', error);
    throw error;
  }
}

/**
 * Delete (deactivate) an inventory item
 * @param {string} inventoryId - MongoDB inventory ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteInventory(inventoryId) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/inventory/${inventoryId}`, {
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
        throw new Error('Inventory item not found');
      }
      throw new Error(errorData.error || 'Failed to delete inventory');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error deleting inventory:', error);
    throw error;
  }
}

/**
 * Fetch all suppliers from MongoDB
 * @returns {Promise<Array>} List of suppliers
 */
export async function fetchSuppliers() {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/suppliers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      // Fallback: return empty array if endpoint doesn't exist yet
      console.warn('Suppliers endpoint not available yet');
      return [];
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return [];
  }
}

/**
 * Create a new supplier
 * @param {Object} supplierData - Supplier data to create
 * @returns {Promise<Object>} Created supplier
 */
export async function createSupplier(supplierData) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/suppliers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(supplierData),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create supplier');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating supplier:', error);
    throw error;
  }
}

/**
 * Update an existing supplier
 * @param {string} supplierId - MongoDB supplier ID
 * @param {Object} supplierData - Updated supplier data
 * @returns {Promise<Object>} Updated supplier
 */
export async function updateSupplier(supplierId, supplierData) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/suppliers/${supplierId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(supplierData),
    }, 15000); // 15 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update supplier');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating supplier:', error);
    throw error;
  }
}

/**
 * Delete a supplier
 * @param {string} supplierId - MongoDB supplier ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteSupplier(supplierId) {
  try {
    const token = getAuthToken();
    const response = await fetchWithTimeout(`${API_URL}/api/admin/suppliers/${supplierId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete supplier');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error deleting supplier:', error);
    throw error;
  }
}
