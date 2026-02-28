'use client';

export default function InventoryPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Inventory</h1>
        <p className="page-subtitle">
          Track and manage your product stock levels.
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
          Inventory Page
        </h3>
        <p style={{ color: 'var(--gray)', maxWidth: '400px', margin: '0 auto' }}>
          Monitor stock levels, set low-stock alerts, and manage product availability across all variants.
        </p>
      </div>
    </div>
  );
}
