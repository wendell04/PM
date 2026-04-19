"use client";

/**
 * ORDERS PREVIEW — Main Page
 * 
 * ACCESS: /dashboard/business/orders-preview
 * 
 * Shows the complete order management workflow with:
 * - Pipeline overview stats
 * - Order list with status badges
 * - Right panel with order details + timeline
 * - Create JO modal with BOM check
 * - Design file viewer
 * - Payment tracker
 * 
 * All data is MOCK — for preview purposes only.
 */

import dynamic from 'next/dynamic';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchAdminOrders,
  createJobOrder,
  submitJobOrderQC,
  recordOrderPayment,
} from '@/lib/ordersApi';
import { OrderStatusBadge, JOStatusBadge, PaymentBadge } from './components/StatusBadges';
import OrderTimeline from './components/OrderTimeline';

const DesignViewer = dynamic(() => import('./components/DesignViewer'), { ssr: false });
const PaymentTracker = dynamic(() => import('./components/PaymentTracker'), { ssr: false });
const CreateJOModal = dynamic(() => import('./components/CreateJOModal'), { ssr: false });
const BOMVerification = dynamic(() => import('./components/BOMVerification'), { ssr: false });
const QCModal = dynamic(() => import('./components/QCModal'), { ssr: false });

// ── Mock Data ──────────────────────────────────────────────────────────────────
const MOCK_ORDERS = [
  {
    id: 'ORD-2026-001',
    customer: { name: 'Juan Dela Cruz', email: 'juan@email.com', phone: '0917-123-4567' },
    status: 'processing',
    joStatus: 'queued',
    total: 2500,
    paid: 1250,
    createdAt: '2026-04-10T14:00:00',
    items: [
      { name: 'Custom Ceramic Mug 11oz', qty: 10, price: 150, total: 1500, sku: 'GL-MU-CER-11OZ' },
      { name: 'Magic Mug Black 15oz', qty: 5, price: 200, total: 1000, sku: 'GL-MU-MAG-BLK-15OZ' },
    ],
    designs: [{ name: 'company-logo.png', url: '/mock-design.png', uploadedAt: '2026-04-10' }],
    bom: { verified: true, items: [{ name: 'Ceramic Mug 11oz', required: 10, available: 68, status: 'ok' }] },
    timeline: [
      { status: 'pending_payment', date: '2026-04-10T14:00', by: 'Customer' },
      { status: 'payment_received', date: '2026-04-10T14:30', by: 'System', note: '50% down payment received' },
      { status: 'processing', date: '2026-04-11T09:00', by: 'Admin', note: 'Order approved, JO created' },
    ],
    jo: { id: 'JO-2026-045', targetDate: '2026-04-15', assignedTo: 'Production Team A', rush: false },
    notes: 'Custom name printing on all mugs',
  },
  {
    id: 'ORD-2026-002',
    customer: { name: 'Maria Santos', email: 'maria@email.com', phone: '0918-234-5678' },
    status: 'pending_payment',
    joStatus: null,
    total: 1800,
    paid: 900,
    createdAt: '2026-04-11T10:30:00',
    items: [
      { name: 'Canvas Totebag', qty: 20, price: 90, total: 1800, sku: 'PK-TB-CAN-0001' },
    ],
    designs: [{ name: 'event-design.ai', url: '/mock-design.png', uploadedAt: '2026-04-11' }],
    bom: { verified: false, items: [] },
    timeline: [
      { status: 'pending_payment', date: '2026-04-11T10:30', by: 'Customer' },
    ],
    jo: null,
    notes: '',
  },
  {
    id: 'ORD-2026-003',
    customer: { name: 'Pedro Reyes', email: 'pedro@email.com', phone: '0919-345-6789' },
    status: 'quality_check',
    joStatus: 'qc_pending',
    total: 3200,
    paid: 3200,
    createdAt: '2026-04-08T09:15:00',
    items: [
      { name: 'Sticker Pack A4', qty: 50, price: 40, total: 2000, sku: 'PK-ST-A4-0001' },
      { name: 'Custom Ceramic Mug 11oz', qty: 8, price: 150, total: 1200, sku: 'GL-MU-CER-11OZ' },
    ],
    designs: [{ name: 'sticker-artwork.pdf', url: '/mock-design.png', uploadedAt: '2026-04-08' }],
    bom: { verified: true, items: [] },
    timeline: [
      { status: 'pending_payment', date: '2026-04-08T09:15', by: 'Customer' },
      { status: 'processing', date: '2026-04-09T08:00', by: 'Admin' },
      { status: 'in_production', date: '2026-04-10T10:00', by: 'Production Team A' },
      { status: 'quality_check', date: '2026-04-12T14:00', by: 'Production Team A', note: 'Ready for QC' },
    ],
    jo: { id: 'JO-2026-042', targetDate: '2026-04-14', assignedTo: 'Production Team A', rush: true },
    notes: 'Rush order — event on April 20',
  },
  {
    id: 'ORD-2026-004',
    customer: { name: 'Ana Garcia', email: 'ana@email.com', phone: '0920-456-7890' },
    status: 'ready_for_delivery',
    joStatus: 'completed',
    total: 1500,
    paid: 1500,
    createdAt: '2026-04-05T16:00:00',
    items: [
      { name: 'Custom Ceramic Mug 11oz', qty: 10, price: 150, total: 1500, sku: 'GL-MU-CER-11OZ' },
    ],
    designs: [],
    bom: { verified: true, items: [] },
    timeline: [
      { status: 'pending_payment', date: '2026-04-05T16:00', by: 'Customer' },
      { status: 'processing', date: '2026-04-06T09:00', by: 'Admin' },
      { status: 'in_production', date: '2026-04-07T10:00', by: 'Production Team B' },
      { status: 'quality_check', date: '2026-04-10T11:00', by: 'Production Team B' },
      { status: 'qc_passed', date: '2026-04-11T09:00', by: 'QC Team', note: 'All items passed inspection' },
      { status: 'ready_for_delivery', date: '2026-04-11T09:30', by: 'Admin' },
    ],
    jo: { id: 'JO-2026-038', targetDate: '2026-04-12', assignedTo: 'Production Team B', rush: false },
    notes: '',
  },
  {
    id: 'ORD-2026-005',
    customer: { name: 'Luis Fernandez', email: 'luis@email.com', phone: '0921-567-8901' },
    status: 'delivered',
    joStatus: 'completed',
    total: 4500,
    paid: 4500,
    createdAt: '2026-04-01T11:00:00',
    items: [
      { name: 'Magic Mug Black 15oz', qty: 15, price: 200, total: 3000, sku: 'GL-MU-MAG-BLK-15OZ' },
      { name: 'Canvas Totebag', qty: 10, price: 90, total: 900, sku: 'PK-TB-CAN-0001' },
      { name: 'Sticker Pack A4', qty: 15, price: 40, total: 600, sku: 'PK-ST-A4-0001' },
    ],
    designs: [{ name: 'corporate-logo.eps', url: '/mock-design.png', uploadedAt: '2026-04-01' }],
    bom: { verified: true, items: [] },
    timeline: [
      { status: 'pending_payment', date: '2026-04-01T11:00', by: 'Customer' },
      { status: 'processing', date: '2026-04-02T09:00', by: 'Admin' },
      { status: 'in_production', date: '2026-04-03T08:00', by: 'Production Team A' },
      { status: 'qc_passed', date: '2026-04-06T10:00', by: 'QC Team' },
      { status: 'ready_for_delivery', date: '2026-04-06T10:30', by: 'Admin' },
      { status: 'delivered', date: '2026-04-08T14:00', by: 'Admin', note: 'Delivered via Lalamove' },
    ],
    jo: { id: 'JO-2026-035', targetDate: '2026-04-07', assignedTo: 'Production Team A', rush: false },
    notes: 'Corporate order — deliver to Makati office',
  },
  {
    id: 'ORD-2026-006',
    customer: { name: 'Sofia Cruz', email: 'sofia@email.com', phone: '0922-678-9012' },
    status: 'awaiting_payment',
    joStatus: 'qc_passed',
    total: 2000,
    paid: 1000,
    createdAt: '2026-04-09T13:00:00',
    items: [
      { name: 'Custom Ceramic Mug 11oz', qty: 10, price: 150, total: 1500, sku: 'GL-MU-CER-11OZ' },
      { name: 'Sticker Pack A4', qty: 12, price: 40, total: 480, sku: 'PK-ST-A4-0001' },
    ],
    designs: [{ name: 'wedding-design.png', url: '/mock-design.png', uploadedAt: '2026-04-09' }],
    bom: { verified: true, items: [] },
    timeline: [
      { status: 'pending_payment', date: '2026-04-09T13:00', by: 'Customer' },
      { status: 'processing', date: '2026-04-10T09:00', by: 'Admin' },
      { status: 'qc_passed', date: '2026-04-12T15:00', by: 'QC Team', note: 'Passed QC, awaiting balance payment' },
    ],
    jo: { id: 'JO-2026-044', targetDate: '2026-04-14', assignedTo: 'Production Team B', rush: false },
    notes: 'Wedding favors — balance needed before delivery',
  },
];

// ── Pipeline Stats ─────────────────────────────────────────────────────────────
function getPipelineStats(orders) {
  const stats = {
    pending_payment: 0,
    processing: 0,
    in_production: 0,
    quality_check: 0,
    ready: 0,
    delivered: 0,
    totalRevenue: 0,
    paidRevenue: 0,
  };
  orders.forEach((o) => {
    if (o.status === 'pending_payment') stats.pending_payment++;
    else if (o.status === 'processing') stats.processing++;
    else if (o.status === 'in_production' || o.joStatus === 'in_progress') stats.in_production++;
    else if (o.status === 'quality_check' || o.joStatus === 'qc_pending') stats.quality_check++;
    else if (o.status === 'ready_for_delivery' || o.status === 'awaiting_payment') stats.ready++;
    else if (o.status === 'delivered') stats.delivered++;
    stats.totalRevenue += o.total;
    stats.paidRevenue += o.paid;
  });
  return stats;
}

// ── Format Helpers ─────────────────────────────────────────────────────────────
function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function OrdersPreviewPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showCreateJO, setShowCreateJO] = useState(false);
  const [showDesign, setShowDesign] = useState(false);
  const [showBOM, setShowBOM] = useState(false);
  const [showQC, setShowQC] = useState(false);
  const [targetOrder, setTargetOrder] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'cash', note: '' });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminOrders(token);
      setOrders(data);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !search ||
        (o.id || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.customer?.name || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || o.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [orders, search, filterStatus]);

  const stats = useMemo(() => getPipelineStats(orders), [orders]);

  const handleCreateJO = (order) => {
    setTargetOrder(order);
    setShowCreateJO(true);
  };

  const handleCreateJOSubmit = useCallback(async (formData) => {
    if (!token || !targetOrder) return;
    setActionLoading(true);
    try {
      await createJobOrder(
        {
          orderId: targetOrder._id || targetOrder.id,
          product: {
            name: formData.productName,
            variant: formData.productVariant || null,
            quantity: formData.productQuantity,
          },
          targetCompletion: formData.targetCompletion,
          isRush: formData.isRush || false,
          assignedTo: formData.assignedTo,
          notes: formData.notes || null,
        },
        token
      );
      setShowCreateJO(false);
      setTargetOrder(null);
      await loadOrders();
    } catch (err) {
      alert(err.message || 'Failed to create job order');
    } finally {
      setActionLoading(false);
    }
  }, [token, targetOrder, loadOrders]);

  const handleQCSubmit = useCallback(async (payload) => {
    if (!token || !targetOrder) return;
    setActionLoading(true);
    try {
      // QC is submitted against the Job Order ID, not the order ID
      const joId = targetOrder.jo?._id || targetOrder.jo?.id;
      if (!joId) throw new Error('No linked job order found for this order');
      await submitJobOrderQC(joId, payload, token);
      setShowQC(false);
      setTargetOrder(null);
      await loadOrders();
    } catch (err) {
      alert(err.message || 'Failed to submit QC result');
    } finally {
      setActionLoading(false);
    }
  }, [token, targetOrder, loadOrders]);

  const handleOpenPayment = (order) => {
    setPaymentTarget(order);
    setPaymentForm({ amount: '', method: 'cash', note: '' });
    setShowPaymentModal(true);
  };

  const handleRecordPayment = useCallback(async () => {
    if (!token || !paymentTarget) return;
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    setPaymentLoading(true);
    try {
      await recordOrderPayment(
        paymentTarget._id || paymentTarget.id,
        {
          amount,
          method: paymentForm.method,
          note: paymentForm.note || null,
        },
        token
      );
      setShowPaymentModal(false);
      setPaymentTarget(null);
      await loadOrders();
    } catch (err) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setPaymentLoading(false);
    }
  }, [token, paymentTarget, paymentForm, loadOrders]);

  const handleViewDesign = (order) => {
    setTargetOrder(order);
    setShowDesign(true);
  };

  const handleViewBOM = (order) => {
    setTargetOrder(order);
    setShowBOM(true);
  };

  const handleOpenQC = (order) => {
    setTargetOrder(order);
    setShowQC(true);
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
          Home › Business Insights › Orders
        </div>
        <h1 className="page-title">Orders</h1>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--gray)' }}>
          Manage orders, production, QC, and delivery workflow.
        </p>
      </div>

      {/* Pipeline Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Pending Payment', value: stats.pending_payment, color: 'var(--color-text-warning)' },
          { label: 'Processing', value: stats.processing, color: 'var(--blue)' },
          { label: 'In Production', value: stats.in_production, color: 'var(--purple)' },
          { label: 'Quality Check', value: stats.quality_check, color: 'var(--cyan)' },
          { label: 'Ready', value: stats.ready, color: 'var(--green)' },
          { label: 'Delivered', value: stats.delivered, color: 'var(--gray)' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '12px',
              padding: '1rem',
              border: '1px solid rgba(255,255,255,0.06)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Revenue Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'rgba(212,168,67,0.08)', borderRadius: '12px', padding: '1.25rem', border: '1px solid rgba(212,168,67,0.2)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Order Value</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--gold)', fontFamily: 'monospace' }}>{formatPeso(stats.totalRevenue)}</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.08)', borderRadius: '12px', padding: '1.25rem', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Collected Revenue</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'monospace' }}>{formatPeso(stats.paidRevenue)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by Order ID or Customer Name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            maxWidth: '350px',
            padding: '0.625rem 0.75rem',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'var(--white)',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'var(--white)',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        >
          <option value="all" style={{ background: 'var(--dark)' }}>All Status</option>
          <option value="pending_payment" style={{ background: 'var(--dark)' }}>Pending Payment</option>
          <option value="processing" style={{ background: 'var(--dark)' }}>Processing</option>
          <option value="quality_check" style={{ background: 'var(--dark)' }}>Quality Check</option>
          <option value="ready_for_delivery" style={{ background: 'var(--dark)' }}>Ready for Delivery</option>
          <option value="awaiting_payment" style={{ background: 'var(--dark)' }}>Awaiting Payment</option>
          <option value="delivered" style={{ background: 'var(--dark)' }}>Delivered</option>
        </select>
      </div>

      {/* Orders Table */}
      <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
              {['Order', 'Customer', 'Items', 'Status', 'Payment', 'Total', 'JO', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: h === 'Total' ? 'right' : 'left', color: 'var(--gray)', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>No orders found.</td></tr>
            ) : (
              filtered.map((order) => (
                <tr
                  key={order.id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                  onClick={() => setSelectedOrder(order)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' }}>{order.id}</span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--white)' }}>{order.customer.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{order.customer.email}</div>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: 'var(--gray)', fontSize: '0.8rem' }}>
                    {order.items.length} item{order.items.length > 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <PaymentBadge paid={order.paid} total={order.total} />
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace' }}>{formatPeso(order.total)}</span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {order.jo ? (
                      <JOStatusBadge status={order.joStatus} />
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {order.designs.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleViewDesign(order); }}
                          style={{ padding: '0.25rem 0.5rem', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '4px', color: 'var(--indigo)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Design
                        </button>
                      )}
                      {order.bom.verified && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleViewBOM(order); }}
                          style={{ padding: '0.25rem 0.5rem', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px', color: 'var(--green)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          BOM
                        </button>
                      )}
                      {!order.jo && order.status !== 'delivered' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCreateJO(order); }}
                          style={{ padding: '0.25rem 0.5rem', background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '4px', color: 'var(--gold)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Create JO
                        </button>
                      )}
                      {order.status === 'quality_check' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenQC(order); }}
                          style={{ padding: '0.25rem 0.5rem', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '4px', color: 'var(--purple)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
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

      {/* ── Right Detail Panel ─────────────────────────────────────────────── */}
      {selectedOrder && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setSelectedOrder(null)} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: '480px', height: '100vh', background: 'var(--dark)', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', zIndex: 1000 }}>
            {/* Panel Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Order #{selectedOrder.id}</div>
                <OrderStatusBadge status={selectedOrder.status} size="lg" />
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--gray)' }}>{formatDate(selectedOrder.createdAt)}</div>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Panel Body */}
            <div style={{ padding: '1.25rem' }}>
              {/* Customer */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Customer</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(212,168,67,0.15)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700 }}>{selectedOrder.customer.name.charAt(0)}</div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--white)' }}>{selectedOrder.customer.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{selectedOrder.customer.email} | {selectedOrder.customer.phone}</div>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Order Items</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)' }}>{item.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{item.sku} × {item.qty}</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace' }}>{formatPeso(item.total)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Tracker */}
              <div style={{ marginBottom: '1.25rem' }}>
                <PaymentTracker paid={selectedOrder.paid} total={selectedOrder.total} />
              </div>

              {/* Job Order Info */}
              {selectedOrder.jo && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Job Order</h4>
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--white)', fontWeight: 600 }}>{selectedOrder.jo.id}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>Assigned: {selectedOrder.jo.assignedTo}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>Target: {formatDate(selectedOrder.jo.targetDate)}</div>
                    </div>
                    <JOStatusBadge status={selectedOrder.joStatus} />
                  </div>
                </div>
              )}

              {/* Design Files */}
              {selectedOrder.designs.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Design Files</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {selectedOrder.designs.map((d, idx) => (
                      <button key={idx} onClick={() => handleViewDesign(selectedOrder)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', color: 'var(--indigo)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedOrder.notes && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Notes</h4>
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--white)', lineHeight: 1.5 }}>{selectedOrder.notes}</div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Order Timeline</h4>
                <OrderTimeline events={selectedOrder.timeline} />
              </div>
            </div>

            {/* Panel Footer Actions */}
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {!selectedOrder.jo && selectedOrder.status !== 'delivered' && (
                <button
                  onClick={() => handleCreateJO(selectedOrder)}
                  style={{ flex: 1, padding: '0.625rem', background: 'linear-gradient(135deg, var(--gold-light) 0%, var(--gold) 100%)', border: 'none', borderRadius: '8px', color: 'var(--black)', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  Create JO
                </button>
              )}
              {selectedOrder.paid < selectedOrder.total && (
                <button
                  onClick={() => handleOpenPayment(selectedOrder)}
                  style={{ flex: 1, padding: '0.625rem', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: 'var(--green)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Record Payment
                </button>
              )}
              {selectedOrder.status === 'quality_check' && (
                <button
                  onClick={() => handleOpenQC(selectedOrder)}
                  style={{ flex: 1, padding: '0.625rem', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', color: 'var(--purple)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Submit QC
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showCreateJO && targetOrder && (
        <CreateJOModal
          order={targetOrder}
          onClose={() => { setShowCreateJO(false); setTargetOrder(null); }}
          onSubmit={handleCreateJOSubmit}
        />
      )}
      {showDesign && targetOrder && (
        <DesignViewer order={targetOrder} onClose={() => { setShowDesign(false); setTargetOrder(null); }} />
      )}
      {showBOM && targetOrder && (
        <BOMVerification order={targetOrder} onClose={() => { setShowBOM(false); setTargetOrder(null); }} />
      )}
      {showQC && targetOrder && (
        <QCModal
          order={targetOrder}
          onClose={() => { setShowQC(false); setTargetOrder(null); }}
          onSubmit={handleQCSubmit}
        />
      )}
      {showPaymentModal && paymentTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Record Payment</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Order <strong>{paymentTarget.id}</strong> — Balance: <strong>₱{Number((paymentTarget.total || 0) - (paymentTarget.paid || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Amount *</label>
              <input
                type="number"
                min="1"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="Enter amount..."
                style={{ padding: '0.625rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Method *</label>
              <select
                value={paymentForm.method}
                onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                style={{ padding: '0.625rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cod">COD</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Note</label>
              <input
                type="text"
                value={paymentForm.note}
                onChange={(e) => setPaymentForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="Optional note..."
                style={{ padding: '0.625rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => { setShowPaymentModal(false); setPaymentTarget(null); }}
                disabled={paymentLoading}
                style={{ flex: 1, padding: '0.625rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={paymentLoading}
                style={{ flex: 1, padding: '0.625rem', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: 'var(--green)', fontSize: '0.85rem', fontWeight: 700, cursor: paymentLoading ? 'not-allowed' : 'pointer', opacity: paymentLoading ? 0.6 : 1 }}
              >
                {paymentLoading ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
