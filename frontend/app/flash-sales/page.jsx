'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'http://127.0.0.1:8000';

export default function FlashSalesStorefront() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/storefront/flash-sales`
        );
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setSales(data.data || []);
      } catch {
        setError('Failed to load flash sales.');
      } finally {
        setLoading(false);
      }
    };
    fetchSales();

    const interval = setInterval(
      () => setNow(new Date()), 1000
    );
    return () => clearInterval(interval);
  }, []);

  function getCountdown(endDate) {
    const diff = new Date(endDate) - now;
    if (diff <= 0) return { text: 'Ended', urgent: false };
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return {
      text: `${h}h ${m}m ${s}s`,
      urgent: diff < 3600000,
    };
  }

  return (
    <div style={{ padding: '2rem 1rem',
      maxWidth: '1200px', margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: '2rem', fontWeight: 800,
          color: 'var(--white)', margin: 0,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          ⚡ Flash Sales
        </h1>
        <p style={{ color: 'var(--gray)', fontSize: '0.95rem',
          marginTop: '0.5rem' }}>
          Limited-time deals — grab them before they expire!
        </p>
      </div>

      {/* Error */}
      {error && (
        <p style={{ color: '#ef4444', textAlign: 'center',
          padding: '2rem' }}>
          {error}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1.5rem',
        }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden',
              background: 'var(--dark2)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              <div style={{ height: '200px',
                background: 'var(--dark)' }} />
              <div style={{ padding: '1rem', display: 'flex',
                flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ height: '14px',
                  background: 'var(--border)',
                  borderRadius: '4px', width: '70%' }} />
                <div style={{ height: '14px',
                  background: 'var(--border)',
                  borderRadius: '4px', width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && sales.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem 2rem',
          color: 'var(--gray)' }}>
          <div style={{ fontSize: '3rem',
            marginBottom: '1rem' }}>⚡</div>
          <p style={{ fontSize: '1.1rem', color: 'var(--white)',
            fontWeight: 600, marginBottom: '0.5rem' }}>
            No flash sales right now
          </p>
          <p>Check back soon for limited-time deals!</p>
        </div>
      )}

      {/* Grid */}
      {!loading && !error && sales.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1.5rem',
        }}>
          {sales.map((sale, i) => {
            const countdown = getCountdown(sale.endDate);
            return (
              <div key={i} style={{
                border: '1px solid var(--border)',
                borderRadius: '12px', overflow: 'hidden',
                background: 'var(--dark2)',
                transition: 'transform 0.15s, border-color 0.15s',
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = 'var(--gold)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.borderColor =
                    'var(--border)';
                }}>

                {/* Image area */}
                <div style={{ position: 'relative',
                  aspectRatio: '1/1',
                  background: 'var(--dark)' }}>
                  {sale.productThumbnail ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={sale.productThumbnail}
                      alt={sale.productName}
                      style={{ width: '100%', height: '100%',
                        objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--gray)', fontSize: '2rem' }}>
                      ⚡
                    </div>
                  )}

                  {/* Discount badge */}
                  <div style={{
                    position: 'absolute', top: '0.625rem',
                    left: '0.625rem',
                    background: sale.discountType === 'percentage'
                      ? '#ef4444' : 'var(--gold)',
                    color: sale.discountType === 'percentage'
                      ? '#fff' : '#000',
                    fontWeight: 800, fontSize: '0.8rem',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '999px',
                  }}>
                    {sale.discountType === 'percentage'
                      ? `${sale.discountValue}% OFF`
                      : `₱${sale.discountValue} OFF`}
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '1rem' }}>

                  {/* Product name */}
                  <p style={{
                    fontSize: '0.9rem', fontWeight: 600,
                    color: 'var(--white)', margin: '0 0 0.5rem',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {sale.productName || 'Flash Sale'}
                  </p>

                  {/* Price row */}
                  <div style={{ display: 'flex',
                    alignItems: 'center', gap: '0.5rem',
                    marginBottom: '0.625rem', flexWrap: 'wrap' }}>
                    {sale.originalPrice != null && (
                      <span style={{
                        fontSize: '0.8rem', color: 'var(--gray)',
                        textDecoration: 'line-through',
                      }}>
                        ₱{Number(sale.originalPrice)
                          .toLocaleString('en-PH',
                            { minimumFractionDigits: 2,
                              maximumFractionDigits: 2 })}
                      </span>
                    )}
                    {sale.discountedPrice != null && (
                      <span style={{
                        fontSize: '1.1rem', fontWeight: 800,
                        color: 'var(--gold)',
                      }}>
                        ₱{Number(sale.discountedPrice)
                          .toLocaleString('en-PH',
                            { minimumFractionDigits: 2,
                              maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  {/* Countdown */}
                  <div style={{ display: 'flex',
                    alignItems: 'center', gap: '0.375rem' }}>
                    <svg width="13" height="13"
                      viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2"
                      style={{ color: countdown.urgent
                        ? '#f87171' : 'var(--gray)',
                        flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 600,
                      color: countdown.urgent
                        ? '#f87171' : 'var(--gray)',
                    }}>
                      {countdown.text === 'Ended'
                        ? 'Ended'
                        : `Ends in: ${countdown.text}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
