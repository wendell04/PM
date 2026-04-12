'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardOverview from './DashboardOverview';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function DashboardOverviewPage() {
  const { token } = useAuth();
  const [data, setData] = useState({
    orderStats:      null,
    salesSummary:    null,
    inventory:       [],
    recentOrders:    [],
    activeBanners:   0,
    pendingReturns:  0,
    topProducts:     [],
    recentMovements: [],
    loading:         true,
    error:           null,
  });

  const fetchDashboard = useCallback(async () => {
    const activeToken = token ||
      sessionStorage.getItem('auth_token') ||
      localStorage.getItem('auth_token');
    if (!activeToken) return;
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeToken}`,
        'ngrok-skip-browser-warning': 'true',
      };

      const [statsRes, salesRes, inventoryRes, ordersRes, bannersRes, returnsRes, topProductsRes, movementsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/orders/stats`,              { headers }),
        fetch(`${API_URL}/api/admin/sales/summary`,             { headers }),
        fetch(`${API_URL}/api/admin/inventory`,                  { headers }),
        fetch(`${API_URL}/api/admin/orders`,                     { headers }),
        fetch(`${API_URL}/api/admin/banners`,                    { headers }),
        fetch(`${API_URL}/api/admin/returns/stats`,              { headers }),
        fetch(`${API_URL}/api/admin/sales/top-products`,         { headers }),
        fetch(`${API_URL}/api/admin/inventory/recent-movements`, { headers }),
      ]);

      const statsJson        = statsRes.ok        ? await statsRes.json()        : null;
      const salesJson        = salesRes.ok        ? await salesRes.json()        : null;
      const inventoryJson    = inventoryRes.ok    ? await inventoryRes.json()    : null;
      const ordersJson       = ordersRes.ok       ? await ordersRes.json()       : null;
      const bannersJson      = bannersRes.ok      ? await bannersRes.json()      : null;
      const returnsJson      = returnsRes.ok      ? await returnsRes.json()      : null;
      const topProductsJson  = topProductsRes.ok  ? await topProductsRes.json()  : null;
      const movementsJson    = movementsRes.ok    ? await movementsRes.json()    : null;

      const inventory = inventoryJson?.data ?? inventoryJson ?? [];
      const orders    = ordersJson?.data?.orders ?? ordersJson?.data ?? ordersJson?.orders ?? [];

      const banners = bannersJson?.data ?? [];
      const activeBanners = Array.isArray(banners)
        ? banners.filter(b => b.isVisible === true || b.status === 'live').length
        : 0;
      const pendingReturns   = returnsJson?.data?.pendingCount ?? 0;
      const topProducts      = topProductsJson?.data?.products  ?? [];
      const recentMovements  = movementsJson?.data?.movements   ?? [];

      setData({
        orderStats:       statsJson?.data   ?? null,
        salesSummary:     salesJson?.data   ?? null,
        inventory:        Array.isArray(inventory) ? inventory : [],
        recentOrders:     Array.isArray(orders)    ? orders.slice(0, 5) : [],
        activeBanners,
        pendingReturns,
        topProducts,
        recentMovements,
        loading:          false,
        error:            null,
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
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
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
        onRefresh={fetchDashboard}
      />
    </div>
  );
}
