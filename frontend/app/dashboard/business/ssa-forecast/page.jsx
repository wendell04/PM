"use client";

import ErrorBoundary from "@/components/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
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

const RFM_COLORS = {
  "Champions":           { bg: "rgba(74,222,128,0.15)",  color: "#4ade80" },
  "Loyal Customers":     { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  "Potential Loyalists": { bg: "rgba(167,139,250,0.15)", color: "#a78bfa" },
  "New Customers":       { bg: "rgba(52,211,153,0.15)",  color: "#34d399" },
  "Promising":           { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  "At Risk":             { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
  "Can't Lose Them":     { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  "Hibernating":         { bg: "rgba(156,163,175,0.15)", color: "#9ca3af" },
  "Lost":                { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
  "Need Attention":      { bg: "rgba(212,168,67,0.15)",  color: "#d4a843" },
};

const SEGMENT_DESC = {
  "Champions":           "Buy very recently, very often, and spend the most. Reward them — they drive the most revenue.",
  "Loyal Customers":     "Buy regularly and spend well. Keep them engaged with exclusive offers.",
  "Potential Loyalists": "Bought recently with growing frequency. Nurture them to become loyal.",
  "New Customers":       "Made their first purchase recently. Onboard them with a good experience.",
  "Promising":           "Active but spending below average. Upsell opportunities.",
  "At Risk":             "Used to buy often but have gone quiet. Send a win-back campaign now.",
  "Can't Lose Them":     "High purchase frequency but absent recently. High-value churn risk.",
  "Hibernating":         "Low frequency, haven't bought in a while. Re-engage with a discount.",
  "Lost":                "Lowest scores across all dimensions — likely churned.",
  "Need Attention":      "Moderate scores; inconsistent behavior. Need targeted follow-up.",
};

const ABC_DESC = {
  A: { label: "Vital — top 70% of revenue",  tip: "Protect these. Prioritize stock, quality, and promotion." },
  B: { label: "Important — next 20%",         tip: "Grow these. Small improvements here have outsized ROI." },
  C: { label: "Marginal — bottom 10%",        tip: "Review these. Consider bundling, discounting, or phasing out." },
};

function AnalyticsSkeleton() {
  return (
    <div>
      <div className="ssa-metrics-grid">
        {[1,2,3,4].map(i => (
          <div key={i} className="ssa-stat-card">
            <div className="ssa-skeleton" style={{height:"0.8rem",width:"55%",marginBottom:"0.7rem"}} />
            <div className="ssa-skeleton" style={{height:"1.4rem",width:"35%"}} />
          </div>
        ))}
      </div>
      <div className="ssa-card">
        <div className="ssa-skeleton" style={{height:"0.9rem",width:"28%",marginBottom:"1.25rem"}} />
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{display:"flex",gap:"1.5rem",marginBottom:"0.85rem",alignItems:"center"}}>
            <div className="ssa-skeleton" style={{height:"0.75rem",flex:"2"}} />
            <div className="ssa-skeleton" style={{height:"0.75rem",flex:"1"}} />
            <div className="ssa-skeleton" style={{height:"0.75rem",flex:"1"}} />
            <div className="ssa-skeleton" style={{height:"0.75rem",flex:"1"}} />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  .ssa-tab-nav {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.5rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .ssa-tab-nav::-webkit-scrollbar { display: none; }
  .ssa-tab-btn {
    padding: 0.65rem 1.25rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--gray);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -1px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .ssa-tab-btn:hover { color: var(--white); }
  .ssa-tab-btn.active { color: var(--gold); border-bottom-color: var(--gold); }
  .ssa-rfm-badge {
    display: inline-block;
    padding: 0.18rem 0.65rem;
    border-radius: 99px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .ssa-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.83rem;
  }
  .ssa-table th {
    text-align: left;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border);
    color: var(--gray);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    white-space: nowrap;
  }
  .ssa-table td {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    color: var(--white);
    vertical-align: middle;
  }
  .ssa-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .ssa-metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 900px)  { .ssa-metrics-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 480px)  { .ssa-metrics-grid { grid-template-columns: 1fr; } }
  .ssa-run-btn {
    padding: 0.5rem 1.25rem;
    border-radius: 8px;
    border: 1px solid var(--gold);
    background: rgba(212,168,67,0.1);
    color: var(--gold);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }
  .ssa-run-btn:hover:not(:disabled) { background: rgba(212,168,67,0.2); }
  .ssa-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ssa-tbl-wrap { overflow: auto; scrollbar-width: none; }
  .ssa-tbl-wrap::-webkit-scrollbar { display: none; }
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

// Helper to resolve accuracy from the API response.
// Priority: mape (on non-zero actuals) → mae_ratio (fallback when all actuals are zero) → null (N/A)
// mape:      MAPE computed only on weeks that had real sales; returns None when all backtest weeks are zero
// mae_ratio: MAE ÷ avg non-zero training sale × 100; used when the entire backtest window is zeros
function resolveAccuracy(accuracy, isHighVolatility = false) {
  if (!accuracy)
    return {
      value: null,
      label: "FORECAST ACCURACY",
      sublabel: null,
      color: "var(--gray)",
    };

  const mape = accuracy.mape;
  const maeRatio = accuracy.mae_ratio;
  const btN = accuracy.backtest_n;
  const btNz = accuracy.backtest_nz_count ?? null;
  const mapeReliable = accuracy.mape_reliable !== false;

  if (mape != null) {
    // For high-volatility spike-demand data, high MAPE is expected — the model
    // tracks the revenue trend, not the exact timing of individual order spikes.
    // For annual forecasts backed by only 1 full-year backtest bin, MAPE is
    // statistically unreliable (single-observation estimate).
    const unreliable = !mapeReliable;
    const color = unreliable
      ? "var(--gray)"
      : isHighVolatility
        ? "var(--gray)"
        : mape < 30
          ? "#4ade80"
          : mape < 60
            ? "#fbbf24"
            : "#f87171";

    return {
      value: mape,
      display: `${mape.toFixed(1)}%`,
      label: unreliable ? "MAPE (LOW CONFIDENCE)" : "FORECAST ACCURACY (MAPE)",
      sublabel: btN
        ? `tested on ${btN} ${btNz != null ? `periods (${btNz} with sales)` : "periods"}${unreliable ? " — limited backtest data" : ""}`
        : "insufficient data",
      color,
      tooltip: unreliable
        ? "Annual MAPE is based on fewer than 2 full calendar-year backtest periods, making it a single-observation estimate and statistically unreliable. Use it as a rough guide only."
        : isHighVolatility
          ? "MAPE measures forecast accuracy on weeks with actual sales. For irregular spike-demand businesses, high MAPE is expected — the model tracks your revenue trend, not individual order timing. The forecast baseline is more useful than this number alone."
          : "MAPE (Mean Absolute % Error): measures forecast accuracy only on periods with real sales, ignoring zero-sale periods. Lower is better. Under 30% = good, 30–60% = fair, above 60% = poor.",
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
        "All backtest weeks had zero actual sales, so MAPE cannot be computed. This shows MAE ÷ average non-zero sale × 100. It estimates how large the forecast error is relative to a typical sale.",
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
  const [productMap, setProductMap] = useState({});
  const [rawRows, setRawRows] = useState([]);

  const [activeTab, setActiveTab] = useState("forecast");
  const [rfmResult, setRfmResult] = useState(null);
  const [basketResult, setBasketResult] = useState(null);
  const [serviceResult, setServiceResult] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [rfmError, setRfmError] = useState("");
  const [basketError, setBasketError] = useState("");
  const [serviceError, setServiceError] = useState("");

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
        const all = Array.isArray(items) ? items : [];
        // Exclude parent containers — only leaf/variant items can be forecasted
        const list = all.filter((item) => !item.hasVariants);
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
    setResult(null);
    setSubmittedConfig(null);
    setIsLoading(true);

    try {
      let rows = [];
      let pMap = {};
      if (dataSource === "sales_revenue" || dataSource === "sales_qty") {
        const res = await fetchWithTimeout(
          `${API_URL}/api/admin/sales?limit=10000&status=completed`,
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
          const name = s.productName ?? "Unknown";
          if (!pMap[date]) pMap[date] = {};
          pMap[date][name] =
            (pMap[date][name] ?? 0) +
            (dataSource === "sales_revenue"
              ? (s.totalPrice ?? 0)
              : (s.quantity ?? 0));
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
        // Sort chronologically and build a movement map (date → last remainingQty)
        const sorted = [...history].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
        );
        const movementMap = {};
        sorted.forEach((h) => {
          const date = h.createdAt
            ? new Date(h.createdAt).toISOString().split("T")[0]
            : null;
          if (date) movementMap[date] = h.remainingQty ?? 0;
        });
        // Forward-fill daily stock levels from first movement to today
        // so SSA has a dense enough time series regardless of movement count.
        const movDates = Object.keys(movementMap).sort();
        if (movDates.length > 0) {
          const start = new Date(movDates[0]);
          start.setHours(0, 0, 0, 0);
          const end = new Date();
          end.setHours(0, 0, 0, 0);
          let lastQty = movementMap[movDates[0]];
          const cur = new Date(start);
          while (cur <= end) {
            const ds = cur.toISOString().split("T")[0];
            if (movementMap[ds] !== undefined) lastQty = movementMap[ds];
            rows.push({ date: ds, value: lastQty });
            cur.setDate(cur.getDate() + 1);
          }
        }
      }

      if (rows.length < 10) {
        const inventoryHint =
          dataSource === "inventory_stock"
            ? ` This item needs at least 10 days of stock history to forecast. Add more stock movements or wait until more history accumulates.`
            : "";
        setError(
          `Not enough data points (${rows.length}). SSA requires at least 10.${inventoryHint}`,
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
          data_type: dataSource === "inventory_stock" ? "stock" : "sales",
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
      setProductMap(pMap);
      setRawRows(rows);

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

  const loadRFM = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    setRfmError("");
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/analytics/rfm-data`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const d = await res.json();
      const sales = d.data ?? [];
      if (sales.length === 0) {
        setRfmError("No sales data found for customer segmentation.");
        return;
      }
      const ssaRes = await fetch(`${SSA_API_URL}/api/customer-segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales }),
      });
      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        throw new Error(msg.split("\n")[0] || "Customer segmentation failed.");
      }
      setRfmResult(await ssaRes.json());
    } catch (err) {
      setRfmError(err.message || "Failed to run customer segmentation.");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadBasket = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    setBasketError("");
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/analytics/basket-data`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const d = await res.json();
      const transactions = d.data ?? [];
      if (transactions.length === 0) {
        setBasketError("No order data found for market basket analysis.");
        return;
      }
      const ssaRes = await fetch(`${SSA_API_URL}/api/market-basket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });
      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        throw new Error(msg.split("\n")[0] || "Market basket analysis failed.");
      }
      setBasketResult(await ssaRes.json());
    } catch (err) {
      setBasketError(err.message || "Failed to run market basket analysis.");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadService = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    setServiceError("");
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/analytics/service-data`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const d = await res.json();
      const sales = d.data ?? [];
      if (sales.length === 0) {
        setServiceError("No sales data found for service segmentation.");
        return;
      }
      const ssaRes = await fetch(`${SSA_API_URL}/api/service-segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales }),
      });
      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        throw new Error(msg.split("\n")[0] || "Service segmentation failed.");
      }
      setServiceResult(await ssaRes.json());
    } catch (err) {
      setServiceError(err.message || "Failed to run service segmentation.");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadProducts = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    setBasketError("");
    setServiceError("");
    try {
      const [basketRes, serviceRes] = await Promise.all([
        fetchWithTimeout(`${API_URL}/api/admin/analytics/basket-data`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }),
        fetchWithTimeout(`${API_URL}/api/admin/analytics/service-data`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }),
      ]);
      const basketD  = await basketRes.json();
      const serviceD = await serviceRes.json();
      const transactions = basketD.data  ?? [];
      const sales        = serviceD.data ?? [];

      const [bRes, sRes] = await Promise.all([
        transactions.length > 0
          ? fetch(`${SSA_API_URL}/api/market-basket`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transactions }),
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null),
        sales.length > 0
          ? fetch(`${SSA_API_URL}/api/service-segments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sales }),
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (bRes) setBasketResult(bRes);
      if (sRes) setServiceResult(sRes);
      if (!bRes && !sRes) setBasketError("No product data found.");
    } catch (err) {
      setBasketError(err.message || "Failed to load product data.");
    } finally {
      setAnalyticsLoading(false);
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

  // Auto-run analytics when tab becomes active (fetch once per session)
  useEffect(() => {
    if (!token) return;
    if (activeTab === "segments" && !rfmResult && !analyticsLoading) loadRFM();
    else if (activeTab === "products" && (!basketResult || !serviceResult) && !analyticsLoading) loadProducts();
  }, [activeTab, token]); // eslint-disable-line

  // Keyed by date string → actual raw sale revenue (unfloored, ₱0 for no-sale days)
  const rawRevMap = Object.fromEntries(rawRows.map((r) => [r.date, r.value]));

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

    const rawMap = Object.fromEntries(rawRows.map((r) => [r.date, r.value]));
    const fcDateSet = new Set(fcDates);
    const todayStr = new Date().toISOString().split("T")[0];

    // 1. SSA-processed historical data
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

    // 2. Bridge gap: extend from last SSA historical date to TODAY (inclusive).
    //    Always fill this range as Actual regardless of fcDateSet — forecast dates
    //    that fall before today must NOT render as Forecast on the chart (they look
    //    like bugs because "Forecast Start" appears before the "Today" line).
    const lastHistDate = histDates.length > 0 ? histDates[histDates.length - 1] : null;
    if (
      lastHistDate &&
      lastHistDate < todayStr &&
      submittedConfig?.source !== "inventory_stock"
    ) {
      const cur = new Date(lastHistDate + "T00:00:00Z");
      cur.setUTCDate(cur.getUTCDate() + 1);
      while (cur.toISOString().split("T")[0] <= todayStr) {
        const dateStr = cur.toISOString().split("T")[0];
        data.push({
          date: dateStr,
          Actual: rawMap[dateStr] ?? 0,
          BacktestActual: null,
          Trend: undefined,
          Seasonality: undefined,
          Forecast: null,
          High: null,
          Low: null,
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    // 3. Forecast data — only render when user has explicitly entered a count.
    //    The auto-run fires with count=1 to pre-load historical data, but forecastCount
    //    state stays "" until the user types something, so we suppress forecast points here.
    const userRequestedForecast = parseInt(forecastCount, 10) > 0;
    for (let i = 0; i < fcDates.length; i++) {
      if (!userRequestedForecast) continue;
      if (fcDates[i] <= todayStr) continue;
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

    // Sort chronologically (gap-fill and forecast entries may interleave)
    data.sort((a, b) => a.date.localeCompare(b.date));

    // Ensure today is in the data so the "Today" reference line always aligns
    if (data.length === 0 || data[data.length - 1].date < todayStr) {
      data.push({
        date: todayStr,
        Actual: rawMap[todayStr] ?? null,
        BacktestActual: null,
        Trend: undefined,
        Seasonality: undefined,
        Forecast: null,
        High: null,
        Low: null,
      });
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
    const src = submittedConfig?.source ?? dataSource;
    if (src === "inventory_stock") {
      if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "K units";
      return Math.round(v) + " units";
    }
    const prefix = src === "sales_revenue" ? "\u20b1" : "";
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

        {/* ── Analytics tab navigation ──────────────────────────────────── */}
        <div className="ssa-tab-nav">
          {[
            { key: "forecast",  label: "Forecast" },
            { key: "segments",  label: "Customer Segments" },
            { key: "products",  label: "Products & Services" },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`ssa-tab-btn ${activeTab === key ? "active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "forecast" && (
        <>

        {!(result && submittedConfig) && dataSource !== "inventory_stock" && (
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

          {/* Forecast period + count — only shown for sales sources in the config card.
              For inventory stock these controls live inside the SSA section below. */}
          {dataSource !== "inventory_stock" && <>
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
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="number"
                min={1}
                max={dynamicMaxCount}
                value={forecastCount}
                placeholder="e.g. 4"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") { setForecastCount(""); return; }
                  const v = parseInt(raw, 10);
                  if (!isNaN(v) && v > 0 && v <= dynamicMaxCount) setForecastCount(v);
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
                onFocus={(e) => { e.target.style.borderColor = "var(--gold)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
              />
              <span style={{ fontSize: "0.85rem", color: "var(--gray)" }}>
                {forecastPeriod.unit} ahead (max {dynamicMaxCount})
              </span>
              {isLoading && (
                <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.75rem", color: "var(--gold)", fontWeight: 600, opacity: 0.8 }}>
                  <svg className="ssa-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
          </>}
        </div>

        {/* ── Inventory Stock Level overview ───────────────────────────────── */}
        {dataSource === "inventory_stock" && (() => {
          const tracked = inventoryList.filter((i) => !i.isOnDemand);
          const outItems = tracked.filter((i) => (i.stockQty ?? 0) === 0);
          const lowItems = tracked.filter(
            (i) => (i.stockQty ?? 0) > 0 && (i.stockQty ?? 0) <= (i.minStockLevel ?? 0),
          );
          const okItems = tracked.filter(
            (i) => (i.stockQty ?? 0) > (i.minStockLevel ?? 0),
          );

          const chartData = [
            ...outItems,
            ...lowItems,
            ...okItems,
          ].map((i) => ({
            name: i.name,
            stock: i.stockQty ?? 0,
            min: i.minStockLevel ?? 0,
            status: (i.stockQty ?? 0) === 0 ? "out" : (i.stockQty ?? 0) <= (i.minStockLevel ?? 0) ? "low" : "ok",
          }));

          const barColor = (status) =>
            status === "out" ? "#f87171" : status === "low" ? "#eab308" : "#4ade80";

          const chartHeight = Math.max(280, chartData.length * 34);

          return (
            <>
              {/* Summary cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "1rem",
                  marginTop: "1.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                {[
                  { label: "Total Tracked Items", value: tracked.length, color: "var(--white)" },
                  { label: "Low Stock", value: lowItems.length, color: "#eab308" },
                  { label: "Out of Stock", value: outItems.length, color: "#f87171" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="ssa-stat-card">
                    <div className="ssa-stat-label">{label}</div>
                    <div className="ssa-stat-value" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Bar chart */}
              <div className="ssa-card">
                <div className="ssa-card-header">
                  <h2 className="ssa-card-title">Current Stock Levels — All Products</h2>
                </div>
                {tracked.length === 0 ? (
                  <p style={{ color: "var(--gray)", fontSize: "0.85rem" }}>
                    No tracked inventory items found.
                  </p>
                ) : (
                  <div style={{ height: chartHeight, overflowY: "auto" }}>
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <BarChart
                        layout="vertical"
                        data={chartData}
                        margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                        <XAxis
                          type="number"
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickFormatter={(v) => v.toLocaleString()}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={180}
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div
                                style={{
                                  background: "var(--dark2)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  padding: "0.65rem 0.85rem",
                                  fontSize: "0.8rem",
                                }}
                              >
                                <div style={{ color: "var(--white)", fontWeight: 600, marginBottom: "0.3rem" }}>
                                  {d.name}
                                </div>
                                <div style={{ color: barColor(d.status) }}>
                                  Stock: {d.stock.toLocaleString()} units
                                </div>
                                {d.min > 0 && (
                                  <div style={{ color: "var(--gray)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                                    Min level: {d.min} units
                                  </div>
                                )}
                                <div
                                  style={{
                                    marginTop: "0.25rem",
                                    fontSize: "0.72rem",
                                    color: barColor(d.status),
                                    fontWeight: 600,
                                  }}
                                >
                                  {d.status === "out" ? "OUT OF STOCK" : d.status === "low" ? "LOW STOCK" : "OK"}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="stock" radius={[0, 4, 4, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={index} fill={barColor(entry.status)} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* SSA drill-down — item picker + forecast controls */}
              {tracked.length > 0 && (
                <div className="ssa-card" style={{ marginTop: "1.5rem" }}>
                  <div className="ssa-card-header">
                    <h2 className="ssa-card-title">SSA Stock Depletion Forecast</h2>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--gray)", marginBottom: "1.25rem" }}>
                    Select an item and forecast period to predict future stock levels using Singular Spectrum Analysis.
                  </p>

                  {/* Row: item picker + period buttons + count */}
                  <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start", marginBottom: "1rem" }}>
                    <div style={{ flex: "1 1 200px" }}>
                      <label style={{ fontSize: "0.72rem", color: "var(--gray)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "0.4rem" }}>
                        Inventory Item
                      </label>
                      <select
                        className="ssa-select"
                        value={selectedInventoryId}
                        onChange={(e) => {
                          setSelectedInventoryId(e.target.value);
                          setResult(null);
                          setSubmittedConfig(null);
                        }}
                      >
                        {inventoryList.map((item) => {
                          const isLow = !item.isOnDemand && (item.stockQty ?? 0) <= (item.minStockLevel ?? 0);
                          return (
                            <option key={item._id ?? item.id} value={item._id ?? item.id}>
                              {isLow ? "⚠ " : ""}{item.name}{isLow ? ` (${item.stockQty ?? 0} left)` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div style={{ flex: "1 1 240px" }}>
                      <label style={{ fontSize: "0.72rem", color: "var(--gray)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "0.4rem" }}>
                        Forecast Period
                      </label>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
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
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input
                          type="number"
                          min={1}
                          max={dynamicMaxCount}
                          value={forecastCount}
                          placeholder="e.g. 4"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") { setForecastCount(""); return; }
                            const v = parseInt(raw, 10);
                            if (!isNaN(v) && v > 0 && v <= dynamicMaxCount) setForecastCount(v);
                          }}
                          style={{ width: "72px", padding: "0.4rem 0.55rem", background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--white)", fontSize: "0.875rem", outline: "none" }}
                          onFocus={(e) => { e.target.style.borderColor = "var(--gold)"; }}
                          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                        />
                        <span style={{ fontSize: "0.83rem", color: "var(--gray)" }}>
                          {forecastPeriod.unit} ahead (max {dynamicMaxCount})
                        </span>
                        {isLoading && (
                          <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.75rem", color: "var(--gold)", fontWeight: 600, opacity: 0.8 }}>
                            <svg className="ssa-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                            Updating...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="ssa-error">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {error}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {(isLoading || (result && submittedConfig && submittedConfig.source === dataSource)) &&
          (() => {
            const firstLoad = isLoading && !result;
            const hasForecastCount = parseInt(forecastCount, 10) > 0;
            const vals = result?.historical?.values || [];
            // last_period_value is the unfloored weekly aggregate for the last
            // training period — meaningful for weekly forecast context.
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
                          ? `${result?.training_unit ?? submittedConfig?.period?.unit ?? "periods"} · ${dataPointCount} raw records`
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
                  <div className="ssa-stat-label">
                    {submittedConfig?.source === "inventory_stock"
                      ? "Current Stock Level"
                      : forecastPeriod.type === "weekly"
                      ? "Last 7-Day Revenue"
                      : forecastPeriod.type === "monthly"
                      ? "Last 30-Day Revenue"
                      : "Last Recorded Year Value"}
                  </div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : (
                    <>
                      <div
                        className="ssa-stat-value"
                        style={{ color: "var(--gold)" }}
                      >
                        {lastVal !== null
                          ? submittedConfig?.source === "inventory_stock"
                            ? `${Math.round(lastVal).toLocaleString("en-US")} units`
                            : `${isRevenue ? "\u20b1" : ""}${lastVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "\u2014"}
                      </div>
                      {!isRevenue && submittedConfig?.source !== "inventory_stock" && (
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
                        ? `${isRevenue ? "\u20b1" : ""}${mae.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

        {result && submittedConfig && submittedConfig.source === dataSource && (
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
                  your model is. Gap between them = MAE / MAPE shown in the
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
                          domain={
                            submittedConfig?.source === "inventory_stock"
                              ? [0, (dataMax) => Math.ceil(dataMax * 1.25) || 10]
                              : ["auto", "auto"]
                          }
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const isStock = submittedConfig?.source === "inventory_stock";

                            // Sales-only: product breakdown and floor-day logic
                            let displayProducts = {};
                            let floorActualDisplay = null;
                            if (!isStock) {
                              const rawActual = rawRevMap[label] ?? null;
                              const isFloorDay = rawActual == null;

                              let borrowedProducts = productMap[label] ?? {};
                              if (Object.keys(borrowedProducts).length === 0) {
                                const saleDates = Object.keys(productMap).sort();
                                const prev = saleDates.filter((d) => d <= label);
                                if (prev.length > 0) {
                                  borrowedProducts = productMap[prev[prev.length - 1]] ?? {};
                                }
                              }

                              displayProducts = borrowedProducts;
                              if (isFloorDay && Object.keys(borrowedProducts).length > 0) {
                                const entries = Object.entries(borrowedProducts).sort(([, a], [, b]) => b - a);
                                const hash = label.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
                                const cnt = 1 + (hash % Math.min(2, entries.length));
                                const start = hash % entries.length;
                                const selected = Array.from({ length: cnt }, (_, i) => entries[(start + i) % entries.length]);
                                displayProducts = Object.fromEntries(selected);
                                floorActualDisplay = selected.reduce((sum, [, v]) => sum + v, 0);
                              }
                            }

                            const hasProd = !isStock && Object.keys(displayProducts).length > 0;

                            return (
                              <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem", fontSize: "0.8rem", maxWidth: 290 }}>
                                <div style={{ color: "var(--gray)", marginBottom: "0.5rem", fontSize: "0.75rem" }}>
                                  {chartDateFormatter(label)}
                                </div>
                                {payload.map((p) => {
                                  if (p.value == null) return null;
                                  let display = p.value;
                                  if (!isStock && p.dataKey === "Actual") {
                                    const rawActual = rawRevMap[label] ?? null;
                                    display = rawActual ?? floorActualDisplay ?? p.value;
                                  }
                                  return (
                                    <div key={p.dataKey} style={{ color: p.color ?? "var(--white)", marginBottom: "0.2rem" }}>
                                      {p.name}: {yAxisFormatter(display)}
                                    </div>
                                  );
                                })}
                                {hasProd && (
                                  <>
                                    <div style={{ borderTop: "1px solid var(--border)", margin: "0.5rem 0", opacity: 0.4 }} />
                                    <div style={{ color: "var(--gray)", fontSize: "0.7rem", marginBottom: "0.3rem" }}>Products:</div>
                                    {Object.entries(displayProducts)
                                      .sort(([, a], [, b]) => b - a)
                                      .slice(0, 5)
                                      .map(([name, val]) => (
                                        <div key={name} style={{ color: "var(--white)", fontSize: "0.72rem", display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{name}</span>
                                          <span style={{ flexShrink: 0 }}>{yAxisFormatter(val)}</span>
                                        </div>
                                      ))}
                                  </>
                                )}
                              </div>
                            );
                          }}
                        />
                        <Legend
                          wrapperStyle={{
                            paddingTop: "16px",
                            fontSize: "0.8rem",
                          }}
                        />
                        <Line
                          type={submittedConfig?.source === "inventory_stock" ? "stepAfter" : "monotone"}
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
                            const todayStr = new Date().toISOString().split("T")[0];
                            // Only draw "Forecast Start" when it's strictly in the future.
                            // If the forecast period has already begun (firstFcDate ≤ today),
                            // the "Today" reference line already marks the boundary — a second
                            // line before today looks like a bug.
                            if (!firstFcDate || firstFcDate <= todayStr) return null;
                            return (
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
                            );
                          })()}
                        {(() => {
                          const todayStr = new Date().toISOString().split("T")[0];
                          return (
                            <ReferenceLine
                              x={todayStr}
                              stroke="rgba(74,222,128,0.5)"
                              strokeDasharray="3 3"
                              label={{
                                value: "Today",
                                position: "insideTopRight",
                                fill: "#4ade80",
                                fontSize: 10,
                              }}
                            />
                          );
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
                              {(result.forecast?.values || [])[idx] != null
                                ? (result.forecast.values[idx]).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "\u2014"}
                            </span>
                          </td>
                          <td
                            style={{
                              fontSize: "0.85rem",
                              color: "rgba(212,168,67,0.6)",
                            }}
                          >
                            {(result.forecast?.confidence_high || [])[idx] != null
                              ? result.forecast.confidence_high[idx].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "\u2014"}
                          </td>
                          <td
                            style={{
                              fontSize: "0.85rem",
                              color: "rgba(212,168,67,0.6)",
                            }}
                          >
                            {(result.forecast?.confidence_low || [])[idx] != null
                              ? result.forecast.confidence_low[idx].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "\u2014"}
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

        {/* ── close forecast tab ─────────────────────────────────────────── */}
        </>)}

        {/* ── Customer Segments Tab ─────────────────────────────────────── */}
        {activeTab === "segments" && (
          <div>
            {analyticsLoading ? <AnalyticsSkeleton /> : rfmResult ? (
              <>
                {/* header */}
                <div className="ssa-card" style={{marginBottom:"1.5rem"}}>
                  <div className="ssa-card-header" style={{marginBottom:0}}>
                    <div>
                      <h2 className="ssa-card-title">RFM Customer Segmentation</h2>
                      <p style={{fontSize:"0.8rem",color:"var(--gray)",marginTop:"0.3rem",lineHeight:1.5}}>
                        Each customer is scored 1–5 on <strong style={{color:"var(--white)"}}>Recency</strong> (days since last purchase),{" "}
                        <strong style={{color:"var(--white)"}}>Frequency</strong> (number of orders), and{" "}
                        <strong style={{color:"var(--white)"}}>Monetary</strong> (total spend). Higher = better.
                      </p>
                    </div>
                    <button type="button" className="ssa-run-btn" onClick={loadRFM}>Re-run</button>
                  </div>
                </div>

                <div className="ssa-metrics-grid">
                  {[
                    { label: "Total Customers", value: rfmResult.total_customers },
                    { label: "Segments Found",  value: rfmResult.summary?.length ?? 0 },
                    { label: "Largest Segment", value: [...(rfmResult.summary ?? [])].sort((a,b) => b.count - a.count)[0]?.segment ?? "—" },
                    { label: "Avg Spend / Customer", value: (rfmResult.customers?.length ?? 0) > 0
                      ? "₱" + (rfmResult.customers.reduce((s,c) => s + (c.monetary ?? 0), 0) / rfmResult.customers.length).toLocaleString("en-US",{maximumFractionDigits:0})
                      : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="ssa-stat-card">
                      <div className="ssa-stat-label">{label}</div>
                      <div className="ssa-stat-value" style={{fontSize:"1.2rem"}}>{value}</div>
                    </div>
                  ))}
                </div>

                <div className="ssa-card">
                  <div style={{marginBottom:"1rem"}}>
                    <h2 className="ssa-card-title">Segment Overview</h2>
                    <p style={{fontSize:"0.78rem",color:"var(--gray)",marginTop:"0.3rem"}}>
                      What each customer group means for your business — and what to do about it.
                    </p>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
                    {[...(rfmResult.summary ?? [])].sort((a,b) => b.total_monetary - a.total_monetary).map((seg) => (
                      <div key={seg.segment} style={{
                        padding:"0.9rem 1rem",
                        borderRadius:"10px",
                        border:"1px solid var(--border)",
                        background: (RFM_COLORS[seg.segment]?.bg ?? "rgba(255,255,255,0.03)"),
                      }}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",flexWrap:"wrap"}}>
                          <div style={{flex:1,minWidth:"200px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.4rem",flexWrap:"wrap"}}>
                              <span className="ssa-rfm-badge" style={{
                                background: RFM_COLORS[seg.segment]?.bg ?? "rgba(255,255,255,0.08)",
                                color: RFM_COLORS[seg.segment]?.color ?? "var(--gray)",
                                border: `1px solid ${(RFM_COLORS[seg.segment]?.color ?? "#ffffff")}33`,
                              }}>
                                {seg.segment}
                              </span>
                              <span style={{fontSize:"0.75rem",color:"var(--gray)"}}>
                                {seg.count} customer{seg.count !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <p style={{fontSize:"0.82rem",color:"var(--gray)",margin:0,lineHeight:1.55}}>
                              {SEGMENT_DESC[seg.segment] ?? ""}
                            </p>
                          </div>
                          <div style={{display:"flex",gap:"1.5rem",flexShrink:0,flexWrap:"wrap",alignItems:"flex-start"}}>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:"0.68rem",color:"var(--gray)",marginBottom:"0.15rem",textTransform:"uppercase",letterSpacing:"0.4px"}}>Last bought</div>
                              <div style={{fontWeight:700,color:"var(--white)",fontSize:"0.92rem"}}>{seg.avg_recency?.toFixed(0)} days ago</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:"0.68rem",color:"var(--gray)",marginBottom:"0.15rem",textTransform:"uppercase",letterSpacing:"0.4px"}}>Avg orders</div>
                              <div style={{fontWeight:700,color:"var(--white)",fontSize:"0.92rem"}}>{seg.avg_frequency?.toFixed(1)}</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:"0.68rem",color:"var(--gray)",marginBottom:"0.15rem",textTransform:"uppercase",letterSpacing:"0.4px"}}>Total revenue</div>
                              <div style={{fontWeight:700,color:"var(--gold)",fontSize:"0.92rem"}}>₱{seg.total_monetary?.toLocaleString("en-US",{maximumFractionDigits:0})}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ssa-card">
                  <div style={{marginBottom:"1rem"}}>
                    <h2 className="ssa-card-title">
                      Customer Detail
                      <span style={{fontSize:"0.78rem",fontWeight:400,color:"var(--gray)",marginLeft:"0.5rem"}}>(top 100 by RFM score)</span>
                    </h2>
                    <p style={{fontSize:"0.78rem",color:"var(--gray)",marginTop:"0.3rem"}}>
                      RFM Score = R + F + M (max 15). Higher score = more valuable customer.
                    </p>
                  </div>
                  <div className="ssa-tbl-wrap" style={{maxHeight:"420px"}}>
                    <table className="ssa-table">
                      <thead style={{position:"sticky",top:0,background:"var(--dark2)",zIndex:1}}>
                        <tr>
                          <th>Customer</th>
                          <th>Segment</th>
                          <th style={{textAlign:"right"}}>Score <span style={{fontWeight:400,opacity:0.6}}>(max 15)</span></th>
                          <th style={{textAlign:"right"}}>Last bought</th>
                          <th style={{textAlign:"right"}}>Orders</th>
                          <th style={{textAlign:"right"}}>Total spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(rfmResult.customers ?? [])].sort((a,b) => b.rfm_score - a.rfm_score).slice(0,100).map((c, idx) => (
                          <tr key={idx}>
                            <td style={{color:"var(--gray)",fontSize:"0.8rem"}}>{c.email}</td>
                            <td>
                              <span className="ssa-rfm-badge" style={{background: RFM_COLORS[c.segment]?.bg ?? "rgba(255,255,255,0.08)", color: RFM_COLORS[c.segment]?.color ?? "var(--gray)"}}>
                                {c.segment}
                              </span>
                            </td>
                            <td style={{fontWeight:700,color:"var(--gold)",textAlign:"right"}}>{c.rfm_score}</td>
                            <td style={{color:"var(--gray)",textAlign:"right"}}>{c.recency} days ago</td>
                            <td style={{textAlign:"right"}}>{c.frequency}</td>
                            <td style={{textAlign:"right"}}>₱{c.monetary?.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="ssa-card">
                <div className="ssa-card-header">
                  <div>
                    <h2 className="ssa-card-title">RFM Customer Segmentation</h2>
                    <p style={{fontSize:"0.82rem",color:"var(--gray)",marginTop:"0.35rem"}}>Segments customers by Recency, Frequency, and Monetary value.</p>
                  </div>
                  <button type="button" className="ssa-run-btn" onClick={loadRFM}>Run Analysis</button>
                </div>
                {rfmError && <div className="ssa-error" style={{marginTop:"1rem"}}>{rfmError}</div>}
              </div>
            )}
          </div>
        )}

        {/* ── Products & Services Tab (Market Basket + Service Segmentation combined) ── */}
        {activeTab === "products" && (
          <div>
            {analyticsLoading ? <AnalyticsSkeleton /> : (serviceResult || basketResult) ? (
              <>
                {/* ── header ── */}
                <div className="ssa-card" style={{marginBottom:"1.5rem"}}>
                  <div className="ssa-card-header" style={{marginBottom:"0.75rem"}}>
                    <div>
                      <h2 className="ssa-card-title">Products &amp; Services</h2>
                      <p style={{fontSize:"0.8rem",color:"var(--gray)",marginTop:"0.3rem",lineHeight:1.55}}>
                        Combines <strong style={{color:"var(--white)"}}>ABC revenue analysis</strong> (which products earn the most) with{" "}
                        <strong style={{color:"var(--white)"}}>purchase frequency</strong> (how often each product appears in orders).
                      </p>
                    </div>
                    <button type="button" className="ssa-run-btn" onClick={loadProducts}>Re-run</button>
                  </div>
                  {/* ABC legend */}
                  <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap"}}>
                    {Object.entries(ABC_DESC).map(([cls, info]) => (
                      <div key={cls} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.35rem 0.75rem",borderRadius:"8px",background:"var(--dark)",border:"1px solid var(--border)"}}>
                        <span className="ssa-rfm-badge" style={{
                          background: cls === "A" ? "rgba(74,222,128,0.12)" : cls === "B" ? "rgba(251,191,36,0.12)" : "rgba(248,113,113,0.12)",
                          color:      cls === "A" ? "#4ade80"               : cls === "B" ? "#fbbf24"               : "#f87171",
                        }}>{cls}</span>
                        <span style={{fontSize:"0.78rem"}}>
                          <span style={{color:"var(--white)",fontWeight:600}}>{info.label}</span>
                          <span style={{color:"var(--gray)",display:"block",fontSize:"0.72rem"}}>{info.tip}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── summary metrics ── */}
                <div className="ssa-metrics-grid">
                  {[
                    { label: "Total Products",    value: serviceResult?.total_services ?? basketResult?.total_products ?? "—",   sub: "distinct products / services" },
                    { label: "Total Revenue",      value: serviceResult ? "₱" + (serviceResult.total_revenue ?? 0).toLocaleString("en-US",{maximumFractionDigits:0}) : "—", sub: "from all recorded sales" },
                    { label: "Total Orders",       value: basketResult?.total_orders ?? "—",                                       sub: "orders analyzed" },
                    { label: "Top Earner",         value: serviceResult?.top_services?.[0]?.service ?? "—",                        sub: "highest revenue product" },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="ssa-stat-card">
                      <div className="ssa-stat-label">{label}</div>
                      <div className="ssa-stat-value" style={{fontSize:"1.1rem"}}>{value}</div>
                      <div style={{fontSize:"0.72rem",color:"var(--gray)",marginTop:"0.2rem"}}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* ── unified product table ── */}
                {serviceResult && (
                  <div className="ssa-card">
                    <div style={{marginBottom:"1rem"}}>
                      <h2 className="ssa-card-title">Product Performance</h2>
                      <p style={{fontSize:"0.78rem",color:"var(--gray)",marginTop:"0.3rem"}}>
                        Sorted by revenue. Orders column shows how many of the {basketResult?.total_orders ?? "analyzed"} orders included this product.
                      </p>
                    </div>
                    <div className="ssa-tbl-wrap" style={{maxHeight:"500px"}}>
                      <table className="ssa-table">
                        <thead style={{position:"sticky",top:0,background:"var(--dark2)",zIndex:1}}>
                          <tr>
                            <th>Product / Service</th>
                            <th>Class</th>
                            <th style={{textAlign:"right"}}>Revenue</th>
                            <th style={{textAlign:"right"}}>Revenue share</th>
                            <th style={{textAlign:"right"}}>Orders</th>
                            <th style={{textAlign:"right"}}>Order frequency</th>
                            <th style={{textAlign:"right"}}>Avg price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(serviceResult.services ?? []).map((svc, idx) => {
                            const basketItem = (basketResult?.frequent_itemsets ?? []).find(item => {
                              const name = Array.isArray(item.itemset) ? item.itemset[0] : item.itemset;
                              return name === svc.service && (!Array.isArray(item.itemset) || item.itemset.length === 1);
                            });
                            const orderFreq = basketItem?.support ?? null;
                            const orderCount = orderFreq != null && basketResult?.total_orders
                              ? Math.round(orderFreq * basketResult.total_orders)
                              : svc.order_count;
                            return (
                              <tr key={idx}>
                                <td style={{fontWeight:600}}>{svc.service}</td>
                                <td>
                                  <span className="ssa-rfm-badge" style={{
                                    background: svc.abc_class === "A" ? "rgba(74,222,128,0.12)" : svc.abc_class === "B" ? "rgba(251,191,36,0.12)" : "rgba(248,113,113,0.12)",
                                    color:      svc.abc_class === "A" ? "#4ade80"               : svc.abc_class === "B" ? "#fbbf24"               : "#f87171",
                                  }}>
                                    {svc.abc_class} — {ABC_DESC[svc.abc_class]?.label.split("—")[0].trim()}
                                  </span>
                                </td>
                                <td style={{color:"var(--gold)",fontWeight:600,textAlign:"right"}}>₱{svc.total_revenue?.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                                <td style={{textAlign:"right"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",justifyContent:"flex-end"}}>
                                    <span style={{color:"var(--gray)"}}>{((svc.revenue_share ?? 0) * 100).toFixed(1)}%</span>
                                    <div style={{width:"50px",height:"5px",borderRadius:"3px",background:"var(--border)",overflow:"hidden",flexShrink:0}}>
                                      <div style={{height:"100%",width:`${((svc.revenue_share ?? 0) * 100).toFixed(1)}%`,borderRadius:"3px",background: svc.abc_class === "A" ? "#4ade80" : svc.abc_class === "B" ? "#fbbf24" : "#f87171"}} />
                                    </div>
                                  </div>
                                </td>
                                <td style={{textAlign:"right",fontWeight:600}}>{orderCount}</td>
                                <td style={{textAlign:"right",color:"var(--gray)"}}>
                                  {orderFreq != null ? `${(orderFreq * 100).toFixed(1)}%` : "—"}
                                </td>
                                <td style={{textAlign:"right"}}>₱{svc.avg_price?.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── cross-sell opportunities (only when rules exist) ── */}
                {(basketResult?.rules?.length ?? 0) > 0 && (
                  <div className="ssa-card">
                    <div style={{marginBottom:"1rem"}}>
                      <h2 className="ssa-card-title">Cross-Sell Opportunities</h2>
                      <p style={{fontSize:"0.78rem",color:"var(--gray)",marginTop:"0.3rem"}}>
                        When a customer buys the left product, they are likely to also buy the right one.{" "}
                        <strong style={{color:"var(--white)"}}>Confidence</strong> = how often this holds.{" "}
                        <strong style={{color:"var(--white)"}}>Lift</strong> = how much stronger than random ({">"} 1 = meaningful).
                      </p>
                    </div>
                    <div className="ssa-tbl-wrap">
                      <table className="ssa-table">
                        <thead>
                          <tr>
                            <th>Customer buys</th>
                            <th>And likely buys</th>
                            <th style={{textAlign:"right"}}>Confidence</th>
                            <th style={{textAlign:"right"}}>Lift</th>
                          </tr>
                        </thead>
                        <tbody>
                          {basketResult.rules.map((rule, idx) => (
                            <tr key={idx}>
                              <td style={{color:"var(--gold)",fontWeight:500}}>{rule.antecedents.join(", ")}</td>
                              <td style={{fontWeight:600}}>{rule.consequents.join(", ")}</td>
                              <td style={{textAlign:"right"}}>
                                <span style={{color: rule.confidence >= 0.7 ? "#4ade80" : rule.confidence >= 0.4 ? "#fbbf24" : "var(--gray)", fontWeight:600}}>
                                  {(rule.confidence * 100).toFixed(1)}%
                                </span>
                              </td>
                              <td style={{textAlign:"right",fontWeight:700,color: rule.lift >= 2 ? "#4ade80" : rule.lift >= 1.5 ? "#fbbf24" : "var(--white)"}}>
                                {rule.lift.toFixed(2)}×
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="ssa-card">
                <div className="ssa-card-header">
                  <div>
                    <h2 className="ssa-card-title">Products &amp; Services</h2>
                    <p style={{fontSize:"0.82rem",color:"var(--gray)",marginTop:"0.35rem"}}>
                      Combines revenue ranking (ABC analysis) with purchase frequency across all orders.
                    </p>
                  </div>
                  <button type="button" className="ssa-run-btn" onClick={loadProducts}>Run Analysis</button>
                </div>
                {(basketError || serviceError) && (
                  <div className="ssa-error" style={{marginTop:"1rem"}}>{basketError || serviceError}</div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
      <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
    </ErrorBoundary>
  );
}
