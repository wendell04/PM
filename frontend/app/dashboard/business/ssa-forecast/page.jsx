'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Brush
} from 'recharts';

const API_URL     = process.env.NEXT_PUBLIC_API_URL     || 'http://127.0.0.1:8000';
const SSA_API_URL = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';

const FORECAST_PERIODS = [
  { label: 'Daily',       type: 'daily',       defaultCount: 30, unit: 'days'   },
  { label: 'Weekly',      type: 'weekly',      defaultCount: 8,  unit: 'weeks'  },
  { label: 'Monthly',     type: 'monthly',     defaultCount: 6,  unit: 'months' },
  { label: 'Day of Week', type: 'day_of_week', defaultCount: 8,  unit: 'weeks'  },
];

const DATA_SOURCES = [
  { key: 'sales_revenue',  label: 'Sales Revenue'       },
  { key: 'sales_qty',      label: 'Sales Quantity'      },
  { key: 'inventory_stock',label: 'Inventory Stock Level'},
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
  .ssa-period-selector {
    display: flex;
    gap: 0.5rem;
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
    .ssa-period-selector { flex-wrap: wrap; }
  }
  @media (max-width: 480px) {
    .ssa-stat-grid { grid-template-columns: 1fr; }
  }
`;

export default function SSAForecastPage() {
  const { token } = useAuth();

  // ── Controls ──────────────────────────────────────────────
  const [inputMode, setInputMode] = useState('upload'); // 'live' | 'upload'
  const [csvFile, setCsvFile] = useState(null);
  const [csvFileName, setCsvFileName] = useState('');
  const csvInputRef = useRef(null);
  const [availableColumns, setAvailableColumns] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState('');
  const [forecastDayOfWeek, setForecastDayOfWeek] = useState('Monday');

  const [dataSource, setDataSource]     = useState('sales_revenue');
  const [forecastPeriod, setForecastPeriod] = useState(FORECAST_PERIODS[0]); // default: Daily
  const [forecastCount, setForecastCount]   = useState(30);
  const [inventoryList, setInventoryList] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');

  // ── State ─────────────────────────────────────────────────
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState('');
  const [result, setResult]         = useState(null);
  const [dataPointCount, setDataPointCount] = useState(0);
  const [showDecomp, setShowDecomp] = useState(false);

  // ── Load inventory list for inventory source ───────────────
  useEffect(() => {
    if (!token) return;
    fetchWithTimeout(`${API_URL}/api/admin/inventory`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
      .then(r => r.json())
      .then(d => {
        const items = d.data ?? d ?? [];
        setInventoryList(Array.isArray(items) ? items : []);
        if (items.length > 0) setSelectedInventoryId(items[0]._id ?? items[0].id ?? '');
      })
      .catch(() => setInventoryList([]));
  }, [token]);

  const resetCsvSelection = () => {
    setCsvFile(null);
    setCsvFileName('');
    if (csvInputRef.current) csvInputRef.current.value = '';
    setAvailableColumns([]);
    setSelectedColumn('');
  };

  const fetchColumns = async (uploadedFile) => {
    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      const res = await fetch(`${SSA_API_URL}/api/columns`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) return;
      const data = await res.json();
      const cols = data.columns ?? [];
      setAvailableColumns(cols);
      setSelectedColumn(cols.length > 0 ? cols[0] : '');
    } catch {
      setAvailableColumns([]);
      setSelectedColumn('');
    }
  };

  // ── Fetch data from Laravel and run SSA ───────────────────
  const handleSubmit = async () => {
    if (!token) return;
    if (inputMode === 'live' && dataSource === 'inventory_stock' && !selectedInventoryId) {
      setError('Please select an inventory item.');
      return;
    }

    setError('');
    setIsLoading(true);
    setResult(null);

    try {
      if (inputMode === 'upload') {
        if (!csvFile) {
          setError('Please select a CSV file.');
          setIsLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', csvFile, csvFile.name);
        formData.append('forecast_periods', forecastCount);
        formData.append('forecast_type', forecastPeriod.type);
        if (forecastPeriod.type === 'day_of_week') {
          formData.append('forecast_day_of_week', forecastDayOfWeek);
        }
        if (selectedColumn) {
          formData.append('target_column', selectedColumn);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const ssaRes = await fetch(`${SSA_API_URL}/api/forecast`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!ssaRes.ok) {
          const err = await ssaRes.json().catch(() => ({}));
          const rawDetail = err.detail || 'SSA forecast failed.';
          throw new Error(rawDetail.split('\n')[0].split('\\n')[0]);
        }

        const data = await ssaRes.json();
        setResult(data);
        setDataPointCount(
          data.data_points ?? data.dataPoints ?? (data.historical?.dates?.length ?? 0)
        );
        return;
      }

      // ── Live data: Step 1 — Fetch data from Laravel ─────────
      let rows = []; // [{date: 'YYYY-MM-DD', value: number}]

      if (dataSource === 'sales_revenue' || dataSource === 'sales_qty') {
        const res = await fetchWithTimeout(`${API_URL}/api/admin/sales?limit=500`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        const d = await res.json();
        const sales = d.data ?? d ?? [];

        // Aggregate by date
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
        // inventory_stock
        const res = await fetchWithTimeout(
          `${API_URL}/api/admin/inventory/${selectedInventoryId}/history`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        );
        const d = await res.json();
        const history = d.data ?? d ?? [];

        // Use remainingQty over time
        const map = {};
        history.forEach(h => {
          const date = h.createdAt
            ? new Date(h.createdAt).toISOString().split('T')[0]
            : null;
          if (!date) return;
          // Keep last record per day (most recent remainingQty)
          map[date] = h.remainingQty ?? 0;
        });

        rows = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, value }));
      }

      if (rows.length < 10) {
        setError('Not enough data points to run SSA. At least 10 data points required.');
        setIsLoading(false);
        return;
      }

      setDataPointCount(rows.length);

      // Step 2: Build CSV string and post to SSA API
      const csvContent = 'Date,Value\n' +
        rows.map(r => `${r.date},${r.value}`).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const formData = new FormData();
      formData.append('file', blob, 'data.csv');
      formData.append('forecast_periods', forecastCount);
      formData.append('forecast_type', forecastPeriod.type);
      if (forecastPeriod.type === 'day_of_week') {
        formData.append('forecast_day_of_week', forecastDayOfWeek);
      }
      // target_column is only relevant for user-uploaded files, not live-generated CSVs

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const ssaRes = await fetch(`${SSA_API_URL}/api/forecast`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const rawDetail = err.detail || 'SSA forecast failed.';
        throw new Error(rawDetail.split('\n')[0].split('\\n')[0]);
      }

      const data = await ssaRes.json();
      setResult(data);
      setDataPointCount(data.historical?.dates?.length ?? 0);

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

  // ── Chart data ────────────────────────────────────────────
  const getCombinedChartData = () => {
    if (!result) return [];
    const data = [];
    const histDates  = result.historical?.dates  || [];
    const histValues = result.historical?.values || [];
    const fcDates    = result.forecast?.dates    || [];
    const fcValues   = result.forecast?.values   || [];
    for (let i = 0; i < histDates.length; i++) {
      data.push({ date: histDates[i], Actual: histValues[i], Forecast: null });
    }
    for (let i = 0; i < fcDates.length; i++) {
      data.push({ date: fcDates[i], Actual: null, Forecast: fcValues[i] });
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
    if (forecastPeriod.type === 'daily' || !dateString) return dateString;
    const parts = dateString.split('-');
    if (parts.length < 3) return dateString;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(parts[1], 10) - 1] ?? '';
    const year = parts[0];
    if (forecastPeriod.type === 'monthly') return `${monthName} ${year}`;
    if (forecastPeriod.type === 'weekly') return `Week ${Math.ceil(parseInt(parts[2], 10) / 7)} (${monthName} ${year})`;
    if (forecastPeriod.type === 'day_of_week') return `${forecastDayOfWeek} ${parts[2]} ${monthName} ${year}`;
    return dateString;
  };

  // ── CSV Download ──────────────────────────────────────────
  const handleDownloadCSV = () => {
    if (!result) return;
    const fcDates  = result.forecast?.dates  || [];
    const fcValues = result.forecast?.values || [];
    let csv = 'Day,Date,Predicted Value\n';
    fcDates.forEach((d, i) => {
      csv += `${i + 1},${d},${fcValues[i].toFixed(2)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const slug = inputMode === 'upload' ? 'csv_upload' : dataSource;
    a.download = `ssa_forecast_${slug}_${forecastCount}${forecastPeriod.type[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedSourceLabel = DATA_SOURCES.find(s => s.key === dataSource)?.label ?? '';
  const displaySourceLabel = inputMode === 'upload' ? 'CSV Upload' : selectedSourceLabel;

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">

        {/* SECTION 1 — Header */}
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">Sales Forecast</h1>
              <p className="page-subtitle">
                Predict future trends using live sales and inventory data
                powered by Singular Spectrum Analysis.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 2 — Info Banner */}
        <div className="ssa-info-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>
            {inputMode === 'upload' ? (
              <>
                Upload a CSV file with Date and Value columns.
                SSA requires at least 10 rows.
              </>
            ) : (
              <>
                Data is pulled directly from your database. Select a data source,
                choose a forecast period, then click Run Forecast.
                SSA requires at least 10 historical data points.
              </>
            )}
          </span>
        </div>

        {/* SECTION 3 — Controls Card */}
        <div className="ssa-card">

          {/* Row: Input Mode */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.5px',
              display: 'block', marginBottom: '0.5rem',
            }}>
              Input Mode
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`ssa-source-btn ${inputMode === 'upload' ? 'active' : ''}`}
                onClick={() => {
                  setInputMode('upload');
                  setResult(null);
                  setError('');
                  resetCsvSelection();
                }}
              >
                Upload CSV
              </button>
              <button
                type="button"
                className={`ssa-source-btn ${inputMode === 'live' ? 'active' : ''}`}
                onClick={() => {
                  setInputMode('live');
                  setResult(null);
                  setError('');
                  setAvailableColumns([]);
                  setSelectedColumn('');
                  resetCsvSelection();
                }}
              >
                Live Data
              </button>
            </div>
          </div>

          {/* Row: Data Source (live only) */}
          {inputMode === 'live' && (
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
          )}

          {/* Row: Inventory selector (live + inventory_stock) */}
          {inputMode === 'live' && dataSource === 'inventory_stock' && (
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

          {/* Row: CSV file (upload only) */}
          {inputMode === 'upload' && (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{
                  fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  display: 'block', marginBottom: '0.5rem',
                }}>
                  CSV File
                </label>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null;
                      setCsvFile(f);
                      setCsvFileName(f ? f.name : '');
                      setError('');
                      setAvailableColumns([]);
                      setSelectedColumn('');
                      if (f) fetchColumns(f);
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '0.85rem' }}
                    onClick={() => csvInputRef.current?.click()}
                  >
                    Choose File
                  </button>
                  <span style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>
                    {csvFileName || 'No file chosen'}
                  </span>
                </div>
                <p style={{
                  fontSize: '0.78rem',
                  color: 'var(--gray)',
                  marginTop: '0.5rem',
                  marginBottom: 0,
                  lineHeight: 1.5,
                }}>
                  Required columns: Date (YYYY-MM-DD), Value. Accepts CSV, XLSX, XLS.
                </p>
              </div>

              {availableColumns.length > 1 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{
                    fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    display: 'block', marginBottom: '0.5rem',
                  }}>
                    Target Column
                  </label>
                  <select
                    className="ssa-select"
                    value={selectedColumn}
                    onChange={e => { setSelectedColumn(e.target.value); setResult(null); }}
                  >
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '0.4rem', marginBottom: 0 }}>
                    Select the column to forecast from your file.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Row: Forecast Period */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.5px',
              display: 'block', marginBottom: '0.5rem',
            }}>
              Forecast Period
            </label>

            {/* Type toggle */}
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

            {forecastPeriod.type === 'day_of_week' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{
                  fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  display: 'block', marginBottom: '0.5rem',
                }}>
                  Day of Week
                </label>
                <select
                  className="ssa-select"
                  value={forecastDayOfWeek}
                  onChange={e => { setForecastDayOfWeek(e.target.value); setResult(null); }}
                >
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Count input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                min={1}
                max={forecastPeriod.type === 'daily' ? 365 : (forecastPeriod.type === 'weekly' || forecastPeriod.type === 'day_of_week') ? 52 : 24}
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

          {/* Row 4: Run button */}
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

          {/* Error */}
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

        {/* SECTION 4 — Results */}
        {result && (
          <>
            {/* Stats */}
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

            {/* Chart */}
            <div className="ssa-card">
              <div className="ssa-card-header">
                <h2 className="ssa-card-title">
                  {displaySourceLabel} — {forecastCount} {forecastPeriod.unit} Forecast
                </h2>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: 16, height: 2, background: 'var(--gray)', borderRadius: 1 }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Actual</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: 16, height: 2, background: 'var(--gold)', borderRadius: 1 }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Forecast</span>
                  </div>
                </div>
              </div>
              <div style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={getCombinedChartData()}
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
                    <Brush
                      dataKey="date"
                      height={28}
                      stroke="#3a3a3a"
                      fill="#1a1a1a"
                      travellerWidth={8}
                      tickFormatter={formatDateLabel}
                      startIndex={Math.max(0, getCombinedChartData().length - Math.min(60, getCombinedChartData().length))}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Decomposition toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
              <button
                className={`ssa-source-btn ${showDecomp ? 'active' : ''}`}
                type="button"
                onClick={() => setShowDecomp(v => !v)}
              >
                {showDecomp ? 'Hide Decomposition' : 'Show Decomposition'}
              </button>
            </div>

            {/* Decomposition chart */}
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
                  Trend: long-run direction (component 0). Seasonality: periodic patterns (components 1–3).
                  Noise: residual after removing trend and seasonality.
                </p>
              </div>
            )}

            <p style={{
              fontSize: '0.75rem', color: 'var(--gray)',
              fontStyle: 'italic', marginTop: '0.75rem', marginBottom: '1.5rem',
            }}>
              SSA decomposed the series into trend, seasonality, and noise components.
              Forecast uses components 0–3 (trend + first two seasonal pairs).
            </p>

            {/* Forecast Table */}
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
                      <th>
                        {forecastPeriod.type === 'daily' ? 'Day'
                          : forecastPeriod.type === 'weekly' ? 'Week'
                            : forecastPeriod.type === 'monthly' ? 'Month'
                              : forecastDayOfWeek}
                      </th>
                      <th>Date</th>
                      <th>Predicted Value</th>
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
