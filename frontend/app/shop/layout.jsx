'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// ─── Cart Context ─────────────────────────────────────────────────────────────
export const CartContext = createContext(null);

export function useCart() {
  return useContext(CartContext);
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

function getUser() {
  try {
    const raw = localStorage.getItem('auth_user') || sessionStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function ShopLayout({ children }) {
  const router = useRouter();
  const [user, setUser]       = useState(null);
  const [cart, setCart]       = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Guard: redirect to landing if not logged in
  useEffect(() => {
    setMounted(true);
    const token = getToken();
    const u = getUser();
    if (!token || !u) {
      // Store the intended destination
      sessionStorage.setItem('redirectAfterLogin', '/shop');
      router.replace('/');
      return;
    }
    setUser(u);

    // Load persisted cart from sessionStorage
    try {
      const saved = sessionStorage.getItem('shop_cart');
      if (saved) setCart(JSON.parse(saved));
    } catch {}
  }, []);

  // Persist cart changes
  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem('shop_cart', JSON.stringify(cart));
    }
  }, [cart, mounted]);

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Cart helpers ────────────────────────────────────────────────────────────
  function addToCart(product, variantId, variantName, qty = 1) {
    setCart(prev => {
      const key = `${product._id}_${variantId ?? 'none'}`;
      const existing = prev.find(i => `${i.product._id}_${i.variantId ?? 'none'}` === key);
      if (existing) {
        return prev.map(i =>
          `${i.product._id}_${i.variantId ?? 'none'}` === key
            ? { ...i, qty: i.qty + qty }
            : i
        );
      }
      return [...prev, { product, variantId, variantName, qty }];
    });
  }

  function removeFromCart(productId, variantId) {
    setCart(prev => prev.filter(
      i => !(i.product._id === productId && i.variantId === variantId)
    ));
  }

  function updateQty(productId, variantId, qty) {
    if (qty < 1) { removeFromCart(productId, variantId); return; }
    setCart(prev => prev.map(i =>
      i.product._id === productId && i.variantId === variantId
        ? { ...i, qty }
        : i
    ));
  }

  function clearCart() { setCart([]); }

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function handleLogout() {
    const token = getToken();
    try {
      await fetch(`${API_URL}/api/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_user');
    sessionStorage.removeItem('shop_cart');
    sessionStorage.setItem('justLoggedOut', 'true');
    router.replace('/');
  }

  if (!mounted) return null;

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQty, clearCart, cartCount }}>
      <div className="shop-wrapper">
        {/* ── Navbar ── */}
        <nav className={`shop-navbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="shop-navbar-container">
            {/* Logo */}
            <Link href="/shop" className="shop-navbar-logo">
              <img src="/logos/PersonalizeMe logo.png" alt="Personalize Me Prints" className="shop-navbar-logo-img" />
              <div className="shop-navbar-logo-text">
                PERSONALIZE <span>ME</span><br />PRINTS
              </div>
            </Link>

            {/* Right side */}
            <div className="shop-navbar-right">
              {/* Cart button */}
              <Link href="/shop/cart" className="shop-navbar-cart">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
                {cartCount > 0 && (
                  <span className="shop-navbar-cart-badge">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>

              {/* User menu */}
              <div className="shop-navbar-user">
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  className="shop-navbar-user-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span className="shop-navbar-user-name">
                    {user?.firstName || 'Account'}
                  </span>
                  <svg className={`shop-navbar-user-chevron ${menuOpen ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {menuOpen && (
                  <>
                    <div className="shop-navbar-user-backdrop" onClick={() => setMenuOpen(false)} />
                    <div className="shop-navbar-user-menu">
                      <div className="shop-navbar-user-info">
                        <div className="shop-navbar-user-label">Signed in as</div>
                        <div className="shop-navbar-user-name-full">
                          {user?.firstName} {user?.lastName}
                        </div>
                      </div>
                      <Link href="/shop/orders" className="shop-navbar-menu-item" onClick={() => setMenuOpen(false)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        My Orders
                      </Link>
                      <button onClick={handleLogout} className="shop-navbar-menu-item shop-navbar-logout">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        Log Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* ── Page Content ── */}
        <main className="shop-main-content">
          {children}
        </main>
      </div>

      <style>{`
        .shop-wrapper {
          min-height: 100vh;
          background: #0f0f0f;
          color: #f5f5f5;
          font-family: 'Outfit', sans-serif;
        }

        /* ── Navbar ── */
        .shop-navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(15, 15, 15, 0.95);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(212, 168, 67, 0.2);
          transition: all 0.3s ease;
        }

        .shop-navbar.scrolled {
          border-bottom: 1px solid rgba(212, 168, 67, 0.4);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }

        .shop-navbar-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 70px;
        }

        .shop-navbar-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-decoration: none;
        }

        .shop-navbar-logo-img {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
        }

        .shop-navbar-logo-text {
          font-family: 'Outfit', sans-serif;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 1.2px;
          line-height: 1.3;
          color: #fff;
          text-transform: uppercase;
        }

        .shop-navbar-logo-text span {
          color: #d4a843;
        }

        .shop-navbar-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .shop-navbar-cart {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          background: rgba(212, 168, 67, 0.08);
          border: 1px solid rgba(212, 168, 67, 0.25);
          border-radius: 10px;
          color: #d4a843;
          text-decoration: none;
          transition: all 0.2s;
        }

        .shop-navbar-cart:hover {
          background: rgba(212, 168, 67, 0.15);
          border-color: rgba(212, 168, 67, 0.4);
        }

        .shop-navbar-cart-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #d4a843;
          color: #0f0f0f;
          border-radius: 50%;
          min-width: 20px;
          height: 20px;
          font-size: 0.7rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }

        .shop-navbar-user {
          position: relative;
        }

        .shop-navbar-user-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 0.5rem 0.875rem;
          color: #f5f5f5;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .shop-navbar-user-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(212, 168, 67, 0.3);
        }

        .shop-navbar-user-name {
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .shop-navbar-user-chevron {
          transition: transform 0.2s;
        }

        .shop-navbar-user-chevron.open {
          transform: rotate(180deg);
        }

        .shop-navbar-user-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99;
        }

        .shop-navbar-user-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 10px);
          background: #1a1a1a;
          border: 1px solid rgba(212, 168, 67, 0.2);
          border-radius: 12px;
          min-width: 200px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
          z-index: 100;
          overflow: hidden;
        }

        .shop-navbar-user-info {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .shop-navbar-user-label {
          font-size: 0.75rem;
          color: #888;
          margin-bottom: 2px;
        }

        .shop-navbar-user-name-full {
          font-size: 0.95rem;
          font-weight: 600;
          color: #f5f5f5;
        }

        .shop-navbar-menu-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem 1.25rem;
          background: none;
          border: none;
          color: #ccc;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
          text-decoration: none;
        }

        .shop-navbar-menu-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #f5f5f5;
        }

        .shop-navbar-logout {
          color: #ef4444;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .shop-navbar-logout:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        /* ── Main Content ── */
        .shop-main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2.5rem 2rem;
        }

        @media (max-width: 768px) {
          .shop-navbar-container {
            padding: 0 1rem;
          }

          .shop-navbar-logo-text {
            display: none;
          }

          .shop-navbar-user-name {
            display: none;
          }

          .shop-main-content {
            padding: 1.5rem 1rem;
          }
        }
      `}</style>
    </CartContext.Provider>
  );
}