'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from './layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { getStorefrontBanners } from '@/lib/bannerUtils';
import './shop.css';

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
      if (min === max) return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} – ₱${max.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (product.price) return `₱${parseFloat(product.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (product.priceType === 'tiered' && product.priceTiers?.length) {
    const allPrices = product.priceTiers.flatMap(t =>
      Object.values(t.prices || {}).map(p => parseFloat(p)).filter(p => p > 0)
    );
    if (!allPrices.length) return 'Price on request';
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    if (min === max) return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} – ₱${max.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return 'Price on request';
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product, onAddToCart, flashSale }) {
  const [hovered, setHovered] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const hasImage = product.thumbnail || product.images?.length > 0;
  const { cartItems } = useCart();
  const cartQty = cartItems
    .filter(item => item.productId === (product._id || product.id))
    .reduce((sum, item) => sum + (item.qty || 0), 0);

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

          {/* Stock image badge — top left */}
          {(() => {
            const totalStock = (() => {
              const vs = product.variantStock;
              if (vs && Object.keys(vs).length > 0) {
                return Object.values(vs).reduce((s, v) => s + (Number(v) || 0), 0);
              }
              return product.stock ?? null;
            })();
            const hasAnyBackorder = product.variantBackorder && Object.values(product.variantBackorder).some(v => !!v);
            const isOOS = !product.isMadeToOrder && !hasAnyBackorder && totalStock === 0;
            const isOnOrder = product.isMadeToOrder;
            if (isOnOrder) return (
              <div className="shop-stock-img-badge on-order">Upon Order</div>
            );
            if (isOOS) return (
              <div className="shop-stock-img-badge out-stock">Out of Stock</div>
            );
            if (totalStock != null && totalStock <= 10) return (
              <div className="shop-stock-img-badge low-stock">Stock: {totalStock}</div>
            );
            return (
              <div className="shop-stock-img-badge in-stock">
                {totalStock != null ? `Stock: ${totalStock}` : 'In Stock'}
              </div>
            );
          })()}

          {/* Customizable badge */}
          {product.isCustom && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: '#D4A843',
              color: '#000',
              fontSize: '0.6rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              zIndex: 2,
            }}>
              Customizable
            </div>
          )}

          {/* Flash sale badge */}
          {flashSale && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'linear-gradient(135deg, var(--red) 0%, var(--red-dark) 100%)',
              color: 'var(--white)',
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

          {/* MOQ hover badge */}
          {(product.minOrderQty ?? 1) > 1 && (
            <div className="shop-moq-badge">
              MOQ {product.minOrderQty} pcs
            </div>
          )}

          {/* Cart qty badge */}
          {cartQty > 0 && (
            <div className="shop-cart-qty-badge">×{cartQty}</div>
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
                  color: 'var(--gray)',
                  textDecoration: 'line-through',
                  lineHeight: 1,
                }}>
                  ₱{parseFloat(flashSale.originalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--red)',
                  lineHeight: 1,
                }}>
                  ₱{parseFloat(flashSale.discountedPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              color: 'var(--red)',
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
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [category, setCategory]   = useState('All');
  const [toast, setToast]         = useState(null);
  const [banners, setBanners] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [flashSales, setFlashSales] = useState({});
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickVariant, setQuickVariant] = useState(null);
  const [quickQty, setQuickQty] = useState(1);
  const { addToCart } = useCart();
  const router = useRouter();

  useEffect(() => {
    const handleSearch = (e) => setSearchQuery(e.detail?.query ?? '');
    window.addEventListener('pmp_search', handleSearch);
    return () => window.removeEventListener('pmp_search', handleSearch);
  }, []);

  // Read logged-in user for greeting
  const [shopUser, setShopUser] = useState(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('auth_user')
        || sessionStorage.getItem('auth_user');
      setShopUser(raw ? JSON.parse(raw) : null);
    } catch { setShopUser(null); }
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

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
        `${API_URL}/api/storefront/flash-sales`,
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
      const data = await getStorefrontBanners('shop');
      const banners = Array.isArray(data) ? data : [];
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
    const hasVariants = (product.combinations?.length > 0) || (product.variantGroups?.length > 0);
    const moq = product.minOrderQty || 1;
    if (hasVariants) {
      setQuickAddProduct(product);
      setQuickVariant(null);
      setQuickQty(moq);
      return;
    }
    addToCart(product, moq, null, null);
    setToast({ message: `${product.subCategoryName || product.name} added to cart!`, type: 'success' });
    setTimeout(() => setToast(null), 2000);
  };

  // Derived values
  const categories = ['All', ...new Set(products.map(p => p.category))];

  const filtered = products.filter(p => {
    const matchCat  = category === 'All' || p.category === category;
    return matchCat && (
      !searchQuery ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

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
                    <Image
                      src={banner.image}
                      alt={banner.headline}
                      className="shop-carousel-bg-image"
                      fill
                      unoptimized
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

      {/* Greeting bar */}
      <div style={{
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        background: 'rgba(212,168,67,0.06)',
        border: '1px solid rgba(212,168,67,0.15)',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="var(--gold)" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        <span style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 500 }}>
          {shopUser?.firstName
            ? <>{getGreeting()}, <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{shopUser.firstName}</span>! Welcome back.</>
            : <>Welcome to <span style={{ color: 'var(--gold)', fontWeight: 700 }}>Personalize Me Prints</span>! Browse our products below.</>
          }
        </span>
      </div>

      {/* Category pills */}
      <div className="shop-category-pills">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shop-category-pill${category === cat ? ' active' : ''}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      {!loading && filtered.length > 0 && (
        <div className="shop-results-count">
          Showing {filtered.length} of {products.length} products
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
              stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <h3 className="shop-empty-title">
            {category !== 'All' ? 'No products found' : 'No products available'}
          </h3>
          <p className="shop-empty-description">
            {category !== 'All'
              ? 'Try adjusting your search or filter to find what you\'re looking for.'
              : 'Check back later as we\'re constantly adding new products to our store.'}
          </p>
          {category !== 'All' && (
            <button
              onClick={() => { setCategory('All'); }}
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

      {/* Quick Add Modal */}
      {quickAddProduct && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setQuickAddProduct(null)}
        >
          <div
            style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'flex-start' }}>
              {(quickAddProduct.thumbnail || quickAddProduct.images?.[0]) && (
                <img
                  src={quickAddProduct.thumbnail || quickAddProduct.images[0]}
                  alt=""
                  style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)', lineHeight: 1.3, marginBottom: '4px' }}>
                  {quickAddProduct.subCategoryName || quickAddProduct.name}
                </div>
                {quickAddProduct.isCustom && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, background: '#D4A843', color: '#000', padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Customizable
                  </span>
                )}
              </div>
              <button
                onClick={() => setQuickAddProduct(null)}
                style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Variant picker */}
            {quickAddProduct.combinations?.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                  Select Variant
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {quickAddProduct.combinations.map(combo => {
                    const isSelected = quickVariant?.id === combo.id;
                    const comboLabel = combo.name || combo.label || Object.values(combo.combo || {}).join(' / ') || 'Variant';
                    const variantQty = quickAddProduct.variantStock?.[combo.id] != null
                      ? Number(quickAddProduct.variantStock[combo.id])
                      : null;
                    const isOOS = quickAddProduct.trackInventory && variantQty != null && variantQty === 0;
                    const price = (() => {
                      if (quickAddProduct.priceType === 'fixed') {
                        const p = quickAddProduct.variantPrices?.[combo.id];
                        return p ? parseFloat(p) : null;
                      }
                      if (quickAddProduct.priceType === 'tiered') {
                        const tiers = quickAddProduct.priceTiers ?? [];
                        if (!tiers.length) return null;
                        const sorted = [...tiers].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0));
                        let match = sorted[sorted.length - 1];
                        for (const t of sorted) {
                          const min = parseInt(t.minQty) || 0;
                          const max = t.maxQty !== null && t.maxQty !== '' ? parseInt(t.maxQty) : Infinity;
                          if (quickQty >= min && quickQty <= max) { match = t; break; }
                        }
                        const p = match?.prices?.[combo.id];
                        return p ? parseFloat(p) : null;
                      }
                      return null;
                    })();
                    return (
                      <button
                        key={combo.id}
                        disabled={isOOS}
                        onClick={() => !isOOS && setQuickVariant(combo)}
                        style={{
                          padding: '7px 14px', borderRadius: '8px',
                          cursor: isOOS ? 'not-allowed' : 'pointer',
                          border: `1px solid ${isOOS ? 'rgba(239,68,68,0.3)' : isSelected ? 'var(--gold)' : 'var(--border)'}`,
                          background: isOOS ? 'rgba(239,68,68,0.06)' : isSelected ? 'rgba(212,168,67,0.12)' : 'var(--dark)',
                          color: isOOS ? 'rgba(239,68,68,0.6)' : isSelected ? 'var(--gold)' : 'var(--white)',
                          fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500,
                          opacity: isOOS ? 0.6 : 1,
                          transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                        }}
                      >
                        <span style={{ textDecoration: isOOS ? 'line-through' : 'none' }}>{comboLabel}</span>
                        {price != null && !isOOS && (
                          <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>₱{price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        )}
                        {isOOS && (
                          <span style={{ fontSize: '0.65rem', color: 'rgba(239,68,68,0.8)' }}>Out of stock</span>
                        )}
                        {!isOOS && variantQty != null && variantQty <= 10 && (
                          <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>{variantQty} left</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Quantity
                </div>
                {quickAddProduct.minOrderQty > 1 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 600 }}>
                    Min. {quickAddProduct.minOrderQty} pcs
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => setQuickQty(q => Math.max(quickAddProduct.minOrderQty || 1, q - 1))}
                  style={{ width: '38px', height: '38px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px 0 0 8px', cursor: 'pointer', color: 'var(--white)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  −
                </button>
                <input
                  type="number"
                  min={quickAddProduct.minOrderQty || 1}
                  value={quickQty}
                  onChange={e => setQuickQty(Math.max(quickAddProduct.minOrderQty || 1, parseInt(e.target.value) || 1))}
                  style={{ width: '64px', height: '38px', background: 'var(--dark)', border: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', color: 'var(--white)', textAlign: 'center', fontSize: '0.95rem', outline: 'none' }}
                />
                <button
                  onClick={() => setQuickQty(q => q + 1)}
                  style={{ width: '38px', height: '38px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 0', cursor: 'pointer', color: 'var(--white)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Action */}
            {(() => {
              const needsVariant = quickAddProduct.combinations?.length > 0 && !quickVariant;
              return (
                <button
                  disabled={needsVariant}
                  onClick={() => {
                    const variantLabel = quickVariant
                      ? (quickVariant.name || quickVariant.label || Object.values(quickVariant.combo || {}).join(' / ') || null)
                      : null;
                    addToCart(quickAddProduct, quickQty, quickVariant?.id || null, variantLabel);
                    setToast({ message: `${quickAddProduct.subCategoryName || quickAddProduct.name} added to cart!`, type: 'success' });
                    setTimeout(() => setToast(null), 2000);
                    setQuickAddProduct(null);
                  }}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                    background: needsVariant ? 'rgba(212,168,67,0.35)' : 'var(--gold)',
                    color: '#000', fontWeight: 700, fontSize: '0.9rem',
                    cursor: needsVariant ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {needsVariant ? 'Select a variant first' : 'Add to Cart'}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`shop-toast ${toast.type}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>{toast.message}</span>
        </div>
      )}

    </div>
    </ErrorBoundary>
  );
}