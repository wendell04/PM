'use client';

export default function OrdersPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Orders</h1>
        <p className="page-subtitle">
          Manage and track all customer orders.
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
          Orders Page
        </h3>
        <p style={{ color: 'var(--gray)', maxWidth: '400px', margin: '0 auto' }}>
          View and manage all customer orders. Track order status, process payments, and handle shipping.
        </p>
      </div>
    </div>
  );
}
