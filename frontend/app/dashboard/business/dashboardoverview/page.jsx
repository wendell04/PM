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
        fetchWithTimeout(`${API_URL}/api/admin/orders?limit=2000`,          { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/inventory`,                   { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/banners`,                     { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/returns/stats`,               { headers }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/inventory/recent-movements`,  { headers }, 30000),
      ]);

      const safeJson = async (result) => {
        if (result.status !== 'fulfilled') return null;
        const res = result.value;
        if (!res || !res.ok) return null;
        return res.json().catch(() => null);
      };

      const [ordersJson, inventoryJson, bannersJson, returnsJson, movementsJson] =
        await Promise.all(settled.map(safeJson));

      const inventory  = inventoryJson?.data ?? inventoryJson ?? [];
      const allOrders  = ordersJson?.data?.orders ?? ordersJson?.data ?? ordersJson?.orders ?? ordersJson ?? [];
      const orders     = Array.isArray(allOrders) ? allOrders : [];

      // Compute order stats locally from fetched orders — avoids dependency on separate stats endpoint
      const isDelivered  = (o) => ['Delivered', 'delivered'].includes(o.orderStatus);
      const isCancelled  = (o) => ['Cancelled', 'cancelled'].includes(o.orderStatus);
      const isPending    = (o) => !isDelivered(o) && !isCancelled(o);

      const deliveredOrders = orders.filter(isDelivered);
      const totalRevenue    = deliveredOrders.reduce((s, o) => s + Number(o.totalAmount ?? o.totalPrice ?? 0), 0);
      const totalPaid       = orders.reduce((s, o) => s + Number(o.downPayment ?? 0), 0);

      const computedOrderStats = {
        totalOrders:      orders.length,
        pendingOrders:    orders.filter(isPending).length,
        completedOrders:  deliveredOrders.length,
        cancelledOrders:  orders.filter(isCancelled).length,
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

      setData({
        orderStats:    computedOrderStats,
        salesSummary:  computedSalesSummary,
        inventory:     Array.isArray(inventory) ? inventory : [],
        recentOrders:  orders.slice(0, 5),
        activeBanners,
        pendingReturns,
        topProducts:   computedTopProducts,
        recentMovements,
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
