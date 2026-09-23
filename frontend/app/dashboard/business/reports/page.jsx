'use client';

// Reports - three questions a print shop asks, answered so the chart, the table under it and the
// CSV never disagree.
//
//   Sales     what was sold in a period, against the period before it
//   Inventory what the shelf is worth right now, what is short, what left it last month
//   Demand    what the forecast expects (Wendell's SSA; empty until the service answers)
//
// The rules that make it readable, which the old page broke:
//  - The date range is the one control, in one row, above everything. Every number below is
//    the same slice, so they always agree.
//  - Buckets follow the range. A week is shown by day, a quarter by week, a year by month, and
//    a day with no sales is a zero on the chart, not a missing point.
//  - One series is the point (this period, gold); the period before it is context (gray).
//    One axis, one scale, no dual-axis tricks.
//  - Under every chart, the table with the same rows the CSV exports. Print prints the tables.
//  - Money in tiles drops centavos; the exact figure is in the table.

import { useState, useEffect, useCallback, useMemo } from 'react';
import ErrorBoundary from '../../../../components/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { S, TabBar } from '@/app/dashboard/business/inventory-v2/shared';
import { useIsPhone, KpiStrip, BottomSheet, pesoShort } from '@/components/dashboard/phone';
import { useAccess } from '@/contexts/AccessContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const SSA_API_URL = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';

const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num  = (n) => Number(n || 0).toLocaleString('en-PH');
const pct  = (now, before) => {
  if (!before) return now ? 'new' : null;
  const d = ((now - before) / before) * 100;
  return (d >= 0 ? '+' : '') + d.toFixed(d >= 100 ? 0 : 1) + '%';
};

function exportCSV(headers, rows, filename) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Date range ────────────────────────────────────────────────────────────────
// Presets as rows, custom behind them - nobody fights a calendar grid for "last 30 days".
const manila = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PRESETS = [
  { id: 'this-month',  label: 'This month',   range: () => { const n = manila(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; } },
  { id: 'last-month',  label: 'Last month',   range: () => { const n = manila(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]; } },
  { id: 'last-30',     label: 'Last 30 days', range: () => { const n = manila(); const f = new Date(n); f.setDate(f.getDate() - 29); return [iso(f), iso(n)]; } },
  { id: 'last-90',     label: 'Last 90 days', range: () => { const n = manila(); const f = new Date(n); f.setDate(f.getDate() - 89); return [iso(f), iso(n)]; } },
  { id: 'this-year',   label: 'This year',    range: () => { const n = manila(); return [iso(new Date(n.getFullYear(), 0, 1)), iso(n)]; } },
  { id: 'last-year',   label: 'Last year',    range: () => { const n = manila(); return [`${n.getFullYear() - 1}-01-01`, `${n.getFullYear() - 1}-12-31`]; } },
  { id: 'custom',      label: 'Custom' },
];

function RangePicker({ preset, from, to, onChange }) {
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const label = preset === 'custom' ? `${from} to ${to}` : (PRESETS.find(p => p.id === preset)?.label ?? preset);
  const pick = (id) => {
    if (id === 'custom') { onChange({ preset: 'custom', from, to }); return; }
    const [f, t] = PRESETS.find(p => p.id === id).range();
    onChange({ preset: id, from: f, to: t });
    setOpen(false);
  };
  const rows = (
    <>
      {PRESETS.map(p => (
        <button key={p.id} type="button" onClick={() => pick(p.id)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 40, padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: preset === p.id ? 'rgba(212,168,67,0.12)' : 'transparent', color: preset === p.id ? 'var(--gold)' : 'var(--white)', fontSize: 14, fontWeight: preset === p.id ? 700 : 500 }}>
          {p.label}{preset === p.id && <span aria-hidden>&#10003;</span>}
        </button>
      ))}
      {preset === 'custom' && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 4px 4px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
          <input type="date" value={from} max={to} onChange={e => onChange({ preset: 'custom', from: e.target.value, to })} style={{ ...S.input, minHeight: 40 }} aria-label="From" />
          <input type="date" value={to} min={from} onChange={e => onChange({ preset: 'custom', from, to: e.target.value })} style={{ ...S.input, minHeight: 40 }} aria-label="To" />
        </div>
      )}
    </>
  );
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ ...S.btnGhost, minHeight: 40, color: 'var(--white)', gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {isPhone ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Date range">{rows}</BottomSheet>
      ) : open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 400 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 401, width: 300, padding: 6, background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
            {rows}
          </div>
        </>
      )}
    </div>
  );
}

// ── Chart chrome ──────────────────────────────────────────────────────────────
// Colors validated with the dataviz palette checker in both modes: the gold carries this
// period, the gray is the period before it (de-emphasis, not a second category).
const useChartColors = () => {
  const { theme } = useTheme();
  const light = theme === 'light';
  return {
    now:  light ? '#b5861c' : '#d4a843',
    prev: light ? '#c2c2c2' : '#5c5c5c',
    grid: light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
    text: light ? '#6b6b6b' : '#9a9a9a',
  };
};

function ChartTip({ active, payload, label, prevLabel }) {
  if (!active || !payload?.length) return null;
  const now = payload.find(p => p.dataKey === 'revenue');
  const prev = payload.find(p => p.dataKey === 'prev');
  return (
    <div style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--white)', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {now && <div>This period: <b>{peso(now.value)}</b>{now.payload.orders != null && <span style={{ color: 'var(--gray)' }}> - {now.payload.orders} order{now.payload.orders === 1 ? '' : 's'}</span>}</div>}
      {prev && <div style={{ color: 'var(--gray)' }}>{prevLabel || 'Before'}: {peso(prev.value)}{prev.payload.prevLabel && ` (${prev.payload.prevLabel})`}</div>}
    </div>
  );
}

function Card({ title, sub, right, children, print = true }) {
  return (
    <section className={print ? 'rpt-card' : 'rpt-card rpt-noprint'} style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: 14 }}>
      {(title || right) && (
        <div style={{ ...S.rowBetween, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div>
            {sub && <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 2 }}>{sub}</div>}
          </div>
          <div className="rpt-noprint" style={{ display: 'flex', gap: 8 }}>{right}</div>
        </div>
      )}
      {children}
    </section>
  );
}

const cell = { padding: '9px 14px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'middle' };
const th = { ...S.th, fontSize: 10.5 };
const right = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

function Table({ cols: allCols, rows, empty = 'Nothing in this period.' }) {
  // A six-column table scrolls sideways on a phone; the columns marked wide: true (cost, the
  // comparison) are for the desktop and the CSV, and drop off below 700px.
  const isPhone = useIsPhone();
  const cols = isPhone ? allCols.filter(c => !c.wide) : allCols;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="rpt-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map(c => <th key={c.key} style={{ ...th, ...(c.right ? right : {}) }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} style={{ ...cell, color: 'var(--gray)', textAlign: 'center', padding: 24 }}>{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.key ?? i}>
              {cols.map(c => <td key={c.key} style={{ ...cell, ...(c.right ? right : {}), ...(c.strong ? { fontWeight: 600 } : {}), ...(c.muted ? { color: 'var(--gray)' } : {}) }}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sales ─────────────────────────────────────────────────────────────────────
function SalesReport({ token }) {
  const mayExport = useAccess().can('reports.export');
  const isPhone = useIsPhone();
  const colors = useChartColors();
  const [range, setRange] = useState(() => { const [from, to] = PRESETS[0].range(); return { preset: 'this-month', from, to }; });
  const [bucket, setBucket] = useState('auto');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token || !range.from || !range.to) return;
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to, bucket });
      const res = await fetchWithTimeout(`${API_URL}/api/admin/reports/sales?${qs}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 30000);
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || `Request failed (${res.status})`);
      setData(j.data ?? j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, range.from, range.to, bucket]);
  useEffect(() => { load(); }, [load]);

  const t = data?.totals, p = data?.previous;
  const chart = useMemo(() => (data?.series ?? []).map((b, i) => ({
    label: b.label, revenue: b.revenue, orders: b.orders, cost: b.cost, profit: b.profit,
    prev: data.prevSeries?.[i]?.revenue ?? 0, prevLabel: data.prevSeries?.[i]?.label,
  })), [data]);

  const bucketWord = { day: 'day', week: 'week', month: 'month' }[data?.range?.bucket] ?? 'period';
  const exportRows = () => exportCSV(
    ['Period', 'Orders', 'Revenue', 'Cost', 'Gross profit', `Revenue ${data.previousRange.label}`],
    chart.map(r => [r.label, r.orders, r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.prev.toFixed(2)]),
    `sales-${range.from}-to-${range.to}.csv`
  );

  const kpis = t ? [
    { key: 'rev',    label: 'Revenue',      value: isPhone ? pesoShort(t.revenue) : peso(t.revenue), title: peso(t.revenue), delta: pct(t.revenue, p?.revenue) },
    { key: 'orders', label: 'Orders',       value: num(t.orders), delta: pct(t.orders, p?.orders) },
    { key: 'avg',    label: 'Avg order',    value: isPhone ? pesoShort(t.avgOrder) : peso(t.avgOrder), title: peso(t.avgOrder) },
    { key: 'profit', label: 'Gross profit', value: isPhone ? pesoShort(t.profit) : peso(t.profit), title: peso(t.profit), delta: pct(t.profit, p?.profit) },
  ] : [];

  return (
    <>
      {/* The one control row. Everything below is this slice. */}
      <div className="rpt-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <RangePicker preset={range.preset} from={range.from} to={range.to} onChange={setRange} />
        <div style={{ display: 'flex', gap: 2, background: 'var(--dark2)', borderRadius: 8, padding: 3 }}>
          {[['auto', 'Auto'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([id, l]) => (
            <button key={id} type="button" onClick={() => setBucket(id)}
              style={{ minHeight: 34, padding: '0 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                background: bucket === id ? 'var(--dark)' : 'transparent', color: bucket === id ? 'var(--gold)' : 'var(--gray)' }}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {mayExport && (<button type="button" onClick={exportRows} disabled={!data} style={{ ...S.btnGhost, minHeight: 40 }}>Export CSV</button>)}
          <button type="button" onClick={() => window.print()} disabled={!data} style={{ ...S.btnGhost, minHeight: 40 }}>Print</button>
        </div>
      </div>

      {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: 12 }}>{error}</div>}

      <div style={{ opacity: loading && data ? 0.55 : 1, transition: 'opacity .15s' }}>
        {data && (
          <>
            <div className="rpt-print-title" style={{ fontSize: 12.5, color: 'var(--gray)', marginBottom: 10 }}>
              <b style={{ color: 'var(--white)' }}>{data.range.label}</b> compared with {data.previousRange.label}, by {bucketWord}. Sales are what was sold, by sale date - a cancelled order is never counted. Cash actually received is on Home.
            </div>

            {isPhone ? (
              <KpiStrip items={kpis.map(k => ({ ...k, sub: k.delta ? `${k.delta} vs before` : undefined, subColor: k.delta?.startsWith('-') ? 'var(--st-red-fg)' : 'var(--st-green-fg)' }))} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
                {kpis.map(k => (
                  <div key={k.key} style={{ ...S.cardSm }} title={k.title}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{k.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                    {k.delta && <div style={{ fontSize: 11.5, marginTop: 2, color: k.delta.startsWith('-') ? 'var(--st-red-fg)' : 'var(--st-green-fg)' }}>{k.delta} vs {data.previousRange.label}</div>}
                  </div>
                ))}
              </div>
            )}

            <Card title={`Revenue by ${bucketWord}`} sub={`Gold is ${data.range.label}; gray is the same length of time before it (${data.previousRange.label}), lined up ${bucketWord} for ${bucketWord}.`}>
              <div style={{ padding: '12px 8px 4px', height: isPhone ? 220 : 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} barGap={2} barCategoryGap={chart.length > 20 ? '20%' : '30%'} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={colors.grid} />
                    <XAxis dataKey="label" tick={{ fill: colors.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.grid }} interval={chart.length > 14 ? Math.ceil(chart.length / 7) - 1 : 0} />
                    <YAxis tick={{ fill: colors.text, fontSize: 11 }} tickLine={false} axisLine={false} width={isPhone ? 44 : 60} tickFormatter={v => pesoShort(v)} />
                    <Tooltip content={<ChartTip prevLabel={data.previousRange.label} />} cursor={{ fill: colors.grid }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: colors.text }} formatter={(v) => v === 'revenue' ? data.range.label : data.previousRange.label} />
                    <Bar dataKey="prev" fill={colors.prev} radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false} />
                    <Bar dataKey="revenue" fill={colors.now} radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table
                cols={[
                  { key: 'label', label: 'Period', strong: true },
                  { key: 'orders', label: 'Orders', right: true },
                  { key: 'revenue', label: 'Revenue', right: true, render: r => peso(r.revenue) },
                  { key: 'cost', label: 'Cost', right: true, muted: true, wide: true, render: r => peso(r.cost) },
                  { key: 'profit', label: 'Gross profit', right: true, wide: true, render: r => peso(r.profit) },
                  { key: 'prev', label: data.previousRange.label, right: true, muted: true, wide: true, render: r => peso(r.prev) },
                ]}
                rows={chart} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, flexWrap: 'wrap' }}>
                <span>Total</span>
                <span style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <span>{t.orders} orders</span><span>{peso(t.revenue)}</span><span style={{ color: 'var(--gray)' }}>cost {peso(t.cost)}</span><span>profit {peso(t.profit)}</span>
                </span>
              </div>
              {t.costMissing > 0 && (
                <div style={{ padding: '0 14px 12px', fontSize: 11.5, color: 'var(--gray)' }}>
                  {t.costMissing} of {t.lines} lines have no cost recorded (the imported history), so gross profit is overstated by their cost.
                </div>
              )}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 14 }}>
              <Card title="Where it came from" sub="Online is the storefront; counter is an order the staff entered.">
                <Table cols={[
                  { key: 'k', label: 'Channel', strong: true },
                  { key: 'orders', label: 'Orders', right: true },
                  { key: 'revenue', label: 'Revenue', right: true, render: r => peso(r.revenue) },
                  { key: 'share', label: 'Share', right: true, muted: true, wide: true, render: r => t.revenue ? `${((r.revenue / t.revenue) * 100).toFixed(0)}%` : '-' },
                ]} rows={[
                  { key: 'Online', ...data.bySource.online },
                  { key: 'Counter', ...data.bySource.manual },
                ]} />
              </Card>
              <Card title="By category">
                <Table cols={[
                  { key: 'category', label: 'Category', strong: true },
                  { key: 'lines', label: 'Lines', right: true },
                  { key: 'revenue', label: 'Revenue', right: true, render: r => peso(r.revenue) },
                ]} rows={data.byCategory} />
              </Card>
            </div>

            <Card title="Top products" sub="By revenue in this period.">
              <Table cols={[
                { key: 'name', label: 'Product', strong: true },
                { key: 'qty', label: 'Pieces', right: true },
                { key: 'revenue', label: 'Revenue', right: true, render: r => peso(r.revenue) },
                { key: 'share', label: 'Share', right: true, muted: true, wide: true, render: r => t.revenue ? `${((r.revenue / t.revenue) * 100).toFixed(0)}%` : '-' },
              ]} rows={data.topProducts} />
            </Card>
          </>
        )}
        {!data && loading && <div style={{ ...S.card, padding: 28, color: 'var(--gray)', fontSize: 13, textAlign: 'center' }}>Building the report</div>}
      </div>
    </>
  );
}

// ── Inventory ─────────────────────────────────────────────────────────────────
function InventoryReport({ token }) {
  const mayExport = useAccess().can('reports.export');
  const isPhone = useIsPhone();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/admin/reports/inventory`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, 30000);
        const j = await res.json();
        if (!res.ok) throw new Error(j.message || `Request failed (${res.status})`);
        setData(j.data ?? j);
      } catch (e) { setError(e.message); }
    })();
  }, [token]);

  if (error) return <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)' }}>{error}</div>;
  if (!data) return <div style={{ ...S.card, padding: 28, color: 'var(--gray)', fontSize: 13, textAlign: 'center' }}>Reading the shelf</div>;
  const t = data.totals;
  const maxCat = Math.max(1, ...data.byCategory.map(c => c.value));
  const kpis = [
    { key: 'val', label: 'Stock value', value: isPhone ? pesoShort(t.stockValue) : peso(t.stockValue), title: peso(t.stockValue) },
    { key: 'mat', label: 'Materials', value: num(t.materials) },
    { key: 'low', label: 'Below minimum', value: num(t.belowMin), color: t.belowMin > 0 ? 'var(--st-orange-fg)' : undefined },
    { key: 'out', label: 'Out of stock', value: num(t.out), color: t.out > 0 ? 'var(--st-red-fg)' : undefined },
  ];
  const exportRows = () => exportCSV(
    ['Category', 'Items', 'Units', 'Stock value'],
    data.byCategory.map(c => [c.category, c.items, c.units, c.value.toFixed(2)]),
    `inventory-${data.asOf.slice(0, 10)}.csv`
  );
  return (
    <>
      <div className="rpt-noprint" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--gray)' }}>As of {data.asOf} (Manila). Stock is a snapshot; movement is the last 30 days.</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {mayExport && (<button type="button" onClick={exportRows} style={{ ...S.btnGhost, minHeight: 40 }}>Export CSV</button>)}
          <button type="button" onClick={() => window.print()} style={{ ...S.btnGhost, minHeight: 40 }}>Print</button>
        </div>
      </div>
      {isPhone ? <KpiStrip items={kpis} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
          {kpis.map(k => (
            <div key={k.key} style={S.cardSm} title={k.title}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{k.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <Card title="Stock value by category" sub={`${peso(t.stockValue)} on the shelf across ${t.materials} materials (${t.onDemand} bought per order).`}>
        <div style={{ padding: '8px 14px 4px' }}>
          {data.byCategory.map(c => (
            <div key={c.category} style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '180px 1fr 120px', gap: isPhone ? 2 : 12, alignItems: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.category}</div>
              <div style={{ height: 10, borderRadius: 4, background: 'var(--dark2)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, (c.value / maxCat) * 100)}%`, height: '100%', background: 'var(--gold)', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 12.5, textAlign: isPhone ? 'left' : 'right', fontVariantNumeric: 'tabular-nums' }}>{peso(c.value)} <span style={{ color: 'var(--gray)' }}>- {c.items} item{c.items === 1 ? '' : 's'}</span></div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 14 }}>
        <Card title="Needs attention" sub="Below its minimum, or out. Packaging bought per order is on To Buy instead.">
          <Table cols={[
            { key: 'name', label: 'Material', strong: true },
            { key: 'onHand', label: 'On hand', right: true, render: r => `${num(r.onHand)} ${r.uom ?? ''}` },
            { key: 'minimum', label: 'Minimum', right: true, muted: true, wide: true, render: r => num(r.minimum) },
            { key: 'status', label: 'Status', render: r => <span style={{ fontSize: 11, fontWeight: 700, color: r.status === 'out' ? 'var(--st-red-fg)' : 'var(--st-orange-fg)' }}>{r.status === 'out' ? 'Out of stock' : 'Low'}</span> },
          ]} rows={data.attention} empty="Every stocked material is above its minimum." />
        </Card>
        <Card title="Left the shelf in the last 30 days" sub="Production, sales, quotes and scrap, from the stock ledger.">
          <Table cols={[
            { key: 'name', label: 'Material', strong: true },
            { key: 'qty', label: 'Used', right: true, render: r => `${num(r.qty)} ${r.uom ?? ''}` },
            { key: 'cost', label: 'At cost', right: true, muted: true, wide: true, render: r => peso(r.cost) },
          ]} rows={data.consumption} empty="Nothing left the shelf in the last 30 days." />
        </Card>
      </div>
    </>
  );
}

// ── Demand ────────────────────────────────────────────────────────────────────
function DemandReport() {
  const { can } = useAccess();
  const [state, setState] = useState('checking');   // checking | up | down
  useEffect(() => {
    (async () => {
      // The service has no health route; an empty forecast request answers 200/422 when it is
      // up and fails to connect when it is not. Anything that is an HTTP answer counts as up.
      try {
        const res = await fetchWithTimeout(`${SSA_API_URL}/api/forecast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [], forecast_periods: 1, forecast_type: 'weekly', data_type: 'sales' }) }, 6000);
        setState(res.status < 500 ? 'up' : 'down');
      } catch { setState('down'); }
    })();
  }, []);
  return (
    <Card title="Demand - SSA forecast" sub="What the forecast expects the coming weeks to bring, from the sales ledger.">
      <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--gray)', fontSize: 13, lineHeight: 1.6 }}>
        {state === 'checking' ? 'Checking the forecast service' : state === 'up'
          ? <>The forecast service is running. Its full output lives in {can('forecast') ? <a href="/dashboard/business/ssa-forecast" style={{ color: 'var(--gold)', fontWeight: 700 }}>Forecast</a> : 'Forecast'}; this tab will carry the summary once the next version of the model is in.</>
          : <>The forecast service is not answering right now. Nothing is wrong with your sales - the Demand tab fills in when it is back. {can('forecast') ? <>Open <a href="/dashboard/business/ssa-forecast" style={{ color: 'var(--gold)', fontWeight: 700 }}>Forecast</a> to check it.</> : null}</>}
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'sales', label: 'Sales' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'demand', label: 'Demand' },
];

export default function ReportsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState('sales');
  return (
    <ErrorBoundary>
      <div style={S.page}>
        <style>{`
          @media print {
            .admin-sidebar, .admin-top-bar, .phone-tabbar, .phone-section-strip, .rpt-noprint, .rpt-tabs { display: none !important; }
            .admin-main-content { margin-left: 0 !important; height: auto !important; overflow: visible !important; }
            .admin-page-content { padding: 0 !important; }
            .rpt-card { break-inside: avoid; border: 1px solid #ccc !important; box-shadow: none !important; }
            body { background: #fff !important; color: #000 !important; }
          }
        `}</style>
        <div className="rpt-tabs" style={{ marginBottom: 14 }}>
          <TabBar tabs={TABS} active={tab} onChange={setTab} />
        </div>
        {tab === 'sales' && <SalesReport token={token} />}
        {tab === 'inventory' && <InventoryReport token={token} />}
        {tab === 'demand' && <DemandReport />}
      </div>
    </ErrorBoundary>
  );
}
