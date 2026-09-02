'use client';

// A second dashboard, deliberately alongside the old one rather than replacing it, so the two
// can be compared before anything is thrown away.
//
// Two things are different in kind, not just in styling:
//
// 1. It follows the READER - and that means two genuinely different pages, not one page with
//    fewer tiles. A launchpad is right for STAFF: a production hand wants their queue and the
//    three modules they can open, and revenue is none of their business. It is wrong for the
//    OWNER, who is not looking for a door - they already know where everything is - but for
//    insight: what came in, where it is heading, what is stuck. Building one page for both is
//    what made this feel thin to the person who owns the shop.
//
// 2. It leads with what is BLOCKED. The old page opens with six sections of totals. A shop owner
//    opening this at 6am is not asking "how did the quarter go" - they are asking what is stuck
//    and what has to be bought. Totals answer neither, and every one of them already has its own
//    module.
//
// It also costs a fraction of the old one to load: that page pulls 2,000 orders, every inventory
// row, banners, returns, movements and 10,000 sales on every visit.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { S, ICONS, SummaryCard, EmptyState, Note } from '../inventory-v2/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const SSA_API_URL = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';
const peso = (v) => '₱' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Every module a person can be given, with the permission key the sidebar already uses. Kept in
// one list so a tile can never appear for a module the API would refuse.
const MODULES = [
  { key: 'orders',      name: 'Orders',        href: '/dashboard/business/orders',        d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'orderRequests', name: 'Order Requests', href: '/dashboard/business/order-requests', d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'jobOrders',   name: 'Job Orders',    href: '/dashboard/business/job-orders',    d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'production',  name: 'Production',    href: '/dashboard/business/production',    d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  { key: 'qualityControl', name: 'Quality Control', href: '/dashboard/business/quality-control', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'inventory',   name: 'Inventory',     href: '/dashboard/business/inventory-v2',  d: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key: 'inventory',   name: 'To Buy',        href: '/dashboard/business/to-buy',        d: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17' },
  { key: 'products',    name: 'Catalog',       href: '/dashboard/business/products-v2',   d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { key: 'payments',    name: 'Payments',      href: '/dashboard/business/payments',      d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { key: 'sales',       name: 'Sales',         href: '/dashboard/business/sales',         d: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z' },
  { key: 'chat',        name: 'Messages',      href: '/dashboard/business/chat',          d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { key: 'customers',   name: 'Customers',     href: '/dashboard/business/customers',     d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { key: 'reports',     name: 'Reports',       href: '/dashboard/business/reports',       d: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'settings',    name: 'Settings',      href: '/dashboard/business/settings',      d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
];

const SUPER = ['superAdmin', 'admin', 'owner'];

export default function StaffHome() {
  const router = useRouter();
  const { token, currentUser } = useAuth();

  const [orders, setOrders]   = useState([]);
  const [toBuy, setToBuy]     = useState(null);
  const [perms, setPerms]     = useState(null);
  const [sales, setSales]     = useState([]);
  const [unread, setUnread]   = useState(0);
  const [ssa, setSsa]         = useState(undefined);   // undefined = not asked, null = unavailable
  const [months, setMonths]   = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    // Settled, not all-or-nothing: a reader who cannot see inventory must still get their orders,
    // and the old page rendered zeros when a single call failed.
    const [o, b, p, c, sl] = await Promise.allSettled([
      fetchWithTimeout(`${API_URL}/api/admin/orders?limit=300`, { headers }, 20000),
      fetchWithTimeout(`${API_URL}/api/admin/inventory/to-buy`, { headers }, 20000),
      fetchWithTimeout(`${API_URL}/api/my/permissions`, { headers }, 15000),
      fetchWithTimeout(`${API_URL}/api/chat/conversations`, { headers }, 15000),
      // The whole trading history, counter sales included. Orders alone are the online store.
      fetchWithTimeout(`${API_URL}/api/admin/sales?limit=10000&status=completed`, { headers }, 25000),
    ]);
    try {
      if (o.status === 'fulfilled' && o.value.ok) {
        const j = await o.value.json();
        setOrders(Array.isArray(j?.data) ? j.data : (j?.data?.orders ?? j?.orders ?? []));
      } else {
        setError('Could not load orders. The figures below are incomplete - this is not a real zero.');
      }
      if (b.status === 'fulfilled' && b.value.ok) {
        const j = await b.value.json();
        setToBuy(j?.data ?? null);
      }
      if (p.status === 'fulfilled' && p.value.ok) {
        const j = await p.value.json();
        setPerms(j?.data ?? j ?? null);
      }
      // Somebody waiting on a reply is a thing that needs doing, so it belongs with the other
      // things that need doing rather than only as a number on a nav icon.
      if (sl.status === 'fulfilled' && sl.value.ok) {
        const j = await sl.value.json();
        setSales(Array.isArray(j?.data ?? j) ? (j.data ?? j) : []);
      }
      if (c.status === 'fulfilled' && c.value.ok) {
        const j = await c.value.json();
        const convos = Array.isArray(j?.data) ? j.data : (j?.data?.conversations ?? []);
        setUnread(convos.reduce((a, x) => a + Number(x.unread_count ?? 0), 0));
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const isSuper = SUPER.includes(currentUser?.role);
  const allows = useCallback((key) => {
    if (isSuper) return true;
    if (!perms) return false;
    const g = perms?.[key] ?? perms?.permissions?.[key];
    return g === true || (g && typeof g === 'object' && Object.values(g).some(Boolean));
  }, [perms, isSuper]);

  // ── What is stuck. Derived from the orders already fetched, so no extra calls. ──
  const blocked = useMemo(() => {
    const st = (o) => String(o.orderStatus ?? o.status ?? '').toLowerCase();
    const open = orders.filter(o => !['delivered', 'cancelled', 'returned'].includes(st(o)));
    const rows = [];

    const awaitingDesign = open.filter(o =>
      ['pending_review', 'pending_design'].includes(String(o.designStatus ?? '')) ||
      ['draft_ready', 'proof_sent'].includes(String(o.designStatus ?? '')));
    if (awaitingDesign.length) rows.push({
      n: awaitingDesign.length, label: 'design waiting on you or the customer',
      sub: 'Nothing can be produced until the artwork is approved.',
      href: '/dashboard/business/orders', tone: 'warn',
    });

    const paidNoJob = open.filter(o =>
      ['paid', 'partial'].includes(String(o.paymentStatus ?? '')) &&
      !(o.productionJobs?.length) && !o.joId &&
      ['processing', 'pending'].includes(st(o)));
    if (paidNoJob.length) rows.push({
      n: paidNoJob.length, label: 'paid but no job order yet',
      sub: 'The customer has paid and the clock is running, but nothing has reached the bench.',
      href: '/dashboard/business/job-orders', tone: 'warn',
    });

    const late = open.filter(o => {
      const d = o.estimatedDeliveryMax ?? o.estimatedDelivery;
      return d && new Date(d) < new Date();
    });
    if (late.length) rows.push({
      n: late.length, label: 'past their promised delivery date',
      sub: 'The date the customer was given has already gone.',
      href: '/dashboard/business/orders', tone: 'bad',
    });

    const owed = open.filter(o => Number(o.refundOwed ?? 0) > 0);
    if (owed.length) rows.push({
      n: owed.length, label: 'have money owed back to the customer',
      sub: 'Cancelled or rush-declined after payment. The system cannot send it - you must.',
      href: '/dashboard/business/orders', tone: 'bad',
    });

    return rows;
  }, [orders]);

  const money = useMemo(() => {
    const st = (o) => String(o.orderStatus ?? o.status ?? '').toLowerCase();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let collected = 0, outstanding = 0;
    for (const o of orders) {
      const paid = Math.max(
        Number(o.downPayment ?? 0),
        (o.paymentHistory ?? []).reduce((a, p) => a + Number(p.amount ?? 0), 0)
      );
      const created = o.createdAt ? new Date(o.createdAt) : null;
      if (created && created >= monthStart && st(o) !== 'cancelled') collected += paid;
      if (!['delivered', 'cancelled', 'returned'].includes(st(o))) {
        outstanding += Math.max(0, Number(o.totalAmount ?? 0) - paid);
      }
    }
    return { collected, outstanding };
  }, [orders]);

  // Money received per calendar month, from the orders already in hand - no second request.
  const byMonth = useMemo(() => {
    const st = (o) => String(o.orderStatus ?? o.status ?? '').toLowerCase();
    const now = new Date();
    const buckets = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-PH', { month: 'short' }), total: 0, orders: 0 });
    }
    const idx = Object.fromEntries(buckets.map((b, i) => [b.key, i]));
    for (const sale of sales) {
      if (!sale.saleDate) continue;
      const d = new Date(sale.saleDate);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!(k in idx)) continue;
      buckets[idx[k]].total += Number(sale.totalPrice ?? 0);
      buckets[idx[k]].orders += 1;
    }
    return buckets;
  }, [sales, months]);

  const isOwnerView = isSuper || allows('reports') || allows('sales');

  // The forecast the shop's own SSA service produces, asked for only on the owner's view and
  // only once there is enough history for it to mean anything. It runs as a separate local
  // service, so it is genuinely often not up - that has to read as "not running", never as a
  // forecast of zero.
  useEffect(() => {
    if (!isOwnerView || loading) return;

    // Week-start (Monday) buckets of takings, over the last year of trading.
    const weeks = new Map();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 365);
    for (const sale of sales) {
      if (!sale.saleDate) continue;
      const d = new Date(sale.saleDate);
      if (d < cutoff) continue;
      const wk = new Date(d);
      wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));
      const key = `${wk.getFullYear()}-${String(wk.getMonth() + 1).padStart(2, '0')}-${String(wk.getDate()).padStart(2, '0')}`;
      weeks.set(key, (weeks.get(key) ?? 0) + Number(sale.totalPrice ?? 0));
    }
    const rows = [...weeks.entries()].sort().map(([date, value]) => ({ date, value: Math.round(value) }));

    // The service refuses below ten periods and says so clearly; asking anyway just to read its
    // reason back would be a wasted round trip on every load.
    if (rows.length < 10) {
      setSsa({ unavailable: `Needs 10 weeks of sales to forecast from - you have ${rows.length}.` });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SSA_API_URL}/api/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows, forecast_periods: 3, forecast_type: 'weekly', data_type: 'sales' }),
        });
        if (cancelled) return;
        if (res.ok) { setSsa(await res.json()); return; }
        // SSA explains its own refusals well - repeat what it said rather than replacing it
        // with a guess, which is the habit that made every upload error say "try again".
        const j = await res.json().catch(() => ({}));
        setSsa({ unavailable: j?.detail || `The forecast service refused the request (${res.status}).` });
      } catch {
        if (!cancelled) setSsa({ unavailable: 'The forecast service is not running on port 8001.' });
      }
    })();
    return () => { cancelled = true; };
  }, [isOwnerView, loading, sales]);

  const tiles = MODULES.filter(m => allows(m.key));
  const peakMonth = Math.max(1, ...byMonth.map(b => b.total));

  // Which way it is going, from the months on screen: the second half against the first. A chart
  // shows this to someone who studies it; the owner glancing at it before opening the shop wants
  // the answer, and "down" is the answer they most need not to miss.
  const trend = useMemo(() => {
    const vals = byMonth.map(b => b.total);
    if (vals.length < 4) return null;
    const half = Math.floor(vals.length / 2);
    const early = vals.slice(0, half).reduce((a, v) => a + v, 0) / half;
    const late  = vals.slice(half).reduce((a, v) => a + v, 0) / (vals.length - half);
    if (early <= 0) return null;
    const pct = ((late - early) / early) * 100;
    if (Math.abs(pct) < 5) return { dir: 'flat', pct };
    return { dir: pct > 0 ? 'up' : 'down', pct };
  }, [byMonth]);

  const toneStyle = (t) => t === 'bad'
    ? { bg: 'rgba(239,68,68,0.07)', bd: 'rgba(239,68,68,0.28)', fg: '#e05252' }
    : { bg: 'rgba(212,168,67,0.07)', bd: 'rgba(212,168,67,0.28)', fg: 'var(--gold)' };

  return (
    <div style={{ ...S.page, padding: '24px' }}>

      <div style={{ ...S.rowBetween, marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--white)' }}>
            {`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}${currentUser?.firstName ? ', ' + currentUser.firstName : ''}`}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--gray)', marginTop: 2 }}>
            {blocked.length === 0
              ? 'Nothing is blocked. Everything open is moving.'
              : 'Start here - these are the things that are not moving on their own.'}
          </div>
        </div>
        <button type="button" onClick={load} style={S.btnGhost}>{ICONS.reload} Refresh</button>
      </div>

      {error && (
        <div style={{ marginBottom: '14px' }}><Note>{error}</Note></div>
      )}

      {loading && (
        <div style={{ ...S.col, gap: '8px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 64, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 8, animation: 'pmPulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* Money in, money still owed, money about to go out - and, for anyone who reads
              messages, whether somebody is waiting on a reply. */}
          <div style={{ ...S.row, marginBottom: '18px' }}>
            <SummaryCard label="Collected this month" value={peso(money.collected)} accent
              sub="Payments received on orders placed this month" />
            <SummaryCard label="Still owed to you" value={peso(money.outstanding)}
              sub="Across every order not yet delivered" />
            <SummaryCard label="Materials to buy" value={toBuy?.totalItems ?? '-'}
              color={toBuy?.totalItems > 0 ? 'var(--gold)' : 'var(--white)'}
              sub={toBuy ? `About ${peso(toBuy.estimatedCost)} to cover committed work` : 'Needs inventory access'} />
            {allows('chat') && (
              <div onClick={() => router.push('/dashboard/business/chat')}
                style={{ ...S.cardSm, flex: 1, minWidth: '140px', cursor: 'pointer',
                  borderTop: unread > 0 ? '3px solid var(--gold)' : undefined }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }}>Unread messages</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: unread > 0 ? 'var(--gold)' : 'var(--white)' }}>{unread}</div>
                <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '3px' }}>
                  {unread > 0 ? 'Someone is waiting on a reply' : 'Nobody is waiting'}
                </div>
              </div>
            )}
          </div>

          {/* ── Owner view: where the money has been, and where it is heading. Staff never
                 see this block - a production hand cannot act on revenue, and it is not
                 theirs to read. ── */}
          {isOwnerView && (
            <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: '18px' }}>
              <div style={{ ...S.rowBetween, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Money collected</span>
                  {trend && (
                    <span style={{ fontSize: 11.5, marginLeft: 8,
                      color: trend.dir === 'down' ? '#e05252' : trend.dir === 'up' ? '#2e7d32' : 'var(--gray)' }}>
                      {trend.dir === 'flat'
                        ? 'holding steady'
                        : `trending ${trend.dir} ${Math.abs(trend.pct).toFixed(0)}% vs the earlier months`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[3, 6, 12].map(m => (
                    <button key={m} type="button" onClick={() => setMonths(m)}
                      style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12,
                        cursor: 'pointer', fontWeight: months === m ? 600 : 400,
                        background: months === m ? 'var(--gold)' : 'var(--dark)',
                        color: months === m ? '#1a1a1a' : 'var(--gray-light)' }}>
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '18px 16px 10px', height: 150 }}>
                {byMonth.map(b => (
                  <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, color: 'var(--gray)', whiteSpace: 'nowrap' }}>
                      {b.total > 0 ? peso(b.total).replace('.00', '') : ''}
                    </span>
                    {/* A 2px floor so a month with nothing still reads as a month that happened,
                        rather than as a gap in the chart. */}
                    <div title={b.orders + ' order(s)'}
                      style={{ width: '100%', maxWidth: 54, borderRadius: '4px 4px 0 0',
                        background: b.total > 0 ? 'var(--gold)' : 'var(--border)',
                        height: Math.max(2, Math.round((b.total / peakMonth) * 96)) }} />
                    <span style={{ fontSize: 11, color: 'var(--gray)' }}>{b.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>SSA forecast - next 3 weeks</div>
                {ssa === undefined ? (
                  <div style={{ fontSize: 12, color: 'var(--gray)' }}>Asking the forecast service...</div>
                ) : ssa?.unavailable ? (
                  /* The service's own words. A forecast service that cannot answer must never
                     render as a forecast of zero - that is a number somebody would act on. */
                  <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.5 }}>
                    {ssa.unavailable}{' '}
                    <span onClick={() => router.push('/dashboard/business/ssa-forecast')}
                      style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>Open Forecast</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {(ssa.forecast?.dates ?? []).slice(0, 3).map((d, i) => (
                      <div key={d}>
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>
                          week of {new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)' }}>
                          {peso(ssa.forecast.values?.[i] ?? 0).replace('.00', '')}
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: 'var(--gray)', marginLeft: 'auto', maxWidth: 280, lineHeight: 1.5 }}>
                      {ssa.data_quality?.is_low_confidence
                        ? 'Low confidence - too few periods to trust yet.'
                        : ssa.accuracy?.mape != null
                          ? 'Backtested MAPE ' + Number(ssa.accuracy.mape).toFixed(1) + '%.'
                          : 'Projected from your own sales history.'}{' '}
                      <span onClick={() => router.push('/dashboard/business/ssa-forecast')}
                        style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>Full forecast</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Needs you now ── */}
          <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: '18px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>
              Needs you now
            </div>
            {blocked.length === 0 ? (
              <EmptyState icon={ICONS.check} message="Nothing is stuck"
                sub="No order is waiting on a decision, a job order, or a late promise." />
            ) : blocked.map((b, i) => {
              const t = toneStyle(b.tone);
              return (
                <div key={i} onClick={() => router.push(b.href)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', cursor: 'pointer',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)', background: t.bg }}>
                  <div style={{ minWidth: 40, height: 40, borderRadius: 8, border: `1px solid ${t.bd}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, fontWeight: 800, color: t.fg }}>{b.n}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>{b.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 2 }}>{b.sub}</div>
                  </div>
                  <span style={{ color: 'var(--gray)' }}>{ICONS.chevR}</span>
                </div>
              );
            })}
          </div>

          {/* ── The launchpad ── */}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            Your modules
            <span style={{ fontWeight: 400, color: 'var(--gray)', marginLeft: 8, fontSize: 12 }}>
              {isSuper ? 'You have full access.' : 'Only what your role can open.'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 10 }}>
            {tiles.map(m => (
              <div key={m.href} onClick={() => router.push(m.href)}
                style={{ ...S.cardSm, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.7"
                  strokeLinecap="round" strokeLinejoin="round"><path d={m.d} /></svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>{m.name}</span>
              </div>
            ))}
            {tiles.length === 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <EmptyState icon={ICONS.warn} message="No modules are open to your role"
                  sub="Ask an administrator to grant permissions in Role Permissions." />
              </div>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes pmPulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }`}</style>
    </div>
  );
}
