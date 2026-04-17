/**
 * Inventory API Utility Functions
 * Connects inventory management to MongoDB backend via Laravel API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Import timeout helper
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Fetch all inventory items from MongoDB
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} List of inventory items
 */
export async function fetchInventory(token) {
  try {
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
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching inventory:', error);
    throw error;
  }
}

/**
 * Fetch a single inventory item by ID
 * @param {string} inventoryId - MongoDB inventory ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Inventory item
 */
export async function fetchInventoryItem(inventoryId, token) {
  try {
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
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    throw error;
  }
}

/**
 * Fetch inventory stock history
 * @param {string} inventoryId - MongoDB inventory ID
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} Stock history records
 */
export async function fetchInventoryHistory(inventoryId, token) {
  try {
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
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching inventory history:', error);
    throw error;
  }
}

/**
 * Create a new inventory item
 * @param {Object} inventoryData - Inventory data to create
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Created inventory item
 */
export async function createInventory(inventoryData, token) {
  try {
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
      throw new Error(errorData.message || 'Failed to create inventory');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error creating inventory:', error);
    throw error;
  }
}

/**
 * Update an existing inventory item
 * @param {string} inventoryId - MongoDB inventory ID
 * @param {Object} inventoryData - Updated inventory data
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated inventory item
 */
export async function updateInventory(inventoryId, inventoryData, token) {
  try {
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
      throw new Error(errorData.message || 'Failed to update inventory');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error updating inventory:', error);
    throw error;
  }
}

/**
 * Adjust stock level for an inventory item
 * @param {string} inventoryId - MongoDB inventory ID
 * @param {Object} adjustment - Stock adjustment data { adjustmentType: 'add'|'subtract'|'set', quantity: number }
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated inventory item
 */
export async function adjustInventoryStock(inventoryId, adjustment, token) {
  try {
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
      throw new Error(errorData.message || 'Failed to adjust stock');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error adjusting inventory stock:', error);
    throw error;
  }
}

/**
 * Delete (deactivate) an inventory item
 * @param {string} inventoryId - MongoDB inventory ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteInventory(inventoryId, token) {
  try {
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
      throw new Error(errorData.message || 'Failed to delete inventory');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error deleting inventory:', error);
    throw error;
  }
}

/**
 * Fetch all suppliers from MongoDB
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} List of suppliers
 */
export async function fetchSuppliers(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/suppliers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to fetch suppliers');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return [];
  }
}

/**
 * Create a new supplier
 * @param {Object} supplierData - Supplier data to create
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Created supplier
 */
export async function createSupplier(supplierData, token) {
  try {
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
      throw new Error(errorData.message || 'Failed to create supplier');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error creating supplier:', error);
    throw error;
  }
}

/**
 * Update an existing supplier
 * @param {string} supplierId - MongoDB supplier ID
 * @param {Object} supplierData - Updated supplier data
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated supplier
 */
export async function updateSupplier(supplierId, supplierData, token) {
  try {
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
      throw new Error(errorData.message || 'Failed to update supplier');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error updating supplier:', error);
    throw error;
  }
}

/**
 * Fetch masterlist from MongoDB
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} Masterlist categories array
 */
export async function fetchMasterlist(token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/masterlist`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000);

    if (!response.ok) {
      if (response.status === 401) throw new Error('Unauthenticated: Please login again');
      if (response.status === 403) throw new Error('Unauthorized: Admin access required');
      throw new Error(`Failed to fetch masterlist: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data?.categories ?? data.categories ?? [];
  } catch (error) {
    console.error('Error fetching masterlist:', error);
    return [];
  }
}

/**
 * Save masterlist to MongoDB (full replace)
 * @param {Array} categories - Full masterlist categories array
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} Saved masterlist categories array
 */
export async function saveMasterlist(categories, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/masterlist`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ categories }),
    }, 15000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error('Unauthenticated: Please login again');
      if (response.status === 403) throw new Error('Unauthorized: Admin access required');
      if (response.status === 422 && errorData.errors) throw new Error(JSON.stringify(errorData.errors));
      throw new Error(errorData.message || 'Failed to save masterlist');
    }

    const data = await response.json();
    return data.data?.categories ?? data.categories ?? [];
  } catch (error) {
    console.error('Error saving masterlist:', error);
    throw error;
  }
}

/**
 * Delete a supplier
 * @param {string} supplierId - MongoDB supplier ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteSupplier(supplierId, token) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/admin/suppliers/${supplierId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, 10000); // 10 second timeout

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to delete supplier');
    }

    const data = await response.json();
    return data.data ?? data;
  } catch (error) {
    console.error('Error deleting supplier:', error);
    throw error;
  }
}

/**
 * Fetch deduction history for all inventory items (parallel per-item fetch)
 * Used by StockOutHistoryTab and InventoryReports.
 * @param {Array} inventoryIds - Array of MongoDB inventory _id strings
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} Flat array of stock history records with inventoryId attached
 */
export async function fetchAllStockHistory(inventoryIds, token) {
  if (!inventoryIds || inventoryIds.length === 0) return [];
  const results = await Promise.allSettled(
    inventoryIds.map((id) => fetchInventoryHistory(id, token))
  );
  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value ?? []);
}
