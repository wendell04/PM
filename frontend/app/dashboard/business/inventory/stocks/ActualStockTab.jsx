"use client";

// DEPRECATED — replaced by Current Stock tab in stocks/page.jsx
// This file is kept for reference but is no longer rendered in the UI.
// Safe to delete once the new Current Stock tab is fully validated.

import CustomDropdown from "@/app/components/CustomDropdown";
import React, { memo, useEffect, useMemo, useState } from "react";

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

function materialKey(m) {
  if (!m) return "";
  return String(m.id ?? m._id ?? "");
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTUAL STOCK TAB — Simplified User-Friendly View
// Shows: Total Stock (Goods + Damaged), In Transit/Pending PO, Summary Cards
// ══════════════════════════════════════════════════════════════════════════════
function ActualStockTab({
  materials,
  badOrders = [],
  pendingPOs: pendingPOsProp = [],
  backorders = [],
  stockOuts = [],
  onDeleteZeroStock,
}) {
  const [expandedMaterial, setExpandedMaterial] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [viewMode, setViewMode] = useState("product");
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [showCSVPreview, setShowCSVPreview] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const pendingPOs = pendingPOsProp;

  // Per-material adjustment totals from stock-out history (non-sale reductions)
  const stockOutsAdjMap = React.useMemo(() => {
    const map = {};
    (stockOuts || []).forEach((so) => {
      if (so.issueType === "manual_sale" || so.issueType === "sale") return;
      const id = String(so.inventoryId || so.materialId || "");
      if (!id) return;
      map[id] = (map[id] || 0) + Math.abs(so.quantity || 0);
    });
    return map;
  }, [stockOuts]);

  const totalAdjustments = React.useMemo(
    () => Object.values(stockOutsAdjMap).reduce((a, b) => a + b, 0),
    [stockOutsAdjMap],
  );

  // Date range filter (default to This Month)
  const [dateRange, setDateRange] = useState("thisMonth");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Compute date range based on selection
  useEffect(() => {
    const now = new Date();
    let from = "";
    let to = "";
    switch (dateRange) {
      case "today":
        from = now.toISOString().split("T")[0];
        to = from;
        break;
      case "thisWeek": {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        from = startOfWeek.toISOString().split("T")[0];
        to = now.toISOString().split("T")[0];
        break;
      }
      case "thisMonth": {
        from = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split("T")[0];
        to = now.toISOString().split("T")[0];
        break;
      }
      case "thisYear": {
        from = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
        to = now.toISOString().split("T")[0];
        break;
      }
      case "custom":
        // Keep existing dateFrom/dateTo values
        return;
      default:
        // allTime - no filter
        setDateFrom("");
        setDateTo("");
        return;
    }
    setDateFrom(from);
    setDateTo(to);
  }, [dateRange]);

  // Create bad orders map by material ID (ONLY pending bad orders)
  const badOrdersMap = useMemo(() => {
    const map = {};
    badOrders.forEach((bo) => {
      // Only count pending bad orders - replaced/credited are resolved
      if (bo.status !== "pending") return;

      const mid =
        bo.materialId != null ? String(bo.materialId) : "";
      if (!mid) return;

      if (!map[mid]) {
        map[mid] = {
          total: 0,
          byType: {},
        };
      }
      const q = bo.qty || 0;
      const t = bo.type || "damage";
      map[mid].total += q;
      map[mid].byType[t] = (map[mid].byType[t] || 0) + q;
    });
    return map;
  }, [badOrders]);

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
    const totalBadOrder = data.reduce(
      (s, inv) => s + inv.items.reduce((ss, it) => ss + (it.badOrder || 0), 0),
      0,
    );
    const totalWaste = data.reduce(
      (s, inv) =>
        s + inv.items.reduce((ss, it) => ss + (it.internalDamaged || 0), 0),
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
          <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#333;font-size:12px;vertical-align:top;">${it.materialName}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#555;font-size:12px;vertical-align:top;">${it.variantName !== "—" ? it.variantName : ""}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${it.good}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;font-size:12px;color:#f59e0b;">${it.badOrder || 0}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;font-size:12px;color:#ef4444;">${it.internalDamaged || 0}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;font-size:12px;font-weight:600;">${it.total}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-family:monospace;white-space:nowrap;">₱${it.unitCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-family:monospace;white-space:nowrap;font-weight:600;">₱${it.value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
        </tr>
      `,
        )
        .join("");

      const invTotalGood = inv.items.reduce((s, it) => s + it.good, 0);
      const invTotalBadOrder = inv.items.reduce(
        (s, it) => s + (it.badOrder || 0),
        0,
      );
      const invTotalWaste = inv.items.reduce(
        (s, it) => s + (it.internalDamaged || 0),
        0,
      );
      const invTotalQty = inv.items.reduce((s, it) => s + it.total, 0);
      const invTotalValue = inv.items.reduce((s, it) => s + it.value, 0);

      rows += `
        <tr style="background:#fff;">
          <td colspan="8" style="padding:12px 10px 8px 10px;font-weight:700;font-size:13px;color:#111;border-bottom:1px solid #ddd;">
            ${inv.invoiceNo} — ${inv.vendorName} (${new Date(inv.dateReceived).toLocaleDateString("en-PH")})
          </td>
        </tr>
        ${itemRows}
        <tr style="background:#fafafa;">
          <td colspan="2" style="padding:8px 10px;font-size:11px;color:#666;font-weight:600;border-bottom:2px solid #ddd;">Invoice Total:</td>
          <td style="padding:8px 10px;text-align:center;font-size:12px;font-weight:700;border-bottom:2px solid #ddd;">${invTotalGood} good</td>
          <td style="padding:8px 10px;text-align:center;font-size:11px;border-bottom:2px solid #ddd;color:#f59e0b;font-weight:600;">${invTotalBadOrder} BO</td>
          <td style="padding:8px 10px;text-align:center;font-size:11px;border-bottom:2px solid #ddd;color:#ef4444;font-weight:600;">${invTotalWaste} waste</td>
          <td style="padding:8px 10px;text-align:center;font-size:12px;font-weight:700;border-bottom:2px solid #ddd;">${invTotalQty}</td>
          <td style="padding:8px 10px;border-bottom:2px solid #ddd;"></td>
          <td style="padding:8px 10px;text-align:right;font-size:12px;font-weight:700;font-family:monospace;border-bottom:2px solid #ddd;white-space:nowrap;">₱${invTotalValue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    });

    const html = `<!DOCTYPE html><html><head><title>Batch Inventory Report</title>
      <style>@page{size:letter;margin:1in}body{font-family:Segoe UI,Arial,sans-serif;margin:0;color:#111;padding:20px}h1{font-size:18px;margin:0 0 4px 0}h2{font-size:13px;color:#666;margin:0 0 20px 0;font-weight:500}table{width:100%;border-collapse:collapse;margin-top:20px}th{padding:10px;text-align:left;font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #ddd;background:#fff}
      .summary{display:flex;gap:32px;margin-bottom:24px;padding:16px 20px;background:#f9fafb;border-radius:6px}.summary-item{font-size:13px}.summary-label{color:#666;font-size:10px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px}.summary-value{font-weight:700;font-family:monospace;font-size:14px}
      </style></head><body>
      <h1 style="font-weight:800;letter-spacing:-0.02em;">PERSONALIZE ME PRINTS</h1>
      <h2>Batch Inventory Report — By Invoice | Generated: ${now}</h2>
      <div class="summary">
        <div class="summary-item"><span class="summary-label">Total Good</span><span class="summary-value">${totalGood} pcs</span></div>
        <div class="summary-item"><span class="summary-label">Total Bad Order</span><span class="summary-value" style="color:#f59e0b">${totalBadOrder} pcs</span></div>
        <div class="summary-item"><span class="summary-label">Total Waste</span><span class="summary-value" style="color:#ef4444">${totalWaste} pcs</span></div>
        <div class="summary-item"><span class="summary-label">Total Value</span><span class="summary-value">₱${totalValue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span></div>
        <div class="summary-item"><span class="summary-label">Invoices</span><span class="summary-value">${data.length}</span></div>
      </div>
      <table><thead><tr>
        <th style="width:12%">Material</th><th style="width:18%">Variant</th>
        <th style="text-align:center;width:8%">Good</th><th style="text-align:center;width:8%;color:#f59e0b">Bad Order</th><th style="text-align:center;width:8%;color:#ef4444">Adjustment</th><th style="text-align:center;width:8%">Total</th>
        <th style="text-align:right;width:10%">Unit Cost</th><th style="text-align:right;width:11%">Value</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;

    const w = window.open("", "_blank", "width=1100,height=700");
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.print();
    }, 500);
  };

  // Summary cards: Total Goods Stock, Total Actual Stock, Total Waste, Total Goods Value, Total Loss Value, Backorders - OPTIMIZED
  // FIX: Total Goods Stock and Total Goods Value should ONLY include good/usable stock, NOT bad orders
  // Summary cards: Total Goods Stock, Total Actual Stock, Total Waste, Total Goods Value, Total Loss Value, Backorders
  // FIX: Total Goods Stock = good stock ONLY (exclude bad orders)
  // FIX: Total Goods Value = value of good stock ONLY (exclude bad orders)
  // FIX: Total Loss = pending bad orders value only
  // FIX: Total Actual Stock = good stock ONLY (bad orders are NOT actual stock)
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

    // Pre-build children map to avoid repeated .filter() calls
    const childrenMap = new Map();
    materials.forEach((m) => {
      if (m.parentId) {
        if (!childrenMap.has(m.parentId)) {
          childrenMap.set(m.parentId, []);
        }
        childrenMap.get(m.parentId).push(m);
      }
    });

    // Process only parent materials
    materials.forEach((m) => {
      if (m.parentId) return; // Skip children

      // Add In Transit from pending POs
      totalInTransit += inTransitMap[m.id] || 0;

      const hasChildren = m.hasVariants && childrenMap.has(m.id);

      if (hasChildren) {
        // For parents with variants, aggregate stock from children
        const children = childrenMap.get(m.id);
        let parentGoodStock = 0,
          parentDamaged = 0,
          parentBadOrderQty = 0;

        children.forEach((child) => {
          const childBadOrder = badOrdersMap[materialKey(child)]?.total || 0;
          parentBadOrderQty += childBadOrder;
          const childBatches = child.batches || [];

          childBatches.forEach((b) => {
            const good =
              b.remainingQty != null
                ? b.remainingQty
                : (b.qtyGood ?? b.goodQty ?? 0);
            const damaged = b.qtyDamaged || b.damagedQty || 0;
            const cost = b.unitCost || 0;

            parentGoodStock += good;
            parentDamaged += damaged;
            totalWaste += damaged;
            // FIX: Goods cost = only GOOD stock (exclude damaged/bad orders)
            totalGoodsCost += good * cost;
            // Loss = ALL damage (arrival + internal + pending bad orders)
            totalInventoryLoss += damaged * cost;

            // Split arrival vs internal damage
            if (b.damageType === "arrival") {
              arrivalDamage += damaged;
              arrivalDamageValue += damaged * cost;
            } else {
              internalDamage += damaged;
              internalDamageValue += damaged * cost;
            }
          });
        });

        // FIX: Total Goods = good stock only (what can be sold)
        totalStock += parentGoodStock;
        // FIX: Total Actual = good stock + bad orders (total physical inventory)
        totalActualStock += parentGoodStock + parentBadOrderQty;

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
        const batches = m.batches || [];
        let goodStock = 0;
        let damaged = 0;

        batches.forEach((b) => {
          const good =
            b.remainingQty != null
              ? b.remainingQty
              : (b.qtyGood ?? b.goodQty ?? 0);
          const dmg = b.qtyDamaged || b.damagedQty || 0;
          const cost = b.unitCost || 0;

          goodStock += good;
          damaged += dmg;
          // FIX: Goods cost = only GOOD stock (exclude damaged/bad orders)
          totalGoodsCost += good * cost;
          // Loss = ALL damage
          totalInventoryLoss += dmg * cost;

          // Split arrival vs internal damage
          if (b.damageType === "arrival") {
            arrivalDamage += dmg;
            arrivalDamageValue += dmg * cost;
          } else {
            internalDamage += dmg;
            internalDamageValue += dmg * cost;
          }
        });

        // FIX: Total Goods = good stock only (what can be sold)
        totalStock += goodStock;
        // FIX: Total Actual = good stock + bad orders (total physical inventory)
        const standAloneBO = badOrdersMap[materialKey(m)]?.total || 0;
        totalActualStock += goodStock + standAloneBO;
        totalWaste += damaged;

        const minStock = m.minStock || 10;
        if (goodStock === 0 && m.procurementType !== "on-demand") outOfStock++;
        else if (
          goodStock > 0 &&
          goodStock < minStock &&
          m.procurementType !== "on-demand"
        )
          lowStock++;
      }
    });

    // Backorders: supplied by parent when an API exists; default none
    totalBackorders = (backorders || [])
      .filter((bo) => bo.status === "pending")
      .reduce((sum, bo) => sum + (bo.qty || 0), 0);

    // FIX: Total Loss = pending bad orders value only (not batch damage)
    let badOrderLossValue = 0;
    badOrders.forEach((bo) => {
      if (bo.status === "pending") {
        badOrderLossValue += bo.totalValue || 0;
      }
    });

    return {
      totalStock,
      outOfStock,
      lowStock,
      totalGoodsCost,
      totalActualStock,
      totalInventoryLoss: badOrderLossValue,
      totalInTransit,
      totalWaste,
      totalBackorders,
      arrivalDamage,
      internalDamage,
      arrivalDamageValue,
      internalDamageValue,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, inTransitMap, badOrders, backorders]);

  const categories = [
    ...new Set(
      materials
        .filter((m) => !m.parentId)
        .map((m) => m.category)
        .filter(Boolean),
    ),
  ];

  // Build invoice groups from all active batches - OPTIMIZED O(n) instead of O(n³)
  const invoiceGroups = useMemo(() => {
    const map = {};
    // Pre-build parent lookup map to avoid repeated .find() calls
    const parentMap = new Map();
    materials.forEach((m) => {
      if (!m.parentId) {
        parentMap.set(m.id, m);
      }
    });

    // Single pass through all materials
    materials.forEach((m) => {
      const batches = m.batches || [];
      if (batches.length === 0) return;

      // Determine material name and variant name
      let materialName, variantName, uom;

      if (m.parentId) {
        // This is a child/variant material
        const parent = parentMap.get(m.parentId);
        materialName = parent ? parent.name : m.name;
        variantName = m.name;
        uom = m.uom || (parent ? parent.uom : "pcs");
      } else if (m.hasVariants) {
        // Parent with variants - skip, children will be processed
        return;
      } else {
        // Standalone material (no variants)
        materialName = m.name;
        variantName = "—";
        uom = m.uom || "pcs";
      }

      // Process batches
      batches.forEach((b) => {
        const good = b.qtyGood || b.remainingQty || 0;
        const damaged = b.qtyDamaged || b.damagedQty || 0;
        const arrivalDamaged = b.damageType === "arrival" ? damaged : 0;
        const internalDamaged = b.damageType !== "arrival" ? damaged : 0;

        // Skip empty batches
        if (good <= 0 && damaged <= 0) return;

        const inv = b.invoiceNumber || b.invoiceNo || "No Invoice";

        // Create invoice group if not exists
        if (!map[inv]) {
          map[inv] = {
            invoiceNo: inv,
            vendorName: b.vendorName || "—",
            dateReceived: b.dateReceived || b.createdAt || "",
            items: [],
          };
        }

        map[inv].items.push({
          materialName,
          variantName,
          uom,
          good,
          damaged,
          arrivalDamaged,
          internalDamaged,
          total: good + damaged,
          unitCost: b.unitCost || 0,
          value: good * (b.unitCost || 0), // FIX: Value only for good stock (exclude damaged)
          badOrder: badOrdersMap[materialKey(m)]?.total || 0,
        });
      });
    });

    // Sort by date descending
    return Object.values(map).sort(
      (a, b) => new Date(b.dateReceived) - new Date(a.dateReceived),
    );
  }, [materials, badOrdersMap]);

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

      // Logic: Show item if stock > 0 OR if it has history (batches)
      // Handle variants: check children's batches
      let stock = 0;
      let hasHistory = false;

      if (m.hasVariants) {
        const children = materials.filter((c) => c.parentId === m.id);
        children.forEach((child) => {
          const childBatches = child.batches || [];
          if (childBatches.length > 0) hasHistory = true;
          stock += childBatches.reduce(
            (s, b) => s + (b.remainingQty || b.qtyGood || 0),
            0,
          );
        });
      } else {
        // Standalone item
        const batches = m.batches || [];
        stock = batches.reduce(
          (s, b) => s + (b.remainingQty || b.qtyGood || 0),
          0,
        );
        hasHistory = batches.length > 0;
      }

      if (stock === 0 && !hasHistory) return false;

      return true;
    });
  }, [materials, categoryFilter, search]);

  // OPTIMIZED: Pre-compute material stats to avoid heavy calculations in render
  const materialStatsMap = useMemo(() => {
    const statsMap = new Map();

    // Pre-build children map
    const childrenMap = new Map();
    materials.forEach((m) => {
      if (m.parentId) {
        if (!childrenMap.has(m.parentId)) {
          childrenMap.set(m.parentId, []);
        }
        childrenMap.get(m.parentId).push(m);
      }
    });

    // Compute stats for each parent material
    filtered.forEach((mat) => {
      const hasChildren = mat.hasVariants && childrenMap.has(mat.id);
      let batches, goodStock, damaged, arrivalDamaged, internalDamaged;
      let totalStock,
        avgCost,
        goodsValue,
        parentBadOrderQty = 0;

      if (hasChildren) {
        const children = childrenMap.get(mat.id);
        const allChildrenBatches = children.flatMap(
          (child) => child.batches || [],
        );
        batches = allChildrenBatches;

        goodStock = 0;
        damaged = 0;
        arrivalDamaged = 0;
        internalDamaged = 0;
        let totalQty = 0;
        let totalVal = 0;

        // Calculate bad orders from children batches
        children.forEach((child) => {
          const childBO = badOrdersMap[materialKey(child)]?.total || 0;
          parentBadOrderQty += childBO;
        });

        allChildrenBatches.forEach((b) => {
          const good =
            b.remainingQty != null
              ? b.remainingQty
              : (b.qtyGood ?? b.goodQty ?? 0);
          const dmg = b.qtyDamaged || 0;
          const cost = b.unitCost || 0;

          goodStock += good;
          damaged += dmg;
          totalQty += good; // FIX: Only good stock for avg cost
          totalVal += good * cost; // FIX: Only good stock value

          if (b.damageType === "arrival") {
            arrivalDamaged += dmg;
          } else {
            internalDamaged += dmg;
          }
        });

        totalStock = goodStock + damaged;
        avgCost = totalQty > 0 ? totalVal / totalQty : mat.baseCost || 0;
        goodsValue = goodStock * avgCost; // FIX: Only good stock value
      } else {
        batches = mat.batches || [];
        goodStock = 0;
        damaged = 0;
        arrivalDamaged = 0;
        internalDamaged = 0;
        let totalQty = 0;
        let totalVal = 0;

        batches.forEach((b) => {
          const good =
            b.remainingQty != null
              ? b.remainingQty
              : (b.qtyGood ?? b.goodQty ?? 0);
          const dmg = b.qtyDamaged || 0;
          const cost = b.unitCost || 0;

          goodStock += good;
          damaged += dmg;
          totalQty += good; // FIX: Only good stock for avg cost
          totalVal += good * cost; // FIX: Only good stock value

          if (b.damageType === "arrival") {
            arrivalDamaged += dmg;
          } else {
            internalDamaged += dmg;
          }
        });

        totalStock = goodStock + damaged;
        avgCost = totalQty > 0 ? totalVal / totalQty : mat.baseCost || 0;
        goodsValue = goodStock * avgCost;
      }

      // Pre-compute children stats if hasVariants
      let childrenStats = [];
      if (hasChildren) {
        const children = childrenMap.get(mat.id);
        childrenStats = children.map((child) => {
          const childBatches = child.batches || [];
          let childGood = 0;
          let childDamaged = 0;
          let childArrivalDamaged = 0;
          let childInternalDamaged = 0;
          let childTotalQty = 0;
          let childTotalVal = 0;

          childBatches.forEach((b) => {
            const good =
              b.remainingQty != null
                ? b.remainingQty
                : (b.qtyGood ?? b.goodQty ?? 0);
            const dmg = b.qtyDamaged || 0;
            const cost = b.unitCost || 0;

            childGood += good;
            childDamaged += dmg;
            childTotalQty += good; // FIX: Only good stock
            childTotalVal += good * cost; // FIX: Only good stock value

            if (b.damageType === "arrival") {
              childArrivalDamaged += dmg;
            } else {
              childInternalDamaged += dmg;
            }
          });

          const childTotal = childGood + childDamaged;
          const childAvgCost =
            childTotalQty > 0
              ? childTotalVal / childTotalQty
              : child.baseCost || 0;
          const childGoodsValue = childGood * childAvgCost;

          return {
            id: child.id,
            name: child.name,
            sku: child.sku || "",
            uom: child.uom || mat.uom || "pcs",
            batches: childBatches,
            goodStock: childGood,
            damaged: childDamaged,
            arrivalDamaged: childArrivalDamaged,
            internalDamaged: childInternalDamaged,
            totalStock: childTotal,
            avgCost: childAvgCost,
            goodsValue: childGoodsValue,
          };
        });
      }

      statsMap.set(mat.id, {
        batches,
        goodStock,
        damaged,
        arrivalDamaged,
        internalDamaged,
        totalStock,
        avgCost,
        goodsValue,
        hasChildren,
        childrenStats,
        badOrderQty: hasChildren
          ? parentBadOrderQty
          : badOrdersMap[materialKey(mat)]?.total || 0,
      });
    });

    return statsMap;
  }, [filtered, materials, badOrdersMap]);

  // OPTIMIZED: Pre-build material category lookup for invoice filtering
  const materialCategoryMap = useMemo(() => {
    const map = new Map();
    materials.forEach((m) => map.set(m.name, m.category));
    return map;
  }, [materials]);

  // Filter invoice groups (invoice view) - OPTIMIZED
  const filteredInvoices = useMemo(() => {
    let groups = invoiceGroups;
    if (categoryFilter) {
      groups = groups.filter((inv) =>
        inv.items.some(
          (it) => materialCategoryMap.get(it.materialName) === categoryFilter,
        ),
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
              (it.sku || "").toLowerCase().includes(q),
          ),
      );
    }

    // Date filter
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo) : null;
      if (to) to.setHours(23, 59, 59, 999);
      groups = groups.filter((inv) => {
        const invDate = inv.dateReceived ? new Date(inv.dateReceived) : null;
        if (!invDate) return false;
        if (from && invDate < from) return false;
        if (to && invDate > to) return false;
        return true;
      });
    }

    // Pre-compute invoice totals to avoid recalculating in render
    return groups.map((inv) => ({
      ...inv,
      invTotalGood: inv.items.reduce((s, it) => s + it.good, 0),
      invTotalDamaged: inv.items.reduce((s, it) => s + it.damaged, 0),
      invTotalBadOrder: inv.items.reduce((s, it) => s + (it.badOrder || 0), 0),
      invTotalValue: inv.items.reduce((s, it) => s + it.value, 0),
    }));
  }, [
    invoiceGroups,
    categoryFilter,
    search,
    materialCategoryMap,
    dateFrom,
    dateTo,
  ]);

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
        const damaged = it.badOrder || it.damaged || 0;
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
          damaged,
          total: it.total,
          unitCost: (it.unitCost || 0).toFixed(2),
          value: (it.value || 0).toFixed(2),
        });
        invGood += it.good;
        invDamaged += damaged;
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
        const damaged = it.badOrder || it.damaged || 0;
        lines.push(
          [
            inv.invoiceNo,
            `"${inv.vendorName}"`,
            date,
            `"${it.materialName}"`,
            it.variantName !== "—" ? `"${it.variantName}"` : "",
            it.good,
            damaged,
            it.total,
            (it.unitCost || 0).toFixed(2),
            (it.value || 0).toFixed(2),
          ].join(","),
        );
        invGood += it.good;
        invDamaged += damaged;
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
            <span className="summary-value" style={{ color: "#D4A843" }}>
              {summaryCards.totalActualStock}
            </span>
            <span className="summary-label">Total Actual Stock</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value" style={{ color: "#f59e0b" }}>
              {badOrders
                .filter((bo) => bo.status === "pending")
                .reduce((sum, bo) => sum + (bo.qty || 0), 0)}
            </span>
            <span className="summary-label">Bad Orders</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value" style={{ color: "#ef4444" }}>
              {totalAdjustments}
            </span>
            <span className="summary-label">Adjustment</span>
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
              style={{ color: "#ef4444", fontSize: "1rem" }}
            >
              ₱
              {summaryCards.totalInventoryLoss.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="summary-label">Total Loss</span>
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
            {/* Date Range Dropdown */}
            <CustomDropdown
              value={dateRange}
              onChange={(val) => {
                setDateRange(val);
                setCurrentPage(1);
              }}
              options={[
                { value: "allTime", label: "All Time" },
                { value: "today", label: "Today" },
                { value: "thisWeek", label: "This Week" },
                { value: "thisMonth", label: "This Month" },
                { value: "thisYear", label: "This Year" },
                { value: "custom", label: "Custom Range" },
              ]}
              placeholder="Date Range"
              style={{ minWidth: "130px" }}
            />
            {/* Custom date inputs (only shown when custom range selected) */}
            {dateRange === "custom" && (
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#E5E2E1",
                    fontSize: "0.78rem",
                    outline: "none",
                    colorScheme: "dark",
                  }}
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#E5E2E1",
                    fontSize: "0.78rem",
                    outline: "none",
                    colorScheme: "dark",
                  }}
                />
              </>
            )}
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setCurrentPage(1);
              }}
              style={{
                padding: "0.5rem 0.75rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#E5E2E1",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
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
                  Bad Order
                </th>
                <th
                  style={{ ...thStyle, textAlign: "center", color: "#ef4444" }}
                >
                  Adjustment
                </th>
                <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Goods Value</th>
                <th
                  style={{ ...thStyle, textAlign: "right", color: "#ef4444" }}
                >
                  Loss Value
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
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
                  // Use pre-computed stats instead of recalculating in render
                  const stats = materialStatsMap.get(mat.id) || {};
                  const {
                    batches = [],
                    goodStock = 0,
                    damaged = 0,
                    arrivalDamaged = 0,
                    internalDamaged = 0,
                    totalStock = 0,
                    avgCost = 0,
                    goodsValue = 0,
                    hasChildren = false,
                    childrenStats = [],
                  } = stats;

                  const children = childrenStats; // Use pre-computed children

                  const matAdj = hasChildren
                    ? childrenStats.reduce((s, c) => s + (stockOutsAdjMap[String(c.id)] || 0), 0)
                    : (stockOutsAdjMap[String(mat.id)] || 0);

                  const isExpanded = expandedMaterial === mat.id;
                  // Only products with variants are expandable; standalone items are flat rows
                  const shouldShowChevron = hasChildren;

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
                          {mat.sku && !mat.hasVariants && (
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
                            color:
                              stats.badOrderQty > 0 ? "#f59e0b" : "#6b7280",
                            fontFamily: "monospace",
                          }}
                        >
                          {stats.badOrderQty}{" "}
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
                            color: matAdj > 0 ? "#ef4444" : "#6b7280",
                            fontFamily: "monospace",
                          }}
                        >
                          {matAdj}{" "}
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
                          {goodStock + stats.badOrderQty}{" "}
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
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "right",
                            fontWeight: 700,
                            color: "#ef4444",
                            fontFamily: "monospace",
                          }}
                        >
                          ₱
                          {(() => {
                            // For parent rows with children, aggregate children's loss values
                            if (
                              hasChildren &&
                              children &&
                              children.length > 0
                            ) {
                              return children.reduce((sum, child) => {
                                const childPendingBO = badOrders.filter(
                                  (bo) =>
                                    String(bo.materialId) ===
                                      materialKey(child) &&
                                    bo.status === "pending",
                                );
                                return (
                                  sum +
                                  childPendingBO.reduce(
                                    (s, bo) => s + (bo.totalValue || 0),
                                    0,
                                  )
                                );
                              }, 0);
                            }
                            // For standalone materials, use direct material ID
                            const pendingBO = badOrders.filter(
                              (bo) =>
                                String(bo.materialId) === materialKey(mat) &&
                                bo.status === "pending",
                            );
                            return pendingBO.reduce(
                              (sum, bo) => sum + (bo.totalValue || 0),
                              0,
                            );
                          })().toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                      {/* Expanded: Variant Children */}
                      {isExpanded && hasChildren && (
                        <tr>
                          <td
                            colSpan={9}
                            style={{
                              padding: 0,
                              background: "rgba(0,0,0,0.2)",
                            }}
                          >
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
                                          Bad Order
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
                                          Adjustment
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
                                          Goods Value
                                        </th>
                                        <th
                                          style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "right",
                                            color: "#ef4444",
                                            fontWeight: 700,
                                            fontSize: "0.6rem",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Loss Value
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {children.map((child, cIdx) => {
                                        const childGood = child.goodStock;
                                        const childDamaged = child.damaged;
                                        const childArrivalDamaged =
                                          child.arrivalDamaged;
                                        const childInternalDamaged =
                                          stockOutsAdjMap[String(child.id)] || 0;
                                        const childBadOrder =
                                          badOrdersMap[materialKey(child)]?.total || 0;
                                        const childTotal =
                                          childGood + childBadOrder;
                                        const childCost = child.avgCost;
                                        const childGoodsValue =
                                          child.goodsValue;

                                        return (
                                          <tr
                                            key={child.id}
                                            style={{
                                              background:
                                                cIdx % 2 === 0
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
                                                  (badOrdersMap[materialKey(child)]
                                                    ?.total || 0) > 0
                                                    ? "#f59e0b"
                                                    : "#6b7280",
                                                fontWeight: 600,
                                              }}
                                            >
                                              {badOrdersMap[materialKey(child)]?.total ||
                                                0}
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
                                                fontWeight: 600,
                                                color: "#E5E2E1",
                                                fontFamily: "monospace",
                                              }}
                                            >
                                              ₱
                                              {childGoodsValue.toLocaleString(
                                                "en-PH",
                                                {
                                                  minimumFractionDigits: 2,
                                                },
                                              )}
                                            </td>
                                            <td
                                              style={{
                                                padding: "0.4rem 0.6rem",
                                                textAlign: "right",
                                                fontWeight: 600,
                                                color: "#ef4444",
                                                fontFamily: "monospace",
                                              }}
                                            >
                                              ₱
                                              {(() => {
                                                const pendingBO =
                                                  badOrders.filter(
                                                    (bo) =>
                                                      String(bo.materialId) ===
                                                        materialKey(child) &&
                                                      bo.status === "pending",
                                                  );
                                                return pendingBO.reduce(
                                                  (sum, bo) =>
                                                    sum + (bo.totalValue || 0),
                                                  0,
                                                );
                                              })().toLocaleString("en-PH", {
                                                minimumFractionDigits: 2,
                                              })}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
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
          {filtered.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 1rem", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.8rem", color: "var(--gray)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                Rows per page:
                <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} style={{ background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--white)", padding: "0.2rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" }}>
                  {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={{ padding: "0.25rem 0.625rem", background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: currentPage <= 1 ? "var(--gray)" : "var(--white)", cursor: currentPage <= 1 ? "not-allowed" : "pointer" }}>‹</button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} style={{ padding: "0.25rem 0.625rem", background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: currentPage >= totalPages ? "var(--gray)" : "var(--white)", cursor: currentPage >= totalPages ? "not-allowed" : "pointer" }}>›</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                Page: <span style={{ padding: "0.2rem 0.6rem", background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--white)", minWidth: "28px", textAlign: "center" }}>{currentPage}</span> of {totalPages}
              </div>
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
                  <th
                    style={{
                      ...thStyle,
                      textAlign: "center",
                      color: "#f59e0b",
                    }}
                  >
                    Bad Order
                  </th>
                  <th
                    style={{
                      ...thStyle,
                      textAlign: "center",
                      color: "#ef4444",
                    }}
                  >
                    Adjustment
                  </th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Total</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  // Use pre-computed invoice totals
                  const invTotalGood = inv.invTotalGood;
                  const invTotalDamaged = inv.invTotalDamaged;
                  const invTotalBadOrder = inv.invTotalBadOrder;
                  const invTotalValue = inv.invTotalValue;

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
                              color: it.badOrder > 0 ? "#f59e0b" : "#6b7280",
                              fontWeight: 600,
                              fontFamily: "monospace",
                            }}
                          >
                            {it.badOrder || 0}
                          </td>
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "center",
                              color:
                                it.internalDamaged > 0 ? "#ef4444" : "#6b7280",
                              fontWeight: 600,
                              fontFamily: "monospace",
                            }}
                          >
                            {it.internalDamaged || 0}
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
                            color: "#f59e0b",
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                          }}
                        >
                          {invTotalBadOrder}
                        </td>
                        <td
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: "#ef4444",
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                          }}
                        >
                          {inv.items.reduce(
                            (s, it) => s + (it.internalDamaged || 0),
                            0,
                          )}
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
                  {filteredInvoices.length} invoices —{" "}
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

export default memo(ActualStockTab);
