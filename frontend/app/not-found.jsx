import Link from 'next/link';

// A mistyped or outdated address. Without this the visitor got the framework's bare
// "404 | This page could not be found." on a black page, with no way back to the shop.
// Same look as app/error.jsx, so the two "something is off" pages match.
export const metadata = { title: 'Page not found - Personalize Me Prints' };

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '24px',
      background: 'var(--bg, #0f0f0f)',
      color: 'var(--text, #f5f5f5)',
      fontFamily: 'inherit',
      textAlign: 'center',
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.5" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>We could not find that page</h1>
      <p style={{ fontSize: '0.875rem', color: '#888', margin: 0, maxWidth: '360px' }}>
        The link may be old, or the address may have a typo. Your orders and cart are not affected.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/shop" style={{ padding: '8px 20px', background: '#d4a843', borderRadius: '8px', color: '#000', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}>
          Go to the shop
        </Link>
        <Link href="/" style={{ padding: '8px 20px', border: '1px solid #444', borderRadius: '8px', color: 'inherit', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}>
          Home page
        </Link>
      </div>
    </div>
  );
}
