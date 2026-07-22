'use client';

/**
 * SALES MANAGEMENT PAGE
 * Redesigned to match the Orders / Job Orders / Production / QC / Inventory look — uses the SAME
 * inventory-v2 shared components (SummaryCard, SearchBar, PaginationBar, EmptyState, CustomSelect, S)
 * as the Orders module, so the stat cards / toolbar / table / pagination are pixel-consistent.
 * Data logic is unchanged from the previous version; three display bugs were fixed:
 *  - "Downpayment" no longer shows the full amount when an order is fully paid.
 *  - The payment breakdown shows a Shipping line so Subtotal + Shipping = Total reconciles.
 *  - (Profit/Cost is deferred to PLAN A — the cost resolver.)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatPrice } from '@/src/utils/format';
import ErrorBoundary from '../../../../components/ErrorBoundary';
import { S, ICONS, SummaryCard, SearchBar, PaginationBar, EmptyState, CustomSelect } from '../inventory-v2/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [2025, 2026, 2027, 2028];

// Payment-status pill using the dashboard's theme-aware --st-* palette (same as StatusBadge elsewhere).
const STATUS_LABEL = { paid: 'Paid', partial: 'Partial DP', pending: 'Pending', cancelled: 'Cancelled' };
const STATUS_TONE  = { paid: 'green', partial: 'amber', pending: 'amber', cancelled: 'red' };
function StatusPill({ status }) {
  const tone = STATUS_TONE[status] || 'gray';
  return (
    <span style={{ ...S.badge, background: `var(--st-${tone}-bg)`, color: `var(--st-${tone}-fg)` }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function orderToRow(o) {
  const id = o._id || o.id;
  const ps = o.paymentStatus || 'unpaid';
  const total = Number(o.totalAmount ?? o.totalPrice ?? 0);
  const dp    = Number(o.downPayment ?? 0);
  const bal   = Number(o.balance ?? total);
  const shipping = Number(o.shippingFee ?? 0);
  const designFee = (o.items || []).reduce((s, i) => s + Number(i.designFee ?? 0), 0);
  const isCancelled = (o.orderStatus || '').toLowerCase() === 'cancelled' || o.status === 'cancelled';
  return {
    id,
    orderNumber: o.orderId || o.orderNumber || id?.slice?.(-8) || '—',
    customerName: o.userSnapshot?.name || o.customerName || '—',
    customerContact: o.userSnapshot?.phone || o.customerContact || null,
    customerEmail: o.userSnapshot?.email || o.customerEmail || null,
    items: (o.items || []).map(item => ({
      productId: item.productId,
      productName: item.productName,
      category: item.category || item.productCategory || 'Uncategorized',
      variant: item.variantName,
      quantity: item.qty ?? item.quantity ?? 1,
      unitPrice: item.unitPrice ?? 0,
      designFee: Number(item.designFee ?? 0),
    })),
    quantity: (o.items || []).reduce((s, i) => s + (i.qty ?? i.quantity ?? 0), 0),
    orderDate: o.createdAt || o.orderDate || new Date().toISOString(),
    dueDate: o.dueDate || null,
    totalPrice: total,
    shipping,
    designFee: Math.round(designFee * 100) / 100,
    subtotal: Math.max(0, Math.round((total - shipping - designFee) * 100) / 100),
    downPayment: dp,
    downpaymentPercent: o.downpaymentPercent ?? null,
    balance: bal,
    status: isCancelled ? 'cancelled' : (ps === 'paid' || bal === 0 ? 'paid' : (dp > 0 && bal > 0 ? 'partial' : 'pending')),
    paymentStatus: ps,
    source: o.source || 'online',
    notes: o.notes || '',
  };
}

// ── Expandable detail row ─────────────────────────────────────────────────────
function OrderExpandRow({ order, colSpan }) {
  const fullyPaid = order.status !== 'cancelled' && order.balance === 0;
  const partial   = order.downPayment > 0 && order.balance > 0;
  const label = { fontSize: '11px', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' };
  const line = { display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px', fontSize: '13px' };
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: 'var(--dark2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>

          <div>
            <div style={label}>Customer</div>
            <div style={{ fontSize: '13px', color: 'var(--white)', fontWeight: 600 }}>{order.customerName || 'N/A'}</div>
            <div style={{ fontSize: '12px', color: 'var(--gray)' }}>{order.customerContact || '—'}</div>
            <div style={{ fontSize: '12px', color: 'var(--gray)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.customerEmail || '—'}</div>
          </div>

          <div>
            <div style={label}>Order Items</div>
            {order.items?.length > 0 ? order.items.map((item, i) => (
              <div key={i} style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '13px', color: 'var(--white)', fontWeight: 600 }}>{item.productName}</div>
                <div style={{ fontSize: '12px', color: 'var(--gray)' }}>
                  {item.variant ? `${item.variant} × ${item.quantity}` : `× ${item.quantity}`} &middot; {formatPrice(item.unitPrice || 0)} each
                </div>
              </div>
            )) : (
              <div style={{ fontSize: '13px', color: 'var(--gray)', fontStyle: 'italic' }}>—</div>
            )}
          </div>

          <div>
            <div style={label}>Payment</div>
            <div style={line}><span style={{ color: 'var(--gray)' }}>Subtotal</span><span style={{ color: 'var(--white)' }}>{formatPrice(order.subtotal)}</span></div>
            {order.designFee > 0 && (
              <div style={line}><span style={{ color: 'var(--gray)' }}>Design fee</span><span style={{ color: 'var(--white)' }}>{formatPrice(order.designFee)}</span></div>
            )}
            {order.shipping > 0 && (
              <div style={line}><span style={{ color: 'var(--gray)' }}>Shipping</span><span style={{ color: 'var(--white)' }}>{formatPrice(order.shipping)}</span></div>
            )}
            <div style={{ ...line, borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '2px' }}>
              <span style={{ color: 'var(--gray)', fontWeight: 700 }}>Total</span>
              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{formatPrice(order.totalPrice)}</span>
            </div>
            {order.status === 'cancelled' ? (
              <div style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '6px' }}>Cancelled</div>
            ) : fullyPaid ? (
              <div style={{ fontSize: '12px', color: 'var(--st-green-fg)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {ICONS.check} Paid in full
              </div>
            ) : partial ? (
              <>
                <div style={{ ...line, marginTop: '6px' }}><span style={{ color: 'var(--gray)' }}>Downpayment{order.downpaymentPercent ? ` (${order.downpaymentPercent}%)` : ''}</span><span style={{ color: 'var(--st-green-fg)' }}>{formatPrice(order.downPayment)}</span></div>
                <div style={line}><span style={{ color: '#e0a43a', fontWeight: 700 }}>Balance due</span><span style={{ color: '#e0a43a', fontWeight: 700 }}>{formatPrice(order.balance)}</span></div>
              </>
            ) : (
              <div style={{ ...line, marginTop: '6px' }}><span style={{ color: '#e0a43a', fontWeight: 700 }}>Balance due</span><span style={{ color: '#e0a43a', fontWeight: 700 }}>{formatPrice(order.balance)}</span></div>
            )}
          </div>

          <div>
            <div style={label}>Order Notes</div>
            <div style={{ fontSize: '13px', color: 'var(--gray-light)' }}>{order.notes || '—'}</div>
            <div style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '8px' }}>
              <div>Order Date: {new Date(order.orderDate).toLocaleDateString()}</div>
              <div>Due Date: {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '—'}</div>
              <div style={{ color: 'var(--gold)', marginTop: '2px' }}>
                Source: {order.source === 'manual' ? 'Outside System (Manual Sale)' : 'Online Storefront'}
              </div>
            </div>
          </div>

        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
// ── Reports view (PLAN G) — aggregated analytics over the filtered sales ──────
function ReportsView({ reports }) {
  const { revenue, units, orders, aov, bestSellers, byCategory, byPayment, byMonth } = reports;
  const maxMonthRev = Math.max(1, ...byMonth.map(x => x.revenue));

  const MiniTable = ({ title, rows, cols }) => (
    <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--white)' }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{cols.map((c, i) => <th key={i} style={{ ...S.th, textAlign: i === 0 ? 'left' : 'right' }}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} style={{ padding: '18px', textAlign: 'center', color: 'var(--gray)', fontSize: '13px' }}>No data</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} style={S.tr}>{cols.map((c, j) => <td key={j} style={{ ...S.td, textAlign: j === 0 ? 'left' : 'right' }}>{c.render(r)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <SummaryCard label="Revenue (filtered)" value={formatPrice(revenue)} sub="Goods + design fee, excl. shipping" color="var(--st-green-fg)" />
        <SummaryCard label="Orders"             value={orders}              sub="Active in the current filter"     color="var(--st-blue-fg)" />
        <SummaryCard label="Avg Order Value"    value={formatPrice(aov)}    sub="Revenue / orders"                 color="var(--gold)" />
        <SummaryCard label="Units Sold"         value={units}               sub="Total item quantity"              color="var(--st-purple-fg)" />
      </div>

      <div style={S.card}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--white)', marginBottom: '12px' }}>Revenue by month</div>
        {byMonth.length === 0 ? <div style={{ color: 'var(--gray)', fontSize: '13px' }}>No data</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {byMonth.map((mo, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '72px', fontSize: '12px', color: 'var(--gray)' }}>{mo.name}</span>
                <div style={{ flex: 1, height: '18px', background: 'var(--dark)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(mo.revenue / maxMonthRev) * 100}%`, height: '100%', background: 'var(--st-green-fg)' }} />
                </div>
                <span style={{ width: '96px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--white)' }}>{formatPrice(mo.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
        <MiniTable title="Best sellers" rows={bestSellers} cols={[
          { label: 'Product',  render: r => r.name },
          { label: 'Qty',      render: r => r.qty },
          { label: 'Revenue',  render: r => formatPrice(r.revenue) },
        ]} />
        <MiniTable title="By category" rows={byCategory} cols={[
          { label: 'Category', render: r => r.name },
          { label: 'Qty',      render: r => r.qty },
          { label: 'Revenue',  render: r => formatPrice(r.revenue) },
        ]} />
        <MiniTable title="By payment status" rows={byPayment} cols={[
          { label: 'Status',   render: r => r.name },
          { label: 'Orders',   render: r => r.count },
          { label: 'Revenue',  render: r => formatPrice(r.revenue) },
        ]} />
      </div>

      <div style={{ fontSize: '11px', color: 'var(--gray)' }}>
        Revenue excludes shipping (pass-through to courier). Profit reporting hooks into the Sale.cost pipeline (PLAN A) once cost flows into this view.
      </div>
    </div>
  );
}

export default function SalesListPage() {
  const { token } = useAuth();
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ fromMonth: 0, toMonth: 0, year: 2026 });
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sPage, setSPage] = useState(1);
  const [sRpp, setSRpp] = useState(10);
  const [view, setView] = useState('list'); // 'list' | 'reports'

  useEffect(() => {
    async function loadData() {
      if (!token) { setError('Unable to load sales. Please refresh or log in again.'); setIsLoading(false); return; }
      setIsLoading(true); setError(null);
      try {
        const res = await fetch(`${API_URL}/api/admin/orders`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Failed to load orders');
        const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
        setSales(list.map(orderToRow));
      } catch (err) {
        setError(err.message || 'Failed to load sales data');
        setSales([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [token]);

  const toggleExpand = (id) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  useEffect(() => { setSPage(1); }, [searchQuery, paymentFilter, dateFilter, customDateRange]);

  const filteredSales = useMemo(() => {
    return sales.filter(order => {
      const matchesSearch =
        order.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesPayment = true;
      if (paymentFilter === 'paid') matchesPayment = order.status !== 'cancelled' && (order.paymentStatus === 'paid' || order.balance === 0);
      else if (paymentFilter === 'pending-50') matchesPayment = order.status !== 'cancelled' && order.downPayment > 0 && order.balance > 0;
      else if (paymentFilter === 'cancelled') matchesPayment = order.status === 'cancelled';

      let matchesDate = true;
      const orderDate = new Date(order.orderDate);
      const today = new Date(); today.setHours(0, 0, 0, 0); orderDate.setHours(0, 0, 0, 0);
      if (dateFilter === 'today') matchesDate = orderDate.getTime() === today.getTime();
      else if (dateFilter === 'this-week') matchesDate = orderDate >= new Date(today.getTime() - 7 * 864e5);
      else if (dateFilter === 'this-month') matchesDate = orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear();
      else if (dateFilter === 'custom') matchesDate = orderDate.getFullYear() === customDateRange.year && orderDate.getMonth() >= customDateRange.fromMonth && orderDate.getMonth() <= customDateRange.toMonth;

      return matchesSearch && matchesPayment && matchesDate;
    });
  }, [sales, searchQuery, paymentFilter, dateFilter, customDateRange]);

  const pagedSales = filteredSales.slice((sPage - 1) * sRpp, sPage * sRpp);

  const m = useMemo(() => {
    const active    = sales.filter(o => o.status !== 'cancelled');
    const paid      = active.filter(o => o.paymentStatus === 'paid' || o.balance === 0);
    const partial   = active.filter(o => o.downPayment > 0 && o.balance > 0);
    const cancelled = sales.filter(o => o.status === 'cancelled');
    const products  = new Set();
    active.forEach(o => o.items?.forEach(i => { if (i.productId) products.add(i.productId); }));
    return {
      totalSales: active.length, paid: paid.length, pending50: partial.length, cancelled: cancelled.length,
      revenue: active.reduce((s, o) => s + Math.max(0, (o.totalPrice || 0) - (o.shipping || 0)), 0),
      shippingCollected: active.reduce((s, o) => s + (o.shipping || 0), 0),
      outstanding: active.reduce((s, o) => s + (o.balance || 0), 0),
      topProductsCount: products.size,
    };
  }, [sales]);

  // ── Reports aggregation (respects the current search/date/payment filters via filteredSales) ──
  const reports = useMemo(() => {
    const active = filteredSales.filter(o => o.status !== 'cancelled');
    const goods = (o) => Math.max(0, (o.totalPrice || 0) - (o.shipping || 0));
    const revenue = active.reduce((s, o) => s + goods(o), 0);
    const units   = active.reduce((s, o) => s + (o.quantity || 0), 0);
    const orders  = active.length;
    const aov     = orders > 0 ? revenue / orders : 0;

    const agg = (keyer) => {
      const map = {};
      active.forEach(o => (o.items || []).forEach(i => {
        const key = keyer(i) || '—';
        if (!map[key]) map[key] = { name: key, qty: 0, revenue: 0 };
        map[key].qty += Number(i.quantity || 0);
        map[key].revenue += Number(i.unitPrice || 0) * Number(i.quantity || 0);
      }));
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    };
    const bestSellers = agg(i => i.productName || i.productId).slice(0, 10);
    const byCategory  = agg(i => i.category || 'Uncategorized');

    const payMap = {};
    active.forEach(o => {
      const key = o.status || 'pending';
      if (!payMap[key]) payMap[key] = { name: key, count: 0, revenue: 0 };
      payMap[key].count += 1;
      payMap[key].revenue += goods(o);
    });
    const byPayment = Object.values(payMap).sort((a, b) => b.revenue - a.revenue);

    const monMap = {};
    active.forEach(o => {
      const d = new Date(o.orderDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monMap[key]) monMap[key] = { name: key, orders: 0, revenue: 0 };
      monMap[key].orders += 1;
      monMap[key].revenue += goods(o);
    });
    const byMonth = Object.values(monMap).sort((a, b) => a.name.localeCompare(b.name));

    return { revenue, units, orders, aov, bestSellers, byCategory, byPayment, byMonth };
  }, [filteredSales]);

  const exportCsv = () => {
    const header = ['Order Ref', 'Customer', 'Date', 'Items', 'Qty', 'Subtotal', 'Design Fee', 'Shipping', 'Total', 'Downpayment', 'Balance', 'Status'];
    const dataRows = filteredSales.map(o => [
      o.orderNumber, o.customerName, new Date(o.orderDate).toLocaleDateString(),
      (o.items || []).map(i => `${i.productName} x${i.quantity}`).join('; '),
      o.quantity, o.subtotal, o.designFee, o.shipping, o.totalPrice, o.downPayment, o.balance, o.status,
    ]);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...dataRows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const FILTER_CARDS = [
    { label: 'All Sales',  value: m.totalSales, id: '' },
    { label: 'Paid',       value: m.paid,       id: 'paid',       color: 'var(--st-green-fg)' },
    { label: 'Partial DP', value: m.pending50,  id: 'pending-50', color: 'var(--st-amber-fg)' },
    { label: 'Cancelled',  value: m.cancelled,  id: 'cancelled',  color: 'var(--st-red-fg)' },
  ];

  const TH = (h, i, right) => (
    <th key={i} style={{ ...S.th, ...(i === 0 ? { width: '36px' } : {}), textAlign: right ? 'center' : 'left' }}>{h}</th>
  );

  return (
    <ErrorBoundary>
      <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Filter stat cards */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {FILTER_CARDS.map(c => (
            <div key={c.id || 'all'} onClick={() => { setPaymentFilter(c.id); setSPage(1); }} style={{ cursor: 'pointer', flex: '1', minWidth: '140px' }}>
              <SummaryCard label={c.label} value={c.value}
                accent={paymentFilter === c.id}
                color={paymentFilter === c.id ? 'var(--gold)' : (c.color || undefined)} />
            </div>
          ))}
        </div>

        {/* Analytics cards */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <SummaryCard label="Total Revenue"       value={formatPrice(m.revenue)}           sub="Goods + design fee, excl. shipping" color="var(--st-green-fg)" />
          <SummaryCard label="Shipping Collected"   value={formatPrice(m.shippingCollected)} sub="Pass-through to courier"            color="var(--st-blue-fg)" />
          <SummaryCard label="Outstanding Balance"  value={formatPrice(m.outstanding)}       sub="Total unpaid balance"               color="var(--gold)" />
          <SummaryCard label="Top Products"         value={m.topProductsCount}               sub="Distinct products sold"             color="var(--st-purple-fg)" />
        </div>

        {error && <div style={{ ...S.note, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', marginBottom: '10px' }}>{error}</div>}

        {/* Toolbar — separate card above the table, exactly like the Orders module */}
        <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
          <div style={{ ...S.row, gap: '8px', flex: 1 }}>
            <SearchBar value={searchQuery} onChange={v => { setSearchQuery(v); setSPage(1); }}
              placeholder="Search customer or order number…" style={{ width: '260px' }} />
            <CustomSelect
              value={dateFilter} onChange={setDateFilter} style={{ width: '150px' }}
              options={[
                { value: 'all', label: 'All Time' }, { value: 'today', label: 'Today' },
                { value: 'this-week', label: 'This Week' }, { value: 'this-month', label: 'This Month' },
                { value: 'custom', label: 'Custom Range' },
              ]}
            />
            {dateFilter === 'custom' && (
              <>
                <CustomSelect value={String(customDateRange.fromMonth)} onChange={v => setCustomDateRange(p => ({ ...p, fromMonth: parseInt(v) }))} options={MONTHS.map((mo, i) => ({ value: String(i), label: mo }))} style={{ width: '130px' }} />
                <span style={{ color: 'var(--gray)', fontSize: '13px' }}>to</span>
                <CustomSelect value={String(customDateRange.toMonth)} onChange={v => setCustomDateRange(p => ({ ...p, toMonth: parseInt(v) }))} options={MONTHS.map((mo, i) => ({ value: String(i), label: mo }))} style={{ width: '130px' }} />
                <CustomSelect value={String(customDateRange.year)} onChange={v => setCustomDateRange(p => ({ ...p, year: parseInt(v) }))} options={YEARS.map(y => ({ value: String(y), label: String(y) }))} style={{ width: '100px' }} />
              </>
            )}
          </div>
          <div style={{ ...S.row, gap: '8px' }}>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
              {[['list', 'List'], ['reports', 'Reports']].map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  style={{ padding: '6px 13px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: view === v ? 'var(--gold)' : 'var(--dark)', color: view === v ? 'var(--black)' : 'var(--gray)' }}>
                  {lbl}
                </button>
              ))}
            </div>
            <button type="button" onClick={exportCsv}
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Export CSV
            </button>
            <span style={{ fontSize: '12px', color: 'var(--gray)', whiteSpace: 'nowrap' }}>{filteredSales.length} sale{filteredSales.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {view === 'list' && (<>
        {/* Table */}
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
              <thead>
                <tr>
                  {TH('', 0)}{TH('Order Ref', 1)}{TH('Customer', 2)}{TH('Items', 3, true)}
                  {TH('Date', 4)}{TH('Total', 5, true)}{TH('Downpayment', 6, true)}{TH('Balance', 7, true)}{TH('Status', 8, true)}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--gray)', fontSize: '13px' }}>Loading sales…</td></tr>
                ) : filteredSales.length === 0 ? (
                  <tr><td colSpan={9}><EmptyState icon={ICONS.pkg} message={searchQuery || paymentFilter ? 'No sales found' : 'No sales records yet'} sub={searchQuery || paymentFilter ? 'Try adjusting your search or filter.' : 'Sales appear here once orders are created.'} /></td></tr>
                ) : pagedSales.map(order => {
                  const isExpanded = expandedRows.has(order.id);
                  const totalItems = order.items?.reduce((s, i) => s + i.quantity, 0) || order.quantity || 0;
                  const cancelled = order.status === 'cancelled';
                  const fullyPaid = !cancelled && order.balance === 0;
                  const partial = order.downPayment > 0 && order.balance > 0;
                  return (
                    <React.Fragment key={order.id}>
                      <tr style={{ ...S.tr, opacity: cancelled ? 0.55 : 1, cursor: 'pointer' }} onClick={() => toggleExpand(order.id)}>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <span style={{ display: 'inline-flex', color: 'var(--gray)', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>{ICONS.chevR}</span>
                        </td>
                        <td style={S.td}>
                          <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{order.orderNumber}</div>
                          {order.source === 'manual' && <div style={{ fontSize: '11px', color: 'var(--orange)' }}>Outside System</div>}
                        </td>
                        <td style={S.td}>
                          <div style={{ fontWeight: 600, color: 'var(--white)' }}>{order.customerName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--gray)' }}>{order.customerContact || ''}</div>
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, color: 'var(--white)' }}>{totalItems} pcs</span>
                          {order.items?.length > 1 && <div style={{ fontSize: '11px', color: 'var(--gray)' }}>{order.items.length} variants</div>}
                        </td>
                        <td style={{ ...S.td, color: 'var(--gray)' }}>{new Date(order.orderDate).toLocaleDateString()}</td>
                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: 'var(--gold)' }}>{formatPrice(order.totalPrice)}</td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          {cancelled ? <span style={{ color: 'var(--gray)' }}>—</span>
                            : fullyPaid ? <span style={{ color: 'var(--st-green-fg)', fontWeight: 600 }}>Paid in full</span>
                            : partial ? (
                              <>
                                <span style={{ fontWeight: 600, color: 'var(--st-green-fg)' }}>{formatPrice(order.downPayment)}</span>
                                {order.downpaymentPercent ? <div style={{ fontSize: '11px', color: 'var(--st-green-fg)' }}>{order.downpaymentPercent}% DP</div> : null}
                              </>
                            ) : <span style={{ color: 'var(--gray)' }}>—</span>}
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, color: cancelled ? 'var(--gray)' : (order.balance === 0 ? 'var(--st-green-fg)' : '#e0a43a') }}>
                            {cancelled ? '—' : formatPrice(order.balance)}
                          </span>
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}><StatusPill status={order.status} /></td>
                      </tr>
                      {isExpanded && <OrderExpandRow order={order} colSpan={9} />}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!isLoading && filteredSales.length > 0 && (
          <PaginationBar total={filteredSales.length} page={sPage} perPage={sRpp} onPage={setSPage} onPerPage={setSRpp} />
        )}
        </>)}

        {view === 'reports' && !isLoading && <ReportsView reports={reports} />}
      </div>
    </ErrorBoundary>
  );
}
