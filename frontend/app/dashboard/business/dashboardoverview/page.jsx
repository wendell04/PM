'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardOverview from './DashboardOverview';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';

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

      const settled = await Promise.allSettled([
        fetchWithTimeout(`${API_URL}/api/admin/orders/stats`,              { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/sales/summary`,             { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/inventory`,                  { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/orders`,                     { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/banners`,                    { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/returns/stats`,              { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/sales/top-products`,         { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/inventory/recent-movements`, { headers }, 30000),
      ]);

      const safeJson = async (result) => {
        if (result.status !== 'fulfilled') return null;
        const res = result.value;
        if (!res || !res.ok) return null;
        return res.json().catch(() => null);
      };

      const [
        statsJson,
        salesJson,
        inventoryJson,
        ordersJson,
        bannersJson,
        returnsJson,
        topProductsJson,
        movementsJson,
      ] = await Promise.all(settled.map(safeJson));

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
          onRefresh={fetchDashboard}
        />
      </div>
    </ErrorBoundary>
  );
}
