'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * BUSINESS DASHBOARD HOME - Redirects to Add Products page
 * 
 * This page serves as a redirect from the old /dashboard/business route
 * to the new /dashboard/business/products/add route.
 */

export default function BusinessDashboardHome() {
  const router = useRouter();

  useEffect(() => {
    router.push('/dashboard/business/products/add');
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
      <p>Redirecting to Add Products...</p>
    </div>
  );
}
