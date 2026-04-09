'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../layout';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// ─── Stub fallback ────────────────────────────────────────────────────────────
const STUB = {
  _id: 'stub-1',
  name: 'Custom Mug',
  description: 'Personalized ceramic mug with your photo or design. Perfect for gifts and special occasions. We use high-quality sublimation printing that is dishwasher safe and fade resistant.',
  category: 'Drinkware',
  tags: ['mug', 'ceramic', 'gift'],
  images: [],
  variants: [{ name: 'White', sku: 'MUG-W' }, { name: 'Black', sku: 'MUG-B' }],
  priceTiers: [
    { minQty: 1, maxQty: 9, price: 250 },
    { minQty: 10, maxQty: 49, price: 220 },
    { minQty: 50, price: 190 },
  ],
  flatPrice: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolvePrice(product, qty) {
  const tiers = product.priceTiers ?? [];
  if (tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    for (const tier of sorted) {
      const max = tier.maxQty ?? Infinity;
      if (qty >= tier.minQty && qty <= max) return tier.price;
    }
    return sorted[sorted.length - 1].price;
  }
  return product.flatPrice ?? 0;
}

function BackArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProductDetailPage() {
  const { id }    = useParams();
  const router    = useRouter();
  const { addToCart } = useCart();
  const { token } = useAuth();

  const [product, setProduct]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty]               = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded]           = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/products/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 10000);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        setProduct(data);
        if (data.variants?.length) setSelectedVariant(data.variants[0]);
      } catch {
        if (id.startsWith('stub-')) {
          setProduct(STUB);
          if (STUB.variants?.length) setSelectedVariant(STUB.variants[0]);
        } else {
          router.replace('/shop');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [id, router, token]);

  function handleAddToCart() {
    if (!product) return;
    addToCart(
      product,
      selectedVariant?.sku ?? selectedVariant?.name ?? null,
      selectedVariant?.name ?? null,
      qty
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: '#555' }}>
      Loading product…
    </div>
  );

  if (!product) return null;

  const unitPrice   = resolvePrice(product, qty);
  const totalPrice  = unitPrice * qty;
  const hasImages   = product.images?.length > 0;
  const hasTiers    = product.priceTiers?.length > 0;

  return (
    <ErrorBoundary>
      <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Link href="/shop" style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          color: '#777', textDecoration: 'none', fontSize: '0.85rem',
          transition: 'color 0.2s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = '#d4a843'}
          onMouseLeave={e => e.currentTarget.style.color = '#777'}
        >
          <BackArrow /> Shop
        </Link>
        <span style={{ color: '#444', fontSize: '0.85rem' }}>/</span>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>{product.category}</span>
        <span style={{ color: '#444', fontSize: '0.85rem' }}>/</span>
        <span style={{ color: '#f5f5f5', fontSize: '0.85rem' }}>{product.name}</span>
      </div>

      {/* Main grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
        gap: '2.5rem',
        alignItems: 'start',
      }}>
        {/* ── Left: Images ── */}
        <div>
          {/* Main image */}
          <div style={{
            background: hasImages ? 'transparent' : '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px',
            overflow: 'hidden',
            height: '380px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {hasImages ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={product.images[activeImage]}
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.12)' }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <div style={{ marginTop: '8px', fontSize: '0.8rem' }}>No photo yet</div>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {hasImages && product.images.length > 1 && (
            <div style={{
              display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap',
            }}>
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  style={{
                    width: '64px', height: '64px',
                    border: i === activeImage
                      ? '2px solid #d4a843'
                      : '2px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', overflow: 'hidden',
                    cursor: 'pointer', padding: 0, background: 'none',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Info + Add to cart ── */}
        <div>
          {/* Category badge */}
          <div style={{
            display: 'inline-block',
            background: 'rgba(212,168,67,0.1)',
            border: '1px solid rgba(212,168,67,0.3)',
            borderRadius: '6px',
            padding: '2px 10px',
            fontSize: '0.72rem',
            color: '#d4a843',
            marginBottom: '0.75rem',
            fontWeight: 500,
          }}>
            {product.category}
          </div>

          <h1 style={{
            margin: '0 0 0.75rem',
            fontSize: '1.5rem', fontWeight: 700, color: '#f5f5f5',
          }}>
            {product.name}
          </h1>

          <p style={{
            margin: '0 0 1.5rem',
            color: '#999', fontSize: '0.875rem', lineHeight: 1.65,
          }}>
            {product.description}
          </p>

          {/* Variants */}
          {product.variants?.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#777', marginBottom: '0.5rem', fontWeight: 500 }}>
                VARIANT
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {product.variants.map(v => (
                  <button
                    key={v.name}
                    onClick={() => setSelectedVariant(v)}
                    style={{
                      padding: '0.4rem 0.9rem',
                      border: selectedVariant?.name === v.name
                        ? '1px solid #d4a843'
                        : '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      background: selectedVariant?.name === v.name
                        ? 'rgba(212,168,67,0.12)'
                        : 'transparent',
                      color: selectedVariant?.name === v.name ? '#d4a843' : '#aaa',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#777', marginBottom: '0.5rem', fontWeight: 500 }}>
              QUANTITY
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                style={{
                  width: '36px', height: '36px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px', background: '#1a1a1a',
                  color: '#f5f5f5', fontSize: '1.1rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >−</button>
              <span style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 600, fontSize: '1rem' }}>
                {qty}
              </span>
              <button
                onClick={() => setQty(q => q + 1)}
                style={{
                  width: '36px', height: '36px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px', background: '#1a1a1a',
                  color: '#f5f5f5', fontSize: '1.1rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >+</button>
            </div>
          </div>

          {/* Price display */}
          <div style={{
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#777', fontSize: '0.85rem' }}>Unit price</span>
              <span style={{ color: '#d4a843', fontWeight: 600 }}>₱{unitPrice.toLocaleString()}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '0.5rem', paddingTop: '0.5rem',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ color: '#f5f5f5', fontSize: '0.9rem', fontWeight: 500 }}>Total ({qty} pc{qty !== 1 ? 's' : ''})</span>
              <span style={{ color: '#d4a843', fontWeight: 700, fontSize: '1.15rem' }}>
                ₱{totalPrice.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Price tiers */}
          {hasTiers && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.4rem' }}>
                BULK PRICING
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {[...product.priceTiers]
                  .sort((a, b) => a.minQty - b.minQty)
                  .map((tier, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '0.78rem',
                      color: qty >= tier.minQty && qty <= (tier.maxQty ?? Infinity)
                        ? '#d4a843' : '#666',
                      fontWeight: qty >= tier.minQty && qty <= (tier.maxQty ?? Infinity) ? 600 : 400,
                    }}>
                      <span>
                        {tier.maxQty
                          ? `${tier.minQty}–${tier.maxQty} pcs`
                          : `${tier.minQty}+ pcs`}
                      </span>
                      <span>₱{tier.price.toLocaleString()} / pc</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Add to cart */}
          <button
            onClick={handleAddToCart}
            style={{
              width: '100%', padding: '0.85rem',
              background: added ? '#2a7a2a' : '#d4a843',
              border: 'none', borderRadius: '10px',
              color: added ? '#fff' : '#0f0f0f',
              fontWeight: 700, fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.25s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}
          >
            {added ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Added to Cart!
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
                Add to Cart
              </>
            )}
          </button>

          {/* Tags */}
          {product.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '1rem' }}>
              {product.tags.map(tag => (
                <span key={tag} style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '4px',
                  padding: '2px 7px',
                  fontSize: '0.72rem', color: '#666',
                }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}