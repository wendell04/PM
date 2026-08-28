'use client';

/**
 * SALES
 *
 * Two views over the same filtered set. The List is transactional - find an order, see how it was
 * settled. Reports is the management read: what came in, how much of it we kept, and whether that
 * beats the period before.
 *
 * Revenue is measured excluding shipping, which is collected for the courier and is not income.
 * Cost of goods comes from the Sale collection, where CostResolver has already walked the bill of
 * materials for each line; the order documents carry no cost, which is why margin was missing here
 * for so long. Margin is shown only when the two datasets describe the same population.
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
  // ONE design fee per order, not one per line. Every requested line carries the same fee for
  // display, so summing them charged the order twice over: a 2-item request showed P200 and, because
  // the subtotal is derived by subtraction, quietly moved P100 out of the goods. The order records
  // what was actually collected - use that, and fall back to the order-level figure.
  const designFee = Number(o.designFeePaidAmount ?? o.designFee ?? 0)
    || (o.items || []).reduce((mx, i) => Math.max(mx, Number(i.designFee ?? 0)), 0);
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
function OrderExpandRow({ order, colSpan, cost }) {
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
            {order.items?.length > 0 ? order.items.map((item, i) => {
              // What this line cost to make, from the stock movements that name this order and
              // product. Revenue without it is only half the story, and it is the half that flatters.
              const key      = String(item.productId ?? '') || ('name:' + String(item.productName ?? 'unknown'));
              const lineCost = cost?.byProduct?.[key];
              const revenue  = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
              const profit   = lineCost !== undefined ? revenue - Number(lineCost) : null;
              return (
              <div key={i} style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', color: 'var(--white)', fontWeight: 600 }}>{item.productName}</div>
                <div style={{ fontSize: '12px', color: 'var(--gray)' }}>
                  {item.variant ? `${item.variant} × ${item.quantity}` : `× ${item.quantity}`} &middot; {formatPrice(item.unitPrice || 0)} each
                </div>
                {profit !== null && (
                  <div style={{ fontSize: '11.5px', marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--gray)' }}>cost {formatPrice(lineCost)}</span>
                    <span style={{ color: profit >= 0 ? 'var(--st-green-fg)' : '#c2410c', fontWeight: 700 }}>
                      profit {formatPrice(profit)}
                      {revenue > 0 && ` (${Math.round((profit / revenue) * 100)}%)`}
                    </span>
                  </div>
                )}
              </div>
              );
            }) : (
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

            {/* Shipping is collected for the courier, so it is never counted as income here. */}
            {cost?.total !== undefined && (() => {
              const income = (Number(order.totalPrice) || 0) - (Number(order.shipping) || 0);
              const gp     = income - Number(cost.total);
              return (
                <>
                  <div style={{ ...line, marginTop: '6px' }}>
                    <span style={{ color: 'var(--gray)' }}>Cost of goods</span>
                    <span style={{ color: 'var(--gray-light)' }}>{formatPrice(cost.total)}</span>
                  </div>
                  <div style={line}>
                    <span style={{ color: 'var(--gray)', fontWeight: 700 }}>Gross profit</span>
                    <span style={{ color: gp >= 0 ? 'var(--st-green-fg)' : '#c2410c', fontWeight: 700 }}>
                      {formatPrice(gp)}{income > 0 && ` (${Math.round((gp / income) * 100)}%)`}
                    </span>
                  </div>
                </>
              );
            })()}
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

// ── Reports view ──────────────────────────────────────────────────────────────
// A sales report is read for three things: how much came in, how much of it we kept, and whether
// that is better or worse than last period. Figures are right-aligned tabular numerals so columns
// scan vertically, and every derived number states its basis in the footnote rather than being
// dressed up in colour.

const num = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };
const pct = (v) => `${(v * 100).toFixed(1)}%`;

/** Period-over-period change, rendered small and muted. Absent when there is no comparable base. */
function Delta({ current, previous, invert = false }) {
  if (previous === null || previous === undefined || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  if (!isFinite(change)) return null;
  const up = change >= 0;
  const good = invert ? !up : up;
  return (
    <span style={{ ...num, fontSize: '11px', fontWeight: 600, color: good ? 'var(--st-green-fg)' : 'var(--st-red-fg)' }}>
      {up ? '▲' : '▼'} {Math.abs(change * 100).toFixed(1)}%
    </span>
  );
}

/** A single headline figure. Deliberately plain: label, value, one line of basis, optional delta. */
function Metric({ label, value, basis, delta, emphasis = false }) {
  return (
    <div style={{ flex: '1 1 170px', minWidth: '150px', padding: '14px 16px', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', borderTop: emphasis ? '2px solid var(--gold)' : '1px solid var(--border)' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--gray)' }}>{label}</div>
      <div style={{ ...num, fontSize: '20px', fontWeight: 700, color: 'var(--white)', margin: '6px 0 3px', lineHeight: 1.1 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {delta}
        <span style={{ fontSize: '11px', color: 'var(--gray)' }}>{basis}</span>
      </div>
    </div>
  );
}

function Panel({ title, note, children }) {
  return (
    <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--white)' }}>{title}</span>
        {note && <span style={{ fontSize: '11px', color: 'var(--gray)' }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

function DataTable({ rows, cols, empty = 'No data in this period' }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map((c, i) => <th key={i} style={{ ...S.th, textAlign: i === 0 ? 'left' : 'right' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ padding: '20px', textAlign: 'center', color: 'var(--gray)', fontSize: '13px' }}>{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} style={S.tr}>
              {cols.map((c, j) => (
                <td key={j} style={{ ...S.td, ...(j === 0 ? {} : num), textAlign: j === 0 ? 'left' : 'right' }}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportsView({ reports, hasCostData }) {
  const { revenue, cost, profit, margin, units, orders, aov, bestSellers, byCategory, byPayment, byMonth, prev } = reports;
  const maxMonth = Math.max(1, ...byMonth.map(x => x.revenue));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Metric label="Net Revenue" value={formatPrice(revenue)} basis="excl. shipping" emphasis
          delta={<Delta current={revenue} previous={prev?.revenue} />} />
        <Metric label="Cost of Goods" value={hasCostData ? formatPrice(cost) : 'n/a'} basis={hasCostData ? 'materials at BOM cost' : 'no cost recorded'} />
        <Metric label="Gross Profit" value={hasCostData ? formatPrice(profit) : 'n/a'} basis={hasCostData ? 'revenue less cost' : 'needs cost data'}
          delta={hasCostData ? <Delta current={profit} previous={prev?.profit} /> : null} />
        <Metric label="Gross Margin" value={hasCostData ? pct(margin) : 'n/a'} basis={hasCostData ? 'profit over revenue' : 'needs cost data'} />
        <Metric label="Orders" value={orders} basis="excludes cancelled"
          delta={<Delta current={orders} previous={prev?.orders} />} />
        <Metric label="Average Order" value={formatPrice(aov)} basis={`${units} unit${units === 1 ? '' : 's'} sold`}
          delta={<Delta current={aov} previous={prev?.aov} />} />
      </div>

      <Panel title="Revenue by month" note={byMonth.length ? `${byMonth.length} month${byMonth.length === 1 ? '' : 's'}` : null}>
        {byMonth.length === 0 ? (
          <div style={{ padding: '20px', color: 'var(--gray)', fontSize: '13px', textAlign: 'center' }}>No data in this period</div>
        ) : (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {byMonth.map((mo, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ ...num, width: '64px', fontSize: '12px', color: 'var(--gray)', flexShrink: 0 }}>{mo.name}</span>
                <div style={{ flex: 1, height: '14px', background: 'var(--dark)', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
                  <div title={`Revenue ${formatPrice(mo.revenue)}`} style={{ width: `${(mo.revenue / maxMonth) * 100}%`, background: 'var(--gold)' }} />
                </div>
                <span style={{ ...num, width: '46px', textAlign: 'right', fontSize: '12px', color: 'var(--gray)', flexShrink: 0 }}>{mo.orders}</span>
                <span style={{ ...num, width: '104px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--white)', flexShrink: 0 }}>{formatPrice(mo.revenue)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', marginTop: '2px', fontSize: '10px', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              <span style={{ width: '64px', flexShrink: 0 }}>Month</span>
              <span style={{ flex: 1 }} />
              <span style={{ width: '46px', textAlign: 'right', flexShrink: 0 }}>Orders</span>
              <span style={{ width: '104px', textAlign: 'right', flexShrink: 0 }}>Revenue</span>
            </div>
          </div>
        )}
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '14px' }}>
        <Panel title="Best sellers" note="top 10 by revenue">
          <DataTable rows={bestSellers} cols={[
            { label: 'Product', render: r => r.name },
            { label: 'Units',   render: r => r.qty },
            { label: 'Revenue', render: r => formatPrice(r.revenue) },
          ]} />
        </Panel>

        <Panel title="Category performance">
          <DataTable rows={byCategory} cols={[
            { label: 'Category', render: r => r.name },
            { label: 'Units',    render: r => r.qty },
            { label: 'Revenue',  render: r => formatPrice(r.revenue) },
            { label: 'Share',    render: r => revenue > 0 ? pct(r.revenue / revenue) : '—' },
          ]} />
        </Panel>

        <Panel title="Settlement status" note="how the revenue is collected">
          <DataTable rows={byPayment} cols={[
            { label: 'Status',  render: r => STATUS_LABEL[r.name] || r.name },
            { label: 'Orders',  render: r => r.count },
            { label: 'Revenue', render: r => formatPrice(r.revenue) },
          ]} />
        </Panel>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--gray)', lineHeight: 1.6 }}>
        Net revenue excludes shipping, which is collected on behalf of the courier and is not income.
        Cancelled orders are excluded throughout.
        {hasCostData
          ? ' Cost of goods is resolved per line from the product bill of materials at the time of sale, so margin reflects what the materials actually cost rather than a list price.'
          : ' Cost of goods is unavailable for this period, so profit and margin are not shown. Sale records carry cost only from the point the order completes.'}
        {' '}Comparisons are against the immediately preceding period of the same length.
      </div>
    </div>
  );
}

export default function SalesListPage() {
  const { token } = useAuth();
  const [sales, setSales] = useState([]);
  const [saleLines, setSaleLines] = useState([]);   // Sale collection - carries cost + profit per line
  // What each order really cost to make, from the stock movements attributed to it. Sale records only
  // exist for POS sales, so without this every storefront order was revenue with no cost against it.
  const [costByOrder, setCostByOrder] = useState({});
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
      const auth = { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } };
      try {
        const res = await fetch(`${API_URL}/api/admin/orders`, auth);
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

      // Sale records carry the resolved cost of goods per line (CostResolver walks the BOM), which the
      // order documents do not. Margin reporting reads from here. A failure is non-fatal: the report
      // still renders revenue, and says plainly that cost data is unavailable.
      try {
        const r = await fetch(`${API_URL}/api/admin/sales?limit=10000`, auth);
        const d = await r.json();
        setSaleLines(r.ok && Array.isArray(d.data) ? d.data : []);
      } catch { setSaleLines([]); }

      try {
        const r = await fetch(`${API_URL}/api/admin/orders/cost-of-goods`, auth);
        const d = await r.json();
        setCostByOrder(r.ok && d.data && typeof d.data === 'object' ? d.data : {});
      } catch { setCostByOrder({}); }
    }
    loadData();
  }, [token]);

  const toggleExpand = (id) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  useEffect(() => { setSPage(1); }, [searchQuery, paymentFilter, dateFilter, customDateRange]);

  // Everything the period and the search allow, BEFORE the status filter. The summary cards read from
  // here: they were computed over ALL sales, so picking January showed an empty table above cards
  // still reporting the whole year. They cannot read `filteredSales` either - the cards double as the
  // status filter, and clicking "Paid" would then zero out every other card.
  const scopedSales = useMemo(() => {
    return sales.filter(order => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q
        || order.customerName?.toLowerCase().includes(q)
        || order.orderNumber?.toLowerCase().includes(q);

      const orderDate = new Date(order.orderDate);
      const today = new Date(); today.setHours(0, 0, 0, 0); orderDate.setHours(0, 0, 0, 0);
      let matchesDate = true;
      if (dateFilter === 'today') matchesDate = orderDate.getTime() === today.getTime();
      else if (dateFilter === 'this-week') matchesDate = orderDate >= new Date(today.getTime() - 7 * 864e5);
      else if (dateFilter === 'this-month') matchesDate = orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear();
      else if (dateFilter === 'custom') matchesDate = orderDate.getFullYear() === customDateRange.year && orderDate.getMonth() >= customDateRange.fromMonth && orderDate.getMonth() <= customDateRange.toMonth;

      return matchesSearch && matchesDate;
    });
  }, [sales, searchQuery, dateFilter, customDateRange]);

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
    const active    = scopedSales.filter(o => o.status !== 'cancelled');
    const paid      = active.filter(o => o.paymentStatus === 'paid' || o.balance === 0);
    const partial   = active.filter(o => o.downPayment > 0 && o.balance > 0);
    const cancelled = scopedSales.filter(o => o.status === 'cancelled');
    const products  = new Set();
    active.forEach(o => o.items?.forEach(i => { if (i.productId) products.add(i.productId); }));
    return {
      totalSales: active.length, paid: paid.length, pending50: partial.length, cancelled: cancelled.length,
      revenue: active.reduce((s, o) => s + Math.max(0, (o.totalPrice || 0) - (o.shipping || 0)), 0),
      shippingCollected: active.reduce((s, o) => s + (o.shipping || 0), 0),
      outstanding: active.reduce((s, o) => s + (o.balance || 0), 0),
      topProductsCount: products.size,
    };
  }, [scopedSales]);

  // The window the current date filter describes, and the equally long window immediately before it.
  // "All time" has no comparable base, so it returns nulls and the deltas simply do not render.
  const periods = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = 864e5;
    let start = null, end = null;
    if (dateFilter === 'today') { start = new Date(today); end = new Date(today.getTime() + day - 1); }
    else if (dateFilter === 'this-week') { start = new Date(today.getTime() - 7 * day); end = new Date(today.getTime() + day - 1); }
    else if (dateFilter === 'this-month') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59); }
    else if (dateFilter === 'custom') {
      start = new Date(customDateRange.year, customDateRange.fromMonth, 1);
      end = new Date(customDateRange.year, customDateRange.toMonth + 1, 0, 23, 59, 59);
    }
    if (!start || !end) return { start: null, end: null, prevStart: null, prevEnd: null };
    const span = end.getTime() - start.getTime();
    return { start, end, prevStart: new Date(start.getTime() - span - 1), prevEnd: new Date(start.getTime() - 1) };
  }, [dateFilter, customDateRange]);

  // Cost of goods lives on Sale records, not on orders. Aggregating the two together is only honest
  // when both cover the same population, so margin is withheld while a search or payment filter is
  // narrowing the order list but not the sale lines.
  // Real cost for the orders on screen, plus how much of that population it actually covers. A margin
  // computed over partial coverage is not conservative, it is simply wrong - and wrong in the
  // flattering direction, which is the worst kind.
  const orderCost = useMemo(() => {
    const active = filteredSales.filter(o => o.status !== 'cancelled');
    let total = 0, covered = 0;
    for (const o of active) {
      const c = costByOrder[String(o.id ?? o._id ?? '')];
      if (c === undefined) continue;
      // The endpoint returns { total, byProduct } per order, not a bare number. Reading it as a
      // number gave NaN, fell back to 0, and every order reported zero cost - which is why the
      // report showed a 100% margin on goods that cost P826 to make.
      total += Number(c.total) || 0;
      covered += 1;
    }
    return { total: Math.round(total * 100) / 100, covered, population: active.length };
  }, [filteredSales, costByOrder]);

  const costWindow = useMemo(() => {
    const inWindow = (d) => {
      if (!periods.start) return true;
      const t = new Date(d).getTime();
      return t >= periods.start.getTime() && t <= periods.end.getTime();
    };
    const lines = saleLines.filter(l => l.status !== 'cancelled' && inWindow(l.saleDate ?? l.createdAt));
    return {
      cost:   lines.reduce((s, l) => s + Number(l.cost ?? 0), 0),
      profit: lines.reduce((s, l) => s + Number(l.profit ?? 0), 0),
      count:  lines.length,
    };
  }, [saleLines, periods]);

  // Prefer the order-attributed figure. It is only honest when EVERY active order in the window has
  // cost recorded; anything less mixes orders that carry cost with orders that do not, which is what
  // made the margin read far too high.
  const useOrderCost = orderCost.population > 0 && orderCost.covered === orderCost.population;
  const hasCostData  = (useOrderCost || costWindow.count > 0) && !searchQuery && !paymentFilter;

  // ── Reports aggregation (respects the current search/date/payment filters via filteredSales) ──
  const reports = useMemo(() => {
    const active = filteredSales.filter(o => o.status !== 'cancelled');
    const goods = (o) => Math.max(0, (o.totalPrice || 0) - (o.shipping || 0));
    const revenue = active.reduce((s, o) => s + goods(o), 0);
    const units   = active.reduce((s, o) => s + (o.quantity || 0), 0);
    const orders  = active.length;
    const aov     = orders > 0 ? revenue / orders : 0;
    // Prefer the cost attributed to these very orders. `costWindow` reads the Sale collection, which
    // only the POS writes - against revenue counted from ALL orders, that mismatch showed a margin far
    // higher than reality, because every storefront order contributed sales with no cost beside them.
    const cost    = !hasCostData ? 0 : (useOrderCost ? orderCost.total : costWindow.cost);
    const profit  = !hasCostData ? 0 : (useOrderCost ? Math.round((revenue - orderCost.total) * 100) / 100 : costWindow.profit);
    const margin  = hasCostData && revenue > 0 ? profit / revenue : 0;

    // Same measures over the preceding window, for the period-over-period deltas.
    let prev = null;
    if (periods.prevStart) {
      const inPrev = sales.filter(o => {
        if (o.status === 'cancelled') return false;
        const t = new Date(o.orderDate).getTime();
        return t >= periods.prevStart.getTime() && t <= periods.prevEnd.getTime();
      });
      const pRev = inPrev.reduce((s, o) => s + goods(o), 0);
      const pProfit = saleLines
        .filter(l => l.status !== 'cancelled')
        .filter(l => {
          const t = new Date(l.saleDate ?? l.createdAt).getTime();
          return t >= periods.prevStart.getTime() && t <= periods.prevEnd.getTime();
        })
        .reduce((s, l) => s + Number(l.profit ?? 0), 0);
      prev = { revenue: pRev, orders: inPrev.length, aov: inPrev.length ? pRev / inPrev.length : 0, profit: hasCostData ? pProfit : null };
    }

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

    return { revenue, cost, profit, margin, units, orders, aov, bestSellers, byCategory, byPayment, byMonth, prev };
  }, [filteredSales, sales, saleLines, periods, hasCostData, costWindow, useOrderCost, orderCost]);

  // ONE ROW PER PRODUCT LINE, not per order. The old export squashed every item into a single
  // "Custom Mug x10; Canvas Totebag x10" cell with one subtotal, which cannot answer the only
  // question a sales export exists for: which product actually makes money. Cost comes from the stock
  // movements attributed to that order and product, so profit here is real rather than a list price.
  const buildExportRows = () => {
    const header = [
      'Order Ref', 'Date', 'Customer', 'Product', 'Variant', 'Qty',
      'Unit Price', 'Line Revenue', 'Unit Cost', 'Line Cost', 'Line Profit', 'Margin %',
      'Order Total', 'Design Fee', 'Shipping', 'Payment Status',
    ];

    const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

    const dataRows = [];
    for (const o of filteredSales) {
      const entry  = costByOrder[String(o.id ?? o._id ?? '')] ?? null;
      const byProd = entry?.byProduct ?? {};
      const items  = o.items || [];
      // Order-level values belong to the ORDER, not to each of its lines. Repeating them made the
      // Shipping column sum to P215.78 on a single P107.89 delivery, and the Total to twice the
      // order. They are written on the first line of each order and left blank on the rest, so every
      // column in the file adds up to the real figure.
      let firstLine = true;

      for (const i of items) {
        const qty       = Number(i.quantity) || 0;
        const unitPrice = Number(i.unitPrice ?? i.price ?? 0);
        const revenue   = n2(unitPrice * qty);

        // The stock rows are keyed by productId, falling back to the name they recorded.
        const key      = String(i.productId ?? '') || ('name:' + String(i.productName ?? 'unknown'));
        const lineCost = byProd[key] !== undefined ? n2(byProd[key]) : null;
        const unitCost = lineCost !== null && qty > 0 ? n2(lineCost / qty) : null;
        const profit   = lineCost !== null ? n2(revenue - lineCost) : null;
        const margin   = profit !== null && revenue > 0 ? n2((profit / revenue) * 100) : null;

        dataRows.push([
          o.orderNumber,
          new Date(o.orderDate).toLocaleDateString(),
          o.customerName,
          i.productName ?? '',
          i.variantName ?? i.variant ?? '',
          qty,
          n2(unitPrice),
          revenue,
          // Blank rather than 0 when there is no cost recorded. A zero here would read as "free to
          // make" and quietly inflate every profit figure computed from this file.
          unitCost ?? '',
          lineCost ?? '',
          profit   ?? '',
          margin   ?? '',
          firstLine ? n2(o.totalPrice) : '',
          firstLine ? n2(o.designFee)  : '',
          firstLine ? n2(o.shipping)   : '',
          firstLine ? o.status         : '',
        ]);
        firstLine = false;
      }
    }
    // A totals line, so the file answers the question without anyone building a formula. Only the
    // columns meaningful to add appear; averaging a margin column would be wrong, so the overall
    // margin is derived from the totals instead.
    const sum = (idx) => dataRows.reduce((t, r) => t + (Number(r[idx]) || 0), 0);
    const tQty = sum(5), tRev = sum(7), tCost = sum(9), tProfit = sum(10);
    const totals = [
      'TOTAL', '', '', '', '', tQty, '', n2(tRev), '', n2(tCost), n2(tProfit),
      tRev > 0 ? n2((tProfit / tRev) * 100) : '', n2(sum(12)), n2(sum(13)), n2(sum(14)), '',
    ];

    return { header, dataRows, totals };
  };

  const download = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const { header, dataRows, totals } = buildExportRows();
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...dataRows, totals].map(r => r.map(esc).join(',')).join(String.fromCharCode(10));
    download(new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `sales-report-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  /**
   * Excel export.
   *
   * CSV is plain text and cannot carry colour, so highlighting has to live in a real spreadsheet.
   * This writes an HTML table with inline styles, which Excel opens natively and renders with
   * formatting - no spreadsheet library added to the bundle for one report.
   *
   * Excel may warn that the extension does not match the format when opening. That is expected and
   * the file is sound; the alternative was a dependency.
   */
  const exportExcel = () => {
    const { header, dataRows, totals } = buildExportRows();
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Profit is the column worth scanning, so it is the one coloured - graded by MARGIN rather than
    // amount, since a big number on a big order is not the same thing as a good one.
    const profitStyle = (row) => {
      const margin = Number(row[11]);
      // An un-costed order writes '' here, and Number('') is 0, not NaN - so without the empty check
      // a blank margin slips past isFinite and gets painted red as a loss. Missing data, not a loss.
      if (row[11] === '' || !Number.isFinite(margin)) return '';
      if (margin >= 50) return 'background:#d9ead3;color:#0b5c25;font-weight:bold;';
      if (margin >= 25) return 'background:#fff2cc;color:#7a5c00;font-weight:bold;';
      return 'background:#f9d5d3;color:#8c1d18;font-weight:bold;';
    };

    const th = 'background:#1a1a1a;color:#ffffff;font-weight:bold;padding:6px;border:1px solid #444;';
    const td = 'padding:5px;border:1px solid #ddd;';

    // A heavier rule where the order ref changes. On a multi-item order the reader was left working
    // out by eye where one order stopped and the next began - and the order-level columns, written on
    // the first line only, read as though the second line had no shipping rather than sharing the
    // first line's. One line does the whole job; nothing else about the layout needs to move.
    const body = dataRows.map((r, idx) => {
      const startsOrder = idx === 0 || r[0] !== dataRows[idx - 1][0];
      const edge = startsOrder ? 'border-top:2px solid #333;' : '';
      return '<tr>' + r.map((c, i) =>
        `<td style="${td}${edge}${i === 10 ? profitStyle(r) : ''}">${esc(c)}</td>`).join('') + '</tr>';
    }).join('');

    const foot = '<tr>' + totals.map(c =>
      `<td style="${td}background:#f0f0f0;font-weight:bold;border-top:2px solid #333;">${esc(c)}</td>`).join('') + '</tr>';

    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
      <table style="border-collapse:collapse;font-family:Calibri,sans-serif;font-size:11pt">
        <thead><tr>${header.map(h => `<th style="${th}">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${body}${foot}</tbody>
      </table></body></html>`;

    download(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
      `sales-report-${new Date().toISOString().slice(0, 10)}.xls`);
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
      <div style={S.page}>

        {/* Money first, then the status counts that also act as filters. Two rows rather than eight
            equal cards, so the eye lands on revenue instead of scanning a wall of numbers. */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <SummaryCard label="Total Revenue"      value={formatPrice(m.revenue)}           sub="Excludes shipping" accent />
          <SummaryCard label="Outstanding"        value={formatPrice(m.outstanding)}       sub="Unpaid balances"   color={m.outstanding > 0 ? 'var(--gold)' : undefined} />
          {/* "Owed to courier" claimed the shop owes exactly this. It does not: the customer was charged
              an ESTIMATE at checkout, and what the courier actually bills on the day will differ. What is
              true is that this money came in for delivery and is not income, which is why Total Revenue
              excludes it. Under Courier Booked this is zero - the rider collects from the recipient. */}
          <SummaryCard label="Shipping Collected" value={formatPrice(m.shippingCollected)} sub="Held for delivery, not income" color="var(--st-blue-fg)" />
          <SummaryCard label="Products Sold"      value={m.topProductsCount}               sub="Distinct products" color="var(--st-purple-fg)" />
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {FILTER_CARDS.map(c => (
            <div key={c.id || 'all'} onClick={() => { setPaymentFilter(c.id); setSPage(1); }} style={{ cursor: 'pointer', flex: '1', minWidth: '140px' }}>
              <SummaryCard label={c.label} value={c.value}
                accent={paymentFilter === c.id}
                color={paymentFilter === c.id ? 'var(--gold)' : (c.color || undefined)} />
            </div>
          ))}
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
            {/* Two formats because they answer different needs: CSV is the portable one that any
                tool can read, Excel is the one a person opens and looks at. */}
            <button type="button" onClick={exportCsv}
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Export CSV
            </button>
            <button type="button" onClick={exportExcel} title="Same data, with the profit column colour-coded by margin"
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Export Excel
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
                  {TH('Date', 4)}{TH('Total', 5, true)}{TH('Paid', 6, true)}{TH('Balance', 7, true)}{TH('Status', 8, true)}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <>
                    <style>{`@keyframes pmPulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
                    {[0, 1, 2, 3, 4].map(r => (
                      <tr key={`sk${r}`}>{Array.from({ length: 9 }).map((_, c) => (
                        <td key={c} style={S.td}><div style={{ height: 12, borderRadius: 4, background: 'var(--dark2)', animation: 'pmPulse 1.4s ease-in-out infinite', width: c === 0 ? '16px' : c === 2 ? '80%' : '55%' }} /></td>
                      ))}</tr>
                    ))}
                  </>
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
                          {/* The header said "Downpayment" while the cell said "Paid in full" - a word
                              where a figure belongs, under a heading it no longer matched. The column
                              answers one question, how much has been received, so it shows that
                              amount and lets the Balance beside it say what is left. */}
                          {cancelled ? <span style={{ color: 'var(--gray)' }}>—</span>
                            : fullyPaid ? (
                              <>
                                <span style={{ fontWeight: 700, color: 'var(--st-green-fg)' }}>{formatPrice(order.totalPrice)}</span>
                                <div style={{ fontSize: '11px', color: 'var(--st-green-fg)' }}>in full</div>
                              </>
                            )
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
                      {isExpanded && <OrderExpandRow order={order} colSpan={9} cost={costByOrder[String(order.id ?? order._id ?? "")]} />}
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

        {view === 'reports' && !isLoading && <ReportsView reports={reports} hasCostData={hasCostData} />}
      </div>
    </ErrorBoundary>
  );
}
