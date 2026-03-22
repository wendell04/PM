'use client';

import ErrorBoundary from '../../../../components/ErrorBoundary';

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
      </div>
    </div>
    </ErrorBoundary>
  );
}