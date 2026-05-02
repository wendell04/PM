"use client";

import ErrorBoundary from "@/components/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useEffect, useRef, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const SSA_API_URL =
  process.env.NEXT_PUBLIC_SSA_API_URL || "http://localhost:8001";

const FORECAST_PERIODS = [
  {
    label: "Weekly",
    type: "weekly",
    unit: "weeks",
    tableHeader: "Week",
    maxCount: 52,
  },
  {
    label: "Monthly",
    type: "monthly",
    unit: "months",
    tableHeader: "Month",
    maxCount: 12,
  },
  {
    label: "Annually",
    type: "annually",
    unit: "years",
    tableHeader: "Year",
    maxCount: 3,
  },
];

const DEFAULT_COUNTS = { weekly: 4, monthly: 3, annually: 2 };

const DATA_SOURCES = [
  { key: "sales_revenue", label: "Sales Revenue" },
  { key: "sales_qty", label: "Sales Quantity" },
  { key: "inventory_stock", label: "Inventory Stock Level" },
];

const pageStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .ssa-spinner { animation: spin 1s linear infinite; }
  .ssa-skeleton {
    background: linear-gradient(90deg, var(--dark) 25%, rgba(255,255,255,0.04) 50%, var(--dark) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 6px;
    height: 2rem;
    width: 70%;
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
  .ssa-warning-banner {
    background: rgba(251,191,36,0.06);
    border: 1px solid rgba(251,191,36,0.25);
    border-radius: 8px;
    padding: 0.65rem 1rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    font-size: 0.8rem;
    color: var(--gray);
    line-height: 1.5;
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
  .ssa-period-btn:hover { border-color: rgba(212,168,67,0.4); color: var(--white); }
  .ssa-period-btn.active { background: rgba(212,168,67,0.15); border-color: var(--gold); color: var(--gold); }
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
  .ssa-source-btn:hover { border-color: rgba(212,168,67,0.4); color: var(--white); }
  .ssa-source-btn.active { background: rgba(212,168,67,0.15); border-color: var(--gold); color: var(--gold); }
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
  .ssa-toggle-btn.active { background: rgba(212,168,67,0.12); border-color: var(--gold); color: var(--gold); }
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
  .ssa-select:focus { border-color: var(--gold); }
  .ssa-tooltip {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: help;
  }
  .ssa-tooltip-text {
    visibility: hidden;
    width: 240px;
    background: var(--dark2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--gray);
    font-size: 0.75rem;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    padding: 0.6rem 0.8rem;
    position: absolute;
    z-index: 10;
    bottom: 130%;
    left: 50%;
    transform: translateX(-50%);
    line-height: 1.5;
    pointer-events: none;
  }
  .ssa-tooltip:hover .ssa-tooltip-text { visibility: visible; }
  @media (max-width: 768px) { .ssa-stat-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 480px) { .ssa-stat-grid { grid-template-columns: 1fr; } }
`;

function getISOWeek(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Helper to resolve the best accuracy value and its label from the API response.
// Priority: smape (preferred) → mae_ratio (fallback when all actuals are zero) → null (N/A)
// smape:     0–200% symmetric metric safe for zero-actual weeks
// mae_ratio: MAE ÷ avg non-zero training sale × 100; used when the entire backtest window is zeros
function resolveAccuracy(accuracy, isHighVolatility = false) {
  if (!accuracy)
    return {
      value: null,
      label: "FORECAST ACCURACY",
      sublabel: null,
      color: "var(--gray)",
    };

  const smape = accuracy.smape;
  const maeRatio = accuracy.mae_ratio;
  const btN = accuracy.backtest_n;
  const btNz = accuracy.backtest_nz_count ?? null;

  if (smape != null) {
    // For high-volatility spike-demand data, SMAPE >80% is expected and honest.
    // Don't color-code it red — it's not a model failure, it's data reality.
    const color = isHighVolatility
      ? "var(--gray)"
      : smape < 30
        ? "#4ade80"
        : smape < 60
          ? "#fbbf24"
          : "#f87171";

    return {
      value: smape,
      display: `${smape.toFixed(1)}%`,
      label: "FORECAST ACCURACY (SMAPE)",
      sublabel: btN
        ? `tested on ${btN} ${btNz != null ? `periods (${btNz} with sales)` : "periods"}`
        : "insufficient data",
      color,
      // Updated tooltip: honest about high-volatility spike-demand data
      tooltip: isHighVolatility
        ? "SMAPE measures forecast accuracy. For irregular spike-demand businesses, values above 80% are expected — the model tracks your revenue trend, not individual order timing. The forecast baseline is more useful than this number alone."
        : "SMAPE (Symmetric Mean Absolute % Error): measures forecast accuracy safely even when actual sales are zero. Lower is better. Under 30% = good, 30–60% = fair, above 60% = poor.",
    };
  }

  if (maeRatio != null) {
    const color = maeRatio < 50 ? "#fbbf24" : "#f87171";
    return {
      value: maeRatio,
      display: `~${maeRatio.toFixed(1)}%`,
      label: "ERROR VS AVG SALE",
      sublabel: "backtest weeks had no sales — using MAE ratio",
      color,
      tooltip:
        "All backtest weeks had zero actual sales, so SMAPE cannot be computed. This shows MAE ÷ average non-zero sale × 100. It estimates how large the forecast error is relative to a typical sale.",
    };
  }

  return {
    value: null,
    display: "N/A",
    label: "FORECAST ACCURACY",
    sublabel: "no sales in backtest window",
    color: "var(--gray)",
    tooltip:
      "Accuracy could not be computed because all backtest weeks had zero actual sales. The model still produces a forecast, but there is no valid reference period to measure against.",
  };
}

export default function SSAForecastPage() {
  const { token } = useAuth();
  const chartRef = useRef(null);

  const [dataSource, setDataSource] = useState("sales_revenue");
  const [forecastPeriod, setForecastPeriod] = useState(FORECAST_PERIODS[0]);
  const [forecastCount, setForecastCount] = useState("");
  const [dynamicMaxCount, setDynamicMaxCount] = useState(
    FORECAST_PERIODS[0].maxCount,
  );
  const [inventoryList, setInventoryList] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [showTrend, setShowTrend] = useState(false);
  const [showSeasonality, setShowSeasonality] = useState(false);
  const [showConfidence, setShowConfidence] = useState(true);
  const [showBacktest, setShowBacktest] = useState(false);
  const [showDecomp, setShowDecomp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submittedConfig, setSubmittedConfig] = useState(null);
  // FIX: dataPointCount = raw DB rows (true input size); trainingPeriods = SSA-aggregated count
  const [dataPointCount, setDataPointCount] = useState(0);
  const [trainingPeriods, setTrainingPeriods] = useState(null);
  const [backtestData, setBacktestData] = useState([]);

  const autoRunTimerRef = useRef(null);
  const handleSubmitRef = useRef(null);
  const forecastCountRef = useRef(forecastCount);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ssa_config");
      if (saved) {
        const { source, periodType } = JSON.parse(saved);
        const src = DATA_SOURCES.find((s) => s.key === source);
        const per = FORECAST_PERIODS.find((p) => p.type === periodType);
        if (src) setDataSource(src.key);
        if (per) setForecastPeriod(per);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchWithTimeout(`${API_URL}/api/admin/inventory`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((d) => {
        const items = d.data ?? d ?? [];
        const list = Array.isArray(items) ? items : [];
        setInventoryList(list);
        if (list.length > 0)
          setSelectedInventoryId(list[0]._id ?? list[0].id ?? "");
      })
      .catch(() => setInventoryList([]));
  }, [token]);

  const handleSubmit = async (countOverride = null) => {
    const count = parseInt(countOverride ?? forecastCount, 10);
    if (!count || count < 1) {
      if (!countOverride)
        setError(
          `Please enter how many ${forecastPeriod.unit} ahead to forecast.`,
        );
      return;
    }
    if (!token) return;
    if (dataSource === "inventory_stock" && !selectedInventoryId) {
      setError("Please select an inventory item.");
      return;
    }
    try {
      localStorage.setItem(
        "ssa_config",
        JSON.stringify({ source: dataSource, periodType: forecastPeriod.type }),
      );
    } catch (_) {}
    setError("");
    setIsLoading(true);

    try {
      let rows = [];
      if (dataSource === "sales_revenue" || dataSource === "sales_qty") {
        const res = await fetchWithTimeout(
          `${API_URL}/api/admin/sales?limit=2000&status=completed`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const d = await res.json();
        const sales = Array.isArray(d.data ?? d) ? (d.data ?? d) : [];
        const map = {};
        sales.forEach((s) => {
          const date = s.saleDate
            ? new Date(s.saleDate).toISOString().split("T")[0]
            : null;
          if (!date) return;
          if (!map[date]) map[date] = { revenue: 0, qty: 0 };
          map[date].revenue += s.totalPrice ?? 0;
          map[date].qty += s.quantity ?? 0;
        });
        rows = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            value: dataSource === "sales_revenue" ? v.revenue : v.qty,
          }));
      } else {
        const res = await fetchWithTimeout(
          `${API_URL}/api/admin/inventory/${selectedInventoryId}/history`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const d = await res.json();
        const history = Array.isArray(d.data ?? d) ? (d.data ?? d) : [];
        const map = {};
        history.forEach((h) => {
          const date = h.createdAt
            ? new Date(h.createdAt).toISOString().split("T")[0]
            : null;
          if (!date) return;
          map[date] = h.remainingQty ?? 0;
        });
        rows = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, value }));
      }

      if (rows.length < 10) {
        setError(
          `Not enough data points (${rows.length}). SSA requires at least 10.`,
        );
        setIsLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const ssaRes = await fetch(`${SSA_API_URL}/api/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          forecast_periods: count,
          forecast_type: forecastPeriod.type,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const raw =
          typeof err.detail === "string"
            ? err.detail
            : JSON.stringify(err.detail) || "SSA forecast failed.";
        throw new Error(raw.split("\n")[0].split("\\n")[0]);
      }

      const data = await ssaRes.json();
      setSubmittedConfig({
        count,
        period: forecastPeriod,
        source: dataSource,
        sourceLabel:
          DATA_SOURCES.find((s) => s.key === dataSource)?.label ?? "",
      });

      // FIX: The date-shift block that moved forecast dates to "today" has been
      // removed. It was detaching the forecast from the historical series and
      // creating a multi-month gap in the chart. The backend already computes
      // correct forward-looking dates starting from the week after the last
      // historical data point — no frontend override needed.

      if (data.safe_max != null) {
        setDynamicMaxCount(data.safe_max);
        setForecastCount((prev) => {
          const n = parseInt(prev, 10);
          if (!n || n < 1) return prev;
          return n > data.safe_max ? data.safe_max : prev;
        });
      }

      setResult(data);

      // FIX: Use raw DB row count for "Historical Data Points" — this is the
      // true input size before SSA weekly/monthly aggregation. Previously we
      // used data.historical.dates.length which is the trimmed daily display
      // array and was returning 1094 instead of the correct 1095–1096.
      setDataPointCount(rows.length);
      setTrainingPeriods(data.training_n ?? null);

      const btSeries = data?.backtest_series;
      if (btSeries?.dates?.length > 0) {
        setBacktestData(
          btSeries.dates.map((date, i) => ({
            date,
            BacktestActual: btSeries.actuals[i],
          })),
        );
      } else {
        setBacktestData([]);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setError("Forecast timed out. The SSA service may be unavailable.");
      } else {
        setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  handleSubmitRef.current = handleSubmit;
  forecastCountRef.current = forecastCount;

  useEffect(() => {
    if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current);
    const count = parseInt(forecastCount, 10);
    if (!count || count < 1 || !token) return;
    if (dataSource === "inventory_stock" && !selectedInventoryId) return;
    autoRunTimerRef.current = setTimeout(() => {
      handleSubmitRef.current?.();
    }, 700);
    return () => {
      if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current);
    };
  }, [
    dataSource,
    forecastPeriod.type,
    forecastCount,
    selectedInventoryId,
    token,
  ]); // eslint-disable-line

  useEffect(() => {
    if (!token) return;
    if (dataSource === "inventory_stock" && !selectedInventoryId) return;
    if (parseInt(forecastCountRef.current, 10) > 0) return;
    handleSubmitRef.current?.(1);
  }, [token, dataSource, forecastPeriod.type, selectedInventoryId]); // eslint-disable-line

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
      const btPoint = backtestData.find((b) => b.date === histDates[i]);
      data.push({
        date: histDates[i],
        Actual: histValues[i],
        BacktestActual: btPoint ? btPoint.BacktestActual : null,
        Trend: showTrend
          ? histTrend[i] != null
            ? Math.round(histTrend[i] * 100) / 100
            : null
          : undefined,
        Seasonality: showSeasonality
          ? histSeas[i] != null
            ? Math.round(histSeas[i] * 100) / 100
            : null
          : undefined,
        Forecast: null,
        High: null,
        Low: null,
      });
    }
    if (parseInt(forecastCount, 10) > 0) {
      for (let i = 0; i < fcDates.length; i++) {
        const fv = fcValues[i];
        const fh = fcHigh[i];
        const fl = fcLow[i];
        data.push({
          date: fcDates[i],
          Actual: null,
          BacktestActual: null,
          Trend: undefined,
          Seasonality: undefined,
          Forecast: fv != null ? Math.round(fv * 100) / 100 : null,
          High: showConfidence
            ? fh != null
              ? Math.round(fh * 100) / 100
              : null
            : null,
          Low: showConfidence
            ? fl != null
              ? Math.round(fl * 100) / 100
              : null
            : null,
        });
      }
    }
    return data;
  };

  const getDecompChartData = () => {
    if (!result) return [];
    const dates = result.historical?.dates || [];
    const trend = result.historical?.trend || [];
    const seasonality = result.historical?.seasonality || [];
    const noise = result.historical?.noise || [];
    return dates.map((date, i) => ({
      date,
      Trend: trend[i] ?? null,
      Seasonality: seasonality[i] ?? null,
      Noise: noise[i] ?? null,
    }));
  };

  const formatDateLabel = (dateString, periodType, forceDaily = false) => {
    if (!dateString) return dateString;
    const d = new Date(dateString + "T00:00:00Z");
    if (isNaN(d)) return dateString;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const year = d.getUTCFullYear();
    const pt =
      periodType || submittedConfig?.period?.type || forecastPeriod.type;
    const isDaily = forceDaily || result?.granularity === "daily";
    if (isDaily) return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${year}`;
    if (pt === "weekly") return `W${getISOWeek(d)} ${year}`;
    if (pt === "monthly") return `${months[d.getUTCMonth()]} ${year}`;
    if (pt === "annually") return `${year}`;
    return dateString;
  };

  const fcDateSet = new Set(result?.forecast?.dates || []);
  const chartDateFormatter = (dateString) => {
    if (!dateString) return "";
    if (fcDateSet.has(dateString))
      return formatDateLabel(dateString, submittedConfig?.period?.type, false);
    return formatDateLabel(dateString, null, true);
  };

  const yAxisFormatter = (v) => {
    const isRev = submittedConfig?.source === "sales_revenue";
    const prefix = isRev ? "\u20b1" : "";
    if (Math.abs(v) >= 1000000) return prefix + (v / 1000000).toFixed(1) + "M";
    if (Math.abs(v) >= 1000) return prefix + (v / 1000).toFixed(1) + "K";
    return prefix + v.toFixed(0);
  };

  const handleDownloadCSV = () => {
    if (!result || !submittedConfig) return;
    const fcDates = result.forecast?.dates || [];
    const fcValues = result.forecast?.values || [];
    const fcHigh = result.forecast?.confidence_high || [];
    const fcLow = result.forecast?.confidence_low || [];
    let csv = `${submittedConfig.period.tableHeader},Date,Predicted Value,Upper Bound,Lower Bound\n`;
    fcDates.forEach((d, i) => {
      csv += `${i + 1},${d},${fcValues[i]?.toFixed(2) ?? ""},${fcHigh[i]?.toFixed(2) ?? ""},${fcLow[i]?.toFixed(2) ?? ""}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ssa_forecast_${submittedConfig.source}_${submittedConfig.count}${submittedConfig.period.type[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">Sales Forecast</h1>
              <p className="page-subtitle">
                Predict future trends using live data powered by Singular
                Spectrum Analysis.
              </p>
            </div>
          </div>
        </div>

        {!(result && submittedConfig) && (
          <div className="ssa-info-banner">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--gold)"
              strokeWidth="2"
              style={{ flexShrink: 0, marginTop: 2 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              Data is pulled directly from your database. Choose a data source,
              forecast period, and how many periods ahead — results update
              automatically. SSA requires at least 10 historical data points.
            </span>
          </div>
        )}

        <div className="ssa-card">
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              style={{
                fontSize: "0.75rem",
                color: "var(--gray)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              Data Source
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {DATA_SOURCES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`ssa-source-btn ${dataSource === s.key ? "active" : ""}`}
                  onClick={() => {
                    setDataSource(s.key);
                    setDynamicMaxCount(forecastPeriod.maxCount);
                    setResult(null);
                    setSubmittedConfig(null);
                    setError("");
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {dataSource === "inventory_stock" && (
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  fontSize: "0.75rem",
                  color: "var(--gray)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  display: "block",
                  marginBottom: "0.5rem",
                }}
              >
                Inventory Item
              </label>
              {inventoryList.length === 0 ? (
                <span style={{ fontSize: "0.85rem", color: "var(--gray)" }}>
                  Loading inventory...
                </span>
              ) : (
                <select
                  className="ssa-select"
                  value={selectedInventoryId}
                  onChange={(e) => {
                    setSelectedInventoryId(e.target.value);
                    setResult(null);
                    setSubmittedConfig(null);
                  }}
                >
                  {inventoryList.map((item) => (
                    <option
                      key={item._id ?? item.id}
                      value={item._id ?? item.id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--border)",
              margin: "0.25rem 0 1.25rem",
              opacity: 0.5,
            }}
          />

          <div style={{ marginBottom: "1.25rem" }}>
            <label
              style={{
                fontSize: "0.75rem",
                color: "var(--gray)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              Forecast Period
            </label>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "0.75rem",
              }}
            >
              {FORECAST_PERIODS.map((p) => (
                <button
                  key={p.type}
                  type="button"
                  className={`ssa-period-btn ${forecastPeriod.type === p.type ? "active" : ""}`}
                  onClick={() => {
                    setForecastPeriod(p);
                    setDynamicMaxCount(p.maxCount);
                    setForecastCount((prev) => {
                      const n = parseInt(prev, 10);
                      if (!n || n < 1) return "";
                      return Math.min(n, p.maxCount);
                    });
                    setResult(null);
                    setSubmittedConfig(null);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <input
                type="number"
                min={1}
                max={dynamicMaxCount}
                value={forecastCount}
                placeholder="e.g. 4"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setForecastCount("");
                    return;
                  }
                  const v = parseInt(raw, 10);
                  if (!isNaN(v) && v > 0 && v <= dynamicMaxCount)
                    setForecastCount(v);
                }}
                style={{
                  width: "80px",
                  padding: "0.45rem 0.6rem",
                  background: "var(--dark)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--white)",
                  fontSize: "0.875rem",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--gold)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border)";
                }}
              />
              <span style={{ fontSize: "0.85rem", color: "var(--gray)" }}>
                {forecastPeriod.unit} ahead (max {dynamicMaxCount})
              </span>
              {isLoading && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "0.75rem",
                    color: "var(--gold)",
                    fontWeight: 600,
                    opacity: 0.8,
                  }}
                >
                  <svg
                    className="ssa-spinner"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Updating...
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="ssa-error">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {(isLoading || (result && submittedConfig)) &&
          (() => {
            const firstLoad = isLoading && !result;
            const hasForecastCount = parseInt(forecastCount, 10) > 0;
            const vals = result?.historical?.values || [];
            const lastVal =
              result?.last_period_value ??
              (vals.length > 0 ? vals[vals.length - 1] : null);
            const isRevenue =
              (result ? submittedConfig?.source : dataSource) ===
              "sales_revenue";

            // Pass is_high_volatility so resolveAccuracy can adjust tooltip + color
            const acc = resolveAccuracy(
              result?.accuracy,
              result?.is_high_volatility ?? false,
            );
            const mae = result?.accuracy?.mae;
            const L = result?.auto_L?.L_used;
            const period = result?.auto_L?.period_detected;

            return (
              <div className="ssa-stat-grid">
                {/* FIX: dataPointCount = raw DB rows; trainingPeriods = SSA aggregated count */}
                <div className="ssa-stat-card">
                  <div className="ssa-stat-label">Training Periods</div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : (
                    <>
                      <div className="ssa-stat-value">
                        {trainingPeriods ?? dataPointCount}
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--gray)",
                          marginTop: "0.15rem",
                        }}
                      >
                        {trainingPeriods != null
                          ? `${submittedConfig?.period?.unit ?? "periods"} · ${dataPointCount} raw records`
                          : "raw transaction records"}
                      </div>
                    </>
                  )}
                </div>

                <div className="ssa-stat-card">
                  <div className="ssa-stat-label">Forecast Period</div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : hasForecastCount && submittedConfig ? (
                    <div
                      className="ssa-stat-value"
                      style={{ fontSize: "1.1rem" }}
                    >
                      {submittedConfig.count} {submittedConfig.period.unit}
                    </div>
                  ) : (
                    <div
                      className="ssa-stat-value"
                      style={{ color: "var(--gray)", fontSize: "1.5rem" }}
                    >
                      &mdash;
                    </div>
                  )}
                </div>

                <div className="ssa-stat-card">
                  <div className="ssa-stat-label">Last Recorded Value</div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : (
                    <>
                      <div
                        className="ssa-stat-value"
                        style={{ color: "var(--gold)" }}
                      >
                        {lastVal !== null
                          ? `${isRevenue ? "\u20b1" : ""}${lastVal.toFixed(2)}`
                          : "\u2014"}
                      </div>
                      {!isRevenue && (
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--gray)",
                            marginTop: "0.15rem",
                          }}
                        >
                          units
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="ssa-stat-card">
                  <div className="ssa-stat-label">
                    <span className="ssa-tooltip">
                      {acc.label}
                      <span
                        style={{
                          marginLeft: "4px",
                          opacity: 0.5,
                          fontSize: "0.65rem",
                        }}
                      >
                        ⓘ
                      </span>
                      <span className="ssa-tooltip-text">{acc.tooltip}</span>
                    </span>
                  </div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : hasForecastCount ? (
                    <>
                      <div
                        className="ssa-stat-value"
                        style={{ color: acc.color, fontSize: "1.3rem" }}
                      >
                        {acc.display ?? "N/A"}
                        {result?.forecast_dampened && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: "#fbbf24",
                              marginLeft: "6px",
                              fontWeight: 400,
                              verticalAlign: "middle",
                            }}
                          >
                            dampened ⚡
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--gray)",
                          marginTop: "0.15rem",
                        }}
                      >
                        {acc.sublabel}
                      </div>
                    </>
                  ) : (
                    <div
                      className="ssa-stat-value"
                      style={{ color: "var(--gray)", fontSize: "1.5rem" }}
                    >
                      &mdash;
                    </div>
                  )}
                </div>

                <div className="ssa-stat-card">
                  <div className="ssa-stat-label">
                    MAE ({forecastPeriod.unit.replace(/s$/, "")})
                  </div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : hasForecastCount ? (
                    <div
                      className="ssa-stat-value"
                      style={{ fontSize: "1.1rem" }}
                    >
                      {mae != null
                        ? `${isRevenue ? "\u20b1" : ""}${mae.toFixed(2)}`
                        : "N/A"}
                    </div>
                  ) : (
                    <div
                      className="ssa-stat-value"
                      style={{ color: "var(--gray)", fontSize: "1.5rem" }}
                    >
                      &mdash;
                    </div>
                  )}
                </div>

                <div className="ssa-stat-card">
                  <div className="ssa-stat-label">Auto Window (L)</div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : (
                    <>
                      <div
                        className="ssa-stat-value"
                        style={{ fontSize: "1.3rem" }}
                      >
                        {L ?? "\u2014"}
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--gray)",
                          marginTop: "0.15rem",
                        }}
                      >
                        {period
                          ? `period detected: ${period}`
                          : "no clear period"}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

        {result && submittedConfig && (
          <>
            {parseInt(forecastCount, 10) > 0 &&
              result?.data_quality?.is_low_confidence && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.3)",
                    borderRadius: "10px",
                    padding: "0.875rem 1.25rem",
                    marginBottom: "1.5rem",
                    fontSize: "0.85rem",
                    color: "var(--gray)",
                    lineHeight: 1.6,
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2"
                    style={{ flexShrink: 0, marginTop: 2 }}
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>
                    <strong style={{ color: "#fbbf24" }}>
                      Limited historical data —
                    </strong>{" "}
                    This forecast is based on only{" "}
                    {result.data_quality.hist_agg_count}{" "}
                    {submittedConfig.period.unit} of historical data. SSA
                    forecasting is most reliable with 5 or more{" "}
                    {submittedConfig.period.unit}. Treat this forecast as
                    directional only.
                  </span>
                </div>
              )}

            {result?.data_quality?.trim_warning && (
              <div className="ssa-warning-banner">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>{result.data_quality.trim_warning}</span>
              </div>
            )}

            {/* ── High-volatility warning ── */}
            {/* Shown when CV > 1.5: the data is spike-driven, SSA tracks trend only. */}
            {/* Rendered BEFORE the dampening banner so it reads top-down: */}
            {/* 1. What kind of data this is  2. What the model did about it */}
            {result?.is_high_volatility && (
              <div className="ssa-warning-banner">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>
                  <strong style={{ color: "#fbbf24" }}>
                    High demand volatility detected —{" "}
                  </strong>
                  Sales follow an irregular spike pattern (variability:{" "}
                  {result.cv?.toFixed(2)}×). SSA captures the long-run revenue
                  trend
                  {result.trend_avg != null
                    ? ` (~\u20b1${Math.round(result.trend_avg).toLocaleString()}/week baseline)`
                    : ""}
                  . It cannot predict <em>when</em> individual order spikes
                  occur. Use this forecast as a weekly revenue baseline, not an
                  exact prediction.
                </span>
              </div>
            )}

            {result?.forecast_dampened && (
              <div className="ssa-warning-banner">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <strong style={{ color: "#fbbf24" }}>
                    Forecast was dampened —
                  </strong>{" "}
                  The model projected values significantly above your recent
                  sales average, likely due to a past spike being treated as a
                  recurring pattern. The forecast has been scaled down to stay
                  closer to recent actuals.
                </span>
              </div>
            )}

            <div className="ssa-card">
              <div className="ssa-card-header">
                <h2 className="ssa-card-title">
                  {parseInt(forecastCount, 10) > 0
                    ? `${submittedConfig.sourceLabel} \u2014 ${submittedConfig.count} ${submittedConfig.period.unit} Forecast`
                    : `${submittedConfig.sourceLabel} \u2014 Historical Data`}
                </h2>
                {parseInt(forecastCount, 10) > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      className={`ssa-toggle-btn ${showConfidence ? "active" : ""}`}
                      onClick={() => setShowConfidence((v) => !v)}
                    >
                      Confidence Band
                    </button>
                    <button
                      type="button"
                      className={`ssa-toggle-btn ${showTrend ? "active" : ""}`}
                      onClick={() => setShowTrend((v) => !v)}
                    >
                      Trend
                    </button>
                    <button
                      type="button"
                      className={`ssa-toggle-btn ${showSeasonality ? "active" : ""}`}
                      onClick={() => setShowSeasonality((v) => !v)}
                    >
                      Seasonality
                    </button>
                    <span className="ssa-tooltip">
                      <button
                        type="button"
                        className={`ssa-toggle-btn ${showBacktest ? "active" : ""}`}
                        onClick={() => setShowBacktest((v) => !v)}
                      >
                        Backtest
                      </button>
                      <span className="ssa-tooltip-text">
                        Backtest shows how the model would have performed on
                        past data it never saw. The green line = actual sales
                        during the held-out test window. Comparing it to the
                        forecast line shows how trustworthy the model is.
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {showBacktest && backtestData.length > 0 && (
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--gray)",
                    marginBottom: "0.75rem",
                    lineHeight: 1.5,
                    padding: "0.5rem 0.75rem",
                    background: "rgba(74,222,128,0.06)",
                    border: "1px solid rgba(74,222,128,0.15)",
                    borderRadius: "6px",
                  }}
                >
                  <span style={{ color: "#4ade80", fontWeight: 600 }}>
                    ● Backtest Actual
                  </span>
                  {" — real sales during the held-out test window. "}
                  The closer this is to the Forecast line, the more reliable
                  your model is. Gap between them = MAE / SMAPE shown in the
                  stats above.
                </div>
              )}

              <div ref={chartRef} style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {(() => {
                    const chartData = getCombinedChartData();
                    return (
                      <LineChart
                        data={chartData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.06)"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickMargin={8}
                          minTickGap={60}
                          tickFormatter={chartDateFormatter}
                        />
                        <YAxis
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickFormatter={yAxisFormatter}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--dark2)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                          }}
                          itemStyle={{ color: "var(--white)" }}
                          labelStyle={{ color: "var(--gray)" }}
                          labelFormatter={chartDateFormatter}
                        />
                        <Legend
                          wrapperStyle={{
                            paddingTop: "16px",
                            fontSize: "0.8rem",
                          }}
                        />
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
                        {showConfidence && (
                          <>
                            <Line
                              type="monotone"
                              dataKey="High"
                              name="Upper CI"
                              stroke="rgba(212,168,67,0.35)"
                              strokeWidth={1}
                              strokeDasharray="3 3"
                              dot={false}
                              legendType="line"
                            />
                            <Line
                              type="monotone"
                              dataKey="Low"
                              name="Lower CI"
                              stroke="rgba(212,168,67,0.35)"
                              strokeWidth={1}
                              strokeDasharray="3 3"
                              dot={false}
                              legendType="line"
                            />
                          </>
                        )}
                        {showTrend && (
                          <Line
                            type="monotone"
                            dataKey="Trend"
                            stroke="#60a5fa"
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 3 }}
                          />
                        )}
                        {showSeasonality && (
                          <Line
                            type="monotone"
                            dataKey="Seasonality"
                            stroke="#a78bfa"
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 3 }}
                          />
                        )}
                        {showBacktest && backtestData.length > 0 && (
                          <Line
                            type="monotone"
                            dataKey="BacktestActual"
                            name="Backtest Actual"
                            stroke="#4ade80"
                            strokeWidth={2}
                            strokeDasharray="4 2"
                            dot={false}
                            activeDot={{ r: 3 }}
                            legendType="line"
                          />
                        )}
                        {chartData.length > 1 &&
                          (() => {
                            const window =
                              result?.granularity === "daily" ? 365 : 60;
                            const si = Math.max(
                              0,
                              chartData.length -
                                Math.min(window, chartData.length),
                            );
                            return (
                              <Brush
                                dataKey="date"
                                height={28}
                                stroke="#3a3a3a"
                                fill="#1a1a1a"
                                travellerWidth={8}
                                tickFormatter={chartDateFormatter}
                                startIndex={si}
                                endIndex={chartData.length - 1}
                              />
                            );
                          })()}
                        {parseInt(forecastCount, 10) > 0 &&
                          (() => {
                            const firstFcDate = result?.forecast?.dates?.[0];
                            return firstFcDate ? (
                              <ReferenceLine
                                x={firstFcDate}
                                stroke="rgba(255,255,255,0.2)"
                                strokeDasharray="4 4"
                                label={{
                                  value: "Forecast Start",
                                  position: "insideTopLeft",
                                  fill: "var(--gray)",
                                  fontSize: 10,
                                }}
                              />
                            ) : null;
                          })()}
                      </LineChart>
                    );
                  })()}
                </ResponsiveContainer>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "0.75rem",
              }}
            >
              <button
                className={`ssa-source-btn ${showDecomp ? "active" : ""}`}
                type="button"
                onClick={() => setShowDecomp((v) => !v)}
              >
                {showDecomp
                  ? "Hide SSA Decomposition"
                  : "Show SSA Decomposition"}
              </button>
            </div>

            {showDecomp && (
              <div className="ssa-card" style={{ marginBottom: "1rem" }}>
                <div className="ssa-card-header">
                  <h2 className="ssa-card-title">SSA Decomposition</h2>
                  <span style={{ fontSize: "0.75rem", color: "var(--gray)" }}>
                    {"Trend \u00b7 Seasonality \u00b7 Noise"}
                  </span>
                </div>
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={getDecompChartData()}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.06)"
                      />
                      <XAxis
                        dataKey="date"
                        stroke="var(--gray)"
                        tick={{ fill: "var(--gray)", fontSize: 11 }}
                        tickMargin={8}
                        minTickGap={60}
                        tickFormatter={(v) => formatDateLabel(v, null, true)}
                      />
                      <YAxis
                        stroke="var(--gray)"
                        tick={{ fill: "var(--gray)", fontSize: 11 }}
                        tickFormatter={yAxisFormatter}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--dark2)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                        }}
                        itemStyle={{ color: "var(--white)" }}
                        labelStyle={{ color: "var(--gray)" }}
                        labelFormatter={(v) => formatDateLabel(v, null, true)}
                      />
                      <Legend
                        wrapperStyle={{
                          paddingTop: "16px",
                          fontSize: "0.8rem",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Trend"
                        stroke="var(--gold)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Seasonality"
                        stroke="#60a5fa"
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Noise"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth={1}
                        dot={false}
                        activeDot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--gray)",
                    marginTop: "0.75rem",
                    marginBottom: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Trend: long-run direction. Seasonality: periodic patterns.
                  Noise: residual.
                </p>
              </div>
            )}

            {parseInt(forecastCount, 10) > 0 && (
              <>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--gray)",
                    fontStyle: "italic",
                    marginTop: "0.75rem",
                    marginBottom: "0.5rem",
                    lineHeight: 1.5,
                  }}
                >
                  {
                    "SSA decomposed the series into trend, seasonality, and noise. Shaded bands show \u00b11.96\u03c3 confidence interval."
                  }
                </p>
                {result?.auto_L && (
                  <p
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--gray)",
                      fontStyle: "italic",
                      marginTop: "0.25rem",
                      marginBottom: "1.5rem",
                    }}
                  >
                    {`Window length L=${result.auto_L.L_used} was selected automatically`}
                    {result.auto_L.period_detected
                      ? ` based on a detected period of ${result.auto_L.period_detected} input-granularity steps.`
                      : " (no dominant period detected; fallback heuristic used)."}
                  </p>
                )}
              </>
            )}

            {parseInt(forecastCount, 10) > 0 && (
              <div className="ssa-card">
                <div className="ssa-card-header">
                  <h2 className="ssa-card-title">Forecasted Values</h2>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-secondary"
                      onClick={handleDownloadCSV}
                      style={{
                        fontSize: "0.8rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download CSV
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        const node = chartRef.current;
                        if (!node) return;
                        import("html2canvas").then(
                          ({ default: html2canvas }) => {
                            html2canvas(node, {
                              backgroundColor: "#1a1a1a",
                            }).then((canvas) => {
                              const a = document.createElement("a");
                              a.download = `ssa_chart_${submittedConfig.source}_${submittedConfig.count}${submittedConfig.period.type[0]}.png`;
                              a.href = canvas.toDataURL("image/png");
                              a.click();
                            });
                          },
                        );
                      }}
                      style={{
                        fontSize: "0.8rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      Download PNG
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>{submittedConfig.period.tableHeader}</th>
                        <th>Date</th>
                        <th>Predicted Value</th>
                        <th>Upper Bound</th>
                        <th>Lower Bound</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.forecast?.dates || []).map((date, idx) => (
                        <tr key={idx} className="ssa-forecast-day-row">
                          <td>{idx + 1}</td>
                          <td
                            style={{
                              fontSize: "0.85rem",
                              color: "var(--gray)",
                            }}
                          >
                            {formatDateLabel(date, submittedConfig.period.type)}
                          </td>
                          <td>
                            <span
                              style={{ color: "var(--gold)", fontWeight: 600 }}
                            >
                              {(result.forecast?.values || [])[idx]?.toFixed(
                                2,
                              ) ?? "\u2014"}
                            </span>
                          </td>
                          <td
                            style={{
                              fontSize: "0.85rem",
                              color: "rgba(212,168,67,0.6)",
                            }}
                          >
                            {(result.forecast?.confidence_high || [])[
                              idx
                            ]?.toFixed(2) ?? "\u2014"}
                          </td>
                          <td
                            style={{
                              fontSize: "0.85rem",
                              color: "rgba(212,168,67,0.6)",
                            }}
                          >
                            {(result.forecast?.confidence_low || [])[
                              idx
                            ]?.toFixed(2) ?? "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
    </ErrorBoundary>
  );
}
