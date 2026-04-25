"use client";

import CustomDropdown from "@/app/components/CustomDropdown";
import React, { memo, useMemo, useRef, useState } from "react";

// ── Shared Styles ──────────────────────────────────────────────────────────────
const thStyle = {
  padding: "0.625rem 1rem",
  textAlign: "left",
  color: "var(--gray)",
  fontWeight: 700,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: "2px solid var(--border)",
};

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY REPORTS — Printable Letter Size
// Reports: Damage Report, Stock-Out Report, Stock Summary
// ══════════════════════════════════════════════════════════════════════════════
function InventoryReports({ materials, stockOuts }) {
  const [reportType, setReportType] = useState("damage");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const printRef = useRef(null);

  // Calculate date range
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

  // Filter stock-outs by date
  const filteredStockOuts = useMemo(() => {
    return stockOuts
      .filter((so) => {
        const soDate = new Date(so.dateIssued || so.createdAt);
        return (
          !dateRange.start ||
          (soDate >= dateRange.start && soDate <= dateRange.end)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.dateIssued || b.createdAt) -
          new Date(a.dateIssued || a.createdAt),
      );
  }, [stockOuts, dateRange]);

  // Damage Report Data
  const damageReport = useMemo(() => {
    const damages = filteredStockOuts.filter(
      (so) => so.issueType === "damage" || so.issueType === "scrap" || so.issueType === "writeoff" || so.issueType === "lost",
    );
    const grouped = {};
    damages.forEach((so) => {
      const cat =
        so.category ||
        materials?.find((m) => String(m.id ?? m._id) === String(so.inventoryId || so.materialId))?.category ||
        "Uncategorized";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(so);
    });
    const totalQty = damages.reduce(
      (s, so) => s + Math.abs(so.quantity || 0),
      0,
    );
    const totalLoss = damages.reduce((s, so) => s + (so.totalLoss || 0), 0);
    return { grouped, totalQty, totalLoss, count: damages.length };
  }, [filteredStockOuts, materials]);

  // Stock-Out Report Data
  const stockOutReport = useMemo(() => {
    const grouped = {};
    filteredStockOuts.forEach((so) => {
      const cat =
        so.category ||
        materials?.find((m) => String(m.id ?? m._id) === String(so.inventoryId || so.materialId))?.category ||
        "Uncategorized";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(so);
    });
    const totalQty = filteredStockOuts.reduce(
      (s, so) => s + Math.abs(so.quantity || 0),
      0,
    );
    // Sales are revenue, not loss
    const totalLoss = filteredStockOuts
      .filter((so) => so.issueType !== "manual_sale" && so.issueType !== "sale")
      .reduce((s, so) => s + (so.totalLoss || 0), 0);
    const totalRevenue = filteredStockOuts
      .filter((so) => so.issueType === "manual_sale" || so.issueType === "sale")
      .reduce((s, so) => s + (so.totalLoss || 0), 0);
    return {
      grouped,
      totalQty,
      totalLoss,
      totalRevenue,
      count: filteredStockOuts.length,
    };
  }, [filteredStockOuts, materials]);

  // Stock Summary Data
  const stockSummary = useMemo(() => {
    const items = (materials || [])
      .filter((m) => {
        if (m.parentId) return false;
        if (m.hasVariants) {
          const children = (materials || []).filter((c) => String(c.parentId) === String(m.id ?? m._id));
          return children.some((c) =>
            c.batches?.some(
              (b) =>
                (b.originalQty || b.qtyReceived || b.goodQty || b.qtyGood || 0) >
                0,
            ),
          );
        }
        return m.batches?.some(
          (b) =>
            (b.originalQty || b.qtyReceived || b.goodQty || b.qtyGood || 0) > 0,
        );
      })
      .map((m) => {
        const hasChildren = m.hasVariants;
        let goodStock, damaged, totalStock, avgCost, goodsValue, damageValue;

        if (hasChildren) {
          const children = materials.filter((c) => String(c.parentId) === String(m.id ?? m._id));
          const allChildrenBatches = children.flatMap((c) => c.batches || []);
          goodStock = allChildrenBatches.reduce((s, b) => s + (b.remainingQty || 0), 0);
          damaged = allChildrenBatches.reduce((s, b) => s + (b.damagedQty || 0), 0);
          totalStock = goodStock + damaged;
          avgCost =
            allChildrenBatches.length > 0
              ? allChildrenBatches.reduce((s, b) => s + (b.unitCost || 0), 0) / allChildrenBatches.length
              : m.baseCost || m.averageCost || 0;
        } else {
          const batches = m.batches || [];
          goodStock = batches.reduce((s, b) => s + (b.remainingQty || 0), 0);
          damaged = batches.reduce((s, b) => s + (b.damagedQty || 0), 0);
          totalStock = goodStock + damaged;
          avgCost =
            batches.length > 0
              ? batches.reduce((s, b) => s + (b.unitCost || 0), 0) / batches.length
              : m.baseCost || m.averageCost || 0;
        }

        goodsValue = goodStock * avgCost;
        damageValue = damaged * avgCost;
        return { ...m, goodStock, damaged, totalStock, avgCost, goodsValue, damageValue };
      });
    const totalGood = items.reduce((s, i) => s + i.goodStock, 0);
    const totalDamaged = items.reduce((s, i) => s + i.damaged, 0);
    const totalValue = items.reduce((s, i) => s + i.goodsValue, 0);
    const totalDamageValue = items.reduce((s, i) => s + i.damageValue, 0);
    return { items, totalGood, totalDamaged, totalValue, totalDamageValue };
  }, [materials]);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>${reportType === "damage" ? "Damage Report" : reportType === "stockout" ? "Stock-Out Report" : "Stock Summary Report"}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 1.5in; color: #111827; }
            h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
            .subtitle { font-size: 0.85rem; color: #6b7280; margin-bottom: 1.5rem; }
            table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
            th { padding: 0.5rem 0.75rem; text-align: left; font-weight: 700; font-size: 0.65rem; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; background: #f9fafb; }
            td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f3f4f6; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .font-mono { font-family: 'Courier New', monospace; }
            .summary { display: flex; gap: 2rem; margin-bottom: 1.5rem; }
            .summary-item { padding: 0.75rem 1rem; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
            .summary-label { font-size: 0.65rem; color: #6b7280; text-transform: uppercase; font-weight: 700; }
            .summary-value { font-size: 1.2rem; font-weight: 800; font-family: 'Courier New', monospace; }
            .category-header { background: #f3f4f6; font-weight: 700; }
            @media print { body { margin: 1.5in; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const reportTitle =
    reportType === "damage"
      ? "Damage Report"
      : reportType === "stockout"
        ? "Stock-Out Report"
        : "Stock Summary Report";
  const dateLabel =
    dateFilter === "all"
      ? "All Time"
      : dateFilter === "today"
        ? "Today"
        : dateFilter === "week"
          ? "This Week"
          : dateFilter === "month"
            ? "This Month"
            : dateFilter === "year"
              ? "This Year"
              : `${customDateFrom} to ${customDateTo}`;

  return (
    <div>
      {/* ── Toolbar  */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.5rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <CustomDropdown
          value={reportType}
          onChange={setReportType}
          options={[
            { value: "damage", label: "Damage Report" },
            { value: "stockout", label: "Stock-Out Report" },
            { value: "summary", label: "Stock Summary Report" },
          ]}
          placeholder="Select Report"
          style={{ minWidth: "180px" }}
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
                padding: "0.6rem 0.75rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "#E5E2E1",
                outline: "none",
              }}
            />
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              style={{
                padding: "0.6rem 0.75rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "#E5E2E1",
                outline: "none",
              }}
            />
          </>
        )}
        <button
          onClick={handlePrint}
          style={{
            padding: "0.6rem 1.25rem",
            background: "var(--gold)",
            border: "none",
            borderRadius: "8px",
            color: "#000",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print Report
        </button>
      </div>

      {/* ── Report Content (for printing) ── */}
      <div ref={printRef} style={{ display: "none" }}>
        {/* This content is cloned to print window */}
      </div>

      {/* ── Report Preview ── */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
          background: "var(--dark)",
        }}
      >
        {/* Report Header */}
        <div
          style={{
            padding: "1.5rem 2rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#E5E2E1",
            }}
          >
            {reportTitle}
          </h2>
          <p
            style={{
              margin: "0.25rem 0 0 0",
              fontSize: "0.8rem",
              color: "var(--gray)",
            }}
          >
            Date Range: {dateLabel} | Generated:{" "}
            {new Date().toLocaleDateString("en-PH", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Damage Report */}
        {reportType === "damage" && (
          <div style={{ padding: "1.5rem 2rem" }}>
            {/* Summary */}
            <div
              className="inventory-summary"
              style={{ marginBottom: "1.5rem" }}
            >
              <div className="summary-card summary-card-danger">
                <div className="summary-content">
                  <span className="summary-value">
                    {damageReport.totalQty} pcs
                  </span>
                  <span className="summary-label">Total Damaged</span>
                </div>
              </div>
              <div
                className="summary-card"
                style={{
                  background: "rgba(212,168,67,0.08)",
                  borderColor: "rgba(212,168,67,0.3)",
                }}
              >
                <div className="summary-content">
                  <span className="summary-value" style={{ color: "#D4A843" }}>
                    ₱
                    {damageReport.totalLoss.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="summary-label">Total Loss Value</span>
                </div>
              </div>
              <div
                className="summary-card"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderColor: "rgba(255,255,255,0.15)",
                }}
              >
                <div className="summary-content">
                  <span className="summary-value" style={{ color: "#E5E2E1" }}>
                    {damageReport.count}
                  </span>
                  <span className="summary-label">Transactions</span>
                </div>
              </div>
            </div>

            {/* Table */}
            {Object.keys(damageReport.grouped).length === 0 ? (
              <div
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "var(--gray)",
                }}
              >
                No damage records for this period.
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.8rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      borderBottom: "2px solid var(--border)",
                    }}
                  >
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Material</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Type</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Qty</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      Unit Cost
                    </th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      Loss Value
                    </th>
                    <th style={{ ...thStyle, textAlign: "center" }}>
                      Performed By
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(damageReport.grouped).map(
                    ([cat, records]) => (
                      <React.Fragment key={cat}>
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              padding: "0.5rem 0.75rem",
                              background: "rgba(212,168,67,0.06)",
                              fontWeight: 700,
                              color: "#D4A843",
                              fontSize: "0.75rem",
                              textTransform: "uppercase",
                            }}
                          >
                            {cat}
                          </td>
                        </tr>
                        {records.map((so, idx) => (
                          <tr
                            key={so.id}
                            style={{
                              background:
                                idx % 2 === 0
                                  ? "transparent"
                                  : "rgba(255,255,255,0.01)",
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                            }}
                          >
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                color: "var(--gray)",
                              }}
                            >
                              {new Date(
                                so.dateIssued || so.createdAt,
                              ).toLocaleDateString("en-PH")}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                fontWeight: 600,
                                color: "#E5E2E1",
                              }}
                            >
                              {so.materialName}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  padding: "0.15rem 0.5rem",
                                  borderRadius: "4px",
                                  background:
                                    so.issueType === "damage"
                                      ? "rgba(239,68,68,0.15)"
                                      : "rgba(249,115,22,0.15)",
                                  color:
                                    so.issueType === "damage"
                                      ? "#ef4444"
                                      : "#f97316",
                                }}
                              >
                                {so.issueType === "damage" ? "Damage" : "Scrap"}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "center",
                                fontWeight: 700,
                                color: "#ef4444",
                              }}
                            >
                              -{Math.abs(so.quantity || 0)} {so.uom || "pcs"}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "right",
                                color: "#E5E2E1",
                                fontFamily: "monospace",
                              }}
                            >
                              ₱{(so.unitCost || 0).toFixed(2)}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "right",
                                fontWeight: 700,
                                color: "#ef4444",
                                fontFamily: "monospace",
                              }}
                            >
                              ₱{(so.totalLoss || 0).toFixed(2)}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "center",
                                color: "#E5E2E1",
                                fontSize: "0.75rem",
                              }}
                            >
                              {so.performedBy || "Unknown"}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ),
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Stock-Out Report */}
        {reportType === "stockout" && (
          <div style={{ padding: "1.5rem 2rem" }}>
            <div
              className="inventory-summary"
              style={{ marginBottom: "1.5rem" }}
            >
              <div className="summary-card summary-card-danger">
                <div className="summary-content">
                  <span className="summary-value">
                    {stockOutReport.totalQty} pcs
                  </span>
                  <span className="summary-label">Total Qty Deducted</span>
                </div>
              </div>
              <div
                className="summary-card"
                style={{
                  background: "rgba(34,197,94,0.08)",
                  borderColor: "rgba(34,197,94,0.3)",
                }}
              >
                <div className="summary-content">
                  <span className="summary-value" style={{ color: "#22c55e" }}>
                    ₱
                    {(stockOutReport.totalRevenue || 0).toLocaleString(
                      "en-PH",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )}
                  </span>
                  <span className="summary-label">Revenue (Sales)</span>
                </div>
              </div>
              <div
                className="summary-card"
                style={{
                  background: "rgba(212,168,67,0.08)",
                  borderColor: "rgba(212,168,67,0.3)",
                }}
              >
                <div className="summary-content">
                  <span className="summary-value" style={{ color: "#D4A843" }}>
                    ₱
                    {stockOutReport.totalLoss.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="summary-label">Loss Value (Non-Sales)</span>
                </div>
              </div>
              <div
                className="summary-card"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderColor: "rgba(255,255,255,0.15)",
                }}
              >
                <div className="summary-content">
                  <span className="summary-value" style={{ color: "#E5E2E1" }}>
                    {stockOutReport.count}
                  </span>
                  <span className="summary-label">Transactions</span>
                </div>
              </div>
            </div>

            {Object.keys(stockOutReport.grouped).length === 0 ? (
              <div
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "var(--gray)",
                }}
              >
                No stock-out records for this period.
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.8rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      borderBottom: "2px solid var(--border)",
                    }}
                  >
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Material</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Type</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Qty</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      Loss Value
                    </th>
                    <th style={{ ...thStyle, textAlign: "center" }}>
                      Performed By
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stockOutReport.grouped).map(
                    ([cat, records]) => (
                      <React.Fragment key={cat}>
                        <tr>
                          <td
                            colSpan={6}
                            style={{
                              padding: "0.5rem 0.75rem",
                              background: "rgba(212,168,67,0.06)",
                              fontWeight: 700,
                              color: "#D4A843",
                              fontSize: "0.75rem",
                              textTransform: "uppercase",
                            }}
                          >
                            {cat}
                          </td>
                        </tr>
                        {records.map((so, idx) => (
                          <tr
                            key={so.id}
                            style={{
                              background:
                                idx % 2 === 0
                                  ? "transparent"
                                  : "rgba(255,255,255,0.01)",
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                            }}
                          >
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                color: "var(--gray)",
                              }}
                            >
                              {new Date(
                                so.dateIssued || so.createdAt,
                              ).toLocaleDateString("en-PH")}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                fontWeight: 600,
                                color: "#E5E2E1",
                              }}
                            >
                              {so.materialName}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "center",
                              }}
                            >
                              {(() => {
                                const typeMap = {
                                  manual_sale: {
                                    label: "Sale",
                                    color: "#22c55e",
                                    bg: "rgba(34,197,94,0.15)",
                                  },
                                  sale: {
                                    label: "Sale",
                                    color: "#22c55e",
                                    bg: "rgba(34,197,94,0.15)",
                                  },
                                  damage: {
                                    label: "Damage",
                                    color: "#ef4444",
                                    bg: "rgba(239,68,68,0.15)",
                                  },
                                  scrap: {
                                    label: "Scrap",
                                    color: "#f97316",
                                    bg: "rgba(249,115,22,0.15)",
                                  },
                                  lost: {
                                    label: "Lost",
                                    color: "#f59e0b",
                                    bg: "rgba(245,158,11,0.15)",
                                  },
                                  production: {
                                    label: "Production",
                                    color: "#8b5cf6",
                                    bg: "rgba(139,92,246,0.15)",
                                  },
                                  adjustment: {
                                    label: "Adjustment",
                                    color: "#9ca3af",
                                    bg: "rgba(156,163,175,0.15)",
                                  },
                                };
                                const t = typeMap[so.issueType] || {
                                  label: so.issueType,
                                  color: "#9ca3af",
                                  bg: "rgba(156,163,175,0.15)",
                                };
                                return (
                                  <span
                                    style={{
                                      fontSize: "0.65rem",
                                      fontWeight: 700,
                                      padding: "0.15rem 0.5rem",
                                      borderRadius: "4px",
                                      background: t.bg,
                                      color: t.color,
                                    }}
                                  >
                                    {t.label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "center",
                                fontWeight: 700,
                                color: "#ef4444",
                              }}
                            >
                              -{Math.abs(so.quantity || 0)} {so.uom || "pcs"}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "right",
                                fontWeight: 700,
                                color: "#ef4444",
                                fontFamily: "monospace",
                              }}
                            >
                              ₱{(so.totalLoss || 0).toFixed(2)}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem 0.75rem",
                                textAlign: "center",
                                color: "#E5E2E1",
                                fontSize: "0.75rem",
                              }}
                            >
                              {so.performedBy || "Unknown"}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ),
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Stock Summary Report */}
        {reportType === "summary" && (
          <div style={{ padding: "1.5rem 2rem" }}>
            <div
              className="inventory-summary"
              style={{
                marginBottom: "1.5rem",
                gridTemplateColumns: "repeat(4, 1fr)",
              }}
            >
              <div
                className="summary-card"
                style={{
                  background: "rgba(34,197,94,0.08)",
                  borderColor: "rgba(34,197,94,0.3)",
                }}
              >
                <div className="summary-content">
                  <span className="summary-value" style={{ color: "#22c55e" }}>
                    {stockSummary.totalGood} pcs
                  </span>
                  <span className="summary-label" style={{ color: "#22c55e" }}>
                    Total Good Stock
                  </span>
                </div>
              </div>
              <div className="summary-card summary-card-danger">
                <div className="summary-content">
                  <span className="summary-value">
                    {stockSummary.totalDamaged} pcs
                  </span>
                  <span className="summary-label">Total Damaged</span>
                </div>
              </div>
              <div
                className="summary-card"
                style={{
                  background: "rgba(212,168,67,0.08)",
                  borderColor: "rgba(212,168,67,0.3)",
                }}
              >
                <div className="summary-content">
                  <span className="summary-value" style={{ color: "#D4A843" }}>
                    ₱
                    {stockSummary.totalValue.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="summary-label">Goods Value</span>
                </div>
              </div>
              <div className="summary-card summary-card-danger">
                <div className="summary-content">
                  <span className="summary-value" style={{ color: "#ef4444" }}>
                    ₱
                    {stockSummary.totalDamageValue.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="summary-label">Damage Value</span>
                </div>
              </div>
            </div>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    borderBottom: "2px solid var(--border)",
                  }}
                >
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Material Name</th>
                  <th style={thStyle}>Category</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>
                    Good Stock
                  </th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Damaged</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Unit Cost</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>
                    Goods Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {stockSummary.items.map((item, idx) => (
                  <tr
                    key={String(item.id ?? item._id ?? idx)}
                    style={{
                      background:
                        idx % 2 === 0
                          ? "transparent"
                          : "rgba(255,255,255,0.01)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        fontFamily: "monospace",
                        color: "#D4A843",
                        fontSize: "0.75rem",
                      }}
                    >
                      {item.sku || "—"}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        fontWeight: 600,
                        color: "#E5E2E1",
                      }}
                    >
                      {item.name}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        color: "var(--gray)",
                        fontSize: "0.75rem",
                      }}
                    >
                      {item.category || "—"}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "center",
                        fontWeight: 700,
                        color: "#22c55e",
                      }}
                    >
                      {item.goodStock}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "center",
                        fontWeight: 700,
                        color: item.damaged > 0 ? "#ef4444" : "#6b7280",
                      }}
                    >
                      {item.damaged}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "center",
                        fontWeight: 700,
                        color: "#E5E2E1",
                      }}
                    >
                      {item.totalStock}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "right",
                        color: "#D4A843",
                        fontFamily: "monospace",
                      }}
                    >
                      ₱{item.avgCost.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "right",
                        fontWeight: 700,
                        color: "#E5E2E1",
                        fontFamily: "monospace",
                      }}
                    >
                      ₱{item.goodsValue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(InventoryReports);
