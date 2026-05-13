'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardOverview from './DashboardOverview';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';

const API_URL     = process.env.NEXT_PUBLIC_API_URL     || 'http://127.0.0.1:8000';
const SSA_API_URL = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';

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
    dailyRevenue:    [],
    ssaRevResult:    null,
    ssaQtyResult:    null,
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
