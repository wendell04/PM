'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../../src/contexts/AuthContext';
import './admin-dashboard.css';

export default function BusinessDashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, currentUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navItems = [
    { name: 'Add Products', href: '/dashboard/business' },
    { name: 'Orders', href: '/dashboard/business/orders' },
    { name: 'Inventory', href: '/dashboard/business/inventory' },
    { name: 'Sales', href: '/dashboard/business/sales' },
    { name: 'Reports', href: '/dashboard/business/reports' },
  ];

  return (
    <div className="admin-dashboard-wrapper">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo">
            <img src="/logos/PersonalizeMe logo.png" alt="Personalize Me Prints" className="sidebar-logo-img" />
            <div className="sidebar-logo-text">
              PERSONALIZE <span>ME</span><br />PRINTS
            </div>
          </Link>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`sidebar-nav-item ${pathname === item.href ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-text">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {currentUser?.name?.charAt(0)?.toUpperCase() || 'B'}
            </div>
            <div className="user-details">
              <div className="user-name">{currentUser?.name || 'Business Owner'}</div>
              <div className="user-role">Business Owner</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="admin-main-content">
        {/* Top bar */}
        <header className="admin-top-bar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="top-bar-right">
            <div className="notification-btn">
              <span>🔔</span>
              <span className="notification-badge">3</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="admin-page-content">
          {children}
        </main>
      </div>
    </div>
  );
}