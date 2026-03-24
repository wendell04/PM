/**
 * BANNER UTILITY FUNCTIONS
 *
 * ⚠️ BACKEND INTEGRATION REQUIRED — HIGH PRIORITY
 * 
 * Current implementation uses localStorage (browser-only, data not persisted to server).
 * This means banners are NOT shared across devices/sessions and admin changes
 * don't appear in the storefront.
 * 
 * 🔧 TODO: Backend Team — Create these endpoints:
 * - GET    /api/admin/banners              - Fetch all banners (admin auth required)
 * - GET    /api/storefront/banners         - Fetch active banners only (public)
 * - POST   /api/admin/banners              - Create new banner
 * - PUT    /api/admin/banners/:id          - Update banner
 * - DELETE /api/admin/banners/:id          - Delete banner
 * - PUT    /api/admin/banners/:id/publish  - Publish/unpublish banner
 *
 * MongoDB Schema suggestion:
 * {
 *   _id: ObjectId,
 *   headline: String,
 *   subtext: String,
 *   ctaLabel: String,
 *   ctaLink: String,
 *   image: String (Cloudinary URL),
 *   isVisible: Boolean,
 *   status: String ('draft' | 'live' | 'scheduled'),
 *   scheduleStart: Date,
 *   scheduleEnd: Date,
 *   order: Number,
 *   createdAt: Date,
 *   updatedAt: Date
 * }
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const STORAGE_KEY = 'pmp_banners';

/**
 * Get all banners from localStorage
 * ⚠️ TODO: Replace with API call when backend endpoint exists
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
 * ⚠️ TODO: Replace with API call (PUT /api/admin/banners) when backend endpoint exists
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
 * ⚠️ TODO: Replace with API call (POST /api/admin/banners) when backend endpoint exists
 * @param {Object} bannerData - Banner data
 * @returns {Object} Created banner object
 */
export const createBanner = (bannerData) => {
  // TODO: API implementation:
  // const token = localStorage.getItem('auth_token');
  // const response = await fetch(`${API_URL}/api/admin/banners`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${token}`
  //   },
  //   body: JSON.stringify(bannerData)
  // });
  // const data = await response.json();
  // return data.banner;
  
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
 * ⚠️ TODO: Replace with API call (PUT /api/admin/banners/:id) when backend endpoint exists
 * @param {string} id - Banner ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated banner or null
 */
export const updateBanner = (id, updates) => {
  // TODO: API implementation:
  // const token = localStorage.getItem('auth_token');
  // const response = await fetch(`${API_URL}/api/admin/banners/${id}`, {
  //   method: 'PUT',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${token}`
  //   },
  //   body: JSON.stringify(updates)
  // });
  // const data = await response.json();
  // return data.banner;
  
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
 * ⚠️ TODO: Replace with API call (DELETE /api/admin/banners/:id) when backend endpoint exists
 * @param {string} id - Banner ID
 * @returns {boolean} True if deleted
 */
export const deleteBanner = (id) => {
  // TODO: API implementation:
  // const token = localStorage.getItem('auth_token');
  // await fetch(`${API_URL}/api/admin/banners/${id}`, {
  //   method: 'DELETE',
  //   headers: { 'Authorization': `Bearer ${token}` }
  // });
  // return true;
  
  const banners = getBanners();
  const filtered = banners.filter(b => b.id !== id);

  if (filtered.length === banners.length) return false;

  saveBanners(filtered);
  return true;
};

/**
 * Publish a banner (make it live)
 * ⚠️ TODO: Replace with API call (PUT /api/admin/banners/:id/publish) when backend endpoint exists
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
 * ⚠️ TODO: Replace with API call (PUT /api/admin/banners/:id/unpublish) when backend endpoint exists
 * @param {string} id - Banner ID
 * @returns {Object|null} Unpublished banner or null
 */
export const unpublishBanner = (id) => {
  return updateBanner(id, {
    isVisible: false,
    status: 'draft',
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// BACKEND TASK SUMMARY — Banner API Endpoints Required
// ═══════════════════════════════════════════════════════════════════════════
// The following endpoints need to be created in the Laravel backend:
//
// 1. GET    /api/admin/banners              - List all banners (admin auth)
// 2. GET    /api/storefront/banners         - List active banners (public)
// 3. POST   /api/admin/banners              - Create banner
// 4. PUT    /api/admin/banners/:id          - Update banner
// 5. DELETE /api/admin/banners/:id          - Delete banner
// 6. PUT    /api/admin/banners/:id/publish  - Publish banner
// 7. PUT    /api/admin/banners/:id/unpublish - Unpublish banner
//
// Once endpoints exist, replace localStorage calls with fetch() calls above.
// ═══════════════════════════════════════════════════════════════════════════
