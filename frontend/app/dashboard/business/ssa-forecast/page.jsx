'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const SSA_API_URL = process.env.NEXT_PUBLIC_SSA_API_URL || 'http://localhost:8001';

const pageStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .ssa-spinner {
    animation: spin 1s linear infinite;
  }
  .ssa-drop-zone {
    border: 2px dashed var(--border);
    border-radius: 10px;
    padding: 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  .ssa-drop-zone:hover {
    border-color: rgba(212,168,67,0.4);
    background: rgba(212,168,67,0.02);
  }
  .ssa-drop-zone.drag-active {
    border-color: var(--gold);
    background: rgba(212,168,67,0.04);
  }
  .ssa-drop-zone.file-selected {
    border-color: rgba(74,222,128,0.4);
    background: rgba(74,222,128,0.04);
  }
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
  @media (max-width: 768px) {
    .ssa-stat-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 480px) {
    .ssa-stat-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export default function SSAForecastPage() {
  useAuth();

  const [file, setFile] = useState(null);
  const [forecastDays, setForecastDays] = useState('30');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // ── Handlers ──
  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  };

  const handleFileSelect = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleSubmit = async () => {
    if (!file) { setError('Please select a file.'); setResult(null); return; }
    const days = parseInt(forecastDays);
    if (!days || days < 1 || days > 365) {
      setError('Forecast days must be between 1 and 365.');
      setResult(null);
      return;
    }

    setError('');
    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('forecast_days', parseInt(forecastDays));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${SSA_API_URL}/api/forecast`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Forecast failed.');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Forecast request timed out. The service may be unavailable.');
      } else {
        setError(err.message);
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const getCombinedChartData = () => {
    if (!result) return [];
    const data = [];
    const histDates = result.historical?.dates || [];
    const histValues = result.historical?.values || [];
    const fcDates = result.forecast?.dates || [];
    const fcValues = result.forecast?.values || [];

    for (let i = 0; i < histDates.length; i++) {
      data.push({ date: histDates[i], Actual: histValues[i], Forecast: null });
    }
    for (let i = 0; i < fcDates.length; i++) {
      data.push({ date: fcDates[i], Actual: null, Forecast: fcValues[i] });
    }
    return data;
  };

  const handleDownloadCSV = () => {
    if (!result) return;
    const fcDates = result.forecast?.dates || [];
    const fcValues = result.forecast?.values || [];
    let csv = 'Day,Date,Predicted Value\n';
    fcDates.forEach((d, i) => {
      csv += `${i + 1},${d},${fcValues[i].toFixed(4)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ssa_forecast.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
        {/* SECTION 1 — Page Header */}
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">Sales Forecast</h1>
              <p className="page-subtitle">
                Predict future sales and inventory trends using
                historical data to make informed business decisions.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 2 — Info Banner */}
        <div className="ssa-info-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>
            Upload a CSV or Excel file with two columns: Date (YYYY-MM-DD) and a numeric value column
            (e.g. sales, revenue, price). The SSA algorithm will decompose the series and forecast ahead.
          </span>
        </div>

        {/* SECTION 3 — Upload + Controls Card */}
        <div className="ssa-card">
          {/* Drag & Drop Zone */}
          <div
            className={`ssa-drop-zone ${isDragActive ? 'drag-active' : ''} ${file ? 'file-selected' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleFileDrop}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke={file ? '#4ade80' : 'var(--gold)'} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ marginBottom: '0.75rem' }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {file ? (
              <>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--white)' }}>{file.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.25rem' }}>{formatFileSize(file.size)}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.25rem' }}>Click to change file</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--white)' }}>
                  Drag &amp; drop your CSV or Excel file here
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                  or click to browse
                </div>
              </>
            )}
          </div>

          {/* Controls Row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.5rem' }}>
                Forecast Days
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={forecastDays}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || (/^\d+$/.test(val) && val.length <= 3)) setForecastDays(val);
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--dark)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.9rem',
                  width: '120px',
                  outline: 'none',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--gold)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            <button
              className="btn-primary"
              disabled={isLoading || !file}
              onClick={handleSubmit}
              style={{ marginLeft: 'auto' }}
            >
              {isLoading ? (
                <>
                  <svg className="ssa-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
                  </svg>
                  Running...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    <polyline points="17 6 23 6 23 12"/>
                  </svg>
                  Run Forecast
                </>
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="ssa-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* SECTION 5 — Results */}
        {result && (
          <>
            {/* 5A — Summary Stats */}
            <div className="ssa-stat-grid">
              <div className="ssa-stat-card">
                <div className="ssa-stat-label">Data Points</div>
                <div className="ssa-stat-value">{(result.historical?.dates || []).length}</div>
              </div>
              <div className="ssa-stat-card">
                <div className="ssa-stat-label">Forecast Days</div>
                <div className="ssa-stat-value">{(result.forecast?.dates || []).length}</div>
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

            {/* 5B — Chart Card */}
            <div className="ssa-card">
              <div className="ssa-card-header">
                <h2 className="ssa-card-title">Visual Forecast</h2>
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
                  <LineChart data={getCombinedChartData()} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="date"
                      stroke="var(--gray)"
                      tick={{ fill: 'var(--gray)', fontSize: 11 }}
                      tickMargin={8}
                      minTickGap={40}
                    />
                    <YAxis
                      stroke="var(--gray)"
                      tick={{ fill: 'var(--gray)', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--dark2)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                      }}
                      itemStyle={{ color: 'var(--white)' }}
                      labelStyle={{ color: 'var(--gray)' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '0.8rem' }} />
                    <Line
                      type="monotone"
                      dataKey="Actual"
                      stroke="var(--gray)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Forecast"
                      stroke="var(--gold)"
                      strokeWidth={2.5}
                      strokeDasharray="6 3"
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 5C — Decomposition Note */}
            <p style={{ fontSize: '0.75rem', color: 'var(--gray)', fontStyle: 'italic', marginTop: '0.75rem', marginBottom: '1.5rem' }}>
              SSA decomposed the series into trend, seasonality, and noise components.
              The forecast uses components 0–3 (trend + first two seasonal pairs).
            </p>

            {/* 5D — Forecast Table Card */}
            <div className="ssa-card">
              <div className="ssa-card-header">
                <h2 className="ssa-card-title">Forecasted Values</h2>
                <button
                  className="btn-secondary"
                  onClick={handleDownloadCSV}
                  style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                      <th>Day</th>
                      <th>Date</th>
                      <th>Predicted Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.forecast?.dates || []).map((date, idx) => (
                      <tr key={idx} className="ssa-forecast-day-row">
                        <td>{idx + 1}</td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>{date}</td>
                        <td>
                          <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                            {(result.forecast?.values || [])[idx]?.toFixed(4) ?? '—'}
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
