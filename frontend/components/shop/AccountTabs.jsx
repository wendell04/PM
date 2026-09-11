'use client';

import Link from 'next/link';

/**
 * One way in and out of the customer's own pages.
 *
 * My Orders was already in the navbar, so it was never misplaced - it was a dead end. Nothing on
 * it led back to Profile, so the only way there was the browser's Back button, which is what a
 * tester reported as "parang sub-page sya". Profile, My Orders and Quotes are siblings; this is
 * the strip that says so.
 *
 * Rendered inside each page's own container rather than as a route layout, so neither page's
 * width, padding or existing header moves.
 */
const TABS = [
  { href: '/shop/profile',        key: 'profile', label: 'Profile' },
  { href: '/shop/orders-history', key: 'orders',  label: 'My Orders' },
  { href: '/shop/quotes',         key: 'quotes',  label: 'Quotes' },
];

export default function AccountTabs({ active, count = null }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <Link href="/shop" className="back-to-shop-btn" style={{ marginBottom: '14px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Shop
      </Link>

      <nav
        aria-label="Account"
        style={{
          display: 'flex', gap: '4px', marginTop: '12px',
          borderBottom: '1px solid var(--border)', overflowX: 'auto',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
        }}
      >
        {TABS.map(tab => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              style={{
                padding: '9px 14px',
                fontSize: '0.82rem',
                fontWeight: isActive ? 800 : 600,
                color: isActive ? 'var(--gold)' : 'var(--gray)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                // Sits on the container's border so the active tab reads as joined to the panel
                // below it rather than floating above a line.
                borderBottom: `2px solid ${isActive ? 'var(--gold)' : 'transparent'}`,
                marginBottom: '-1px',
              }}
            >
              {tab.label}
              {isActive && count != null && (
                <span style={{ marginLeft: '6px', fontWeight: 600, color: 'var(--gray)' }}>{count}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
