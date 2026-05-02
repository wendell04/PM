/**
 * Orders Admin Page
 * Connects to backend API via ordersApi.js
 */

'use client';

import ErrorBoundary from '../../../../components/ErrorBoundary';
import dynamic from 'next/dynamic';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllOrdersNew, updateOrder as updateOrderApi, updateJobOrderStatus, deleteOrder as deleteOrderApi } from '@/lib/ordersApi';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { getStatusBadge } from '@/lib/utils/orderHelpers';
import CustomDropdown from '@/app/components/CustomDropdown';

const OrderQuickViewModal = dynamic(
  () => import('@/components/orders/OrderQuickViewModal'),
  { ssr: false },
);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [2025, 2026, 2027, 2028];
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function OrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [dateFilter, setDateFilter] = useState('this-month'); // 'today', 'this-week', 'this-month', 'custom'
  const [customDateRange, setCustomDateRange] = useState({ fromMonth: 0, toMonth: 0, year: 2025 });
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [showJOQueuing, setShowJOQueuing] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedJO, setSelectedJO] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Print modal form state
  const [printDescription, setPrintDescription] = useState('');
  const [printDesignImages, setPrintDesignImages] = useState([]); // Multiple images
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const skipPollRef = useRef(false);
  const ORDERS_PAGE_SIZE = 500;

  // Order Quick View Modal state
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null); // full order object
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);

  // Extract fetch orders logic into named function (paginated; poll skips after "Load more")
  const fetchOrders = useCallback(
    async () => {
      setIsRefreshing(true);
      skipPollRef.current = false;
      setLoadError('');
      try {
        const data = await fetchAllOrdersNew(token, { page: 1, limit: ORDERS_PAGE_SIZE });
        setOrders(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load orders:', error);
        setLoadError('Failed to load orders. Please refresh the page.');
        setOrders([]);
      } finally {
        setIsRefreshing(false);
      }
    },
    [token],
  );

  // Load orders from API on mount
  useEffect(() => {
    if (!token) return;
    fetchOrders();
  }, [token, fetchOrders]);

  // Auto-refresh every 30s
  const pollRef = useRef(null);
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => {
      if (!isRefreshing && !skipPollRef.current) {
        fetchOrders();
      }
    }, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, isRefreshing, fetchOrders]);

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

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = sorted.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const getPaymentBadge = (status) => {
    if (status === 'paid')    return { label: 'Paid',    color: 'var(--green)', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)'  };
    if (status === 'partial') return { label: 'Partial', color: 'var(--gold)', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.3)' };
    return                           { label: 'Unpaid',  color: 'var(--red)', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' };
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
          <div className="summary-card">
            <div className="summary-content">
              <span className="summary-value">{pendingOrders}</span>
              <span className="summary-label">Pending</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-content">
              <span className="summary-value">{inProduction}</span>
              <span className="summary-label">In Production</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-content">
              <span className="summary-value">{forDelivery}</span>
              <span className="summary-label">For Delivery</span>
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

      {isRefreshing && (
        <div className="text-sm text-gray-500" style={{ marginBottom: '0.5rem' }}>
          Refreshing...
        </div>
      )}

      {/* Table card — filter + table + pagination inside one container */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: '10px',
        overflow: 'hidden',
        marginBottom: '1rem',
      }}>
        {/* Filters toolbar */}
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrapper" style={{ flex: '1', minWidth: '180px', maxWidth: '280px' }}>
            <span className="search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
            <input className="search-input" placeholder="Search orders..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <CustomDropdown
              value={filterStatus}
              onChange={v => { setFilterStatus(v); setCurrentPage(1); }}
              options={[
                'All','Pending','In Production','For Delivery','Delivered','Returned','Cancelled',
                'pending_design','proof_sent','revision_requested','design_approved','awaiting_production','in_production','ready_for_pickup','shipped',
              ].map(s => ({ value: s, label: s }))}
              style={{ minWidth: '150px' }}
            />

            <CustomDropdown
              value={dateFilter}
              onChange={v => setDateFilter(v)}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'this-week', label: 'This Week' },
                { value: 'this-month', label: 'This Month' },
                { value: 'custom', label: 'Custom Range' },
              ]}
              style={{ minWidth: '130px' }}
            />

            {dateFilter === 'custom' && (
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <CustomDropdown
                  value={String(customDateRange.fromMonth)}
                  onChange={v => setCustomDateRange(prev => ({ ...prev, fromMonth: parseInt(v) }))}
                  options={MONTHS.map((m, i) => ({ value: String(i), label: m }))}
                  style={{ minWidth: '110px' }}
                />
                <span style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>to</span>
                <CustomDropdown
                  value={String(customDateRange.toMonth)}
                  onChange={v => setCustomDateRange(prev => ({ ...prev, toMonth: parseInt(v) }))}
                  options={MONTHS.map((m, i) => ({ value: String(i), label: m }))}
                  style={{ minWidth: '110px' }}
                />
                <CustomDropdown
                  value={String(customDateRange.year)}
                  onChange={v => setCustomDateRange(prev => ({ ...prev, year: parseInt(v) }))}
                  options={YEARS.map(y => ({ value: String(y), label: String(y) }))}
                  style={{ minWidth: '90px' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Table */}
      <div style={{
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--gold) var(--dark2)',
        width: '0',
        minWidth: '100%',
        display: 'block',
        overflowX: 'auto',
      }}>
        {loadError && (
          <div className="text-red-500 text-sm" style={{ marginBottom: '1rem' }}>
            {loadError}
          </div>
        )}
        <table className="inventory-table" style={{ fontFamily: 'inherit' }}>
          <thead>
            <tr>
              <th style={{ width: '28px' }}></th>
              <th className="table-header" style={{ whiteSpace: 'nowrap' }}>Order Ref #</th>
              <th className="table-col-category">Product Type</th>
              <th className="table-col-category">Customer</th>
              <th className="table-col-stock">Product</th>
              <th className="table-col-min" style={{ textAlign: 'center' }}>Qty</th>
              <th className="table-col-min">Total</th>
              <th className="table-col-status">Status</th>
              <th className="table-col-min">Date</th>
              <th style={{ width: '90px' }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10}>
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
              paginated.map(o => {
                const deliveredPaid = o.orderStatus === 'Delivered' && o.paymentStatus === 'paid';
                const rawBadge = getStatusBadge(o.orderStatus);
                const statusBadge = deliveredPaid
                  ? { ...rawBadge, color: '#4ade80', bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.4)' }
                  : rawBadge;
                const isExpanded = expandedIds.has(o.id);

                return (
                  <React.Fragment key={o.id}>
                    <tr className="inventory-table-row">
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
                      <td className="table-cell" style={{
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        color: 'var(--gold)',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}>
                        #{String(o.id ?? o._id ?? '').slice(-8).toUpperCase()}
                      </td>
                      <td className="table-cell">
                        {o.isCustom ? (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', whiteSpace: 'nowrap' }}>
                            Customized
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', whiteSpace: 'nowrap' }}>
                            Ready Made
                          </span>
                        )}
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
                        <div style={{ color: 'var(--gold)', fontSize: '1rem', fontWeight: 600 }}>₱{Number(o.totalAmount ?? o.totalPrice ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        {(() => {
                          const pb = getPaymentBadge(o.paymentStatus);
                          return (
                            <span style={{
                              display: 'inline-block',
                              marginTop: '0.25rem',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              padding: '0.1rem 0.45rem',
                              borderRadius: '10px',
                              color: pb.color,
                              background: pb.bg,
                              border: `1px solid ${pb.border}`,
                            }}>
                              {pb.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="table-cell">
                        <span className="stock-status-badge" style={{ color: statusBadge.color, background: statusBadge.bg, borderColor: statusBadge.border }}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="table-cell" style={{ fontSize: '0.72rem', color: 'var(--gray)', whiteSpace: 'nowrap' }}>
                        {o.createdAt ? new Date(o.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                      </td>
                      <td className="table-cell" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', justifyContent: 'center' }}>
                          <button
                            onClick={() => {
                              setSelectedOrderId(o.id);
                              setIsModalOpen(true);
                            }}
                            style={{
                              padding: '0.25rem 0.625rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                              border: '1px solid var(--gold)',
                              borderRadius: '4px',
                              color: 'var(--gold)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            View
                          </button>
                          {['Cancelled', 'Delivered', 'Returned'].includes(o.orderStatus) && (
                            <button
                              onClick={() => { setDeleteTargetId(o.id); setDeleteError(''); }}
                              title="Delete order"
                              style={{
                                padding: '0.25rem 0.375rem',
                                background: 'transparent',
                                border: '1px solid rgba(248,113,113,0.4)',
                                borderRadius: '4px',
                                color: 'var(--red)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}>
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
                                  <div style={{ color: o.isRush ? 'var(--orange)' : 'var(--white)', fontWeight: 600 }}>{o.isRush ? 'Rush' : 'Standard'}</div>
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
                                          <div style={{ color: 'var(--red)', fontWeight: 600 }}>Priority</div>
                                          <div style={{ color: 'var(--red)', fontSize: '0.75rem', fontWeight: 600 }}>{daysLate} day{daysLate !== 1 ? 's' : ''} late</div>
                                        </>
                                      );
                                    }
                                    return (
                                      <>
                                        <div style={{ color: o.joStatus === 'In Progress' ? 'var(--indigo)' : 'var(--gold)', fontWeight: 600 }}>{o.joStatus || 'Queued'}</div>
                                        <div style={{ color: 'var(--gray)', fontSize: '0.75rem', fontWeight: 600 }}>{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</div>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                            
                            {/* Payment Breakdown */}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Payment</div>
                                {!['Delivered','Cancelled','Returned'].includes(o.orderStatus) && (
                                  <button
                                    onClick={() => {
                                      setPaymentTarget(o);
                                      setPaymentAmount('');
                                      setPaymentMethod('cash');
                                      setPaymentNote('');
                                      setPaymentError('');
                                      setShowPaymentModal(true);
                                    }}
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '0.2rem 0.5rem',
                                      background: 'rgba(250,204,21,0.12)',
                                      border: '1px solid rgba(250,204,21,0.4)',
                                      borderRadius: '4px',
                                      color: 'var(--gold)',
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                    }}
                                  >
                                    + Record Payment
                                  </button>
                                )}
                              </div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.7 }}>
                                {Number(o.discountAmount) > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--gray)' }}>Subtotal</span>
                                    <span style={{ color: 'var(--gold)', fontWeight: 600 }}>₱{(Number(o.totalAmount ?? o.totalPrice ?? 0) + Number(o.discountAmount ?? 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                                {Number(o.discountAmount) > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--green)' }}>Voucher{o.voucherCode ? ` (${o.voucherCode})` : ''}</span>
                                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>−₱{Number(o.discountAmount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                                {Number(o.shippingFee) > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--gray)' }}>Shipping</span>
                                    <span style={{ color: 'var(--gold)', fontWeight: 600 }}>₱{Number(o.shippingFee).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--gray)' }}>Total</span>
                                  <span style={{ color: 'var(--gold)', fontWeight: 600 }}>₱{Number(o.totalAmount ?? o.totalPrice ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--gray)' }}>Paid</span>
                                  <span style={{ color: 'var(--gold)', fontWeight: 600 }}>₱{Number(o.downPayment ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--gray)' }}>Balance</span>
                                  <span style={{ color: (o.balance ?? 0) <= 0 ? 'var(--green)' : 'var(--gold)', fontWeight: 600 }}>₱{Number(o.balance ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                {Array.isArray(o.paymentHistory) && o.paymentHistory.length > 0 && (
                                  <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>History</div>
                                    {o.paymentHistory.map((p, idx) => (
                                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.2rem' }}>
                                        <span style={{ color: 'var(--gray)' }}>{p.method} {p.note ? `| ${p.note}` : ''}</span>
                                        <span style={{ color: 'var(--green)', fontWeight: 600 }}>+₱{Number(p.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
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

      {/* Pagination — inside card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1rem', borderTop: '1px solid var(--border)', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--gray)' }}>
          <span>Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            style={{ padding: '0.2rem 0.4rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--white)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--gray)' }}>
          <span>{sorted.length === 0 ? '0' : `${(safePage - 1) * rowsPerPage + 1}–${Math.min(safePage * rowsPerPage, sorted.length)}`} of {sorted.length}</span>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            style={{ padding: '0.25rem 0.5rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '4px', color: safePage <= 1 ? 'var(--gray)' : 'var(--white)', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
          >‹</button>
          <span style={{ color: 'var(--white)', fontWeight: 600 }}>{safePage} / {totalPages}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            style={{ padding: '0.25rem 0.5rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '4px', color: safePage >= totalPages ? 'var(--gray)' : 'var(--white)', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
          >›</button>
        </div>
      </div>

      </div>{/* end table card */}

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
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--red)' }}></div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>Delayed</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--orange)' }}></div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>Rush Order</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--gold)' }}></div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>Near Deadline</span>
                </div>
              </div>

              {/* JO Cards - Sorted by priority (Delayed first, then Rush, then by deadline) */}
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
                    const priorityColor = isDelayed ? 'var(--red)' : (o.isRush ? 'var(--orange)' : (isUrgent ? 'var(--gold)' : 'transparent'));
                    const priorityTextColor = isDelayed ? 'var(--red)' : (o.isRush ? 'var(--orange)' : (isUrgent ? 'var(--gold)' : 'var(--white)'));
                    const statusColor = o.joStatus === 'In Progress' ? 'var(--indigo)' : 'var(--gold)';

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
                              <span style={{ color: 'var(--red)', fontWeight: 700 }}>DELAYED</span>
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
                            <div style={{ fontSize: '0.75rem', color: isDelayed ? 'var(--red)' : (daysLeft <= 2 ? 'var(--red)' : 'var(--gray)') }}>
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
                              : (statusColor === 'var(--indigo)' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(250, 204, 21, 0.2)'),
                            color: isDelayed ? 'var(--red)' : statusColor,
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
                                onClick={async () => {
                                  if (!o.joId) return;
                                  try {
                                    await updateJobOrderStatus(o.joId, 'In Progress', token);
                                  } catch (err) {
                                    setLoadError(err.message || 'Failed to start job order. Please try again.');
                                    return;
                                  }
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
                    color: selectedJO.isRush ? 'var(--red)' : '#10b981',
                    borderColor: selectedJO.isRush ? 'var(--red)' : '#10b981',
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
                <div style={{ fontSize: '0.72rem', color: 'var(--gold-dark)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 600, borderBottom: '2px solid var(--gold-dark)', paddingBottom: '0.5rem' }}>Product Specifications (For Production)</div>
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
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold-dark)' }}>{selectedJO.quantity} pcs</div>
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
                                  background: 'var(--red)',
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
                            color: 'var(--red)',
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
                  const escHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
                  const printWindow = window.open('', '', 'width=800,height=600');
                  
                  // Get design images HTML if any - FLEXIBLE (maintains original aspect ratio)
                  const designImagesHtml = printDesignImages.length > 0 
                    ? `<div style="margin: 20px 0; padding: 15px; border: 2px solid #333; border-radius: 8px; page-break-inside: avoid;">
                        <h3 style="margin: 0 0 15px 0; color: #000; font-size: 14px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 5px;">Design References (${printDesignImages.length} image${printDesignImages.length > 1 ? 's' : ''})</h3>
                        <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-start;">
                          ${printDesignImages.map(img => `<div style="flex: 0 1 auto; width: calc(33.333% - 10px); min-width: 150px; max-width: 250px;">
                            <img src="${img}" alt="" style="width: 100%; height: auto; display: block; border: 1px solid #ddd; border-radius: 4px;" />
                          </div>`).join('')}
                        </div>
                      </div>` 
                    : '';
                  
                  // Get description HTML if any
                  const descriptionHtml = printDescription.trim()
                    ? `<div style="margin: 20px 0; padding: 15px; border: 2px solid #333; border-radius: 8px;">
                        <h3 style="margin: 0 0 10px 0; color: #000; font-size: 14px; text-transform: uppercase;">Print Instructions</h3>
                        <p style="margin: 0; color: #000; font-size: 13px; white-space: pre-wrap; line-height: 1.5;">${escHtml(printDescription)}</p>
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
                        
                        <div class="section" style="border-color: var(--gold-dark);">
                          <h3 style="color: var(--gold-dark); border-color: var(--gold-dark);">Product Specifications (For Production)</h3>
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
                              <div class="value-large" style="color: var(--gold-dark); font-size: 20px;">${selectedJO.quantity} pcs</div>
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

      {/* Delete Confirm Modal */}
      {deleteTargetId && (
        <div className="modal-overlay" onClick={() => { setDeleteTargetId(null); setDeleteError(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--red)' }}>Delete Order</h2>
              <button className="modal-close" onClick={() => { setDeleteTargetId(null); setDeleteError(''); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.95rem', color: 'var(--white)', lineHeight: 1.6 }}>
                Permanently delete order <span style={{ fontFamily: 'monospace', color: 'var(--gold)' }}>#{String(deleteTargetId).slice(-8).toUpperCase()}</span>? This cannot be undone.
              </p>
              {deleteError && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--red)' }}>{deleteError}</p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => { setDeleteTargetId(null); setDeleteError(''); }} disabled={isDeleting}>
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                style={{ padding: '0.5rem 1.25rem', background: isDeleting ? 'var(--border)' : 'var(--red)', border: 'none', borderRadius: '6px', color: isDeleting ? 'var(--gray)' : '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}
                onClick={async () => {
                  setIsDeleting(true);
                  setDeleteError('');
                  try {
                    await deleteOrderApi(deleteTargetId, token);
                    setOrders(prev => prev.filter(o => o.id !== deleteTargetId));
                    setDeleteTargetId(null);
                  } catch (err) {
                    setDeleteError(err.message || 'Failed to delete order.');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* [removed bulk-select modals] */}
      {false && (
        <div className="modal-overlay" onClick={() => { setShowUnpaidWarning(false); setPendingStatusUpdate(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--gold)' }}>Downpayment Required</h2>
              <button className="modal-close" onClick={() => { setShowUnpaidWarning(false); setPendingStatusUpdate(null); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <p style={{ fontSize: '0.95rem', color: 'var(--white)', lineHeight: 1.6 }}>
                  <strong>Cannot proceed:</strong> One or more selected orders have no downpayment recorded. All custom orders require at least a partial payment before production can begin.
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--gray)', marginTop: '0.75rem' }}>
                  Please collect and record a downpayment for the affected orders, then try again.
                </p>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => { setShowUnpaidWarning(false); setPendingStatusUpdate(null); }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEPRECATED — Courier Modal (removed; status updates go through View modal) */}
      {false && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--gold)' }}>Assign Courier</h2>
              <button className="modal-close" onClick={() => { setShowCourierModal(false); setPendingDeliveryOrders(null); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.875rem', color: 'var(--gray)', display: 'block', marginBottom: '0.5rem' }}>
                  Courier <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <select
                  value={courierName}
                  onChange={e => { setCourierName(e.target.value); setCourierError(''); }}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    background: 'var(--dark2)',
                    border: `1px solid ${courierError ? 'var(--red)' : 'var(--border)'}`,
                    borderRadius: '6px',
                    color: 'var(--white)',
                    fontSize: '0.95rem',
                  }}
                >
                  <option value="">Select courier...</option>
                  <option value="J&T Express">J&T Express</option>
                  <option value="Ninja Van">Ninja Van</option>
                  <option value="Lalamove">Lalamove</option>
                  <option value="Grab Express">Grab Express</option>
                  <option value="LBC">LBC</option>
                  <option value="Other">Other</option>
                </select>
                {courierError && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--red)', marginTop: '0.375rem' }}>{courierError}</p>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.875rem', color: 'var(--gray)', display: 'block', marginBottom: '0.5rem' }}>
                  Tracking Number <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={e => setTrackingNumber(e.target.value)}
                  placeholder="e.g. JT1234567890"
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    background: 'var(--dark2)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--white)',
                    fontSize: '0.95rem',
                  }}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowCourierModal(false); setPendingDeliveryOrders(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.6 : 1 }}
                onClick={async () => {
                  if (!courierName) {
                    setCourierError('Please select a courier before proceeding.');
                    return;
                  }
                  if (isSubmitting) return;
                  setIsSubmitting(true);
                  try {
                    const updatePromises = Array.from(pendingDeliveryOrders).map(async (orderId) => {
                      const res = await fetchWithTimeout(`${API_URL}/api/orders/${orderId}/status`, {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          orderStatus: 'For Delivery',
                          courierName,
                          trackingNumber: trackingNumber || null,
                        }),
                      }, 15000);
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.message || err.error || 'Failed to update order');
                      }
                      const data = await res.json();
                      const orderObj = orders.find(o => o.id === orderId || o._id === orderId);
                      if (orderObj?.joId) {
                        await updateJobOrderStatus(orderObj.joId, 'Completed', token);
                      }
                      return data.order;
                    });
                    const updatedOrders = await Promise.all(updatePromises);
                    setOrders(prev => prev.map(ord => {
                      if (pendingDeliveryOrders.has(ord.id)) {
                        const apiUpdated = updatedOrders.find(u => u && (u._id === ord.id || u.id === ord.id));
                        return apiUpdated ? { ...ord, ...apiUpdated, id: ord.id } : { ...ord, orderStatus: 'For Delivery', courierName, trackingNumber: trackingNumber || null };
                      }
                      return ord;
                    }));
                    setSelectedOrders(new Set());
                    setShowCourierModal(false);
                    setPendingDeliveryOrders(null);
                  } catch (error) {
                    console.error('Failed to assign courier:', error);
                    setOrders(prev => prev.map(ord => {
                      if (pendingDeliveryOrders.has(ord.id)) {
                        return { ...ord, orderStatus: 'For Delivery', courierName, trackingNumber: trackingNumber || null };
                      }
                      return ord;
                    }));
                    setSelectedOrders(new Set());
                    setShowCourierModal(false);
                    setPendingDeliveryOrders(null);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                {isSubmitting ? 'Updating...' : 'Confirm & Send for Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && paymentTarget && (
        <div className="modal-overlay" onClick={() => { setShowPaymentModal(false); setPaymentTarget(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--gold)' }}>Record Payment</h2>
              <button className="modal-close" onClick={() => { setShowPaymentModal(false); setPaymentTarget(null); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Order summary */}
              <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.82rem' }}>
                <div style={{ color: 'var(--gray)', marginBottom: '0.25rem', fontFamily: 'monospace' }}>{paymentTarget.id}</div>
                <div style={{ color: 'var(--white)', fontWeight: 600 }}>{paymentTarget.customerName}</div>
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                  <div>
                    <span style={{ color: 'var(--gray)' }}>Total </span>
                    <span style={{ color: 'var(--gold)', fontWeight: 600 }}>₱{Number(paymentTarget.totalAmount ?? paymentTarget.totalPrice ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--gray)' }}>Balance </span>
                    <span style={{ color: 'var(--gold)', fontWeight: 600 }}>₱{Number(paymentTarget.balance ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Amount <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paymentAmount}
                  onChange={e => { setPaymentAmount(e.target.value); setPaymentError(''); }}
                  onKeyDown={e => { if (['e','E','+','-'].includes(e.key)) e.preventDefault(); }}
                  placeholder="e.g. 500"
                  style={{
                    width: '100%', padding: '0.625rem 0.875rem',
                    background: 'var(--dark2)',
                    border: `1px solid ${paymentError ? 'var(--red)' : 'var(--border)'}`,
                    borderRadius: '8px', color: 'var(--white)',
                    fontSize: '0.875rem', boxSizing: 'border-box',
                  }}
                />
                {paymentError && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: '0.375rem' }}>{paymentError}</p>
                )}
              </div>

              {/* Method */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Method <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  style={{
                    width: '100%', padding: '0.625rem 0.75rem',
                    background: 'var(--dark2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px', color: 'var(--white)',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="cash" style={{ background: 'var(--dark)' }}>Cash</option>
                  <option value="gcash" style={{ background: 'var(--dark)' }}>GCash</option>
                  <option value="bank_transfer" style={{ background: 'var(--dark)' }}>Bank Transfer</option>
                  <option value="cod" style={{ background: 'var(--dark)' }}>COD</option>
                </select>
              </div>

              {/* Note */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Note <span style={{ color: 'var(--gray)', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  placeholder="e.g. Downpayment, reference #12345"
                  style={{
                    width: '100%', padding: '0.625rem 0.875rem',
                    background: 'var(--dark2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px', color: 'var(--white)',
                    fontSize: '0.875rem', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowPaymentModal(false); setPaymentTarget(null); }}
                disabled={isPaymentSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={isPaymentSubmitting}
                style={{ opacity: isPaymentSubmitting ? 0.6 : 1 }}
                onClick={async () => {
                  const amt = parseFloat(paymentAmount);
                  if (!paymentAmount || isNaN(amt) || amt <= 0) {
                    setPaymentError('Please enter a valid amount greater than 0.');
                    return;
                  }
                  if (isPaymentSubmitting) return;
                  setIsPaymentSubmitting(true);
                  try {
                    const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${paymentTarget.id}/record-payment`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        amount: amt,
                        method: paymentMethod,
                        note: paymentNote || null,
                      }),
                    }, 15000);
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      setPaymentError(err.error || err.message || 'Failed to record payment.');
                      return;
                    }
                    const data = await res.json();
                    const updated = data.order ?? data.data ?? null;
                    setOrders(prev => prev.map(ord =>
                      ord.id === paymentTarget.id
                        ? { ...ord, ...(updated ?? {}), id: ord.id }
                        : ord
                    ));
                    setShowPaymentModal(false);
                    setPaymentTarget(null);
                  } catch {
                    setPaymentError('Network error. Please try again.');
                  } finally {
                    setIsPaymentSubmitting(false);
                  }
                }}
              >
                {isPaymentSubmitting ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Quick View Modal */}
      <OrderQuickViewModal
        orderId={selectedOrderId}
        mode="admin"
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedOrderId(null);
        }}
        onStatusUpdated={fetchOrders}
        onOrderDeleted={(id) => {
          setOrders(prev => prev.filter(o => o.id !== id));
          setIsModalOpen(false);
          setSelectedOrderId(null);
        }}
      />
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