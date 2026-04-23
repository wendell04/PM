/**
 * BANNER UTILITY FUNCTIONS
 *
 * Connects banner management to MongoDB backend via Laravel API
 */

import { fetchWithTimeout } from './fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Get all banners from backend (admin only)
 * GET /api/admin/banners
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} Array of banner objects
 */
export async function getBanners(token) {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/admin/banners`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch banners');
    return data.data || [];
  } catch (err) {
    console.error('[getBanners] error:', err);
    throw err;
  }
}

/**
 * Create a new banner
 * POST /api/admin/banners
 * @param {Object} bannerData - Banner data
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Created banner object
 */
export async function createBanner(bannerData, token) {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/admin/banners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
      },
      body: JSON.stringify(bannerData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to create banner');
    return data.data;
  } catch (err) {
    console.error('[createBanner] error:', err);
    throw err;
  }
}

/**
 * Update an existing banner
 * PUT /api/admin/banners/:id
 * @param {string} id - Banner ID
 * @param {Object} updates - Fields to update
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated banner object
 */
export async function updateBanner(id, updates, token) {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/admin/banners/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
      },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update banner');
    return data.data;
  } catch (err) {
    console.error('[updateBanner] error:', err);
    throw err;
  }
}

/**
 * Delete a banner
 * DELETE /api/admin/banners/:id
 * @param {string} id - Banner ID
 * @param {string} token - Authentication token
 * @returns {Promise<boolean>} True on success
 */
export async function deleteBanner(id, token) {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/admin/banners/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete banner');
    return true;
  } catch (err) {
    console.error('[deleteBanner] error:', err);
    throw err;
  }
}

/**
 * Publish a banner (make it live)
 * PUT /api/admin/banners/:id/publish
 * @param {string} id - Banner ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Published banner object
 */
export async function publishBanner(id, token) {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/admin/banners/${id}/publish`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to publish banner');
    return data.data;
  } catch (err) {
    console.error('[publishBanner] error:', err);
    throw err;
  }
}

/**
 * Unpublish a banner (make it draft)
 * PUT /api/admin/banners/:id/unpublish
 * @param {string} id - Banner ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Unpublished banner object
 */
export async function unpublishBanner(id, token) {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/admin/banners/${id}/unpublish`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to unpublish banner');
    return data.data;
  } catch (err) {
    console.error('[unpublishBanner] error:', err);
    throw err;
  }
}

/**
 * Get storefront banners (public endpoint)
 * GET /api/storefront/banners
 * Returns only banners where status='live' AND isVisible=true
 * @returns {Promise<Array>} Array of live banner objects
 */
export async function getStorefrontBanners() {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/storefront/banners`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch storefront banners');
    return data.data || [];
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Upload a banner image to Cloudinary via Laravel
 * POST /api/admin/upload-image
 * @param {File} file - Image file object
 * @param {string} token - Authentication token
 * @returns {Promise<string>} Cloudinary secure_url
 */
export async function uploadBannerImage(file, token) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('folder', 'pmp-banners');

  const res = await fetchWithTimeout(`${API_URL}/api/admin/upload-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to upload banner image');
  return data.data.url;
}
