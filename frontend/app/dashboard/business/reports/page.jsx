'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ErrorBoundary from '../../../../components/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import CustomDropdown from '@/app/components/CustomDropdown';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

async function safeJson(res) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
});

function exportCSV(headers, rows, filename) {
  const lines = [headers.join(',')];
  rows.forEach((row) =>
    lines.push(
      row
        .map((v) => {
          if (v == null) return '';
          const s = String(v);
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(',')
    )
  );
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtPeso(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fileDatePart(d) {
  return d && String(d).trim() ? String(d).trim() : 'all';
}

function StatCard({ label, value, sub }) {
  return (
    <div
      style={{
        background: 'var(--dark2)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
      }}
    >
      <div
        style={{
          fontSize: '0.72rem',
          color: 'var(--gray)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '0.5rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          color: 'var(--white)',
          fontFamily: 'inherit',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub != null && sub !== '' && (
        <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.35rem' }}>{sub}</div>
      )}
    </div>
  );
}

function DateRangeFilter({ startDate, endDate, onStartChange, onEndChange, onApply, onClear, loading }) {
  const inputStyle = {
    height: '36px',
    padding: '0 0.75rem',
    background: 'var(--dark2)',
    border: '1px solid var(--border)',
    color: 'var(--white)',
    borderRadius: '8px',
    fontSize: '0.82rem',
    boxSizing: 'border-box',
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '0.75rem',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <input type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} style={inputStyle} />
      <input type="date" value={endDate} onChange={(e) => onEndChange(e.target.value)} style={inputStyle} />
      <button
        type="button"
        onClick={onApply}
        disabled={loading}
        style={{
          height: '36px',
          padding: '0 1rem',
          background: 'var(--gold)',
          color: 'var(--black)',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onClear}
        style={{
          height: '36px',
          padding: '0 1rem',
          background: 'transparent',
          color: 'var(--gray)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
      >
        Clear
      </button>
    </div>
  );
}

function SectionHeader({ title, onExport, exporting, collapsed, onToggle }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          cursor: onToggle ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {onToggle && (
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="var(--gray)" strokeWidth="2.5"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>{title}</span>
      </div>
      <button
        type="button"
        onClick={onExport}
        disabled={exporting}
        style={{
          background: 'transparent',
          border: '1px solid var(--gold)',
          color: 'var(--gold)',
          height: '32px',
          padding: '0 0.875rem',
          borderRadius: '8px',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: exporting ? 'not-allowed' : 'pointer',
          opacity: exporting ? 0.5 : 1,
        }}
      >
        Export CSV
      </button>
    </div>
  );
}

function ErrorMessage({ message, onRetry }) {
  return (
    <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: '1rem' }}>
      {message}
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginLeft: '0.5rem',
          background: 'none',
          border: 'none',
          color: 'var(--gold)',
          textDecoration: 'underline',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function LoadingRows({ count = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: '48px',
            background: 'var(--dark2)',
            borderRadius: '8px',
            animation: 'reportsSkeletonPulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}

const TABS = [
  { id: 'sales', label: 'Sales' },
  { id: 'orders', label: 'Orders' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'topProducts', label: 'Top Products' },
  { id: 'orderRequests', label: 'Order Requests' },
];

export default function ReportsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('sales');
  const [salesTrendCollapsed, setSalesTrendCollapsed] = useState(true);
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false);

  const stateRef = useRef({});

  const [salesData, setSalesData] = useState(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState(null);
  const [salesStart, setSalesStart] = useState('');
  const [salesEnd, setSalesEnd] = useState('');
  const [salesGroupBy, setSalesGroupBy] = useState('monthly');
  const [salesExporting, setSalesExporting] = useState(false);

  const [ordersData, setOrdersData] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState(null);
  const [ordersStart, setOrdersStart] = useState('');
  const [ordersEnd, setOrdersEnd] = useState('');
  const [ordersExporting, setOrdersExporting] = useState(false);

  const [inventoryRaw, setInventoryRaw] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [inventoryExporting, setInventoryExporting] = useState(false);

  const [tpData, setTpData] = useState(null);
  const [tpLoading, setTpLoading] = useState(false);
  const [tpError, setTpError] = useState(null);
  const [tpStart, setTpStart] = useState('');
  const [tpEnd, setTpEnd] = useState('');
  const [tpLimit, setTpLimit] = useState(10);
  const [tpExporting, setTpExporting] = useState(false);

  const [orData, setOrData] = useState(null);
  const [orLoading, setOrLoading] = useState(false);
  const [orError, setOrError] = useState(null);
  const [orStart, setOrStart] = useState('');
  const [orEnd, setOrEnd] = useState('');
  const [orExporting, setOrExporting] = useState(false);

  stateRef.current = {
    salesStart,
    salesEnd,
    salesGroupBy,
    ordersStart,
    ordersEnd,
    tpStart,
    tpEnd,
    tpLimit,
    orStart,
    orEnd,
  };

  const fetchSales = useCallback(async () => {
    if (!token) return;
    const { salesStart: s, salesEnd: e, salesGroupBy: g } = stateRef.current;
    setSalesLoading(true);
    setSalesError(null);
    try {
      const params = new URLSearchParams();
      if (s) params.set('startDate', s);
      if (e) params.set('endDate', e);
      if (g) params.set('groupBy', g);
      const res = await fetchWithTimeout(`${API_URL}/api/admin/sales/summary?${params}`, {
        headers: authHeaders(token),
      }, 15000);
      const json = await safeJson(res);
      if (!json) throw new Error('Server returned an empty response. Please retry.');
      if (!res.ok) throw new Error(json.message || 'Failed to load sales summary.');
      setSalesData(json.data ?? null);
    } catch (err) {
      setSalesError(err.message || 'Failed to load.');
      setSalesData(null);
    } finally {
      setSalesLoading(false);
    }
  }, [token]);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    const { ordersStart: s, ordersEnd: e } = stateRef.current;
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const params = new URLSearchParams();
      if (s) params.set('startDate', s);
      if (e) params.set('endDate', e);
      const q = params.toString();
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/stats${q ? `?${q}` : ''}`, {
        headers: authHeaders(token),
      }, 15000);
      const json = await safeJson(res);
      if (!json) throw new Error('Server returned an empty response. Please retry.');
      if (!res.ok) throw new Error(json.message || 'Failed to load order stats.');
      setOrdersData(json.data ?? null);
    } catch (err) {
      setOrdersError(err.message || 'Failed to load.');
      setOrdersData(null);
    } finally {
      setOrdersLoading(false);
    }
  }, [token]);

  const fetchInventory = useCallback(async () => {
    if (!token) return;
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/inventory`, {
        headers: authHeaders(token),
      }, 15000);
      const json = await safeJson(res);
      if (!json) throw new Error('Server returned an empty response. Please retry.');
      if (!res.ok) throw new Error(json.message || 'Failed to load inventory.');
      const list = json.data ?? json;
      setInventoryRaw(Array.isArray(list) ? list : []);
    } catch (err) {
      setInventoryError(err.message || 'Failed to load.');
      setInventoryRaw([]);
    } finally {
      setInventoryLoading(false);
    }
  }, [token]);

  const fetchTopProducts = useCallback(async () => {
    if (!token) return;
    const { tpStart: s, tpEnd: e, tpLimit: lim } = stateRef.current;
    setTpLoading(true);
    setTpError(null);
    try {
      const params = new URLSearchParams();
      if (s) params.set('startDate', s);
      if (e) params.set('endDate', e);
      const n = Math.max(1, Math.min(20, Number(lim) || 10));
      params.set('limit', String(n));
      const res = await fetchWithTimeout(`${API_URL}/api/admin/sales/top-products?${params}`, {
        headers: authHeaders(token),
      }, 15000);
      const json = await safeJson(res);
      if (!json) throw new Error('Server returned an empty response. Please retry.');
      if (!res.ok) throw new Error(json.message || 'Failed to load top products.');
      setTpData(json.data ?? null);
    } catch (err) {
      setTpError(err.message || 'Failed to load.');
      setTpData(null);
    } finally {
      setTpLoading(false);
    }
  }, [token]);

  const fetchOrderRequests = useCallback(async () => {
    if (!token) return;
    const { orStart: s, orEnd: e } = stateRef.current;
    setOrLoading(true);
    setOrError(null);
    try {
      const params = new URLSearchParams();
      if (s) params.set('startDate', s);
      if (e) params.set('endDate', e);
      const q = params.toString();
      const res = await fetchWithTimeout(`${API_URL}/api/admin/order-requests/stats${q ? `?${q}` : ''}`, {
        headers: authHeaders(token),
      }, 15000);
      const json = await safeJson(res);
      if (!json) throw new Error('Server returned an empty response. Please retry.');
      if (!res.ok) throw new Error(json.message || 'Failed to load order request stats.');
      setOrData(json.data ?? null);
    } catch (err) {
      setOrError(err.message || 'Failed to load.');
      setOrData(null);
    } finally {
      setOrLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchSales();
    fetchOrders();
    fetchInventory();
    fetchTopProducts();
    fetchOrderRequests();
  }, [token, fetchSales, fetchOrders, fetchInventory, fetchTopProducts, fetchOrderRequests]);

  const clearSalesDates = () => {
    stateRef.current.salesStart = '';
    stateRef.current.salesEnd = '';
    setSalesStart('');
    setSalesEnd('');
    fetchSales();
  };
  const clearOrdersDates = () => {
    stateRef.current.ordersStart = '';
    stateRef.current.ordersEnd = '';
    setOrdersStart('');
    setOrdersEnd('');
    fetchOrders();
  };
  const clearTpDates = () => {
    stateRef.current.tpStart = '';
    stateRef.current.tpEnd = '';
    setTpStart('');
    setTpEnd('');
    fetchTopProducts();
  };
  const clearOrDates = () => {
    stateRef.current.orStart = '';
    stateRef.current.orEnd = '';
    setOrStart('');
    setOrEnd('');
    fetchOrderRequests();
  };

  const getInventoryStatus = (item) => {
    if (item.isOnDemand) return { key: 'upon-order', label: 'Upon Order', bg: '#3b82f6', fg: 'var(--dark)' };
    const q = Number(item.stockQty ?? 0);
    const min = Number(item.minStockLevel ?? 0);
    if (q === 0) return { key: 'out-of-stock', label: 'Out of Stock', bg: '#ef4444', fg: 'var(--dark)' };
    if (q <= min) return { key: 'low-stock', label: 'Low Stock', bg: '#f97316', fg: 'var(--dark)' };
    return { key: 'ok', label: 'OK', bg: '#10b981', fg: 'var(--dark)' };
  };

  const inventoryFiltered = inventoryRaw.filter((item) => {
    const st = getInventoryStatus(item);
    if (statusFilter === 'all') return true;
    if (statusFilter === 'low-stock') return st.key === 'low-stock';
    if (statusFilter === 'out-of-stock') return st.key === 'out-of-stock';
    if (statusFilter === 'upon-order') return st.key === 'upon-order';
    return true;
  });

  const invTotal = inventoryRaw.length;
  const invLow = inventoryRaw.filter((i) => getInventoryStatus(i).key === 'low-stock').length;
  const invOut = inventoryRaw.filter((i) => getInventoryStatus(i).key === 'out-of-stock').length;

  const exportSales = () => {
    const g = salesData?.grouped;
    if (!g || !Array.isArray(g) || g.length === 0) return;
    setSalesExporting(true);
    try {
      const rows = g.map((r) => [r.period, r.revenue, r.cost, r.profit]);
      exportCSV(
        ['Period', 'Revenue', 'Cost', 'Profit'],
        rows,
        `sales-report-${fileDatePart(salesStart)}-${fileDatePart(salesEnd)}.csv`
      );
    } finally {
      setSalesExporting(false);
    }
  };

  const exportOrders = () => {
    if (!ordersData) return;
    setOrdersExporting(true);
    try {
      const d = ordersData;
      const rows = [
        ['totalOrders', d.totalOrders],
        ['pendingOrders', d.pendingOrders],
        ['completedOrders', d.completedOrders],
        ['cancelledOrders', d.cancelledOrders],
        ['totalRevenue', d.totalRevenue],
        ['cancellationRate', d.cancellationRate],
      ];
      exportCSV(['Metric', 'Value'], rows, `orders-report-${fileDatePart(ordersStart)}-${fileDatePart(ordersEnd)}.csv`);
    } finally {
      setOrdersExporting(false);
    }
  };

  const exportInventory = () => {
    if (inventoryRaw.length === 0) return;
    setInventoryExporting(true);
    try {
      const rows = inventoryRaw.map((item) => {
        const st = getInventoryStatus(item);
        return [item.name, item.category, item.stockQty, item.minStockLevel, st.label];
      });
      exportCSV(['Name', 'Category', 'StockQty', 'MinLevel', 'Status'], rows, 'inventory-report.csv');
    } finally {
      setInventoryExporting(false);
    }
  };

  const exportTopProducts = () => {
    const products = tpData?.products;
    if (!products || !Array.isArray(products)) return;
    setTpExporting(true);
    try {
      const rows = products.map((p, idx) => [
        idx + 1,
        p.productName,
        p.category,
        p.totalQty,
        p.totalRevenue,
      ]);
      exportCSV(
        ['Rank', 'Product', 'Category', 'Units Sold', 'Revenue'],
        rows,
        `top-products-${fileDatePart(tpStart)}-${fileDatePart(tpEnd)}.csv`
      );
    } finally {
      setTpExporting(false);
    }
  };

  const exportOrderRequests = () => {
    if (!orData) return;
    setOrExporting(true);
    try {
      const d = orData;
      const rows = [
        ['total', d.total],
        ['pending', d.pending],
        ['confirmed', d.confirmed],
        ['processing', d.processing],
        ['ready', d.ready],
        ['delivered', d.delivered],
        ['cancelled', d.cancelled],
        ['conversionRate', d.conversionRate],
      ];
      exportCSV(
        ['Metric', 'Value'],
        rows,
        `order-requests-report-${fileDatePart(orStart)}-${fileDatePart(orEnd)}.csv`
      );
    } finally {
      setOrExporting(false);
    }
  };

  const selectStyle = {
    height: '36px',
    padding: '0 0.75rem',
    background: 'var(--dark2)',
    border: '1px solid var(--border)',
    color: 'var(--white)',
    borderRadius: '8px',
    fontSize: '0.82rem',
    boxSizing: 'border-box',
  };

  const salesGrouped = salesData?.grouped;
  const tpProducts = tpData?.products;

  return (
    <ErrorBoundary>
      <style>{`
        @keyframes reportsSkeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {!token && (
          <p style={{ color: 'var(--gray)', fontSize: '0.9rem' }}>Sign in to load reports.</p>
        )}

        {token && (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                borderBottom: '1px solid var(--border)',
                marginBottom: '1.5rem',
                gap: 0,
                flexWrap: 'wrap',
              }}
            >
              {TABS.map((t) => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    style={{
                      padding: '0.75rem 1.25rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      background: 'none',
                      border: 'none',
                      borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
                      color: active ? 'var(--gold)' : 'var(--gray)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.color = 'var(--white)';
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.color = 'var(--gray)';
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {activeTab === 'sales' && (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                  <DateRangeFilter
                    startDate={salesStart}
                    endDate={salesEnd}
                    onStartChange={setSalesStart}
                    onEndChange={setSalesEnd}
                    onApply={() => fetchSales()}
                    onClear={clearSalesDates}
                    loading={salesLoading}
                  />
                  <CustomDropdown
                    value={salesGroupBy}
                    onChange={v => setSalesGroupBy(v)}
                    options={[
                      { value: 'daily', label: 'Daily' },
                      { value: 'weekly', label: 'Weekly' },
                      { value: 'monthly', label: 'Monthly' },
                    ]}
                    style={{ minWidth: '140px' }}
                  />
                </div>
                {salesError && <ErrorMessage message={salesError} onRetry={fetchSales} />}
                {salesLoading && <LoadingRows />}
                {!salesLoading && salesData && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                      <StatCard label="Total Transactions" value={String(salesData.totalSales ?? 0)} />
                      <StatCard label="Total Revenue"      value={fmtPeso(salesData.totalRevenue)} />
                      <StatCard label="Total Cost"         value={fmtPeso(salesData.totalCost)} />
                      <StatCard label="Net Profit"         value={fmtPeso(salesData.totalProfit)} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '1.25rem' }}>
                      <span
                        style={{
                          background: 'var(--dark2)',
                          border: '1px solid var(--border)',
                          borderRadius: '999px',
                          padding: '0.25rem 0.75rem',
                          fontSize: '0.78rem',
                          color: 'var(--gray)',
                        }}
                      >
                        Manual: {fmtPeso(salesData.manualSales)}
                      </span>
                      <span
                        style={{
                          background: 'var(--dark2)',
                          border: '1px solid var(--border)',
                          borderRadius: '999px',
                          padding: '0.25rem 0.75rem',
                          fontSize: '0.78rem',
                          color: 'var(--gray)',
                        }}
                      >
                        Online: {fmtPeso(salesData.onlineSales)}
                      </span>
                    </div>
                    <SectionHeader title="Sales Trend" onExport={exportSales} exporting={salesExporting} />
                    {salesGrouped && salesGrouped.length > 0 && (
                      <div style={{ width: '100%', height: 280, marginBottom: '1rem' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={salesGrouped.map((r) => ({
                              period: r.period,
                              Revenue: Number(r.revenue) || 0,
                              Cost: Number(r.cost) || 0,
                              Profit: Number(r.profit) || 0,
                            }))}
                            margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="period" tick={{ fill: 'var(--gray)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                            <YAxis
                              tick={{ fill: 'var(--gray)', fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                              width={58}
                              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`)}
                            />
                            <Tooltip
                              contentStyle={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                              labelStyle={{ color: 'var(--white)', fontWeight: 600 }}
                              formatter={(v, n) => [fmtPeso(v), n]}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Line type="monotone" dataKey="Revenue" stroke="var(--gold)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                            <Line type="monotone" dataKey="Cost" stroke="var(--gray)" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="Profit" stroke="var(--green)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {salesGrouped && salesGrouped.length > 0 && (
                      <div
                        onClick={() => setSalesTrendCollapsed(p => !p)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', userSelect: 'none', margin: '0.25rem 0 0.75rem' }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5"
                          style={{ transform: salesTrendCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray)' }}>
                          {salesTrendCollapsed ? 'Show' : 'Hide'} period breakdown
                        </span>
                      </div>
                    )}
                    {!salesTrendCollapsed && salesGrouped && salesGrouped.length > 0 ? (
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ width: '100%', display: 'table' }}>
                          <div style={{ display: 'table-row', background: 'var(--dark2)' }}>
                            {['Period', 'Revenue', 'Cost', 'Profit'].map((h) => (
                              <div
                                key={h}
                                style={{
                                  display: 'table-cell',
                                  color: 'var(--gray)',
                                  fontSize: '0.75rem',
                                  padding: '0.6rem 1rem',
                                  textAlign: 'left',
                                  borderBottom: '1px solid var(--border)',
                                }}
                              >
                                {h}
                              </div>
                            ))}
                          </div>
                          {salesGrouped.map((row) => {
                            const prof = Number(row.profit ?? 0);
                            const profitColor = prof >= 0 ? '#10b981' : '#ef4444';
                            return (
                              <div key={row.period} style={{ display: 'table-row' }}>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                    color: 'var(--white)',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  {row.period}
                                </div>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                    color: 'var(--white)',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  {fmtPeso(row.revenue)}
                                </div>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                    color: 'var(--white)',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  {fmtPeso(row.cost)}
                                </div>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                    fontSize: '0.85rem',
                                    color: profitColor,
                                  }}
                                >
                                  {fmtPeso(row.profit)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (!salesTrendCollapsed && (
                      <p style={{ textAlign: 'center', color: 'var(--gray)', fontSize: '0.9rem' }}>
                        No period data. Apply date range and grouping.
                      </p>
                    ))}
                  </>
                )}
              </div>
            )}

            {activeTab === 'orders' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <DateRangeFilter
                    startDate={ordersStart}
                    endDate={ordersEnd}
                    onStartChange={setOrdersStart}
                    onEndChange={setOrdersEnd}
                    onApply={() => fetchOrders()}
                    onClear={clearOrdersDates}
                    loading={ordersLoading}
                  />
                </div>
                {ordersError && <ErrorMessage message={ordersError} onRetry={fetchOrders} />}
                {ordersLoading && <LoadingRows />}
                {!ordersLoading && ordersData && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                      <StatCard label="Total Orders"  value={String(ordersData.totalOrders    ?? 0)} />
                      <StatCard label="Completed"     value={String(ordersData.completedOrders ?? 0)} />
                      <StatCard label="Pending"       value={String(ordersData.pendingOrders   ?? 0)} />
                      <StatCard label="Cancelled"     value={String(ordersData.cancelledOrders ?? 0)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                      <StatCard label="Revenue"           value={fmtPeso(ordersData.totalRevenue)} />
                      <StatCard label="Cancellation Rate" value={ordersData.cancellationRate != null ? `${ordersData.cancellationRate}%` : '—'} />
                    </div>
                    <SectionHeader title="Export" onExport={exportOrders} exporting={ordersExporting} />
                  </>
                )}
              </div>
            )}

            {activeTab === 'inventory' && (
              <div>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label htmlFor="inv-filter" style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>
                    Filter
                  </label>
                  <CustomDropdown
                    value={statusFilter}
                    onChange={v => setStatusFilter(v)}
                    options={[
                      { value: 'all', label: 'All Stock' },
                      { value: 'low-stock', label: 'Low Stock' },
                      { value: 'out-of-stock', label: 'Out of Stock' },
                      { value: 'upon-order', label: 'Upon Order' },
                    ]}
                    style={{ minWidth: '200px' }}
                  />
                </div>
                {inventoryError && <ErrorMessage message={inventoryError} onRetry={fetchInventory} />}
                {inventoryLoading && <LoadingRows />}
                {!inventoryLoading && (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: '1rem',
                        marginBottom: '1rem',
                      }}
                    >
                      <StatCard label="Total Items" value={String(invTotal)} />
                      <StatCard label="Low Stock Items" value={String(invLow)} />
                      <StatCard label="Out of Stock Items" value={String(invOut)} />
                    </div>
                    <SectionHeader title="Inventory Items" onExport={exportInventory} exporting={inventoryExporting} collapsed={inventoryCollapsed} onToggle={() => setInventoryCollapsed(p => !p)} />
                    {!inventoryCollapsed && (
                      inventoryFiltered.length === 0 ? (
                      <p style={{ color: 'var(--gray)', fontSize: '0.9rem' }}>No items match this filter.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ display: 'table', width: '100%', borderCollapse: 'collapse' }}>
                          <div style={{ display: 'table-row', background: 'var(--dark2)' }}>
                            {['Item Name', 'Category', 'Stock Qty', 'Min Level', 'Status'].map((h) => (
                              <div
                                key={h}
                                style={{
                                  display: 'table-cell',
                                  color: 'var(--gray)',
                                  fontSize: '0.75rem',
                                  padding: '0.6rem 1rem',
                                  textAlign: 'left',
                                  borderBottom: '1px solid var(--border)',
                                }}
                              >
                                {h}
                              </div>
                            ))}
                          </div>
                          {inventoryFiltered.map((item) => {
                            const st = getInventoryStatus(item);
                            return (
                              <div key={String(item._id ?? item.id ?? item.name)} style={{ display: 'table-row' }}>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                    color: 'var(--white)',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  {item.name}
                                </div>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                    color: 'var(--white)',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  {item.category ?? '—'}
                                </div>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                    color: 'var(--white)',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  {item.stockQty ?? 0}
                                </div>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                    color: 'var(--white)',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  {item.minStockLevel ?? 0}
                                </div>
                                <div
                                  style={{
                                    display: 'table-cell',
                                    borderBottom: '1px solid var(--border)',
                                    padding: '0.75rem 1rem',
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '6px',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      background: st.bg,
                                      color: st.fg,
                                    }}
                                  >
                                    {st.label}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {activeTab === 'topProducts' && (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                  <DateRangeFilter
                    startDate={tpStart}
                    endDate={tpEnd}
                    onStartChange={setTpStart}
                    onEndChange={setTpEnd}
                    onApply={() => fetchTopProducts()}
                    onClear={clearTpDates}
                    loading={tpLoading}
                  />
                  <label style={{ fontSize: '0.82rem', color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Show top:
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={tpLimit}
                      onChange={(e) => setTpLimit(Number(e.target.value))}
                      style={{ ...selectStyle, width: '72px' }}
                    />
                  </label>
                </div>
                {tpError && <ErrorMessage message={tpError} onRetry={fetchTopProducts} />}
                <SectionHeader title="Top Products" onExport={exportTopProducts} exporting={tpExporting} />
                {tpLoading && <LoadingRows />}
                {!tpLoading && (
                  <>
                    {tpProducts && tpProducts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {tpProducts.map((p, idx) => {
                          const rank = idx + 1;
                          let badgeBg = 'var(--dark2)';
                          let badgeFg = 'var(--gray)';
                          if (rank === 1) {
                            badgeBg = '#D4A843';
                            badgeFg = '#000';
                          } else if (rank === 2) {
                            badgeBg = 'var(--gray)';
                            badgeFg = 'var(--dark)';
                          } else if (rank === 3) {
                            badgeBg = '#b45309';
                            badgeFg = 'var(--dark)';
                          }
                          return (
                            <div
                              key={`${p.productName}-${idx}`}
                              style={{
                                display: 'flex',
                                flexDirection: 'row',
                                gap: '1rem',
                                alignItems: 'center',
                                padding: '1rem',
                                background: 'var(--dark2)',
                                border: '1px solid var(--border)',
                                borderRadius: '12px',
                              }}
                            >
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: badgeBg,
                                  color: badgeFg,
                                  fontWeight: 700,
                                  fontSize: '0.85rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {rank}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, color: 'var(--white)' }}>{p.productName}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{p.category || '—'}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ color: 'var(--white)', fontSize: '0.9rem' }}>
                                  {p.totalQty ?? 0} units sold
                                </div>
                                <div style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.9rem' }}>
                                  {fmtPeso(p.totalRevenue)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ textAlign: 'center', color: 'var(--gray)', padding: '2rem' }}>
                        No sales data in this period.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'orderRequests' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <DateRangeFilter
                    startDate={orStart}
                    endDate={orEnd}
                    onStartChange={setOrStart}
                    onEndChange={setOrEnd}
                    onApply={() => fetchOrderRequests()}
                    onClear={clearOrDates}
                    loading={orLoading}
                  />
                </div>
                {orError && <ErrorMessage message={orError} onRetry={fetchOrderRequests} />}
                {orLoading && <LoadingRows />}
                {!orLoading && orData && (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: '1rem',
                        marginBottom: '1.5rem',
                      }}
                    >
                      <StatCard label="Total Requests" value={String(orData.total ?? 0)} />
                      <StatCard label="Delivered" value={String(orData.delivered ?? 0)} />
                      <StatCard label="Cancelled" value={String(orData.cancelled ?? 0)} />
                      <StatCard
                        label="Conversion Rate"
                        value={orData.conversionRate != null ? `${orData.conversionRate}%` : '—'}
                      />
                    </div>
                    <div style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)' }}>
                      Status breakdown
                    </div>
                    {['pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'].map((key) => {
                      const labelMap = {
                        pending: 'Pending',
                        confirmed: 'Confirmed',
                        processing: 'Processing',
                        ready: 'Ready',
                        delivered: 'Delivered',
                        cancelled: 'Cancelled',
                      };
                      const colorMap = {
                        pending: 'var(--gray)',
                        confirmed: '#3b82f6',
                        processing: '#f97316',
                        ready: '#10b981',
                        delivered: '#D4A843',
                        cancelled: '#ef4444',
                      };
                      const total = Number(orData.total) || 0;
                      const count = Number(orData[key] ?? 0);
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            marginBottom: '10px',
                          }}
                        >
                          <div style={{ width: '100px', fontSize: '0.8rem', color: 'var(--gray)', flexShrink: 0 }}>
                            {labelMap[key]}
                          </div>
                          <div
                            style={{
                              flex: 1,
                              height: '10px',
                              borderRadius: '999px',
                              background: 'var(--dark2)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                borderRadius: '999px',
                                width: `${pct}%`,
                                background: colorMap[key],
                                transition: 'width 0.6s ease',
                              }}
                            />
                          </div>
                          <div style={{ width: '48px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--white)' }}>
                            {count}
                          </div>
                        </div>
                      );
                    })}
                    <SectionHeader title="Export" onExport={exportOrderRequests} exporting={orExporting} />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
