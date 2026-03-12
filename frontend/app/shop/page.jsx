'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCart } from './layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// ─── Price Helper ─────────────────────────────────────────────────────────────
function getDisplayPrice(product) {
  if (product.flatPrice) return `₱${product.flatPrice.toLocaleString()}`;
  if (product.priceTiers?.length) {
    const sorted = [...product.priceTiers].sort((a, b) => a.minQty - b.minQty);
    const min = sorted[0].price;
    const max = sorted[sorted.length - 1].price;
    if (min === max) return `₱${min.toLocaleString()}`;
    return `₱${max.toLocaleString()} – ₱${min.toLocaleString()}`;
  }
  return 'Price on request';
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product, onAddToCart }) {
  const [hovered, setHovered] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const hasImage = product.images?.length > 0;

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAdding(true);
    onAddToCart(product);
    setTimeout(() => setIsAdding(false), 500);
  };

  return (
    <Link href={`/shop/${product._id}`} className="shop-product-card-link">
      <div
        className={`shop-product-card ${hovered ? 'hovered' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Image area */}
        <div className="shop-product-image-area">
          {hasImage ? (
            <img
              src={product.images[0]}
              alt={product.name}
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

          {/* Quick Add to Cart Button */}
          <button
            className={`shop-quick-add-btn ${isAdding ? 'adding' : ''}`}
            onClick={handleAddToCart}
            title="Add to Cart"
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
            {product.name}
          </h3>

          <p className="shop-product-description">
            {product.description}
          </p>

          <div className="shop-product-footer">
            <span className="shop-product-price">
              {getDisplayPrice(product)}
            </span>

            {product.variants?.length > 0 && (
              <span className="shop-product-variants">
                {product.variants.length} {product.variants.length !== 1 ? 'variants' : 'variant'}
              </span>
            )}
          </div>
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
  const [toast, setToast]         = useState(null);
  const { addToCart } = useCart();

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/api/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
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
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <div>
      {/* Header */}
      <div className="shop-page-header">
        <h1 className="shop-page-title">
          Our <span className="gold-text">Products</span>
        </h1>
        <p className="shop-page-subtitle">
          Browse our personalized items and place your order
        </p>
      </div>

      {/* Search + Filter bar */}
      <div className="shop-filter-bar">
        {/* Search */}
        <div className="shop-search-wrapper">
          <svg className="shop-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="shop-search-input"
          />
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

      {/* Grid */}
      {loading ? (
        <div className="shop-products-grid shop-products-grid-loading">
          {[...Array(6)].map((_, i) => (
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
            <ProductCard key={product._id} product={product} onAddToCart={handleAddToCart} />
          ))}
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

      <style>{`
        .shop-page-header {
          margin-bottom: 2rem;
        }

        .shop-page-title {
          margin: 0 0 0.5rem;
          font-size: 2rem;
          font-weight: 700;
          color: #f5f5f5;
          font-family: 'Outfit', sans-serif;
        }

        .shop-page-title .gold-text {
          color: #d4a843;
        }

        .shop-page-subtitle {
          margin: 0;
          color: #888;
          font-size: 0.95rem;
        }

        .shop-filter-bar {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 2rem;
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
          padding: 0.7rem 1rem 0.7rem 2.5rem;
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

        .shop-products-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1.5rem;
        }

        .shop-products-grid-loading {
          /* Loading state */
        }

        .shop-product-skeleton {
          height: 340px;
          border-radius: 12px;
          background: linear-gradient(90deg, #1a1a1a 25%, #222 50%, #1a1a1a 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .shop-empty-state {
          text-align: center;
          padding: 5rem 2rem;
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

        @media (max-width: 768px) {
          .shop-page-title {
            font-size: 1.5rem;
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

          .shop-empty-state {
            padding: 3rem 1rem;
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
          height: 200px;
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

        /* Quick Add to Cart Button */
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

        /* Toast Notification */
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

        @media (max-width: 768px) {
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
      `}</style>
    </div>
  );
}