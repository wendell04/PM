"use client";

// DEPRECATED — replaced by Movement History tab in stocks/page.jsx
// This file is kept for reference but is no longer rendered in the UI.
// Safe to delete once the new Movement History tab is fully validated.

import CustomDropdown from "@/app/components/CustomDropdown";
import { memo, useEffect, useMemo, useState } from "react";

// ── Shared Styles ──────────────────────────────────────────────────────────────
const thStyle = {
  padding: "0.875rem 1rem",
  textAlign: "left",
  color: "var(--gray)",
  fontWeight: 700,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

function IssueTypeBadge({ type }) {
  const ISSUE_TYPES = {
    manual_sale: { label: "Manual Sale",  color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.2)"   },
    sale:        { label: "Manual Sale",  color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.2)"   },
    order_sale:  { label: "Sale",         color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.2)"   },
    damage:      { label: "Damaged",      color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)"   },
    writeoff:    { label: "Write-Off",    color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)"   },
    scrap:       { label: "Scrap",        color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.2)"  },
    production:  { label: "Production",   color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.2)"  },
    lost:        { label: "Lost",         color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.2)" },
    adjustment:  { label: "Adjustment",   color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.2)" },
  };
  const fallback = { label: "Other", color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.2)" };
  const cfg = ISSUE_TYPES[type] || fallback;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.2rem 0.6rem",
        borderRadius: "6px",
        fontSize: "0.65rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STOCK-OUT HISTORY TAB — Flat table, no over-engineered nesting
// ══════════════════════════════════════════════════════════════════════════════
function StockOutHistoryTab({ stockOuts, materials }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [page, setPage] = useState(1);

  // Calculate date range based on filter
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateFilter === "today") return { start: today, end: now };
    if (dateFilter === "week") {
      const d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: d, end: now };
    }
    if (dateFilter === "month") {
      const d = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: d, end: now };
    }
    if (dateFilter === "year") {
      const d = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
      return { start: d, end: now };
    }
    if (dateFilter === "custom" && customDateFrom && customDateTo) {
      const from = new Date(customDateFrom);
      from.setHours(0, 0, 0, 0);
      const to = new Date(customDateTo);
      to.setHours(23, 59, 59, 999);
      return { start: from, end: to };
    }
    return { start: null, end: null };
  }, [dateFilter, customDateFrom, customDateTo]);

  // Filter & sort flat list
  const filtered = useMemo(() => {
    return stockOuts
      .filter((so) => {
        const matchSearch =
          !search ||
          (so.materialName || "")
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          (so.sku || "").toLowerCase().includes(search.toLowerCase()) ||
          (so.performedBy || "").toLowerCase().includes(search.toLowerCase());
        const matchType = !typeFilter || so.issueType === typeFilter;
        const matchDate =
          !dateRange.start ||
          (new Date(so.dateIssued || so.createdAt) >= dateRange.start &&
            new Date(so.dateIssued || so.createdAt) <= dateRange.end);
        return matchSearch && matchType && matchDate;
      })
      .sort(
        (a, b) =>
          new Date(b.dateIssued || b.createdAt) -
          new Date(a.dateIssued || a.createdAt),
      );
  }, [stockOuts, search, typeFilter, dateRange]);

  useEffect(() => { setPage(1); }, [search, typeFilter, dateFilter, customDateFrom, customDateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Summary stats
  const summaryStats = useMemo(
    () => ({
      totalRecords: filtered.length,
      totalQty: filtered.reduce((s, so) => s + Math.abs(so.quantity || 0), 0),
      totalLoss: filtered
        .filter(
          (so) => so.issueType !== "manual_sale" && so.issueType !== "sale" && so.issueType !== "order_sale",
        )
        .reduce((s, so) => s + (so.totalLoss || 0), 0),
    }),
    [filtered],
  );

  const salesRevenue = filtered
    .filter(
      (so) => so.issueType === "manual_sale" || so.issueType === "sale",
    )
    .reduce((s, so) => s + (so.totalLoss || 0), 0);

  return (
    <div>
      {/* ── Summary Cards ── */}
      <div className="inventory-summary" style={{ marginBottom: "1.5rem" }}>
        <div
          className="summary-card"
          style={{
            background: "rgba(255,255,255,0.05)",
            borderColor: "rgba(255,255,255,0.15)",
          }}
        >
          <div className="summary-content">
            <span className="summary-value" style={{ color: "#E5E2E1" }}>
              {summaryStats.totalRecords}
            </span>
            <span className="summary-label">Total Records</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: "var(--gray)" }}>
              {summaryStats.totalQty} pcs
            </span>
            <span className="summary-label">Total Qty Deducted</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: salesRevenue === 0 ? "var(--gray)" : "#D4A843" }}>
              ₱{salesRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="summary-label">Total Revenue (Sales)</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: summaryStats.totalLoss === 0 ? "var(--gray)" : "#D4A843" }}>
              ₱{summaryStats.totalLoss.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="summary-label">Total Loss Value</span>
          </div>
        </div>
      </div>

      {/* ── Table + Filter container ── */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
          background: "var(--dark)",
        }}
      >
        {/* Filter toolbar */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative", flex: 1, minWidth: "200px", maxWidth: "300px" }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--gray)",
                pointerEvents: "none",
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search material, SKU…"
              style={{
                width: "100%",
                padding: "0.55rem 1rem 0.55rem 2.25rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "#E5E2E1",
                outline: "none",
                fontSize: "0.82rem",
              }}
            />
          </div>
          <CustomDropdown
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "",           label: "All Types"   },
              { value: "order_sale", label: "Sale"        },
              { value: "manual_sale",label: "Manual Sale" },
              { value: "damage",     label: "Damaged"     },
              { value: "writeoff",   label: "Write-Off"   },
              { value: "scrap",      label: "Scrap"       },
              { value: "production", label: "Production"  },
              { value: "lost",       label: "Lost"        },
              { value: "adjustment", label: "Adjustment"  },
            ]}
            placeholder="All Types"
            style={{ minWidth: "140px" }}
          />
          <CustomDropdown
            value={dateFilter}
            onChange={setDateFilter}
            options={[
              { value: "all", label: "All Time" },
              { value: "today", label: "Today" },
              { value: "week", label: "This Week" },
              { value: "month", label: "This Month" },
              { value: "year", label: "This Year" },
              { value: "custom", label: "Custom Range" },
            ]}
            placeholder="All Time"
            style={{ minWidth: "140px" }}
          />
          {dateFilter === "custom" && (
            <>
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                style={{
                  padding: "0.55rem 0.75rem",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "#E5E2E1",
                  outline: "none",
                  fontSize: "0.82rem",
                }}
              />
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                style={{
                  padding: "0.55rem 0.75rem",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "#E5E2E1",
                  outline: "none",
                  fontSize: "0.82rem",
                }}
              />
            </>
          )}
          <CustomDropdown
            value={String(rowsPerPage)}
            onChange={(v) => { setRowsPerPage(Number(v)); setPage(1); }}
            options={[
              { value: "10", label: "10 / page" },
              { value: "20", label: "20 / page" },
              { value: "50", label: "50 / page" },
              { value: "100", label: "100 / page" },
            ]}
            style={{ minWidth: "110px" }}
          />
          {filtered.length > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.25rem 0.75rem",
                background: "rgba(212,168,67,0.1)",
                border: "1px solid rgba(212,168,67,0.3)",
                borderRadius: "20px",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "#D4A843",
                whiteSpace: "nowrap",
              }}
            >
              {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "var(--gray)",
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ margin: "0 auto 1rem", opacity: 0.5 }}
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <h3
              style={{
                margin: "0 0 0.5rem",
                color: "var(--white)",
                fontSize: "1rem",
              }}
            >
              No Stock-Out Records
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              Issued items will appear here chronologically.
            </p>
          </div>
        ) : (
          <>
          <div
            style={{ overflowX: "auto" }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.82rem",
              }}
            >
              <thead
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  background: "rgba(0,0,0,0.5)",
                }}
              >
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Material</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Type</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Qty</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
                  <th style={thStyle}>Performed By</th>
                  <th style={thStyle}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((so, idx) => (
                  <tr
                    key={so.id || idx}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(255,255,255,0.02)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        color: "var(--gray)",
                        fontSize: "0.78rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(
                        so.dateIssued || so.createdAt,
                      ).toLocaleDateString("en-PH")}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "#E5E2E1",
                          fontSize: "0.85rem",
                        }}
                      >
                        {so.materialName}
                      </div>
                      {so.sku && (
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "var(--gray)",
                            fontFamily: "monospace",
                            marginTop: "0.1rem",
                          }}
                        >
                          {so.sku}
                        </div>
                      )}
                    </td>
                    <td
                      style={{ padding: "0.75rem 1rem", textAlign: "center" }}
                    >
                      <IssueTypeBadge type={so.issueType} />
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        textAlign: "center",
                        fontWeight: 700,
                        color: "#ef4444",
                      }}
                    >
                      -{Math.abs(so.quantity || 0)} {so.uom || "pcs"}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        textAlign: "right",
                        fontWeight: 700,
                        color: (so.issueType === "manual_sale" || so.issueType === "sale" || so.issueType === "order_sale") ? "#22c55e" : "#ef4444",
                        fontFamily: "monospace",
                      }}
                    >
                      ₱
                      {(so.totalLoss || 0).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        color: "#E5E2E1",
                        fontSize: "0.82rem",
                      }}
                    >
                      {so.performedBy || "—"}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        color: "var(--gray)",
                        fontSize: "0.75rem",
                        maxWidth: "200px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {so.remarks || so.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 1rem", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.8rem", color: "var(--gray)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Rows per page:
              <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }} style={{ background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--white)", padding: "0.2rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" }}>
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.65rem", color: page === 1 ? "rgba(229,226,225,0.2)" : "#E5E2E1", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: "0.78rem" }}>‹</button>
              <span style={{ minWidth: "80px", textAlign: "center" }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.65rem", color: page === totalPages ? "rgba(229,226,225,0.2)" : "#E5E2E1", cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: "0.78rem" }}>›</button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(StockOutHistoryTab);
