"use client";

import { useMemo, useState } from "react";

const REASON_LABELS = {
  sale: { label: "Sale", color: "#22c55e" },
  damaged: { label: "Damaged", color: "#ef4444" },
  writeoff: { label: "Write-Off", color: "#f59e0b" },
  missing: { label: "Missing", color: "#f59e0b" },
  production: { label: "Production Use", color: "#8b5cf6" },
  lost: { label: "Lost/Missing", color: "#f59e0b" },
  return: { label: "Return to Vendor", color: "#3b82f6" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "All Reasons" },
  { value: "sale", label: "Sale" },
  { value: "damaged", label: "Damaged" },
  { value: "writeoff", label: "Write-Off" },
  { value: "missing", label: "Missing" },
  { value: "production", label: "Production Use" },
  { value: "lost", label: "Lost/Missing" },
  { value: "return", label: "Return to Vendor" },
];

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

function getItemName(record, materials) {
  if (!materials || !record) return record?.inventoryId || "—";
  const found = materials.find((m) => (m._id || m.id) === record.inventoryId);
  return found?.name || record?.inventoryId || "—";
}

export default function StockOutHistoryTab({ stockOuts, materials }) {
  const [reasonFilter, setReasonFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!stockOuts) return [];
    return stockOuts.filter((r) => {
      const matchReason = reasonFilter === "all" || r.reason === reasonFilter;
      const name = getItemName(r, materials).toLowerCase();
      const matchSearch =
        !search.trim() || name.includes(search.trim().toLowerCase());
      return matchReason && matchSearch;
    });
  }, [stockOuts, reasonFilter, search, materials]);

  const totalUnits = useMemo(
    () => filtered.reduce((s, r) => s + (r.quantity || 0), 0),
    [filtered],
  );
  const totalCost = useMemo(
    () =>
      filtered.reduce(
        (s, r) =>
          s + (r.totalCostValue || (r.quantity || 0) * (r.unitCost || 0)),
        0,
      ),
    [filtered],
  );

  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#E5E2E1",
    padding: "0.5rem 0.75rem",
    fontSize: "0.82rem",
    outline: "none",
  };

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search item name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 180px", minWidth: 140 }}
        />
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          style={{ ...inputStyle, flex: "0 0 auto" }}
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Summary row */}
      {filtered.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            marginBottom: "1rem",
            padding: "0.625rem 0.875rem",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "8px",
            fontSize: "0.82rem",
          }}
        >
          <span style={{ color: "var(--gray)" }}>
            Records: <strong style={{ color: "#E5E2E1" }}>{filtered.length}</strong>
          </span>
          <span style={{ color: "var(--gray)" }}>
            Total Units Out:{" "}
            <strong style={{ color: "#ef4444" }}>{totalUnits}</strong>
          </span>
          <span style={{ color: "var(--gray)" }}>
            Est. Cost:{" "}
            <strong style={{ color: "#D4A843", fontFamily: "monospace" }}>
              ₱{totalCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </strong>
          </span>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--gray)",
            fontSize: "0.875rem",
          }}
        >
          {stockOuts?.length === 0
            ? "No stock-out history found."
            : "No records match the current filter."}
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 80px 80px 90px 110px",
              padding: "0.5rem 0.75rem",
              background: "rgba(255,255,255,0.03)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontSize: "0.7rem",
              color: "var(--gray)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <span>Item</span>
            <span style={{ textAlign: "center" }}>Reason</span>
            <span style={{ textAlign: "center" }}>Qty Out</span>
            <span style={{ textAlign: "center" }}>Unit Cost</span>
            <span style={{ textAlign: "center" }}>Total Cost</span>
            <span style={{ textAlign: "center" }}>Date</span>
          </div>
          {/* Rows */}
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {filtered.map((r, idx) => {
              const meta = REASON_LABELS[r.reason] || {
                label: r.reason || "—",
                color: "var(--gray)",
              };
              const unitCost =
                r.unitCost ||
                (r.quantity > 0 ? (r.totalCostValue || 0) / r.quantity : 0);
              const totalCostVal = r.totalCostValue || (r.quantity || 0) * unitCost;
              return (
                <div
                  key={r._id || idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px 80px 80px 90px 110px",
                    padding: "0.625rem 0.75rem",
                    borderBottom:
                      idx < filtered.length - 1
                        ? "1px solid rgba(255,255,255,0.04)"
                        : "none",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: "#E5E2E1",
                      }}
                    >
                      {getItemName(r, materials)}
                    </div>
                    {r.customerName && (
                      <div style={{ fontSize: "0.68rem", color: "var(--gray)" }}>
                        Customer: {r.customerName}
                      </div>
                    )}
                    {r.performedBy && (
                      <div style={{ fontSize: "0.68rem", color: "var(--gray)" }}>
                        By: {r.performedBy}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "999px",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        color: meta.color,
                        background: meta.color + "1a",
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#ef4444",
                    }}
                  >
                    {r.quantity || 0}
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.78rem",
                      color: "var(--gray)",
                      fontFamily: "monospace",
                    }}
                  >
                    ₱{unitCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.78rem",
                      color: "#D4A843",
                      fontFamily: "monospace",
                    }}
                  >
                    ₱
                    {totalCostVal.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.75rem",
                      color: "var(--gray)",
                    }}
                  >
                    {formatDate(r.createdAt || r.date || r.saleDate)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
