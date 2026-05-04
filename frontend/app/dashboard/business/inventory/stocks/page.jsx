"use client";

/**
 * STOCKS PAGE
 *
 * SAP-Grade Inventory Module — Phase 3
 *
 * Purpose: Manage stock/inventory levels
 * - Goods Stock Overview (aggregated, with variant support)
 * - Actual Stock (SAP MMBE-style: Unrestricted / Blocked / Batch FIFO view)
 * - Stock-Out History (Goods Issue log)
 */

import CustomDropdown from "@/app/components/CustomDropdown";
import { useAuth } from "@/app/context/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { fetchBadOrders } from "@/lib/badOrdersApi";
import {
  adjustInventoryStock,
  deleteInventory,
  fetchAllStockHistory,
  fetchInventory,
} from "@/lib/inventoryApi";
import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ActualStockTab from "./ActualStockTab";
import StockOutHistoryTab from "./StockOutHistoryTab";

const InventoryReports = dynamic(() => import("./InventoryReports"), {
  ssr: false,
});
const StockReductionModal = dynamic(() => import("./StockReductionModal"), {
  ssr: false,
});

// ── Issue Type Config ──────────────────────────────────────────────────────────
const ISSUE_TYPES = {
  sale: {
    label: "Sale",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.2)",
  },
  manual_sale: {
    label: "Sale",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.2)",
  },
  damage: {
    label: "Damage",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.2)",
  },
  scrap: {
    label: "Scrap",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.2)",
  },
  production: {
    label: "Production Use",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.1)",
    border: "rgba(139,92,246,0.2)",
  },
  lost: {
    label: "Lost/Missing",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.2)",
  },
  return: {
    label: "Return to Vendor",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.1)",
    border: "rgba(59,130,246,0.2)",
  },
  adjustment: {
    label: "Adjustment",
    color: "#9ca3af",
    bg: "rgba(156,163,175,0.1)",
    border: "rgba(156,163,175,0.2)",
  },
};

// ── Shared Styles ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#E5E2E1",
  padding: "0.625rem 0.75rem",
  fontSize: "0.85rem",
  outline: "none",
};

const thStyle = {
  padding: "0.875rem 1rem",
  textAlign: "left",
  color: "var(--gray)",
  fontWeight: 700,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

function normalizeStockBadOrder(r) {
  const rawMid = r.materialId ?? r.inventoryId;
  const materialId = rawMid != null ? String(rawMid) : "";
  const qty = Number(r.quantity ?? r.qty ?? 0) || 0;
  return {
    ...r,
    materialId,
    qty,
    type: r.damageType || r.type || "damage",
    totalValue: Number(r.totalLoss ?? r.totalValue ?? 0) || 0,
    status: (r.status || "pending").toLowerCase(),
  };
}

// ── Reusable Input Components ──────────────────────────────────────────────────
function IntInput({
  value,
  onChange,
  min = 0,
  max,
  placeholder,
  style,
  disabled,
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d+$/.test(v)) {
          const n = v === "" ? 0 : parseInt(v, 10);
          if (max !== undefined && n > max) return;
          if (n < min) return;
          onChange(v);
        }
      }}
      onKeyDown={(e) =>
        ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()
      }
      onWheel={(e) => document.activeElement === e.target && e.target.blur()}
    />
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────────
function StatusBadge({ stock, minStock, procurementType }) {
  if (procurementType === "on-demand") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          fontSize: "0.7rem",
          fontWeight: 700,
          color: "#818cf8",
          textTransform: "uppercase",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        On-Demand
      </span>
    );
  }
  if (stock === 0) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          fontSize: "0.7rem",
          fontWeight: 700,
          color: "#ef4444",
          textTransform: "uppercase",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Out of Stock
      </span>
    );
  }
  if (stock < (minStock || 10)) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          fontSize: "0.7rem",
          fontWeight: 700,
          color: "#f59e0b",
          textTransform: "uppercase",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Low Stock
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        fontSize: "0.7rem",
        fontWeight: 700,
        color: "#22c55e",
        textTransform: "uppercase",
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12l3 3 5-5" />
      </svg>
      Healthy
    </span>
  );
}

function IssueTypeBadge({ type }) {
  const cfg = ISSUE_TYPES[type] || ISSUE_TYPES.adjustment;
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

// ── Chevron Icon ───────────────────────────────────────────────────────────────
function ChevronIcon({ open }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 0.2s",
      }}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ── Batch Age Helper ───────────────────────────────────────────────────────────
function getBatchAgeDays(dateReceived) {
  if (!dateReceived) return null;
  const diffMs = Date.now() - new Date(dateReceived).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function BatchAgePill({ dateReceived }) {
  const days = getBatchAgeDays(dateReceived);
  if (days === null)
    return <span style={{ color: "var(--gray)", fontSize: "0.72rem" }}>—</span>;

  let color = "#22c55e";
  if (days > 180) color = "#ef4444";
  else if (days > 90) color = "#f59e0b";

  return (
    <span
      style={{
        fontSize: "0.68rem",
        fontWeight: 700,
        padding: "0.15rem 0.45rem",
        borderRadius: "4px",
        background: `${color}15`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {days}d
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STOCK OVERVIEW TAB (Goods Stock)
// ══════════════════════════════════════════════════════════════════════════════
function StockOverviewTab({ materials, onIssueStock, onDeleteZeroStock }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const categories = useMemo(() => {
    const cats = new Set();
    materials.forEach((m) => {
      if (m.category) cats.add(m.category);
    });
    return [...cats].sort();
  }, [materials]);

  const groupedMaterials = useMemo(() => {
    const parents = materials.filter((m) => m.hasVariants && !m.parentId);
    const childrenMap = new Map();
    materials
      .filter((m) => m.parentId)
      .forEach((child) => {
        const key = String(child.parentId);
        if (!childrenMap.has(key)) childrenMap.set(key, []);
        childrenMap.get(key).push(child);
      });
    const standalone = materials.filter((m) => !m.hasVariants && !m.parentId);
    return { parents, childrenMap, standalone };
  }, [materials]);

  const toggleExpand = (id) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // FIX: Updated logic to prioritize remainingQty if set, otherwise fallback
  const getStock = (m) => {
    if (m.batches && Array.isArray(m.batches) && m.batches.length > 0) {
      return m.batches.reduce(
        (s, b) =>
          s +
          (b.remainingQty != null
            ? b.remainingQty
            : (b.goodQty ?? b.qtyGood ?? 0)),
        0,
      );
    }
    return m.stockQty || 0;
  };

  const matchesFilters = (m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      (m.sku || "").toLowerCase().includes(q);
    const matchCat = !categoryFilter || m.category === categoryFilter;
    const stock = getStock(m);
    const matchStatus =
      !statusFilter ||
      (() => {
        if (statusFilter === "out-of-stock")
          return stock === 0 && m.procurementType !== "on-demand";
        if (statusFilter === "low-stock")
          return (
            stock > 0 &&
            stock < (m.minStock || 10) &&
            m.procurementType !== "on-demand"
          );
        if (statusFilter === "healthy") return stock >= (m.minStock || 10);
        if (statusFilter === "on-demand")
          return m.procurementType === "on-demand";
        return true;
      })();

    // Logic: Show item if stock > 0 OR if it has history (batches)
    const hasHistory = m.batches && m.batches.length > 0;
    const isVisible = stock > 0 || hasHistory;

    return matchSearch && matchCat && matchStatus && isVisible;
  };

  const filteredRows = useMemo(() => {
    const rows = [];
    groupedMaterials.standalone.filter(matchesFilters).forEach((m) => {
      rows.push({ type: "standalone", item: { ...m, stockQty: getStock(m) } });
    });
    groupedMaterials.parents.forEach((parent) => {
      const children =
        groupedMaterials.childrenMap.get(String(parent.id ?? parent._id)) || [];
      const parentMatches = matchesFilters(parent);
      const displayChildren = children.map((c) => ({
        ...c,
        stockQty: getStock(c),
      }));
      const matchingChildren = displayChildren.filter(matchesFilters);
      if (parentMatches || matchingChildren.length > 0) {
        rows.push({
          type: "parent",
          item: parent,
          children:
            matchingChildren.length > 0 ? matchingChildren : displayChildren,
        });
      }
    });
    rows.sort((a, b) => {
      const mA = a.item,
        mB = b.item;
      const aCrit =
        mA.stockQty === 0 && mA.procurementType !== "on-demand"
          ? 0
          : mA.stockQty < (mA.minStock || 10) &&
              mA.procurementType !== "on-demand"
            ? 1
            : 2;
      const bCrit =
        mB.stockQty === 0 && mB.procurementType !== "on-demand"
          ? 0
          : mB.stockQty < (mB.minStock || 10) &&
              mB.procurementType !== "on-demand"
            ? 1
            : 2;
      return aCrit - bCrit || mA.name.localeCompare(mB.name);
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedMaterials, search, categoryFilter, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const pagedRows = filteredRows.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  const totalStock = materials
    .filter((m) => !m.parentId && m.procurementType !== "on-demand")
    .reduce((sum, m) => {
      if (m.hasVariants) {
        const children = materials.filter(
          (c) => c.parentId === (m.id ?? m._id),
        );
        return sum + children.reduce((cSum, c) => cSum + getStock(c), 0);
      }
      return sum + getStock(m);
    }, 0);

  const outOfStock = materials
    .filter((m) => m.procurementType !== "on-demand")
    .filter((m) => {
      // Only count items that were actually stocked in (have batch data)
      const hasBatchData =
        m.batches &&
        m.batches.length > 0 &&
        m.batches.some(
          (b) =>
            (b.originalQty || b.qtyReceived || b.goodQty || b.qtyGood || 0) > 0,
        );
      if (!hasBatchData) return false;
      if (!m.parentId && !m.hasVariants) return getStock(m) === 0;
      if (m.parentId) return getStock(m) === 0;
      return false;
    }).length;

  const lowStock = materials
    .filter((m) => !m.parentId && m.procurementType !== "on-demand")
    .filter((m) => {
      const stock = getStock(m);
      return stock > 0 && stock <= (m.minStock || 0);
    }).length;

  const totalValue = materials
    .filter((m) => !m.parentId && m.procurementType !== "on-demand")
    .reduce((sum, m) => {
      if (m.hasVariants) {
        const children = materials.filter(
          (c) => c.parentId === (m.id ?? m._id),
        );
        return (
          sum +
          children.reduce(
            (cs, c) => cs + getStock(c) * (c.baseCost || c.averageCost || 0),
            0,
          )
        );
      }
      return sum + getStock(m) * (m.baseCost || m.averageCost || 0);
    }, 0);

  return (
    <div>
      {/* Summary Cards */}
      <div className="inventory-summary" style={{ marginBottom: "1.5rem" }}>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value" style={{ color: "#E5E2E1" }}>
              {totalStock}
            </span>
            <span className="summary-label">Total Stock</span>
          </div>
        </div>
        <div
          className={
            outOfStock === 0
              ? "summary-card"
              : "summary-card summary-card-danger"
          }
        >
          <div className="summary-content">
            <span
              className="summary-value"
              style={outOfStock === 0 ? { color: "var(--gray)" } : {}}
            >
              {outOfStock}
            </span>
            <span className="summary-label">Out of Stock</span>
          </div>
        </div>
        <div
          className={
            lowStock === 0
              ? "summary-card"
              : "summary-card summary-card-warning"
          }
        >
          <div className="summary-content">
            <span
              className="summary-value"
              style={lowStock === 0 ? { color: "var(--gray)" } : {}}
            >
              {lowStock}
            </span>
            <span className="summary-label">Low Stock</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span
              className="summary-value"
              style={{ color: "#D4A843", fontSize: "1rem" }}
            >
              ₱
              {totalValue.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="summary-label">Stock Value</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="inventory-toolbar" style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flex: 1,
            flexWrap: "wrap",
          }}
        >
          <div className="search-wrapper" style={{ maxWidth: "280px" }}>
            <span className="search-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </span>
            <input
              className="search-input"
              placeholder="Search materials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch("")}>
                ×
              </button>
            )}
          </div>
          <CustomDropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "", label: "All Categories" },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
            placeholder="All Categories"
            style={{ minWidth: "140px" }}
          />
          <CustomDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "", label: "All Status" },
              { value: "healthy", label: "Healthy" },
              { value: "low-stock", label: "Low Stock" },
              { value: "out-of-stock", label: "Out of Stock" },
              { value: "on-demand", label: "On-Demand" },
            ]}
            placeholder="All Status"
            style={{ minWidth: "130px" }}
          />
        </div>
        <button
          className="btn-primary"
          onClick={onIssueStock}
          style={{
            background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)",
            color: "#000",
            fontWeight: 700,
          }}
        >
          Stock Adjustment
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
          background: "var(--dark)",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr
              style={{
                background: "rgba(0,0,0,0.3)",
                borderBottom: "2px solid var(--border)",
              }}
            >
              <th style={thStyle}>SKU / Name</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Category</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Current Stock</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Min Stock</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Unit Cost</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Stock Value</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
              <th style={{ ...thStyle, textAlign: "center", width: "60px" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "var(--gray)",
                  }}
                >
                  {materials.length === 0
                    ? "No materials yet. Add materials in Master Data first."
                    : "No materials match your filters."}
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => {
                if (row.type === "standalone") {
                  const m = row.item;
                  const stockVal =
                    (m.stockQty || 0) * (m.baseCost || m.averageCost || 0);
                  return (
                    <tr
                      key={String(m.id ?? m._id)}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.02)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <div style={{ width: "14px", flexShrink: 0 }} />
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                color: "#E5E2E1",
                                fontSize: "0.875rem",
                              }}
                            >
                              {m.name}
                            </div>
                            <div
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--gray)",
                                fontFamily: "monospace",
                                marginTop: "0.15rem",
                              }}
                            >
                              {m.sku || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                          fontSize: "0.8rem",
                          color: "#E5E2E1",
                        }}
                      >
                        {m.category || "—"}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                          fontWeight: 700,
                          color:
                            m.procurementType === "on-demand"
                              ? "#818cf8"
                              : m.stockQty === 0
                                ? "#ef4444"
                                : m.stockQty < (m.minStock || 10)
                                  ? "#f59e0b"
                                  : "#E5E2E1",
                        }}
                      >
                        {m.stockQty || 0}{" "}
                        <span style={{ color: "var(--gray)", fontWeight: 400 }}>
                          {m.uom || "pcs"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                          color: "var(--gray)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {m.minStock || 10}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "right",
                          color: "#E5E2E1",
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                        }}
                      >
                        {(() => {
                          const batchCosts = (m.batches || [])
                            .filter((b) => (b.remainingQty || 0) > 0)
                            .map((b) => b.unitCost || 0)
                            .filter((c) => c > 0);
                          const costs =
                            batchCosts.length > 0
                              ? batchCosts
                              : [m.baseCost || m.averageCost || 0].filter(
                                  (c) => c > 0,
                                );
                          if (costs.length === 0) return "₱0.00";
                          const min = Math.min(...costs),
                            max = Math.max(...costs);
                          if (min === max)
                            return `₱${min.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
                          return (
                            <span
                              style={{ fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              ₱
                              {min.toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              – ₱
                              {max.toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          );
                        })()}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "right",
                          fontWeight: 700,
                          color: "#D4A843",
                          fontFamily: "monospace",
                        }}
                      >
                        ₱
                        {stockVal.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                        }}
                      >
                        <StatusBadge
                          stock={m.stockQty || 0}
                          minStock={m.minStock || 10}
                          procurementType={m.procurementType}
                        />
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                        }}
                      >
                        {m.stockQty === 0 && onDeleteZeroStock ? (
                          <button
                            onClick={() =>
                              onDeleteZeroStock(m._id ?? m.id, m.name)
                            }
                            style={{
                              background: "rgba(239,68,68,0.1)",
                              border: "1px solid rgba(239,68,68,0.2)",
                              borderRadius: "6px",
                              padding: "0.375rem",
                              color: "#ef4444",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              margin: "0 auto",
                            }}
                            title="Delete this item"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        ) : (
                          <span
                            style={{ color: "var(--gray)", fontSize: "0.7rem" }}
                          >
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                }

                const parent = row.item;
                const children = row.children || [];
                const isExpanded = expandedParents.has(
                  String(parent.id ?? parent._id),
                );
                const parentStockVal = children.reduce(
                  (s, c) =>
                    s + (c.stockQty || 0) * (c.baseCost || c.averageCost || 0),
                  0,
                );
                const totalChildStock = children.reduce(
                  (s, c) => s + (c.stockQty || 0),
                  0,
                );

                return (
                  <React.Fragment key={String(parent.id ?? parent._id)}>
                    <tr
                      style={{
                        borderBottom: isExpanded
                          ? "none"
                          : "1px solid rgba(255,255,255,0.04)",
                        background: "rgba(212,168,67,0.02)",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        toggleExpand(String(parent.id ?? parent._id))
                      }
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(212,168,67,0.06)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(212,168,67,0.02)")
                      }
                    >
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(String(parent.id ?? parent._id));
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: isExpanded ? "#D4A843" : "var(--gray)",
                              padding: 0,
                            }}
                          >
                            <ChevronIcon open={isExpanded} />
                          </button>
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: "#E5E2E1",
                                  fontSize: "0.875rem",
                                }}
                              >
                                {parent.name}
                              </span>
                              <span
                                style={{
                                  padding: "0.12rem 0.45rem",
                                  borderRadius: "4px",
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  background: "rgba(212,168,67,0.15)",
                                  color: "#D4A843",
                                }}
                              >
                                {children.length} variants
                              </span>
                            </div>
                            {parent.variantTypes &&
                              parent.variantTypes.length > 0 && (
                                <div
                                  style={{
                                    fontSize: "0.65rem",
                                    color: "var(--gray)",
                                    marginTop: "0.15rem",
                                  }}
                                >
                                  {parent.variantTypes
                                    .map(
                                      (vt) =>
                                        `${vt.name}: ${vt.options.join(", ")}`,
                                    )
                                    .join(" | ")}
                                </div>
                              )}
                          </div>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", color: "#E5E2E1" }}>
                          {parent.category || "—"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              totalChildStock === 0
                                ? "#ef4444"
                                : totalChildStock <
                                    (parent.minStock || 10) * children.length
                                  ? "#f59e0b"
                                  : "#E5E2E1",
                          }}
                        >
                          {totalChildStock}
                        </span>
                        <span style={{ color: "var(--gray)", fontWeight: 400 }}>
                          {" "}
                          pcs total
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                          color: "var(--gray)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {parent.minStock || 10}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "right",
                          color: "#E5E2E1",
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                        }}
                      >
                        {(() => {
                          const batchCosts = children
                            .flatMap((c) =>
                              (c.batches || [])
                                .filter((b) => (b.remainingQty || 0) > 0)
                                .map((b) => b.unitCost || 0),
                            )
                            .filter((c) => c > 0);
                          const costs =
                            batchCosts.length > 0
                              ? batchCosts
                              : children
                                  .map((c) => c.baseCost || c.averageCost || 0)
                                  .filter((c) => c > 0);
                          if (costs.length === 0) return "₱0.00";
                          const min = Math.min(...costs),
                            max = Math.max(...costs);
                          if (min === max)
                            return `₱${min.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
                          return (
                            <span
                              style={{ fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              ₱
                              {min.toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              – ₱
                              {max.toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          );
                        })()}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "right",
                          fontWeight: 700,
                          color: "#D4A843",
                          fontFamily: "monospace",
                        }}
                      >
                        ₱
                        {parentStockVal.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                        }}
                      >
                        <StatusBadge
                          stock={totalChildStock}
                          minStock={(parent.minStock || 10) * children.length}
                          procurementType={parent.procurementType}
                        />
                      </td>
                      <td style={{ padding: "0.875rem 1rem" }} />
                    </tr>
                    {isExpanded &&
                      children.map((child) => {
                        const childStockVal =
                          (child.stockQty || 0) *
                          (child.baseCost || child.averageCost || 0);
                        return (
                          <tr
                            key={String(child.id ?? child._id)}
                            style={{
                              borderBottom: "1px solid rgba(255,255,255,0.03)",
                              background: "rgba(0,0,0,0.15)",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(0,0,0,0.25)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(0,0,0,0.15)")
                            }
                          >
                            <td
                              style={{ padding: "0.75rem 1rem 0.75rem 2.5rem" }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: "#E5E2E1",
                                  fontSize: "0.82rem",
                                }}
                              >
                                {child.name}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.65rem",
                                  color: "var(--gray)",
                                  fontFamily: "monospace",
                                  marginTop: "0.1rem",
                                }}
                              >
                                {child.sku || "—"}
                              </div>
                            </td>
                            <td
                              style={{
                                padding: "0.75rem 1rem",
                                textAlign: "center",
                                fontSize: "0.78rem",
                                color: "#E5E2E1",
                              }}
                            >
                              {child.category || "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem 1rem",
                                textAlign: "center",
                                fontWeight: 700,
                                color:
                                  child.procurementType === "on-demand"
                                    ? "#818cf8"
                                    : child.stockQty === 0
                                      ? "#ef4444"
                                      : child.stockQty < (child.minStock || 10)
                                        ? "#f59e0b"
                                        : "#E5E2E1",
                              }}
                            >
                              {child.stockQty || 0}{" "}
                              <span
                                style={{
                                  color: "var(--gray)",
                                  fontWeight: 400,
                                }}
                              >
                                {child.uom || "pcs"}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "0.75rem 1rem",
                                textAlign: "center",
                                color: "var(--gray)",
                                fontSize: "0.78rem",
                              }}
                            >
                              {child.minStock || 10}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem 1rem",
                                textAlign: "right",
                                color: "#E5E2E1",
                                fontFamily: "monospace",
                                fontSize: "0.78rem",
                              }}
                            >
                              {(() => {
                                const bc = (child.batches || [])
                                  .filter((b) => (b.remainingQty || 0) > 0)
                                  .map((b) => b.unitCost || 0)
                                  .filter((c) => c > 0);
                                const costs =
                                  bc.length > 0
                                    ? bc
                                    : [
                                        child.baseCost ||
                                          child.averageCost ||
                                          0,
                                      ].filter((c) => c > 0);
                                if (!costs.length) return "₱0.00";
                                const min = Math.min(...costs),
                                  max = Math.max(...costs);
                                if (min === max)
                                  return `₱${min.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
                                return `₱${min.toLocaleString("en-PH", { minimumFractionDigits: 2 })} – ₱${max.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
                              })()}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem 1rem",
                                textAlign: "right",
                                fontWeight: 700,
                                color: "#D4A843",
                                fontFamily: "monospace",
                              }}
                            >
                              ₱
                              {childStockVal.toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td
                              style={{
                                padding: "0.75rem 1rem",
                                textAlign: "center",
                              }}
                            >
                              <StatusBadge
                                stock={child.stockQty || 0}
                                minStock={child.minStock || 10}
                                procurementType={child.procurementType}
                              />
                            </td>
                            <td
                              style={{
                                padding: "0.75rem 1rem",
                                textAlign: "center",
                              }}
                            >
                              {child.stockQty === 0 && onDeleteZeroStock ? (
                                <button
                                  onClick={() =>
                                    onDeleteZeroStock(
                                      child._id ?? child.id,
                                      child.name,
                                    )
                                  }
                                  style={{
                                    background: "rgba(239,68,68,0.1)",
                                    border: "1px solid rgba(239,68,68,0.2)",
                                    borderRadius: "6px",
                                    padding: "0.375rem",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    margin: "0 auto",
                                  }}
                                  title="Delete this variant"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                </button>
                              ) : (
                                <span
                                  style={{
                                    color: "var(--gray)",
                                    fontSize: "0.7rem",
                                  }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        {filteredRows.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.625rem 1rem",
              borderTop: "1px solid var(--border)",
              flexWrap: "wrap",
              gap: "0.5rem",
              fontSize: "0.8rem",
              color: "var(--gray)",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              Rows per page:
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  background: "var(--dark)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "var(--white)",
                  padding: "0.2rem 0.5rem",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
            >
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                style={{
                  padding: "0.25rem 0.625rem",
                  background: "var(--dark)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: currentPage <= 1 ? "var(--gray)" : "var(--white)",
                  cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                }}
              >
                ‹
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage >= totalPages}
                style={{
                  padding: "0.25rem 0.625rem",
                  background: "var(--dark)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color:
                    currentPage >= totalPages ? "var(--gray)" : "var(--white)",
                  cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                }}
              >
                ›
              </button>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              Page:{" "}
              <span
                style={{
                  padding: "0.2rem 0.6rem",
                  background: "var(--dark)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "var(--white)",
                  minWidth: "28px",
                  textAlign: "center",
                }}
              >
                {currentPage}
              </span>{" "}
              of {totalPages}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function StocksPage() {
  const { token, currentUser: user } = useAuth();
  const [activeTab, setActiveTab] = useState("goods");
  const [materials, setMaterials] = useState([]);
  const [stockOuts, setStockOuts] = useState([]);
  const [showGoodsIssue, setShowGoodsIssue] = useState(false);
  const [showReductionModal, setShowReductionModal] = useState(false);
  const [reductionItem, setReductionItem] = useState(null);
  const [showSelectMaterial, setShowSelectMaterial] = useState(false);
  const [selectSearch, setSelectSearch] = useState("");
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [reductionItems, setReductionItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [badOrders, setBadOrders] = useState([]);
  const [alertModal, setAlertModal] = useState(null); // { type: 'success'|'error', message }
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [data, badRaw] = await Promise.all([
        fetchInventory(token),
        fetchBadOrders(token).catch(() => []),
      ]);
      setMaterials(data);
      setBadOrders(
        (Array.isArray(badRaw) ? badRaw : []).map(normalizeStockBadOrder),
      );
      const ids = data.map((m) => m.id ?? m._id).filter(Boolean);
      const history = await fetchAllStockHistory(ids, token);
      const reasonToIssueType = (r) => {
        if (r === "sales-outside" || r === "sale") return "manual_sale";
        if (r === "sale_reserved" || r === "bom_deduction") return "order_sale";
        if (r === "damaged") return "damage";
        if (r === "writeoff") return "writeoff";
        if (r === "scrap") return "scrap";
        if (r === "production") return "production";
        if (r === "lost" || r === "missing") return "lost";
        return "adjustment";
      };
      const normalizedOuts = history
        .filter((h) => h.type === "deduction")
        .map((h) => {
          const mat = data.find(
            (m) => String(m.id ?? m._id) === String(h.inventoryId),
          );
          return {
            ...h,
            materialName: mat?.name || h.materialName || "—",
            sku: mat?.sku || h.sku || "",
            uom: mat?.uom || h.uom || "pcs",
            category: mat?.category || h.category || "Uncategorized",
            issueType: reasonToIssueType(h.reason),
            totalLoss: h.totalCost || 0,
            dateIssued: h.createdAt,
            quantity: Math.abs(h.quantity || 0),
          };
        });
      setStockOuts(normalizedOuts);
    } catch (err) {
      setError(err.message || "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleStockReduction = async (data) => {
    if (!token) return;
    const { reason, remarks, variants, saleDate, customer } = data;
    const reasonMap = {
      sales: "sales-outside",
      damaged: "damaged",
      writeoff: "writeoff",
    };
    const apiReason = reasonMap[reason] || reason;

    const calls = (variants || [])
      .filter((v) => (v.qtyFulfilled || 0) > 0)
      .map((variant) => {
        const mat = materials.find(
          (m) =>
            String(m.id ?? m._id) === String(variant.variantId) ||
            (variant.sku && m.sku === variant.sku),
        );
        const fifoUnitCost =
          variant.qtyFulfilled > 0
            ? (variant.totalCostValue || 0) / variant.qtyFulfilled
            : 0;
        const unitCost =
          fifoUnitCost || mat?.baseCost || mat?.averageCost || null;
        const invId = mat?.id ?? mat?._id ?? variant.variantId;

        return adjustInventoryStock(
          invId,
          {
            quantity: variant.qtyFulfilled,
            adjustmentType: "subtract",
            reason: apiReason,
            remarks: remarks || null,
            sellingPrice:
              apiReason === "sales-outside"
                ? variant.sellingPrice || null
                : null,
            saleDate: apiReason === "sales-outside" ? saleDate || null : null,
            customerName:
              apiReason === "sales-outside" ? customer || null : null,
            unitCost,
            performedBy:
              user?.username ||
              user?.name ||
              [user?.firstName, user?.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              user?.email ||
              null,
          },
          token,
        );
      });

    try {
      await Promise.all(calls);
      setShowGoodsIssue(false);
      setShowReductionModal(false);
      setReductionItem(null);
      setReductionItems([]);
      await refresh();
      setAlertModal({
        type: "success",
        message: `Stock updated successfully. ${calls.length} adjustment(s) completed.`,
      });
    } catch (err) {
      console.error("Stock reduction failed:", err);
      setAlertModal({
        type: "error",
        message: err?.message || "Stock update failed.",
      });
      setError(err?.message || "Failed to adjust stock.");
    }
  };

  const handleDeleteZeroStock = (materialId, materialName) => {
    setConfirmModal({
      message: `Delete "${materialName}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await deleteInventory(materialId, token);
          await refresh();
        } catch (err) {
          console.error(err);
          setAlertModal({
            type: "error",
            message: err?.message || "Failed to delete item.",
          });
        }
      },
    });
  };

  const tabStyle = (tab) => ({
    padding: "0.625rem 1.25rem",
    fontSize: "0.825rem",
    fontWeight: 700,
    cursor: "pointer",
    borderRadius: "8px",
    border: "none",
    background: activeTab === tab ? "var(--gold)" : "transparent",
    color: activeTab === tab ? "#000" : "var(--white)",
    transition: "all 0.15s",
  });

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
        {/* Page Header */}
        <div className="page-header">
          {/* Tab Switcher */}
          <div
            style={{
              display: "flex",
              gap: "0.25rem",
              background: "var(--dark3)",
              borderRadius: "10px",
              padding: "0.25rem",
              width: "fit-content",
            }}
          >
            <button
              style={tabStyle("goods")}
              onClick={() => setActiveTab("goods")}
            >
              Goods Stock
            </button>
            <button
              style={tabStyle("actual")}
              onClick={() => setActiveTab("actual")}
            >
              Actual Stock
            </button>
            <button
              style={tabStyle("history")}
              onClick={() => setActiveTab("history")}
            >
              Stock-Out History
            </button>
            <button
              style={tabStyle("reports")}
              onClick={() => setActiveTab("reports")}
            >
              Reports
            </button>
          </div>
        </div>

        {loading && (
          <p
            style={{
              padding: "2rem",
              color: "var(--gray)",
              fontSize: "0.875rem",
            }}
          >
            Loading inventory...
          </p>
        )}
        {error && (
          <p
            style={{
              padding: "2rem",
              color: "var(--red)",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </p>
        )}

        {/* Tab Content */}
        {!loading && !error && activeTab === "goods" && (
          <StockOverviewTab
            materials={materials}
            onIssueStock={() => {
              setShowSelectMaterial(true);
            }}
            onDeleteZeroStock={handleDeleteZeroStock}
          />
        )}
        {!loading && !error && activeTab === "actual" && (
          <ActualStockTab
            materials={materials}
            badOrders={badOrders}
            stockOuts={stockOuts}
            onDeleteZeroStock={handleDeleteZeroStock}
          />
        )}
        {!loading && !error && activeTab === "history" && (
          <StockOutHistoryTab stockOuts={stockOuts} materials={materials} />
        )}
        {!loading && !error && activeTab === "reports" && (
          <InventoryReports materials={materials} stockOuts={stockOuts} />
        )}

        {/* Select Material Modal */}
        {showSelectMaterial && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.78)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                background: "#0E0E0E",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "14px",
                width: "480px",
                maxWidth: "95%",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  padding: "1.5rem 1.75rem",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  background: "#131313",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.6rem",
                      color: "#D4A843",
                      textTransform: "uppercase",
                      letterSpacing: "0.2em",
                      fontWeight: 700,
                      marginBottom: "0.3rem",
                    }}
                  >
                    Stock Adjustment
                  </div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1.2rem",
                      fontWeight: 700,
                      color: "#E5E2E1",
                    }}
                  >
                    Select Material
                  </h2>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <button
                    onClick={() => {
                      setMultiSelectMode((prev) => !prev);
                      setSelectedMaterials([]);
                    }}
                    style={{
                      background: multiSelectMode
                        ? "rgba(212,168,67,0.15)"
                        : "rgba(255,255,255,0.05)",
                      border: multiSelectMode
                        ? "1px solid rgba(212,168,67,0.4)"
                        : "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "7px",
                      padding: "0.35rem 0.75rem",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: multiSelectMode ? "#D4A843" : "var(--gray)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {multiSelectMode ? "Multi-Select ON" : "Select Multiple"}
                  </button>
                  {/* FIXED: Moved style inside button tag */}
                  <button
                    onClick={() => {
                      setShowSelectMaterial(false);
                      setSelectSearch("");
                      setMultiSelectMode(false);
                      setSelectedMaterials([]);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "none",
                      borderRadius: "50%",
                      width: "36px",
                      height: "36px",
                      cursor: "pointer",
                      color: "var(--gray)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
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
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Search */}
              <div
                style={{
                  padding: "1rem 1.75rem",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ position: "relative" }}>
                  <svg
                    style={{
                      position: "absolute",
                      left: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--gray)",
                    }}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    autoFocus
                    placeholder="Search materials..."
                    value={selectSearch}
                    onChange={(e) => setSelectSearch(e.target.value)}
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      color: "#E5E2E1",
                      padding: "0.55rem 0.75rem 0.55rem 2.25rem",
                      fontSize: "0.85rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* List */}
              <div
                style={{
                  overflowY: "auto",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                {materials
                  .filter((m) => {
                    if (m.parentId) return false;
                    const hasBatches = m.batches && m.batches.length > 0;
                    const hasStock = (m.stockQty || 0) > 0;
                    if (!hasBatches && !hasStock) {
                      if (m.hasVariants) {
                        const children = materials.filter(
                          (c) => String(c.parentId) === String(m.id ?? m._id),
                        );
                        const childStock = children.reduce(
                          (s, c) => s + (c.stockQty || 0),
                          0,
                        );
                        const childBatches = children.some(
                          (c) => c.batches && c.batches.length > 0,
                        );
                        if (!childStock && !childBatches) return false;
                      } else {
                        return false;
                      }
                    }
                    if (selectSearch) {
                      const q = selectSearch.toLowerCase();
                      return (
                        m.name.toLowerCase().includes(q) ||
                        (m.sku || "").toLowerCase().includes(q)
                      );
                    }
                    return true;
                  })
                  .map((m) => {
                    // Compute accurate stock from batches
                    const computeAccurateStock = (mat) => {
                      if (
                        Array.isArray(mat.batches) &&
                        mat.batches.length > 0
                      ) {
                        return mat.batches.reduce(
                          (s, b) =>
                            s +
                            (b.remainingQty != null
                              ? b.remainingQty
                              : (b.goodQty ?? b.qtyGood ?? 0)),
                          0,
                        );
                      }
                      return mat.stockQty || 0;
                    };
                    let displayStock = computeAccurateStock(m);
                    let variantCount = 0;
                    if (m.hasVariants) {
                      const children = materials.filter(
                        (c) => String(c.parentId) === String(m.id ?? m._id),
                      );
                      // Only count children with actual batch data
                      const stockedChildren = children.filter(
                        (c) =>
                          Array.isArray(c.batches) &&
                          c.batches.length > 0 &&
                          c.batches.some(
                            (b) =>
                              (b.originalQty ||
                                b.qtyReceived ||
                                b.goodQty ||
                                b.qtyGood ||
                                0) > 0,
                          ),
                      );
                      variantCount = stockedChildren.length;
                      displayStock = stockedChildren.reduce(
                        (s, c) => s + computeAccurateStock(c),
                        0,
                      );
                    }
                    return (
                      <div
                        key={String(m.id ?? m._id)}
                        onClick={() => {
                          if (multiSelectMode) {
                            const mId = m.id ?? m._id;
                            setSelectedMaterials((prev) =>
                              prev.some((x) => (x.id ?? x._id) === mId)
                                ? prev.filter((x) => (x.id ?? x._id) !== mId)
                                : [...prev, m],
                            );
                          } else {
                            setReductionItem(m);
                            setShowSelectMaterial(false);
                            setSelectSearch("");
                            setShowReductionModal(true);
                          }
                        }}
                        style={{
                          padding: "0.875rem 1.75rem",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background:
                            multiSelectMode &&
                            selectedMaterials.some(
                              (x) => (x.id ?? x._id) === (m.id ?? m._id),
                            )
                              ? "rgba(212,168,67,0.08)"
                              : "transparent",
                          borderLeft:
                            multiSelectMode &&
                            selectedMaterials.some(
                              (x) => (x.id ?? x._id) === (m.id ?? m._id),
                            )
                              ? "3px solid #D4A843"
                              : "3px solid transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (
                            !multiSelectMode ||
                            !selectedMaterials.some(
                              (x) => (x.id ?? x._id) === (m.id ?? m._id),
                            )
                          )
                            e.currentTarget.style.background =
                              "rgba(212,168,67,0.06)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            multiSelectMode &&
                            selectedMaterials.some(
                              (x) => (x.id ?? x._id) === (m.id ?? m._id),
                            )
                              ? "rgba(212,168,67,0.08)"
                              : "transparent";
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                          }}
                        >
                          {multiSelectMode && (
                            <input
                              type="checkbox"
                              readOnly
                              checked={selectedMaterials.some(
                                (x) => (x.id ?? x._id) === (m.id ?? m._id),
                              )}
                              style={{
                                width: "16px",
                                height: "16px",
                                accentColor: "#D4A843",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                color: "#E5E2E1",
                                fontSize: "0.875rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
                              {m.name}
                              {variantCount > 0 && (
                                <span
                                  style={{
                                    fontSize: "0.6rem",
                                    fontWeight: 700,
                                    background: "rgba(212,168,67,0.15)",
                                    color: "#D4A843",
                                    padding: "0.1rem 0.4rem",
                                    borderRadius: "4px",
                                  }}
                                >
                                  {variantCount} variants
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "0.68rem",
                                color: "var(--gray)",
                                marginTop: "0.15rem",
                              }}
                            >
                              {m.category || "—"}
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            textAlign: "right",
                            flexShrink: 0,
                            marginLeft: "1rem",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              color: displayStock === 0 ? "#ef4444" : "#D4A843",
                              fontSize: "0.9rem",
                            }}
                          >
                            {displayStock}
                          </div>
                          <div
                            style={{
                              fontSize: "0.65rem",
                              color: "var(--gray)",
                            }}
                          >
                            {m.uom || "pcs"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Multi-Select Footer — inside modal */}
              {multiSelectMode && (
                <div
                  style={{
                    padding: "1rem 1.75rem",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    background: "#131313",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexShrink: 0,
                    borderBottomLeftRadius: "14px",
                    borderBottomRightRadius: "14px",
                  }}
                >
                  <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
                    {selectedMaterials.length > 0
                      ? `${selectedMaterials.length} material${selectedMaterials.length !== 1 ? "s" : ""} selected`
                      : "Check items to select"}
                  </span>
                  {/* FIXED: Moved style inside button tag */}
                  <button
                    disabled={selectedMaterials.length === 0}
                    onClick={() => {
                      if (selectedMaterials.length === 0) return;
                      setReductionItems([...selectedMaterials]);
                      setReductionItem(null); // multi-select uses reductionItems
                      setSelectedMaterials([]);
                      setMultiSelectMode(false);
                      setShowSelectMaterial(false);
                      setSelectSearch("");
                      setShowReductionModal(true);
                    }}
                    style={{
                      background:
                        selectedMaterials.length === 0
                          ? "rgba(255,255,255,0.06)"
                          : "#D4A843",
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.55rem 1.25rem",
                      color:
                        selectedMaterials.length === 0 ? "var(--gray)" : "#000",
                      fontWeight: 700,
                      fontSize: "0.82rem",
                      cursor:
                        selectedMaterials.length === 0
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    Reduce selected
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Stock Adjustment Modal */}
        {showReductionModal && (
          <StockReductionModal
            isOpen={showReductionModal}
            onClose={() => {
              setShowReductionModal(false);
              setReductionItem(null);
              setReductionItems([]);
            }}
            onConfirm={handleStockReduction}
            item={reductionItem}
            items={reductionItems}
            inventory={materials}
            masterlist={null}
          />
        )}

        {/* Alert Modal */}
        {alertModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
          >
            <div
              style={{
                background: "var(--dark2)",
                border: `1px solid ${alertModal.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                borderRadius: "14px",
                padding: "2rem",
                maxWidth: "420px",
                width: "100%",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background:
                    alertModal.type === "success"
                      ? "rgba(34,197,94,0.12)"
                      : "rgba(239,68,68,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1rem",
                }}
              >
                {alertModal.type === "success" ? (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.5"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                )}
              </div>
              <p
                style={{
                  color: "#E5E2E1",
                  fontSize: "0.9rem",
                  marginBottom: "1.5rem",
                  lineHeight: 1.5,
                }}
              >
                {alertModal.message}
              </p>
              <button
                onClick={() => setAlertModal(null)}
                style={{
                  background:
                    alertModal.type === "success"
                      ? "rgba(34,197,94,0.15)"
                      : "rgba(239,68,68,0.15)",
                  border: `1px solid ${alertModal.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                  color: alertModal.type === "success" ? "#22c55e" : "#ef4444",
                  borderRadius: "8px",
                  padding: "0.5rem 1.5rem",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        {confirmModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
          >
            <div
              style={{
                background: "var(--dark2)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "14px",
                padding: "2rem",
                maxWidth: "420px",
                width: "100%",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(239,68,68,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1rem",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                >
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </div>
              <p
                style={{
                  color: "#E5E2E1",
                  fontSize: "0.9rem",
                  marginBottom: "1.5rem",
                  lineHeight: 1.5,
                }}
              >
                {confirmModal.message}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={() => setConfirmModal(null)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--gray)",
                    borderRadius: "8px",
                    padding: "0.5rem 1.5rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  style={{
                    background: "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    color: "#ef4444",
                    borderRadius: "8px",
                    padding: "0.5rem 1.5rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
