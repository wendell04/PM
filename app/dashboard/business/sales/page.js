'use client';

export default function SalesPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Sales</h1>
        <p className="page-subtitle">
          View sales performance and revenue metrics.
        </p>
      </div>

      <div style={{
        background: 'var(--dark)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '3rem',
        textAlign: 'center',
      }}>
        <h3 style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '1.25rem',
          color: 'var(--white)',
          marginBottom: '0.5rem',
        }}>
          Sales Page
        </h3>
        <p style={{ color: 'var(--gray)', maxWidth: '400px', margin: '0 auto' }}>
          Track daily, weekly, and monthly sales. View revenue trends and top-selling products.
        </p>
      </div>
    </div>
  );
}
