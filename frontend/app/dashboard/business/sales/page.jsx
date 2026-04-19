'use client';

import ErrorBoundary from '../../../../components/ErrorBoundary';

/**
 * SALES MANAGEMENT PAGE
 *
 * Fetches sales data from backend API.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { formatPrice } from '@/src/utils/format';
import { fetchSales } from '@/lib/salesApi';
import { fetchInventory } from '@/lib/inventoryApi';

// ── Order Detail Expand Row ─────────────────────────────────────────────────
function OrderExpandRow({ order, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}>
  <div style={{ padding: '1rem 1.25rem 1.25rem', display: 'flex', gap: '2rem', width: '100%', justifyContent: 'space-between' }}>

    {/* Customer Info */}
    <div style={{ width: '160px', minWidth: 0 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Customer</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600 }}>{order.customerName || 'N/A'}</div>
        <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>{order.customerContact || 'N/A'}</div>
        <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>{order.customerEmail || 'N/A'}</div>
      </div>
    </div>

    {/* Order Items */}
    <div style={{ width: '160px', minWidth: 0 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Order Items</div>
      {order.items && order.items.length > 0 ? (
        order.items.map((item, idx) => (
          <div key={idx} style={{ fontSize: '0.85rem', color: 'var(--white)', marginBottom: '0.5rem' }}>
            <div style={{ fontWeight: 600 }}>{item.productName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
              {item.variant ? `${item.variant} × ${item.quantity}` : `× ${item.quantity}`}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>{formatPrice(item.unitPrice || 0)} each</div>
          </div>
        ))
      ) : order.quantity ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--white)' }}>
          <div style={{ fontWeight: 600 }}>{order.productName || 'Product'}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>× {order.quantity} pcs</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>{formatPrice(order.unitPrice || 0)} each</div>
        </div>
      ) : (
        <div style={{ fontSize: '0.85rem', color: 'var(--gray)', fontStyle: 'italic', opacity: 0.6 }}>—</div>
      )}
    </div>

    {/* Payment Details */}
    <div style={{ width: '220px', minWidth: 0 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Payment</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <span style={{ color: 'var(--gray)' }}>Total:</span>
          <span style={{ fontWeight: 600, color: 'var(--gold)' }}>{formatPrice(order.totalPrice || 0)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <span style={{ color: 'var(--gray)' }}>Downpayment (50%):</span>
          <span style={{ fontWeight: 600, color: 'var(--green)' }}>{formatPrice(order.downPayment || 0)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <span style={{ color: 'var(--gray)' }}>Balance:</span>
          <span style={{ fontWeight: 600, color: order.balance === 0 ? 'var(--green)' : 'var(--gold)' }}>
            {formatPrice(order.balance || 0)}
          </span>
        </div>
        {order.balance === 0 && (
          <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Fully Paid
          </div>
        )}
      </div>
    </div>

    {/* Order Notes */}
    <div style={{ width: '200px', minWidth: 0 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Order Notes</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.5, opacity: 0.85 }}>
        {order.notes || '—'}
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>
        <div>Order Date: {new Date(order.orderDate).toLocaleDateString()}</div>
        <div>Due Date: {new Date(order.dueDate).toLocaleDateString()}</div>
        {order.source && (
          <div style={{ color: 'var(--gold)', marginTop: '0.25rem' }}>
            Source: {order.source === 'manual' ? 'Outside System (Manual Sale)' : 'Online Storefront'}
          </div>
        )}
      </div>
    </div>

  </div>
</td>
    </tr>
  );
}

// ── Main SalesListPage ───────────────────────────────────────────────────────
export default function SalesListPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ fromMonth: 0, toMonth: 0, year: 2025 });
  const [expandedRows, setExpandedRows] = useState(new Set());

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const YEARS = [2025, 2026, 2027, 2028];

  // Load sales and inventory from backend API on mount
  useEffect(() => {
    async function loadData() {
      if (!token) {
        console.error('No auth token. Cannot load sales.');
        setIsLoading(false);
        setError('Unable to load sales. Please refresh or log in again.');
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        // Fetch sales from API
        const salesResponse = await fetchSales({ limit: 50 }, token);
        const salesData = Array.isArray(salesResponse)
          ? salesResponse : [];

        // Fetch inventory from API (for cost calculation)
        const inventoryResponse = await fetchInventory(token);
        const inventoryData = Array.isArray(inventoryResponse)
          ? inventoryResponse : [];

        // Process sales with cost from inventory for manual sales
        const processedSales = salesData.map(sale => {
          const saleWithDate = {
            ...sale,
            orderDate: sale.orderDate || sale.saleDate || sale.createdAt || new Date().toISOString()
          };

          // Calculate cost from inventory if not present
          if (saleWithDate.source === 'manual' && (!saleWithDate.cost || saleWithDate.cost === 0) && saleWithDate.inventoryId) {
            const invItem = inventoryData.find(inv => inv.id === saleWithDate.inventoryId);
            if (invItem) {
              const avgCost = invItem.averageCost || invItem.lastUnitCost || 0;
              return {
                ...saleWithDate,
                cost: avgCost * (saleWithDate.quantity || 1)
              };
            }
          }
          return saleWithDate;
        });

        setSales(processedSales);
        setInventory(inventoryData);
      } catch (err) {
        console.error('Failed to load sales data:', err);
        setError(err.message || 'Failed to load sales data');
        setSales([]);
        setInventory([]);
      } finally {
        setIsLoaded(true);
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const toggleExpand = (orderId) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const getStatusBadge = (order) => {
    if (order.status === 'cancelled') {
      return { label: 'Cancelled', color: 'var(--red)', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.4)' };
    }
    
    if (order.source === 'manual') {
      return { label: 'Outside System', color: 'var(--orange)', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)' };
    }
    
    if (order.balance === 0) {
      return { label: 'Paid', color: 'var(--green)', bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.4)' };
    }
    
    if (order.downPayment > 0 && order.balance > 0) {
      return { label: 'Pending 50%', color: 'var(--gold)', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.4)' };
    }
    
    return { label: 'Pending', color: 'var(--gold)', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.4)' };
  };

  const filteredSales = useMemo(() => {
    return sales.filter(order => {
      const matchesSearch = 
        order.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesPayment = true;
      if (paymentFilter === 'paid') {
        matchesPayment = order.status !== 'cancelled' && order.balance === 0 && order.source !== 'manual';
      } else if (paymentFilter === 'pending-50') {
        matchesPayment = order.status !== 'cancelled' && order.downPayment > 0 && order.balance > 0 && order.source !== 'manual';
      } else if (paymentFilter === 'outside-system') {
        matchesPayment = order.source === 'manual';
      } else if (paymentFilter === 'cancelled') {
        matchesPayment = order.status === 'cancelled';
      }
      
      // Date filter
      let matchesDate = true;
      const orderDate = new Date(order.orderDate || order.createdAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      orderDate.setHours(0, 0, 0, 0);

      if (dateFilter === 'all') {
        matchesDate = true; // Show all sales
      } else if (dateFilter === 'today') {
        matchesDate = orderDate.getTime() === today.getTime();
      } else if (dateFilter === 'this-week') {
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchesDate = orderDate >= weekAgo;
      } else if (dateFilter === 'this-month') {
        matchesDate = orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear();
      } else if (dateFilter === 'custom') {
        const fromMonth = customDateRange.fromMonth;
        const toMonth = customDateRange.toMonth;
        const year = customDateRange.year;
        matchesDate = orderDate.getFullYear() === year && orderDate.getMonth() >= fromMonth && orderDate.getMonth() <= toMonth;
      }
      
      return matchesSearch && matchesPayment && matchesDate;
    });
  }, [sales, searchQuery, paymentFilter, dateFilter, customDateRange]);

  // Calculate summary metrics (based on ALL sales, not filtered)
  const summaryMetrics = useMemo(() => {
    const allSalesForMetrics = sales; // Use ALL sales data, not filtered

    const totalSales = allSalesForMetrics.filter(o => o.status !== 'cancelled').length;
    
    // Include manual (outside system) orders in paid calculation
    // A sale is considered paid if: balance === 0 OR status === 'completed' OR (no balance field and source === 'manual')
    const paidOrders = allSalesForMetrics.filter(o => {
      if (o.status === 'cancelled') return false;
      if (o.balance === 0) return true;
      if (o.status === 'completed') return true;
      // For manual sales without balance field, consider them paid
      if (o.source === 'manual' && (o.balance === undefined || o.balance === null)) return true;
      return false;
    });
    
    const pending50Orders = allSalesForMetrics.filter(o =>
      o.status !== 'cancelled' && o.downPayment > 0 && o.balance > 0 && o.source !== 'manual'
    );
    const outsideSystemOrders = allSalesForMetrics.filter(o => o.source === 'manual');
    const cancelledOrders = allSalesForMetrics.filter(o => o.status === 'cancelled');

    // Include ALL paid orders (including manual/outside system)
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

    // Calculate total cost - use cost from sale if available, otherwise calculate from inventory
    const totalCost = paidOrders.reduce((sum, o) => {
      if (o.cost && o.cost > 0) {
        return sum + o.cost;
      }
      // For sales without cost, try to calculate from inventory
      if (o.inventoryId && inventory.length > 0) {
        const invItem = inventory.find(inv => inv.id === o.inventoryId);
        if (invItem) {
          const avgCost = invItem.averageCost || invItem.lastUnitCost || 0;
          return sum + (avgCost * (o.quantity || 1));
        }
      }
      return sum;
    }, 0);

    const totalProfit = totalRevenue - totalCost;

    // Count unique products sold
    const productsSold = new Set();
    allSalesForMetrics.forEach(order => {
      if (order.status !== 'cancelled' && order.items) {
        order.items.forEach(item => {
          if (item.productId) {
            productsSold.add(item.productId);
          }
        });
      }
    });

    return {
      totalSales,
      paid: paidOrders.length,
      pending50: pending50Orders.length,
      outsideSystem: outsideSystemOrders.length,
      cancelled: cancelledOrders.length,
      revenue: totalRevenue,
      profit: totalProfit,
      totalCost,
      paidOrders, // For displaying count in cards
      topProductsCount: productsSold.size,
    };
  }, [sales, inventory]);

  if (isLoading) {
    return (
      <div className="page-content-wrapper">
        <div className="skeleton-page">
          <div className="skeleton-header">
            <div className="skeleton-title" />
            <div className="skeleton-subtitle" />
          </div>
          <div className="skeleton-cards">
            {[...Array(3)].map((_, i) => (
              <div className="skeleton-card" key={i} />
            ))}
          </div>
          <div className="skeleton-table">
            <div className="skeleton-table-header" />
            {[...Array(6)].map((_, i) => (
              <div className="skeleton-row" key={i}>
                <div className="skeleton-cell skeleton-cell-short" />
                <div className="skeleton-cell skeleton-cell-wide" />
                <div className="skeleton-cell skeleton-cell-mid" />
                <div className="skeleton-cell skeleton-cell-short" />
                <div className="skeleton-cell-badge" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-content-wrapper">
        <div className="error-state" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--red)', marginBottom: '1rem' }}>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
      
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Sales</h1>
            <p className="page-subtitle">View all sales transactions from the system.</p>
          </div>
          {/* NO Create button - Sales are auto-generated */}
        </div>

        {/* Payment Status Filter Cards */}
        <div className="inventory-summary">
          <div className={`summary-card${paymentFilter === '' ? ' active' : ''}`} onClick={() => setPaymentFilter('')} style={{ cursor: 'pointer' }}>
            <div className="summary-content">
              <span className="summary-value">{summaryMetrics.totalSales}</span>
              <span className="summary-label">All Sales</span>
            </div>
          </div>
          <div className={`summary-card summary-card-success${paymentFilter === 'paid' ? ' active' : ''}`}
            onClick={() => setPaymentFilter(paymentFilter === 'paid' ? '' : 'paid')} style={{ cursor: 'pointer' }}>
            <div className="summary-content">
              <span className="summary-value">{summaryMetrics.paid}</span>
              <span className="summary-label">Paid</span>
            </div>
          </div>
          <div className={`summary-card summary-card-warning${paymentFilter === 'pending-50' ? ' active' : ''}`}
            onClick={() => setPaymentFilter(paymentFilter === 'pending-50' ? '' : 'pending-50')} style={{ cursor: 'pointer' }}>
            <div className="summary-content">
              <span className="summary-value">{summaryMetrics.pending50}</span>
              <span className="summary-label">Pending 50%</span>
            </div>
          </div>
          <div className={`summary-card${paymentFilter === 'outside-system' ? ' active' : ''}`}
            onClick={() => setPaymentFilter(paymentFilter === 'outside-system' ? '' : 'outside-system')} style={{ cursor: 'pointer', background: 'rgba(249, 115, 22, 0.08)', borderColor: 'rgba(249, 115, 22, 0.3)' }}>
            <div className="summary-content">
              <span className="summary-value" style={{ color: 'var(--orange)' }}>{summaryMetrics.outsideSystem}</span>
              <span className="summary-label" style={{ color: 'var(--orange)' }}>Outside System</span>
            </div>
          </div>
          <div className={`summary-card summary-card-danger${paymentFilter === 'cancelled' ? ' active' : ''}`}
            onClick={() => setPaymentFilter(paymentFilter === 'cancelled' ? '' : 'cancelled')} style={{ cursor: 'pointer' }}>
            <div className="summary-content">
              <span className="summary-value">{summaryMetrics.cancelled}</span>
              <span className="summary-label">Cancelled</span>
            </div>
          </div>
        </div>

        {/* Sales Analytics Module */}
        <div style={{
          background: 'var(--dark)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginTop: '1rem',
        }}>
          {/* Module Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
          </div>
          
          {/* Analytics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1.25rem',
            marginBottom: '1.25rem',
          }}>
            {/* Total Sales Card */}
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--green)', textTransform: 'uppercase', fontWeight: 700 }}>Total Revenue</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--green)' }}>
                ₱{summaryMetrics.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem' }}>
                From completed orders
              </div>
            </div>
            
            {/* Total Profit Card */}
            <div style={{
              background: 'rgba(212, 168, 67, 0.1)',
              border: '1px solid rgba(212, 168, 67, 0.3)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 700 }}>Total Profit</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gold)' }}>
                ₱{summaryMetrics.profit.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem' }}>
                Revenue minus cost
              </div>
            </div>
            
            {/* Top Products Card */}
            <div style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--indigo)', textTransform: 'uppercase', fontWeight: 700 }}>Top Products</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--indigo)' }}>
                {summaryMetrics.topProductsCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem' }}>
                Products sold
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="inventory-toolbar">
        <div className="search-wrapper">
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input type="text" className="search-input" placeholder="Search customer or order number..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{
            padding: '0.5rem 0.75rem',
            background: 'var(--dark2)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--white)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            minWidth: '120px'
          }}>
            <option value="all" style={{ background: 'var(--dark)', color: 'var(--white)' }}>All Time</option>
            <option value="today" style={{ background: 'var(--dark)', color: 'var(--white)' }}>Today</option>
            <option value="this-week" style={{ background: 'var(--dark)', color: 'var(--white)' }}>This Week</option>
            <option value="this-month" style={{ background: 'var(--dark)', color: 'var(--white)' }}>This Month</option>
            <option value="custom" style={{ background: 'var(--dark)', color: 'var(--white)' }}>Custom Range</option>
          </select>

          {dateFilter === 'custom' && (
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <select value={customDateRange.fromMonth} onChange={e => setCustomDateRange(prev => ({ ...prev, fromMonth: parseInt(e.target.value) }))} style={{
                padding: '0.5rem 0.5rem',
                background: 'var(--dark2)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--white)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                minWidth: '100px'
              }}>
                {MONTHS.map((m, i) => <option key={i} value={i} style={{ background: 'var(--dark)', color: 'var(--white)' }}>{m}</option>)}
              </select>
              <span style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>to</span>
              <select value={customDateRange.toMonth} onChange={e => setCustomDateRange(prev => ({ ...prev, toMonth: parseInt(e.target.value) }))} style={{
                padding: '0.5rem 0.5rem',
                background: 'var(--dark2)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--white)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                minWidth: '100px'
              }}>
                {MONTHS.map((m, i) => <option key={i} value={i} style={{ background: 'var(--dark)', color: 'var(--white)' }}>{m}</option>)}
              </select>
              <select value={customDateRange.year} onChange={e => setCustomDateRange(prev => ({ ...prev, year: parseInt(e.target.value) }))} style={{
                padding: '0.5rem 0.5rem',
                background: 'var(--dark2)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--white)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                minWidth: '80px'
              }}>
                {YEARS.map(y => <option key={y} value={y} style={{ background: 'var(--dark)', color: 'var(--white)' }}>{y}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Info Note */}
      <div style={{
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        background: 'rgba(212, 168, 67, 0.08)',
        border: '1px solid var(--primary)',
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: 'var(--gray)'
      }}>
        <span style={{ marginRight: '0.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>ℹ</span>
        <strong>Quick Guide:</strong> Click row to view order details - All sales are auto-generated from orders - 50% downpayment required
      </div>

      {/* Table */}
      <div style={{
        WebkitOverflowScrolling: 'touch',
        border: '1px solid var(--border)',
        boxSizing: 'border-box',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--gold) var(--dark2)',
        borderRadius: '10px',
        width: '0',
        minWidth: '100%',
        marginBottom: '1rem',
        display: 'block',
        overflowX: 'auto',
      }}>
        {filteredSales.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <h3 className="empty-title">{searchQuery || paymentFilter ? 'No sales found' : 'No Sales Records Yet'}</h3>
            <p className="empty-description">{searchQuery || paymentFilter ? 'Try adjusting your search or filter.' : 'Sales will appear here once orders are created.'}</p>
          </div>
        ) : (
          <table className="inventory-table" style={{
            width: 'max-content',
            minWidth: '100%',
          }}>
            <thead>
              <tr>
                <th style={{ width: '28px' }}></th>
                <th className="table-col-name">Order Number</th>
                <th className="table-col-category">Customer</th>
                <th className="table-col-stock">Items</th>
                <th className="table-col-min">Date</th>
                <th className="table-col-min">Total Price</th>
                <th className="table-col-min">Downpayment (50%)</th>
                <th className="table-col-min">Balance</th>
                <th className="table-col-status">Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map(order => {
                const statusBadge = getStatusBadge(order);
                const isExpanded = expandedRows.has(order.id);
                const totalItems = order.items?.reduce((sum, item) => sum + item.quantity, 0) || order.quantity || 0;

                return (
                  <React.Fragment key={order.id}>
                    <tr className="inventory-table-row"
                      style={{
                        opacity: order.status === 'cancelled' ? 0.55 : 1,
                      }}>

                      {/* Expand chevron */}
                      <td style={{ width: '28px', cursor: 'pointer' }} onClick={() => toggleExpand(order.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ color: 'var(--gray)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'block' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </td>

                      {/* Order Number */}
                      <td className="table-cell-name">
                        <div style={{ fontWeight: 600, color: 'var(--gold)', fontSize: '0.9rem' }}>
                          {order.orderNumber}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                          {order.source === 'manual' && (
                            <span style={{ color: 'var(--orange)' }}>Outside System</span>
                          )}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="table-cell">
                        <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.875rem' }}>
                          {order.customerName}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                          {order.customerContact}
                        </div>
                      </td>

                      {/* Items */}
                      <td className="table-cell-stock">
                        <span style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.875rem' }}>
                          {totalItems} pcs
                        </span>
                        {order.items?.length > 1 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.1rem' }}>
                            {order.items.length} variants
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="table-cell">
                        <span style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
                          {new Date(order.orderDate).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Total Price */}
                      <td className="table-cell">
                        <span style={{ fontWeight: 600, color: 'var(--gold)', fontSize: '0.875rem' }}>
                          {formatPrice(order.totalPrice || 0)}
                        </span>
                      </td>

                      {/* Downpayment */}
                      <td className="table-cell">
                        <span style={{ fontWeight: 600, color: order.downPayment > 0 ? 'var(--green)' : 'var(--gray)', fontSize: '0.875rem' }}>
                          {order.downPayment > 0 ? formatPrice(order.downPayment) : '—'}
                        </span>
                        {order.downPayment > 0 && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--green)', marginTop: '0.1rem' }}>
                            50% DP
                          </div>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="table-cell">
                        <span style={{ fontWeight: 600, color: order.balance === 0 ? 'var(--green)' : (order.status === 'cancelled' ? 'var(--gray)' : 'var(--gold)'), fontSize: '0.875rem' }}>
                          {order.status === 'cancelled' ? '—' : formatPrice(order.balance || 0)}
                        </span>
                        {order.balance === 0 && order.status !== 'cancelled' && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--green)', marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M20 6L9 17l-5-5"/>
                            </svg>
                            Paid
                          </div>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="table-cell">
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: statusBadge.bg,
                          border: `1px solid ${statusBadge.border}`,
                          borderRadius: '4px',
                          padding: '0.2rem 0.5rem',
                          color: statusBadge.color,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          whiteSpace: 'nowrap',
                        }}>
                          {statusBadge.label}
                        </span>
                      </td>
                    </tr>

                    {/* Expand row */}
                    {isExpanded && (
                      <OrderExpandRow key={`${order.id}-expand`} order={order} colSpan={9} />
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}
