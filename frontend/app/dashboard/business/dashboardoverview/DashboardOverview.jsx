"use client";

/**
 * DASHBOARD OVERVIEW COMPONENT
 *
 * SSA-Style Dashboard for Personalize Me Prints
 * Inspired by Shopee Seller Centre Business Insights
 *
 * Data Sources:
 * - Real data: orderStats, salesSummary, inventory, recentOrders (from API via page.jsx)
 * - Placeholder: Charts, top products, recent activity (needs backend integration)
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CustomDropdown from "@/app/components/CustomDropdown";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Shared Styles ──────────────────────────────────────────────────────────────
const cardStyle = {
  background: "rgba(255,255,255,0.03)",
  borderRadius: "12px",
  padding: "1.25rem",
  border: "1px solid var(--border)",
};

const sectionTitleStyle = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "var(--gray)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: "1rem",
};

const metricLabelStyle = {
  fontSize: "0.7rem",
  color: "var(--gray)",
  marginBottom: "0.25rem",
  fontWeight: 600,
};

const metricValueStyle = {
  fontSize: "1.75rem",
  fontWeight: 800,
  color: "var(--white)",
  lineHeight: 1.2,
};

const trendStyle = {
  fontSize: "0.75rem",
  fontWeight: 600,
  marginTop: "0.5rem",
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
};

// ── Trend Arrow Component (SVG-based, no emojis) ───────────────────────────────
function TrendArrow({ value, prefix = "vs Yesterday" }) {
  if (!value) return null;
  const isPositive = value > 0;
  const color = isPositive ? "var(--green)" : "var(--red)";

  return (
    <div style={{ ...trendStyle, color }}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="3"
        style={{ transform: isPositive ? "none" : "rotate(180deg)" }}
      >
        <path d="M5 15l7-7 7 7" />
      </svg>
      {Math.abs(value).toFixed(2)}% {prefix}
    </div>
  );
}

// ── Chart Placeholder Component ────────────────────────────────────────────────
function ChartPlaceholder({ label }) {
  return (
    <div
      style={{
        height: "200px",
        background: "rgba(255,255,255,0.02)",
        borderRadius: "8px",
        border: "1px dashed rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: "1rem",
      }}
    >
      <div style={{ textAlign: "center", color: "var(--gray)" }}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ marginBottom: "0.5rem" }}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <div style={{ fontSize: "0.75rem", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: "0.65rem", marginTop: "0.25rem" }}>
          Chart data will appear here
        </div>
      </div>
    </div>
  );
}

// ── Progress Bar Component ─────────────────────────────────────────────────────
function ProgressBar({ value, color = "var(--gold)" }) {
  return (
    <div
      style={{
        width: "100%",
        height: "6px",
        background: "rgba(255,255,255,0.06)",
        borderRadius: "3px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${value}%`,
          height: "100%",
          background: color,
          borderRadius: "3px",
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

// ── Main Dashboard Component ───────────────────────────────────────────────────
const HIST_WINDOW = 20; // show only last N historical weeks

function buildMiniSsaChartData(ssaResult) {
  if (!ssaResult) return [];
  const allHistDates  = ssaResult.historical?.dates  || [];
  const allHistValues = ssaResult.historical?.values || [];
  const fcDates       = ssaResult.forecast?.dates    || [];
  const fcValues      = ssaResult.forecast?.values   || [];
  const fcHigh        = ssaResult.forecast?.confidence_high || [];
  const fcLow         = ssaResult.forecast?.confidence_low  || [];

  // Trim history to last HIST_WINDOW points so the chart isn't compressed
  const start      = Math.max(0, allHistDates.length - HIST_WINDOW);
  const histDates  = allHistDates.slice(start);
  const histValues = allHistValues.slice(start);

  const _t            = new Date();
  const todayStr      = `${_t.getFullYear()}-${String(_t.getMonth()+1).padStart(2,'0')}-${String(_t.getDate()).padStart(2,'0')}`;
  const lastHistDate  = histDates[histDates.length - 1] ?? null;
  const lastHistValue = histValues[histValues.length - 1] ?? null;

  const data = histDates.map((date, i) => ({ date, Actual: histValues[i] ?? null }));

  // Bridge: extend Actual from last historical date up to today so the
  // "Forecast Start" line always aligns with today, not with the last training week.
  if (lastHistDate && lastHistDate < todayStr) {
    const cur = new Date(lastHistDate + "T00:00:00Z");
    cur.setUTCDate(cur.getUTCDate() + 1);
    const end = new Date(todayStr + "T00:00:00Z");
    while (cur <= end) {
      data.push({ date: cur.toISOString().split("T")[0], Actual: lastHistValue });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // Only draw forecast for dates strictly after today
  fcDates.forEach((date, i) => {
    if (date <= todayStr) return;
    data.push({
      date,
      Forecast: fcValues[i] ?? null,
      High:     fcHigh[i] ?? null,
      Low:      fcLow[i] ?? null,
    });
  });

  data.sort((a, b) => a.date.localeCompare(b.date));
  return data;
}

export default function DashboardOverview({ orderStats, salesSummary, inventory = [], recentOrders = [], activeBanners = 0, pendingReturns = 0, topProducts = [], recentMovements = [], dailyRevenue = [], ssaRevResult = null, ssaQtyResult = null, onRefresh }) {
  const router = useRouter();
  const [chartPeriod, setChartPeriod] = useState("daily");
  const [miniSource, setMiniSource] = useState("revenue");

  // ── Compute inventory metrics from real API data ─────────────────────────
  const inventoryMetrics = useMemo(() => {
    const items = Array.isArray(inventory) ? inventory.filter(i => i.isActive !== false) : [];
    const totalMaterials = items.length;

    const categories = new Set(items.map((m) => m.category).filter(Boolean));
    const totalCategories = categories.size;

    const totalStock = items.reduce((sum, m) => sum + (m.stockQty || 0), 0);
    const totalValue = items.reduce((sum, m) => sum + ((m.stockQty || 0) * (m.averageCost || 0)), 0);

    const lowStock  = items.filter(m => m.stockQty > 0 && m.stockQty <= (m.minStockLevel || 10)).length;
    const outOfStock = items.filter(m => (m.stockQty || 0) === 0).length;
    const healthy   = items.filter(m => (m.stockQty || 0) > (m.minStockLevel || 10)).length;
    const healthRate = totalMaterials > 0 ? (healthy / totalMaterials) * 100 : 0;

    const categoryData = {};
    items.forEach((m) => {
      const cat = m.category || "Uncategorized";
      if (!categoryData[cat]) {
        categoryData[cat] = { name: cat, stock: 0, value: 0, materials: 0 };
      }
      categoryData[cat].stock     += (m.stockQty || 0);
      categoryData[cat].value     += ((m.stockQty || 0) * (m.averageCost || 0));
      categoryData[cat].materials += 1;
    });

    const categoryBreakdown = Object.values(categoryData).sort((a, b) => b.value - a.value);
    const maxCategoryValue  = categoryBreakdown.length > 0 ? categoryBreakdown[0].value : 1;

    return {
      totalMaterials, totalCategories, totalStock, totalValue,
      lowStock, outOfStock, healthy, healthRate,
      categoryBreakdown, maxCategoryValue,
    };
  }, [inventory]);

  // ── Status badge helper ──────────────────────────────────────────────────────
  const getStatusColor = (status) => {
    const colors = {
      Pending: "var(--color-text-warning)",
      Processing: "var(--blue)",
      Delivered: "var(--green)",
      Cancelled: "var(--red)",
    };
    return colors[status] || "var(--gray)";
  };

  const getMovementColor = (type) => {
    if (type === "in") return "var(--green)";
    if (type === "out") return "var(--red)";
    return "var(--gray)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--white)",
            }}
          >
            Dashboard Overview
          </h2>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <CustomDropdown
            value={chartPeriod}
            onChange={setChartPeriod}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly" },
            ]}
            style={{ width: "130px" }}
          />
          <button
            onClick={() => router.push("/dashboard/business/reports")}
            style={{
              padding: "0.5rem 1rem",
              background: "rgba(212,168,67,0.15)",
              border: "1px solid rgba(212,168,67,0.3)",
              borderRadius: "8px",
              color: "var(--gold)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
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
            Export Data
          </button>
        </div>
      </div>

      {/* ── Real-Time Metrics + Top Products ────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: "1rem",
        }}
      >
        {/* Left: Revenue Chart */}
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--white)" }}>
              Sales Metrics
            </h3>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <div style={metricLabelStyle}>Revenue Today</div>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                color: salesSummary?.totalRevenue ? "var(--gold)" : "var(--gray)",
                fontFamily: "monospace",
              }}
            >
              {salesSummary?.totalRevenue
                ? `₱${salesSummary.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "—"}
            </div>
          </div>

          {/* SSA Forecast chart — source toggle + real SSA lines */}
          {(() => {
            const isInventory = miniSource === "inventory";
            const ssaResult   = miniSource === "quantity" ? ssaQtyResult : ssaRevResult;
            const miniData    = buildMiniSsaChartData(isInventory ? null : ssaResult);
            const _now        = new Date();
            const todayStr    = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
            const isRevenue   = miniSource === "revenue";

            const fmtVal = (v) => {
              if (v == null) return "—";
              if (isRevenue) {
                if (Math.abs(v) >= 1000000) return "₱" + (v / 1000000).toFixed(1) + "M";
                if (Math.abs(v) >= 1000) return "₱" + (v / 1000).toFixed(1) + "K";
                return "₱" + v.toFixed(0);
              }
              if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "K";
              return Math.round(v).toString();
            };
            const fmtDate = (ds) => {
              if (!ds) return "";
              const d = new Date(ds + "T00:00:00Z");
              return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
            };

            const sourceLabel = isRevenue ? "REVENUE" : miniSource === "quantity" ? "QUANTITY" : "INVENTORY STOCK";

            return (
              <div style={{ marginTop: "1rem" }}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                  {/* Source toggle buttons */}
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    {[
                      { key: "revenue",   label: "Revenue" },
                      { key: "quantity",  label: "Quantity" },
                      { key: "inventory", label: "Inventory" },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setMiniSource(key)}
                        style={{
                          padding: "0.2rem 0.55rem",
                          fontSize: "0.68rem",
                          fontWeight: 600,
                          borderRadius: "6px",
                          border: miniSource === key ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.12)",
                          background: miniSource === key ? "rgba(212,168,67,0.15)" : "rgba(255,255,255,0.04)",
                          color: miniSource === key ? "var(--gold)" : "var(--gray)",
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span
                    style={{ fontSize: "0.65rem", color: "var(--gold)", fontWeight: 600, cursor: "pointer" }}
                    onClick={() => router.push("/dashboard/business/ssa-forecast")}
                  >
                    View Full Forecast →
                  </span>
                </div>

                <div style={{ fontSize: "0.65rem", color: "var(--gray)", fontWeight: 600, marginBottom: "0.4rem", letterSpacing: "0.05em" }}>
                  SSA {sourceLabel} FORECAST (WEEKLY)
                </div>

                {/* Inventory: redirect card */}
                {isInventory ? (
                  <div
                    style={{ height: "180px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px dashed rgba(255,255,255,0.1)", cursor: "pointer" }}
                    onClick={() => router.push("/dashboard/business/ssa-forecast")}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><path d="M3 3h18v18H3z" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--white)" }}>Select an item in the Forecast tab</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--gold)", marginTop: "0.25rem" }}>Open SSA Forecast →</div>
                    </div>
                  </div>
                ) : miniData.length === 0 ? (
                  /* Fallback sparkline when SSA has no data */
                  <div style={{ height: "180px", borderRadius: "8px", overflow: "hidden" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--gold)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--gold)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" hide />
                        <YAxis hide />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.4rem 0.65rem", fontSize: "0.72rem" }}>
                                <div style={{ color: "var(--gray)" }}>{label}</div>
                                <div style={{ color: "var(--gold)", fontWeight: 700 }}>₱{(payload[0].value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</div>
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="value" stroke="var(--gold)" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ height: "180px", borderRadius: "8px", overflow: "hidden" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={miniData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: "var(--gray)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtDate} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "var(--gray)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtVal} width={44} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.4rem 0.65rem", fontSize: "0.72rem" }}>
                                <div style={{ color: "var(--gray)", marginBottom: "0.2rem" }}>{fmtDate(label)}</div>
                                {payload.map((p) => p.value != null && (
                                  <div key={p.dataKey} style={{ color: p.stroke, fontWeight: 700 }}>
                                    {p.name}: {fmtVal(p.value)}
                                  </div>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <ReferenceLine x={todayStr} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 3" />
                        <Line type="monotone" dataKey="Actual" name="Actual" stroke="var(--gray)" strokeWidth={2} dot={false} connectNulls={false} />
                        <Line type="monotone" dataKey="Forecast" name="Forecast" stroke="var(--gold)" strokeWidth={2.5} strokeDasharray="6 3" dot={false} connectNulls={false} />
                        <Line type="monotone" dataKey="High" name="Upper CI" stroke="rgba(212,168,67,0.35)" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls={false} legendType="none" />
                        <Line type="monotone" dataKey="Low" name="Lower CI" stroke="rgba(212,168,67,0.35)" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls={false} legendType="none" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })()}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "1rem",
              marginTop: "1rem",
              paddingTop: "1rem",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div>
              <div style={metricLabelStyle}>Total Orders</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--white)" }}>
                {orderStats?.totalOrders ?? "—"}
              </div>
            </div>
            <div>
              <div style={metricLabelStyle}>Total Profit</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--gold)" }}>
                {salesSummary?.totalProfit != null
                  ? `₱${salesSummary.totalProfit.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Top Products */}
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--white)" }}>
              Top Products Today
            </h3>
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "var(--gold)",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              More &gt;
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {topProducts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--gray)", fontSize: "0.85rem" }}>
                — No sales data yet —
              </div>
            ) : (
              topProducts.map((p, i) => (
                <div
                  key={p.productName}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0",
                    borderBottom: i < topProducts.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--white)" }}>
                      {p.productName}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--gray)", marginTop: "0.125rem" }}>
                      {p.category}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--gold)" }}>
                      {p.totalQty} sold
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--gray)", marginTop: "0.125rem" }}>
                      ₱{p.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Key Metrics ─────────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ ...sectionTitleStyle, marginBottom: "0.75rem" }}>
          Key Metrics
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.75rem",
          }}
        >
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Total Revenue</div>
            <div style={{ ...metricValueStyle, color: salesSummary?.totalRevenue ? "var(--gold)" : "var(--gray)" }}>
              {salesSummary?.totalRevenue != null
                ? `₱${salesSummary.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "—"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Total Orders</div>
            <div style={{ ...metricValueStyle, color: orderStats?.totalOrders ? "var(--white)" : "var(--gray)" }}>
              {orderStats?.totalOrders ?? "—"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Cancelled Orders</div>
            <div style={{ ...metricValueStyle, color: orderStats?.cancelledOrders ? "var(--red)" : "var(--gray)" }}>
              {orderStats?.cancelledOrders ?? "—"}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.75rem",
            marginTop: "0.75rem",
          }}
        >
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Pending Orders</div>
            <div style={{ ...metricValueStyle, color: orderStats?.pendingOrders ? "var(--color-text-warning)" : "var(--gray)" }}>
              {orderStats?.pendingOrders ?? "—"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Completed Orders</div>
            <div style={{ ...metricValueStyle, color: orderStats?.completedOrders ? "var(--green)" : "var(--gray)" }}>
              {orderStats?.completedOrders ?? "—"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Total Profit</div>
            <div style={{ ...metricValueStyle, color: salesSummary?.totalProfit ? "var(--gold)" : "var(--gray)" }}>
              {salesSummary?.totalProfit != null
                ? `₱${salesSummary.totalProfit.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Required ─────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ ...sectionTitleStyle, marginBottom: "0.75rem" }}>
          Action Required
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "0.75rem",
          }}
        >
          <div
            style={{ ...cardStyle, borderLeft: "3px solid var(--red)", cursor: "pointer" }}
            onClick={() => router.push("/dashboard/business/inventory-v2")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--red)" }}>
              {inventoryMetrics.outOfStock}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--white)",
                marginTop: "0.25rem",
              }}
            >
              Out of Stock Items
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--gray)", marginTop: "0.25rem" }}>
              Needs restocking
            </div>
          </div>
          <div
            style={{ ...cardStyle, borderLeft: "3px solid var(--color-text-warning)", cursor: "pointer" }}
            onClick={() => router.push("/dashboard/business/inventory-v2")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-text-warning)" }}>
              {inventoryMetrics.lowStock}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--white)",
                marginTop: "0.25rem",
              }}
            >
              Low Stock Items
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--gray)", marginTop: "0.25rem" }}>
              Below minimum level
            </div>
          </div>
          <div
            style={{ ...cardStyle, borderLeft: "3px solid var(--color-text-warning)", cursor: "pointer" }}
            onClick={() => router.push("/dashboard/business/inventory-v2")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-text-warning)" }}>
              {pendingReturns}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--white)",
                marginTop: "0.25rem",
              }}
            >
              Pending Returns (RTV)
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--gray)", marginTop: "0.25rem" }}>
              Awaiting resolution
            </div>
          </div>
          <div
            style={{ ...cardStyle, borderLeft: "3px solid var(--color-text-warning)", cursor: "pointer" }}
            onClick={() => router.push("/dashboard/business/banners")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-text-warning)" }}>
              {activeBanners}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--white)",
                marginTop: "0.25rem",
              }}
            >
              Active Banners
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--gray)", marginTop: "0.25rem" }}>
              Live or visible banners
            </div>
          </div>
          <div
            style={{ ...cardStyle, borderLeft: `3px solid ${(orderStats?.expiredOrders ?? 0) > 0 ? 'var(--red)' : 'var(--border)'}`, cursor: "pointer" }}
            onClick={() => router.push("/dashboard/business/orders")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: (orderStats?.expiredOrders ?? 0) > 0 ? "var(--red)" : "var(--gray)" }}>
              {orderStats?.expiredOrders ?? 0}
            </div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--white)", marginTop: "0.25rem" }}>
              Expired Orders
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--gray)", marginTop: "0.25rem" }}>
              Pending &gt; 7 days unpaid
            </div>
          </div>
        </div>
      </div>

      {/* ── Inventory Snapshot ──────────────────────────────────────────────── */}
      <div>
        <h3 style={{ ...sectionTitleStyle, marginBottom: "0.75rem" }}>
          Inventory Snapshot
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.2fr",
            gap: "1rem",
          }}
        >
          {/* Stock Summary */}
          <div style={cardStyle}>
            <h4
              style={{
                margin: "0 0 1rem 0",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "var(--white)",
              }}
            >
              Stock Summary
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { label: "Total Materials", value: inventoryMetrics.totalMaterials },
                {
                  label: "Total Stock Units",
                  value: `${inventoryMetrics.totalStock.toLocaleString()} pcs`,
                },
                {
                  label: "Total Inventory Value",
                  value: `P${inventoryMetrics.totalValue.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}`,
                },
                {
                  label: "Stock Health Rate",
                  value: `${inventoryMetrics.healthRate.toFixed(1)}%`,
                  color: inventoryMetrics.healthRate > 80 ? "var(--green)" : "var(--color-text-warning)",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "8px",
                  }}
                >
                  <span style={{ fontSize: "0.8rem", color: "var(--gray)" }}>
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: item.color || "var(--white)",
                      fontFamily: "monospace",
                    }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(34,197,94,0.08)",
                    borderRadius: "8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--green)" }}>
                    {inventoryMetrics.healthy}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--green)", marginTop: "0.25rem" }}>
                    Healthy
                  </div>
                </div>
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(245,158,11,0.08)",
                    borderRadius: "8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-warning)" }}>
                    {inventoryMetrics.lowStock}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--color-text-warning)", marginTop: "0.25rem" }}>
                    Low Stock
                  </div>
                </div>
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(239,68,68,0.08)",
                    borderRadius: "8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--red)" }}>
                    {inventoryMetrics.outOfStock}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--red)", marginTop: "0.25rem" }}>
                    Out of Stock
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div style={cardStyle}>
            <h4
              style={{
                margin: "0 0 1rem 0",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "var(--white)",
              }}
            >
              Category Breakdown
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {inventoryMetrics.categoryBreakdown.length > 0 ? (
                inventoryMetrics.categoryBreakdown.map((cat) => {
                  const percentage =
                    inventoryMetrics.maxCategoryValue > 0
                      ? (cat.value / inventoryMetrics.maxCategoryValue) * 100
                      : 0;
                  const totalPercentage =
                    inventoryMetrics.totalValue > 0
                      ? ((cat.value / inventoryMetrics.totalValue) * 100).toFixed(0)
                      : 0;

                  return (
                    <div key={cat.name}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--white)" }}>
                          {cat.name}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--gray)" }}>
                          {totalPercentage}%
                        </span>
                      </div>
                      <ProgressBar value={percentage} />
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "0.35rem",
                          fontSize: "0.7rem",
                          color: "var(--gray)",
                        }}
                      >
                        <span>
                          P
                          {cat.value.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <span>
                          {cat.stock} pcs ({cat.materials} items)
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "var(--gray)",
                    fontSize: "0.85rem",
                  }}
                >
                  No category data available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Activity ─────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ ...sectionTitleStyle, marginBottom: "0.75rem" }}>
          Recent Activity
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          {/* Recent Orders */}
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "var(--white)" }}>
                Recent Orders
              </h4>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--gold)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                More &gt;
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {recentOrders && recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <div
                    key={String(order._id || order.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.75rem",
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: "var(--white)",
                        }}
                      >
                        #{String(order._id || order.id || "").slice(-8).toUpperCase()}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          background: `${getStatusColor(order.orderStatus || order.status)}15`,
                          color: getStatusColor(order.orderStatus || order.status),
                          border: `1px solid ${getStatusColor(order.orderStatus || order.status)}30`,
                        }}
                      >
                        {order.orderStatus || order.status}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          color: "var(--white)",
                          fontFamily: "monospace",
                        }}
                      >
                        ₱{(order.totalAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "var(--gray)" }}>
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "var(--gray)",
                    fontSize: "0.85rem",
                  }}
                >
                  — No orders yet —
                </div>
              )}
            </div>
          </div>

          {/* Recent Stock Movements */}
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "var(--white)" }}>
                Recent Stock Movements
              </h4>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--gold)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                More &gt;
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "320px", overflowY: "auto" }}>
              {recentMovements.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--gray)", fontSize: "0.85rem" }}>
                  — No stock movements yet —
                </div>
              ) : (
                recentMovements.slice(0, 5).map((movement, idx) => {
                  const typeSymbol = movement.type === "in" ? "+" : "-";
                  const typeColor  = getMovementColor(movement.type);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: "0.75rem",
                        background: "rgba(255,255,255,0.02)",
                        borderRadius: "8px",
                        borderLeft: `3px solid ${typeColor}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--white)" }}>
                          {movement.item}
                        </span>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: typeColor, fontFamily: "monospace" }}>
                          {typeSymbol}{Math.abs(movement.qty)} pcs
                        </span>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--gray)" }}>
                        {movement.label}
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "var(--gray)", marginTop: "0.15rem" }}>
                        {movement.time}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
