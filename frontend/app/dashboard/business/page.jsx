'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * BUSINESS DASHBOARD HOME - Redirects to Dashboard Overview
 *
 * Redirects /dashboard/business to /dashboard/business/dashboardoverview.
 */

export default function BusinessDashboardHome() {
  const router = useRouter();

  useEffect(() => {
    router.push('/dashboard/business/dashboardoverview');
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--dark)',
      color: 'var(--white)',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      <div className="spinner" style={{
        width: '40px',
        height: '40px',
        border: '4px solid var(--border)',
        borderTop: '4px solid var(--gold)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <p>Loading dashboard...</p>
    </div>
  );
}
