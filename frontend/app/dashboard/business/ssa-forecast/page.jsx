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
    border-radius: 6px;
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
  .ssa-filter-divider {
    width: 1px;
    height: 26px;
    background: var(--border);
    flex-shrink: 0;
    align-self: center;
  }
  .ssa-stat-card {
    flex: 1;
    min-width: 130px;
    padding: 0.375rem 1.5rem 0.375rem 0;
    margin-right: 1.5rem;
    border-right: 1px solid var(--border);
  }
  .ssa-stat-card:last-child {
    border-right: none;
    margin-right: 0;
    padding-right: 0;
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
    border-radius: 6px;
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
    border-radius: 5px;
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
  .ssa-toggle-btn {
    padding: 0.35rem 0.85rem;
    border-radius: 4px;
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
    border-radius: 4px;
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
  .ssa-tab-nav {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    margin-top: 1.25rem;
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
    border-radius: 4px;
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
  .ssa-page-header {
    padding: 1.5rem 0 1.25rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .ssa-page-title {
    font-size: 1.35rem;
    font-weight: 800;
    color: var(--white);
    margin: 0 0 0.3rem;
    letter-spacing: -0.02em;
  }
  .ssa-page-desc {
    font-size: 0.82rem;
    color: var(--gray);
    margin: 0;
    line-height: 1.6;
    max-width: 600px;
  }
  .ssa-alerts-group {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
  }
  .ssa-section-divider {
    height: 1px;
    background: var(--border);
    margin: 1.5rem 0;
    opacity: 0.45;
  }

  /* ════════════ Demand Forecast — two-column workspace ════════════ */
  .ssa-layout {
    display: grid;
    grid-template-columns: 256px minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }
  .ssa-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  /* Hidden scrollbars (kept invisible in both panes) */
  .ssa-sidebar, .ssa-main {
    scrollbar-width: none;           /* Firefox */
    -ms-overflow-style: none;        /* old Edge */
  }
  .ssa-sidebar::-webkit-scrollbar,
  .ssa-main::-webkit-scrollbar { width: 0; height: 0; display: none; }

  /* ── Desktop: split into two independent scroll panes ──────────────────
     The whole forecast workspace fills the viewport (no page-level scroll);
     the left sidebar and the right results column each scroll on their own,
     so they no longer move together. */
  @media (min-width: 921px) {
    .page-content-wrapper {
      height: calc(100vh - 56px - 4rem);   /* viewport − top-bar − page padding */
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ssa-page-header, .ssa-tab-nav { flex-shrink: 0; }
    .ssa-tab-nav { margin-bottom: 1rem; }
    .ssa-layout {
      flex: 1;
      min-height: 0;
      align-items: stretch;          /* both columns fill the row height */
    }
    .ssa-sidebar, .ssa-main {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
    }
    .ssa-main { padding-right: 4px; }
    /* Customer Segments / Products tabs scroll inside their own pane too */
    .ssa-tab-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .ssa-tab-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
  }
  @media (max-width: 920px) { .ssa-layout { grid-template-columns: 1fr; } }
  .ssa-side-label {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--gray);
    text-transform: uppercase;
    letter-spacing: 0.9px;
    margin: 0 0 0.65rem;
  }
  .ssa-source-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .ssa-source-vbtn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--dark);
    color: var(--gray);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }
  .ssa-source-vbtn:hover { color: var(--white); border-color: rgba(212,168,67,0.4); }
  .ssa-source-vbtn.active {
    background: var(--gold-subtle);
    border-color: var(--gold);
    color: var(--gold);
    box-shadow: inset 2px 0 0 var(--gold);
  }
  .ssa-source-vbtn svg { flex-shrink: 0; }
  .ssa-segmented {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .ssa-seg-btn {
    flex: 1;
    padding: 0.5rem 0;
    background: var(--dark);
    color: var(--gray);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    border-right: 1px solid var(--border);
    transition: all 0.15s;
  }
  .ssa-seg-btn:last-child { border-right: none; }
  .ssa-seg-btn:hover:not(.active) { color: var(--white); }
  .ssa-seg-btn.active { background: var(--gold); color: #1a1a1a; }
  .ssa-lookahead {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--dark);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .ssa-lookahead:focus-within { border-color: var(--gold); }
  .ssa-lookahead input {
    flex: 1;
    min-width: 0;
    padding: 0.6rem 0.8rem;
    background: transparent;
    border: none;
    color: var(--white);
    font-size: 1rem;
    font-weight: 700;
    outline: none;
  }
  .ssa-lookahead .unit {
    padding: 0 0.8rem;
    font-size: 0.78rem;
    color: var(--gray);
    border-left: 1px solid var(--border);
    align-self: stretch;
    display: flex;
    align-items: center;
  }
  .ssa-side-hint { font-size: 0.7rem; color: var(--gray); margin: 0.4rem 0 0; }
  .ssa-primary-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.7rem 1rem;
    background: var(--gold);
    border: 1px solid var(--gold);
    border-radius: 4px;
    color: #1a1a1a;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .ssa-primary-btn:hover:not(:disabled) { background: var(--gold-dark); border-color: var(--gold-dark); }
  .ssa-primary-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .ssa-model-info { display: flex; flex-direction: column; }
  .ssa-model-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.8rem;
  }
  .ssa-model-row:last-child { border-bottom: none; }
  .ssa-model-row .k { color: var(--gray); }
  .ssa-model-row .v { color: var(--white); font-weight: 700; text-align: right; }
  .ssa-model-row .v.gold { color: var(--gold); }
  .ssa-side-divider { height: 1px; background: var(--border); }
  .ssa-export-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.6rem 0.85rem;
    background: var(--dark);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--gray);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .ssa-export-btn:hover { color: var(--white); border-color: rgba(212,168,67,0.4); }
  .ssa-export-btn svg { flex-shrink: 0; }
  .ssa-metric-cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 1100px) { .ssa-metric-cards { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 520px)  { .ssa-metric-cards { grid-template-columns: 1fr; } }
  .ssa-metric-card {
    background: var(--dark2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem 1.1rem;
    min-width: 0;
  }
  .ssa-today-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.32rem 0.7rem;
    border-radius: 4px;
    background: rgba(74,222,128,0.12);
    border: 1px solid rgba(74,222,128,0.35);
    color: #4ade80;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  html.light .ssa-today-pill { color: #16a34a; }
  .ssa-chart-legend {
    display: flex;
    align-items: center;
    gap: 1.1rem;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: var(--gray);
    margin-top: 0.3rem;
  }
  .ssa-chart-legend .lg { display: inline-flex; align-items: center; gap: 0.4rem; }
  .ssa-chart-legend .swatch { width: 16px; height: 2px; border-radius: 2px; display: inline-block; }
  .ssa-range-track {
    width: 92px;
    height: 5px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .ssa-range-fill { height: 100%; background: var(--gold); border-radius: 3px; }
  .ssa-icon-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    background: var(--dark);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--gray);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .ssa-icon-btn:hover { color: var(--white); border-color: rgba(212,168,67,0.4); }
  /* Sales Quantity — units planning summary strip */
  .ssa-units-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 2.25rem;
    padding: 0.85rem 1.1rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1rem;
  }
  .ssa-units-summary > div { display: flex; flex-direction: column; gap: 0.2rem; }
  .ssa-units-summary .k { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.6px; color: var(--gray); font-weight: 600; }
  .ssa-units-summary .v { font-size: 1.05rem; font-weight: 700; color: var(--white); }
  .ssa-units-summary .v.gold { color: var(--gold); }
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

// Future period-start dates from the current period forward (W-MON / month-start
// / year-start), matching the backend's date conventions. Used by the inventory
// fallback projection when there isn't enough history to run SSA.
function genFuturePeriods(count, periodType) {
  const now = new Date();
  let cur = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (periodType === "weekly") {
    const day = cur.getUTCDay();
    cur.setUTCDate(cur.getUTCDate() + (day === 0 ? -6 : 1 - day)); // Monday of this week
  } else if (periodType === "monthly") {
    cur = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  } else {
    cur = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(cur.toISOString().slice(0, 10));
    if (periodType === "weekly") cur.setUTCDate(cur.getUTCDate() + 7);
    else if (periodType === "monthly") cur.setUTCMonth(cur.getUTCMonth() + 1);
    else cur.setUTCFullYear(cur.getUTCFullYear() + 1);
  }
  return out;
}

// ── Inventory policy (Phase A) ────────────────────────────────────────────
// Honest reorder-decision math: characterise demand, then derive safety stock,
// reorder point and order quantity. SSA/forecast curves are demand estimates;
// the *decision* (when/how much to reorder) is what this produces.
const PERIOD_DAYS = { weekly: 7, monthly: 30.44, annually: 365.25 };
const SERVICE_Z = 1.65;        // 95% service level (z-score)
const DEFAULT_LEAD_DAYS = 7;   // fallback until per-item lead time exists (Phase B)

// Aggregate daily demand rows into a continuous per-period series (first sale →
// current period, zero-filled) so intermittency/variability are measured honestly.
function bucketDemand(rows, periodType) {
  if (!rows || rows.length === 0) return [];
  const periodKey = (dateStr) => {
    const dt = new Date(dateStr + "T00:00:00Z");
    if (periodType === "weekly") {
      const day = dt.getUTCDay();
      dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
    } else if (periodType === "monthly") {
      dt.setUTCDate(1);
    } else {
      dt.setUTCMonth(0, 1);
    }
    return dt.toISOString().slice(0, 10);
  };
  const map = {};
  rows.forEach((r) => { const k = periodKey(r.date); map[k] = (map[k] ?? 0) + (r.value ?? 0); });
  const keys = Object.keys(map).sort();
  if (keys.length === 0) return [];
  const series = [];
  let cur = new Date(keys[0] + "T00:00:00Z");
  const end = new Date(periodKey(new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  let guard = 0;
  while (cur <= end && guard < 1200) {
    series.push(map[cur.toISOString().slice(0, 10)] ?? 0);
    if (periodType === "weekly") cur.setUTCDate(cur.getUTCDate() + 7);
    else if (periodType === "monthly") cur.setUTCMonth(cur.getUTCMonth() + 1);
    else cur.setUTCFullYear(cur.getUTCFullYear() + 1);
    guard++;
  }
  return series;
}

function computeInventoryPolicy({ rawRows, currentStock, leadTimeDays, periodType }) {
  const series = bucketDemand(rawRows, periodType);
  const n = series.length;
  const nz = series.filter((v) => v > 0);
  const mean = n ? series.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? series.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sigma = Math.sqrt(variance);

  // Intermittency (Syntetos–Boylan): ADI = avg gap between demands, CV² of sizes.
  const adi = nz.length ? n / nz.length : Infinity;
  const nzMean = nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length : 0;
  const nzVar = nz.length > 1 ? nz.reduce((a, b) => a + (b - nzMean) ** 2, 0) / (nz.length - 1) : 0;
  const cv2 = nzMean > 0 ? (Math.sqrt(nzVar) / nzMean) ** 2 : 0;

  let cls;
  if (nz.length === 0 || n < 3) cls = "new";
  else if (adi <= 1.32 && cv2 <= 0.49) cls = "steady";
  else if (adi > 1.32 && cv2 <= 0.49) cls = "intermittent";
  else if (adi <= 1.32 && cv2 > 0.49) cls = "variable";
  else cls = "lumpy";

  const daysPerPeriod = PERIOD_DAYS[periodType] ?? 7;
  const hasLead = leadTimeDays != null && leadTimeDays > 0;
  const leadDays = hasLead ? leadTimeDays : DEFAULT_LEAD_DAYS;
  const L = leadDays / daysPerPeriod;            // lead time in periods
  const d = mean;                                 // demand rate (units/period)
  const SS = Math.max(0, SERVICE_Z * sigma * Math.sqrt(L));
  const ROP = d * L + SS;
  const orderUpTo = d * (L + L) + SS;             // cover lead time + one review cycle
  const orderQty = Math.max(0, orderUpTo - (currentStock ?? 0));
  const cov = currentStock ?? 0;
  const coverage = d > 0 ? cov / d : null;        // periods of cover (null ≈ unlimited)
  const periodsToROP = d > 0 && cov > ROP ? (cov - ROP) / d : 0;

  return {
    d, sigma, adi, cv2, cls, L, leadDays, daysPerPeriod, usingDefaultLead: !hasLead,
    SS: Math.round(SS), ROP: Math.round(ROP), orderQty: Math.round(orderQty),
    coverage, periodsToROP, nPeriods: n, nzCount: nz.length,
  };
}

const DEMAND_CLASS = {
  steady:       { label: "Steady",       color: "#4ade80", note: "regular demand — time-series forecast is reliable" },
  variable:     { label: "Variable",     color: "#fbbf24", note: "regular but uneven sizes — treat the rate as approximate" },
  intermittent: { label: "Intermittent", color: "#fbbf24", note: "sparse demand — estimated with Croston's/SBA (a flat demand rate)" },
  lumpy:        { label: "Lumpy",        color: "#f87171", note: "sparse and uneven demand — Croston's/SBA rate; treat as a guide" },
  new:          { label: "New / sparse", color: "#9ca3af", note: "too little history to model — using a simple average" },
};

// Adaptive precision for demand figures: slow sellers have sub-unit demand
// (e.g. ~0.2/week) that must not round to 0, while fast movers stay whole.
function fmtDemand(v) {
  if (v == null || Number.isNaN(v) || v <= 0) return "0";
  if (v < 1) return v.toFixed(2);
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
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
        ? `tested on ${btN} ${btNz != null ? `periods (${btNz} with sales)` : "periods"}${unreliable ? (isHighVolatility ? " — sparse/spike data" : " — limited backtest data") : ""}`
        : "insufficient data",
      color,
      tooltip: unreliable
        ? isHighVolatility
          ? "MAPE exceeds 300% because sales are sparse and spike-driven — the model cannot reliably predict the exact timing of individual orders. Use the forecast as a directional trend guide, not a precise estimate."
          : "Annual MAPE is based on fewer than 2 full calendar-year backtest periods, making it a single-observation estimate and statistically unreliable. Use it as a rough guide only."
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
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submittedConfig, setSubmittedConfig] = useState(null);
  // FIX: dataPointCount = raw DB rows (true input size); trainingPeriods = SSA-aggregated count
  const [dataPointCount, setDataPointCount] = useState(0);
  const [trainingPeriods, setTrainingPeriods] = useState(null);
  const [backtestData, setBacktestData] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [lastRunAt, setLastRunAt] = useState(null);
  const [pickerDate, setPickerDate] = useState("");
  const [stockHistoryRows, setStockHistoryRows] = useState([]);
  const [stockoutDate, setStockoutDate] = useState(null);
  const [currentStockQty, setCurrentStockQty] = useState(null);
  const [depletionMethod, setDepletionMethod] = useState(null);

  const [activeTab, setActiveTab] = useState("forecast");
  const [rfmResult, setRfmResult] = useState(null);
  const [serviceResult, setServiceResult] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [rfmError, setRfmError] = useState("");
  const [serviceError, setServiceError] = useState("");


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

  const handleSubmit = async (overrideCount = null) => {
    const count = overrideCount ?? parseInt(forecastCount, 10);
    if (!count || count < 1) {
      if (overrideCount === null) setError(`Please enter how many ${forecastPeriod.unit} ahead to forecast.`);
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
    setStockHistoryRows([]);
    setStockoutDate(null);
    setCurrentStockQty(null);
    setDepletionMethod(null);
    setIsLoading(true);

    // Average-demand projection used whenever SSA can't run for an inventory
    // item (too few records, or too few aggregated periods for the backend).
    // Guarantees the depletion view always renders, no matter how low/out of stock.
    const applyInvFallback = (rows) => {
      const periodType = forecastPeriod.type;
      const totalQty = rows.reduce((s, r) => s + (r.value ?? 0), 0);
      let avgDemand = 0;
      if (rows.length > 0) {
        const first = new Date(rows[0].date + "T00:00:00Z");
        const last  = new Date(rows[rows.length - 1].date + "T00:00:00Z");
        const days  = Math.max(1, (last - first) / 86400000 + 1);
        const span  = periodType === "weekly" ? days / 7 : periodType === "monthly" ? days / 30.44 : days / 365.25;
        avgDemand = totalQty / Math.max(1, span);
      }
      const fcDates  = genFuturePeriods(count, periodType);
      const fcValues = fcDates.map(() => avgDemand);
      setSubmittedConfig({
        count,
        period: forecastPeriod,
        source: dataSource,
        sourceLabel: DATA_SOURCES.find((s) => s.key === dataSource)?.label ?? "",
      });
      setResult({
        forecast: {
          dates: fcDates,
          values: fcValues,
          confidence_high: fcValues.map((v) => v * 1.5),
          confidence_low:  fcValues.map((v) => v * 0.5),
        },
        accuracy: null,
        training_n: rows.length,
        training_unit: forecastPeriod.unit,
        is_fallback: true,
      });
      setRawRows(rows);
      setLastRunAt(new Date());
      setDataPointCount(rows.length);
      setTrainingPeriods(rows.length);
      setBacktestData([]);
      setDepletionMethod("average");
    };

    let rows = [];
    try {
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
        });
        rows = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            value: dataSource === "sales_revenue" ? v.revenue : v.qty,
          }));
      } else {
        // Fetch stock history (staircase reference) and all sales (SSA demand input) in parallel
        const [histResponse, salesResponse] = await Promise.all([
          fetchWithTimeout(
            `${API_URL}/api/admin/inventory/${selectedInventoryId}/history`,
            { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
          ),
          fetchWithTimeout(
            `${API_URL}/api/admin/sales?limit=10000&status=completed`,
            { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
          ),
        ]);
        const histData  = await histResponse.json();
        const salesData = await salesResponse.json();
        const history  = Array.isArray(histData.data  ?? histData)  ? (histData.data  ?? histData)  : [];
        const allSales = Array.isArray(salesData.data ?? salesData) ? (salesData.data ?? salesData) : [];

        // Build stock history staircase — raw events sorted chronologically (left of today)
        const sortedHistory = [...history]
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          .map(h => ({
            date:  h.createdAt ? new Date(h.createdAt).toISOString().split("T")[0] : null,
            value: h.remainingQty ?? 0,
          }))
          .filter(h => h.date !== null);

        setStockHistoryRows(sortedHistory);

        // Current stock qty from the inventory list (live value for depletion start)
        const selectedItem = inventoryList.find(i => (i._id ?? i.id) === selectedInventoryId);
        const currentStock = selectedItem?.stockQty ?? 0;
        setCurrentStockQty(currentStock);

        // Filter sales for this item by inventoryId or product name, aggregate by date
        const productSales = allSales.filter(s =>
          String(s.inventoryId ?? "") === String(selectedInventoryId) ||
          (selectedItem?.name && s.productName === selectedItem.name)
        );
        const salesMap = {};
        productSales.forEach(s => {
          const d = s.saleDate ? new Date(s.saleDate) : null;
          if (!d || isNaN(d)) return;
          const ds = d.toISOString().split("T")[0];
          salesMap[ds] = (salesMap[ds] ?? 0) + (s.quantity ?? 0);
        });
        rows = Object.entries(salesMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, value }));

        setDepletionMethod(rows.length >= 10 ? "ssa" : "none");
      }

      // Inventory never hard-fails on sparse data — use the average-demand
      // fallback so the depletion view always renders.
      if (dataSource === "inventory_stock" && rows.length < 10) {
        applyInvFallback(rows);
        setIsLoading(false);
        return;
      }

      if (rows.length < 10) {
        setError(`Not enough data points (${rows.length}). SSA requires at least 10.`);
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
      setRawRows(rows);
      setLastRunAt(new Date());

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
      // Inventory always degrades to an average-demand projection rather than
      // showing an error — so the depletion view works even if SSA is down or
      // rejected the (sparse) data.
      if (dataSource === "inventory_stock") {
        applyInvFallback(rows);
      } else if (err.name === "AbortError") {
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
    setServiceError("");
    try {
      const serviceRes = await fetchWithTimeout(`${API_URL}/api/admin/analytics/service-data`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const serviceD = await serviceRes.json();
      const sales = serviceD.data ?? [];
      const sRes = sales.length > 0
        ? await fetch(`${SSA_API_URL}/api/service-segments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sales }),
          }).then(r => r.ok ? r.json() : null).catch(() => null)
        : null;
      if (sRes) setServiceResult(sRes);
      else setServiceError("No product data found.");
    } catch (err) {
      setServiceError(err.message || "Failed to load product data.");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Reset date picker when forecast result or period changes
  useEffect(() => { setPickerDate(""); }, [result, forecastPeriod.type]); // eslint-disable-line

  // Compute stockout date whenever inventory depletion forecast updates
  useEffect(() => {
    if (submittedConfig?.source !== "inventory_stock" || !result || currentStockQty === null) {
      setStockoutDate(null);
      return;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    const fcDates  = result.forecast?.dates  || [];
    const fcValues = result.forecast?.values || [];
    let remaining = currentStockQty;
    for (let i = 0; i < fcDates.length; i++) {
      if (fcDates[i] <= todayStr) continue;
      remaining -= Math.max(0, Math.round(fcValues[i] ?? 0));
      if (remaining <= 0) { setStockoutDate(fcDates[i]); return; }
    }
    setStockoutDate(null);
  }, [result, currentStockQty, submittedConfig?.source]); // eslint-disable-line

  // Auto-run: fires on mount (init) and whenever source/period/count changes
  // - On mount or when no count entered: runs with overrideCount=1 to populate training data + metrics
  // - When count is entered: runs with that count (debounced 700ms)
  const _autoRunTimer   = useRef(null);
  const _submitRef      = useRef(null);
  const _hasMounted     = useRef(false);
  _submitRef.current    = handleSubmit;

  useEffect(() => {
    // Inventory needs a selected item before it can auto-run; sales modes don't.
    if (dataSource === "inventory_stock" && !selectedInventoryId) return;
    const count = parseInt(forecastCount, 10);
    // No count entered → warm-up run. Sales use 1 (just to load training data),
    // but inventory needs a few future periods so the depletion line is visible.
    const invWarm = forecastPeriod.type === "weekly" ? 8 : forecastPeriod.type === "monthly" ? 6 : 2;
    const runCount = count >= 1 ? count : (dataSource === "inventory_stock" ? invWarm : 1);
    const delay = !_hasMounted.current ? 200 : 700;
    if (!_hasMounted.current) _hasMounted.current = true;
    if (!token) return;
    if (_autoRunTimer.current) clearTimeout(_autoRunTimer.current);
    _autoRunTimer.current = setTimeout(() => { _submitRef.current?.(runCount); }, delay);
    return () => { if (_autoRunTimer.current) clearTimeout(_autoRunTimer.current); };
  }, [token, dataSource, forecastPeriod.type, forecastCount, selectedInventoryId]); // eslint-disable-line

  const isInvMode = submittedConfig?.source === "inventory_stock";


  const fcDatesForPicker = result?.forecast?.dates || [];
  const pickerMatchIdx  = pickerDate ? fcDatesForPicker.indexOf(pickerDate) : -1;
  const pickerMatchDate = pickerMatchIdx >= 0 ? fcDatesForPicker[pickerMatchIdx] : null;
  const todayIso        = new Date().toISOString().slice(0, 10);
  // Compare against the START of the current period, not the raw date — otherwise
  // a monthly forecast point dated "2026-06-01" is wrongly skipped when today is
  // June 22, pushing the Today marker onto July instead of the current month.
  const todayPeriodStart = (() => {
    const now = new Date();
    const pt = submittedConfig?.period?.type || forecastPeriod.type;
    if (pt === "monthly")
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    if (pt === "annually") return `${now.getUTCFullYear()}-01-01`;
    // weekly: Monday of the current week (matches backend W-MON labels)
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const mon = new Date(now);
    mon.setUTCDate(now.getUTCDate() + (day === 0 ? -6 : 1 - day));
    return mon.toISOString().slice(0, 10);
  })();
  const todayRefDate    = fcDatesForPicker.find((d) => d >= todayPeriodStart) ?? null;
  // Actual local "today" for the marker label (weekly snaps the line to the
  // week's Monday, so the label spells out the real date to avoid confusion).
  const todayDisplay = (() => {
    const now = new Date();
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${m[now.getMonth()]} ${now.getDate()}`;
  })();
  const selectedItemName = inventoryList.find(i => (i._id ?? i.id) === selectedInventoryId)?.name ?? "";

  // Shared inventory policy (reorder point / safety stock / demand class) so the
  // chart and table use the same model numbers as the metric cards.
  const invPolicy =
    submittedConfig?.source === "inventory_stock" && result
      ? computeInventoryPolicy({
          rawRows,
          currentStock: currentStockQty,
          leadTimeDays: inventoryList.find((i) => (i._id ?? i.id) === selectedInventoryId)?.leadTimeDays,
          periodType: submittedConfig?.period?.type ?? forecastPeriod.type,
        })
      : null;

  // How many training periods to show as historical context (before forecast)
  const HIST_SLICES = { weekly: 8, monthly: 6, annually: 3 };

  const getCombinedChartData = () => {
    if (!result) return [];
    const data = [];

    const trainDates = result.training_data?.dates || [];
    const trainValues = result.training_data?.values || [];
    const trainTrend  = result.training_data?.trend  || [];
    const trainSeas   = result.training_data?.seasonality || [];
    const fcDates  = result.forecast?.dates  || [];
    const fcValues = result.forecast?.values || [];
    const fcHigh   = result.forecast?.confidence_high || [];
    const fcLow    = result.forecast?.confidence_low  || [];

    const histSlice = HIST_SLICES[submittedConfig?.period?.type] ?? 6;
    const startIdx  = showAllHistory ? 0 : Math.max(0, trainDates.length - histSlice);

    // Historical slice — aggregated at period granularity, unfloored values
    for (let i = startIdx; i < trainDates.length; i++) {
      const btPoint = backtestData.find((b) => b.date === trainDates[i]);
      data.push({
        date:          trainDates[i],
        Actual:        trainValues[i] != null ? Math.round(trainValues[i] * 100) / 100 : null,
        BacktestActual: btPoint ? btPoint.BacktestActual : null,
        Trend:         showTrend       ? (trainTrend[i] != null ? Math.round(trainTrend[i] * 100) / 100 : null) : undefined,
        Seasonality:   showSeasonality ? (trainSeas[i]  != null ? Math.round(trainSeas[i]  * 100) / 100 : null) : undefined,
        Forecast: null, High: null, Low: null,
      });
    }

    // Forecast — only included when user has a count entered
    if (parseInt(forecastCount, 10) > 0) {
      for (let i = 0; i < fcDates.length; i++) {
        data.push({
          date:          fcDates[i],
          Actual:        null,
          BacktestActual: null,
          Trend:         undefined,
          Seasonality:   undefined,
          Forecast:      fcValues[i] != null ? Math.round(fcValues[i] * 100) / 100 : null,
          High:          showConfidence ? (fcHigh[i] != null ? Math.round(fcHigh[i] * 100) / 100 : null) : null,
          Low:           showConfidence ? (fcLow[i]  != null ? Math.round(fcLow[i]  * 100) / 100 : null) : null,
        });
      }
    }

    data.sort((a, b) => a.date.localeCompare(b.date));
    return data;
  };

  const getDecompChartData = () => {
    if (!result) return [];
    const dates       = result.training_data?.dates       || [];
    const trend       = result.training_data?.trend       || [];
    const seasonality = result.training_data?.seasonality || [];
    const noise       = result.training_data?.noise       || [];
    const histSlice   = HIST_SLICES[submittedConfig?.period?.type] ?? 6;
    const startIdx    = showAllHistory ? 0 : Math.max(0, dates.length - histSlice);
    return dates.slice(startIdx).map((date, i) => ({
      date,
      Trend:       trend[startIdx + i]       ?? null,
      Seasonality: seasonality[startIdx + i] ?? null,
      Noise:       noise[startIdx + i]       ?? null,
    }));
  };

  const getInventoryChartData = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const data = [];

    // Left side: forward-fill stock history events into a staircase up to today
    if (stockHistoryRows.length > 0) {
      const eventMap = {};
      stockHistoryRows.forEach(r => { eventMap[r.date] = r.value; });
      const allDates = Object.keys(eventMap).sort();
      const cur = new Date(allDates[0] + "T00:00:00Z");
      let lastQty = eventMap[allDates[0]];
      while (cur.toISOString().split("T")[0] <= todayStr) {
        const ds = cur.toISOString().split("T")[0];
        if (eventMap[ds] !== undefined) lastQty = eventMap[ds];
        data.push({ date: ds, StockActual: lastQty, StockForecast: null });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else {
      // No history — anchor at today with current stock level
      data.push({ date: todayStr, StockActual: currentStockQty ?? 0, StockForecast: null });
    }

    // Right side: subtract SSA-forecasted demand from current stock to get projected remaining
    if (result && currentStockQty !== null) {
      // Anchor the projection at today so the gold line starts from the current
      // stock base (the boundary between recorded history and the forecast).
      if (data.length > 0) data[data.length - 1].StockForecast = currentStockQty;
      const fcDates  = result.forecast?.dates  || [];
      const fcValues = result.forecast?.values || [];
      let remaining = currentStockQty; // float — keep sub-unit demand so slow sellers still deplete
      for (let i = 0; i < fcDates.length; i++) {
        if (fcDates[i] <= todayStr) continue;
        remaining = Math.max(0, remaining - Math.max(0, fcValues[i] ?? 0));
        data.push({ date: fcDates[i], StockActual: null, StockForecast: Math.round(remaining) });
      }
    }

    data.sort((a, b) => a.date.localeCompare(b.date));
    return data;
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
    if (forceDaily) return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${year}`;
    if (pt === "weekly") return `W${getISOWeek(d)} ${year}`;
    if (pt === "monthly") return `${months[d.getUTCMonth()]} ${year}`;
    if (pt === "annually") return `${year}`;
    return dateString;
  };

  const chartDateFormatter = (dateString) => {
    if (!dateString) return "";
    const base = formatDateLabel(dateString, submittedConfig?.period?.type, false);
    const pt = submittedConfig?.period?.type || forecastPeriod.type;
    if (pt === "weekly") {
      const d = new Date(dateString + "T00:00:00Z");
      if (!isNaN(d)) {
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return `${base}  ·  ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
      }
    }
    return base;
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

  // ── Unit-aware value formatting ───────────────────────────────────────
  // Revenue is money (₱, 2 decimals); Quantity and Inventory are discrete
  // whole units — you can't sell 0.82 of an item, so they round to integers.
  const isMoneySource = (src) => src === "sales_revenue";
  const fmtSourceValue = (v, src, withUnit = false) => {
    if (v == null || Number.isNaN(v)) return "—";
    if (isMoneySource(src))
      return "₱" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const n = Math.round(v).toLocaleString("en-US");
    return withUnit ? `${n} units` : n;
  };

  const handleDownloadCSV = () => {
    if (!result || !submittedConfig) return;
    const fcDates = result.forecast?.dates || [];
    const fcValues = result.forecast?.values || [];
    const fcHigh = result.forecast?.confidence_high || [];
    const fcLow = result.forecast?.confidence_low || [];
    const money = isMoneySource(submittedConfig.source);
    const fmtCsv = (v) => (v == null ? "" : money ? v.toFixed(2) : Math.round(v));
    const valueHeader = money ? "Predicted Value" : "Predicted Units";
    let csv = `${submittedConfig.period.tableHeader},Date,${valueHeader},Upper Bound,Lower Bound\n`;
    fcDates.forEach((d, i) => {
      csv += `${i + 1},${d},${fmtCsv(fcValues[i])},${fmtCsv(fcHigh[i])},${fmtCsv(fcLow[i])}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ssa_forecast_${submittedConfig.source}_${submittedConfig.count}${submittedConfig.period.type[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = () => {
    const node = chartRef.current;
    if (!node || !submittedConfig) return;
    // Read the live theme background so exports look correct in light & dark mode
    const bg =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--dark2")
        .trim() || "#1a1a1a";
    import("html2canvas").then(({ default: html2canvas }) => {
      html2canvas(node, { backgroundColor: bg }).then((canvas) => {
        const a = document.createElement("a");
        a.download = `ssa_chart_${submittedConfig.source}_${submittedConfig.count}${submittedConfig.period.type[0]}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      });
    });
  };

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
        <style dangerouslySetInnerHTML={{ __html: pageStyles }} />

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="ssa-page-header">
          <div>
            <h1 className="ssa-page-title">Business Analytics</h1>
            <p className="ssa-page-desc">
              Forecast future sales, segment customers by value, and analyze product performance using{" "}
              <span style={{ color: "var(--gold)", fontWeight: 700 }}>Singular Spectrum Analysis.</span>
            </p>
          </div>
        </div>

        {/* ── Tab Navigation ──────────────────────────────────────────────── */}
        <div className="ssa-tab-nav">
          {[
            { key: "forecast",  label: "Demand Forecast" },
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

        {/* ── Two-column workspace ───────────────────────────────────────────── */}
        <div className="ssa-layout">
          {/* ════════ Left control sidebar ════════ */}
          <aside className="ssa-sidebar">
            {/* Data Source */}
            <div>
              <p className="ssa-side-label">Data Source</p>
              <div className="ssa-source-list">
                {DATA_SOURCES.map((s) => {
                  const icons = {
                    sales_revenue: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="1" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>
                    ),
                    sales_qty: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>
                    ),
                    inventory_stock: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                    ),
                  };
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`ssa-source-vbtn ${dataSource === s.key ? "active" : ""}`}
                      onClick={() => {
                        setDataSource(s.key);
                        setDynamicMaxCount(forecastPeriod.maxCount);
                        setForecastCount("");   // reset look-ahead when data source changes
                        setResult(null);
                        setSubmittedConfig(null);
                        setError("");
                      }}
                    >
                      {icons[s.key]}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inventory item picker (inventory mode only) */}
            {dataSource === "inventory_stock" && (
              <div>
                <p className="ssa-side-label">Inventory Item</p>
                <select
                  className="ssa-select"
                  style={{ width: "100%", minWidth: 0 }}
                  value={selectedInventoryId}
                  onChange={(e) => {
                    setSelectedInventoryId(e.target.value);
                    setForecastCount("");   // reset look-ahead when item changes
                    setResult(null);
                    setSubmittedConfig(null);
                  }}
                >
                  {inventoryList.filter((i) => !i.isOnDemand).map((item) => {
                    const isLow = (item.stockQty ?? 0) <= (item.minStockLevel ?? 0);
                    return (
                      <option key={item._id ?? item.id} value={item._id ?? item.id}>
                        {isLow ? "⚠ " : ""}{item.name}{isLow ? ` (${item.stockQty ?? 0} left)` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Forecast Period + Look-ahead + Run */}
            <>
                <div>
                  <p className="ssa-side-label">Forecast Period</p>
                  <div className="ssa-segmented">
                    {FORECAST_PERIODS.map((p) => (
                      <button
                        key={p.type}
                        type="button"
                        className={`ssa-seg-btn ${forecastPeriod.type === p.type ? "active" : ""}`}
                        onClick={() => {
                          setForecastPeriod(p);
                          setDynamicMaxCount(p.maxCount);
                          setForecastCount("");   // reset look-ahead when period changes
                          setResult(null);
                          setSubmittedConfig(null);
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="ssa-side-label">Look-Ahead</p>
                  <div className="ssa-lookahead">
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
                      onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    />
                    <span className="unit">
                      {forecastPeriod.type === "weekly" ? "wks" : forecastPeriod.type === "monthly" ? "mos" : "yrs"}
                    </span>
                  </div>
                  <p className="ssa-side-hint">Max {dynamicMaxCount} {forecastPeriod.unit}</p>
                </div>

                <button
                  type="button"
                  className="ssa-primary-btn"
                  disabled={isLoading}
                  onClick={() => handleSubmit()}
                >
                  {isLoading ? (
                    <>
                      <svg className="ssa-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                      Running…
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      Run Forecast
                    </>
                  )}
                </button>
              </>

            {/* Model info — populated after a successful sales forecast */}
            {dataSource !== "inventory_stock" && result && submittedConfig?.source === dataSource && (
              <>
                <div className="ssa-side-divider" />
                <div>
                  <p className="ssa-side-label">Model Info</p>
                  <div className="ssa-model-info">
                    <div className="ssa-model-row">
                      <span className="k">Series</span>
                      <span className="v">
                        {submittedConfig?.sourceLabel}
                        <span style={{ color: "var(--gray)", fontWeight: 400, marginLeft: "0.3rem" }}>
                          {isMoneySource(submittedConfig?.source) ? "(₱)" : "(units)"}
                        </span>
                      </span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Training data</span>
                      <span className="v">
                        {trainingPeriods != null
                          ? `${trainingPeriods} ${result?.training_unit ?? submittedConfig?.period?.unit ?? "periods"}`
                          : `${dataPointCount}`}
                      </span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Raw records</span>
                      <span className="v">{dataPointCount.toLocaleString("en-US")}</span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Auto window (L)</span>
                      <span className="v gold">{result?.auto_L?.L_used ?? "—"}</span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">
                        <span className="ssa-tooltip">
                          Period detected
                          <span style={{ marginLeft: "4px", opacity: 0.5, fontSize: "0.65rem" }}>ⓘ</span>
                          <span className="ssa-tooltip-text" style={{ left: 0, transform: "none", width: 210 }}>
                            How often your sales pattern repeats, based on your past sales. The model finds it automatically — it has nothing to do with how far ahead you forecast.
                          </span>
                        </span>
                      </span>
                      <span className="v">
                        {result?.auto_L?.period_detected ? `${result.auto_L.period_detected} steps` : "—"}
                      </span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Algorithm</span>
                      <span className="v" style={{ fontSize: "0.7rem", letterSpacing: "0.5px", padding: "0.1rem 0.4rem", border: "1px solid var(--border)", borderRadius: "3px" }}>SSA</span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Last run</span>
                      <span className="v">
                        {lastRunAt
                          ? lastRunAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Export — available once a forecast with values exists */}
            {dataSource !== "inventory_stock" && result && submittedConfig?.source === dataSource && parseInt(forecastCount, 10) > 0 && (
              <>
                <div className="ssa-side-divider" />
                <div>
                  <p className="ssa-side-label">Export</p>
                  <button type="button" className="ssa-export-btn" style={{ marginBottom: "0.5rem" }} onClick={handleDownloadCSV}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Download CSV
                  </button>
                  <button type="button" className="ssa-export-btn" onClick={handleDownloadPNG}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    Download PNG
                  </button>
                </div>
              </>
            )}
          </aside>

          {/* ════════ Right results column ════════ */}
          <div className="ssa-main">
            {error && (
              <div className="ssa-error" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

        {/* ── Inventory Stock Level overview ───────────────────────────────── */}
        {dataSource === "inventory_stock" && (() => {
          const tracked = inventoryList.filter((i) => !i.isOnDemand);
          const outItems = tracked.filter((i) => (i.stockQty ?? 0) === 0);
          const lowItems = tracked.filter(
            (i) => (i.stockQty ?? 0) > 0 && (i.stockQty ?? 0) <= (i.minStockLevel ?? 0),
          );

          return (
            <div style={{ marginBottom: "1.5rem" }}>
              <p className="ssa-side-label" style={{ marginBottom: "0.6rem" }}>
                Inventory Status · across all {tracked.length} tracked items
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                {[
                  { label: "Total Tracked Items", value: tracked.length, color: "var(--white)" },
                  { label: "Low Stock", value: lowItems.length, color: "#eab308", hint: "at/below reorder point" },
                  { label: "Out of Stock", value: outItems.length, color: "#f87171", hint: "zero on hand" },
                ].map(({ label, value, color, hint }) => (
                  <div key={label} className="ssa-metric-card">
                    <div className="ssa-stat-label">{label}</div>
                    <div className="ssa-stat-value" style={{ color, fontSize: "1.5rem" }}>{value}</div>
                    {hint && <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.2rem" }}>{hint}</div>}
                  </div>
                ))}
              </div>
            </div>
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
            const isInvCard =
              (result ? submittedConfig?.source : dataSource) ===
              "inventory_stock";

            // Pass is_high_volatility so resolveAccuracy can adjust tooltip + color
            const acc = resolveAccuracy(
              result?.accuracy,
              result?.is_high_volatility ?? false,
            );
            const mae = result?.accuracy?.mae;
            const fcDatesM = result?.forecast?.dates || [];
            const horizonRange = fcDatesM.length
              ? `${formatDateLabel(fcDatesM[0], submittedConfig?.period?.type, true)} – ${formatDateLabel(fcDatesM[fcDatesM.length - 1], submittedConfig?.period?.type, true)}`
              : null;

            // ── Inventory-native figures (only used when isInvCard) ──
            const invSelItem = inventoryList.find((i) => (i._id ?? i.id) === selectedInventoryId);
            const reorderPt = invSelItem?.minStockLevel ?? null;
            const fcVals = result?.forecast?.values || [];
            const avgDemand = fcVals.length
              ? fcVals.reduce((s, v) => s + (v ?? 0), 0) / fcVals.length
              : null;
            const unitSingular = (submittedConfig?.period?.unit ?? forecastPeriod.unit).replace(/s$/, "");
            let invStockoutDate = null, invPeriodsToOut = null;
            if (isInvCard && result && currentStockQty != null) {
              const fcD = result.forecast?.dates || [];
              const todayStr = new Date().toISOString().split("T")[0];
              let rem = currentStockQty, n = 0;
              for (let i = 0; i < fcD.length; i++) {
                if (fcD[i] <= todayStr) continue;
                rem -= Math.max(0, Math.round(fcVals[i] ?? 0));
                n++;
                if (rem <= 0) { invStockoutDate = fcD[i]; invPeriodsToOut = n; break; }
              }
            }
            const stockStatus = isInvCard && currentStockQty != null
              ? (currentStockQty === 0 ? "out" : (reorderPt != null && reorderPt > 0 && currentStockQty <= reorderPt ? "low" : "ok"))
              : "ok";
            const stockColor = stockStatus === "out" ? "#f87171" : stockStatus === "low" ? "#fbbf24" : "var(--gold)";
            const policy = invPolicy;
            const belowROP = policy && currentStockQty != null && currentStockQty <= policy.ROP;
            const invColor = currentStockQty === 0 ? "#f87171" : belowROP ? "#fbbf24" : "var(--gold)";
            let reorderByLabel = "—";
            if (policy && currentStockQty != null) {
              if (currentStockQty === 0 || belowROP) reorderByLabel = "Now";
              else if (policy.d > 0) {
                const _dt = new Date();
                _dt.setUTCDate(_dt.getUTCDate() + Math.round(policy.periodsToROP * policy.daysPerPeriod));
                const _m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                reorderByLabel = `${_m[_dt.getUTCMonth()]} ${_dt.getUTCDate()}, ${_dt.getUTCFullYear()}`;
              }
            }
            const clsInfo = policy ? (DEMAND_CLASS[policy.cls] ?? DEMAND_CLASS.new) : null;

            return isInvCard ? (
              <>
              <div className="ssa-metric-cards">
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Current Stock</div>
                  {firstLoad ? <div className="ssa-skeleton" /> : (
                    <>
                      <div className="ssa-stat-value" style={{ color: invColor, fontSize: "1.5rem" }}>
                        {currentStockQty != null ? `${currentStockQty.toLocaleString("en-US")} units` : "—"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.2rem" }}>
                        {currentStockQty === 0 ? "Out of stock" : belowROP ? "At/below reorder point" : "Above reorder point"}
                      </div>
                    </>
                  )}
                </div>
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Reorder Point</div>
                  {firstLoad || !policy ? <div className="ssa-skeleton" /> : (
                    <>
                      <div className="ssa-stat-value" style={{ color: "var(--gold)", fontSize: "1.5rem" }}>
                        {policy.ROP.toLocaleString("en-US")} units
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.2rem" }}>
                        manual: {reorderPt != null && reorderPt > 0 ? `${reorderPt.toLocaleString("en-US")} units` : "not set"}
                      </div>
                    </>
                  )}
                </div>
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Reorder By</div>
                  {firstLoad || !policy ? <div className="ssa-skeleton" /> : (
                    <>
                      <div className="ssa-stat-value" style={{ color: reorderByLabel === "Now" ? "#f87171" : "var(--white)", fontSize: reorderByLabel === "Now" ? "1.5rem" : "1.25rem" }}>
                        {reorderByLabel === "Now" && (
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#f87171", marginRight: 7, verticalAlign: "middle" }} />
                        )}
                        {reorderByLabel}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.2rem" }}>
                        lead time {policy.leadDays}d{policy.usingDefaultLead ? " (default)" : ""}
                      </div>
                    </>
                  )}
                </div>
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Suggested Order</div>
                  {firstLoad || !policy ? <div className="ssa-skeleton" /> : (
                    <>
                      <div className="ssa-stat-value" style={{ color: "var(--gold)", fontSize: "1.5rem" }}>
                        {policy.orderQty.toLocaleString("en-US")} units
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.2rem" }}>
                        {policy.orderQty > 0 ? "to cover lead + buffer" : "stock sufficient"}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {!firstLoad && policy && (
                <>
                <p className="ssa-side-label" style={{ margin: "0.25rem 0 0.5rem" }}>Demand Profile</p>
                <div className="ssa-units-summary" style={{ alignItems: "flex-start", gap: "1.75rem" }}>
                  <div>
                    <span className="k">Demand Pattern</span>
                    <span
                      className="ssa-rfm-badge"
                      style={{ background: `${clsInfo.color}1f`, color: clsInfo.color, border: `1px solid ${clsInfo.color}40`, alignSelf: "flex-start" }}
                    >
                      {clsInfo.label}
                    </span>
                  </div>
                  <div>
                    <span className="k">Demand Rate</span>
                    <span className="v">
                      {fmtDemand(policy.d)}
                      <span style={{ fontWeight: 400, color: "var(--gray)", fontSize: "0.8rem" }}> ± {fmtDemand(policy.sigma)} /{unitSingular}</span>
                    </span>
                  </div>
                  <div>
                    <span className="k">Coverage</span>
                    <span className="v">{policy.coverage == null ? "—" : `${policy.coverage > 99 ? "99+" : policy.coverage.toFixed(1)} ${unitSingular}s`}</span>
                  </div>
                  <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                    <span className="k">Method</span>
                    <span className="v" style={{ fontSize: "0.76rem", fontWeight: 500, color: "var(--gray)", lineHeight: 1.4 }}>
                      {clsInfo.note}
                      {result?.method ? ` · ${result.method === "sba" ? "Croston/SBA" : "SSA"}` : (result?.is_fallback ? " · average" : "")}
                      {policy.usingDefaultLead ? ` · default ${policy.leadDays}d lead time` : ""}
                    </span>
                  </div>
                </div>
                </>
              )}
              </>
            ) : (
              <div className="ssa-metric-cards">
                {/* 1 — Forecast accuracy */}
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">
                    <span className="ssa-tooltip">
                      {acc.label}
                      <span style={{ marginLeft: "4px", opacity: 0.5, fontSize: "0.65rem" }}>ⓘ</span>
                      <span className="ssa-tooltip-text">{acc.tooltip}</span>
                    </span>
                  </div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : result && hasForecastCount ? (
                    <>
                      <div className="ssa-stat-value" style={{ color: acc.color, fontSize: "1.5rem" }}>
                        {acc.display ?? "N/A"}
                        {result?.forecast_dampened && (
                          <span style={{ fontSize: "0.65rem", color: "#fbbf24", marginLeft: "6px", fontWeight: 400, verticalAlign: "middle" }}>
                            dampened ⚡
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.2rem", lineHeight: 1.4 }}>
                        {acc.sublabel}
                      </div>
                    </>
                  ) : (
                    <div className="ssa-stat-value" style={{ color: "var(--gray)", fontSize: "1.5rem" }}>&mdash;</div>
                  )}
                </div>

                {/* 2 — MAE */}
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">MAE ({forecastPeriod.unit.replace(/s$/, "")})</div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : result && hasForecastCount ? (
                    <>
                      <div className="ssa-stat-value" style={{ fontSize: "1.5rem" }}>
                        {mae != null
                          ? fmtSourceValue(mae, submittedConfig?.source ?? dataSource, true)
                          : "N/A"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.2rem" }}>
                        Mean absolute error
                      </div>
                    </>
                  ) : (
                    <div className="ssa-stat-value" style={{ color: "var(--gray)", fontSize: "1.5rem" }}>&mdash;</div>
                  )}
                </div>

                {/* 3 — Last period value / current stock */}
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">
                    {(result ? submittedConfig?.source : dataSource) === "inventory_stock"
                      ? "Current Stock Level"
                      : isRevenue
                      ? forecastPeriod.type === "weekly"
                        ? "Last 7-Day Revenue"
                        : forecastPeriod.type === "monthly"
                        ? "Last 30-Day Revenue"
                        : "Last Recorded Year Value"
                      : forecastPeriod.type === "weekly"
                      ? "Last 7-Day Quantity"
                      : forecastPeriod.type === "monthly"
                      ? "Last 30-Day Quantity"
                      : "Last Year Quantity"}
                  </div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : (
                    <div className="ssa-stat-value" style={{ color: "var(--gold)" }}>
                      {isInvCard
                        ? (currentStockQty !== null ? `${currentStockQty.toLocaleString("en-US")} units` : "\u2014")
                        : fmtSourceValue(lastVal, submittedConfig?.source ?? dataSource, true)}
                    </div>
                  )}
                </div>

                {/* 4\u2014 Forecast horizon */}
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Forecast Horizon</div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : hasForecastCount && submittedConfig ? (
                    <>
                      <div className="ssa-stat-value" style={{ fontSize: "1.5rem" }}>
                        {submittedConfig.count}{" "}
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--gray)" }}>
                          {submittedConfig.period.unit}
                        </span>
                      </div>
                      {horizonRange && (
                        <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.2rem", lineHeight: 1.4 }}>
                          {horizonRange}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="ssa-stat-value" style={{ color: "var(--gray)", fontSize: "1.5rem" }}>&mdash;</div>
                  )}
                </div>
              </div>
            );
          })()}

        {result && submittedConfig && submittedConfig.source === dataSource && (
          <>
            {/* ── Inventory depletion status banners ─────────────────────── */}
            {isInvMode && stockoutDate && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: "10px", padding: "0.875rem 1.25rem", fontSize: "0.85rem", color: "var(--gray)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>
                  <strong style={{ color: "#f87171" }}>Predicted stockout —</strong>{" "}
                  Based on current demand trends, <strong style={{ color: "var(--white)" }}>{selectedItemName}</strong> is projected to run out around{" "}
                  <strong style={{ color: "var(--white)" }}>{formatDateLabel(stockoutDate, submittedConfig?.period?.type)}</strong>.{" "}
                  Consider restocking soon.
                </span>
              </div>
            )}
            {isInvMode && !stockoutDate && parseInt(forecastCount, 10) > 0 && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "10px", padding: "0.875rem 1.25rem", fontSize: "0.85rem", color: "var(--gray)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>
                  <strong style={{ color: "#4ade80" }}>Stock sufficient</strong>{" "}
                  — No stockout predicted within the {submittedConfig.count} {submittedConfig.period.unit} forecast window.
                </span>
              </div>
            )}
            {isInvMode && result?.is_fallback && parseInt(forecastCount, 10) > 0 && (
              <div className="ssa-warning-banner">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <strong style={{ color: "#fbbf24" }}>Average-demand estimate —</strong>{" "}
                  a full SSA forecast wasn't available for this item ({dataPointCount} sale record{dataPointCount !== 1 ? "s" : ""}), so the projection uses its average demand from past sales. Treat it as directional.
                </span>
              </div>
            )}

            {!isInvMode && ((parseInt(forecastCount, 10) > 0 && result?.data_quality?.is_low_confidence) ||
              result?.data_quality?.trim_warning ||
              result?.is_high_volatility ||
              result?.forecast_dampened) && (
            <div className="ssa-alerts-group">
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
                  {result.cv?.toFixed(2)}×). SSA captures the long-run{" "}
                  {isMoneySource(submittedConfig.source) ? "revenue" : "demand"} trend
                  {result.trend_avg != null
                    ? ` (~${isMoneySource(submittedConfig.source)
                        ? "\u20b1" + Math.round(result.trend_avg).toLocaleString()
                        : Math.round(result.trend_avg).toLocaleString() + " units"}/${submittedConfig.period.unit.replace(/s$/, "")} baseline)`
                    : ""}
                  . It cannot predict <em>when</em> individual order spikes
                  occur. Use this forecast as a {submittedConfig.period.unit.replace(/s$/, "")}-level{" "}
                  {isMoneySource(submittedConfig.source) ? "revenue" : "quantity"} baseline, not an
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
            </div>
            )}

            <div className="ssa-card">
              <div className="ssa-card-header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.85rem" }}>
                <div>
                  <h2 className="ssa-card-title">
                    {isInvMode
                      ? `Stock Depletion \u2014 ${selectedItemName}`
                      : parseInt(forecastCount, 10) > 0
                      ? `${submittedConfig.sourceLabel} \u2014 ${submittedConfig.count} ${submittedConfig.period.unit} Forecast`
                      : `${submittedConfig.sourceLabel} \u2014 Historical`}
                  </h2>
                  {isInvMode ? (
                    <div className="ssa-chart-legend">
                      <span className="lg"><span className="swatch" style={{ background: "var(--gray)" }} />Stock Level</span>
                      <span className="lg"><span className="swatch" style={{ background: "var(--gold)" }} />Projected Stock</span>
                      <span className="lg"><span className="swatch" style={{ background: "#4ade80" }} />Today</span>
                      {invPolicy && invPolicy.ROP > 0 && (
                        <span className="lg"><span className="swatch" style={{ background: "#fbbf24" }} />Reorder point</span>
                      )}
                      {stockoutDate && (
                        <span className="lg"><span className="swatch" style={{ background: "#f87171" }} />Stockout</span>
                      )}
                    </div>
                  ) : (
                    <div className="ssa-chart-legend">
                      <span className="lg"><span className="swatch" style={{ background: "var(--gray)" }} />Actual</span>
                      <span className="lg"><span className="swatch" style={{ background: "var(--gold)" }} />Forecast</span>
                      {showConfidence && parseInt(forecastCount, 10) > 0 && (
                        <span className="lg"><span className="swatch" style={{ background: "rgba(212,168,67,0.45)" }} />{"CI \u00b11.96\u03c3"}</span>
                      )}
                    </div>
                  )}
                </div>
                {!isInvMode && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  {todayRefDate && (
                    <span className="ssa-today-pill">
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                      Today
                    </span>
                  )}
                  {!isInvMode && parseInt(forecastCount, 10) > 0 && (
                    <>
                      <button
                        type="button"
                        className={`ssa-toggle-btn ${showConfidence ? "active" : ""}`}
                        onClick={() => setShowConfidence((v) => !v)}
                      >
                        Confidence
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
                    </>
                  )}
                  {!isInvMode && <div className="ssa-filter-divider" />}
                  {!isInvMode && (
                    <button
                      type="button"
                      className={`ssa-toggle-btn ${showDecomp ? "active" : ""}`}
                      onClick={() => setShowDecomp((v) => !v)}
                    >
                      Decomposition
                    </button>
                  )}
                  {!isInvMode && (
                    <button
                      type="button"
                      className={`ssa-toggle-btn ${showAllHistory ? "active" : ""}`}
                      onClick={() => setShowAllHistory((v) => !v)}
                      title="Show all historical training data instead of just the recent slice"
                    >
                      All History
                    </button>
                  )}
                </div>
                )}
              </div>

              {/* ── Date picker toolbar ─────────────────────────────── */}
              {!isInvMode && parseInt(forecastCount, 10) > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", padding: "0.6rem 0", borderTop: "1px solid var(--border)", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--gold)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
                    Look up period:
                  </span>
                  <select
                    value={pickerDate}
                    onChange={(e) => setPickerDate(e.target.value)}
                    style={{ padding: "0.3rem 0.6rem", background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "7px", color: pickerDate ? "var(--white)" : "var(--gray)", fontSize: "0.82rem", outline: "none", cursor: "pointer", minWidth: 130 }}
                  >
                    <option value="">
                      {submittedConfig.period.type === "weekly" ? "Select week…" : submittedConfig.period.type === "monthly" ? "Select month…" : "Select year…"}
                    </option>
                    {fcDatesForPicker.map((d) => (
                      <option key={d} value={d}>
                        {formatDateLabel(d, submittedConfig.period.type)}
                      </option>
                    ))}
                  </select>
                  {pickerMatchDate && result?.forecast?.values?.[pickerMatchIdx] != null && (
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                      <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
                        {formatDateLabel(pickerMatchDate, submittedConfig.period.type)}:
                      </span>
                      <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--gold)" }}>
                        {fmtSourceValue(result.forecast.values[pickerMatchIdx], submittedConfig.source, true)}
                      </span>
                    </div>
                  )}
                  {pickerDate && pickerMatchDate === null && (
                    <span style={{ fontSize: "0.75rem", color: "var(--gray)" }}>Not in forecast range</span>
                  )}
                </div>
              )}

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

              <div ref={chartRef} style={{ height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {(() => {
                    const chartData = isInvMode ? getInventoryChartData() : getCombinedChartData();
                    return (
                      <LineChart
                        data={chartData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickMargin={8}
                          minTickGap={35}
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
                            return (
                              <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem 0.85rem", fontSize: "0.8rem", minWidth: 160 }}>
                                <div style={{ color: "var(--gray)", marginBottom: "0.4rem", fontSize: "0.74rem" }}>
                                  {chartDateFormatter(label)}
                                </div>
                                {payload.map((p) => {
                                  if (p.value == null) return null;
                                  return (
                                    <div key={p.dataKey} style={{ color: p.color ?? "var(--white)", marginBottom: "0.15rem" }}>
                                      {p.name}: {yAxisFormatter(p.value)}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }}
                        />
                        {!isInvMode && (
                          <Legend
                            wrapperStyle={{
                              paddingTop: "16px",
                              fontSize: "0.8rem",
                            }}
                          />
                        )}
                        {isInvMode ? (
                          <>
                            <Line
                              type="stepAfter"
                              dataKey="StockActual"
                              name="Stock Level"
                              stroke="var(--gray)"
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 3 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="StockForecast"
                              name="Projected Stock"
                              stroke="var(--gold)"
                              strokeWidth={2.5}
                              strokeDasharray="6 3"
                              dot={false}
                              activeDot={{ r: 5 }}
                            />
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
                        {chartData.length > 1 && (
                          <Brush
                            key={`brush-${chartData.length}`}
                            dataKey="date"
                            height={24}
                            stroke="var(--border)"
                            fill="var(--dark)"
                            travellerWidth={8}
                            tickFormatter={chartDateFormatter}
                          />
                        )}
                        {!isInvMode && todayRefDate && (
                          <ReferenceLine
                            x={todayRefDate}
                            stroke="#4ade80"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            label={{ value: `Today · ${todayDisplay}`, position: "insideTopLeft", fill: "#4ade80", fontSize: 10 }}
                          />
                        )}
                        {isInvMode && (
                          <ReferenceLine
                            x={todayIso}
                            stroke="#4ade80"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            label={{ value: `Today · ${todayDisplay}`, position: "insideTopLeft", fill: "#4ade80", fontSize: 10 }}
                          />
                        )}
                        {pickerMatchDate && (
                          <ReferenceLine
                            x={pickerMatchDate}
                            stroke="var(--gold)"
                            strokeWidth={1.5}
                            strokeDasharray="5 3"
                            label={{ value: formatDateLabel(pickerMatchDate, submittedConfig?.period?.type), position: "insideTopRight", fill: "var(--gold)", fontSize: 10 }}
                          />
                        )}
                        {isInvMode && stockoutDate && (
                          <ReferenceLine
                            x={stockoutDate}
                            stroke="rgba(248,113,113,0.65)"
                            strokeDasharray="4 4"
                            label={{ value: "Stockout", position: "insideTopLeft", fill: "#f87171", fontSize: 10 }}
                          />
                        )}
                        {isInvMode && invPolicy && invPolicy.ROP > 0 && (
                          <ReferenceLine
                            y={invPolicy.ROP}
                            stroke="rgba(251,191,36,0.6)"
                            strokeDasharray="4 4"
                            label={{ value: `Reorder pt (${invPolicy.ROP})`, position: "insideBottomLeft", fill: "#fbbf24", fontSize: 10 }}
                          />
                        )}
                      </LineChart>
                    );
                  })()}
                </ResponsiveContainer>
              </div>

              {/* \u2500\u2500 Inline SSA Decomposition \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
              {showDecomp && (
                <>
                  <div className="ssa-section-divider" />
                  <div className="ssa-card-header" style={{ margin: "1.25rem 0 1rem" }}>
                    <h2 className="ssa-card-title" style={{ fontSize: "0.9rem" }}>SSA Decomposition</h2>
                    <span style={{ fontSize: "0.75rem", color: "var(--gray)" }}>Trend \u00b7 Seasonality \u00b7 Noise</span>
                  </div>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={getDecompChartData()}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="date"
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickMargin={8}
                          minTickGap={35}
                          tickFormatter={(v) => formatDateLabel(v, null, false)}
                        />
                        <YAxis
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickFormatter={yAxisFormatter}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "var(--dark2)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.8rem" }}
                          itemStyle={{ color: "var(--white)" }}
                          labelStyle={{ color: "var(--gray)" }}
                          labelFormatter={(v) => formatDateLabel(v, null, false)}
                        />
                        <Legend wrapperStyle={{ paddingTop: "16px", fontSize: "0.8rem" }} />
                        <Line type="monotone" dataKey="Trend" stroke="var(--gold)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Seasonality" stroke="#60a5fa" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Noise" stroke="rgba(255,255,255,0.25)" strokeWidth={1} dot={false} activeDot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.75rem", marginBottom: 0, lineHeight: 1.5 }}>
                    Trend: long-run direction. Seasonality: periodic patterns. Noise: residual.
                  </p>
                </>
              )}
            </div>

            {parseInt(forecastCount, 10) > 0 && !isInvMode && (
              <div className="ssa-info-banner">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  SSA decomposed the series into trend, seasonality, and noise. Shaded bands show {"\u00b11.96\u03c3"} confidence interval.
                  {result?.auto_L && (
                    <>
                      {" "}Window <strong style={{ color: "var(--gold)" }}>L={result.auto_L.L_used}</strong> selected automatically
                      {result.auto_L.period_detected
                        ? <> \u00b7 period detected: <strong style={{ color: "var(--white)" }}>{result.auto_L.period_detected} steps</strong>.</>
                        : " (no dominant period detected; fallback heuristic used)."}
                    </>
                  )}
                </span>
              </div>
            )}
            {parseInt(forecastCount, 10) > 0 && isInvMode && (
              <p style={{ fontSize: "0.75rem", color: "var(--gray)", fontStyle: "italic", marginTop: "0.75rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
                {`This is a demand-based projection: the model estimates ${selectedItemName}'s demand and depletes the current ${currentStockQty?.toLocaleString() ?? "\u2014"} units assuming no restock. The actionable output is the reorder point${invPolicy ? ` (${invPolicy.ROP.toLocaleString()} units)` : ""} and reorder-by date above \u2014 treat the gold line as a central estimate, not an exact path. Gray staircase = recorded stock; yellow line = reorder point.`}
              </p>
            )}
            {isInvMode && invPolicy && invPolicy.d > 0 && invPolicy.d < 0.5 && submittedConfig?.period?.type === "weekly" && (
              <div className="ssa-warning-banner" style={{ background: "rgba(96,165,250,0.06)", borderColor: "rgba(96,165,250,0.3)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  <strong style={{ color: "#60a5fa" }}>Low weekly demand \u2014</strong>{" "}
                  this item sells under 1 unit/week, so weekly numbers are mostly fractional. Switch to{" "}
                  <strong style={{ color: "var(--white)" }}>Monthly</strong> or <strong style={{ color: "var(--white)" }}>Annually</strong> for clearer whole-unit figures.
                </span>
              </div>
            )}

            {parseInt(forecastCount, 10) > 0 && (
              isInvMode ? (
                <div className="ssa-card">
                  <div className="ssa-card-header">
                    <h2 className="ssa-card-title">Projected Stock Levels</h2>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="ssa-table">
                      <thead>
                        <tr>
                          <th>{submittedConfig.period.tableHeader}</th>
                          <th>Date</th>
                          <th>Projected Stock</th>
                          <th>Est. Demand</th>
                          <th>Cumulative</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const fcDates  = result.forecast?.dates  || [];
                          const fcValues = result.forecast?.values || [];
                          const todayStr = new Date().toISOString().split("T")[0];
                          const startStock = currentStockQty ?? 0;
                          const reorderPt = invPolicy?.ROP ?? (inventoryList.find((it) => (it._id ?? it.id) === selectedInventoryId)?.minStockLevel ?? 0);
                          const tblRows = [];
                          let cumDemand = 0;   // float — accumulate sub-unit demand
                          let displayIdx = 0;
                          for (let i = 0; i < fcDates.length; i++) {
                            if (fcDates[i] <= todayStr) continue;
                            const demand = Math.max(0, fcValues[i] ?? 0);
                            cumDemand += demand;
                            const remaining = Math.max(0, startStock - cumDemand);
                            const isOut = remaining < 0.5;
                            const isLow = !isOut && (reorderPt > 0 ? remaining <= reorderPt : (startStock > 0 && remaining <= startStock * 0.2));
                            tblRows.push(
                              <tr key={i} className="ssa-forecast-day-row">
                                <td>{++displayIdx}</td>
                                <td style={{ fontSize: "0.85rem", color: "var(--gray)" }}>
                                  {formatDateLabel(fcDates[i], submittedConfig.period.type)}
                                </td>
                                <td>
                                  <span style={{ color: isOut ? "#f87171" : isLow ? "#fbbf24" : "var(--gold)", fontWeight: 600 }}>
                                    {Math.round(remaining).toLocaleString()} units
                                  </span>
                                </td>
                                <td style={{ fontSize: "0.85rem", color: "var(--gray)" }}>
                                  ~{fmtDemand(demand)} units
                                </td>
                                <td style={{ fontSize: "0.85rem", color: "var(--gray)" }}>
                                  {fmtDemand(cumDemand)} units
                                </td>
                                <td>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: isOut ? "#f87171" : isLow ? "#fbbf24" : "#4ade80" }}>
                                    {isOut ? "Out of Stock" : isLow ? (reorderPt > 0 ? "Reorder" : "Low Stock") : "In Stock"}
                                  </span>
                                </td>
                              </tr>
                            );
                          }
                          return tblRows;
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
              <div className="ssa-card">
                <div className="ssa-card-header">
                  <h2 className="ssa-card-title">Forecasted Values</h2>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className="ssa-icon-btn" onClick={handleDownloadCSV}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      CSV
                    </button>
                    <button type="button" className="ssa-icon-btn" onClick={handleDownloadPNG}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      PNG
                    </button>
                  </div>
                </div>
                {submittedConfig.source === "sales_qty" && (() => {
                  const vals = result.forecast?.values || [];
                  const dts = result.forecast?.dates || [];
                  if (vals.length === 0) return null;
                  const total = Math.round(vals.reduce((s, v) => s + (v ?? 0), 0));
                  let peak = 0;
                  for (let i = 1; i < vals.length; i++) if ((vals[i] ?? 0) > (vals[peak] ?? 0)) peak = i;
                  return (
                    <div className="ssa-units-summary">
                      <div>
                        <span className="k">Total Projected</span>
                        <span className="v gold">{total.toLocaleString("en-US")} units</span>
                      </div>
                      <div>
                        <span className="k">Peak Demand</span>
                        <span className="v">
                          {formatDateLabel(dts[peak], submittedConfig.period.type)} · {Math.round(vals[peak] ?? 0).toLocaleString("en-US")} units
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ overflowX: "auto" }}>
                  <table className="ssa-table">
                    <thead>
                      <tr>
                        <th>{submittedConfig.period.tableHeader}</th>
                        <th>Date</th>
                        <th>Predicted</th>
                        {submittedConfig.source === "sales_qty" && <th>Cumulative</th>}
                        <th>Upper CI</th>
                        <th>Lower CI</th>
                        <th>Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.forecast?.dates || []).map((date, idx) => {
                        const isPicked = idx === pickerMatchIdx;
                        const _v  = (result.forecast?.values || [])[idx];
                        const _hi = (result.forecast?.confidence_high || [])[idx];
                        const _lo = (result.forecast?.confidence_low  || [])[idx];
                        const _frac = _v != null && _hi != null && _lo != null && _hi > _lo
                          ? Math.min(1, Math.max(0, (_v - _lo) / (_hi - _lo)))
                          : null;
                        const _cum = (result.forecast?.values || [])
                          .slice(0, idx + 1)
                          .reduce((s, v) => s + (v ?? 0), 0);
                        return (
                        <tr
                          key={idx}
                          className="ssa-forecast-day-row"
                          style={isPicked ? { background: "rgba(212,168,67,0.08)", outline: "1px solid rgba(212,168,67,0.3)" } : undefined}
                        >
                          <td>{idx + 1}</td>
                          <td style={{ fontSize: "0.85rem", color: isPicked ? "var(--gold)" : "var(--gray)", fontWeight: isPicked ? 700 : 400 }}>
                            {formatDateLabel(date, submittedConfig.period.type)}
                          </td>
                          <td>
                            <span style={{ color: "var(--gold)", fontWeight: 600 }}>
                              {fmtSourceValue((result.forecast?.values || [])[idx], submittedConfig.source, true)}
                            </span>
                          </td>
                          {submittedConfig.source === "sales_qty" && (
                            <td style={{ fontSize: "0.85rem", color: "var(--gray)" }}>
                              {Math.round(_cum).toLocaleString("en-US")} units
                            </td>
                          )}
                          <td style={{ fontSize: "0.85rem", color: "rgba(212,168,67,0.6)" }}>
                            {fmtSourceValue((result.forecast?.confidence_high || [])[idx], submittedConfig.source)}
                          </td>
                          <td style={{ fontSize: "0.85rem", color: "rgba(212,168,67,0.6)" }}>
                            {fmtSourceValue((result.forecast?.confidence_low || [])[idx], submittedConfig.source)}
                          </td>
                          <td>
                            {_frac != null ? (
                              <div className="ssa-range-track" title="Predicted position within the confidence band">
                                <div className="ssa-range-fill" style={{ width: `${(_frac * 100).toFixed(0)}%` }} />
                              </div>
                            ) : (
                              <span style={{ color: "var(--gray)" }}>\u2014</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              )
            )}
          </>
        )}

          </div>{/* ssa-main */}
        </div>{/* ssa-layout */}

        {/* ── close forecast tab ─────────────────────────────────────────── */}
        </>)}

        {/* ── Customer Segments Tab ─────────────────────────────────────── */}
        {activeTab === "segments" && (
          <div className="ssa-tab-scroll">
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

        {/* ── Products & Services Tab (ABC Product/Service Segmentation) ── */}
        {activeTab === "products" && (
          <div className="ssa-tab-scroll">
            {analyticsLoading ? <AnalyticsSkeleton /> : serviceResult ? (
              <>
                {/* ── header ── */}
                <div className="ssa-card" style={{marginBottom:"1.5rem"}}>
                  <div className="ssa-card-header" style={{marginBottom:"0.75rem"}}>
                    <div>
                      <h2 className="ssa-card-title">Products &amp; Services</h2>
                      <p style={{fontSize:"0.8rem",color:"var(--gray)",marginTop:"0.3rem",lineHeight:1.55}}>
                        <strong style={{color:"var(--white)"}}>ABC revenue analysis</strong> — ranks every product by its
                        revenue contribution (A = top 70%, B = next 20%, C = the rest), with units sold and average price.
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
                    { label: "Total Products",    value: serviceResult?.total_services ?? "—",   sub: "distinct products / services" },
                    { label: "Total Revenue",      value: serviceResult ? "₱" + (serviceResult.total_revenue ?? 0).toLocaleString("en-US",{maximumFractionDigits:0}) : "—", sub: "from all recorded sales" },
                    { label: "A-Class Products",   value: (serviceResult?.services ?? []).filter(s => s.abc_class === "A").length || "—", sub: "top 70% of revenue" },
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
                        Sorted by revenue. Orders column shows how many recorded sales included this product.
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
                            <th style={{textAlign:"right"}}>Avg price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(serviceResult.services ?? []).map((svc, idx) => {
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
                                <td style={{textAlign:"right",fontWeight:600}}>{svc.order_count}</td>
                                <td style={{textAlign:"right"}}>₱{svc.avg_price?.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                              </tr>
                            );
                          })}
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
                {serviceError && (
                  <div className="ssa-error" style={{marginTop:"1rem"}}>{serviceError}</div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}
