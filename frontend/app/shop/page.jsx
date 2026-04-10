'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useCart } from './layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { getStorefrontBanners } from '@/lib/bannerUtils';
import { fetchProductSearch } from '@/lib/productsApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// ─── Price Helper ─────────────────────────────────────────────────────────────
function getDisplayPrice(product) {
  if (product.priceType === 'inquiry') return 'Price on request';
  if (product.priceType === 'fixed') {
    if (product.variantPrices && Object.keys(product.variantPrices).length > 0) {
      const prices = Object.values(product.variantPrices).map(p => parseFloat(p)).filter(p => p > 0);
      if (!prices.length) return 'Price on request';
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min === max) return `₱${min.toLocaleString()}`;
      return `₱${min.toLocaleString()} – ₱${max.toLocaleString()}`;
    }
    if (product.price) return `₱${parseFloat(product.price).toLocaleString()}`;
  }
  if (product.priceType === 'tiered' && product.priceTiers?.length) {
    const allPrices = product.priceTiers.flatMap(t =>
      Object.values(t.prices || {}).map(p => parseFloat(p)).filter(p => p > 0)
    );
    if (!allPrices.length) return 'Price on request';
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    if (min === max) return `₱${min.toLocaleString()}`;
    return `₱${min.toLocaleString()} – ₱${max.toLocaleString()}`;
  }
  return 'Price on request';
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product, onAddToCart, flashSale }) {
  const [hovered, setHovered] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const hasImage = product.thumbnail || product.images?.length > 0;

  // Flash sale countdown
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    if (!flashSale?.endDate) return;
    const calc = () => {
      const diff = new Date(flashSale.endDate) - Date.now();
      if (diff <= 0) { setTimeLeft('Ended'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        h > 0
          ? `${h}h ${m}m ${s}s`
          : `${m}m ${s}s`
      );
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [flashSale?.endDate]);

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAdding(true);
    onAddToCart(product);
    setTimeout(() => setIsAdding(false), 500);
  };

  return (
    <Link href={`/shop/products/${product.id ?? product._id}`} className="shop-product-card-link">
      <div
        className={`shop-product-card ${hovered ? 'hovered' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Image area */}
        <div className="shop-product-image-area">
          {hasImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.thumbnail || product.images[0]}
              alt={product.subCategoryName || product.name || 'Product'}
              className="shop-product-image"
            />
          ) : (
            <div className="shop-product-no-image">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <div>No image</div>
            </div>
          )}

          {/* Category badge */}
          <div className="shop-product-category-badge">
            {product.category}
          </div>

          {/* Flash sale badge */}
          {flashSale && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              zIndex: 2,
            }}>
              {flashSale.discountType === 'percentage'
                ? `${flashSale.discountValue}% OFF`
                : `₱${flashSale.discountValue} OFF`}
            </div>
          )}

          {/* Quick Add to Cart Button */}
          <button
            className={`shop-quick-add-btn ${isAdding ? 'adding' : ''}`}
            onClick={handleAddToCart}
            title="Add to Cart"
            onMouseEnter={(e) => e.stopPropagation()}
            onMouseLeave={(e) => e.stopPropagation()}
          >
            {isAdding ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            )}
          </button>
        </div>

        {/* Info */}
        <div className="shop-product-info">
          <h3 className="shop-product-name">
            {product.subCategoryName || product.name || 'Unnamed Product'}
          </h3>

          <p className="shop-product-description">
            {product.description || ''}
          </p>

          <div className="shop-product-footer">
            {flashSale && flashSale.discountedPrice != null ? (
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{
                  fontSize: '0.75rem',
                  color: '#666',
                  textDecoration: 'line-through',
                  lineHeight: 1,
                }}>
                  ₱{parseFloat(flashSale.originalPrice).toLocaleString()}
                </span>
                <span style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: '#ef4444',
                  lineHeight: 1,
                }}>
                  ₱{parseFloat(flashSale.discountedPrice).toLocaleString()}
                </span>
              </span>
            ) : (
              <span className="shop-product-price">
                {getDisplayPrice(product)}
              </span>
            )}

            {product.variantGroups?.length > 0 && (
              <span className="shop-product-variants">
                {product.combinations?.length || product.variantGroups.length} variant{(product.combinations?.length || product.variantGroups.length) !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {flashSale && timeLeft && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              marginTop: '0.5rem',
              padding: '0.375rem 0.75rem',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '6px',
              fontSize: '0.72rem',
              color: '#ef4444',
              fontWeight: 600,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Ends in {timeLeft}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShopPage() {
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [category, setCategory]   = useState('All');
  const [search, setSearch]       = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const [toast, setToast]         = useState(null);
  const [banners, setBanners] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [flashSales, setFlashSales] = useState({});
  const { addToCart } = useCart();
  const carouselRef = useRef(null);
  const autoplayRef = useRef(null);

  useEffect(() => {
    loadProducts();
    loadBanners();
    loadFlashSales();
  }, []);

  async function loadFlashSales() {
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/storefront/flash-sales`,
        {},
        30000
      );
      if (!res.ok) return;
      const data = await res.json();
      const sales = Array.isArray(data?.data) ? data.data : [];
      // Build productId → flashSale lookup map
      const map = {};
      sales.forEach(sale => {
        if (sale.productId) map[sale.productId] = sale;
      });
      setFlashSales(map);
    } catch {
      // Non-fatal — shop works without flash sale data
    }
  }

  /**
   * Load all active banners from backend API
   */
  async function loadBanners() {
    try {
      const data = await getStorefrontBanners();
      const banners = Array.isArray(data) ? data : [];
      // Sort by order
      const sorted = banners.sort((a, b) => (a.order || 0) - (b.order || 0));
      setBanners(sorted);
    } catch (err) {
      console.error('Failed to load banners:', err);
      setBanners([]);
    }
  }

  // Auto-play carousel
  useEffect(() => {
    if (banners.length === 0) return;
    if (!isAutoPlaying || banners.length <= 1) return;

    autoplayRef.current = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % banners.length);
    }, 5000); // Change every 5 seconds

    return () => {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current);
      }
    };
  }, [isAutoPlaying, banners.length]);

  // Navigate carousel
  const goToSlide = (index) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const nextSlide = () => {
    setCurrentSlide(prev => (prev + 1) % banners.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const prevSlide = () => {
    setCurrentSlide(prev => (prev - 1 + banners.length) % banners.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/products`, {}, 30000);
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      const products = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setProducts(products);
    } catch (err) {
      setError(err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  const handleAddToCart = (product) => {
    addToCart(product, null, null, 1);
    setToast({ message: `${product.name} added to cart!`, type: 'success' });
    setTimeout(() => setToast(null), 2000);
  };

  // Derived values
  const categories = ['All', ...new Set(products.map(p => p.category))];

  const filtered = products.filter(p => {
    const matchCat  = category === 'All' || p.category === category;
    const matchSearch = search.trim() === '' ||
      (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
      p.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  // Search suggestions with debounce - fetch from backend
  useEffect(() => {
    if (search.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await fetchProductSearch(
          search.trim(),
          category !== 'All' ? category : ''
        );
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, category]);

  // Click outside to close suggestions
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <ErrorBoundary>
      <div>
        {/* Hero Carousel - Dynamic from Banner Management */}
        {banners.length > 0 && (
          <div className="shop-carousel-container">
            <div className="shop-carousel-track">
              {banners.map((banner, index) => (
                <div
                  key={banner.id}
                  className={`shop-carousel-slide ${index === currentSlide ? 'active' : ''}`}
                  style={{ opacity: index === currentSlide ? 1 : 0 }}
                >
                  {banner.image ? (
                    <img
                      src={banner.image}
                      alt={banner.headline}
                      className="shop-carousel-bg-image"
                      style={{ objectFit: 'cover', objectPosition: 'center center' }}
                    />
                  ) : (
                    <div className="shop-carousel-bg-image shop-carousel-placeholder">
                      <span>No Image</span>
                    </div>
                  )}
                  {/* Only show overlay if there's text to protect */}
                  {(banner.headline || banner.subtext) && (
                    <div className="shop-carousel-overlay" />
                  )}

                  <div className="shop-carousel-content">
                    <div className="shop-carousel-text">
                      {banner.headline && (
                        <h2 className="shop-carousel-title">{banner.headline}</h2>
                      )}
                      {banner.subtext && (
                        <p className="shop-carousel-description">{banner.subtext}</p>
                      )}
                      {banner.ctaLabel && (
                        <Link href={banner.ctaLink || '/shop'} className="shop-carousel-cta">
                          {banner.ctaLabel}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Carousel Navigation - Only show if multiple banners */}
            {banners.length > 1 && (
              <>
                <button className="shop-carousel-nav shop-carousel-prev" onClick={prevSlide}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
              </button>
              <button className="shop-carousel-nav shop-carousel-next" onClick={nextSlide}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </>
          )}

          {/* Carousel Dots - Only show if multiple banners */}
          {banners.length > 1 && (
            <div className="shop-carousel-dots">
              {banners.map((_, index) => (
                <button
                  key={index}
                  className={`shop-carousel-dot ${index === currentSlide ? 'active' : ''}`}
                  onClick={() => goToSlide(index)}
                  title={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="shop-filter-bar">
        {/* Search */}
        <div ref={searchRef} style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <div className="shop-search-wrapper">
            <svg className="shop-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search products, categories, or tags..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setShowSuggestions(true);
                if (e.target.value.trim() === '') setSuggestions([]);
              }}
              onFocus={() => setShowSuggestions(true)}
              className="shop-search-input"
            />
          </div>
          {showSuggestions && (suggestions.length > 0 || searchLoading) && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              overflow: 'hidden',
              zIndex: 50,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {searchLoading && suggestions.length === 0 && (
                <div style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.85rem',
                  color: 'var(--gray)',
                  textAlign: 'center',
                }}>
                  Searching...
                </div>
              )}
              {suggestions.map((product, i) => (
                <button
                  key={product.id ?? product._id}
                  type="button"
                  onMouseDown={() => {
                    setSearch(product.name);
                    setShowSuggestions(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    padding: '0.625rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: i < suggestions.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                    color: 'var(--white)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="var(--gray)" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {product.name}
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    color: 'var(--gold)',
                    background: 'color-mix(in srgb, var(--gold) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--gold) 25%, transparent)',
                    borderRadius: '999px',
                    padding: '1px 8px',
                    flexShrink: 0,
                  }}>
                    {product.category}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Category pills */}
        <div className="shop-category-pills">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shop-category-pill ${category === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {!loading && filtered.length > 0 && (
        <div className="shop-results-count">
          Showing {filtered.length} of {products.length} products
          {search && <span className="shop-search-term"> for "{search}"</span>}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="shop-products-grid shop-products-grid-loading">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="shop-product-skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="shop-empty-state">
          <div className="shop-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <h3 className="shop-empty-title">
            {search || category !== 'All' ? 'No products found' : 'No products available'}
          </h3>
          <p className="shop-empty-description">
            {search || category !== 'All'
              ? 'Try adjusting your search or filter to find what you\'re looking for.'
              : 'Check back later as we\'re constantly adding new products to our store.'}
          </p>
          {(search || category !== 'All') && (
            <button
              onClick={() => { setSearch(''); setCategory('All'); }}
              className="shop-clear-filters-btn"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="shop-products-grid">
          {filtered.map(product => (
            <ProductCard
              key={product.id ?? product._id}
              product={product}
              onAddToCart={handleAddToCart}
              flashSale={flashSales[product._id] ?? flashSales[product.id] ?? null}
            />
          ))}
        </div>
      )}

      {/* Social Proof Section */}
      <div className="shop-social-proof">
        <h3 className="shop-proof-title">Connect With Us</h3>
        <div className="shop-social-links">
          <a href="https://www.facebook.com/share/1Mks4kwnhZ/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" className="shop-social-link shop-social-fb">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
            Facebook
          </a>
          <a href="https://www.instagram.com/personalizemeprints" target="_blank" rel="noopener noreferrer" className="shop-social-link shop-social-insta">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            Instagram
          </a>
          <a href="https://www.tiktok.com/@personalizemeprints" target="_blank" rel="noopener noreferrer" className="shop-social-link shop-social-tiktok">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
            TikTok
          </a>
          <a href="https://shopee.ph/personalizemeprints" target="_blank" rel="noopener noreferrer" className="shop-social-link shop-social-shopee">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zm3 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            Shopee
          </a>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`shop-toast ${toast.type}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>{toast.message}</span>
        </div>
      )}

      <style>{`
        /* Carousel */
        .shop-carousel-container {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 1.5rem;
          aspect-ratio: 16/5;
        }

        .shop-carousel-track {
          position: relative;
          height: 100%;
          width: 100%;
        }

        .shop-carousel-slide {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          transition: opacity 0.5s ease;
        }

        .shop-carousel-slide.active {
          opacity: 1;
          z-index: 1;
        }

        .shop-carousel-slide:not(.active) {
          opacity: 0;
          z-index: 0;
        }

        .shop-carousel-bg-image {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
        }

        .shop-carousel-bg-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center center;
        }

        .shop-carousel-placeholder {
          background: var(--dark2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--gray);
          font-size: 1.25rem;
        }

        .shop-carousel-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
          background: linear-gradient(
            to right,
            rgba(0, 0, 0, 0.85) 0%,
            rgba(0, 0, 0, 0.65) 20%,
            rgba(0, 0, 0, 0.4) 40%,
            rgba(0, 0, 0, 0.2) 60%,
            transparent 100%
          );
        }

        .shop-carousel-content {
          position: relative;
          z-index: 2;
          padding: 4rem;
          padding-left: 6rem;
          max-width: 600px;
          text-align: left;
        }

        .shop-carousel-text {
          text-align: left;
        }

        .shop-carousel-subtitle {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: rgba(212, 168, 67, 0.8);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 0.5rem;
        }

        .shop-carousel-title {
          margin: 0 0 0.75rem;
          font-size: 2.5rem;
          font-weight: 800;
          color: #f5f5f5;
          line-height: 1.1;
        }

        .shop-carousel-description {
          margin: 0;
          color: rgba(255, 255, 255, 0.7);
          font-size: 1rem;
          line-height: 1.6;
          max-width: 450px;
        }

        .shop-carousel-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          z-index: 10;
        }

        .shop-carousel-arrow:hover {
          background: rgba(212, 168, 67, 0.8);
          border-color: rgba(212, 168, 67, 0.5);
          color: #0f0f0f;
        }

        .shop-carousel-prev {
          left: 1rem;
        }

        .shop-carousel-next {
          right: 1rem;
        }

        .shop-carousel-dots {
          position: absolute;
          bottom: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 0.5rem;
          z-index: 10;
        }

        .shop-carousel-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
          padding: 0;
        }

        .shop-carousel-dot.active {
          background: #d4a843;
          border-color: #d4a843;
        }

        .shop-carousel-dot:hover {
          border-color: #d4a843;
        }

        /* Hero Banner (legacy - kept for compatibility) */
        .shop-hero-banner {
          background: linear-gradient(135deg, rgba(212, 168, 67, 0.15) 0%, rgba(196, 30, 58, 0.1) 100%);
          border: 1px solid rgba(212, 168, 67, 0.3);
          border-radius: 16px;
          padding: 2.5rem;
          margin-bottom: 1.5rem;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 2rem;
          align-items: center;
          position: relative;
          overflow: hidden;
        }

        .shop-hero-banner::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -10%;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(212, 168, 67, 0.1) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }

        .shop-hero-content {
          position: relative;
          z-index: 1;
        }

        .shop-hero-badge {
          display: inline-block;
          background: rgba(212, 168, 67, 0.2);
          border: 1px solid rgba(212, 168, 67, 0.4);
          border-radius: 20px;
          padding: 0.4rem 1rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: #d4a843;
          margin-bottom: 1rem;
        }

        .shop-hero-title {
          margin: 0 0 0.75rem;
          font-size: 2.25rem;
          font-weight: 800;
          color: #f5f5f5;
          line-height: 1.2;
        }

        .shop-hero-title .gold-text {
          background: linear-gradient(135deg, #d4a843 0%, #f0c953 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .shop-hero-subtitle {
          margin: 0 0 1.5rem;
          color: #aaa;
          font-size: 1rem;
          line-height: 1.6;
          max-width: 500px;
        }

        .shop-hero-features {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
        }

        .shop-hero-feature {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #4ade80;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .shop-hero-feature svg {
          flex-shrink: 0;
        }

        .shop-hero-visual {
          position: relative;
          width: 180px;
          height: 180px;
        }

        .shop-hero-orbit {
          position: relative;
          width: 100%;
          height: 100%;
          animation: rotate 20s linear infinite;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .shop-hero-orbit-item {
          position: absolute;
          font-size: 2rem;
          animation: counterRotate 20s linear infinite;
        }

        .shop-hero-orbit-item:nth-child(1) { top: 0; left: 50%; transform: translateX(-50%); }
        .shop-hero-orbit-item:nth-child(2) { right: 0; top: 50%; transform: translateY(-50%); }
        .shop-hero-orbit-item:nth-child(3) { bottom: 0; left: 50%; transform: translateX(-50%); }
        .shop-hero-orbit-item:nth-child(4) { left: 0; top: 50%; transform: translateY(-50%); }

        @keyframes counterRotate {
          from { transform: rotate(0deg) translateX(-50%); }
          to { transform: rotate(-360deg) translateX(-50%); }
        }

        /* Promo Banner */
        .shop-promo-banner {
          background: linear-gradient(135deg, #d4a843 0%, #c41e3a 100%);
          border-radius: 12px;
          padding: 1rem 1.5rem;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          animation: promoPulse 3s ease-in-out infinite;
        }

        @keyframes promoPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }

        .shop-promo-content {
          display: flex;
          align-items: center;
          gap: 1rem;
          width: 100%;
        }

        .shop-promo-icon {
          font-size: 2rem;
          flex-shrink: 0;
        }

        .shop-promo-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .shop-promo-text strong {
          color: #0f0f0f;
          font-size: 1rem;
        }

        .shop-promo-text span {
          color: rgba(15, 15, 15, 0.8);
          font-size: 0.85rem;
        }

        .shop-carousel-cta {
          display: inline-block;
          background: linear-gradient(135deg, #d4a843, #b8941f);
          color: #0f0f0f;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.875rem;
          white-space: nowrap;
          transition: all 0.2s;
          margin-top: 1rem;
        }

        .shop-carousel-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(212, 168, 67, 0.4);
        }

        .shop-promo-cta {
          background: #0f0f0f;
          color: #d4a843;
          padding: 0.6rem 1.25rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.85rem;
          white-space: nowrap;
          transition: all 0.2s;
        }

        .shop-promo-cta:hover {
          background: #1a1a1a;
          transform: translateY(-1px);
        }

        /* Filter Bar */
        .shop-filter-bar {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1.5rem;
          align-items: center;
        }

        .shop-search-wrapper {
          position: relative;
          flex: 1;
          min-width: 220px;
        }

        .shop-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #555;
        }

        .shop-search-input {
          width: 100%;
          padding: 0.75rem 1rem 0.75rem 2.5rem;
          background: #1a1a1a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #f5f5f5;
          font-size: 0.9rem;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }

        .shop-search-input:focus {
          border-color: rgba(212, 168, 67, 0.5);
        }

        .shop-search-input::placeholder {
          color: #666;
        }

        .shop-category-pills {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .shop-category-pill {
          padding: 0.5rem 1.25rem;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: transparent;
          color: #888;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .shop-category-pill:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #aaa;
        }

        .shop-category-pill.active {
          border-color: #d4a843;
          background: rgba(212, 168, 67, 0.15);
          color: #d4a843;
        }

        /* Results Count */
        .shop-results-count {
          font-size: 0.85rem;
          color: #666;
          margin-bottom: 1rem;
        }

        .shop-results-count .shop-search-term {
          color: #888;
          font-style: italic;
        }

        /* Products Grid */
        .shop-products-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 1.25rem;
        }

        .shop-products-grid-loading {
          /* Loading state */
        }

        .shop-product-skeleton {
          height: 320px;
          border-radius: 12px;
          background: linear-gradient(90deg, #1a1a1a 25%, #222 50%, #1a1a1a 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Empty State */
        .shop-empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: rgba(212, 168, 67, 0.03);
          border: 1px dashed rgba(212, 168, 67, 0.2);
          border-radius: 16px;
        }

        .shop-empty-icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 1.5rem;
          background: rgba(212, 168, 67, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .shop-empty-title {
          margin: 0 0 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
          color: #f5f5f5;
        }

        .shop-empty-description {
          margin: 0;
          color: #888;
          font-size: 0.9rem;
          max-width: 400px;
          margin-left: auto;
          margin-right: auto;
        }

        .shop-clear-filters-btn {
          margin-top: 1.5rem;
          padding: 0.6rem 1.5rem;
          background: rgba(212, 168, 67, 0.15);
          border: 1px solid rgba(212, 168, 67, 0.3);
          border-radius: 8px;
          color: #d4a843;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .shop-clear-filters-btn:hover {
          background: rgba(212, 168, 67, 0.25);
        }

        /* Social Proof */
        .shop-social-proof {
          margin-top: 4rem;
          padding: 2.5rem;
          background: rgba(212, 168, 67, 0.05);
          border: 1px solid rgba(212, 168, 67, 0.15);
          border-radius: 16px;
          text-align: center;
        }

        .shop-proof-title {
          margin: 0 0 2rem;
          font-size: 1.25rem;
          font-weight: 700;
          color: #f5f5f5;
        }

        .shop-proof-stats {
          display: flex;
          justify-content: center;
          gap: 3rem;
          flex-wrap: wrap;
          margin-bottom: 2rem;
        }

        .shop-proof-stat {
          text-align: center;
        }

        .shop-proof-stat-num {
          font-size: 2rem;
          font-weight: 800;
          background: linear-gradient(135deg, #d4a843 0%, #f0c953 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .shop-proof-stat-label {
          font-size: 0.85rem;
          color: #888;
          margin-top: 0.25rem;
        }

        .shop-social-links {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .shop-social-label {
          color: #666;
          font-size: 0.9rem;
        }

        .shop-social-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .shop-social-fb {
          background: rgba(24, 119, 242, 0.15);
          color: #1877f2;
          border: 1px solid rgba(24, 119, 242, 0.3);
        }

        .shop-social-fb:hover {
          background: rgba(24, 119, 242, 0.25);
        }

        .shop-social-insta {
          background: linear-gradient(135deg, rgba(131, 58, 180, 0.15), rgba(253, 29, 29, 0.15), rgba(252, 176, 69, 0.15));
          color: #e4405f;
          border: 1px solid rgba(228, 64, 95, 0.3);
        }

        .shop-social-insta:hover {
          background: linear-gradient(135deg, rgba(131, 58, 180, 0.25), rgba(253, 29, 29, 0.25), rgba(252, 176, 69, 0.25));
        }

        .shop-social-tiktok {
          background: rgba(0, 0, 0, 0.3);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .shop-social-tiktok:hover {
          background: rgba(0, 0, 0, 0.5);
        }

        .shop-social-shopee {
          background: rgba(238, 44, 100, 0.15);
          color: #ee2c64;
          border: 1px solid rgba(238, 44, 100, 0.3);
        }

        .shop-social-shopee:hover {
          background: rgba(238, 44, 100, 0.25);
        }

        /* Toast */
        .shop-toast {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          background: rgba(22, 22, 22, 0.95);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(74, 222, 128, 0.4);
          border-radius: 12px;
          padding: 1rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #4ade80;
          font-weight: 500;
          font-size: 0.9rem;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          z-index: 1000;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        /* Product Card */
        .shop-product-card-link {
          text-decoration: none;
        }

        .shop-product-card {
          background: #161616;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.25s ease;
          cursor: pointer;
        }

        .shop-product-card.hovered {
          background: #1c1c1c;
          border-color: rgba(212, 168, 67, 0.4);
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .shop-product-image-area {
          height: 180px;
          background: linear-gradient(135deg, #1e1e1e 0%, #2a2a2a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .shop-product-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .shop-product-no-image {
          text-align: center;
          color: rgba(212, 168, 67, 0.2);
        }

        .shop-product-no-image svg {
          display: block;
          margin: 0 auto 8px;
        }

        .shop-product-no-image div {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.3);
        }

        .shop-quick-add-btn {
          position: absolute;
          bottom: 10px;
          right: 10px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(212, 168, 67, 0.9);
          border: 2px solid rgba(255, 255, 255, 0.2);
          color: #0f0f0f;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.25s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .shop-product-card:hover .shop-quick-add-btn {
          opacity: 1;
          transform: translateY(0);
        }

        .shop-quick-add-btn:hover {
          background: #d4a843;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(212, 168, 67, 0.4);
        }

        .shop-quick-add-btn.adding {
          background: #4ade80;
          border-color: rgba(74, 222, 128, 0.5);
          animation: pulse 0.3s ease;
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        .shop-product-category-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(212, 168, 67, 0.3);
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 0.7rem;
          color: #d4a843;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .shop-product-info {
          padding: 1.25rem;
          min-height: 80px;
        }

        .shop-product-name {
          margin: 0 0 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          color: #f5f5f5;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .shop-product-description {
          margin: 0 0 1rem;
          font-size: 0.85rem;
          color: #888;
          line-height: 1.6;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .shop-product-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .shop-product-price {
          font-size: 1.1rem;
          font-weight: 700;
          color: #d4a843;
        }

        .shop-product-variants {
          font-size: 0.75rem;
          color: #666;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .shop-hero-banner {
            grid-template-columns: 1fr;
            padding: 1.5rem;
            text-align: center;
          }

          .shop-hero-title {
            font-size: 1.75rem;
          }

          .shop-hero-features {
            justify-content: center;
          }

          .shop-hero-visual {
            width: 120px;
            height: 120px;
            margin: 0 auto;
          }

          .shop-hero-orbit-item {
            font-size: 1.5rem;
          }

          .shop-promo-banner {
            flex-direction: column;
            text-align: center;
          }

          .shop-promo-content {
            flex-direction: column;
          }

          .shop-promo-cta {
            width: 100%;
            text-align: center;
          }

          .shop-filter-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .shop-search-wrapper {
            min-width: 100%;
          }

          .shop-category-pills {
            justify-content: center;
          }

          .shop-products-grid {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 1rem;
          }

          .shop-proof-stats {
            gap: 2rem;
          }

          .shop-proof-stat-num {
            font-size: 1.5rem;
          }

          .shop-quick-add-btn {
            opacity: 1;
            transform: translateY(0);
            width: 36px;
            height: 36px;
            bottom: 8px;
            right: 8px;
          }

          .shop-toast {
            left: 1rem;
            right: 1rem;
            bottom: 1rem;
          }

          .shop-empty-state {
            padding: 3rem 1rem;
          }
        }
      `}</style>
    </div>
    </ErrorBoundary>
  );
}