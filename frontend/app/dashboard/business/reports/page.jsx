'use client';

import ErrorBoundary from '../../../../components/ErrorBoundary';

/**
 * REPORTS PAGE
 * 
 * ⚠️ TODO: Implement reports functionality
 * 
 * Suggested reports to implement:
 * - Sales Reports (daily, weekly, monthly)
 * - Inventory Reports (low stock, out of stock, upon order)
 * - Order Reports (by status, by date range)
 * - Customer Reports (top customers, order frequency)
 * - Product Reports (best sellers, low performers)
 * 
 * Backend endpoints needed:
 * - GET /api/admin/reports/sales?period=daily|weekly|monthly
 * - GET /api/admin/reports/inventory?status=low-stock|out-of-stock
 * - GET /api/admin/reports/orders?status=&dateRange=
 * - GET /api/admin/reports/customers?top=N
 * - GET /api/admin/reports/products?metric=sales|views
 */

export default function ReportsPage() {
  return (
    <ErrorBoundary>
      <div>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          Generate and analyze business reports.
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
          Reports Page
        </h3>
        <p style={{ color: 'var(--gray)', maxWidth: '400px', margin: '0 auto' }}>
          Generate detailed reports on sales, inventory, customer behavior, and overall business performance.
        </p>
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          background: 'rgba(212, 168, 67, 0.1)',
          border: '1px solid rgba(212, 168, 67, 0.3)',
          borderRadius: '8px',
          fontSize: '0.85rem',
          color: 'var(--gray)',
        }}>
          <strong>⚠️ Coming Soon:</strong> This page is under development. Reports will be available in a future update.
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}