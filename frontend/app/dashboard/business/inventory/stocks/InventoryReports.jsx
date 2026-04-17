"use client";

import { useMemo, useState } from "react";

const REASON_LABELS = {
  sale: "Sale",
  damaged: "Damaged",
  writeoff: "Write-Off",
  missing: "Missing",
  production: "Production Use",
  lost: "Lost/Missing",
  return: "Return to Vendor",
};

function formatDate(val) {
  if (!val) return "—";
  const d = new Date(val);
  return isNaN(d)
    ? "—"
    : d.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "10px",
        padding: "1rem 1.25rem",
        flex: "1 1 160px",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          color: "var(--gray)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "0.375rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          color: color || "#E5E2E1",
          fontFamily: "monospace",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.25rem" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function InventoryReports({ materials, stockOuts }) {
  const [reasonFilter, setReasonFilter] = useState("all");

  const safeOuts = useMemo(() => stockOuts || [], [stockOuts]);
  const safeMats = useMemo(() => materials || [], [materials]);

  const filtered = useMemo(
    () =>
      reasonFilter === "all"
        ? safeOuts
        : safeOuts.filter((r) => r.reason === reasonFilter),
    [safeOuts, reasonFilter],
  );

  // Summary metrics
  const totalStockOut = useMemo(
    () => filtered.reduce((s, r) => s + (r.quantity || 0), 0),
    [filtered],
  );
  const totalCostOut = useMemo(
    () =>
      filtered.reduce(
        (s, r) =>
          s + (r.totalCostValue || (r.quantity || 0) * (r.unitCost || 0)),
        0,
      ),
    [filtered],
  );
  const totalItems = safeMats.filter((m) => !m.hasVariants).length;
  const lowStockItems = safeMats.filter(
    (m) =>
      !m.hasVariants && (m.stockQty || 0) <= (m.minStockLevel || 0),
  ).length;
  const zeroStockItems = safeMats.filter(
    (m) => !m.hasVariants && (m.stockQty || 0) === 0,
  ).length;

  // Per-reason breakdown
  const byReason = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const key = r.reason || "unknown";
      if (!map[key]) map[key] = { qty: 0, cost: 0 };
      map[key].qty += r.quantity || 0;
      map[key].cost += r.totalCostValue || (r.quantity || 0) * (r.unitCost || 0);
    });
    return Object.entries(map).sort((a, b) => b[1].qty - a[1].qty);
  }, [filtered]);

  // Top consumed items
  const topItems = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const key = r.inventoryId || "unknown";
      if (!map[key]) map[key] = { inventoryId: key, qty: 0, cost: 0 };
      map[key].qty += r.quantity || 0;
      map[key].cost += r.totalCostValue || (r.quantity || 0) * (r.unitCost || 0);
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [filtered]);

  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#E5E2E1",
    padding: "0.5rem 0.75rem",
    fontSize: "0.82rem",
    outline: "none",
  };

  const labelStyle = {
    fontSize: "0.72rem",
    color: "var(--gray)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.5rem",
    display: "block",
  };

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Filter */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          alignItems: "center",
        }}
      >
        <label style={{ ...labelStyle, marginBottom: 0 }}>Filter by Reason:</label>
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          style={inputStyle}
        >
          <option value="all">All</option>
          {Object.entries(REASON_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <SummaryCard label="Total Items" value={totalItems} sub="active inventory" />
        <SummaryCard
          label="Low Stock"
          value={lowStockItems}
          sub="at or below reorder point"
          color={lowStockItems > 0 ? "#f59e0b" : "#22c55e"}
        />
        <SummaryCard
          label="Zero Stock"
          value={zeroStockItems}
          sub="fully depleted"
          color={zeroStockItems > 0 ? "#ef4444" : "#22c55e"}
        />
        <SummaryCard
          label="Units Issued"
          value={totalStockOut}
          sub="filtered period"
          color="#ef4444"
        />
        <SummaryCard
          label="Cost of Issues"
          value={`₱${totalCostOut.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
          sub="filtered period"
          color="#D4A843"
        />
      </div>

      {/* Two-column: by reason + top items */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* By reason */}
        <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden" }}>
          <div
            style={{
              padding: "0.625rem 0.875rem",
              background: "rgba(255,255,255,0.03)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Issues by Reason
          </div>
          {byReason.length === 0 ? (
            <div style={{ padding: "1.5rem", color: "var(--gray)", fontSize: "0.82rem", textAlign: "center" }}>
              No data.
            </div>
          ) : (
            byReason.map(([reason, { qty, cost }]) => (
              <div
                key={reason}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 60px 1fr",
                  padding: "0.5rem 0.875rem",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  alignItems: "center",
                  fontSize: "0.82rem",
                }}
              >
                <span style={{ color: "#E5E2E1" }}>{REASON_LABELS[reason] || reason}</span>
                <span style={{ color: "#ef4444", fontWeight: 700, textAlign: "center" }}>
                  {qty}
                </span>
                <span style={{ color: "#D4A843", fontFamily: "monospace", textAlign: "right", fontSize: "0.75rem" }}>
                  ₱{cost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Top consumed items */}
        <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden" }}>
          <div
            style={{
              padding: "0.625rem 0.875rem",
              background: "rgba(255,255,255,0.03)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Top 10 Consumed Items
          </div>
          {topItems.length === 0 ? (
            <div style={{ padding: "1.5rem", color: "var(--gray)", fontSize: "0.82rem", textAlign: "center" }}>
              No data.
            </div>
          ) : (
            topItems.map((entry, idx) => {
              const mat = safeMats.find((m) => (m._id || m.id) === entry.inventoryId);
              return (
                <div
                  key={entry.inventoryId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1fr 50px",
                    padding: "0.5rem 0.875rem",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    alignItems: "center",
                    fontSize: "0.82rem",
                  }}
                >
                  <span style={{ color: "var(--gray)", fontSize: "0.72rem" }}>#{idx + 1}</span>
                  <span style={{ color: "#E5E2E1" }}>{mat?.name || entry.inventoryId}</span>
                  <span style={{ color: "#ef4444", fontWeight: 700, textAlign: "right" }}>{entry.qty}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
