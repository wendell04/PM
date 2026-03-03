'use client';

export default function ProductListPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Products</h1>
        <p className="page-subtitle">
          Edit and manage your product catalog.
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
          Product List Page
        </h3>
        <p style={{ color: 'var(--gray)', maxWidth: '400px', margin: '0 auto' }}>
          View and manage your product catalog. Edit product details, update inventory, and track performance.
        </p>
      </div>
    </div>
  );
}
