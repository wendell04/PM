/**
 * BANNER UTILITY FUNCTIONS
 * 
 * Helper functions for managing storefront banners.
 * 
 * 🔧 LOCAL STORAGE IMPLEMENTATION (Development/Prototype)
 * - Uses localStorage for data persistence
 * - No backend required for testing
 * 
 * 📡 FUTURE BACKEND INTEGRATION:
 * Replace localStorage calls with API endpoints:
 * - GET    /api/storefront/banners              - Fetch all banners
 * - GET    /api/storefront/banners/active       - Fetch active banners only
 * - POST   /api/storefront/banners/{id}/publish - Publish banner
 */

const STORAGE_KEY = 'pmp_banners';

/**
 * Get all banners from localStorage
 * @returns {Array} Array of banner objects
 */
export const getBanners = () => {
  if (typeof window === 'undefined') return [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error reading banners from localStorage:', e);
    return [];
  }
};

/**
 * Save all banners to localStorage
 * @param {Array} banners - Array of banner objects
 */
export const saveBanners = (banners) => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(banners));
  } catch (e) {
    console.error('Error saving banners to localStorage:', e);
  }
};

/**
 * Get a single banner by ID
 * @param {string} id - Banner ID
 * @returns {Object|null} Banner object or null
 */
export const getBannerById = (id) => {
  const banners = getBanners();
  return banners.find(b => b.id === id) || null;
};

/**
 * Check if a banner is currently active (within schedule and visible)
 * @param {Object} banner - Banner object
 * @returns {boolean} True if banner should be displayed
 */
export const isBannerActive = (banner) => {
  if (!banner) return false;
  if (!banner.isVisible) return false;
  if (banner.status !== 'live') return false;
  
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // Get YYYY-MM-DD
  
  // Check schedule start
  if (banner.scheduleStart && today < banner.scheduleStart) {
    return false;
  }
  
  // Check schedule end
  if (banner.scheduleEnd && today > banner.scheduleEnd) {
    return false;
  }
  
  return true;
};

/**
 * Get all active banners (visible, live, and within schedule)
 * @returns {Array} Array of active banner objects
 */
export const getActiveBanners = () => {
  const banners = getBanners();
  return banners.filter(isBannerActive);
};

/**
 * Get the first active banner (for hero carousel)
 * @returns {Object|null} First active banner or null
 */
export const getFirstActiveBanner = () => {
  const activeBanners = getActiveBanners();
  return activeBanners.length > 0 ? activeBanners[0] : null;
};

/**
 * Map banner data to carousel slide format
 * @param {Object} banner - Banner object
 * @returns {Object} Carousel slide object
 */
export const mapBannerToSlide = (banner) => {
  return {
    image: banner.image || null,
    gradient: 'linear-gradient(135deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 100%)',
    subtitle: 'Special Offer',
    title: banner.headline || 'Promotion',
    description: banner.subtext || '',
    ctaLabel: banner.ctaLabel || 'Learn More',
    ctaLink: banner.ctaLink || '/shop',
  };
};

/**
 * Map all active banners to carousel slides
 * @returns {Array} Array of carousel slide objects
 */
export const getActiveBannerSlides = () => {
  const activeBanners = getActiveBanners();
  return activeBanners.map(mapBannerToSlide);
};

/**
 * Create a new banner
 * @param {Object} bannerData - Banner data
 * @returns {Object} Created banner object
 */
export const createBanner = (bannerData) => {
  const banners = getBanners();
  const newBanner = {
    id: `banner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...bannerData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  banners.push(newBanner);
  saveBanners(banners);
  return newBanner;
};

/**
 * Update an existing banner
 * @param {string} id - Banner ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated banner or null
 */
export const updateBanner = (id, updates) => {
  const banners = getBanners();
  const index = banners.findIndex(b => b.id === id);
  
  if (index === -1) return null;
  
  banners[index] = {
    ...banners[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  saveBanners(banners);
  return banners[index];
};

/**
 * Delete a banner
 * @param {string} id - Banner ID
 * @returns {boolean} True if deleted
 */
export const deleteBanner = (id) => {
  const banners = getBanners();
  const filtered = banners.filter(b => b.id !== id);
  
  if (filtered.length === banners.length) return false;
  
  saveBanners(filtered);
  return true;
};

/**
 * Publish a banner (make it live)
 * @param {string} id - Banner ID
 * @returns {Object|null} Published banner or null
 */
export const publishBanner = (id) => {
  return updateBanner(id, {
    isVisible: true,
    status: 'live',
  });
};

/**
 * Unpublish a banner (make it draft)
 * @param {string} id - Banner ID
 * @returns {Object|null} Unpublished banner or null
 */
export const unpublishBanner = (id) => {
  return updateBanner(id, {
    isVisible: false,
    status: 'draft',
  });
};

// 🔧 FUTURE: API-based implementation
// Uncomment and modify these when backend is ready:

/*
export const getBanners = async () => {
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_URL}/api/storefront/banners`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    return data.banners || [];
  } catch (error) {
    console.error('Error fetching banners:', error);
    return [];
  }
};

export const getActiveBanners = async () => {
  try {
    const response = await fetch(`${API_URL}/api/storefront/banners/active`);
    const data = await response.json();
    return data.banners || [];
  } catch (error) {
    console.error('Error fetching active banners:', error);
    return [];
  }
};

export const createBanner = async (bannerData) => {
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_URL}/api/storefront/banners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(bannerData)
    });
    const data = await response.json();
    return data.banner;
  } catch (error) {
    console.error('Error creating banner:', error);
    return null;
  }
};

export const updateBanner = async (id, updates) => {
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_URL}/api/storefront/banners/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    const data = await response.json();
    return data.banner;
  } catch (error) {
    console.error('Error updating banner:', error);
    return null;
  }
};

export const deleteBanner = async (id) => {
  try {
    const token = localStorage.getItem('auth_token');
    await fetch(`${API_URL}/api/storefront/banners/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return true;
  } catch (error) {
    console.error('Error deleting banner:', error);
    return false;
  }
};
*/
