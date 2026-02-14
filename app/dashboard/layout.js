'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../src/contexts/AuthContext';

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, currentUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Determine user type based on the path or current user
  const userType = currentUser?.userType || (pathname?.includes('/dashboard/business') ? 'business' : 'customer');
  
  // Navigation items based on user type
  const navItems = userType === 'business' 
    ? [
        { name: 'Products', href: '/dashboard/business', icon: '📦' },
        { name: 'Orders', href: '/dashboard/business/orders', icon: '📋' },
        { name: 'Analytics', href: '/dashboard/business/analytics', icon: '📊' },
        { name: 'Settings', href: '/dashboard/business/settings', icon: '⚙️' },
      ]
    : [
        { name: 'Products', href: '/dashboard/customer', icon: '🛍️' },
        { name: 'Orders', href: '/dashboard/customer/orders', icon: '📦' },
        { name: 'Profile', href: '/dashboard/customer/profile', icon: '👤' },
        { name: 'Cart', href: '/dashboard/customer/cart', icon: '🛒' },
      ];

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar toggle */}
      <div className="md:hidden">
        <div className="fixed inset-0 z-40">
          {sidebarOpen ? (
            <div className="fixed inset-0 z-40 flex">
              <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} aria-hidden="true"></div>
              <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
                <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
                  <div className="flex-shrink-0 flex items-center px-4">
                    <h1 className="text-xl font-semibold text-gray-900">
                      {userType === 'business' ? 'Business Dashboard' : 'Customer Dashboard'}
                    </h1>
                  </div>
                  <nav className="mt-5 px-2 space-y-1">
                    {navItems.map((item) => (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`${
                          pathname === item.href
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        } group flex items-center px-2 py-2 text-base font-medium rounded-md`}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.name}
                      </Link>
                    ))}
                  </nav>
                </div>
                <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
                  <button 
                    onClick={handleLogout}
                    className="text-red-600 hover:text-red-800 font-medium w-full text-left"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 border-r border-gray-200 bg-white">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <div className="flex items-center flex-shrink-0 px-4">
              <h1 className="text-xl font-semibold text-gray-900">
                {userType === 'business' ? 'Business Dashboard' : 'Customer Dashboard'}
              </h1>
            </div>
            <nav className="mt-5 flex-1 px-2 bg-white space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`${
                    pathname === item.href
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  } group flex items-center px-2 py-2 text-sm font-medium rounded-md`}
                >
                  <span className="mr-3">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <button 
              onClick={handleLogout}
              className="text-red-600 hover:text-red-800 font-medium w-full text-left"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="md:pl-64 flex flex-col flex-1">
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}