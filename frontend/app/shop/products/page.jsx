'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const PAGE_SIZE = 20;

function getDisplayPrice(product) {
  if (product.priceType === 'inquiry') return 'Price on request';
  if (product.priceType === 'fixed') {
    const vp = product.variantPrices ?? {};
    if (Object.keys(vp).length) {
      const prices = Object.values(vp).map(p => parseFloat(p)).filter(p => p > 0);
      if (!prices.length) return 'Price on request';
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min === max) return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} – ₱${max.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (product.price) return `₱${parseFloat(product.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (product.priceType === 'tiered' && product.priceTiers?.length) {
    const all = product.priceTiers.flatMap(t =>
      Object.values(t.prices || {}).map(p => parseFloat(p)).filter(p => p > 0)
    );
    if (!all.length) return 'Price on request';
    const min = Math.min(...all);
    const max = Math.max(...all);
    if (min === max) return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `₱${min.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} – ₱${max.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return 'Price on request';
}

function getMinPrice(product) {
  if (product.priceType === 'fixed') {
    const vp = product.variantPrices ?? {};
    if (Object.keys(vp).length) {
      const prices = Object.values(vp).map(p => parseFloat(p)).filter(p => p > 0);
      return prices.length ? Math.min(...prices) : null;
    }
    return parseFloat(product.price) || null;
  }
  if (product.priceType === 'tiered' && product.priceTiers?.length) {
    const all = product.priceTiers.flatMap(t =>
      Object.values(t.prices || {}).map(p => parseFloat(p)).filter(p => p > 0)
    );
    return all.length ? Math.min(...all) : null;
  }
  return null;
}

function ProductCard({ product }) {
  const [hovered, setHovered] = useState(false);
  const img = product.thumbnail || product.images?.[0];
  const price = getDisplayPrice(product);

  return (
    <Link
      href={`/shop/products/${product.id ?? product._id}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: 'var(--dark2)',
          border: `1px solid ${hovered ? 'var(--gold)' : 'var(--border)'}`,
          borderRadius: '12px',
          overflow: 'hidden',
          transition: 'border-color 0.15s, transform 0.15s',
          transform: hovered ? 'translateY(-2px)' : 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--dark)', overflow: 'hidden' }}>
          {img ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={img}
              alt={product.subCategoryName || product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
          )}
          {product.stockStatus === 'out-of-stock' && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                padding: '4px 12px', borderRadius: '999px',
                background: 'rgba(239,68,68,0.9)',
                color: '#fff', fontSize: '0.75rem', fontWeight: 700,
              }}>
                Out of Stock
              </span>
            </div>
          )}
        </div>
        <div style={{ padding: '12px' }}>
          {product.category && (
            <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              {product.category}
            </div>
          )}
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)', lineHeight: 1.3, marginBottom: '6px' }}>
            {product.subCategoryName || product.name}
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gold)' }}>
            {price}
          </div>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', animation: 'pulse 1.5s ease-in-out infinite' }}>
      <div style={{ aspectRatio: '1/1', background: 'var(--border)' }} />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ height: '10px', background: 'var(--border)', borderRadius: '4px', width: '40%' }} />
        <div style={{ height: '14px', background: 'var(--border)', borderRadius: '4px', width: '80%' }} />
        <div style={{ height: '12px', background: 'var(--border)', borderRadius: '4px', width: '50%' }} />
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'name_az', label: 'Name A–Z' },
  { value: 'name_za', label: 'Name Z–A' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

export default function ProductsListingPage() {
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [search, setSearch]           = useState('');
  const [category, setCategory]       = useState('All');
  const [sort, setSort]               = useState('newest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const h = {};
    if (process.env.NODE_ENV === 'development') h['ngrok-skip-browser-warning'] = '1';
    fetchWithTimeout(`${API_URL}/api/products`, { headers: h }, 20000)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load products.')))
      .then(data => {
        const list = data.data ?? data;
        setAllProducts(Array.isArray(list) ? list : []);
      })
      .catch(err => setError(err.message || 'Failed to load products.'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = ['All', ...new Set(allProducts.map(p => p.category).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b));
    return cats;
  }, [allProducts]);

  const filtered = useMemo(() => {
    let list = allProducts;
    if (category !== 'All') list = list.filter(p => p.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.subCategoryName || p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    const copy = [...list];
    if (sort === 'name_az') copy.sort((a, b) => (a.subCategoryName || a.name || '').localeCompare(b.subCategoryName || b.name || ''));
    else if (sort === 'name_za') copy.sort((a, b) => (b.subCategoryName || b.name || '').localeCompare(a.subCategoryName || a.name || ''));
    else if (sort === 'price_asc') copy.sort((a, b) => (getMinPrice(a) ?? Infinity) - (getMinPrice(b) ?? Infinity));
    else if (sort === 'price_desc') copy.sort((a, b) => (getMinPrice(b) ?? -Infinity) - (getMinPrice(a) ?? -Infinity));
    return copy;
  }, [allProducts, category, search, sort]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--dark)', padding: '24px 16px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Link href="/shop" style={{ color: 'var(--gray)', fontSize: '0.85rem', textDecoration: 'none' }}>
              Shop
            </Link>
            <span style={{ color: 'var(--border)' }}>›</span>
            <span style={{ color: 'var(--white)', fontSize: '0.85rem' }}>Products</span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--white)' }}>
            All Products
          </h1>
          {!loading && !error && (
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--gray)' }}>
              {filtered.length} product{filtered.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Search + Sort bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="var(--gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px 10px 40px',
                background: 'var(--dark2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--white)', fontSize: '0.875rem',
                outline: 'none',
              }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setVisibleCount(PAGE_SIZE); }}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--gray)',
                  cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={e => { setSort(e.target.value); setVisibleCount(PAGE_SIZE); }}
            style={{
              padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--dark2)', color: 'var(--white)',
              fontSize: '0.875rem', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Category pills */}
        {!loading && categories.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {categories.map(cat => {
              const isActive = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => { setCategory(cat); setVisibleCount(PAGE_SIZE); }}
                  style={{
                    padding: '6px 16px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: isActive ? 700 : 500,
                    border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`,
                    background: isActive ? 'rgba(212,168,67,0.12)' : 'var(--dark2)',
                    color: isActive ? 'var(--gold)' : 'var(--gray)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            padding: '16px', borderRadius: '8px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)',
            color: 'var(--red)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{error}</span>
            <button
              onClick={() => window.location.reload()}
              style={{ background: 'none', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '4px 12px', fontSize: '13px', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '4rem 1.5rem',
            background: 'rgba(212,168,67,0.03)',
            border: '1px dashed rgba(212,168,67,0.15)',
            borderRadius: '16px',
          }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,67,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '6px' }}>
              {search ? 'No products found' : 'No products available'}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '1.5rem' }}>
              {search ? `No results for "${search}"` : 'Check back soon for new products.'}
            </div>
            {search && (
              <button
                onClick={() => { setSearch(''); setCategory('All'); }}
                style={{
                  padding: '10px 24px', borderRadius: '8px',
                  background: 'var(--gold)', color: 'var(--dark)',
                  fontWeight: 700, fontSize: '0.875rem',
                  border: 'none', cursor: 'pointer',
                }}
              >
                Clear Search
              </button>
            )}
          </div>
        )}

        {/* Product grid */}
        {!loading && !error && visible.length > 0 && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '16px',
            }}>
              {visible.map(p => (
                <ProductCard key={p.id ?? p._id} product={p} />
              ))}
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: '32px' }}>
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  style={{
                    padding: '12px 32px', borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--dark2)',
                    color: 'var(--gray)', fontSize: '0.875rem',
                    fontWeight: 600, cursor: 'pointer',
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--gray)'; }}
                >
                  Load More ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
