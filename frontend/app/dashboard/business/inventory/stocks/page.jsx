"use client";

/**
 * STOCKS PAGE — Restructured to 3 tabs
 *
 * [Current Stock]  [Movement History]  [Reports]
 *
 * Current Stock tab: merges old Goods Stock + Actual Stock
 * Movement History tab: unified ledger of all stock movements
 * Reports tab: keeps existing InventoryReports.jsx
 */

import CustomDropdown from "@/app/components/CustomDropdown";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import GoodsIssueModal from "../GoodsIssueModal";
import { genDocNumber, getStore, setStore } from "../utils";
import InventoryReports from "./InventoryReports";

// DEPRECATED imports — kept for backward compatibility with existing data
// ActualStockTab and StockOutHistoryTab are no longer rendered
// import ActualStockTab from "./ActualStockTab";
// import StockOutHistoryTab from "./StockOutHistoryTab";

// ── Storage Keys ───────────────────────────────────────────────────────────────
const MATERIALS_KEY = "pmp_materials";
const VENDORS_KEY = "pmp_vendors";
const STOCK_OUT_KEY = "pmp_stock_out_log";

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
  const t = GOODS_ISSUE_TYPES.find((x) => x.id === type);
  const cfg = t
    ? {
        label: t.label,
        color: t.color,
        bg: t.color + "1a",
        border: t.color + "33",
      }
    : {
        label: type,
        color: "#9ca3af",
        bg: "rgba(156,163,175,0.1)",
        border: "rgba(156,163,175,0.2)",
      };
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
function StockOverviewTab({ materials, onIssueStock }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedParents, setExpandedParents] = useState(new Set());

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
        if (!childrenMap.has(child.parentId))
          childrenMap.set(child.parentId, []);
        childrenMap.get(child.parentId).push(child);
      });
    // Materials with hasVariants but ZERO children → treat as standalone
    const orphanParents = parents.filter(
      (p) => !childrenMap.has(p.id) || childrenMap.get(p.id).length === 0,
    );
    const realParents = parents.filter(
      (p) => childrenMap.has(p.id) && childrenMap.get(p.id).length > 0,
    );
    const standalone = [
      ...materials.filter((m) => !m.hasVariants && !m.parentId),
      ...orphanParents,
    ];
    return { parents: realParents, childrenMap, standalone };
  }, [materials]);

  const toggleExpand = (id) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getStock = (m) => {
    if (m.batches && Array.isArray(m.batches) && m.batches.length > 0) {
      return m.batches.reduce(
        (s, b) => s + (b.remainingQty || b.goodQty || b.qtyGood || 0),
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
    return matchSearch && matchCat && matchStatus;
  };

  const filteredRows = useMemo(() => {
    const rows = [];
    groupedMaterials.standalone.filter(matchesFilters).forEach((m) => {
      rows.push({ type: "standalone", item: { ...m, stockQty: getStock(m) } });
    });
    groupedMaterials.parents.forEach((parent) => {
      const children = groupedMaterials.childrenMap.get(parent.id) || [];
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
  }, [groupedMaterials, search, categoryFilter, statusFilter]);

  // ── FIX 3: Summary cards now use getStock(m) instead of m.stockQty ──────────
  const totalStock = materials
    .filter((m) => !m.parentId && m.procurementType !== "on-demand")
    .reduce((sum, m) => sum + getStock(m), 0);

  const outOfStock = materials
    .filter((m) => !m.parentId && m.procurementType !== "on-demand")
    .filter((m) => getStock(m) === 0).length;

  const lowStock = materials
    .filter((m) => !m.parentId && m.procurementType !== "on-demand")
    .filter((m) => {
      const stock = getStock(m);
      return stock > 0 && stock <= (m.minStock || 0);
    }).length;

  const totalValue = materials
    .filter((m) => !m.parentId && m.procurementType !== "on-demand")
    .reduce((sum, m) => sum + getStock(m) * (m.baseCost || 0), 0);

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
        <div className="summary-card summary-card-danger">
          <div className="summary-content">
            <span className="summary-value">{outOfStock}</span>
            <span className="summary-label">Out of Stock</span>
          </div>
        </div>
        <div className="summary-card summary-card-warning">
          <div className="summary-content">
            <span className="summary-value">{lowStock}</span>
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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Goods Issue
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
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
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
              filteredRows.map((row) => {
                if (row.type === "standalone") {
                  const m = row.item;
                  const stockVal = (m.stockQty || 0) * (m.baseCost || 0);
                  return (
                    <tr
                      key={m.id}
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
                        ₱
                        {(m.baseCost || 0).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
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
                    </tr>
                  );
                }

                const parent = row.item;
                const children = row.children || [];
                const isExpanded = expandedParents.has(parent.id);
                const parentStockVal = children.reduce(
                  (s, c) => s + (c.stockQty || 0) * (c.baseCost || 0),
                  0,
                );
                const totalChildStock = children.reduce(
                  (s, c) => s + (c.stockQty || 0),
                  0,
                );

                return (
                  <React.Fragment key={parent.id}>
                    <tr
                      style={{
                        borderBottom: isExpanded
                          ? "none"
                          : "1px solid rgba(255,255,255,0.04)",
                        background: "rgba(212,168,67,0.02)",
                        cursor: "pointer",
                      }}
                      onClick={() => toggleExpand(parent.id)}
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
                              toggleExpand(parent.id);
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
                                    .join(" · ")}
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
                          const costs = children
                            .map((c) => c.baseCost || 0)
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
                    </tr>
                    {isExpanded &&
                      children.map((child) => {
                        const childStockVal =
                          (child.stockQty || 0) * (child.baseCost || 0);
                        return (
                          <tr
                            key={child.id}
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
                              ₱
                              {(child.baseCost || 0).toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}
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
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STOCK-OUT HISTORY TAB
// ══════════════════════════════════════════════════════════════════════════════
// STOCK-OUT HISTORY TAB — Moved to StockOutHistoryTab.jsx

// ACTUAL STOCK TAB — Moved to ActualStockTab.jsx

// ══════════════════════════════════════════════════════════════════════════════
// MOVEMENT HISTORY TAB — Unified ledger of all stock movements
// ══════════════════════════════════════════════════════════════════════════════
function MovementHistoryTab({ stockOuts, materials }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const STOCK_IN_KEY = "pmp_stock_in_log";
  const getStoreLocal = (key) => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  };

  const stockInLog = getStoreLocal(STOCK_IN_KEY);

  // Build unified movement list
  const movements = useMemo(() => {
    const list = [];

    // Stock In movements
    stockInLog.forEach((entry) => {
      list.push({
        id: `si-${entry.invoiceNumber}-${entry.materialId}`,
        date: entry.dateReceived,
        ref: entry.invoiceNumber || "—",
        materialName: entry.materialName,
        sku: entry.sku || "",
        type: "stock_in",
        typeLabel: "Stock In",
        qtyIn: entry.goodQty || entry.receivedQty || 0,
        qtyOut: 0,
        performedBy: "—",
        color: "#22c55e",
      });
    });

    // Stock Out movements
    stockOuts.forEach((so) => {
      const t = GOODS_ISSUE_TYPES.find((x) => x.id === so.issueType);
      list.push({
        id: so.id || `so-${so.materialId}-${so.dateIssued}`,
        date: so.dateIssued || so.createdAt,
        ref: "—",
        materialName: so.materialName,
        sku: so.sku || "",
        type: so.issueType || "damage",
        typeLabel: t ? t.label : so.issueType,
        qtyIn: 0,
        qtyOut: so.quantity || 0,
        performedBy: so.performedBy || "—",
        color: t ? t.color : "#ef4444",
      });
    });

    // Sort by date desc
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [stockInLog, stockOuts]);

  // Filter
  const filtered = useMemo(() => {
    return movements.filter((m) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        m.materialName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.performedBy.toLowerCase().includes(q);

      const matchType =
        typeFilter === "all" ||
        (typeFilter === "stock_in" && m.type === "stock_in") ||
        (typeFilter === "outgoing" &&
          ["manual_sale", "production_use", "transfer"].includes(m.type)) ||
        (typeFilter === "writeoff" &&
          ["damage", "scrap", "lost"].includes(m.type)) ||
        (typeFilter === "return" && m.type === "rtv");

      return matchSearch && matchType;
    });
  }, [movements, search, typeFilter]);

  return (
    <div>
      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search movements..."
            style={{
              width: "100%",
              padding: "0.6rem 1rem 0.6rem 2.5rem",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "#E5E2E1",
              outline: "none",
            }}
          />
          <svg
            width="16"
            height="16"
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
        </div>
        <CustomDropdown
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All Movements" },
            { value: "stock_in", label: "Stock In" },
            { value: "outgoing", label: "Outgoing" },
            { value: "writeoff", label: "Write-Off" },
            { value: "return", label: "Return to Vendor" },
          ]}
          placeholder="All Movements"
          style={{ minWidth: "150px" }}
        />
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
              No Movement History
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              Stock movements will appear here chronologically.
            </p>
          </div>
        ) : (
          <div
            style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}
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
                  <th style={{ ...thStyle, textAlign: "center" }}>Qty In</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Qty Out</th>
                  <th style={thStyle}>Performed By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, idx) => (
                  <tr
                    key={m.id || idx}
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
                      {new Date(m.date).toLocaleDateString("en-PH")}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "#E5E2E1",
                          fontSize: "0.85rem",
                        }}
                      >
                        {m.materialName}
                      </div>
                      {m.sku && (
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "var(--gray)",
                            fontFamily: "monospace",
                            marginTop: "0.1rem",
                          }}
                        >
                          {m.sku}
                        </div>
                      )}
                    </td>
                    <td
                      style={{ padding: "0.75rem 1rem", textAlign: "center" }}
                    >
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
                          background: m.color + "1a",
                          color: m.color,
                          border: `1px solid ${m.color}33`,
                        }}
                      >
                        {m.typeLabel}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        textAlign: "center",
                        fontWeight: 700,
                        color: m.qtyIn > 0 ? "#22c55e" : "var(--gray)",
                      }}
                    >
                      {m.qtyIn > 0 ? `+${m.qtyIn}` : "—"}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        textAlign: "center",
                        fontWeight: 700,
                        color: m.qtyOut > 0 ? "#ef4444" : "var(--gray)",
                      }}
                    >
                      {m.qtyOut > 0 ? `-${m.qtyOut}` : "—"}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        color: "#E5E2E1",
                        fontSize: "0.82rem",
                      }}
                    >
                      {m.performedBy}
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

// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function StocksPage() {
  const [activeTab, setActiveTab] = useState("current");
  const [materials, setMaterials] = useState([]);
  const [stockOuts, setStockOuts] = useState([]);
  const [showGoodsIssue, setShowGoodsIssue] = useState(false);
  const [goodsIssueItem, setGoodsIssueItem] = useState(null);

  const refresh = useCallback(() => {
    setMaterials(getStore(MATERIALS_KEY));
    setStockOuts(getStore(STOCK_OUT_KEY));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Batch Helper Functions ────────────────────────────────────────────────
  const computeStockFromBatches = (batches) => {
    if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
    return batches.reduce(
      (sum, b) => sum + (b.remainingQty || b.goodQty || b.qtyGood || 0),
      0,
    );
  };

  // FIFO cost = unit cost of the OLDEST active batch (next batch to be issued)
  // This reflects the actual cost that will be used for the next stock-out
  const computeAveCostFromBatches = (batches) => {
    if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
    const oldest = [...batches]
      .filter((b) => (b.remainingQty || 0) > 0)
      .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))[0];
    return oldest ? oldest.unitCost || 0 : 0;
  };

  // ── Goods Issue Handler — from GoodsIssueModal ─────────────────────────
  const handleGoodsIssueConfirm = (data) => {
    const { issueType, performedBy, remarks, variants, totals } = data;
    const now = new Date().toISOString();
    const mats = getStore(MATERIALS_KEY);
    const log = getStore(STOCK_OUT_KEY);

    for (const variant of variants) {
      const qtyFulfilled = variant.qtyFulfilled;
      if (qtyFulfilled <= 0) continue;

      const mat = mats.find((m) => m.id === variant.variantId);
      if (!mat) continue;

      // Deduct from batches
      if (data.batchMode === "fifo") {
        const result = deductFromBatchesFIFO(mat.batches, qtyFulfilled);
        if (!result.success) {
          console.error("FIFO deduction failed:", result.error);
          continue;
        }
      } else {
        // Pick mode: manual batch deduction
        for (const c of variant.batches) {
          const batch = mat.batches.find((b) => b.batchId === c.batchId);
          if (!batch) continue;
          batch.remainingQty = Math.max(0, (batch.remainingQty || 0) - c.take);
          if (batch.remainingQty === 0) batch.status = "exhausted";
        }
      }

      // Sync stockQty
      mat.stockQty = mat.batches.reduce((s, b) => s + (b.remainingQty || 0), 0);
      mat.updatedAt = now;

      // If variant child, sync parent stockQty
      if (mat.parentId) {
        const parentIdx = mats.findIndex((m) => m.id === mat.parentId);
        if (parentIdx !== -1) {
          const parent = mats[parentIdx];
          const siblings = mats.filter((m) => m.parentId === mat.parentId);
          parent.stockQty = siblings.reduce(
            (s, sib) =>
              s +
              (sib.batches || []).reduce(
                (ss, b) => ss + (b.remainingQty || 0),
                0,
              ),
            0,
          );
          parent.updatedAt = now;
        }
      }
    }

    setStore(MATERIALS_KEY, mats);
    setMaterials(getStore(MATERIALS_KEY));

    // Log to stock-out
    for (const variant of variants) {
      if (variant.qtyFulfilled <= 0) continue;
      const mat = mats.find((m) => m.id === variant.variantId);
      const unitCost =
        variant.qtyFulfilled > 0
          ? (variant.totalCostValue || 0) / variant.qtyFulfilled
          : 0;

      log.push({
        id: genDocNumber("GI"),
        materialId: variant.variantId,
        materialName: variant.variantName,
        variantId: variant.variantId,
        variantName: variant.variantName,
        sku: variant.sku,
        category: mat?.category || "",
        uom: variant.uom || mat?.uom || "pcs",
        issueType,
        quantity: variant.qtyFulfilled,
        unitCost,
        totalCost: variant.qtyFulfilled * unitCost,
        performedBy: performedBy || "",
        notes: remarks || "",
        batchBreakdown: variant.batches.map((b) => ({
          batchId: b.batchId,
          qty: b.take,
          unitCost: b.unitCost || 0,
          totalCost: b.totalCost || 0,
        })),
        previousStock: mat?.stockQty || 0,
        newStock: mat?.stockQty || 0,
        totalLoss: variant.totalCostValue || 0,
        dateIssued: now,
        createdAt: now,
      });
    }

    setStore(STOCK_OUT_KEY, log);
    setStockOuts(getStore(STOCK_OUT_KEY));
    refresh();
  };

  const tabStyle = (tab) => ({
    padding: "0.625rem 1.25rem",
    fontSize: "0.825rem",
    fontWeight: 700,
    cursor: "pointer",
    borderRadius: "8px",
    border: "none",
    background: activeTab === tab ? "var(--gold)" : "transparent",
    color: activeTab === tab ? "#000" : "var(--gray)",
    transition: "all 0.15s",
  });

  return (
    <div className="page-content-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Stocks</h1>
            <p className="page-subtitle">
              Monitor stock levels, track movements, and manage goods issues.
            </p>
          </div>
        </div>

        {/* Tab Switcher — 3 tabs only */}
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "10px",
            padding: "0.25rem",
            width: "fit-content",
          }}
        >
          <button
            style={tabStyle("current")}
            onClick={() => setActiveTab("current")}
          >
            Current Stock
          </button>
          <button
            style={tabStyle("movement")}
            onClick={() => setActiveTab("movement")}
          >
            Movement History
          </button>
          <button
            style={tabStyle("reports")}
            onClick={() => setActiveTab("reports")}
          >
            Reports
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "current" && (
        <StockOverviewTab
          materials={materials}
          onIssueStock={() => {
            if (materials.length === 0) return;
            setGoodsIssueItem(
              materials.find((m) => !m.parentId && (m.stockQty || 0) > 0) ||
                materials[0],
            );
            setShowGoodsIssue(true);
          }}
        />
      )}
      {activeTab === "movement" && (
        <MovementHistoryTab stockOuts={stockOuts} materials={materials} />
      )}
      {activeTab === "reports" && (
        <InventoryReports materials={materials} stockOuts={stockOuts} />
      )}

      {/* Goods Issue Modal */}
      {showGoodsIssue && goodsIssueItem && (
        <GoodsIssueModal
          isOpen={showGoodsIssue}
          onClose={() => {
            setShowGoodsIssue(false);
            setGoodsIssueItem(null);
          }}
          onConfirm={handleGoodsIssueConfirm}
          item={goodsIssueItem}
          inventory={materials}
        />
      )}
    </div>
  );
}
