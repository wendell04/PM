/**
 * Orders Admin Page
 * Connects to backend API via ordersApi.js
 */

'use client';

import ErrorBoundary from '../../../../components/ErrorBoundary';
import React, { useState, useEffect } from 'react';
import { fetchAllOrders, updateOrder as updateOrderApi } from '@/lib/ordersApi';

// Sample orders for fallback/testing
const today = new Date();
const thisMonth = today.getMonth();
const thisYear = today.getFullYear();

// Helper to add days to a date
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
};

// TODO: MongoDB - Remove this sample data, fetch from database instead
// Mongoose Schema Reference:
// {
//   _id: ObjectId,
//   orderId: String (unique, e.g., 'ORD-001'),
//   customer: {
//     name: String,
//     contact: String,
//     email: String
//   },
//   product: {
//     name: String,
//     category: String,
//     variant: String,
//     unitPrice: Number
//   },
//   quantity: Number,
//   totalPrice: Number,
//   downPayment: Number,
//   balance: Number,
//   orderStatus: String (Pending, In Production, For Delivery, Delivered, Returned, Cancelled),
//   joStatus: String (Queued, In Progress, Completed, null),
//   isRush: Boolean,
//   targetCompletion: Date,
//   paymentDate: Date,
//   designFile: String (URL/path),
//   designNotes: String,
//   checkoutRestricted: Boolean,
//   createdAt: Date,
//   updatedAt: Date
// }
const samplePendingOrders = [
  // 2 Pending orders - ordered TODAY (1 unpaid, 1 paid with DP)
  { id: 'ORD-001', customerName: 'Maria Santos', customerContact: '09171234567', customerEmail: 'maria@email.com', productName: 'Custom Mug', category: 'Mugs', variant: 'White 11oz', quantity: 25, unitPrice: 150, totalPrice: 3750, downPayment: 0, balance: 3750, orderStatus: 'Pending', designFile: 'design-001.png', designNotes: 'Awaiting design approval', paymentDate: null, isRush: false, joId: null, joStatus: null, targetCompletion: null, checkoutRestricted: true, createdAt: addDays(today, 0) },
  { id: 'ORD-002', customerName: 'Juan Dela Cruz', customerContact: '09281234567', customerEmail: 'juan@email.com', productName: 'Custom T-Shirt', category: 'T-Shirt', variant: 'L / Black', quantity: 10, unitPrice: 350, totalPrice: 3500, downPayment: 1750, balance: 1750, orderStatus: 'Pending', designFile: 'design-002.png', designNotes: 'Paid DP - ready for production', paymentDate: addDays(today, 0), isRush: false, joId: null, joStatus: null, targetCompletion: null, checkoutRestricted: false, createdAt: addDays(today, 0) },
  
  // DELAYED ORDER - Target was 10 days ago (for JO Schedule testing)
  { id: 'ORD-007', customerName: 'Carlos Mendoza', customerContact: '09179998888', customerEmail: 'carlos@email.com', productName: 'Custom Hoodie', category: 'T-Shirt', variant: 'XL / Navy', quantity: 20, unitPrice: 550, totalPrice: 11000, downPayment: 5500, balance: 5500, orderStatus: 'In Production', designFile: 'design-007.png', designNotes: 'Delayed - production backlog', paymentDate: addDays(today, -10), isRush: false, joId: 'JOB-007', joStatus: 'Queued', targetCompletion: addDays(today, -10), checkoutRestricted: false, createdAt: addDays(today, -10) },
  
  // NEAR DEADLINE ORDER - Target is tomorrow (1 day left)
  { id: 'ORD-008', customerName: 'Lisa Fernandez', customerContact: '09283334444', customerEmail: 'lisa@email.com', productName: 'Custom Cap', category: 'Accessories', variant: 'One Size / Red', quantity: 50, unitPrice: 120, totalPrice: 6000, downPayment: 6000, balance: 0, orderStatus: 'In Production', designFile: 'design-008.png', designNotes: 'Due tomorrow - prioritize', paymentDate: addDays(today, -3), isRush: false, joId: 'JOB-008', joStatus: 'Queued', targetCompletion: addDays(today, 1), checkoutRestricted: false, createdAt: addDays(today, -3) },
  
  // 4 In Production orders - ordered YESTERDAY (already moved to production, have JOs)
  { id: 'ORD-003', customerName: 'Ana Reyes', customerContact: '09171112222', customerEmail: 'ana@email.com', productName: 'Custom Sticker', category: 'Stickers', variant: 'Vinyl 3"', quantity: 100, unitPrice: 15, totalPrice: 1500, downPayment: 1500, balance: 0, orderStatus: 'In Production', designFile: 'design-003.png', designNotes: 'Approved', paymentDate: addDays(today, -1), isRush: false, joId: 'JOB-001', joStatus: 'Queued', targetCompletion: addDays(today, 6), checkoutRestricted: false, createdAt: addDays(today, -1) },
  { id: 'ORD-004', customerName: 'Pedro Cruz', customerContact: '09281112222', customerEmail: 'pedro@email.com', productName: 'Ceramic Mug', category: 'Mugs', variant: 'White 15oz', quantity: 40, unitPrice: 180, totalPrice: 7200, downPayment: 7200, balance: 0, orderStatus: 'In Production', designFile: 'design-004.png', designNotes: 'Approved', paymentDate: addDays(today, -1), isRush: false, joId: 'JOB-002', joStatus: 'Queued', targetCompletion: addDays(today, 6), checkoutRestricted: false, createdAt: addDays(today, -1) },
  { id: 'ORD-005', customerName: 'Sofia Garcia', customerContact: '09175556666', customerEmail: 'sofia@email.com', productName: 'Custom Mug', category: 'Mugs', variant: 'Black 11oz', quantity: 30, unitPrice: 150, totalPrice: 4500, downPayment: 2250, balance: 2250, orderStatus: 'In Production', designFile: 'design-005.png', designNotes: 'Rush order - approved', paymentDate: addDays(today, -1), isRush: true, joId: 'JOB-003', joStatus: 'Queued', targetCompletion: addDays(today, 2), checkoutRestricted: false, createdAt: addDays(today, -1) },
  { id: 'ORD-006', customerName: 'Miguel Torres', customerContact: '09287778888', customerEmail: 'miguel@email.com', productName: 'Custom T-Shirt', category: 'T-Shirt', variant: 'M / White', quantity: 15, unitPrice: 350, totalPrice: 5250, downPayment: 2625, balance: 2625, orderStatus: 'In Production', designFile: 'design-006.png', designNotes: 'Rush order - approved', paymentDate: addDays(today, -1), isRush: true, joId: 'JOB-004', joStatus: 'Queued', targetCompletion: addDays(today, 2), checkoutRestricted: false, createdAt: addDays(today, -1) },
];

const getStatusBadge = (status) => {
  if (!status) return { label: '', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)' };
  const map = {
    'Pending': { label: 'Pending', color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.4)' },
    'In Production': { label: 'In Production', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.4)' },
    'For Delivery': { label: 'For Delivery', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)' },
    'Delivered': { label: 'Delivered', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.4)' },
    'Returned': { label: 'Returned', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.4)' },
    'Cancelled': { label: 'Cancelled', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.4)' },
  };
  return map[status] || { label: status, color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)' };
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [2025, 2026, 2027, 2028];

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [dateFilter, setDateFilter] = useState('this-month'); // 'today', 'this-week', 'this-month', 'custom'
  const [customDateRange, setCustomDateRange] = useState({ fromMonth: 0, toMonth: 0, year: 2025 });
  const [expandedIds, setExpandedIds] = useState(new Set()); // Multiple rows can be expanded
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [showJOQueuing, setShowJOQueuing] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedJO, setSelectedJO] = useState(null);
  const [showUnpaidWarning, setShowUnpaidWarning] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);

  // Print modal form state
  const [printDescription, setPrintDescription] = useState('');
  const [printDesignImages, setPrintDesignImages] = useState([]); // Multiple images

  // Load orders from API on mount
  useEffect(() => {
    async function loadOrders() {
      try {
        const data = await fetchAllOrders();
        setOrders(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load orders:', error);
        // Fallback to empty array on error
        setOrders([]);
      }
    }
    loadOrders();
  }, []);

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.customerName?.toLowerCase().includes(search.toLowerCase()) || o.id?.toLowerCase().includes(search.toLowerCase()) || o.productName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'All' || o.orderStatus === filterStatus;
    
    // Date filter
    let matchDate = true;
    const orderDate = new Date(o.createdAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    orderDate.setHours(0, 0, 0, 0);
    
    if (dateFilter === 'today') {
      matchDate = orderDate.getTime() === today.getTime();
    } else if (dateFilter === 'this-week') {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      matchDate = orderDate >= weekAgo;
    } else if (dateFilter === 'this-month') {
      matchDate = orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear();
    } else if (dateFilter === 'custom') {
      const fromMonth = customDateRange.fromMonth;
      const toMonth = customDateRange.toMonth;
      const year = customDateRange.year;
      matchDate = orderDate.getFullYear() === year && orderDate.getMonth() >= fromMonth && orderDate.getMonth() <= toMonth;
    }
    
    return matchSearch && matchStatus && matchDate;
  });

  // Sort filtered orders - newest to oldest
  const sorted = [...filtered].sort((a, b) => {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return dateB - dateA; // Descending (newest first)
  });

  const totalOrders = sorted.length;
  const pendingOrders = sorted.filter(o => o.orderStatus === 'Pending').length;
  const inProduction = sorted.filter(o => o.orderStatus === 'In Production').length;
  const forDelivery = sorted.filter(o => o.orderStatus === 'For Delivery').length;
  const delivered = sorted.filter(o => o.orderStatus === 'Delivered').length;
  const returned = sorted.filter(o => o.orderStatus === 'Returned').length;

  const toggleSelectOrder = (orderId) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrders.size === sorted.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(sorted.map(o => o.id)));
    }
  };

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Orders</h1>
            <p className="page-subtitle">Manage customer orders and design approvals.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowJOQueuing(true)}>
            Job Schedule
          </button>
        </div>

        {/* Stats */}
        <div className="inventory-summary">
          <div className="summary-card">
            <div className="summary-content">
              <span className="summary-value">{totalOrders}</span>
              <span className="summary-label">Total Orders</span>
            </div>
          </div>
          <div className="summary-card summary-card-warning">
            <div className="summary-content">
              <span className="summary-value">{pendingOrders}</span>
              <span className="summary-label">Pending</span>
            </div>
          </div>
          <div className="summary-card summary-card-info">
            <div className="summary-content">
              <span className="summary-value">{inProduction}</span>
              <span className="summary-label">In Production</span>
            </div>
          </div>
          <div className="summary-card summary-card-warning" style={{ background: 'rgba(249, 115, 22, 0.08)', borderColor: 'rgba(249, 115, 22, 0.3)' }}>
            <div className="summary-content">
              <span className="summary-value" style={{ color: '#f97316' }}>{forDelivery}</span>
              <span className="summary-label" style={{ color: '#f97316' }}>For Delivery</span>
            </div>
          </div>
          <div className="summary-card summary-card-success">
            <div className="summary-content">
              <span className="summary-value">{delivered}</span>
              <span className="summary-label">Delivered</span>
            </div>
          </div>
          <div className="summary-card summary-card-danger">
            <div className="summary-content">
              <span className="summary-value">{returned}</span>
              <span className="summary-label">Returned</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="inventory-toolbar">
        <div className="search-wrapper">
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input className="search-input" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
            padding: '0.5rem 0.75rem',
            background: 'var(--dark2)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--white)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            minWidth: '140px'
          }}>
            {['All','Pending','In Production','For Delivery','Delivered','Returned','Cancelled'].map(s => <option key={s} style={{ background: 'var(--dark)', color: 'var(--white)' }}>{s}</option>)}
          </select>

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

      {/* Selection Toolbar - Shows when orders are selected */}
      {selectedOrders.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          background: 'rgba(99, 102, 241, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          marginBottom: '1rem'
        }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>
            {selectedOrders.size} selected
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(() => {
              const hasPending = Array.from(selectedOrders).some(id => orders.find(o => o.id === id)?.orderStatus === 'Pending');
              const hasInProduction = Array.from(selectedOrders).some(id => orders.find(o => o.id === id)?.orderStatus === 'In Production');
              const hasForDelivery = Array.from(selectedOrders).some(id => orders.find(o => o.id === id)?.orderStatus === 'For Delivery');
              
              // Check if mixed status (different statuses selected)
              const mixedStatus = (hasPending ? 1 : 0) + (hasInProduction ? 1 : 0) + (hasForDelivery ? 1 : 0) > 1;

              const handleStatusUpdate = async (newStatus) => {
                // Check for unpaid orders when updating to In Production
                if (newStatus === 'In Production') {
                  const unpaidOrders = [];
                  selectedOrders.forEach(orderId => {
                    const order = orders.find(o => o.id === orderId);
                    if (order && order.orderStatus === 'Pending' && order.downPayment === 0) {
                      unpaidOrders.push(order);
                    }
                  });

                  if (unpaidOrders.length > 0) {
                    setPendingStatusUpdate({ newStatus, selectedOrders: new Set(selectedOrders) });
                    setShowUnpaidWarning(true);
                    return;
                  }
                }

                // Update order status for selected orders via API
                try {
                  const updatePromises = Array.from(selectedOrders).map(async (orderId) => {
                    const updatedOrder = { orderStatus: newStatus };
                    if (newStatus === 'For Delivery') {
                      updatedOrder.joStatus = 'Completed';
                    }
                    return await updateOrderApi(orderId, updatedOrder);
                  });

                  const updatedOrders = await Promise.all(updatePromises);
                  
                  // Update local state with API responses
                  setOrders(prev => prev.map(ord => {
                    if (selectedOrders.has(ord.id)) {
                      const apiUpdated = updatedOrders.find(u => u.id === ord.id || u._id === ord.id);
                      return apiUpdated ? { ...ord, ...apiUpdated } : { ...ord, orderStatus: newStatus };
                    }
                    return ord;
                  }));
                } catch (error) {
                  console.error('Failed to update order status:', error);
                  // Fallback: update local state optimistically
                  setOrders(prev => prev.map(ord => {
                    if (selectedOrders.has(ord.id)) {
                      const updated = { ...ord, orderStatus: newStatus };
                      if (newStatus === 'For Delivery') {
                        updated.joStatus = 'Completed';
                      }
                      return updated;
                    }
                    return ord;
                  }));
                }
                
                setSelectedOrders(new Set());
              };

              return (
                <>
                  {mixedStatus ? (
                    <span style={{ fontSize: '0.8rem', color: '#facc15', fontStyle: 'italic' }}>
                      Mixed status selected. Please select orders with the same status for bulk update.
                    </span>
                  ) : (
                    <>
                      {hasPending && (
                        <>
                          <button className="btn-sm btn-primary" onClick={() => handleStatusUpdate('In Production')}>In Production</button>
                          <button className="btn-sm btn-secondary" onClick={() => handleStatusUpdate('Cancelled')} style={{ background: 'var(--dark2)', borderColor: 'var(--border)', color: 'var(--white)' }}>Cancel</button>
                        </>
                      )}
                      {hasInProduction && (
                        <>
                          <button className="btn-sm btn-primary" onClick={() => handleStatusUpdate('For Delivery')}>For Delivery</button>
                          <button className="btn-sm btn-secondary" onClick={() => handleStatusUpdate('Cancelled')} style={{ background: 'var(--dark2)', borderColor: 'var(--border)', color: 'var(--white)' }}>Cancel</button>
                        </>
                      )}
                      {hasForDelivery && (
                        <>
                          <button className="btn-sm btn-primary" onClick={() => handleStatusUpdate('Delivered')}>Delivered</button>
                          <button className="btn-sm btn-secondary" onClick={() => handleStatusUpdate('Returned')} style={{ background: 'var(--dark2)', borderColor: 'var(--border)', color: 'var(--white)' }}>Returned</button>
                        </>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>
          <button onClick={() => setSelectedOrders(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, padding: '0.25rem' }}>×</button>
        </div>
      )}

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
        <table className="inventory-table" style={{ fontFamily: 'inherit' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input type="checkbox" checked={sorted.length > 0 && selectedOrders.size === sorted.length} onChange={toggleSelectAll} style={{ cursor: 'pointer', accentColor: 'var(--gold)' }} />
              </th>
              <th style={{ width: '28px' }}></th>
              <th className="table-col-name" style={{ width: '100px' }}>Order ID</th>
              <th className="table-col-category">Customer</th>
              <th className="table-col-stock">Product</th>
              <th className="table-col-min" style={{ textAlign: 'center' }}>Qty</th>
              <th className="table-col-min">Total</th>
              <th className="table-col-status">Status</th>
              <th className="table-col-min">Date</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                      </svg>
                    </div>
                    <h3 className="empty-title">No orders found</h3>
                    <p className="empty-description">Try adjusting your search or filter.</p>
                  </div>
                </td>
              </tr>
            ) : (
              sorted.map(o => {
                const statusBadge = getStatusBadge(o.orderStatus);
                const isExpanded = expandedIds.has(o.id);
                const isSelected = selectedOrders.has(o.id);

                return (
                  <React.Fragment key={o.id}>
                    <tr className="inventory-table-row">
                      <td style={{ width: '40px', textAlign: 'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOrder(o.id)} style={{ cursor: 'pointer', accentColor: 'var(--gold)' }} />
                      </td>
                      <td style={{ width: '28px', cursor: 'pointer' }} onClick={() => {
                        setExpandedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(o.id)) {
                            next.delete(o.id);
                          } else {
                            next.add(o.id);
                          }
                          return next;
                        });
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ color: 'var(--gray)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'block' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </td>
                      <td className="table-cell-name">
                        <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--gray)' }}>{o.id}</div>
                      </td>
                      <td className="table-cell">
                        <div style={{ fontWeight: 500 }}>{o.customerName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{o.customerContact}</div>
                      </td>
                      <td className="table-cell">
                        <div>{o.productName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{o.category}</div>
                      </td>
                      <td className="table-cell" style={{ textAlign: 'center', color: 'var(--gray)' }}>{o.quantity} pcs</td>
                      <td className="table-cell">
                        <div style={{ color: 'var(--gold)', fontSize: '1rem', fontWeight: 600 }}>₱{o.totalPrice?.toLocaleString()}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--gray)' }}>DP: ₱{o.downPayment?.toLocaleString()}</div>
                      </td>
                      <td className="table-cell">
                        <span className="stock-status-badge" style={{ color: statusBadge.color, background: statusBadge.bg, borderColor: statusBadge.border }}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="table-cell" style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{o.createdAt}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0, background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '1rem 1.25rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
                            {/* Customer Info */}
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Customer</div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.5 }}>
                                <div style={{ fontWeight: 600 }}>{o.customerName}</div>
                                <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>{o.customerContact}</div>
                                <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>{o.customerEmail}</div>
                              </div>
                            </div>
                            
                            {/* Order Details */}
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Order Details</div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.5 }}>
                                <div style={{ fontWeight: 600 }}>{o.productName}</div>
                                <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>Category: {o.category}</div>
                                <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>Variant: {o.variant || 'N/A'}</div>
                                <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>Qty: {o.quantity} pcs</div>
                              </div>
                            </div>
                            
                            {/* Job Order Details */}
                            {o.joId && (
                              <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Job Order</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.5 }}>
                                  <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{o.joId}</div>
                                  <div style={{ color: o.isRush ? '#f97316' : 'var(--white)', fontWeight: 600 }}>{o.isRush ? 'Rush' : 'Standard'}</div>
                                  <div style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>Target: {o.targetCompletion ? new Date(o.targetCompletion).toLocaleDateString() : 'N/A'}</div>
                                  {(() => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const targetDate = o.targetCompletion ? new Date(o.targetCompletion) : null;
                                    const isDelayed = targetDate && targetDate < today;
                                    const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : null;
                                    const daysLate = isDelayed ? Math.abs(daysLeft) : 0;
                                    
                                    if (isDelayed) {
                                      return (
                                        <>
                                          <div style={{ color: '#f87171', fontWeight: 600 }}>Priority</div>
                                          <div style={{ color: '#f87171', fontSize: '0.75rem', fontWeight: 600 }}>⚠ {daysLate} day{daysLate !== 1 ? 's' : ''} late</div>
                                        </>
                                      );
                                    }
                                    return (
                                      <>
                                        <div style={{ color: o.joStatus === 'In Progress' ? '#6366f1' : '#facc15', fontWeight: 600 }}>{o.joStatus || 'Queued'}</div>
                                        <div style={{ color: 'var(--gray)', fontSize: '0.75rem', fontWeight: 600 }}>{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</div>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                            
                            {/* Payment Breakdown */}
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', fontWeight: 600 }}>Payment</div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.7 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--gray)' }}>Total</span>
                                  <span style={{ color: 'var(--gold)', fontWeight: 600 }}>₱{o.totalPrice?.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--gray)' }}>Downpayment (50%)</span>
                                  <span style={{ color: 'var(--gold)', fontWeight: 600 }}>₱{o.downPayment?.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--gray)' }}>Balance</span>
                                  <span style={{ color: o.balance === 0 ? '#4ade80' : '#facc15', fontWeight: 600 }}>₱{o.balance?.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* JO Queuing Modal */}
      {showJOQueuing && (
        <div className="modal-overlay" onClick={() => setShowJOQueuing(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title">Job Order Queuing</h2>
              <button className="modal-close" onClick={() => setShowJOQueuing(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {/* Priority Legend */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#f87171' }}></div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>Delayed</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#f97316' }}></div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>Rush Order</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#facc15' }}></div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>Near Deadline</span>
                </div>
              </div>

              {/* JO Cards - Sorted by priority (Delayed first, then Rush, then by deadline) */}
              {/* TODO: MongoDB - Replace with API call: GET /api/job-orders?status=active&sort=priority */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {orders
                  .filter(o => o.downPayment > 0 && o.orderStatus === 'In Production' && o.joStatus !== 'Completed')
                  .sort((a, b) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // Calculate days status for each
                    const targetA = a.targetCompletion ? new Date(a.targetCompletion) : null;
                    const targetB = b.targetCompletion ? new Date(b.targetCompletion) : null;
                    
                    const isDelayedA = targetA && targetA < today;
                    const isDelayedB = targetB && targetB < today;
                    
                    const daysLeftA = targetA ? Math.ceil((targetA - today) / (1000 * 60 * 60 * 24)) : 999;
                    const daysLeftB = targetB ? Math.ceil((targetB - today) / (1000 * 60 * 60 * 24)) : 999;
                    
                    const daysLateA = isDelayedA ? Math.abs(daysLeftA) : 0;
                    const daysLateB = isDelayedB ? Math.abs(daysLeftB) : 0;

                    // Delayed orders first (most delayed first)
                    if (isDelayedA && !isDelayedB) return -1;
                    if (!isDelayedA && isDelayedB) return 1;
                    if (isDelayedA && isDelayedB) return daysLateB - daysLateA; // Most delayed first
                    
                    // Rush orders next
                    if (a.isRush && !b.isRush) return -1;
                    if (!a.isRush && b.isRush) return 1;
                    
                    // Then by days left (nearest deadline first)
                    return daysLeftA - daysLeftB;
                  })
                  .map(o => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const targetDate = o.targetCompletion ? new Date(o.targetCompletion) : null;
                    const isDelayed = targetDate && targetDate < today;
                    const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : null;
                    const daysLate = isDelayed ? Math.abs(daysLeft) : 0;
                    
                    // Priority colors: Delayed (red) > Rush (orange) > Near Deadline (yellow)
                    const isUrgent = !isDelayed && daysLeft !== null && daysLeft <= 2;
                    const priorityColor = isDelayed ? '#f87171' : (o.isRush ? '#f97316' : (isUrgent ? '#facc15' : 'transparent'));
                    const priorityTextColor = isDelayed ? '#f87171' : (o.isRush ? '#f97316' : (isUrgent ? '#facc15' : 'var(--white)'));
                    const statusColor = o.joStatus === 'In Progress' ? '#6366f1' : '#facc15';

                    return (
                      <div key={o.id} style={{
                        padding: '1rem',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        border: `2px solid ${priorityColor === 'transparent' ? 'rgba(255,255,255,0.2)' : priorityColor}`,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '1rem',
                        alignItems: 'center'
                      }}>
                        {/* Left: Order Info */}
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
                            {o.joId || 'Pending JO'}
                          </div>
                          <div style={{ fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>
                            {o.customerName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                            {o.productName} × {o.quantity} pcs
                          </div>
                        </div>

                        {/* Center: Timeline */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
                            {isDelayed ? (
                              <span style={{ color: '#f87171', fontWeight: 700 }}>DELAYED</span>
                            ) : o.isRush ? (
                              'RUSH ORDER'
                            ) : (
                              'Standard'
                            )}
                          </div>
                          {o.targetCompletion && (
                            <div style={{ fontSize: '0.875rem', color: priorityTextColor }}>
                              Due: {new Date(o.targetCompletion).toLocaleDateString()}
                            </div>
                          )}
                          {daysLeft !== null && (
                            <div style={{ fontSize: '0.75rem', color: isDelayed ? '#f87171' : (daysLeft <= 2 ? '#f87171' : 'var(--gray)') }}>
                              {isDelayed
                                ? `${daysLate} day${daysLate !== 1 ? 's' : ''} late`
                                : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`
                              }
                            </div>
                          )}
                        </div>

                        {/* Right: Status & Actions */}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            display: 'inline-block',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: isDelayed 
                              ? 'rgba(248, 113, 113, 0.2)' 
                              : (statusColor === '#6366f1' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(250, 204, 21, 0.2)'),
                            color: isDelayed ? '#f87171' : statusColor,
                            marginBottom: '0.5rem'
                          }}>
                            {isDelayed ? 'Priority' : (o.joStatus || 'Queued')}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button
                              className="btn-sm btn-secondary"
                              onClick={() => {
                                setSelectedJO(o);
                                setPrintDescription('');
                                setPrintDesignImages([]);
                                setShowPrintModal(true);
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              Print
                            </button>
                            {!isDelayed && o.joStatus !== 'In Progress' && (
                              <button
                                className="btn-sm btn-primary"
                                onClick={() => {
                                  // Start production - update JO status to In Progress
                                  setOrders(prev => prev.map(ord =>
                                    ord.id === o.id ? { ...ord, joStatus: 'In Progress' } : ord
                                  ));
                                }}
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                              >
                                Start
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowJOQueuing(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print JO Modal */}
      {showPrintModal && selectedJO && (
        <div className="modal-overlay" onClick={() => setShowPrintModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title">Job Order - {selectedJO.joId || 'PENDING'}</h2>
              <button className="modal-close" onClick={() => setShowPrintModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {/* JO Header */}
              <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '2px solid var(--border)' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.5rem', letterSpacing: '2px' }}>PERSONALIZE ME</h2>
                <div style={{ fontSize: '0.875rem', color: 'var(--gray)', letterSpacing: '1px' }}>Job Order for Production</div>
              </div>

              {/* JO Info - Priority & Target */}
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(249, 250, 251, 0.1)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>JO ID</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--white)' }}>{selectedJO.joId || 'PENDING'}</div>
                  </div>
                  <div style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '20px',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    border: '2px solid',
                    color: selectedJO.isRush ? '#f87171' : '#10b981',
                    borderColor: selectedJO.isRush ? '#f87171' : '#10b981',
                    background: selectedJO.isRush ? 'rgba(248, 113, 113, 0.1)' : 'rgba(16, 185, 129, 0.1)'
                  }}>
                    {selectedJO.isRush ? 'RUSH ORDER' : 'STANDARD'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Target Completion Date</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--white)' }}>
                    {selectedJO.targetCompletion ? new Date(selectedJO.targetCompletion).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 600 }}>Customer Information</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.75rem' }}>{selectedJO.customerName}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>{selectedJO.customerContact}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>{selectedJO.customerEmail}</div>
              </div>

              {/* Product Specifications */}
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(217, 119, 6, 0.1)', borderRadius: '8px', border: '2px solid rgba(217, 119, 6, 0.3)' }}>
                <div style={{ fontSize: '0.72rem', color: '#d97706', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 600, borderBottom: '2px solid #d97706', paddingBottom: '0.5rem' }}>Product Specifications (For Production)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Product Name</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--white)' }}>{selectedJO.productName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Category</div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--white)' }}>{selectedJO.category}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Variant / Specs</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--white)' }}>{selectedJO.variant || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Quantity to Produce</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>{selectedJO.quantity} pcs</div>
                  </div>
                </div>
              </div>

              {/* Design File & Description */}
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Design for Printing</div>
                
                {/* Design Images Upload */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Design File Images (Optional)</div>
                  <div style={{ 
                    border: '2px dashed var(--border)', 
                    borderRadius: '8px', 
                    padding: '1.5rem',
                    textAlign: 'center',
                    background: printDesignImages.length > 0 ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.2)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => document.getElementById('designImagesInput').click()}
                  >
                    {printDesignImages.length > 0 ? (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.75rem' }}>
                          {printDesignImages.length} image{printDesignImages.length > 1 ? 's' : ''} uploaded - Click to add more
                        </div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                          gap: '0.75rem',
                          marginBottom: '0.75rem'
                        }}>
                          {printDesignImages.map((img, idx) => (
                            <div key={idx} style={{ position: 'relative' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img 
                                src={img} 
                                alt={`Design ${idx + 1}`} 
                                style={{ 
                                  width: '100%', 
                                  aspectRatio: '1:1', 
                                  objectFit: 'cover', 
                                  borderRadius: '8px',
                                  border: '1px solid var(--border)'
                                }}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPrintDesignImages(printDesignImages.filter((_, i) => i !== idx));
                                }}
                                style={{
                                  position: 'absolute',
                                  top: '-6px',
                                  right: '-6px',
                                  background: '#f87171',
                                  border: '2px solid var(--dark)',
                                  borderRadius: '50%',
                                  width: '24px',
                                  height: '24px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  fontSize: '0.875rem',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrintDesignImages([]);
                          }}
                          style={{
                            background: 'rgba(248, 113, 113, 0.2)',
                            border: '1px solid rgba(248, 113, 113, 0.4)',
                            borderRadius: '6px',
                            padding: '0.25rem 0.75rem',
                            color: '#f87171',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          Remove All Images
                        </button>
                      </div>
                    ) : (
                      <div>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--gray)', marginBottom: '0.75rem' }}>
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <div style={{ fontSize: '0.875rem', color: 'var(--white)', marginBottom: '0.25rem' }}>Click to upload design images</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>PNG, JPG, GIF - Multiple images supported (Optional)</div>
                      </div>
                    )}
                    <input
                      id="designImagesInput"
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          const newImages = [];
                          let loaded = 0;
                          
                          files.forEach((file) => {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              if (event.target?.result) {
                                newImages.push(event.target.result);
                              }
                              loaded++;
                              if (loaded === files.length) {
                                setPrintDesignImages([...printDesignImages, ...newImages]);
                              }
                            };
                            reader.readAsDataURL(file);
                          });
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Description Input */}
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Print Description / Notes (Optional)</div>
                  <textarea
                    className="form-input"
                    value={printDescription}
                    onChange={(e) => setPrintDescription(e.target.value)}
                    placeholder="Add any special instructions for printing..."
                    rows={3}
                    style={{
                      background: 'var(--dark)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      color: 'var(--white)',
                      fontSize: '0.875rem',
                      width: '100%',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowPrintModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  // Print functionality - Create clean Word-like document
                  const printWindow = window.open('', '', 'width=800,height=600');
                  
                  // Get design images HTML if any - FLEXIBLE (maintains original aspect ratio)
                  const designImagesHtml = printDesignImages.length > 0 
                    ? `<div style="margin: 20px 0; padding: 15px; border: 2px solid #333; border-radius: 8px; page-break-inside: avoid;">
                        <h3 style="margin: 0 0 15px 0; color: #000; font-size: 14px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 5px;">Design References (${printDesignImages.length} image${printDesignImages.length > 1 ? 's' : ''})</h3>
                        <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-start;">
                          ${printDesignImages.map(img => `<div style="flex: 0 1 auto; width: calc(33.333% - 10px); min-width: 150px; max-width: 250px;">
                            <img src="${img}" style="width: 100%; height: auto; display: block; border: 1px solid #ddd; border-radius: 4px;" />
                          </div>`).join('')}
                        </div>
                      </div>` 
                    : '';
                  
                  // Get description HTML if any
                  const descriptionHtml = printDescription.trim()
                    ? `<div style="margin: 20px 0; padding: 15px; border: 2px solid #333; border-radius: 8px;">
                        <h3 style="margin: 0 0 10px 0; color: #000; font-size: 14px; text-transform: uppercase;">Print Instructions</h3>
                        <p style="margin: 0; color: #000; font-size: 13px; white-space: pre-wrap; line-height: 1.5;">${printDescription}</p>
                      </div>`
                    : '';
                  
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Job Order - ${selectedJO.joId || 'PENDING'}</title>
                        <style>
                          @media print {
                            @page { margin: 0.5in; }
                          }
                          body { 
                            font-family: Arial, sans-serif; 
                            padding: 30px; 
                            color: #000; 
                            background: #fff;
                            line-height: 1.5;
                          }
                          h1 { 
                            font-size: 24px; 
                            font-weight: bold; 
                            margin: 0 0 5px 0; 
                            text-align: center;
                            text-transform: uppercase;
                            letter-spacing: 2px;
                          }
                          h2 { 
                            font-size: 14px; 
                            margin: 0 0 25px 0; 
                            text-align: center;
                            color: #666;
                            font-weight: normal;
                            letter-spacing: 1px;
                          }
                          h3 {
                            font-size: 14px;
                            font-weight: bold;
                            margin: 0 0 10px 0;
                            text-transform: uppercase;
                            border-bottom: 2px solid #000;
                            padding-bottom: 5px;
                          }
                          .section {
                            margin: 20px 0;
                            padding: 15px;
                            border: 2px solid #333;
                            border-radius: 8px;
                            page-break-inside: avoid;
                          }
                          .grid-2 {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 20px;
                          }
                          .label {
                            font-size: 11px;
                            color: #666;
                            text-transform: uppercase;
                            margin-bottom: 5px;
                            font-weight: 600;
                          }
                          .value {
                            font-size: 14px;
                            color: #000;
                            font-weight: 600;
                          }
                          .value-large {
                            font-size: 16px;
                            font-weight: bold;
                          }
                          .footer {
                            margin-top: 30px;
                            padding-top: 20px;
                            border-top: 2px solid #000;
                            text-align: center;
                            font-size: 11px;
                            color: #666;
                          }
                          .priority-badge {
                            display: inline-block;
                            padding: 6px 16px;
                            border-radius: 20px;
                            font-size: 12px;
                            font-weight: bold;
                            text-transform: uppercase;
                            border: 2px solid;
                          }
                        </style>
                      </head>
                      <body>
                        <h1>PERSONALIZE ME</h1>
                        <h2>Job Order for Production</h2>
                        
                        <div class="section" style="background: #f9fafb;">
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <div>
                              <div class="label">JO ID</div>
                              <div class="value-large">${selectedJO.joId || 'PENDING'}</div>
                            </div>
                            <div>
                              <span class="priority-badge" style="color: ${selectedJO.isRush ? '#dc2626' : '#059669'}; border-color: ${selectedJO.isRush ? '#dc2626' : '#059669'}; background: ${selectedJO.isRush ? '#fef2f2' : '#f0fdf4'};">
                                ${selectedJO.isRush ? 'RUSH ORDER' : 'STANDARD'}
                              </span>
                            </div>
                          </div>
                          <div class="label">Target Completion Date</div>
                          <div class="value-large">${selectedJO.targetCompletion ? new Date(selectedJO.targetCompletion).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</div>
                        </div>
                        
                        <div class="section">
                          <h3>Customer Information</h3>
                          <div style="margin-top: 10px;">
                            <div class="label">Customer Name</div>
                            <div class="value-large">${selectedJO.customerName}</div>
                            <div style="margin-top: 10px;">
                              <div class="label">Contact Number</div>
                              <div class="value">${selectedJO.customerContact}</div>
                            </div>
                            <div style="margin-top: 10px;">
                              <div class="label">Email Address</div>
                              <div class="value">${selectedJO.customerEmail}</div>
                            </div>
                          </div>
                        </div>
                        
                        <div class="section" style="border-color: #d97706;">
                          <h3 style="color: #d97706; border-color: #d97706;">Product Specifications (For Production)</h3>
                          <div class="grid-2" style="margin-top: 15px;">
                            <div>
                              <div class="label">Product Name</div>
                              <div class="value-large">${selectedJO.productName}</div>
                            </div>
                            <div>
                              <div class="label">Category</div>
                              <div class="value">${selectedJO.category}</div>
                            </div>
                            <div>
                              <div class="label">Variant / Specs</div>
                              <div class="value-large">${selectedJO.variant || 'N/A'}</div>
                            </div>
                            <div>
                              <div class="label">Quantity to Produce</div>
                              <div class="value-large" style="color: #d97706; font-size: 20px;">${selectedJO.quantity} pcs</div>
                            </div>
                          </div>
                        </div>
                        
                        ${designImagesHtml}
                        ${descriptionHtml}
                        
                        <div class="footer">
                          <div><strong>Printed:</strong> ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                          <div style="margin-top: 8px;">Internal Production Document • For manufacturing use only</div>
                        </div>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                  setTimeout(() => {
                    printWindow.print();
                  }, 250);
                  setShowPrintModal(false);
                }}
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unpaid Warning Modal */}
      {showUnpaidWarning && (
        <div className="modal-overlay" onClick={() => setShowUnpaidWarning(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#facc15' }}>Unpaid Order Warning</h2>
              <button className="modal-close" onClick={() => setShowUnpaidWarning(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <div style={{ padding: '1rem', background: 'rgba(250, 204, 21, 0.1)', borderRadius: '8px', border: '1px solid rgba(250, 204, 21, 0.3)' }}>
                <p style={{ fontSize: '0.95rem', color: 'var(--white)', lineHeight: 1.6 }}>
                  <strong>Warning:</strong> Some selected orders are not yet paid. Pending orders must be paid before they can be moved to In Production.
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--gray)', marginTop: '0.75rem' }}>
                  Please collect payment (downpayment or full payment) before proceeding.
                </p>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowUnpaidWarning(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  // Proceed with status update despite unpaid warning
                  const { newStatus, selectedOrders: selectedSet } = pendingStatusUpdate;
                  try {
                    const updatePromises = Array.from(selectedSet).map(async (orderId) => {
                      const updatedOrder = { orderStatus: newStatus };
                      if (newStatus === 'For Delivery') {
                        updatedOrder.joStatus = 'Completed';
                      }
                      return await updateOrderApi(orderId, updatedOrder);
                    });

                    const updatedOrders = await Promise.all(updatePromises);
                    
                    // Update local state with API responses
                    setOrders(prev => prev.map(ord => {
                      if (selectedSet.has(ord.id)) {
                        const apiUpdated = updatedOrders.find(u => u.id === ord.id || u._id === ord.id);
                        return apiUpdated ? { ...ord, ...apiUpdated } : { ...ord, orderStatus: newStatus };
                      }
                      return ord;
                    }));
                  } catch (error) {
                    console.error('Failed to update order status:', error);
                    // Fallback: update local state optimistically
                    setOrders(prev => prev.map(ord => {
                      if (selectedSet.has(ord.id)) {
                        return { ...ord, orderStatus: newStatus };
                      }
                      return ord;
                    }));
                  }
                  setSelectedOrders(new Set());
                  setShowUnpaidWarning(false);
                  setPendingStatusUpdate(null);
                }}
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}

/**
 * =============================================================================
 * MONGODB SCHEMA REFERENCE
 * =============================================================================
 * 
 * // models/Order.js
 * const orderSchema = new mongoose.Schema({
 *   orderId: { type: String, required: true, unique: true }, // e.g., 'ORD-001'
 *   customer: {
 *     name: { type: String, required: true },
 *     contact: { type: String, required: true },
 *     email: { type: String, required: true }
 *   },
 *   product: {
 *     name: { type: String, required: true },
 *     category: { type: String, required: true },
 *     variant: String,
 *     unitPrice: { type: Number, required: true }
 *   },
 *   quantity: { type: Number, required: true },
 *   totalPrice: { type: Number, required: true },
 *   downPayment: { type: Number, default: 0 },
 *   balance: { type: Number, required: true },
 *   orderStatus: { 
 *     type: String, 
 *     enum: ['Pending', 'In Production', 'For Delivery', 'Delivered', 'Returned', 'Cancelled'],
 *     default: 'Pending'
 *   },
 *   joStatus: { 
 *     type: String, 
 *     enum: ['Queued', 'In Progress', 'Completed', null],
 *     default: null
 *   },
 *   isRush: { type: Boolean, default: false },
 *   targetCompletion: Date,
 *   paymentDate: Date,
 *   designFile: String, // URL or file path
 *   designNotes: String,
 *   checkoutRestricted: { type: Boolean, default: true },
 *   joId: String, // Job Order ID (e.g., 'JOB-001')
 * }, {
 *   timestamps: true // Adds createdAt and updatedAt automatically
 * });
 * 
 * // Indexes for performance
 * orderSchema.index({ createdAt: -1 });
 * orderSchema.index({ orderStatus: 1 });
 * orderSchema.index({ 'customer.name': 1 });
 * orderSchema.index({ joStatus: 1, orderStatus: 1 }); // For JO Schedule query
 * 
 * // Virtual for days left
 * orderSchema.virtual('daysLeft').get(function() {
 *   if (!this.targetCompletion) return null;
 *   return Math.ceil((this.targetCompletion - new Date()) / (1000 * 60 * 60 * 24));
 * });
 * 
 * // Methods
 * orderSchema.methods.canTransitionTo = function(newStatus) {
 *   const transitions = {
 *     'Pending': ['In Production', 'Cancelled'],
 *     'In Production': ['For Delivery', 'Cancelled'],
 *     'For Delivery': ['Delivered', 'Returned'],
 *     'Delivered': [],
 *     'Returned': [],
 *     'Cancelled': []
 *   };
 *   return transitions[this.orderStatus]?.includes(newStatus) || false;
 * };
 * 
 * =============================================================================
 */