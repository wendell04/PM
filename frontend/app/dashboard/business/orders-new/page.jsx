"use client";

/**
 * ORDERS PAGE (New Version)
 *
 * ProfitPulse-style order management
 * - Clean list view with right-side detail panel
 * - Integrated with BOM -> Job Order workflow
 * - Payment tracking
 * - QC integration
 *
 * Located at: /dashboard/business/orders-new
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import OrderDetailPanel from './OrderDetailPanel';
import CreateJOModal from './CreateJOModal';
import QCModal from './QCModal';
import { OrderStatusBadge, PaymentStatusBadge } from './OrderStatusBadge';

// ── Dummy Data (until backend is ready) ────────────────────────────────────────
const DUMMY_ORDERS = [
  {
    id: 'ORD-2026-001',
    customerName: 'Juan Dela Cruz',
    customerEmail: 'juan@email.com',
    status: 'processing',
    totalAmount: 2500,
    downPayment: 1250,
    totalPaid: 1250,
    createdAt: '2026-04-10T14:00:00',
    items: [
      { productName: 'Custom Ceramic Mug 11oz', qty: 10, unitPrice: 150, total: 1500 },
      { productName: 'Magic Mug Black 15oz', qty: 5, unitPrice: 200, total: 1000 },
    ],
    jobOrder: null,
    notes: 'Custom name printing on all mugs',
  },
  {
    id: 'ORD-2026-002',
    customerName: 'Maria Santos',
    customerEmail: 'maria@email.com',
    status: 'pending_payment',
    totalAmount: 1800,
    downPayment: 900,
    totalPaid: 900,
    createdAt: '2026-04-11T10:30:00',
    items: [
      { productName: 'Canvas Totebag', qty: 20, unitPrice: 90, total: 1800 },
    ],
    jobOrder: null,
    notes: '',
  },
  {
    id: 'ORD-2026-003',
    customerName: 'Pedro Reyes',
    customerEmail: 'pedro@email.com',
    status: 'quality_check',
    totalAmount: 3200,
    downPayment: 3200,
    totalPaid: 3200,
    createdAt: '2026-04-08T09:15:00',
    items: [
      { productName: 'Sticker Pack A4', qty: 50, unitPrice: 40, total: 2000 },
      { productName: 'Custom Ceramic Mug 11oz', qty: 8, unitPrice: 150, total: 1200 },
    ],
    jobOrder: {
      id: 'JO-2026-045',
      status: 'qc_pending',
      targetCompletion: '2026-04-15',
    },
    notes: 'Rush order',
  },
  {
    id: 'ORD-2026-004',
    customerName: 'Ana Garcia',
    customerEmail: 'ana@email.com',
    status: 'ready_for_delivery',
    totalAmount: 1500,
    downPayment: 1500,
    totalPaid: 1500,
    createdAt: '2026-04-05T16:00:00',
    items: [
      { productName: 'Custom Ceramic Mug 11oz', qty: 10, unitPrice: 150, total: 1500 },
    ],
    jobOrder: {
      id: 'JO-2026-042',
      status: 'completed',
      targetCompletion: '2026-04-12',
    },
    notes: '',
  },
  {
    id: 'ORD-2026-005',
    customerName: 'Luis Fernandez',
    customerEmail: 'luis@email.com',
    status: 'delivered',
    totalAmount: 4500,
    downPayment: 4500,
    totalPaid: 4500,
    createdAt: '2026-04-01T11:00:00',
    items: [
      { productName: 'Magic Mug Black 15oz', qty: 15, unitPrice: 200, total: 3000 },
      { productName: 'Canvas Totebag', qty: 10, unitPrice: 90, total: 900 },
      { productName: 'Sticker Pack A4', qty: 15, unitPrice: 40, total: 600 },
    ],
    jobOrder: {
      id: 'JO-2026-038',
      status: 'completed',
      targetCompletion: '2026-04-08',
    },
    notes: 'Corporate order',
  },
  {
    id: 'ORD-2026-006',
    customerName: 'Sofia Cruz',
    customerEmail: 'sofia@email.com',
    status: 'awaiting_payment',
    totalAmount: 2000,
    downPayment: 1000,
    totalPaid: 1000,
    createdAt: '2026-04-09T13:00:00',
    items: [
      { productName: 'Custom Ceramic Mug 11oz', qty: 10, unitPrice: 150, total: 1500 },
      { productName: 'Sticker Pack A4', qty: 12, unitPrice: 40, total: 480 },
    ],
    jobOrder: {
      id: 'JO-2026-044',
      status: 'qc_passed',
      targetCompletion: '2026-04-14',
    },
    notes: 'Balance payment needed before delivery',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatPeso(amount) {
  if (amount == null || amount === 0) return '—';
  return `P${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function getPaymentStatus(order) {
  const total = order.totalAmount || order.total || 0;
  const paid = order.totalPaid || order.downPayment || 0;
  if (paid <= 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function OrdersNewPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState(DUMMY_ORDERS);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showCreateJO, setShowCreateJO] = useState(false);
  const [showQC, setShowQC] = useState(false);
  const [targetOrder, setTargetOrder] = useState(null);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !search ||
        o.id?.toLowerCase().includes(search.toLowerCase()) ||
        o.customerName?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'All' || o.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [orders, search, filterStatus]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const handleCreateJO = (order) => {
    setTargetOrder(order);
    setShowCreateJO(true);
  };

  const handleSubmitJO = (payload) => {
    // TODO: API call to create job order
    console.log('Creating JO:', payload);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === targetOrder?.id
          ? {
              ...o,
              jobOrder: { id: 'JO-NEW', status: 'queued', targetCompletion: payload.targetCompletion },
              status: 'processing',
            }
          : o
      )
    );
    setShowCreateJO(false);
    setTargetOrder(null);
  };

  const handleSubmitQC = (payload) => {
    // TODO: API call to submit QC result
    console.log('QC Result:', payload);
    if (payload.result === 'passed') {
      const order = orders.find((o) => o.id === targetOrder?.id);
      const isFullyPaid = (order?.totalPaid || 0) >= (order?.totalAmount || 0);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === targetOrder?.id
            ? {
                ...o,
                status: isFullyPaid ? 'ready_for_delivery' : 'awaiting_payment',
                jobOrder: { ...o.jobOrder, status: 'qc_passed' },
              }
            : o
        )
      );
    } else {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === targetOrder?.id
            ? { ...o, jobOrder: { ...o.jobOrder, status: 'qc_failed' } }
            : o
        )
      );
    }
    setShowQC(false);
    setTargetOrder(null);
  };

  const handleRecordPayment = (order) => {
    // TODO: Open payment modal
    console.log('Record payment for:', order.id);
    // Simulate full payment
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              totalPaid: o.totalAmount,
              downPayment: o.totalAmount,
              status: o.status === 'awaiting_payment' ? 'ready_for_delivery' : o.status,
            }
          : o
      )
    );
  };

  // Stats
  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === 'pending_payment').length;
    const processing = orders.filter((o) => o.status === 'processing').length;
    const qc = orders.filter((o) => o.status === 'quality_check').length;
    const ready = orders.filter((o) => o.status === 'ready_for_delivery' || o.status === 'awaiting_payment').length;
    const delivered = orders.filter((o) => o.status === 'delivered').length;
    const revenue = orders.reduce((s, o) => s + (o.totalPaid || 0), 0);
    return { total, pending, processing, qc, ready, delivered, revenue };
  }, [orders]);

  return (
    <div className="page-content-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Orders</h1>
            <p className="page-subtitle">
              Manage customer orders, production, and delivery.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        {[
          { label: 'Total Orders', value: stats.total, color: '#E5E2E1' },
          { label: 'Pending Payment', value: stats.pending, color: '#f59e0b' },
          { label: 'Processing', value: stats.processing, color: '#3b82f6' },
          { label: 'QC Check', value: stats.qc, color: '#8b5cf6' },
          { label: 'Ready', value: stats.ready, color: '#22c55e' },
          { label: 'Delivered', value: stats.delivered, color: '#9ca3af' },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '10px',
              padding: '1rem',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: card.color }}>
              {card.value}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, maxWidth: '300px', position: 'relative' }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6b7280"
            strokeWidth="2"
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 0.75rem 0.625rem 2.25rem',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#E5E2E1',
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#E5E2E1',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        >
          {['All', 'pending_payment', 'processing', 'quality_check', 'ready_for_delivery', 'awaiting_payment', 'delivered', 'cancelled'].map(
            (s) => (
              <option key={s} value={s} style={{ background: '#1a1a1a' }}>
                {s === 'All' ? 'All Status' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            )
          )}
        </select>
      </div>

      {/* Orders Table */}
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          overflow: 'hidden',
          background: 'var(--dark)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
              {['Order', 'Customer', 'Status', 'Payment', 'Total', 'Date', 'Actions'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '0.75rem 1rem',
                    textAlign: h === 'Total' ? 'right' : 'left',
                    color: '#9ca3af',
                    fontWeight: 700,
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                  No orders found.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedOrderId(order.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>
                      {order.id}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: '#E5E2E1' }}>{order.customerName}</div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{order.customerEmail}</div>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <OrderStatusBadge status={order.status} size="sm" />
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <PaymentStatusBadge paymentStatus={getPaymentStatus(order)} size="sm" />
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>
                      {formatPeso(order.totalAmount || order.total)}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                    {formatDate(order.createdAt)}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {!order.jobOrder && order.status !== 'delivered' && order.status !== 'cancelled' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateJO(order);
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: 'rgba(212,168,67,0.15)',
                            border: '1px solid rgba(212,168,67,0.3)',
                            borderRadius: '4px',
                            color: '#D4A843',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Create JO
                        </button>
                      )}
                      {order.jobOrder?.status === 'qc_pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTargetOrder(order);
                            setShowQC(true);
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: 'rgba(139,92,246,0.15)',
                            border: '1px solid rgba(139,92,246,0.3)',
                            borderRadius: '4px',
                            color: '#8b5cf6',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          QC
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Right Detail Panel */}
      {selectedOrder && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 999,
            }}
            onClick={() => setSelectedOrderId(null)}
          />
          <OrderDetailPanel
            order={selectedOrder}
            onClose={() => setSelectedOrderId(null)}
            onCreateJO={handleCreateJO}
            onRecordPayment={handleRecordPayment}
          />
        </>
      )}

      {/* Create JO Modal */}
      {showCreateJO && (
        <CreateJOModal
          order={targetOrder}
          materials={[]}
          onClose={() => {
            setShowCreateJO(false);
            setTargetOrder(null);
          }}
          onSubmit={handleSubmitJO}
        />
      )}

      {/* QC Modal */}
      {showQC && (
        <QCModal
          order={targetOrder}
          onClose={() => {
            setShowQC(false);
            setTargetOrder(null);
          }}
          onSubmit={handleSubmitQC}
        />
      )}
    </div>
  );
}
