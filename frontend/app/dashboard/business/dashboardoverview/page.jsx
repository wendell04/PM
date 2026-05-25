'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import DashboardOverview from './DashboardOverview';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';

const API_URL     = process.env.NEXT_PUBLIC_API_URL     || 'http://127.0.0.1:8000';
const SSA_API_URL = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';

const SECTION_META = [
  { key: 'orderRequests', label: 'Order Requests', href: '/dashboard/business/order-requests', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', desc: 'Review and process incoming order requests' },
  { key: 'orders',        label: 'Orders',         href: '/dashboard/business/orders',         icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', desc: 'View and manage customer orders' },
  { key: 'jobOrders',     label: 'Job Orders',     href: '/dashboard/business/job-orders',     icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', desc: 'Track and update production job orders' },
  { key: 'pos',           label: 'Point of Sale',  href: '/dashboard/business/pos',            icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', desc: 'Process walk-in and manual sales' },
  { key: 'inventory',     label: 'Inventory',      href: '/dashboard/business/inventory-v2',   icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', desc: 'Manage stock levels and movements' },
  { key: 'vendors',       label: 'Vendors',        href: '/dashboard/business/inventory-v2',   icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0', desc: 'Manage supplier and vendor information' },
  { key: 'badOrders',     label: 'Bad Orders',     href: '/dashboard/business/inventory-v2',   icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', desc: 'Handle returns and defective items' },
  { key: 'sales',         label: 'Sales',          href: '/dashboard/business/sales',          icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'View sales history and revenue' },
  { key: 'reports',       label: 'Reports',        href: '/dashboard/business/reports',        icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', desc: 'Business performance reports' },
  { key: 'products',      label: 'Products',       href: '/dashboard/business/products-v2',    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', desc: 'Manage the product catalog' },
  { key: 'banners',       label: 'Banners',        href: '/dashboard/business/banners',        icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', desc: 'Manage store banners and promotions' },
  { key: 'flashSales',    label: 'Flash Sales',    href: '/dashboard/business/flash-sales',    icon: 'M13 10V3L4 14h7v7l9-11h-7z', desc: 'Create and manage flash sales' },
  { key: 'vouchers',      label: 'Vouchers',       href: '/dashboard/business/vouchers',       icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z', desc: 'Manage discount vouchers and coupons' },
  { key: 'auditLogs',     label: 'Audit Logs',     href: '/dashboard/business/audit-logs',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', desc: 'View system audit and activity logs' },
  { key: 'userManagement',label: 'User Management',href: '/dashboard/business/users',          icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 100 8 4 4 0 000-8z', desc: 'Manage staff accounts and roles' },
  { key: 'rolePermissions',label: 'Role Permissions',href: '/dashboard/business/role-permissions', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', desc: 'Configure access permissions per role' },
];

function StaffDashboard({ currentUser, token }) {
  const router = useRouter();
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetchWithTimeout(`${API_URL}/api/my/permissions`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'ngrok-skip-browser-warning': '1' },
    }, 10000)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.data?.permissions) setPermissions(data.data.permissions); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const firstName = currentUser?.firstName || currentUser?.email?.split('@')[0] || 'there';
  const roleLabel = currentUser?.role || 'Staff';

  const accessible = SECTION_META.filter(s => permissions?.[s.key] === true);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ height: 40, width: '40%', background: 'var(--dark3)', borderRadius: 8, marginBottom: 12, animation: 'pulse 1.4s infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 32 }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ height: 110, background: 'var(--dark3)', borderRadius: 12, animation: 'pulse 1.4s infinite' }} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 960, margin: '0 auto' }}>
      {/* Welcome header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--white)' }}>
          Welcome back, {firstName}!
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--gray)', fontSize: '0.9rem' }}>
          You are logged in as <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{roleLabel}</span>.
          {accessible.length > 0
            ? ' Here are the sections you have access to.'
            : ' Your workspace will appear here once permissions are configured.'}
        </p>
      </div>

      {accessible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', border: '1px dashed var(--border)', borderRadius: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.2" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }}>
            <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--white)', fontSize: '1rem', marginBottom: 8 }}>No permissions configured yet</p>
          <p style={{ margin: 0, color: 'var(--gray)', fontSize: '0.85rem' }}>
            Ask your administrator to assign permissions to your role in Role Permissions.
          </p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            My Workspace
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {accessible.map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => router.push(s.href)}
                style={{
                  textAlign: 'left', padding: '1.1rem 1.25rem', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--dark2)',
                  cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.5)'; e.currentTarget.style.background = 'rgba(212,168,67,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--dark2)'; }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(212,168,67,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d={s.icon} />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--white)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardOverviewPage() {
  const { token, currentUser } = useAuth();
  const [data, setData] = useState({
    orderStats:      null,
    salesSummary:    null,
    inventory:       [],
    recentOrders:    [],
    activeBanners:   0,
    pendingReturns:  0,
    topProducts:     [],
    recentMovements: [],
    dailyRevenue:    [],
    ssaRevResult:    null,
    ssaQtyResult:    null,
    loading:         true,
    error:           null,
  });

  const fetchDashboard = useCallback(async () => {
    const activeToken = token || localStorage.getItem('auth_token');
    if (!activeToken) return;
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeToken}`,
        'ngrok-skip-browser-warning': 'true',
      };

      const settled = await Promise.allSettled([
        fetchWithTimeout(`${API_URL}/api/admin/orders?limit=2000`,           { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/inventory`,                    { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/banners`,                      { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/returns/stats`,                { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/inventory/recent-movements`,   { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/sales?limit=10000&status=completed`, { headers }, 30000),
      ]);

      const safeJson = async (result) => {
        if (result.status !== 'fulfilled') return null;
        const res = result.value;
        if (!res || !res.ok) return null;
        return res.json().catch(() => null);
      };

      const [ordersJson, inventoryJson, bannersJson, returnsJson, movementsJson, salesJson] =
        await Promise.all(settled.map(safeJson));

      const inventory  = inventoryJson?.data ?? inventoryJson ?? [];
      const allOrders  = ordersJson?.data?.orders ?? ordersJson?.data ?? ordersJson?.orders ?? ordersJson ?? [];
      const orders     = Array.isArray(allOrders) ? allOrders : [];

      // Compute order stats locally from fetched orders — avoids dependency on separate stats endpoint
      const isDelivered   = (o) => ['Delivered', 'delivered'].includes(o.orderStatus);
      const isCancelled   = (o) => ['Cancelled', 'cancelled'].includes(o.orderStatus);
      const isPending     = (o) => !isDelivered(o) && !isCancelled(o);
      const isExpiredOrder = (o) =>
        o.orderStatus === 'Pending' &&
        o.paymentStatus !== 'paid' &&
        (Date.now() - new Date(o.createdAt).getTime()) / 86400000 >= 7;

      const deliveredOrders = orders.filter(isDelivered);
      const totalRevenue    = deliveredOrders.reduce((s, o) => s + Number(o.totalAmount ?? o.totalPrice ?? 0), 0);
      const totalPaid       = orders.reduce((s, o) => s + Number(o.downPayment ?? 0), 0);

      const computedOrderStats = {
        totalOrders:      orders.length,
        pendingOrders:    orders.filter(isPending).length,
        completedOrders:  deliveredOrders.length,
        cancelledOrders:  orders.filter(isCancelled).length,
        expiredOrders:    orders.filter(isExpiredOrder).length,
        totalRevenue,
        cancellationRate: orders.length > 0
          ? Math.round((orders.filter(isCancelled).length / orders.length) * 10000) / 100
          : 0,
      };

      const computedSalesSummary = {
        totalSales:   deliveredOrders.length,
        totalRevenue,
        totalCost:    0,
        totalProfit:  totalPaid,
        manualSales:  orders.filter(o => o.source === 'manual').reduce((s, o) => s + Number(o.totalAmount ?? 0), 0),
        onlineSales:  orders.filter(o => o.source !== 'manual').reduce((s, o) => s + Number(o.totalAmount ?? 0), 0),
      };

      // Top products from all non-cancelled orders
      const prodMap = {};
      orders.filter(o => !isCancelled(o)).forEach(o => {
        (o.items || []).forEach(item => {
          const key = item.productId || item.productName || 'unknown';
          if (!prodMap[key]) prodMap[key] = { productName: item.productName || '—', category: item.category || '', totalQty: 0, totalRevenue: 0 };
          prodMap[key].totalQty     += Number(item.qty ?? item.quantity ?? 0);
          prodMap[key].totalRevenue += Number(item.lineTotal ?? 0);
        });
      });
      const computedTopProducts = Object.values(prodMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5);

      const banners = bannersJson?.data ?? [];
      const activeBanners   = Array.isArray(banners) ? banners.filter(b => b.isVisible === true || b.status === 'live').length : 0;
      const pendingReturns  = returnsJson?.data?.pendingCount ?? 0;
      const recentMovements = movementsJson?.data?.movements ?? [];

      // Compute last 30 days of daily revenue from delivered orders
      const dailyRevMap = {};
      deliveredOrders.forEach(o => {
        const d = o.createdAt ? new Date(o.createdAt).toISOString().split('T')[0] : null;
        if (d) dailyRevMap[d] = (dailyRevMap[d] ?? 0) + Number(o.totalAmount ?? 0);
      });
      const today = new Date();
      const localDate = (d) =>
        `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const dailyRevenue = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (29 - i));
        const ds = localDate(d);
        return { date: ds, value: dailyRevMap[ds] ?? 0 };
      });

      // Build SSA rows from Sales collection (same source as SSA forecast tab)
      const salesRecords = Array.isArray(salesJson?.data ?? salesJson) ? (salesJson?.data ?? salesJson) : [];
      const ssaRevMap = {};
      const ssaQtyMap = {};
      salesRecords.forEach(s => {
        const d = s.saleDate ? new Date(s.saleDate).toISOString().split('T')[0] : null;
        if (d) {
          ssaRevMap[d] = (ssaRevMap[d] ?? 0) + Number(s.totalPrice ?? 0);
          ssaQtyMap[d] = (ssaQtyMap[d] ?? 0) + Number(s.quantity ?? 0);
        }
      });
      const toRows = (map) =>
        Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));

      const callSsa = async (rows) => {
        if (rows.length < 4) return null;
        try {
          const res = await fetch(`${SSA_API_URL}/api/forecast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows, forecast_periods: 4, forecast_type: 'weekly', data_type: 'sales' }),
          });
          if (res.ok) return await res.json();
        } catch (_) {}
        return null;
      };

      const [ssaRevResult, ssaQtyResult] = await Promise.all([
        callSsa(toRows(ssaRevMap)),
        callSsa(toRows(ssaQtyMap)),
      ]);

      setData({
        orderStats:    computedOrderStats,
        salesSummary:  computedSalesSummary,
        inventory:     Array.isArray(inventory) ? inventory : [],
        recentOrders:  orders.slice(0, 5),
        activeBanners,
        pendingReturns,
        topProducts:   computedTopProducts,
        recentMovements,
        dailyRevenue,
        ssaRevResult,
        ssaQtyResult,
        loading:       false,
        error:         null,
      });
    } catch (err) {
      setData(prev => ({ ...prev, loading: false, error: err.message }));
    }
  }, [token]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (data.loading) {
    return (
      <div className="page-content-wrapper">
        <div className="skeleton-page">
          <div className="skeleton-header">
            <div className="skeleton-title" />
            <div className="skeleton-subtitle" />
          </div>
          <div className="skeleton-cards">
            {[...Array(4)].map((_, i) => (
              <div className="skeleton-card" key={i} />
            ))}
          </div>
          <div className="skeleton-table">
            <div className="skeleton-table-header" />
            {[...Array(5)].map((_, i) => (
              <div className="skeleton-row" key={i}>
                <div className="skeleton-cell skeleton-cell-short" />
                <div className="skeleton-cell skeleton-cell-wide" />
                <div className="skeleton-cell skeleton-cell-mid" />
                <div className="skeleton-cell-badge" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isAdminOwner = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  if (!isAdminOwner) {
    return (
      <ErrorBoundary>
        <div className="page-content-wrapper">
          <StaffDashboard currentUser={currentUser} token={token} />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
        <DashboardOverview
          orderStats={data.orderStats}
          salesSummary={data.salesSummary}
          inventory={data.inventory}
          recentOrders={data.recentOrders}
          activeBanners={data.activeBanners}
          pendingReturns={data.pendingReturns}
          topProducts={data.topProducts}
          recentMovements={data.recentMovements}
          dailyRevenue={data.dailyRevenue}
          ssaRevResult={data.ssaRevResult}
          ssaQtyResult={data.ssaQtyResult}
          onRefresh={fetchDashboard}
        />
      </div>
    </ErrorBoundary>
  );
}
