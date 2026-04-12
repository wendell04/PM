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

// ── Shared Styles ──────────────────────────────────────────────────────────────
const cardStyle = {
  background: "rgba(255,255,255,0.04)",
  borderRadius: "12px",
  padding: "1.25rem",
  border: "1px solid rgba(255,255,255,0.08)",
};

const sectionTitleStyle = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: "1rem",
};

const metricLabelStyle = {
  fontSize: "0.7rem",
  color: "#9ca3af",
  marginBottom: "0.25rem",
  fontWeight: 600,
};

const metricValueStyle = {
  fontSize: "1.75rem",
  fontWeight: 800,
  color: "#E5E2E1",
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
  const color = isPositive ? "#22c55e" : "#ef4444";

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
      <div style={{ textAlign: "center", color: "#6b7280" }}>
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
function ProgressBar({ value, color = "#D4A843" }) {
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
export default function DashboardOverview({ orderStats, salesSummary, inventory = [], recentOrders = [], activeBanners = 0, pendingReturns = 0, topProducts = [], recentMovements = [], onRefresh }) {
  const [chartPeriod, setChartPeriod] = useState("daily");

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
      Pending: "#f59e0b",
      Processing: "#3b82f6",
      Delivered: "#22c55e",
      Cancelled: "#ef4444",
    };
    return colors[status] || "#9ca3af";
  };

  const getMovementColor = (type) => {
    if (type === "in") return "#22c55e";
    if (type === "out") return "#ef4444";
    return "#9ca3af";
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
          <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginBottom: "0.25rem" }}>
            Home &gt; Business Insights &gt; Overview
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#E5E2E1",
            }}
          >
            Dashboard Overview
          </h2>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <select
            value={chartPeriod}
            onChange={(e) => setChartPeriod(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#E5E2E1",
              padding: "0.5rem 0.75rem",
              fontSize: "0.85rem",
              outline: "none",
            }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <button
            style={{
              padding: "0.5rem 1rem",
              background: "rgba(212,168,67,0.15)",
              border: "1px solid rgba(212,168,67,0.3)",
              borderRadius: "8px",
              color: "#D4A843",
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
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#E5E2E1" }}>
              Sales Metrics
            </h3>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <div style={metricLabelStyle}>Revenue Today</div>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                color: salesSummary?.totalRevenue ? "#D4A843" : "#6b7280",
                fontFamily: "monospace",
              }}
            >
              {salesSummary?.totalRevenue
                ? `₱${salesSummary.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "—"}
            </div>
          </div>

          <ChartPlaceholder label="SSA Sales Forecast Chart" />

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
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#E5E2E1" }}>
                {orderStats?.totalOrders ?? "—"}
              </div>
            </div>
            <div>
              <div style={metricLabelStyle}>Total Profit</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#D4A843" }}>
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
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#E5E2E1" }}>
              Top Products Today
            </h3>
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "#D4A843",
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
              <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af", fontSize: "0.85rem" }}>
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
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#E5E2E1" }}>
                      {p.productName}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "0.125rem" }}>
                      {p.category}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#D4A843" }}>
                      {p.totalQty} sold
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "0.125rem" }}>
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
            <div style={{ ...metricValueStyle, color: salesSummary?.totalRevenue ? "#D4A843" : "#6b7280" }}>
              {salesSummary?.totalRevenue != null
                ? `₱${salesSummary.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "—"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Total Orders</div>
            <div style={{ ...metricValueStyle, color: orderStats?.totalOrders ? "#E5E2E1" : "#6b7280" }}>
              {orderStats?.totalOrders ?? "—"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Cancelled Orders</div>
            <div style={{ ...metricValueStyle, color: orderStats?.cancelledOrders ? "#ef4444" : "#6b7280" }}>
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
            <div style={{ ...metricValueStyle, color: orderStats?.pendingOrders ? "#f59e0b" : "#6b7280" }}>
              {orderStats?.pendingOrders ?? "—"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Completed Orders</div>
            <div style={{ ...metricValueStyle, color: orderStats?.completedOrders ? "#22c55e" : "#6b7280" }}>
              {orderStats?.completedOrders ?? "—"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={metricLabelStyle}>Total Profit</div>
            <div style={{ ...metricValueStyle, color: salesSummary?.totalProfit ? "#D4A843" : "#6b7280" }}>
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
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "0.75rem",
          }}
        >
          <div
            style={{ ...cardStyle, borderLeft: "3px solid #ef4444", cursor: "pointer" }}
            onClick={() => (window.location.href = "/dashboard/business/inventory/stocks")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#ef4444" }}>
              {inventoryMetrics.outOfStock}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#E5E2E1",
                marginTop: "0.25rem",
              }}
            >
              Out of Stock Items
            </div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "0.25rem" }}>
              Needs restocking
            </div>
          </div>
          <div
            style={{ ...cardStyle, borderLeft: "3px solid #f59e0b", cursor: "pointer" }}
            onClick={() => (window.location.href = "/dashboard/business/inventory/stocks")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#f59e0b" }}>
              {inventoryMetrics.lowStock}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#E5E2E1",
                marginTop: "0.25rem",
              }}
            >
              Low Stock Items
            </div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "0.25rem" }}>
              Below minimum level
            </div>
          </div>
          <div
            style={{ ...cardStyle, borderLeft: "3px solid #f59e0b", cursor: "pointer" }}
            onClick={() => (window.location.href = "/dashboard/business/inventory/returns")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#f59e0b" }}>
              {pendingReturns}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#E5E2E1",
                marginTop: "0.25rem",
              }}
            >
              Pending Returns (RTV)
            </div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "0.25rem" }}>
              Awaiting resolution
            </div>
          </div>
          <div
            style={{ ...cardStyle, borderLeft: "3px solid #f59e0b", cursor: "pointer" }}
            onClick={() => (window.location.href = "/dashboard/business/banners")}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#f59e0b" }}>
              {activeBanners}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#E5E2E1",
                marginTop: "0.25rem",
              }}
            >
              Active Banners
            </div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "0.25rem" }}>
              Live or visible banners
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
                color: "#E5E2E1",
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
                  color: inventoryMetrics.healthRate > 80 ? "#22c55e" : "#f59e0b",
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
                  <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: item.color || "#E5E2E1",
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
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#22c55e" }}>
                    {inventoryMetrics.healthy}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#22c55e", marginTop: "0.25rem" }}>
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
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f59e0b" }}>
                    {inventoryMetrics.lowStock}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#f59e0b", marginTop: "0.25rem" }}>
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
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#ef4444" }}>
                    {inventoryMetrics.outOfStock}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#ef4444", marginTop: "0.25rem" }}>
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
                color: "#E5E2E1",
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
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#E5E2E1" }}>
                          {cat.name}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
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
                          color: "#9ca3af",
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
                    color: "#9ca3af",
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
              <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "#E5E2E1" }}>
                Recent Orders
              </h4>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#D4A843",
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
                          color: "#E5E2E1",
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
                          color: "#E5E2E1",
                          fontFamily: "monospace",
                        }}
                      >
                        ₱{(order.totalAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "#9ca3af" }}>
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
                    color: "#9ca3af",
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
              <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "#E5E2E1" }}>
                Recent Stock Movements
              </h4>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#D4A843",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                More &gt;
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {recentMovements.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af", fontSize: "0.85rem" }}>
                  — No stock movements yet —
                </div>
              ) : (
                recentMovements.map((movement, idx) => {
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
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#E5E2E1" }}>
                          {movement.item}
                        </span>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: typeColor, fontFamily: "monospace" }}>
                          {typeSymbol}{Math.abs(movement.qty)} pcs
                        </span>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>
                        {movement.label}
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: "0.15rem" }}>
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
