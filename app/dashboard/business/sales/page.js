'use client';

/**
 * SALES MANAGEMENT PAGE (READ-ONLY)
 * 
 * Features:
 * - View all sales from the system (auto-generated)
 * - Filter by payment status (All, Paid, Pending 50%, Outside System, Cancelled)
 * - Search by customer name or order number
 * - Expandable order details
 * - Summary cards with analytics
 * - NO manual create - all sales auto-generated from orders
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

// ── Order Detail Expand Row ─────────────────────────────────────────────────
function OrderExpandRow({ order, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '1rem 1.25rem 1.25rem', display: 'flex', gap: '1rem', width: '100%' }}>

          {/* Customer Info */}
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Customer</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600 }}>{order.customerName || 'N/A'}</div>
              <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>{order.customerContact || 'N/A'}</div>
              <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>{order.customerEmail || 'N/A'}</div>
            </div>
          </div>

          {/* Order Items */}
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Order Items</div>
            {order.items && order.items.length > 0 ? (
              order.items.map((item, idx) => (
                <div key={idx} style={{ fontSize: '0.85rem', color: 'var(--white)', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600 }}>{item.productName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                    {item.variant ? `${item.variant} × ${item.quantity}` : `× ${item.quantity}`}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>₱{(item.unitPrice || 0).toFixed(2)} each</div>
                </div>
              ))
            ) : order.quantity ? (
              // For sales from inventory (no items array, just quantity)
              <div style={{ fontSize: '0.85rem', color: 'var(--white)' }}>
                <div style={{ fontWeight: 600 }}>{order.productName || 'Product'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                  × {order.quantity} pcs
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>₱{(order.unitPrice || 0).toFixed(2)} each</div>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--gray)', fontStyle: 'italic', opacity: 0.6 }}>—</div>
            )}
          </div>

          {/* Payment Details */}
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Payment</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--gray)' }}>Total:</span>
                <span style={{ fontWeight: 600, color: 'var(--gold)' }}>₱{(order.totalPrice || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--gray)' }}>Downpayment (50%):</span>
                <span style={{ fontWeight: 600, color: '#4ade80' }}>₱{(order.downPayment || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--gray)' }}>Balance:</span>
                <span style={{ fontWeight: 600, color: order.balance === 0 ? '#4ade80' : '#facc15' }}>
                  ₱{(order.balance || 0).toFixed(2)}
                </span>
              </div>
              {order.balance === 0 && (
                <div style={{ fontSize: '0.7rem', color: '#4ade80', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  Fully Paid
                </div>
              )}
            </div>
          </div>

          {/* Order Notes */}
          <div>
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
  const router = useRouter();
  const [sales, setSales] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState(''); // '', 'paid', 'pending-50', 'outside-system', 'cancelled'
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'this-week', 'this-month', 'this-year', 'custom'
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [expandedRows, setExpandedRows] = useState(new Set());

  // TODO: Replace localStorage with MongoDB API calls
  useEffect(() => {
    const storedSales = JSON.parse(localStorage.getItem('pmp_sales') || '[]');
    
    // Don't add dummy data - use actual sales from localStorage only
    setSales(storedSales);
    setIsLoaded(true);
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
      return { label: 'Cancelled', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.4)' };
    }
    
    if (order.source === 'manual') {
      return { label: 'Outside System', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)' };
    }
    
    if (order.balance === 0) {
      return { label: 'Paid', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.4)' };
    }
    
    if (order.downPayment > 0 && order.balance > 0) {
      return { label: 'Pending 50%', color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.4)' };
    }
    
    return { label: 'Pending', color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.4)' };
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
      const orderDate = new Date(order.orderDate);
      const today = new Date();
      
      if (dateFilter === 'today') {
        matchesDate = orderDate.toDateString() === today.toDateString();
      } else if (dateFilter === 'this-week') {
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchesDate = orderDate >= weekAgo;
      } else if (dateFilter === 'this-month') {
        matchesDate = orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear();
      } else if (dateFilter === 'this-year') {
        matchesDate = orderDate.getFullYear() === today.getFullYear();
      } else if (dateFilter === 'custom' && customDateRange.start && customDateRange.end) {
        matchesDate = orderDate >= new Date(customDateRange.start) && orderDate <= new Date(customDateRange.end);
      }
      
      return matchesSearch && matchesPayment && matchesDate;
    });
  }, [sales, searchQuery, paymentFilter, dateFilter, customDateRange]);

  // Calculate summary metrics (based on ALL sales, not filtered)
  const summaryMetrics = useMemo(() => {
    const allSalesForMetrics = sales; // Use ALL sales data, not filtered
    
    const totalSales = allSalesForMetrics.filter(o => o.status !== 'cancelled').length;
    const paidOrders = allSalesForMetrics.filter(o => o.status !== 'cancelled' && o.balance === 0 && o.source !== 'manual');
    const pending50Orders = allSalesForMetrics.filter(o => o.status !== 'cancelled' && o.downPayment > 0 && o.balance > 0 && o.source !== 'manual');
    const outsideSystemOrders = allSalesForMetrics.filter(o => o.source === 'manual');
    const cancelledOrders = allSalesForMetrics.filter(o => o.status === 'cancelled');
    
    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const totalCost = paidOrders.reduce((sum, o) => sum + (o.cost || 0), 0);
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
  }, [sales]); // Only depend on sales, not filteredSales

  if (!isLoaded) {
    return (
      <div className="page-content-wrapper">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading sales...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content-wrapper">
      
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Sales Records</h1>
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
              <span className="summary-value" style={{ color: '#f97316' }}>{summaryMetrics.outsideSystem}</span>
              <span className="summary-label" style={{ color: '#f97316' }}>Outside System</span>
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

        {/* Sales Analytics Module with Date Range */}
        <div style={{
          background: 'var(--dark)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginTop: '1rem',
        }}>
          {/* Module Header with Date Range */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, var(--gold), var(--gold-dark))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--black)' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)', margin: 0 }}>Sales Analytics</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--gray)', margin: '0.25rem 0 0 0' }}>Revenue and performance insights</p>
              </div>
            </div>
            
            {/* Date Range Selector */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'var(--dark2)',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>From</label>
                <input
                  type="date"
                  className="form-input"
                  value={customDateRange.start}
                  onChange={(e) => {
                    setCustomDateRange(prev => ({ ...prev, start: e.target.value }));
                    setDateFilter('custom');
                  }}
                  style={{
                    background: 'var(--dark)',
                    borderColor: 'var(--border)',
                    color: 'var(--white)',
                    fontSize: '0.85rem',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '6px',
                    minWidth: '140px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>To</label>
                <input
                  type="date"
                  className="form-input"
                  value={customDateRange.end}
                  onChange={(e) => {
                    setCustomDateRange(prev => ({ ...prev, end: e.target.value }));
                    setDateFilter('custom');
                  }}
                  style={{
                    background: 'var(--dark)',
                    borderColor: 'var(--border)',
                    color: 'var(--white)',
                    fontSize: '0.85rem',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '6px',
                    minWidth: '140px',
                  }}
                />
              </div>
              
              <button
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setCustomDateRange({ start: today, end: today });
                  setDateFilter('today');
                }}
                style={{
                  background: 'var(--gold)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  color: 'var(--black)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginTop: '1.1rem',
                  whiteSpace: 'nowrap',
                }}
              >
                Today
              </button>
            </div>
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
                <span style={{ fontSize: '0.75rem', color: '#4ade80', textTransform: 'uppercase', fontWeight: 700 }}>Total Sales</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80' }}>
                {summaryMetrics.totalSales}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem' }}>
                Completed orders
              </div>
            </div>
            
            {/* Total Kita Card */}
            <div style={{
              background: 'rgba(212, 168, 67, 0.1)',
              border: '1px solid rgba(212, 168, 67, 0.3)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#d4a843', textTransform: 'uppercase', fontWeight: 700 }}>Total Revenue</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#d4a843' }}>
                ₱{summaryMetrics.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem' }}>
                From completed orders
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
                <span style={{ fontSize: '0.75rem', color: '#6366f1', textTransform: 'uppercase', fontWeight: 700 }}>Top Products</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#6366f1' }}>
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
                            <span style={{ color: '#f97316' }}>Outside System</span>
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
                          ₱{order.totalPrice.toFixed(2)}
                        </span>
                      </td>

                      {/* Downpayment */}
                      <td className="table-cell">
                        <span style={{ fontWeight: 600, color: order.downPayment > 0 ? '#4ade80' : 'var(--gray)', fontSize: '0.875rem' }}>
                          {order.downPayment > 0 ? `₱${order.downPayment.toFixed(2)}` : '—'}
                        </span>
                        {order.downPayment > 0 && (
                          <div style={{ fontSize: '0.65rem', color: '#4ade80', marginTop: '0.1rem' }}>
                            50% DP
                          </div>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="table-cell">
                        <span style={{ fontWeight: 600, color: order.balance === 0 ? '#4ade80' : (order.status === 'cancelled' ? 'var(--gray)' : '#facc15'), fontSize: '0.875rem' }}>
                          {order.status === 'cancelled' ? '—' : `₱${(order.balance || 0).toFixed(2)}`}
                        </span>
                        {order.balance === 0 && order.status !== 'cancelled' && (
                          <div style={{ fontSize: '0.65rem', color: '#4ade80', marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
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
  );
}
