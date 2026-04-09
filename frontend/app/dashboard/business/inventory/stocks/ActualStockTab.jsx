"use client";

// DEPRECATED — replaced by Current Stock tab in stocks/page.jsx
// This file is kept for reference but is no longer rendered in the UI.
// Safe to delete once the new Current Stock tab is fully validated.

import CustomDropdown from "@/app/components/CustomDropdown";
import React, { useEffect, useMemo, useState } from "react";

// ── Storage Helpers ──────────────────────────────────────────────────────────────
function getStore(key) {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

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

// ══════════════════════════════════════════════════════════════════════════════
// ACTUAL STOCK TAB — Simplified User-Friendly View
// Shows: Total Stock (Goods + Damaged), In Transit/Pending PO, Summary Cards
// ══════════════════════════════════════════════════════════════════════════════
export default function ActualStockTab({ materials }) {
  const [expandedMaterial, setExpandedMaterial] = useState(null);
  const [expandedChild, setExpandedChild] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [viewMode, setViewMode] = useState("product");
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [showCSVPreview, setShowCSVPreview] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [pendingPOs, setPendingPOs] = useState([]);

  // Load pending POs for In Transit calculation
  useEffect(() => {
    const allPOs = getStore("pmp_purchase_orders");
    setPendingPOs(
      allPOs.filter((p) => p.status === "pending" || p.status === "partial"),
    );
  }, []);

  // Calculate In Transit per material from pending/partial POs
  const inTransitMap = useMemo(() => {
    const map = {};
    pendingPOs.forEach((po) => {
      (po.items || []).forEach((item) => {
        const ordered = parseInt(item.qty) || 0;
        const received = parseInt(item.receivedQty) || 0;
        const inTransit = Math.max(0, ordered - received);
        if (inTransit > 0) {
          if (!map[item.materialId]) map[item.materialId] = 0;
          map[item.materialId] += inTransit;
        }
      });
    });
    return map;
  }, [pendingPOs]);

  // Print Invoice Report
  const handlePrintInvoices = () => {
    const data = filteredInvoices;
    const totalGood = data.reduce(
      (s, inv) => s + inv.items.reduce((ss, it) => ss + it.good, 0),
      0,
    );
    const totalDamaged = data.reduce(
      (s, inv) => s + inv.items.reduce((ss, it) => ss + it.damaged, 0),
      0,
    );
    const totalValue = data.reduce(
      (s, inv) => s + inv.items.reduce((ss, it) => ss + it.value, 0),
      0,
    );
    const now = new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let rows = "";
    data.forEach((inv) => {
      let itemRows = inv.items
        .map(
          (it) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#333;font-size:12px;">${it.materialName}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;font-size:12px;">${it.variantName !== "—" ? it.variantName : ""}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">${it.good}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">${it.damaged}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">${it.total}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-family:monospace;">₱${it.unitCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-family:monospace;">₱${it.value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
        </tr>
      `,
        )
        .join("");
      rows += `
        <tr style="background:#f9fafb;">
          <td colspan="7" style="padding:10px;font-weight:700;font-size:13px;color:#111;border-bottom:2px solid #ddd;">
            ${inv.invoiceNo} — ${inv.vendorName} (${new Date(inv.dateReceived).toLocaleDateString("en-PH")})
          </td>
        </tr>
        ${itemRows}
        <tr>
          <td colspan="3" style="padding:6px 10px;font-size:11px;color:#666;font-weight:600;border-bottom:1px solid #eee;">Invoice Total:</td>
          <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:700;border-bottom:1px solid #eee;">${inv.items.reduce((s, it) => s + it.good, 0)} good</td>
          <td style="padding:6px 10px;text-align:right;font-size:12px;border-bottom:1px solid #eee;">${inv.items.reduce((s, it) => s + it.damaged, 0)} damaged</td>
          <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:700;border-bottom:1px solid #eee;">${inv.items.reduce((s, it) => s + it.total, 0)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;"></td>
          <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:700;font-family:monospace;border-bottom:1px solid #eee;">₱${inv.items.reduce((s, it) => s + it.value, 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    });

    const html = `<!DOCTYPE html><html><head><title>Batch Inventory Report</title>
      <style>@page{size:letter;margin:1in}body{font-family:Segoe UI,Arial,sans-serif;margin:0;color:#111}h1{font-size:18px;margin:0}h2{font-size:13px;color:#666;margin:4px 0 16px}table{width:100%;border-collapse:collapse}th{padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;background:#f3f4f6;border-bottom:2px solid #ddd}
      .summary{display:flex;gap:24px;margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px}.summary-item{font-size:13px}.summary-label{color:#666;font-size:10px;text-transform:uppercase;font-weight:700}.summary-value{font-weight:700;font-family:monospace}
      </style></head><body>
      <h1>PERSONALIZE ME PRINTS</h1><h2>Batch Inventory Report — By Invoice | Generated: ${now}</h2>
      <div class="summary">
        <div class="summary-item"><span class="summary-label">Total Good</span><br><span class="summary-value">${totalGood} pcs</span></div>
        <div class="summary-item"><span class="summary-label">Total Damaged</span><br><span class="summary-value">${totalDamaged} pcs</span></div>
        <div class="summary-item"><span class="summary-label">Total Value</span><br><span class="summary-value">₱${totalValue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span></div>
        <div class="summary-item"><span class="summary-label">Invoices</span><br><span class="summary-value">${data.length}</span></div>
      </div>
      <table><thead><tr>
        <th>Material</th><th>Variant</th>
        <th style="text-align:right">Good</th><th style="text-align:right">Damaged</th><th style="text-align:right">Total</th>
        <th style="text-align:right">Unit Cost</th><th style="text-align:right">Value</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.print();
    }, 500);
  };

  // Summary cards: Total Goods Stock, Total Actual Stock, Total Waste, Total Goods Value, Total Waste Value, Backorders
  const summaryCards = useMemo(() => {
    let totalStock = 0,
      outOfStock = 0,
      lowStock = 0;
    let totalGoodsCost = 0,
      totalInventoryLoss = 0;
    let totalActualStock = 0,
      totalWaste = 0;
    let totalInTransit = 0,
      totalBackorders = 0;
    let arrivalDamage = 0,
      internalDamage = 0;
    let arrivalDamageValue = 0,
      internalDamageValue = 0;

    materials.forEach((m) => {
      if (m.parentId) return; // Skip children - only process parent materials

      // Add In Transit from pending POs
      totalInTransit += inTransitMap[m.id] || 0;

      const batches = m.batches || [];
      const hasChildren = m.hasVariants;

      // For parents with variants, aggregate stock from children
      if (hasChildren) {
        const children = materials.filter((child) => child.parentId === m.id);
        let parentGoodStock = 0,
          parentDamaged = 0;

        children.forEach((child) => {
          const childBatches = child.batches || [];
          // Backward compatibility: check both qtyGood and goodQty
          const childGood = childBatches.reduce(
            (s, b) => s + (b.qtyGood || b.goodQty || 0),
            0,
          );
          // Backward compatibility: check both qtyDamaged and damagedQty
          const childDamaged = childBatches.reduce(
            (s, b) => s + (b.qtyDamaged || b.damagedQty || 0),
            0,
          );
          parentGoodStock += childGood;
          parentDamaged += childDamaged;
          totalWaste += childDamaged;

          // Split arrival vs internal damage
          childBatches.forEach((b) => {
            const damagedQty = b.qtyDamaged || b.damagedQty || 0;
            const cost = b.unitCost || 0;
            if (b.damageType === "arrival") {
              arrivalDamage += damagedQty;
              arrivalDamageValue += damagedQty * cost;
            } else {
              internalDamage += damagedQty;
              internalDamageValue += damagedQty * cost;
            }
            totalInventoryLoss += damagedQty * cost;
          });

          // Calculate costs from children batches
          childBatches.forEach((b) => {
            const remaining = b.remainingQty || 0;
            const cost = b.unitCost || 0;
            totalGoodsCost += remaining * cost;
          });
        });

        const parentTotal = parentGoodStock + parentDamaged;
        totalStock += parentGoodStock;
        totalActualStock += parentTotal;

        const minStock = m.minStock || 10;
        if (parentGoodStock === 0 && m.procurementType !== "on-demand")
          outOfStock++;
        else if (
          parentGoodStock > 0 &&
          parentGoodStock < minStock &&
          m.procurementType !== "on-demand"
        )
          lowStock++;
      } else {
        // For standalone materials (no variants), use their own batches
        // Backward compatibility: check both qtyGood and goodQty
        const goodStock = batches.reduce(
          (s, b) => s + (b.qtyGood || b.goodQty || 0),
          0,
        );
        // Backward compatibility: check both qtyDamaged and damagedQty
        const damaged = batches.reduce(
          (s, b) => s + (b.qtyDamaged || b.damagedQty || 0),
          0,
        );
        const total = goodStock + damaged;
        totalStock += goodStock;
        totalActualStock += total;
        totalWaste += damaged;

        const minStock = m.minStock || 10;
        if (goodStock === 0 && m.procurementType !== "on-demand") outOfStock++;
        else if (
          goodStock > 0 &&
          goodStock < minStock &&
          m.procurementType !== "on-demand"
        )
          lowStock++;

        batches.forEach((b) => {
          const remaining = b.remainingQty || 0;
          const damagedQty = b.qtyDamaged || b.damagedQty || 0;
          const cost = b.unitCost || 0;
          if (b.damageType === "arrival") {
            arrivalDamage += damagedQty;
            arrivalDamageValue += damagedQty * cost;
          } else {
            internalDamage += damagedQty;
            internalDamageValue += damagedQty * cost;
          }
          totalInventoryLoss += damagedQty * cost;
          totalGoodsCost += remaining * cost;
        });
      }
    });

    // Calculate total backorders
    const backorders = getStore("pmp_backorders");
    totalBackorders = backorders
      .filter((bo) => bo.status === "pending")
      .reduce((sum, bo) => sum + (bo.qty || 0), 0);

    return {
      totalStock,
      outOfStock,
      lowStock,
      totalGoodsCost,
      totalActualStock,
      totalInventoryLoss,
      totalInTransit,
      totalWaste,
      totalBackorders,
      arrivalDamage,
      internalDamage,
      arrivalDamageValue,
      internalDamageValue,
    };
  }, [materials, inTransitMap]);

  const categories = [
    ...new Set(
      materials
        .filter((m) => !m.parentId)
        .map((m) => m.category)
        .filter(Boolean),
    ),
  ];

  // Build invoice groups from all active batches
  const invoiceGroups = useMemo(() => {
    const map = {};
    const processedChildIds = new Set();
    // Only iterate parent materials to avoid double-counting variant children
    materials
      .filter((m) => !m.parentId)
      .forEach((m) => {
        const hasChildren = m.hasVariants;
        if (hasChildren) {
          const children = materials.filter((c) => c.parentId === m.id);
          children.forEach((child) => {
            processedChildIds.add(child.id);
            (child.batches || []).forEach((b) => {
              if ((b.remainingQty || 0) <= 0 && (b.qtyDamaged || 0) <= 0)
                return;
              const inv = b.invoiceNumber || b.invoiceNo || "No Invoice";
              if (!map[inv]) {
                map[inv] = {
                  invoiceNo: inv,
                  vendorName: b.vendorName || "—",
                  dateReceived: b.dateReceived || b.createdAt || "",
                  items: [],
                };
              }
              const good = b.qtyGood || b.remainingQty || 0;
              const damaged = b.qtyDamaged || b.damagedQty || 0;
              map[inv].items.push({
                materialName: m.name,
                variantName: child.name,
                uom: child.uom || m.uom || "pcs",
                good,
                damaged,
                total: good + damaged,
                unitCost: b.unitCost || 0,
                value: (good + damaged) * (b.unitCost || 0),
              });
            });
          });
        } else {
          (m.batches || []).forEach((b) => {
            if ((b.remainingQty || 0) <= 0 && (b.qtyDamaged || 0) <= 0) return;
            const inv = b.invoiceNumber || b.invoiceNo || "No Invoice";
            if (!map[inv]) {
              map[inv] = {
                invoiceNo: inv,
                vendorName: b.vendorName || "—",
                dateReceived: b.dateReceived || b.createdAt || "",
                items: [],
              };
            }
            const good = b.qtyGood || b.remainingQty || 0;
            const damaged = b.qtyDamaged || b.damagedQty || 0;
            map[inv].items.push({
              materialName: m.name,
              variantName: "—",
              uom: m.uom || "pcs",
              good,
              damaged,
              total: good + damaged,
              unitCost: b.unitCost || 0,
              value: (good + damaged) * (b.unitCost || 0),
            });
          });
        }
      });
    // Also iterate child materials that might have batches but weren't linked to a parent with hasVariants
    materials
      .filter((m) => m.parentId && !processedChildIds.has(m.id))
      .forEach((child) => {
        (child.batches || []).forEach((b) => {
          if ((b.remainingQty || 0) <= 0 && (b.qtyDamaged || 0) <= 0) return;
          const inv = b.invoiceNumber || b.invoiceNo || "No Invoice";
          if (!map[inv]) {
            map[inv] = {
              invoiceNo: inv,
              vendorName: b.vendorName || "—",
              dateReceived: b.dateReceived || b.createdAt || "",
              items: [],
            };
          }
          const good = b.qtyGood || b.remainingQty || 0;
          const damaged = b.qtyDamaged || b.damagedQty || 0;
          // Find parent name if available
          const parent = materials.find((p) => p.id === child.parentId);
          map[inv].items.push({
            materialName: parent ? parent.name : child.name,
            variantName: child.name,
            uom: child.uom || "pcs",
            good,
            damaged,
            total: good + damaged,
            unitCost: b.unitCost || 0,
            value: (good + damaged) * (b.unitCost || 0),
          });
        });
      });
    // Sort by date descending
    return Object.values(map).sort(
      (a, b) => new Date(b.dateReceived) - new Date(a.dateReceived),
    );
  }, [materials]);

  // Filter parent materials (product view)
  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (m.parentId) return false;
      if (categoryFilter && m.category !== categoryFilter) return false;
      const q = search.toLowerCase();
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !(m.sku || "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [materials, categoryFilter, search]);

  // Filter invoice groups (invoice view)
  const filteredInvoices = useMemo(() => {
    let groups = invoiceGroups;
    if (categoryFilter) {
      groups = groups.filter((inv) =>
        inv.items.some((it) => {
          const mat = materials.find((m) => m.name === it.materialName);
          return mat && mat.category === categoryFilter;
        }),
      );
    }
    if (search) {
      const q = search.toLowerCase();
      groups = groups.filter(
        (inv) =>
          inv.invoiceNo.toLowerCase().includes(q) ||
          inv.vendorName.toLowerCase().includes(q) ||
          inv.items.some(
            (it) =>
              it.materialName.toLowerCase().includes(q) ||
              it.variantName.toLowerCase().includes(q) ||
              it.sku.toLowerCase().includes(q),
          ),
      );
    }
    return groups;
  }, [invoiceGroups, categoryFilter, search, materials]);

  // ── CSV Preview Data ────────────────────────────────────────────────────
  const csvPreviewData = useMemo(() => {
    if (viewMode !== "invoice" || filteredInvoices.length === 0) return null;
    const rows = [];
    let grandGood = 0,
      grandDamaged = 0,
      grandTotal = 0,
      grandValue = 0;
    filteredInvoices.forEach((inv) => {
      let invGood = 0,
        invDamaged = 0,
        invTotal = 0,
        invValue = 0;
      inv.items.forEach((it) => {
        rows.push({
          type: "item",
          invoice: inv.invoiceNo,
          vendor: inv.vendorName,
          date: inv.dateReceived
            ? new Date(inv.dateReceived).toLocaleDateString("en-PH")
            : "",
          material: it.materialName,
          variant: it.variantName !== "—" ? it.variantName : "",
          good: it.good,
          damaged: it.damaged,
          total: it.total,
          unitCost: (it.unitCost || 0).toFixed(2),
          value: (it.value || 0).toFixed(2),
        });
        invGood += it.good;
        invDamaged += it.damaged;
        invTotal += it.total;
        invValue += it.value || 0;
      });
      rows.push({
        type: "subtotal",
        invoice: inv.invoiceNo,
        good: invGood,
        damaged: invDamaged,
        total: invTotal,
        value: invValue.toFixed(2),
      });
      grandGood += invGood;
      grandDamaged += invDamaged;
      grandTotal += invTotal;
      grandValue += invValue;
    });
    rows.push({
      type: "grand",
      good: grandGood,
      damaged: grandDamaged,
      total: grandTotal,
      value: grandValue.toFixed(2),
    });
    return rows;
  }, [filteredInvoices, viewMode]);

  // Generate grouped CSV string
  const generateCSV = () => {
    const data = filteredInvoices;
    if (data.length === 0) return "";
    const lines = [];
    lines.push(
      [
        "Invoice No",
        "Supplier",
        "Date",
        "Material",
        "Variant",
        "Good",
        "Damaged",
        "Total",
        "Unit Cost",
        "Value",
      ].join(","),
    );
    let grandGood = 0,
      grandDamaged = 0,
      grandTotal = 0,
      grandValue = 0;
    data.forEach((inv) => {
      let invGood = 0,
        invDamaged = 0,
        invTotal = 0,
        invValue = 0;
      const date = inv.dateReceived
        ? new Date(inv.dateReceived).toLocaleDateString("en-PH")
        : "";
      inv.items.forEach((it) => {
        lines.push(
          [
            inv.invoiceNo,
            `"${inv.vendorName}"`,
            date,
            `"${it.materialName}"`,
            it.variantName !== "—" ? `"${it.variantName}"` : "",
            it.good,
            it.damaged,
            it.total,
            (it.unitCost || 0).toFixed(2),
            (it.value || 0).toFixed(2),
          ].join(","),
        );
        invGood += it.good;
        invDamaged += it.damaged;
        invTotal += it.total;
        invValue += it.value || 0;
      });
      lines.push(
        [
          `SUBTOTAL: ${inv.invoiceNo}`,
          "",
          "",
          "",
          "",
          invGood,
          invDamaged,
          invTotal,
          "",
          invValue.toFixed(2),
        ].join(","),
      );
      grandGood += invGood;
      grandDamaged += invDamaged;
      grandTotal += invTotal;
      grandValue += invValue;
    });
    lines.push(
      [
        "GRAND TOTAL",
        "",
        "",
        "",
        "",
        grandGood,
        grandDamaged,
        grandTotal,
        "",
        grandValue.toFixed(2),
      ].join(","),
    );
    return lines.join("\n");
  };

  // Download CSV (from preview modal)
  const handleDownloadCSV = () => {
    const csvContent = generateCSV();
    if (!csvContent) return;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `actual-stock-by-invoice-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowCSVPreview(false);
  };

  // Pagination
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div>
      {/* ── Summary Cards ── */}
      <div className="inventory-summary" style={{ marginBottom: "1.5rem" }}>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{summaryCards.totalStock}</span>
            <span className="summary-label">Total Goods Stock</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">
              {summaryCards.totalActualStock}
            </span>
            <span className="summary-label">Total Actual Stock</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value" style={{ color: "#f59e0b" }}>
              {summaryCards.arrivalDamage}
            </span>
            <span className="summary-label">External Issues</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value" style={{ color: "#ef4444" }}>
              {summaryCards.internalDamage}
            </span>
            <span className="summary-label">Internal Issues</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span
              className="summary-value"
              style={{ color: "#D4A843", fontSize: "1rem" }}
            >
              ₱
              {summaryCards.totalGoodsCost.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="summary-label">Total Goods Value</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span
              className="summary-value"
              style={{ color: "#f59e0b", fontSize: "1rem" }}
            >
              ₱
              {summaryCards.arrivalDamageValue.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="summary-label">External Issues Value</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span
              className="summary-value"
              style={{ color: "#ef4444", fontSize: "1rem" }}
            >
              ₱
              {summaryCards.internalDamageValue.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="summary-label">Internal Issues Value</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar (matches Goods Stock tab style) ── */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <div
          className="search-wrapper"
          style={{ maxWidth: "280px", flex: "1", minWidth: "200px" }}
        >
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
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
          {search && (
            <button
              className="search-clear"
              onClick={() => {
                setSearch("");
                setCurrentPage(1);
              }}
            >
              ×
            </button>
          )}
        </div>
        <CustomDropdown
          value={categoryFilter}
          onChange={(val) => {
            setCategoryFilter(val);
            setCurrentPage(1);
          }}
          options={[
            { value: "", label: "All Categories" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          placeholder="All Categories"
          style={{ minWidth: "140px" }}
        />
        {/* View Mode Toggle */}
        <div
          style={{
            display: "flex",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "8px",
            padding: "3px",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {[
            ["product", "By Product"],
            ["invoice", "By Invoice"],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setViewMode(val);
                setCurrentPage(1);
                setExpandedInvoice(null);
              }}
              style={{
                padding: "0.4rem 0.875rem",
                fontSize: "0.78rem",
                fontWeight: 700,
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                background: viewMode === val ? "#D4A843" : "transparent",
                color: viewMode === val ? "#000" : "var(--gray)",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Print + CSV Buttons (only for invoice view) */}
        {viewMode === "invoice" && (
          <>
            <button
              onClick={() => setShowCSVPreview(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 1rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#E5E2E1",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
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
              Export CSV
            </button>
            <button
              onClick={handlePrintInvoices}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 1rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#E5E2E1",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
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
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print
            </button>
          </>
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-invoice-report, .print-invoice-report * { visibility: visible; }
          .print-invoice-report { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ── Product View ── */}
      {viewMode === "product" && (
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
                <th style={{ ...thStyle, width: "40px" }}></th>
                <th style={thStyle}>SKU / Name</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Category</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Good Stock</th>
                <th
                  style={{ ...thStyle, textAlign: "center", color: "#f59e0b" }}
                >
                  External Iss.
                </th>
                <th
                  style={{ ...thStyle, textAlign: "center", color: "#ef4444" }}
                >
                  Internal Iss.
                </th>
                <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Unit Cost</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Goods Value</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
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
                paginatedItems.map((mat) => {
                  // For parents with variants, aggregate stock from children
                  const hasChildren = mat.hasVariants;
                  let batches,
                    goodStock,
                    damaged,
                    arrivalDamaged,
                    internalDamaged,
                    totalStock,
                    avgCost,
                    goodsValue,
                    children;

                  if (hasChildren) {
                    // Get all children batches
                    children = materials.filter(
                      (child) => child.parentId === mat.id,
                    );
                    const allChildrenBatches = children.flatMap(
                      (child) => child.batches || [],
                    );
                    batches = allChildrenBatches;
                    goodStock = allChildrenBatches.reduce(
                      (s, b) => s + (b.qtyGood || 0),
                      0,
                    );
                    damaged = allChildrenBatches.reduce(
                      (s, b) => s + (b.qtyDamaged || 0),
                      0,
                    );
                    arrivalDamaged = allChildrenBatches.reduce(
                      (s, b) =>
                        s +
                        (b.damageType === "arrival" ? b.qtyDamaged || 0 : 0),
                      0,
                    );
                    internalDamaged = allChildrenBatches.reduce(
                      (s, b) =>
                        s +
                        (b.damageType === "arrival" ? 0 : b.qtyDamaged || 0),
                      0,
                    );
                    totalStock = goodStock + damaged;
                    // FIX 4: Weighted average cost (not simple average)
                    const totalQty4 = allChildrenBatches.reduce(
                      (s, b) => s + (b.remainingQty || 0),
                      0,
                    );
                    const totalVal4 = allChildrenBatches.reduce(
                      (s, b) => s + (b.remainingQty || 0) * (b.unitCost || 0),
                      0,
                    );
                    avgCost =
                      totalQty4 > 0 ? totalVal4 / totalQty4 : mat.baseCost || 0;
                    goodsValue = goodStock * avgCost;
                  } else {
                    // Standalone material - use its own batches
                    batches = mat.batches || [];
                    goodStock = batches.reduce(
                      (s, b) => s + (b.qtyGood || 0),
                      0,
                    );
                    damaged = batches.reduce(
                      (s, b) => s + (b.qtyDamaged || 0),
                      0,
                    );
                    arrivalDamaged = batches.reduce(
                      (s, b) =>
                        s +
                        (b.damageType === "arrival" ? b.qtyDamaged || 0 : 0),
                      0,
                    );
                    internalDamaged = batches.reduce(
                      (s, b) =>
                        s +
                        (b.damageType === "arrival" ? 0 : b.qtyDamaged || 0),
                      0,
                    );
                    totalStock = goodStock + damaged;
                    // FIX 4: Weighted average cost (not simple average)
                    const totalQty4s = batches.reduce(
                      (s, b) => s + (b.remainingQty || 0),
                      0,
                    );
                    const totalVal4s = batches.reduce(
                      (s, b) => s + (b.remainingQty || 0) * (b.unitCost || 0),
                      0,
                    );
                    avgCost =
                      totalQty4s > 0
                        ? totalVal4s / totalQty4s
                        : mat.baseCost || 0;
                    goodsValue = goodStock * avgCost;
                  }

                  const isExpanded = expandedMaterial === mat.id;
                  // Variant parents should always be expandable to show children
                  const shouldShowChevron = hasChildren || batches.length > 0;

                  return (
                    <React.Fragment key={mat.id}>
                      <tr
                        style={{
                          borderBottom: isExpanded
                            ? "none"
                            : "1px solid rgba(255,255,255,0.04)",
                          cursor: shouldShowChevron ? "pointer" : "default",
                        }}
                        onClick={() =>
                          shouldShowChevron &&
                          setExpandedMaterial(isExpanded ? null : mat.id)
                        }
                        onMouseEnter={(e) => {
                          if (!isExpanded)
                            e.currentTarget.style.background =
                              "rgba(255,255,255,0.02)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded)
                            e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <td
                          style={{ padding: "0.875rem 0.5rem 0.875rem 1rem" }}
                        >
                          {shouldShowChevron && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedMaterial(isExpanded ? null : mat.id);
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
                          )}
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#E5E2E1",
                              fontSize: "0.875rem",
                            }}
                          >
                            {mat.name}
                          </div>
                          {mat.sku && (
                            <div
                              style={{
                                fontSize: "0.65rem",
                                color: "var(--gray)",
                                fontFamily: "monospace",
                                marginTop: "0.1rem",
                              }}
                            >
                              {mat.sku}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                          }}
                        >
                          {mat.category ? (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--gray)",
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                padding: "0.15rem 0.5rem",
                                borderRadius: "4px",
                              }}
                            >
                              {mat.category}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: "#E5E2E1",
                            fontFamily: "monospace",
                          }}
                        >
                          {goodStock}{" "}
                          <span
                            style={{
                              color: "var(--gray)",
                              fontWeight: 400,
                              fontSize: "0.75rem",
                            }}
                          >
                            {mat.uom || "pcs"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: arrivalDamaged > 0 ? "#f59e0b" : "#6b7280",
                            fontFamily: "monospace",
                          }}
                        >
                          {arrivalDamaged}{" "}
                          <span
                            style={{
                              color: "var(--gray)",
                              fontWeight: 400,
                              fontSize: "0.75rem",
                            }}
                          >
                            {mat.uom || "pcs"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: internalDamaged > 0 ? "#ef4444" : "#6b7280",
                            fontFamily: "monospace",
                          }}
                        >
                          {internalDamaged}{" "}
                          <span
                            style={{
                              color: "var(--gray)",
                              fontWeight: 400,
                              fontSize: "0.75rem",
                            }}
                          >
                            {mat.uom || "pcs"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: "#E5E2E1",
                            fontFamily: "monospace",
                          }}
                        >
                          {totalStock}{" "}
                          <span
                            style={{
                              color: "var(--gray)",
                              fontWeight: 400,
                              fontSize: "0.75rem",
                            }}
                          >
                            {mat.uom || "pcs"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "right",
                            color: "#D4A843",
                            fontFamily: "monospace",
                          }}
                        >
                          ₱{avgCost.toFixed(2)}
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "right",
                            fontWeight: 700,
                            color: "#E5E2E1",
                            fontFamily: "monospace",
                          }}
                        >
                          ₱
                          {goodsValue.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                      {/* Expanded: Variant Children or Batch Details */}
                      {isExpanded && shouldShowChevron && (
                        <tr>
                          <td
                            colSpan={8}
                            style={{
                              padding: 0,
                              background: "rgba(0,0,0,0.2)",
                            }}
                          >
                            {hasChildren ? (
                              // Show children variants as sub-rows
                              <div
                                style={{
                                  padding: "0.75rem 1.25rem 0.75rem 3rem",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.62rem",
                                    color: "#D4A843",
                                    textTransform: "uppercase",
                                    marginBottom: "0.6rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  Variant Children ({(children || []).length})
                                </div>
                                {(children || []).length === 0 ? (
                                  <div
                                    style={{
                                      padding: "1rem",
                                      textAlign: "center",
                                      color: "var(--gray)",
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    No variants found.
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      border:
                                        "1px solid rgba(255,255,255,0.06)",
                                      borderRadius: "8px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <table
                                      style={{
                                        width: "100%",
                                        fontSize: "0.75rem",
                                        borderCollapse: "collapse",
                                      }}
                                    >
                                      <thead>
                                        <tr
                                          style={{
                                            background: "rgba(0,0,0,0.3)",
                                            borderBottom:
                                              "1px solid rgba(255,255,255,0.06)",
                                          }}
                                        >
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "center",
                                              color: "#D4A843",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                              width: "30px",
                                            }}
                                          ></th>
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "left",
                                              color: "#D4A843",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                            }}
                                          >
                                            SKU
                                          </th>
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "left",
                                              color: "#D4A843",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                            }}
                                          >
                                            Variant
                                          </th>
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "center",
                                              color: "#D4A843",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                            }}
                                          >
                                            Good
                                          </th>
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "center",
                                              color: "#f59e0b",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                            }}
                                          >
                                            External Iss.
                                          </th>
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "center",
                                              color: "#ef4444",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                            }}
                                          >
                                            Internal Iss.
                                          </th>
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "center",
                                              color: "#D4A843",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                            }}
                                          >
                                            Total
                                          </th>
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "right",
                                              color: "#D4A843",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                            }}
                                          >
                                            Unit Cost
                                          </th>
                                          <th
                                            style={{
                                              padding: "0.4rem 0.6rem",
                                              textAlign: "center",
                                              color: "#D4A843",
                                              fontWeight: 700,
                                              fontSize: "0.6rem",
                                              textTransform: "uppercase",
                                            }}
                                          >
                                            Status
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {children.map((child, cIdx) => {
                                          const childBatches =
                                            child.batches || [];
                                          const childGood = childBatches.reduce(
                                            (s, b) => s + (b.qtyGood || 0),
                                            0,
                                          );
                                          const childDamaged =
                                            childBatches.reduce(
                                              (s, b) => s + (b.qtyDamaged || 0),
                                              0,
                                            );
                                          const childArrivalDamaged =
                                            childBatches.reduce(
                                              (s, b) =>
                                                s +
                                                (b.damageType === "arrival"
                                                  ? b.qtyDamaged || 0
                                                  : 0),
                                              0,
                                            );
                                          const childInternalDamaged =
                                            childBatches.reduce(
                                              (s, b) =>
                                                s +
                                                (b.damageType === "arrival"
                                                  ? 0
                                                  : b.qtyDamaged || 0),
                                              0,
                                            );
                                          const childTotal =
                                            childGood + childDamaged;
                                          const childCost =
                                            childBatches.length > 0
                                              ? (() => {
                                                  const cq =
                                                    childBatches.reduce(
                                                      (s, b) =>
                                                        s +
                                                        (b.remainingQty || 0),
                                                      0,
                                                    );
                                                  const cv =
                                                    childBatches.reduce(
                                                      (s, b) =>
                                                        s +
                                                        (b.remainingQty || 0) *
                                                          (b.unitCost || 0),
                                                      0,
                                                    );
                                                  return cq > 0
                                                    ? cv / cq
                                                    : child.baseCost || 0;
                                                })()
                                              : child.baseCost || 0;
                                          let childStatus = "No Batches";
                                          let childStatusColor = "#6b7280";
                                          if (
                                            childBatches.length > 0 &&
                                            childGood === 0 &&
                                            childDamaged > 0
                                          ) {
                                            childStatus = "All Damaged";
                                            childStatusColor = "#ef4444";
                                          } else if (
                                            childBatches.length > 0 &&
                                            childGood === 0
                                          ) {
                                            childStatus = "Out of Stock";
                                          } else if (
                                            childGood > 0 &&
                                            childGood < (child.minStock || 10)
                                          ) {
                                            childStatus = "Low Stock";
                                          } else if (childGood > 0) {
                                            childStatus = "Healthy";
                                            childStatusColor = "#6b7280";
                                          }
                                          const childIsExpanded =
                                            expandedChild === child.id;
                                          const childHasBatches =
                                            childBatches.length > 0;
                                          return (
                                            <React.Fragment key={child.id}>
                                              <tr
                                                onClick={() =>
                                                  childHasBatches &&
                                                  setExpandedChild(
                                                    childIsExpanded
                                                      ? null
                                                      : child.id,
                                                  )
                                                }
                                                style={{
                                                  background:
                                                    cIdx % 2 === 0
                                                      ? "transparent"
                                                      : "rgba(255,255,255,0.01)",
                                                  borderBottom: childIsExpanded
                                                    ? "none"
                                                    : "1px solid rgba(255,255,255,0.04)",
                                                  cursor: childHasBatches
                                                    ? "pointer"
                                                    : "default",
                                                }}
                                                onMouseEnter={(e) => {
                                                  if (
                                                    !childIsExpanded &&
                                                    childHasBatches
                                                  )
                                                    e.currentTarget.style.background =
                                                      "rgba(255,255,255,0.03)";
                                                }}
                                                onMouseLeave={(e) => {
                                                  if (!childIsExpanded)
                                                    e.currentTarget.style.background =
                                                      cIdx % 2 === 0
                                                        ? "transparent"
                                                        : "rgba(255,255,255,0.01)";
                                                }}
                                              >
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    textAlign: "center",
                                                  }}
                                                >
                                                  {childHasBatches ? (
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpandedChild(
                                                          childIsExpanded
                                                            ? null
                                                            : child.id,
                                                        );
                                                      }}
                                                      style={{
                                                        background: "none",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        color: childIsExpanded
                                                          ? "#D4A843"
                                                          : "var(--gray)",
                                                        padding: 0,
                                                      }}
                                                    >
                                                      <ChevronIcon
                                                        open={childIsExpanded}
                                                      />
                                                    </button>
                                                  ) : (
                                                    <span
                                                      style={{
                                                        color: "var(--gray)",
                                                        fontSize: "0.65rem",
                                                      }}
                                                    >
                                                      —
                                                    </span>
                                                  )}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    color: "var(--gray)",
                                                    fontFamily: "monospace",
                                                    fontSize: "0.72rem",
                                                  }}
                                                >
                                                  {child.sku || "—"}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    color: "#E5E2E1",
                                                    fontSize: "0.72rem",
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  {child.name}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    textAlign: "center",
                                                    color: "#E5E2E1",
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  {childGood}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    textAlign: "center",
                                                    color:
                                                      childArrivalDamaged > 0
                                                        ? "#f59e0b"
                                                        : "#6b7280",
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  {childArrivalDamaged}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    textAlign: "center",
                                                    color:
                                                      childInternalDamaged > 0
                                                        ? "#ef4444"
                                                        : "#6b7280",
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  {childInternalDamaged}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    textAlign: "center",
                                                    color: "#E5E2E1",
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  {childTotal}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    textAlign: "right",
                                                    color: "#D4A843",
                                                    fontFamily: "monospace",
                                                  }}
                                                >
                                                  ₱{childCost.toFixed(2)}
                                                </td>
                                                <td
                                                  style={{
                                                    padding: "0.4rem 0.6rem",
                                                    textAlign: "center",
                                                  }}
                                                >
                                                  <span
                                                    style={{
                                                      fontSize: "0.65rem",
                                                      fontWeight: 700,
                                                      color: childStatusColor,
                                                      background: `${childStatusColor}15`,
                                                      padding: "0.1rem 0.4rem",
                                                      borderRadius: "4px",
                                                      border: `1px solid ${childStatusColor}30`,
                                                    }}
                                                  >
                                                    {childStatus}
                                                  </span>
                                                </td>
                                              </tr>
                                              {/* Expanded: Batch Breakdown for this child */}
                                              {childIsExpanded &&
                                                childHasBatches && (
                                                  <tr>
                                                    <td
                                                      colSpan={8}
                                                      style={{
                                                        padding:
                                                          "0.5rem 1.25rem 0.75rem 2rem",
                                                        background:
                                                          "rgba(0,0,0,0.3)",
                                                      }}
                                                    >
                                                      <div
                                                        style={{
                                                          fontSize: "0.6rem",
                                                          color: "#D4A843",
                                                          textTransform:
                                                            "uppercase",
                                                          marginBottom:
                                                            "0.4rem",
                                                          fontWeight: 700,
                                                          letterSpacing:
                                                            "0.08em",
                                                        }}
                                                      >
                                                        Batch Breakdown —{" "}
                                                        {child.name}
                                                      </div>
                                                      <table
                                                        style={{
                                                          width: "100%",
                                                          fontSize: "0.7rem",
                                                          borderCollapse:
                                                            "collapse",
                                                          border:
                                                            "1px solid rgba(255,255,255,0.06)",
                                                          borderRadius: "6px",
                                                          overflow: "hidden",
                                                        }}
                                                      >
                                                        <thead>
                                                          <tr
                                                            style={{
                                                              background:
                                                                "rgba(0,0,0,0.3)",
                                                              borderBottom:
                                                                "1px solid rgba(255,255,255,0.06)",
                                                            }}
                                                          >
                                                            <th
                                                              style={{
                                                                padding:
                                                                  "0.3rem 0.5rem",
                                                                textAlign:
                                                                  "left",
                                                                color:
                                                                  "#D4A843",
                                                                fontWeight: 700,
                                                                fontSize:
                                                                  "0.55rem",
                                                                textTransform:
                                                                  "uppercase",
                                                              }}
                                                            >
                                                              Invoice
                                                            </th>
                                                            <th
                                                              style={{
                                                                padding:
                                                                  "0.3rem 0.5rem",
                                                                textAlign:
                                                                  "center",
                                                                color:
                                                                  "#D4A843",
                                                                fontWeight: 700,
                                                                fontSize:
                                                                  "0.55rem",
                                                                textTransform:
                                                                  "uppercase",
                                                              }}
                                                            >
                                                              Date
                                                            </th>
                                                            <th
                                                              style={{
                                                                padding:
                                                                  "0.3rem 0.5rem",
                                                                textAlign:
                                                                  "center",
                                                                color:
                                                                  "#D4A843",
                                                                fontWeight: 700,
                                                                fontSize:
                                                                  "0.55rem",
                                                                textTransform:
                                                                  "uppercase",
                                                              }}
                                                            >
                                                              Good
                                                            </th>
                                                            <th
                                                              style={{
                                                                padding:
                                                                  "0.3rem 0.5rem",
                                                                textAlign:
                                                                  "center",
                                                                color:
                                                                  "#D4A843",
                                                                fontWeight: 700,
                                                                fontSize:
                                                                  "0.55rem",
                                                                textTransform:
                                                                  "uppercase",
                                                              }}
                                                            >
                                                              Damaged
                                                            </th>
                                                            <th
                                                              style={{
                                                                padding:
                                                                  "0.3rem 0.5rem",
                                                                textAlign:
                                                                  "center",
                                                                color:
                                                                  "#D4A843",
                                                                fontWeight: 700,
                                                                fontSize:
                                                                  "0.55rem",
                                                                textTransform:
                                                                  "uppercase",
                                                              }}
                                                            >
                                                              Actual
                                                            </th>
                                                            <th
                                                              style={{
                                                                padding:
                                                                  "0.3rem 0.5rem",
                                                                textAlign:
                                                                  "right",
                                                                color:
                                                                  "#D4A843",
                                                                fontWeight: 700,
                                                                fontSize:
                                                                  "0.55rem",
                                                                textTransform:
                                                                  "uppercase",
                                                              }}
                                                            >
                                                              Unit Cost
                                                            </th>
                                                            <th
                                                              style={{
                                                                padding:
                                                                  "0.3rem 0.5rem",
                                                                textAlign:
                                                                  "right",
                                                                color:
                                                                  "#D4A843",
                                                                fontWeight: 700,
                                                                fontSize:
                                                                  "0.55rem",
                                                                textTransform:
                                                                  "uppercase",
                                                              }}
                                                            >
                                                              Value
                                                            </th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {childBatches.map(
                                                            (b, bIdx) => {
                                                              const bg =
                                                                b.qtyGood || 0;
                                                              const bd =
                                                                b.qtyDamaged ||
                                                                b.damagedQty ||
                                                                0;
                                                              const ba =
                                                                bg + bd;
                                                              return (
                                                                <tr
                                                                  key={`${b.batchId || b.invoiceNumber || ""}-${bIdx}`}
                                                                  style={{
                                                                    background:
                                                                      bIdx %
                                                                        2 ===
                                                                      0
                                                                        ? "transparent"
                                                                        : "rgba(255,255,255,0.01)",
                                                                    borderBottom:
                                                                      "1px solid rgba(255,255,255,0.03)",
                                                                  }}
                                                                >
                                                                  <td
                                                                    style={{
                                                                      padding:
                                                                        "0.3rem 0.5rem",
                                                                      color:
                                                                        "var(--gray)",
                                                                      fontSize:
                                                                        "0.68rem",
                                                                    }}
                                                                  >
                                                                    {b.invoiceNumber ||
                                                                      "—"}
                                                                  </td>
                                                                  <td
                                                                    style={{
                                                                      padding:
                                                                        "0.3rem 0.5rem",
                                                                      textAlign:
                                                                        "center",
                                                                      color:
                                                                        "var(--gray)",
                                                                    }}
                                                                  >
                                                                    {b.dateReceived
                                                                      ? new Date(
                                                                          b.dateReceived,
                                                                        ).toLocaleDateString(
                                                                          "en-PH",
                                                                        )
                                                                      : "—"}
                                                                  </td>
                                                                  <td
                                                                    style={{
                                                                      padding:
                                                                        "0.3rem 0.5rem",
                                                                      textAlign:
                                                                        "center",
                                                                      color:
                                                                        "#E5E2E1",
                                                                      fontWeight: 600,
                                                                    }}
                                                                  >
                                                                    {bg}
                                                                  </td>
                                                                  <td
                                                                    style={{
                                                                      padding:
                                                                        "0.3rem 0.5rem",
                                                                      textAlign:
                                                                        "center",
                                                                      color:
                                                                        bd > 0
                                                                          ? "#ef4444"
                                                                          : "#6b7280",
                                                                      fontWeight: 600,
                                                                    }}
                                                                  >
                                                                    {bd}
                                                                  </td>
                                                                  <td
                                                                    style={{
                                                                      padding:
                                                                        "0.3rem 0.5rem",
                                                                      textAlign:
                                                                        "center",
                                                                      color:
                                                                        "#E5E2E1",
                                                                      fontWeight: 600,
                                                                    }}
                                                                  >
                                                                    {ba}
                                                                  </td>
                                                                  <td
                                                                    style={{
                                                                      padding:
                                                                        "0.3rem 0.5rem",
                                                                      textAlign:
                                                                        "right",
                                                                      color:
                                                                        "#D4A843",
                                                                      fontFamily:
                                                                        "monospace",
                                                                    }}
                                                                  >
                                                                    ₱
                                                                    {(
                                                                      b.unitCost ||
                                                                      0
                                                                    ).toFixed(
                                                                      2,
                                                                    )}
                                                                  </td>
                                                                  <td
                                                                    style={{
                                                                      padding:
                                                                        "0.3rem 0.5rem",
                                                                      textAlign:
                                                                        "right",
                                                                      color:
                                                                        "#E5E2E1",
                                                                      fontWeight: 600,
                                                                      fontFamily:
                                                                        "monospace",
                                                                    }}
                                                                  >
                                                                    ₱
                                                                    {(
                                                                      ba *
                                                                      (b.unitCost ||
                                                                        0)
                                                                    ).toFixed(
                                                                      2,
                                                                    )}
                                                                  </td>
                                                                </tr>
                                                              );
                                                            },
                                                          )}
                                                        </tbody>
                                                      </table>
                                                    </td>
                                                  </tr>
                                                )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            ) : // Standalone material: show batch breakdown
                            batches.length > 0 ? (
                              <div
                                style={{
                                  padding: "0.75rem 1.25rem 0.75rem 3rem",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.62rem",
                                    color: "#D4A843",
                                    textTransform: "uppercase",
                                    marginBottom: "0.6rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  Batch Breakdown
                                </div>
                                <div
                                  style={{
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: "8px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <table
                                    style={{
                                      width: "100%",
                                      fontSize: "0.75rem",
                                      borderCollapse: "collapse",
                                    }}
                                  >
                                    <thead>
                                      <tr
                                        style={{
                                          background: "rgba(0,0,0,0.3)",
                                          borderBottom:
                                            "1px solid rgba(255,255,255,0.06)",
                                        }}
                                      >
                                        <th
                                          style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "left",
                                            color: "#D4A843",
                                            fontWeight: 700,
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Invoice
                                        </th>
                                        <th
                                          style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "center",
                                            color: "#D4A843",
                                            fontWeight: 700,
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Date
                                        </th>
                                        <th
                                          style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "center",
                                            color: "#D4A843",
                                            fontWeight: 700,
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Good
                                        </th>
                                        <th
                                          style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "center",
                                            color: "#D4A843",
                                            fontWeight: 700,
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Damaged / Others
                                        </th>
                                        <th
                                          style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "center",
                                            color: "#D4A843",
                                            fontWeight: 700,
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Actual
                                        </th>
                                        <th
                                          style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "right",
                                            color: "#D4A843",
                                            fontWeight: 700,
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Unit Cost
                                        </th>
                                        <th
                                          style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "right",
                                            color: "#D4A843",
                                            fontWeight: 700,
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Value
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {batches.map((b, idx) => {
                                        const good = b.qtyGood || 0;
                                        const damaged =
                                          b.qtyDamaged || b.damagedQty || 0;
                                        const actual = good + damaged;
                                        return (
                                          <tr
                                            key={`${b.invoiceNumber || b.batchId}-${idx}`}
                                            style={{
                                              background:
                                                idx % 2 === 0
                                                  ? "transparent"
                                                  : "rgba(255,255,255,0.01)",
                                              borderBottom:
                                                "1px solid rgba(255,255,255,0.04)",
                                            }}
                                          >
                                            <td
                                              style={{
                                                padding: "0.4rem 0.6rem",
                                                color: "var(--gray)",
                                                fontSize: "0.72rem",
                                              }}
                                            >
                                              {b.invoiceNumber || "—"}
                                            </td>
                                            <td
                                              style={{
                                                padding: "0.4rem 0.6rem",
                                                textAlign: "center",
                                                color: "var(--gray)",
                                              }}
                                            >
                                              {new Date(
                                                b.dateReceived,
                                              ).toLocaleDateString("en-PH")}
                                            </td>
                                            <td
                                              style={{
                                                padding: "0.4rem 0.6rem",
                                                textAlign: "center",
                                                color: "#E5E2E1",
                                                fontWeight: 600,
                                              }}
                                            >
                                              {good}
                                            </td>
                                            <td
                                              style={{
                                                padding: "0.4rem 0.6rem",
                                                textAlign: "center",
                                                color:
                                                  damaged > 0
                                                    ? "#ef4444"
                                                    : "#6b7280",
                                                fontWeight: 600,
                                              }}
                                            >
                                              {damaged}
                                            </td>
                                            <td
                                              style={{
                                                padding: "0.4rem 0.6rem",
                                                textAlign: "center",
                                                color: "#E5E2E1",
                                                fontWeight: 600,
                                              }}
                                            >
                                              {actual}
                                            </td>
                                            <td
                                              style={{
                                                padding: "0.4rem 0.6rem",
                                                textAlign: "right",
                                                color: "#D4A843",
                                                fontFamily: "monospace",
                                              }}
                                            >
                                              ₱{(b.unitCost || 0).toFixed(2)}
                                            </td>
                                            <td
                                              style={{
                                                padding: "0.4rem 0.6rem",
                                                textAlign: "right",
                                                color: "#E5E2E1",
                                                fontWeight: 600,
                                                fontFamily: "monospace",
                                              }}
                                            >
                                              ₱
                                              {(
                                                actual * (b.unitCost || 0)
                                              ).toFixed(2)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : (
                              <div
                                style={{
                                  padding: "1rem",
                                  textAlign: "center",
                                  color: "var(--gray)",
                                  fontSize: "0.8rem",
                                }}
                              >
                                No batches yet.
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: "0.35rem 0.75rem",
                  background:
                    currentPage === 1
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: currentPage === 1 ? "var(--gray)" : "#E5E2E1",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  fontSize: "0.8rem",
                }}
              >
                ‹ Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={{
                      padding: "0.35rem 0.65rem",
                      background:
                        currentPage === page
                          ? "var(--gold)"
                          : "rgba(255,255,255,0.06)",
                      border:
                        currentPage === page
                          ? "1px solid var(--gold)"
                          : "1px solid var(--border)",
                      borderRadius: "6px",
                      color: currentPage === page ? "#000" : "#E5E2E1",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: currentPage === page ? 700 : 400,
                    }}
                  >
                    {page}
                  </button>
                ),
              )}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                style={{
                  padding: "0.35rem 0.75rem",
                  background:
                    currentPage === totalPages
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: currentPage === totalPages ? "var(--gray)" : "#E5E2E1",
                  cursor:
                    currentPage === totalPages ? "not-allowed" : "pointer",
                  fontSize: "0.8rem",
                }}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Invoice View ── */}
      {viewMode === "invoice" && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "12px",
            overflow: "hidden",
            background: "var(--dark)",
          }}
        >
          {filteredInvoices.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "var(--gray)",
              }}
            >
              {invoiceGroups.length === 0
                ? "No invoices found. Stock in items in the Stock-In module first."
                : "No invoices match your search/filter."}
            </div>
          ) : (
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
                  <th style={thStyle}>Invoice</th>
                  <th style={thStyle}>Material</th>
                  <th style={thStyle}>Variant</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Good</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Damaged</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const invTotalGood = inv.items.reduce(
                    (s, it) => s + it.good,
                    0,
                  );
                  const invTotalDamaged = inv.items.reduce(
                    (s, it) => s + it.damaged,
                    0,
                  );
                  const invTotalValue = inv.items.reduce(
                    (s, it) => s + it.value,
                    0,
                  );

                  return (
                    <React.Fragment key={inv.invoiceNo}>
                      {inv.items.map((it, idx) => (
                        <tr
                          key={idx}
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
                              padding: "0.875rem 1rem",
                              color: "#E5E2E1",
                              fontFamily: "monospace",
                              fontSize: "0.8rem",
                            }}
                          >
                            {inv.invoiceNo}
                          </td>
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              color: "#E5E2E1",
                              fontWeight: 600,
                            }}
                          >
                            {it.materialName}
                          </td>
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              color: "#E5E2E1",
                              fontSize: "0.8rem",
                            }}
                          >
                            {it.variantName !== "—" ? it.variantName : ""}
                          </td>
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "center",
                              color: "#E5E2E1",
                              fontWeight: 600,
                              fontFamily: "monospace",
                            }}
                          >
                            {it.good}
                          </td>
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "center",
                              color: it.damaged > 0 ? "#ef4444" : "#6b7280",
                              fontWeight: 600,
                              fontFamily: "monospace",
                            }}
                          >
                            {it.damaged}
                          </td>
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "center",
                              color: "#E5E2E1",
                              fontWeight: 600,
                              fontFamily: "monospace",
                            }}
                          >
                            {it.total}
                          </td>
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "right",
                              color: "#E5E2E1",
                              fontWeight: 600,
                              fontFamily: "monospace",
                            }}
                          >
                            ₱
                            {it.value.toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                      {/* Subtotal Row */}
                      <tr
                        style={{
                          background: "rgba(212,168,67,0.08)",
                          borderTop: "2px solid rgba(212,168,67,0.3)",
                          borderBottom: "2px solid rgba(212,168,67,0.3)",
                        }}
                      >
                        <td
                          colSpan={3}
                          style={{
                            padding: "0.875rem 1rem",
                            fontSize: "0.78rem",
                            color: "#D4A843",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          SUBTOTAL: {inv.invoiceNo}
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: "#D4A843",
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                          }}
                        >
                          {invTotalGood}
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: "#D4A843",
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                          }}
                        >
                          {invTotalDamaged}
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: "#D4A843",
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                          }}
                        >
                          {invTotalGood + invTotalDamaged}
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "right",
                            fontWeight: 700,
                            color: "#D4A843",
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                          }}
                        >
                          ₱
                          {invTotalValue.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CSV Preview Modal */}
      {showCSVPreview && csvPreviewData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowCSVPreview(false)}
        >
          <div
            style={{
              background: "var(--dark)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              width: "90%",
              maxWidth: "960px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "#E5E2E1",
                  }}
                >
                  Export CSV Preview
                </h3>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--gray)",
                    marginTop: "0.25rem",
                  }}
                >
                  {filteredInvoices.length} invoices •{" "}
                  {filteredInvoices.reduce((s, inv) => s + inv.items.length, 0)}{" "}
                  entries
                </div>
              </div>
              <button
                onClick={() => setShowCSVPreview(false)}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
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
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.5rem" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.78rem",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "left",
                        color: "#D4A843",
                        fontWeight: 700,
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Invoice
                    </th>
                    <th
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "left",
                        color: "#D4A843",
                        fontWeight: 700,
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Material
                    </th>
                    <th
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "left",
                        color: "#D4A843",
                        fontWeight: 700,
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Variant
                    </th>
                    <th
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "center",
                        color: "#D4A843",
                        fontWeight: 700,
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Good
                    </th>
                    <th
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "center",
                        color: "#D4A843",
                        fontWeight: 700,
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Damaged
                    </th>
                    <th
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "center",
                        color: "#D4A843",
                        fontWeight: 700,
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Total
                    </th>
                    <th
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "right",
                        color: "#D4A843",
                        fontWeight: 700,
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreviewData.map((row, idx) => {
                    if (row.type === "item") {
                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <td
                            style={{
                              padding: "0.4rem 0.75rem",
                              fontFamily: "monospace",
                              fontSize: "0.72rem",
                              color: "var(--gray)",
                            }}
                          >
                            {row.invoice}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem 0.75rem",
                              color: "#E5E2E1",
                              fontWeight: 600,
                            }}
                          >
                            {row.material}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem 0.75rem",
                              color: "var(--gray)",
                            }}
                          >
                            {row.variant}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem 0.75rem",
                              textAlign: "center",
                              color: "#E5E2E1",
                            }}
                          >
                            {row.good}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem 0.75rem",
                              textAlign: "center",
                              color:
                                row.damaged > 0 ? "#ef4444" : "var(--gray)",
                            }}
                          >
                            {row.damaged}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem 0.75rem",
                              textAlign: "center",
                              color: "#E5E2E1",
                            }}
                          >
                            {row.total}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem 0.75rem",
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: "#E5E2E1",
                            }}
                          >
                            ₱{row.value}
                          </td>
                        </tr>
                      );
                    } else if (row.type === "subtotal") {
                      return (
                        <tr
                          key={idx}
                          style={{
                            background: "rgba(212,168,67,0.08)",
                            borderTop: "1px solid rgba(212,168,67,0.2)",
                            borderBottom: "1px solid rgba(212,168,67,0.2)",
                          }}
                        >
                          <td
                            colSpan={3}
                            style={{
                              padding: "0.5rem 0.75rem",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              color: "#D4A843",
                            }}
                          >
                            SUBTOTAL: {row.invoice}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.75rem",
                              textAlign: "center",
                              fontWeight: 700,
                              color: "#D4A843",
                            }}
                          >
                            {row.good}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.75rem",
                              textAlign: "center",
                              fontWeight: 700,
                              color: row.damaged > 0 ? "#ef4444" : "#D4A843",
                            }}
                          >
                            {row.damaged}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.75rem",
                              textAlign: "center",
                              fontWeight: 700,
                              color: "#D4A843",
                            }}
                          >
                            {row.total}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem 0.75rem",
                              textAlign: "right",
                              fontWeight: 700,
                              color: "#D4A843",
                              fontFamily: "monospace",
                            }}
                          >
                            ₱{row.value}
                          </td>
                        </tr>
                      );
                    } else {
                      return (
                        <tr
                          key={idx}
                          style={{
                            background: "rgba(34,197,94,0.08)",
                            borderTop: "2px solid rgba(34,197,94,0.3)",
                          }}
                        >
                          <td
                            colSpan={3}
                            style={{
                              padding: "0.6rem 0.75rem",
                              fontSize: "0.78rem",
                              fontWeight: 800,
                              color: "#22c55e",
                            }}
                          >
                            GRAND TOTAL
                          </td>
                          <td
                            style={{
                              padding: "0.6rem 0.75rem",
                              textAlign: "center",
                              fontWeight: 800,
                              color: "#22c55e",
                            }}
                          >
                            {row.good}
                          </td>
                          <td
                            style={{
                              padding: "0.6rem 0.75rem",
                              textAlign: "center",
                              fontWeight: 800,
                              color: row.damaged > 0 ? "#ef4444" : "#22c55e",
                            }}
                          >
                            {row.damaged}
                          </td>
                          <td
                            style={{
                              padding: "0.6rem 0.75rem",
                              textAlign: "center",
                              fontWeight: 800,
                              color: "#22c55e",
                            }}
                          >
                            {row.total}
                          </td>
                          <td
                            style={{
                              padding: "0.6rem 0.75rem",
                              textAlign: "right",
                              fontWeight: 800,
                              color: "#22c55e",
                              fontFamily: "monospace",
                            }}
                          >
                            ₱{row.value}
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "1rem 1.5rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
              }}
            >
              <button
                onClick={() => setShowCSVPreview(false)}
                style={{
                  padding: "0.6rem 1.25rem",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#E5E2E1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDownloadCSV}
                style={{
                  padding: "0.6rem 1.5rem",
                  background: "#D4A843",
                  border: "none",
                  borderRadius: "8px",
                  color: "#000",
                  fontSize: "0.82rem",
                  fontWeight: 700,
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
                  strokeWidth="2.5"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
