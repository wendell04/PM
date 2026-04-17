'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Brush,
} from 'recharts';

const API_URL     = process.env.NEXT_PUBLIC_API_URL     || 'http://127.0.0.1:8000';
const SSA_API_URL = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';

// Weekly  = count days   (each forecasted point = 1 week bucket)
// Monthly = count weeks  (each forecasted point = 1 week bucket inside a month view)
// Annually= count months (each forecasted point = 1 month bucket)
const FORECAST_PERIODS = [
  { label: 'Weekly',   type: 'weekly',   defaultCount: 8,  unit: 'weeks',  tableHeader: 'Day'   },
  { label: 'Monthly',  type: 'monthly',  defaultCount: 4,  unit: 'weeks',  tableHeader: 'Week'  },
  { label: 'Annually', type: 'annually', defaultCount: 12, unit: 'months', tableHeader: 'Month' },
];

const DATA_SOURCES = [
  { key: 'sales_revenue',   label: 'Sales Revenue'         },
  { key: 'sales_qty',       label: 'Sales Quantity'        },
  { key: 'inventory_stock', label: 'Inventory Stock Level' },
];

const pageStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .ssa-spinner { animation: spin 1s linear infinite; }
  .ssa-card {
    background: var(--dark2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .ssa-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
  }
  .ssa-card-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--white);
    margin: 0;
  }
  .ssa-stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .ssa-stat-card {
    background: var(--dark2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem 1.25rem;
  }
  .ssa-stat-label {
    font-size: 0.72rem;
    color: var(--gray);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .ssa-stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--white);
  }
  .ssa-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    color: #ef4444;
    font-size: 0.875rem;
    margin-top: 1rem;
  }
  .ssa-info-banner {
    background: rgba(212,168,67,0.06);
    border: 1px solid rgba(212,168,67,0.2);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--gray);
    line-height: 1.6;
  }
  .ssa-forecast-day-row:nth-child(even) {
    background: rgba(255,255,255,0.015);
  }
  .ssa-period-btn {
    padding: 0.5rem 1.25rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--dark);
    color: var(--gray);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .ssa-period-btn:hover {
    border-color: rgba(212,168,67,0.4);
    color: var(--white);
  }
  .ssa-period-btn.active {
    background: rgba(212,168,67,0.15);
    border-color: var(--gold);
    color: var(--gold);
  }
  .ssa-source-btn {
    padding: 0.5rem 1.25rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--dark);
    color: var(--gray);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .ssa-source-btn:hover {
    border-color: rgba(212,168,67,0.4);
    color: var(--white);
  }
  .ssa-source-btn.active {
    background: rgba(212,168,67,0.15);
    border-color: var(--gold);
    color: var(--gold);
  }
  .ssa-toggle-btn {
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--dark);
    color: var(--gray);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .ssa-toggle-btn:hover { color: var(--white); border-color: rgba(212,168,67,0.4); }
  .ssa-toggle-btn.active {
    background: rgba(212,168,67,0.12);
    border-color: var(--gold);
    color: var(--gold);
  }
  .ssa-select {
    padding: 0.5rem 0.75rem;
    background: var(--dark);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--white);
    font-size: 0.875rem;
    outline: none;
    min-width: 200px;
  }
  .ssa-select:focus {
    border-color: var(--gold);
  }
  @media (max-width: 768px) {
    .ssa-stat-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .ssa-stat-grid { grid-template-columns: 1fr; }
  }
`;

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export default function SSAForecastPage() {
  const { token } = useAuth();

  // Controls
  const [dataSource, setDataSource]     = useState('sales_revenue');
  const [forecastPeriod, setForecastPeriod] = useState(FORECAST_PERIODS[0]);
  const [forecastCount, setForecastCount]   = useState(FORECAST_PERIODS[0].defaultCount);
  const [inventoryList, setInventoryList] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');

  // Chart overlay toggles
  const [showTrend, setShowTrend] = useState(false);
  const [showSeasonality, setShowSeasonality] = useState(false);
  const [showConfidence, setShowConfidence] = useState(true);

  const [showDecomp, setShowDecomp] = useState(false);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [dataPointCount, setDataPointCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    fetchWithTimeout(`${API_URL}/api/admin/inventory`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
      .then(r => r.json())
      .then(d => {
        const items = d.data ?? d ?? [];
        const list = Array.isArray(items) ? items : [];
        setInventoryList(list);
        if (list.length > 0) setSelectedInventoryId(list[0]._id ?? list[0].id ?? '');
      })
      .catch(() => setInventoryList([]));
  }, [token]);

  const handleSubmit = async () => {
    if (!token) return;
    if (dataSource === 'inventory_stock' && !selectedInventoryId) {
      setError('Please select an inventory item.');
      return;
    }

    setError('');
    setIsLoading(true);
    setResult(null);

    try {
      let rows = []; // [{date: 'YYYY-MM-DD', value: number}]

      if (dataSource === 'sales_revenue' || dataSource === 'sales_qty') {
        const res = await fetchWithTimeout(`${API_URL}/api/admin/sales?limit=2000`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        const d = await res.json();
        const sales = Array.isArray(d.data ?? d) ? (d.data ?? d) : [];

        const map = {};
        sales.forEach(s => {
          const date = s.saleDate
            ? new Date(s.saleDate).toISOString().split('T')[0]
            : null;
          if (!date) return;
          if (!map[date]) map[date] = { revenue: 0, qty: 0 };
          map[date].revenue += s.totalPrice ?? 0;
          map[date].qty     += s.quantity   ?? 0;
        });

        rows = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            value: dataSource === 'sales_revenue' ? v.revenue : v.qty,
          }));

      } else {
        const res = await fetchWithTimeout(
          `${API_URL}/api/admin/inventory/${selectedInventoryId}/history`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        );
        const d = await res.json();
        const history = Array.isArray(d.data ?? d) ? (d.data ?? d) : [];

        const map = {};
        history.forEach(h => {
          const date = h.createdAt
            ? new Date(h.createdAt).toISOString().split('T')[0]
            : null;
          if (!date) return;
          map[date] = h.remainingQty ?? 0;
        });

        rows = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, value }));
      }

      if (rows.length < 10) {
        setError(`Not enough data points (${rows.length}). SSA requires at least 10.`);
        setIsLoading(false);
        return;
      }

      setDataPointCount(rows.length);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const ssaRes = await fetch(`${SSA_API_URL}/api/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          forecast_periods: forecastCount,
          forecast_type: forecastPeriod.type,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const raw = err.detail || 'SSA forecast failed.';
        throw new Error(raw.split('\n')[0].split('\\n')[0]);
      }

      const data = await ssaRes.json();
      setResult(data);
      setDataPointCount(data.historical?.dates?.length ?? rows.length);

    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Forecast timed out. The SSA service may be unavailable.');
      } else {
        setError(err.message || 'An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getCombinedChartData = () => {
    if (!result) return [];
    const data = [];
    const histDates = result.historical?.dates || [];
    const histValues = result.historical?.values || [];
    const histTrend = result.historical?.trend || [];
    const histSeas = result.historical?.seasonality || [];
    const fcDates = result.forecast?.dates || [];
    const fcValues = result.forecast?.values || [];
    const fcHigh = result.forecast?.confidence_high || [];
    const fcLow = result.forecast?.confidence_low || [];

    for (let i = 0; i < histDates.length; i++) {
      data.push({
        date: histDates[i],
        Actual: histValues[i],
        Trend: showTrend ? (histTrend[i] ?? null) : undefined,
        Seasonality: showSeasonality ? (histSeas[i] ?? null) : undefined,
        Forecast: null,
        High: null,
        Low: null,
      });
    }

    for (let i = 0; i < fcDates.length; i++) {
      data.push({
        date: fcDates[i],
        Actual: null,
        Trend: undefined,
        Seasonality: undefined,
        Forecast: fcValues[i],
        High: showConfidence ? (fcHigh[i] ?? null) : null,
        Low: showConfidence ? (fcLow[i] ?? null) : null,
      });
    }

    return data;
  };

  const getDecompChartData = () => {
    if (!result) return [];
    const dates       = result.historical?.dates       || [];
    const trend       = result.historical?.trend       || [];
    const seasonality = result.historical?.seasonality || [];
    const noise       = result.historical?.noise       || [];
    return dates.map((date, i) => ({
      date,
      Trend:       trend[i]       ?? null,
      Seasonality: seasonality[i] ?? null,
      Noise:       noise[i]       ?? null,
    }));
  };

  const formatDateLabel = (dateString) => {
    if (!dateString) return dateString;
    const d = new Date(dateString + 'T00:00:00Z');
    if (isNaN(d)) return dateString;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthName = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();

    if (forecastPeriod.type === 'weekly') {
      return `W${getISOWeek(d)} ${year}`;
    }
    if (forecastPeriod.type === 'monthly') {
      return `W${getISOWeek(d)} (${monthName} ${year})`;
    }
    if (forecastPeriod.type === 'annually') {
      return `${monthName} ${year}`;
    }
    return dateString;
  };

  const handleDownloadCSV = () => {
    if (!result) return;
    const fcDates  = result.forecast?.dates  || [];
    const fcValues = result.forecast?.values || [];
    const fcHigh = result.forecast?.confidence_high || [];
    const fcLow = result.forecast?.confidence_low || [];
    let csv = `${forecastPeriod.tableHeader},Date,Predicted Value,High,Low\n`;
    fcDates.forEach((d, i) => {
      csv += `${i + 1},${d},${fcValues[i]?.toFixed(2) ?? ''},${fcHigh[i]?.toFixed(2) ?? ''},${fcLow[i]?.toFixed(2) ?? ''}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ssa_forecast_${dataSource}_${forecastCount}${forecastPeriod.type[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedSourceLabel = DATA_SOURCES.find(s => s.key === dataSource)?.label ?? '';

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">

        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">Sales Forecast</h1>
              <p className="page-subtitle">
                Predict future trends using live data powered by Singular Spectrum Analysis.
              </p>
            </div>
          </div>
        </div>

        <div className="ssa-info-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>
            Data is pulled directly from your database. Select a data source,
            choose a forecast period, then click Run Forecast.
            SSA requires at least 10 historical data points.
          </span>
        </div>

        <div className="ssa-card">

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.5px',
              display: 'block', marginBottom: '0.5rem',
            }}>
              Data Source
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {DATA_SOURCES.map(s => (
                <button
                  key={s.key}
                  type="button"
                  className={`ssa-source-btn ${dataSource === s.key ? 'active' : ''}`}
                  onClick={() => { setDataSource(s.key); setResult(null); setError(''); }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {dataSource === 'inventory_stock' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{
                fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                display: 'block', marginBottom: '0.5rem',
              }}>
                Inventory Item
              </label>
              {inventoryList.length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
                  Loading inventory...
                </span>
              ) : (
                <select
                  className="ssa-select"
                  value={selectedInventoryId}
                  onChange={e => { setSelectedInventoryId(e.target.value); setResult(null); }}
                >
                  {inventoryList.map(item => (
                    <option key={item._id ?? item.id} value={item._id ?? item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.5px',
              display: 'block', marginBottom: '0.5rem',
            }}>
              Forecast Period
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {FORECAST_PERIODS.map(p => (
                <button
                  key={p.type}
                  type="button"
                  className={`ssa-period-btn ${forecastPeriod.type === p.type ? 'active' : ''}`}
                  onClick={() => {
                    setForecastPeriod(p);
                    setForecastCount(p.defaultCount);
                    setResult(null);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                min={1}
                max={forecastPeriod.type === 'weekly' ? 52 : forecastPeriod.type === 'monthly' ? 24 : 36}
                value={forecastCount}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v > 0) setForecastCount(v);
                }}
                style={{
                  width: '80px',
                  padding: '0.45rem 0.6rem',
                  background: 'var(--dark)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--gold)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
                {forecastPeriod.unit} ahead
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn-primary"
              disabled={isLoading}
              onClick={handleSubmit}
            >
              {isLoading ? (
                <>
                  <svg className="ssa-spinner" width="16" height="16"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
                  </svg>
                  Running...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    <polyline points="17 6 23 6 23 12"/>
                  </svg>
                  Run Forecast
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="ssa-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        {result && (
          <>
            <div className="ssa-stat-grid">
              <div className="ssa-stat-card">
                <div className="ssa-stat-label">Data Points</div>
                <div className="ssa-stat-value">{dataPointCount}</div>
              </div>
              <div className="ssa-stat-card">
                <div className="ssa-stat-label">Forecast Period</div>
                <div className="ssa-stat-value" style={{ fontSize: '1.1rem' }}>
                  {forecastCount} {forecastPeriod.unit}
                </div>
              </div>
              <div className="ssa-stat-card">
                <div className="ssa-stat-label">Last Known Value</div>
                <div className="ssa-stat-value" style={{ color: 'var(--gold)' }}>
                  {(result.historical?.values || []).length > 0
                    ? (result.historical.values[result.historical.values.length - 1]).toFixed(2)
                    : '—'}
                </div>
              </div>
            </div>

            <div className="ssa-card">
              <div className="ssa-card-header">
                <h2 className="ssa-card-title">
                  {selectedSourceLabel} — {forecastCount} {forecastPeriod.unit} Forecast
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`ssa-toggle-btn ${showConfidence ? 'active' : ''}`}
                    onClick={() => setShowConfidence(v => !v)}
                  >
                    High / Low
                  </button>
                  <button
                    type="button"
                    className={`ssa-toggle-btn ${showTrend ? 'active' : ''}`}
                    onClick={() => setShowTrend(v => !v)}
                  >
                    Trend
                  </button>
                  <button
                    type="button"
                    className={`ssa-toggle-btn ${showSeasonality ? 'active' : ''}`}
                    onClick={() => setShowSeasonality(v => !v)}
                  >
                    Seasonality
                  </button>
                </div>
              </div>
              <div style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {(() => { const chartData = getCombinedChartData(); return (
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="date"
                      stroke="var(--gray)"
                      tick={{ fill: 'var(--gray)', fontSize: 11 }}
                      tickMargin={8}
                      minTickGap={40}
                      tickFormatter={formatDateLabel}
                    />
                    <YAxis stroke="var(--gray)" tick={{ fill: 'var(--gray)', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--dark2)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                      }}
                      itemStyle={{ color: 'var(--white)' }}
                      labelStyle={{ color: 'var(--gray)' }}
                      labelFormatter={formatDateLabel}
                    />
                    <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '0.8rem' }} />
                    <Line
                      type="monotone" dataKey="Actual"
                      stroke="var(--gray)" strokeWidth={2}
                      dot={false} activeDot={{ r: 3 }}
                    />
                    <Line
                      type="monotone" dataKey="Forecast"
                      stroke="var(--gold)" strokeWidth={2.5}
                      strokeDasharray="6 3"
                      dot={false} activeDot={{ r: 5 }}
                    />
                    {showConfidence && (
                      <>
                        <Line
                          type="monotone" dataKey="High"
                          stroke="rgba(212,168,67,0.35)" strokeWidth={1}
                          strokeDasharray="3 3" dot={false}
                          legendType="none"
                        />
                        <Line
                          type="monotone" dataKey="Low"
                          stroke="rgba(212,168,67,0.35)" strokeWidth={1}
                          strokeDasharray="3 3" dot={false}
                          legendType="none"
                        />
                      </>
                    )}
                    {showTrend && (
                      <Line
                        type="monotone" dataKey="Trend"
                        stroke="#60a5fa" strokeWidth={1.5}
                        dot={false} activeDot={{ r: 3 }}
                      />
                    )}
                    {showSeasonality && (
                      <Line
                        type="monotone" dataKey="Seasonality"
                        stroke="#a78bfa" strokeWidth={1.5}
                        dot={false} activeDot={{ r: 3 }}
                      />
                    )}
                    <Brush
                      dataKey="date"
                      height={28}
                      stroke="#3a3a3a"
                      fill="#1a1a1a"
                      travellerWidth={8}
                      tickFormatter={formatDateLabel}
                      startIndex={Math.max(0, chartData.length - Math.min(60, chartData.length))}
                    />
                  </LineChart>
                  ); })()}
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
              <button
                className={`ssa-source-btn ${showDecomp ? 'active' : ''}`}
                type="button"
                onClick={() => setShowDecomp(v => !v)}
              >
                {showDecomp ? 'Hide Decomposition' : 'Show Decomposition'}
              </button>
            </div>

            {showDecomp && (
              <div className="ssa-card" style={{ marginBottom: '1rem' }}>
                <div className="ssa-card-header">
                  <h2 className="ssa-card-title">SSA Decomposition</h2>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                    Trend · Seasonality · Noise
                  </span>
                </div>
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={getDecompChartData()}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="date"
                        stroke="var(--gray)"
                        tick={{ fill: 'var(--gray)', fontSize: 11 }}
                        tickMargin={8}
                        minTickGap={40}
                        tickFormatter={formatDateLabel}
                      />
                      <YAxis stroke="var(--gray)" tick={{ fill: 'var(--gray)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--dark2)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                        }}
                        itemStyle={{ color: 'var(--white)' }}
                        labelStyle={{ color: 'var(--gray)' }}
                        labelFormatter={formatDateLabel}
                      />
                      <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '0.8rem' }} />
                      <Line
                        type="monotone" dataKey="Trend"
                        stroke="var(--gold)" strokeWidth={2}
                        dot={false} activeDot={{ r: 3 }}
                      />
                      <Line
                        type="monotone" dataKey="Seasonality"
                        stroke="#60a5fa" strokeWidth={1.5}
                        dot={false} activeDot={{ r: 3 }}
                      />
                      <Line
                        type="monotone" dataKey="Noise"
                        stroke="rgba(255,255,255,0.25)" strokeWidth={1}
                        dot={false} activeDot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p style={{
                  fontSize: '0.72rem', color: 'var(--gray)',
                  marginTop: '0.75rem', marginBottom: 0, lineHeight: 1.5,
                }}>
                  Trend: long-run direction. Seasonality: periodic patterns. Noise: residual.
                </p>
              </div>
            )}

            <p style={{
              fontSize: '0.75rem', color: 'var(--gray)',
              fontStyle: 'italic', marginTop: '0.75rem', marginBottom: '1.5rem',
            }}>
              SSA decomposed the series into trend, seasonality, and noise. Shaded bands show ±1.96σ confidence interval.
            </p>

            <div className="ssa-card">
              <div className="ssa-card-header">
                <h2 className="ssa-card-title">Forecasted Values</h2>
                <button
                  className="btn-secondary"
                  onClick={handleDownloadCSV}
                  style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download CSV
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>{forecastPeriod.tableHeader}</th>
                      <th>Date</th>
                      <th>Predicted Value</th>
                      <th>High</th>
                      <th>Low</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.forecast?.dates || []).map((date, idx) => (
                      <tr key={idx} className="ssa-forecast-day-row">
                        <td>{idx + 1}</td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
                          {formatDateLabel(date)}
                        </td>
                        <td>
                          <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                            {(result.forecast?.values || [])[idx]?.toFixed(2) ?? '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'rgba(212,168,67,0.6)' }}>
                          {(result.forecast?.confidence_high || [])[idx]?.toFixed(2) ?? '—'}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'rgba(212,168,67,0.6)' }}>
                          {(result.forecast?.confidence_low || [])[idx]?.toFixed(2) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
    </ErrorBoundary>
  );
}
