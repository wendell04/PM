"use client";

import CustomDropdown from "@/app/components/CustomDropdown";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  fetchInventory,
  createInventory,
  updateInventory,
  deleteInventory,
} from "@/lib/inventoryApi";
import { fetchBOMs, createBOM, updateBOM, deleteBOM } from "@/lib/bomApi";
import { fetchProducts } from "@/lib/productApi";
import { fetchUnits, saveUnit } from "@/lib/unitsApi";
import VendorsApiTab from "./VendorsApiTab";
import BOMFormModal from "./BOMFormModal";
import ErrorBoundary from "@/components/ErrorBoundary";

// ── LocalStorage Keys ──────────────────────────────────────────────────────────
const CATEGORIES_KEY = "pmp_material_categories";
const ALLOWED_CATEGORIES = ["Raw Material", "Packaging"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeInventoryRow(row) {
  if (!row) return row;
  return {
    ...row,
    id: row.id ?? row._id,
    parentId: row.parentId ? String(row.parentId) : null,
    preferredVendorId: row.preferredVendorId ?? row.supplierId ?? null,
  };
}

function isLikelyMongoId(id) {
  return typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
}

function fifoUnitCostForBom(mat, qty) {
  const q = Number(qty) || 1;
  if (!mat) return 0;
  if (!mat.batches?.length)
    return Number(mat.baseCost || 0);
  const active = [...mat.batches]
    .filter((b) => (b.remainingQty || 0) > 0)
    .sort(
      (a, b) =>
        new Date(a.dateReceived) - new Date(b.dateReceived),
    );
  if (!active.length)
    return Number(mat.baseCost || 0);
  let remaining = q;
  let cost = 0;
  for (const batch of active) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.remainingQty || 0);
    cost += take * (batch.unitCost || 0);
    remaining -= take;
  }
  if (remaining > 0) {
    const totalQty = active.reduce((s, b) => s + (b.remainingQty || 0), 0);
    const totalValue = active.reduce(
      (s, b) => s + (b.remainingQty || 0) * (b.unitCost || 0),
      0,
    );
    const avg = totalQty > 0 ? totalValue / totalQty : mat.baseCost || 0;
    cost += remaining * avg;
  }
  return cost / q;
}

function bomToApiPayload(bom, materials) {
  const components = (bom.components || []).map((c) => {
    const invId = c.inventoryId ?? c.materialId;
    const mat = materials.find(
      (m) => String(m.id ?? m._id) === String(invId),
    );
    const qty = Number(c.qty) || 1;
    const uc = fifoUnitCostForBom(mat, qty);
    return {
      inventoryId: String(invId),
      materialName: mat?.name || c.materialName || "Unknown",
      qty,
      unit: mat?.uom || c.unit || "pcs",
      unitCost: Number(c.unitCost ?? uc) || 0,
    };
  });
  const variantName =
    (bom.variantName && String(bom.variantName).trim()) ||
    (bom.productName && String(bom.productName).trim()) ||
    "Default";
  return {
    productName: bom.productName,
    productGroupName: bom.productGroupName || bom.productName,
    variantName,
    variantCombo: bom.variantCombo ?? null,
    category: bom.category || null,
    components,
  };
}

function materialToApiPayload(m, supplierNameFallback = "Unspecified") {
  const unitCost = Number(m.baseCost ?? m.averageCost ?? 0);
  return {
    name: m.name,
    category: m.category || "Uncategorized",
    stockQty: Number(m.stockQty ?? 0),
    minStockLevel: Number(m.minStock ?? 10),
    isOnDemand: m.procurementType === "on-demand",
    supplierId: m.preferredVendorId || null,
    supplierName: supplierNameFallback,
    unitCost,
    sku: m.sku || undefined,
    uom: m.uom || "pcs",
    batches: m.batches || [],
    baseCost: Number(m.baseCost ?? unitCost),
    parentId: m.parentId ? String(m.parentId) : null,
    hasVariants: !!m.hasVariants,
    variantTypes: m.variantTypes || [],
    variantCombo: m.variantCombo ?? undefined,
    procurementType: m.procurementType || "stock",
    allowBackorder: !!m.allowBackorder,
  };
}

function checkUnitUsage(unitCode, vendors, materials) {
  const vendorUsage = vendors.filter((v) =>
    (v.itemsSupplied || []).some((item) => item.uom === unitCode),
  ).length;

  const materialUsage = materials.filter((m) => m.uom === unitCode).length;

  return {
    vendorUsage,
    materialUsage,
    totalUsage: vendorUsage + materialUsage,
  };
}
// Always return only the two allowed categories — ignore localStorage
function getCategories() {
  return [...ALLOWED_CATEGORIES];
}
function saveCategories() {
  /* no-op — categories are fixed */
}
function addCategory() {
  return [...ALLOWED_CATEGORIES];
}

// ── Batch Management Helpers ─────────────────────────────────────────────────
// Generate unique batch ID: YYYYMMDD-TIMESTAMP-SEQ
function generateBatchId() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  const seq = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${dateStr}-${timestamp}-${seq}`;
}

// Compute total stock from batches (sum of remainingQty)
function computeStockFromBatches(batches) {
  if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
  return batches.reduce(
    (sum, b) => sum + (b.remainingQty || b.goodQty || b.qtyGood || 0),
    0,
  );
}

// Compute FIFO cost = unit cost of the OLDEST active batch (next batch to be issued)
function computeAveCostFromBatches(batches) {
  if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
  const oldest = [...batches]
    .filter((b) => (b.remainingQty || 0) > 0)
    .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))[0];
  return oldest ? oldest.unitCost || 0 : 0;
}

// ── SKU Generation (client preview only; persistence uses API / server SKU when saving) ──
// Format: {CAT}-{PRODUCT}-{VARIANTS}-{SEQ}
// Examples: MUG-INN-0001, MUG-CER-WHT-11OZ-0001

// Get 2-letter prefix from a string: 1st letter of each word (up to 2 words)
// Examples: "Canvas Totebags" to "CT", "T-Shirts" to "TS", "Totebag" to "TO"
function getPrefix(str) {
  const words = str
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  // Single word: first 2 letters
  const cleaned = words[0] || "";
  return cleaned.substring(0, 2).toUpperCase() || "XX";
}

// Get short code from variant option (e.g., "White" to "WHT", "11oz" to "11OZ")
function getVariantCode(opt) {
  const cleaned = opt.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (/^\d/.test(cleaned)) {
    // Starts with number (e.g., "11oz"): keep full alphanumeric
    return cleaned;
  }
  return cleaned.substring(0, 3);
}

// Generate SKU for standalone material (no variants)
function genAutoSKU(category, productName, existingMaterials) {
  const catP = getPrefix(category);
  const prodP = getPrefix(productName);
  const baseKey = `${catP}-${prodP}`;

  // Count existing materials with same base key to determine sequence
  const existingCount = (existingMaterials || []).filter(
    (m) => m.sku && m.sku.startsWith(baseKey + "-") && !m.parentId,
  ).length;

  const finalSeq = existingCount + 1;
  return `${baseKey}-${String(finalSeq).padStart(4, "0")}`;
}

// Generate SKU for a variant combination
function genComboSKU(
  category,
  productName,
  comboMap,
  allOptionsPerType,
  existingMaterials,
) {
  const catP = getPrefix(category);
  const prodP = getPrefix(productName);

  if (!comboMap || Object.keys(comboMap).length === 0) {
    return genAutoSKU(category, productName, existingMaterials);
  }

  // Build variant part from combo
  const varParts = Object.entries(comboMap).map(([typeName, optVal]) => {
    return getVariantCode(optVal);
  });

  const baseKey = `${catP}-${prodP}-${varParts.join("-")}`;

  // Count existing variants with same base key
  const existingCount = (existingMaterials || []).filter(
    (m) => m.sku && m.sku.startsWith(baseKey + "-") && m.parentId,
  ).length;

  const finalSeq = existingCount + 1;
  return `${baseKey}-${String(finalSeq).padStart(4, "0")}`;
}

// Generate all variant SKUs for a product
function generateVariantSKUs(
  category,
  productName,
  variantTypes,
  existingMaterials,
) {
  const tracked = (variantTypes || []).filter(
    (vt) => vt.isStockable !== false && vt.options.length > 0,
  );

  if (tracked.length === 0) {
    const sku = genAutoSKU(category, productName, existingMaterials);
    return [
      {
        comboKey: "__base__",
        comboLabel: productName,
        comboMap: {},
        sku,
        variantName: productName,
      },
    ];
  }

  const selectedPerType = {};
  tracked.forEach((vt) => {
    selectedPerType[vt.name] = vt.options;
  });

  const cross = (types) => {
    if (types.length === 0) return [{}];
    const [first, ...rest] = types;
    const opts = selectedPerType[first.name] || [];
    if (opts.length === 0) return cross(rest);
    return opts.flatMap((o) =>
      cross(rest).map((r) => ({ [first.name]: o, ...r })),
    );
  };

  const combos = cross(tracked);
  const allOptionsPerType = {};
  tracked.forEach((vt) => {
    allOptionsPerType[vt.name] = vt.options;
  });

  return combos.map((combo, idx) => {
    const label = Object.values(combo).join(" / ");
    // Sort entries by key name for consistent combo keys across sessions
    const key = Object.entries(combo)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}:${v}`)
      .join("|");
    const sku = genComboSKU(
      category,
      productName,
      combo,
      allOptionsPerType,
      existingMaterials,
    );
    return {
      comboKey: key,
      comboLabel: label,
      comboMap: combo,
      sku,
      variantName: Object.values(combo).join(" "),
    };
  });
}

function CategoryBadge({ category }) {
  return (
    <span
      style={{
        padding: "0.2rem 0.6rem",
        borderRadius: "6px",
        fontSize: "0.65rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {category}
    </span>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a1a1a",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "0.6rem 0.75rem",
            fontSize: "0.72rem",
            color: "#E5E2E1",
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            lineHeight: 1.5,
          }}
        >
          {text}
          <span
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              border: "5px solid transparent",
              borderTopColor: "#1a1a1a",
            }}
          ></span>
        </span>
      )}
    </span>
  );
}

// ── Integer Input ──────────────────────────────────────────────────────────────
function IntegerInput({
  value,
  onChange,
  min = 0,
  max,
  placeholder,
  style,
  disabled,
}) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === "" || /^\d+$/.test(val)) {
      const num = val === "" ? 0 : parseInt(val, 10);
      if (max !== undefined && num > max) return;
      if (num < min) return;
      onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  const handleKeyDown = (e) => {
    if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
  };
  const handleWheel = (e) => {
    if (document.activeElement === e.target) e.target.blur();
  };
  return (
    <input
      type="text"
      value={value}
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    />
  );
}

// ── Decimal Input ──────────────────────────────────────────────────────────────
function DecimalInput({
  value,
  onChange,
  placeholder,
  style,
  disabled,
  max = 9999999.99,
}) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      const num = parseFloat(val) || 0;
      if (num <= max) onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  const handleKeyDown = (e) => {
    if (["e", "E", "+", "-", " "].includes(e.key)) e.preventDefault();
  };
  const handleWheel = (e) => {
    if (document.activeElement === e.target) e.target.blur();
  };
  return (
    <input
      type="text"
      value={value}
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    />
  );
}

// ── Info Modal ─────────────────────────────────────────────────────────────────
function InfoModal({ isOpen, onClose, title, message }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "440px" }}
      >
        <div className="modal-header">
          <h2 className="modal-title" style={{ fontSize: "1rem" }}>
            {title}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div
          style={{
            padding: "1.5rem 2rem",
            fontSize: "0.875rem",
            color: "#E5E2E1",
            lineHeight: 1.6,
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </div>
        <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ──────────────────────────────────────────────────────────────
function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  confirmClass = "btn-danger",
}) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "440px" }}
      >
        <div className="modal-header">
          <h2 className="modal-title" style={{ fontSize: "1rem" }}>
            {title}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div
          style={{
            padding: "1.5rem 2rem",
            fontSize: "0.875rem",
            color: "#E5E2E1",
            lineHeight: 1.6,
          }}
        >
          {message}
        </div>
        <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Material Details Modal (Read-only) ─────────────────────────────────────────
function MaterialDetailsModal({ material, vendors, onClose }) {
  if (!material) return null;
  const vendor = vendors.find((v) => v.id === material.preferredVendorId);

  // Compute stock from batches if available
  const stockFromBatches =
    material.batches &&
    Array.isArray(material.batches) &&
    material.batches.length > 0
      ? material.batches.reduce(
          (sum, b) => sum + (b.remainingQty || b.goodQty || b.qtyGood || 0),
          0,
        )
      : null;
  const displayStock =
    stockFromBatches !== null ? stockFromBatches : material.stockQty || 0;

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "560px" }}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title" style={{ fontSize: "1.1rem" }}>
              {material.name}
            </h2>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--gray)",
                fontFamily: "monospace",
                marginTop: "0.2rem",
              }}
            >
              {material.sku || "—"}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div
          style={{
            padding: "1.5rem 2rem",
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.25rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: "0.3rem",
                }}
              >
                Category
              </div>
              <CategoryBadge category={material.category} />
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: "0.3rem",
                }}
              >
                Unit of Measure
              </div>
              <div
                style={{
                  fontSize: "0.95rem",
                  color: "#E5E2E1",
                  fontWeight: 600,
                }}
              >
                {material.uom || "pcs"}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: "0.3rem",
                }}
              >
                Current Stock
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#22c55e",
                }}
              >
                {displayStock} {material.uom || "pcs"}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: "0.3rem",
                }}
              >
                Base Cost (AVE)
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#D4A843",
                }}
              >
                ₱
                {(material.baseCost || 0).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: "0.3rem",
                }}
              >
                Preferred Vendor
              </div>
              <div
                style={{
                  fontSize: "0.95rem",
                  color: vendor ? "#3b82f6" : "var(--gray)",
                  fontWeight: 600,
                }}
              >
                {vendor?.name || "—"}
              </div>
            </div>
          </div>

          {/* Batch Details Section */}
          {material.batches && material.batches.length > 0 && (
            <div
              style={{
                marginTop: "1.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: "0.75rem",
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
                  stroke="#818cf8"
                  strokeWidth="2.5"
                >
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                Batches ({material.batches.length})
              </div>
              {material.batches
                .sort(
                  (a, b) => new Date(b.dateReceived) - new Date(a.dateReceived),
                )
                .map((batch, idx) => (
                  <div
                    key={batch.batchId}
                    style={{
                      padding: "0.75rem",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "8px",
                      marginBottom:
                        idx < material.batches.length - 1 ? "0.5rem" : "0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.4rem",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#E5E2E1",
                          fontWeight: 600,
                          fontFamily: "monospace",
                        }}
                      >
                        {batch.invoiceNumber || batch.invoiceNo || `Batch #${idx + 1}`}
                      </div>
                      <span
                        style={{
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          background:
                            batch.status === "exhausted"
                              ? "rgba(239,68,68,0.15)"
                              : "rgba(34,197,94,0.15)",
                          color:
                            batch.status === "exhausted"
                              ? "#ef4444"
                              : "#22c55e",
                          border: `1px solid ${batch.status === "exhausted" ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                        }}
                      >
                        {batch.status === "exhausted"
                          ? "Exhausted"
                          : `${batch.remainingQty || 0} remaining`}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.5rem",
                        fontSize: "0.7rem",
                      }}
                    >
                      <div>
                        <span style={{ color: "var(--gray)" }}>Vendor:</span>{" "}
                        <span style={{ color: "#E5E2E1" }}>
                          {batch.vendorName || "—"}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "var(--gray)" }}>Received:</span>{" "}
                        <span style={{ color: "#E5E2E1" }}>
                          {new Date(batch.dateReceived).toLocaleDateString(
                            "en-PH",
                          )}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "var(--gray)" }}>In Stock:</span>{" "}
                        <span style={{ color: "#22c55e" }}>
                          {batch.remainingQty ?? batch.qtyGood ?? 0} {material.uom || "pcs"}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "var(--gray)" }}>Unit Cost:</span>{" "}
                        <span
                          style={{ color: "#D4A843", fontFamily: "monospace" }}
                        >
                          ₱
                          {(batch.unitCost || 0).toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      {batch.poNumber && (
                        <div>
                          <span style={{ color: "var(--gray)" }}>PO:</span>{" "}
                          <span
                            style={{
                              color: "#3b82f6",
                              fontFamily: "monospace",
                            }}
                          >
                            {batch.poNumber}
                          </span>
                        </div>
                      )}
                      {batch.grNumber && (
                        <div>
                          <span style={{ color: "var(--gray)" }}>GR:</span>{" "}
                          <span
                            style={{
                              color: "#3b82f6",
                              fontFamily: "monospace",
                            }}
                          >
                            {batch.grNumber}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {material.procurementType === "on-demand" && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "rgba(129,140,248,0.08)",
                borderRadius: "8px",
                border: "1px solid rgba(129,140,248,0.2)",
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
                stroke="#818cf8"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "#818cf8",
                  fontWeight: 600,
                }}
              >
                On-Demand (Make to Order)
              </span>
            </div>
          )}
          {material.variantTypes && material.variantTypes.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: "0.5rem",
                }}
              >
                Variant Types
              </div>
              {material.variantTypes.map((vt, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "0.8rem",
                    color: "#E5E2E1",
                    marginBottom: "0.25rem",
                  }}
                >
                  <span style={{ color: "var(--gray)" }}>{vt.name}:</span>{" "}
                  {vt.options.join(", ")}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MATERIAL MASTER TAB
// ══════════════════════════════════════════════════════════════════════════════
function supplierPayloadFromVendorRecord(v) {
  const items = (v.itemsSupplied || [])
    .map((item) => {
      if (typeof item === "string") return { name: item, uom: "pcs" };
      return {
        name: (item.name || "").trim(),
        uom: item.uom || "pcs",
      };
    })
    .filter((i) => i.name);

  const toArr = (newField, oldField) => {
    if (Array.isArray(newField) && newField.length > 0) return newField;
    if (Array.isArray(oldField) && oldField.length > 0) return oldField;
    if (typeof oldField === "string" && oldField.trim()) return [oldField.trim()];
    return [];
  };

  return {
    name: (v.name || "").trim(),
    contacts: toArr(v.contacts, v.contact),
    phones:   toArr(v.phones,   v.phone),
    emails:   toArr(v.emails,   v.email),
    address: v.address || "",
    notes: v.notes || "",
    itemsSupplied: items,
  };
}

function MaterialMasterTab({
  itemCategories,
  materials,
  vendors,
  token,
  boms,
  units,
  refreshMaterials,
  onVendorsChange,
  onOpenUnits,
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [matPage, setMatPage] = useState(1);
  const [matPerPage, setMatPerPage] = useState(10);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMaterial, setEditMaterial] = useState(null);
  const [viewMaterial, setViewMaterial] = useState(null);
  const [saveConfirm, setSaveConfirm] = useState({ open: false, args: null });
  const [infoModal, setInfoModal] = useState({
    isOpen: false,
    title: "",
    message: "",
  });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [showCategoryInput, setShowCategoryInput] = useState(false);

  useEffect(() => {
    if (!refreshMaterials) return;
    const handleFocus = () => refreshMaterials();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshMaterials]);


  // ── Batch Helper: Compute stock from batches ──────────────────────────────
  const getStockQty = (material) => {
    if (
      material.batches &&
      Array.isArray(material.batches) &&
      material.batches.length > 0
    ) {
      return material.batches.reduce(
        (sum, b) => sum + (b.remainingQty || b.goodQty || b.qtyGood || 0),
        0,
      );
    }
    return material.stockQty || 0;
  };

  // Handler to add a new category
  const handleAddCategory = () => {
    setShowCategoryInput(true);
    setNewCategoryInput("");
  };

  const handleSaveCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) {
      setShowCategoryInput(false);
      return;
    }
    if (itemCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setShowCategoryInput(false);
      return;
    }
    const updatedVendors = vendors.map((v) => {
      const items = v.itemsSupplied || [];
      const alreadyExists = items.some(
        (item) =>
          (typeof item === "string" ? item : item.name).toLowerCase() ===
          trimmed.toLowerCase(),
      );
      return {
        ...v,
        itemsSupplied: alreadyExists
          ? items
          : [...items, { name: trimmed, uom: "pcs" }],
      };
    });

    if (!token) {
      onVendorsChange?.(updatedVendors);
      setShowCategoryInput(false);
      setNewCategoryInput("");
      return;
    }

    try {
      await Promise.all(
        updatedVendors.map(async (v, i) => {
          const prev = vendors[i];
          const prevItems = JSON.stringify(prev?.itemsSupplied || []);
          const nextItems = JSON.stringify(v.itemsSupplied || []);
          if (prevItems === nextItems) return;
          const id = v.id ?? v._id;
          if (!id) return;
          await updateSupplier(id, supplierPayloadFromVendorRecord(v), token);
        }),
      );
      const data = await fetchSuppliers(token);
      const arr = Array.isArray(data) ? data : [];
      onVendorsChange?.(arr.map((x) => ({ ...x, id: x.id ?? x._id })));
    } catch (e) {
      setInfoModal({
        isOpen: true,
        title: "Could not update vendors",
        message: e?.message || "Failed to sync item categories.",
      });
    }
    setShowCategoryInput(false);
    setNewCategoryInput("");
  };

  // Handler to open vendor add modal
  const handleAddVendor = () => {
    setShowAddModal(false);
    setEditMaterial(null);
    setShowVendorModal(true);
  };

  const handleSaveVendorFromMaterial = async (vendor) => {
    if (!token) {
      setInfoModal({
        isOpen: true,
        title: "Sign in required",
        message: "Add vendors from the API while signed in as admin.",
      });
      return;
    }
    try {
      const payload = supplierPayloadFromVendorRecord(vendor);
      await createSupplier(payload, token);
      const data = await fetchSuppliers(token);
      const arr = Array.isArray(data) ? data : [];
      onVendorsChange?.(arr.map((x) => ({ ...x, id: x.id ?? x._id })));
      setShowVendorModal(false);
      setShowAddModal(true);
    } catch (e) {
      setInfoModal({
        isOpen: true,
        title: "Could not create vendor",
        message: e?.message || "Failed to save supplier.",
      });
    }
  };

  const groupedMaterials = useMemo(() => {
    const parents = materials.filter((m) => m.hasVariants && !m.parentId);
    const childrenMap = new Map();
    const standalone = materials.filter((m) => !m.hasVariants && !m.parentId);
    materials
      .filter((m) => m.parentId)
      .forEach((child) => {
        const key = String(child.parentId);
        if (!childrenMap.has(key)) childrenMap.set(key, []);
        childrenMap.get(key).push(child);
      });
    return { parents, childrenMap, standalone };
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase();
    const result = [];
    for (const m of groupedMaterials.standalone) {
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.sku || "").toLowerCase().includes(q);
      const matchCat = !categoryFilter || m.category === categoryFilter;
      if (matchSearch && matchCat) result.push({ type: "standalone", item: m });
    }
    for (const parent of groupedMaterials.parents) {
      const matchSearch =
        !q ||
        parent.name.toLowerCase().includes(q) ||
        (parent.sku || "").toLowerCase().includes(q);
      const matchCat = !categoryFilter || parent.category === categoryFilter;
      if (matchSearch && matchCat) {
        const children = (
          groupedMaterials.childrenMap.get(String(parent.id)) || []
        ).filter((c) => {
          if (!q) return true;
          return (
            c.name.toLowerCase().includes(q) ||
            (c.sku || "").toLowerCase().includes(q)
          );
        });
        result.push({ type: "parent", item: parent, children });
      }
    }
    return result;
  }, [search, categoryFilter, groupedMaterials]);

  useEffect(() => { setMatPage(1); }, [search, categoryFilter]);

  const totalMatPages = Math.max(1, Math.ceil(filteredMaterials.length / matPerPage));
  const pagedMaterials = filteredMaterials.slice((matPage - 1) * matPerPage, matPage * matPerPage);

  const toggleExpand = (id) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = (id) => {
    const mat = materials.find((m) => m.id === id);
    // Check if material has any stock/batches
    const hasStock =
      mat &&
      ((mat.stockQty || 0) > 0 ||
        (mat.batches || []).some(
          (b) => (b.remainingQty || b.qtyGood || 0) > 0,
        ));
    // Also check children for parent materials
    const children = materials.filter((m) => m.parentId === id);
    const childrenHaveStock = children.some(
      (c) =>
        (c.stockQty || 0) > 0 ||
        (c.batches || []).some((b) => (b.remainingQty || b.qtyGood || 0) > 0),
    );

    const isUsedInBOM = (boms || []).some((bom) =>
      (bom.components || []).some(
        (comp) =>
          String(comp.materialId ?? comp.inventoryId ?? "") === String(id),
      ),
    );

    if (hasStock || childrenHaveStock) {
      setInfoModal({
        isOpen: true,
        title: "Cannot Delete",
        message: `Cannot delete "${mat?.name}" — it has existing stock or purchase batches.`,
      });
      return;
    }

    if (isUsedInBOM) {
      setInfoModal({
        isOpen: true,
        title: "Cannot Delete",
        message: `Cannot delete "${mat?.name}" — it is currently used in a Bill of Materials (BOM). Remove it from all BOMs first.`,
      });
      return;
    }

    const isParent = !!mat?.hasVariants;
    const isChild = !!mat?.parentId;

    if (isParent && children.length > 0) {
      setInfoModal({
        isOpen: true,
        title: "Cannot Delete",
        message: `"${mat?.name}" has ${children.length} variant${children.length > 1 ? "s" : ""}. Delete all variants first before deleting the parent material.`,
      });
      return;
    }

    const deleteMessage = isChild
      ? `Delete variant "${mat?.name}"? This action cannot be undone.`
      : `Delete "${mat?.name}"? This action cannot be undone.`;

    setConfirmModal({
      isOpen: true,
      title: isChild ? "Delete Variant" : "Delete Material",
      message: deleteMessage,
      onConfirm: async () => {
        if (!token) {
          setInfoModal({
            isOpen: true,
            title: "Sign in required",
            message: "Sign in as admin to delete inventory.",
          });
          setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: null });
          return;
        }
        setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: null });
        try {
          const childRows = materials.filter((m) => m.parentId === id);
          for (const c of childRows) {
            if (isLikelyMongoId(c.id)) await deleteInventory(c.id, token);
          }
          if (isLikelyMongoId(id)) await deleteInventory(id, token);
          await refreshMaterials();
        } catch (e) {
          setInfoModal({
            isOpen: true,
            title: "Delete failed",
            message: e?.message || "Could not delete material.",
          });
        }
      },
    });
  };

  const handleSave = async (material, children = [], oldChildIds = []) => {
    if (!token) {
      setInfoModal({
        isOpen: true,
        title: "Sign in required",
        message: "Sign in as admin to save materials.",
      });
      return;
    }
    const supplierName =
      vendors.find((v) => v.id === material.preferredVendorId)?.name ||
      "Unspecified";

    try {
      if (editMaterial) {
        const { sku: _ps, ...parentUpdatePayload } = materialToApiPayload(material, supplierName);
        await updateInventory(
          editMaterial.id,
          parentUpdatePayload,
          token,
        );
        for (const oid of oldChildIds) {
          if (isLikelyMongoId(oid)) await deleteInventory(oid, token);
        }
        const canonicalParentId = isLikelyMongoId(editMaterial.id)
          ? editMaterial.id
          : null;
        for (const ch of children || []) {
          const base = {
            ...ch,
            preferredVendorId: material.preferredVendorId,
            parentId: canonicalParentId,
          };
          const payload = materialToApiPayload(base, supplierName);
          if (isLikelyMongoId(ch.id)) {
            const { sku: _cs, ...childUpdatePayload } = payload;
            await updateInventory(ch.id, childUpdatePayload, token);
          } else {
            if (!canonicalParentId) {
              console.warn('Skipping child create: parent has no valid MongoDB id');
              continue;
            }
            await createInventory(
              { ...payload, parentId: String(canonicalParentId) },
              token,
            );
          }
        }
      } else {
        const created = await createInventory(
          materialToApiPayload({ ...material, parentId: null }, supplierName),
          token,
        );
        const pid = created.id ?? created._id;
        for (const ch of children || []) {
          await createInventory(
            materialToApiPayload(
              {
                ...ch,
                parentId: pid,
                preferredVendorId: material.preferredVendorId,
              },
              supplierName,
            ),
            token,
          );
        }
      }
      await refreshMaterials();
      try { sessionStorage.removeItem('pmp_mat_draft'); } catch {}
      setShowAddModal(false);
      setEditMaterial(null);
    } catch (e) {
      setInfoModal({
        isOpen: true,
        title: "Could not save material",
        message: e?.message || "Failed to save.",
      });
    }
  };

  const totalMaterials =
    materials.filter((m) => !m.parentId && !m.hasVariants).length +
    materials.filter((m) => m.parentId).length;

  // SVG icons
  const EditIcon = () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
  const TrashIcon = () => (
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
  );
  const EyeIcon = () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  return (
    <div>
      {/* Summary Cards */}
      <div className="inventory-summary" style={{ marginBottom: "1.5rem" }}>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{totalMaterials}</span>
            <span className="summary-label">Total Materials</span>
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
              placeholder="Filter materials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch("")}>
                x
              </button>
            )}
          </div>
          <CustomDropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "", label: "All Categories" },
              ...itemCategories.map((c) => ({ value: c, label: c })),
            ]}
            placeholder="All Categories"
            style={{ minWidth: "140px" }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {onOpenUnits && (
            <button
              type="button"
              onClick={onOpenUnits}
              style={{ padding: "0.625rem 1rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--gray)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="16" width="20" height="4" rx="1"/></svg>
              Units
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
            Add Material
          </button>
        </div>
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
              <th
                style={{
                  padding: "0.875rem 1rem",
                  textAlign: "left",
                  color: "var(--gray)",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  width: "40px",
                }}
              ></th>
              <th
                style={{
                  padding: "0.875rem 1rem",
                  textAlign: "left",
                  color: "var(--gray)",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                SKU / Name
              </th>
              <th
                style={{
                  padding: "0.875rem 1rem",
                  textAlign: "center",
                  color: "var(--gray)",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Category
              </th>
              <th
                style={{
                  padding: "0.875rem 1rem",
                  textAlign: "right",
                  color: "var(--gray)",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Base Cost
              </th>
              <th
                style={{
                  padding: "0.875rem 1rem",
                  textAlign: "center",
                  color: "var(--gray)",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  width: "100px",
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredMaterials.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "var(--gray)",
                  }}
                >
                  {materials.length === 0
                    ? 'No materials yet. Click "Add Material" to get started.'
                    : "No materials match your filters."}
                </td>
              </tr>
            ) : (
              pagedMaterials.map((row) => {
                if (row.type === "standalone") {
                  const m = row.item;
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
                      <td style={{ padding: "0.875rem 1rem" }}></td>
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
                        }}
                      >
                        <CategoryBadge category={m.category} />
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "right",
                          fontWeight: 600,
                          color: "#E5E2E1",
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
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "0.35rem",
                            justifyContent: "center",
                          }}
                        >
                          <button
                            onClick={() => {
                              setEditMaterial(m);
                              setShowAddModal(true);
                            }}
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              padding: "0.4rem",
                              cursor: "pointer",
                              color: "var(--gray)",
                            }}
                            title="Edit"
                          >
                            <EditIcon />
                          </button>
                          <button
                            onClick={() => setViewMaterial(m)}
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              padding: "0.4rem",
                              cursor: "pointer",
                              color: "var(--gray)",
                            }}
                            title="View Details"
                          >
                            <EyeIcon />
                          </button>
                          <button
                            onClick={() => handleDelete(m.id || m._id)}
                            style={{
                              background: "rgba(239,68,68,0.08)",
                              border: "1px solid rgba(239,68,68,0.2)",
                              borderRadius: "6px",
                              padding: "0.4rem",
                              cursor: "pointer",
                              color: "var(--red)",
                            }}
                            title="Delete"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const parent = row.item;
                const children = row.children || [];
                const isExpanded = expandedParents.has(parent.id);

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
                        (e.currentTarget.style.background = isExpanded
                          ? "rgba(212,168,67,0.02)"
                          : "rgba(212,168,67,0.02)")
                      }
                    >
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
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
                            padding: "0",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            style={{
                              transition: "transform 0.2s",
                              transform: isExpanded ? "rotate(90deg)" : "none",
                            }}
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </button>
                      </td>
                      <td style={{ padding: "0.875rem 1rem" }}>
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
                          {children.length > 0 && (
                            <span
                              style={{
                                padding: "0.15rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                background: "rgba(212,168,67,0.15)",
                                color: "#D4A843",
                                flexShrink: 0,
                              }}
                            >
                              Has Variants
                            </span>
                          )}
                        </div>
                        {parent.variantTypes &&
                          parent.variantTypes.length > 0 && (
                            <div
                              style={{
                                fontSize: "0.65rem",
                                color: "var(--gray)",
                                marginTop: "0.2rem",
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
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                        }}
                      >
                        <CategoryBadge category={parent.category} />
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "right",
                          fontWeight: 600,
                          color: "#E5E2E1",
                        }}
                      >
                        {parent.hasVariants && children.length > 0
                          ? (() => {
                              const costs = children
                                .map((c) => c.baseCost || 0)
                                .filter((c) => c > 0);
                              const min = Math.min(...costs);
                              const max = Math.max(...costs);
                              if (min === max)
                                return `P${min.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
                              return (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-end",
                                    gap: "0.1rem",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                      color: "#E5E2E1",
                                    }}
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
                                  <span
                                    style={{
                                      fontSize: "0.6rem",
                                      color: "var(--gray)",
                                    }}
                                  >
                                    {children.length} variants
                                  </span>
                                </div>
                              );
                            })()
                          : `P${(parent.baseCost || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          textAlign: "center",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "0.35rem",
                            justifyContent: "center",
                          }}
                        >
                          <button
                            onClick={() => {
                              setEditMaterial(parent);
                              setShowAddModal(true);
                            }}
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              padding: "0.4rem",
                              cursor: "pointer",
                              color: "var(--gray)",
                            }}
                          >
                            <EditIcon />
                          </button>
                          <button
                            onClick={() => setViewMaterial(parent)}
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              padding: "0.4rem",
                              cursor: "pointer",
                              color: "var(--gray)",
                            }}
                          >
                            <EyeIcon />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(parent.id || parent._id); }}
                            style={{
                              background: "rgba(239,68,68,0.08)",
                              border: "1px solid rgba(239,68,68,0.2)",
                              borderRadius: "6px",
                              padding: "0.4rem",
                              cursor: "pointer",
                              color: "var(--red)",
                            }}
                            title="Delete"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded &&
                      children.map((child) => (
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
                                width: "16px",
                                height: "1px",
                                background: "rgba(212,168,67,0.3)",
                                marginBottom: "4px",
                              }}
                            ></div>
                          </td>
                          <td
                            style={{ padding: "0.75rem 1rem 0.75rem 2.5rem" }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                color: "#E5E2E1",
                                fontSize: "0.825rem",
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
                            }}
                          >
                            <CategoryBadge category={child.category} />
                          </td>
                          <td
                            style={{
                              padding: "0.75rem 1rem",
                              textAlign: "right",
                              fontWeight: 600,
                              color: "#E5E2E1",
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
                              textAlign: "center",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "0.35rem",
                                justifyContent: "center",
                              }}
                            >
                              <button
                                onClick={() => setViewMaterial(child)}
                                style={{
                                  background: "rgba(255,255,255,0.05)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "6px",
                                  padding: "0.4rem",
                                  cursor: "pointer",
                                  color: "var(--gray)",
                                }}
                                title="View Details"
                              >
                                <EyeIcon />
                              </button>
                              <button
                                onClick={() => handleDelete(child.id || child._id)}
                                style={{
                                  background: "rgba(239,68,68,0.08)",
                                  border: "1px solid rgba(239,68,68,0.2)",
                                  borderRadius: "6px",
                                  padding: "0.4rem",
                                  cursor: "pointer",
                                  color: "var(--red)",
                                }}
                                title="Delete"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        {filteredMaterials.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 1rem", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.8rem", color: "var(--gray)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Rows per page:
              <select value={matPerPage} onChange={(e) => { setMatPerPage(Number(e.target.value)); setMatPage(1); }} style={{ background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--white)", padding: "0.2rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" }}>
                {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <button onClick={() => setMatPage((p) => Math.max(1, p - 1))} disabled={matPage <= 1} style={{ padding: "0.25rem 0.625rem", background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: matPage <= 1 ? "var(--gray)" : "var(--white)", cursor: matPage <= 1 ? "not-allowed" : "pointer" }}>‹</button>
              <button onClick={() => setMatPage((p) => Math.min(totalMatPages, p + 1))} disabled={matPage >= totalMatPages} style={{ padding: "0.25rem 0.625rem", background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: matPage >= totalMatPages ? "var(--gray)" : "var(--white)", cursor: matPage >= totalMatPages ? "not-allowed" : "pointer" }}>›</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              Page: <span style={{ padding: "0.2rem 0.6rem", background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--white)", minWidth: "28px", textAlign: "center" }}>{matPage}</span> of {totalMatPages}
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <MaterialFormModal
          itemCategories={itemCategories}
          vendors={vendors}
          materials={materials}
          units={units}
          editMaterial={editMaterial}
          editMaterialStock={editMaterial ? getStockQty(editMaterial) : 0}
          onClose={() => {
            try { sessionStorage.removeItem('pmp_mat_draft'); } catch {}
            setShowAddModal(false);
            setEditMaterial(null);
          }}
          onSave={(mat, ch, old) => setSaveConfirm({ open: true, args: [mat, ch, old] })}
          onAddCategory={handleAddCategory}
          onAddVendor={handleAddVendor}
        />
      )}
      {saveConfirm.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "14px", padding: "2rem", width: "400px", maxWidth: "92vw" }}>
            <div style={{ fontSize: "0.6rem", color: "#D4A843", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, marginBottom: "0.5rem" }}>Confirm Save</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E5E2E1", marginBottom: "0.75rem" }}>
              {editMaterial ? "Update Material?" : "Save Material?"}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--gray)", marginBottom: "1.5rem" }}>
              {editMaterial
                ? `Apply changes to "${editMaterial.name}"?`
                : `Create "${saveConfirm.args?.[0]?.name || "this material"}"?`}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setSaveConfirm({ open: false, args: null })} style={{ padding: "0.5rem 1.25rem", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--gray)", cursor: "pointer", fontSize: "0.85rem" }}>Cancel</button>
              <button onClick={() => { const a = saveConfirm.args; setSaveConfirm({ open: false, args: null }); handleSave(...a); }} style={{ padding: "0.5rem 1.25rem", background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)", border: "none", borderRadius: "8px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}>
                {editMaterial ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewMaterial && (
        <MaterialDetailsModal
          material={viewMaterial}
          vendors={vendors}
          onClose={() => setViewMaterial(null)}
        />
      )}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() =>
          setConfirmModal({
            isOpen: false,
            title: "",
            message: "",
            onConfirm: null,
          })
        }
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Delete"
        confirmClass="btn-danger"
      />
      <InfoModal
        isOpen={infoModal.isOpen}
        onClose={() => setInfoModal({ isOpen: false, title: "", message: "" })}
        title={infoModal.title}
        message={infoModal.message}
      />


      {/* Category Input Modal */}
      {showCategoryInput && (
        <div className="modal-overlay">
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "400px" }}
          >
            <div className="modal-header">
              <h2 className="modal-title">Add New Category</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowCategoryInput(false);
                  setNewCategoryInput("");
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ padding: "1.5rem 2rem" }}>
              <label className="form-label">Category Name</label>
              <input
                type="text"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#E5E2E1",
                  padding: "0.625rem 0.75rem",
                  fontSize: "0.85rem",
                  outline: "none",
                }}
                value={newCategoryInput}
                onChange={(e) =>
                  setNewCategoryInput(e.target.value.slice(0, 50))
                }
                placeholder="e.g., Mugs, Packaging..."
                maxLength={50}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveCategory();
                }}
              />
            </div>
            <div
              className="modal-actions"
              style={{ justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowCategoryInput(false);
                  setNewCategoryInput("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveCategory}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Add Modal (from Material form) */}
      {showVendorModal && (
        <VendorFormModal
          vendor={null}
          allVendors={vendors}
          materials={materials}
          units={units}
          onClose={() => {
            setShowVendorModal(false);
            setShowAddModal(true);
          }}
          onSave={handleSaveVendorFromMaterial}
        />
      )}
    </div>
  );
}

// ── Material Form Modal ────────────────────────────────────────────────────────
function MaterialFormModal({
  itemCategories,
  vendors,
  materials,
  units,
  editMaterial,
  editMaterialStock = 0,
  onClose,
  onSave,
  onAddCategory,
  onAddVendor,
}) {
  const DRAFT_KEY = 'pmp_mat_draft';
  const savedDraft = !editMaterial ? (() => { try { const d = sessionStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) : null; } catch { return null; } })() : null;
  const [form, setForm] = useState(savedDraft ?? {
    name: "",
    category: itemCategories[0] || "",
    uom: "pcs",
    minStock: "",
    baseCost: "",
    procurementType: "stock",
    allowBackorder: false,
    preferredVendorId: "",
    hasVariants: false,
    variantTypes: [],
  });
  const [previewSKUs, setPreviewSKUs] = useState([]);
  const [variantCosts, setVariantCosts] = useState({});
  const [variantTypeInput, setVariantTypeInput] = useState("");
  const [variantOptionInputs, setVariantOptionInputs] = useState({});
  const [variantTypeRemoveModal, setVariantTypeRemoveModal] = useState(false);
  const [variantTutorialOpen, setVariantTutorialOpen] = useState(false);
  const [errors, setErrors] = useState({});

  // Persist add-mode draft to sessionStorage so tab switches don't wipe the form
  useEffect(() => {
    if (editMaterial) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch {}
  }, [form, editMaterial]);

  const uomOptions = useMemo(() => {
    const base = (units || []).map((u) => ({ value: u.code, label: u.name }));
    if (form.uom && !base.find((o) => o.value === form.uom)) {
      base.unshift({ value: form.uom, label: form.uom });
    }
    return base;
  }, [units, form.uom]);

  // Find which variant options are locked (used by existing child materials with stock)
  const lockedOptions = useMemo(() => {
    if (!editMaterial || !editMaterial.hasVariants) return {};
    const locked = {};
    // Find all child materials of this parent
    const children = materials.filter((m) => String(m.parentId) === String(editMaterial.id));
    children.forEach((child) => {
      if (child.variantCombo) {
        Object.entries(child.variantCombo).forEach(([typeName, optionVal]) => {
          const key = `${typeName}::${optionVal}`;
          locked[key] = true;
        });
      }
    });
    return locked;
  }, [editMaterial, materials]);

  // Check if a variant type has any locked options
  const hasLockedOptions = (typeIdx) => {
    if (!editMaterial || !editMaterial.hasVariants) return false;
    const vt = form.variantTypes[typeIdx];
    if (!vt) return false;
    return vt.options.some((opt) => lockedOptions[`${vt.name}::${opt}`]);
  };

  // Populate form when editing
  useEffect(() => {
    if (editMaterial) {
      setForm({
        name: editMaterial.name || "",
        category: editMaterial.category || itemCategories[0] || "",
        uom: editMaterial.uom || "pcs",
        minStock:
          editMaterial.minStock !== undefined
            ? String(editMaterial.minStock)
            : "",
        baseCost:
          editMaterial.baseCost !== undefined
            ? String(editMaterial.baseCost)
            : "",
        procurementType: editMaterial.procurementType || "stock",
        allowBackorder: editMaterial.allowBackorder || false,
        preferredVendorId: editMaterial.preferredVendorId || "",
        hasVariants: editMaterial.hasVariants || false,
        variantTypes: editMaterial.variantTypes || [],
      });
      // Populate variantCosts from existing children
      if (editMaterial.hasVariants) {
        const costs = {};
        const children = materials.filter(
          (m) => String(m.parentId) === String(editMaterial.id),
        );
        children.forEach((child) => {
          if (child.variantCombo) {
            // Sort entries by key name to match the sorted comboKey from generateVariantSKUs
            const key = Object.entries(child.variantCombo)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([k, v]) => `${k}:${v}`)
              .join("|");
            costs[key] = String(child.baseCost || 0);
          }
        });
        setVariantCosts(costs);
      } else {
        setVariantCosts({});
      }
    } else {
      // In add mode: restore from draft if available, otherwise reset
      const hasDraft = (() => { try { return !!sessionStorage.getItem('pmp_mat_draft'); } catch { return false; } })();
      if (!hasDraft) {
        setForm({
          name: "",
          category: itemCategories[0] || "",
          uom: "pcs",
          minStock: "",
          baseCost: "",
          procurementType: "stock",
          allowBackorder: false,
          preferredVendorId: "",
          hasVariants: false,
          variantTypes: [],
        });
        setVariantCosts({});
      }
    }
  }, [editMaterial, itemCategories, materials]);

  // Get items supplied by the selected vendor — each with {name, uom}
  const vendorItems = useMemo(() => {
    if (!form.preferredVendorId) return [];
    const selectedVendor = vendors.find((v) => v.id === form.preferredVendorId);
    if (!selectedVendor) return [];
    // Normalize: handle old string format and new object format
    return (selectedVendor.itemsSupplied || []).map((item) => {
      if (typeof item === "string") return { name: item, uom: "pcs" };
      return item;
    });
  }, [form.preferredVendorId, vendors]);

  useEffect(() => {
    if (form.procurementType === "on-demand") {
      setForm((p) => ({ ...p, allowBackorder: false }));
    }
  }, [form.procurementType]);

  // When vendorItems changes (vendor changed), clear category only if
  // the current category is no longer valid for this vendor.
  // Skip in edit mode — we must preserve the stored category even if the
  // vendor's item list no longer contains it.
  useEffect(() => {
    if (editMaterial) return;
    const vendorItemNames = vendorItems.map((i) => i.name);
    if (
      vendorItemNames.length > 0 &&
      form.category &&
      !vendorItemNames.includes(form.category)
    ) {
      setForm((p) => ({ ...p, category: "" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorItems]);

  useEffect(() => {
    if (
      form.hasVariants &&
      form.name &&
      form.variantTypes.length > 0 &&
      form.variantTypes.every((vt) => vt.options.length > 0)
    ) {
      setPreviewSKUs(
        generateVariantSKUs(
          form.category,
          form.name,
          form.variantTypes,
          materials,
        ),
      );
    } else if (!form.hasVariants && form.name) {
      const sku = genAutoSKU(form.category, form.name, materials);
      setPreviewSKUs([{ sku, variantName: form.name, comboMap: {} }]);
    } else {
      setPreviewSKUs([]);
    }
  }, [
    form.name,
    form.category,
    form.hasVariants,
    form.variantTypes,
    materials,
  ]);

  // Variant Type actions (old inventory style)
  const addVariantType = () => {
    const name = variantTypeInput.trim();
    if (!name) return;
    if (
      form.variantTypes.some(
        (vt) => vt.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return;
    const newVt = {
      id: `vt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      options: [],
      isStockable: true,
    };
    setForm((p) => ({ ...p, variantTypes: [...p.variantTypes, newVt] }));
    setVariantTypeInput("");
  };

  const removeVariantType = (idx) => {
    setForm((p) => ({
      ...p,
      variantTypes: p.variantTypes.filter((_, i) => i !== idx),
    }));
    setVariantOptionInputs((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  // Reset variantCosts on fresh add, or when switching from non-variant to variant mode
  useEffect(() => {
    if (!editMaterial) {
      setVariantCosts({});
    }
  }, [editMaterial]);

  const addVariantOption = (typeIdx) => {
    const option = (variantOptionInputs[typeIdx] || "").trim();
    if (!option) return;
    const updated = [...form.variantTypes];
    if (
      updated[typeIdx].options.some(
        (o) => o.toLowerCase() === option.toLowerCase(),
      )
    )
      return;
    updated[typeIdx].options.push(option);
    setForm((p) => ({ ...p, variantTypes: updated }));
    setVariantOptionInputs((prev) => ({ ...prev, [typeIdx]: "" }));
  };

  const removeVariantOption = (typeIdx, optIdx) => {
    const updated = [...form.variantTypes];
    updated[typeIdx].options.splice(optIdx, 1);
    setForm((p) => ({ ...p, variantTypes: updated }));
  };

  const toggleStockable = (typeIdx) => {
    const updated = [...form.variantTypes];
    updated[typeIdx] = {
      ...updated[typeIdx],
      isStockable: !updated[typeIdx].isStockable,
    };
    setForm((p) => ({ ...p, variantTypes: updated }));
  };

  // Calculate total combinations
  const getTotalCombinations = () => {
    if (form.variantTypes.length === 0) return 0;
    const stockableTypes = form.variantTypes.filter(
      (vt) => vt.isStockable !== false,
    );
    if (stockableTypes.length === 0) return 0;
    return stockableTypes.reduce((total, vt) => {
      if (vt.options.length === 0) return total;
      return total * vt.options.length;
    }, 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!form.preferredVendorId) newErrors.vendor = "Please select a vendor";
    if (form.preferredVendorId && !form.category) newErrors.category = "Please select a category";
    if (!form.name.trim()) newErrors.name = "Please enter an item name";
    // Validate variant types when variants are enabled
    if (form.hasVariants) {
      if (form.variantTypes.length === 0) {
        newErrors.variantTypes = "At least one variant type is required.";
      } else {
        const emptyType = form.variantTypes.find(
          (vt) => vt.options.length === 0,
        );
        if (emptyType)
          newErrors.variantTypes = `"${emptyType.name}" must have at least one option.`;
      }
    }
    // Validate variant costs when variants are enabled
    if (form.hasVariants && previewSKUs.length > 0) {
      const missingCost = previewSKUs.some((sku) => {
        const cost = variantCosts[sku.comboKey];
        return cost === undefined || cost === "" || parseFloat(cost) === 0;
      });
      if (missingCost)
        newErrors.variantCost = "All combinations must have a cost.";
    }
    // Validate base cost when no variants — only for new materials (edit allows 0, cost tracked via batches)
    if (!form.hasVariants && !editMaterial && form.baseCost === "") {
      newErrors.baseCost = "Base cost is required.";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const minStock = form.minStock === "" ? 10 : parseInt(form.minStock) || 10;
    const baseCost = form.baseCost === "" ? 0 : parseFloat(form.baseCost) || 0;

    const parentId = editMaterial ? editMaterial.id : `mat-${Date.now()}`;
    const existingSku = editMaterial ? editMaterial.sku : null;
    // Preserve existing batches when editing, or initialize empty array for new materials
    const existingBatches = editMaterial ? editMaterial.batches || [] : [];

    // Generate SKU using new consistent format
    const autoSku =
      existingSku || genAutoSKU(form.category, form.name, materials);

    if (form.hasVariants && previewSKUs.length > 0) {
      const catP = getPrefix(form.category);
      const prodP = getPrefix(form.name);
      const parent = {
        id: parentId,
        name: form.name,
        sku: `${catP}-${prodP}-0000`,
        category: form.category,
        uom: form.uom,
        stockQty: editMaterial ? editMaterial.stockQty : 0,
        minStock,
        baseCost,
        procurementType: form.procurementType,
        allowBackorder:
          form.procurementType === "stock" ? form.allowBackorder : false,
        preferredVendorId: form.preferredVendorId,
        hasVariants: true,
        variantTypes: form.variantTypes,
        parentId: null,
        batches: existingBatches, // NEW: Batch tracking array
        createdAt: editMaterial
          ? editMaterial.createdAt
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // When editing, find existing children by variantCombo to preserve ID and SKU
      const existingChildren =
        editMaterial && editMaterial.hasVariants
          ? materials.filter((m) => String(m.parentId) === String(editMaterial.id))
          : [];
      const children = previewSKUs.map((skuInfo, idx) => {
        const comboCost = variantCosts[skuInfo.comboKey];
        const childCost =
          comboCost !== undefined && comboCost !== ""
            ? parseFloat(comboCost) || baseCost
            : baseCost;
        // Find matching existing child by variantCombo
        const existingChild = existingChildren.find((ec) => {
          if (!ec.variantCombo) return false;
          const ecEntries = Object.entries(ec.variantCombo).sort((a, b) =>
            a[0].localeCompare(b[0]),
          );
          const newEntries = Object.entries(skuInfo.comboMap).sort((a, b) =>
            a[0].localeCompare(b[0]),
          );
          return (
            ecEntries.length === newEntries.length &&
            ecEntries.every(
              (e, i) => e[0] === newEntries[i][0] && e[1] === newEntries[i][1],
            )
          );
        });
        // Preserve child's existing batches when editing
        const childBatches = existingChild ? existingChild.batches || [] : [];
        return {
          id: existingChild ? existingChild.id : `mat-${Date.now()}-${idx}`,
          name: `${form.name} - ${skuInfo.variantName}`,
          sku: existingChild ? existingChild.sku : skuInfo.sku,
          category: form.category,
          uom: form.uom,
          stockQty: existingChild ? existingChild.stockQty || 0 : 0,
          minStock,
          baseCost: childCost,
          procurementType: form.procurementType,
          allowBackorder:
            form.procurementType === "stock" ? form.allowBackorder : false,
          preferredVendorId: form.preferredVendorId,
          hasVariants: false,
          variantTypes: [],
          parentId: parentId,
          variantCombo: skuInfo.comboMap,
          batches: childBatches, // NEW: Batch tracking array
          createdAt: existingChild
            ? existingChild.createdAt
            : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });
      // Pass the IDs of old children to delete so handleSave can also clean up BOM and other references
      const oldChildIds = existingChildren
        .map((ec) => ec.id)
        .filter((id) => !children.some((c) => c.id === id));
      await onSave(parent, children, oldChildIds);
    } else {
      await onSave(
        {
          id: parentId,
          name: form.name,
          sku: autoSku,
          category: form.category,
          uom: form.uom,
          stockQty: editMaterial ? editMaterial.stockQty : 0,
          minStock,
          baseCost,
          procurementType: form.procurementType,
          allowBackorder:
            form.procurementType === "stock" ? form.allowBackorder : false,
          preferredVendorId: form.preferredVendorId,
          hasVariants: false,
          variantTypes: [],
          parentId: editMaterial ? (editMaterial.parentId ?? null) : null,
          batches: existingBatches, // NEW: Batch tracking array
          createdAt: editMaterial
            ? editMaterial.createdAt
            : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        [],
      );
    }
  };

  // Determine which fields are locked
  const noVendor = !form.preferredVendorId;
  const noCategory = !form.category;
  const noName = !form.name || form.name.trim() === "";

  // Item Name + Category are locked until vendor is selected
  const nameFieldsLocked = noVendor || noCategory;
  // Base Cost, Min Stock, Variants, Unit are locked until vendor + category + name are filled
  const fieldsLocked = noVendor || noCategory || noName;

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
  const lockedStyle = { ...inputStyle, opacity: 0.35, cursor: "not-allowed" };

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "640px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">
            {editMaterial ? "Edit Material" : "Add Material"}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            className="modal-body"
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* 1. Preferred Vendor — ALWAYS VISIBLE */}
            <div>
              <label className="form-label">
                Preferred Vendor <span className="required">*</span>
              </label>
              <div
                style={{
                  border: errors.vendor ? "1px solid #ef4444" : "none",
                  borderRadius: "8px",
                }}
              >
                <CustomDropdown
                  value={form.preferredVendorId}
                  onChange={(val) => {
                    if (val === "__add__") {
                      onAddVendor?.();
                    } else {
                      setForm((p) => ({
                        ...p,
                        preferredVendorId: val,
                        category: "",
                      }));
                      if (errors.vendor)
                        setErrors((e) => ({ ...e, vendor: "" }));
                    }
                  }}
                  options={[
                    { value: "", label: vendors.length === 0 ? "Loading vendors..." : "Select a vendor" },
                    ...vendors.map((v) => ({ value: v.id, label: v.name })),
                    { value: "__add__", label: "+ Add New Vendor..." },
                  ]}
                  placeholder={vendors.length === 0 ? "Loading vendors..." : "Select a vendor..."}
                />
              </div>
              {errors.vendor && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "#ef4444",
                    marginTop: "0.2rem",
                    display: "block",
                  }}
                >
                  {errors.vendor}
                </span>
              )}
              {vendors.length === 0 && !errors.vendor && (
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "#f59e0b",
                    marginTop: "0.3rem",
                  }}
                >
                  Add a vendor first in the Vendor Master tab
                </div>
              )}
            </div>

            {/* 2. Category + Item Name — unlocks when vendor is selected */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <div>
                <label className="form-label">Item / Material Category</label>
                <div
                  style={{
                    border: errors.category ? "1px solid #ef4444" : "none",
                    borderRadius: "8px",
                  }}
                >
                  <CustomDropdown
                    value={form.category}
                    onChange={(val) => {
                      // Auto-fill unit from vendor's item definition
                      const selectedItem = vendorItems.find(
                        (i) => i.name === val,
                      );
                      const autoUom = selectedItem
                        ? selectedItem.uom || "pcs"
                        : "pcs";
                      setForm((p) => ({
                        ...p,
                        category: val,
                        name: "",
                        uom: autoUom,
                      }));
                      if (errors.category)
                        setErrors((e) => ({ ...e, category: "" }));
                    }}
                    options={(() => {
                      const opts = vendorItems.map((item) => ({ value: item.name, label: item.name }));
                      if (editMaterial && form.category && !opts.find((o) => o.value === form.category)) {
                        opts.unshift({ value: form.category, label: form.category });
                      }
                      return opts;
                    })()}
                    placeholder={
                      !form.preferredVendorId
                        ? "Select vendor first..."
                        : vendorItems.length === 0
                          ? "No items from this vendor"
                          : "Select category..."
                    }
                    disabled={
                      !form.preferredVendorId || vendorItems.length === 0
                    }
                  />
                </div>
                {errors.category && (
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "#ef4444",
                      marginTop: "0.2rem",
                      display: "block",
                    }}
                  >
                    {errors.category}
                  </span>
                )}
              </div>
              <div>
                <label className="form-label">
                  Item Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  style={{
                    ...(nameFieldsLocked ? lockedStyle : inputStyle),
                    borderColor: errors.name ? "#ef4444" : undefined,
                  }}
                  value={form.name}
                  onChange={(e) => {
                    setForm((p) => ({
                      ...p,
                      name: e.target.value.slice(0, 100),
                    }));
                    if (errors.name) setErrors((e2) => ({ ...e2, name: "" }));
                  }}
                  placeholder={
                    noVendor
                      ? "Select vendor first..."
                      : noCategory
                        ? "Select category first..."
                        : "e.g., Inner Color Mug"
                  }
                  required
                  maxLength={100}
                  disabled={nameFieldsLocked}
                />
                {errors.name && (
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "#ef4444",
                      marginTop: "0.2rem",
                      display: "block",
                    }}
                  >
                    {errors.name}
                  </span>
                )}
              </div>
            </div>

            {/* Lock message when fields are locked */}
            {(nameFieldsLocked || fieldsLocked) && (
              <div
                style={{
                  padding: "0.75rem",
                  background: "rgba(245,158,11,0.08)",
                  borderRadius: "8px",
                  border: "1px solid rgba(245,158,11,0.2)",
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
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span style={{ fontSize: "0.75rem", color: "#f59e0b" }}>
                  {!form.preferredVendorId
                    ? "Select a vendor to unlock the form"
                    : !form.category
                      ? "Select a category to unlock the Item Name field"
                      : !form.name || form.name.trim() === ""
                        ? "Enter an item name to unlock the remaining fields"
                        : ""}
                </span>
              </div>
            )}

            {/* 3. All other fields — locked until both vendor AND category are selected */}
            <div
              style={{
                opacity: fieldsLocked ? 0.4 : 1,
                pointerEvents: fieldsLocked ? "none" : "auto",
              }}
            >
              {/* Unit */}
              <div style={{ marginBottom: "1rem" }}>
                <label className="form-label">
                  Unit
                  {editMaterial &&
                    (editMaterialStock > 0 || editMaterial.hasVariants) && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#f59e0b",
                          marginLeft: "0.5rem",
                          fontWeight: 600,
                        }}
                      >
                        (Locked: Cannot change when stock or variants exist)
                      </span>
                    )}
                </label>
                <CustomDropdown
                  value={form.uom}
                  onChange={(val) => setForm((p) => ({ ...p, uom: val }))}
                  options={uomOptions}
                  placeholder="Select unit..."
                  disabled={
                    editMaterial &&
                    (editMaterialStock > 0 || editMaterial.hasVariants)
                  }
                />
              </div>

              {/* Base Cost + Min Stock */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <label className="form-label">
                    Base Cost{" "}
                    {!form.hasVariants && <span className="required">*</span>}
                    {form.hasVariants && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          color: "var(--gray)",
                          fontWeight: 400,
                          marginLeft: "0.5rem",
                        }}
                      >
                        (Set per combination below)
                      </span>
                    )}
                  </label>
                  <DecimalInput
                    style={
                      form.hasVariants
                        ? { ...inputStyle, opacity: 0.4, cursor: "not-allowed" }
                        : inputStyle
                    }
                    value={form.baseCost}
                    onChange={(e) => {
                      if (!form.hasVariants)
                        setForm((p) => ({ ...p, baseCost: e.target.value }));
                    }}
                    placeholder="0.00"
                    disabled={form.hasVariants}
                  />
                  {!form.hasVariants && errors.baseCost && (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--red)",
                        marginTop: "0.2rem",
                        display: "block",
                      }}
                    >
                      {errors.baseCost}
                    </span>
                  )}
                </div>
                <div>
                  <label className="form-label">Min Stock</label>
                  <IntegerInput
                    style={inputStyle}
                    value={form.minStock}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, minStock: e.target.value }))
                    }
                    min={0}
                    max={999999}
                    placeholder="10"
                  />
                </div>
              </div>

              {/* TODO: Re-enable for future inventory management */}
              {/*
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Procurement Type
                  <Tooltip text={
                    form.procurementType === 'stock'
                      ? 'Stock: Items kept in inventory. Enable backorder to allow sales when stock hits zero.'
                      : 'On-Demand: Items sourced only after a customer order is placed. Always purchasable regardless of stock level.'
                  }>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ cursor: 'help' }}>
                      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </Tooltip>
                </label>
                <CustomDropdown
                  value={form.procurementType}
                  onChange={(val) => setForm(p => ({ ...p, procurementType: val }))}
                  options={[
                    { value: 'stock', label: 'Stock (Make to Stock)' },
                    { value: 'on-demand', label: 'On-Demand (Make to Order)' },
                  ]}
                  placeholder="Select type..."
                />
              </div>
              */}

              <div
                style={{
                  height: "1px",
                  background: "rgba(255,255,255,0.06)",
                  margin: "0.5rem 0",
                }}
              ></div>

              {/* Has Variants */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <input
                  type="checkbox"
                  id="hasVariants"
                  checked={form.hasVariants}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((p) => ({
                      ...p,
                      hasVariants: checked,
                      variantTypes: checked ? p.variantTypes : [],
                      baseCost: checked ? "" : p.baseCost,
                    }));
                  }}
                  style={{
                    width: "16px",
                    height: "16px",
                    accentColor: "#D4A843",
                  }}
                  disabled={editMaterial && editMaterial.hasVariants}
                />
                <label
                  htmlFor="hasVariants"
                  style={{
                    fontSize: "0.85rem",
                    color:
                      editMaterial && editMaterial.hasVariants
                        ? "var(--gray)"
                        : "#E5E2E1",
                    cursor:
                      editMaterial && editMaterial.hasVariants
                        ? "not-allowed"
                        : "pointer",
                    fontWeight: 600,
                  }}
                >
                  This material has variants (e.g., Size, Color)
                  {editMaterial && editMaterial.hasVariants && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "#f59e0b",
                        marginLeft: "0.5rem",
                        fontWeight: 600,
                      }}
                    >
                      (Locked: Variant types exist)
                    </span>
                  )}
                </label>
              </div>

              {/* Variant Types — Old Inventory Style */}
              {form.hasVariants && form.name.trim() && (
                <div>
                  <label
                    className="form-label"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    Variant Types <span className="required">*</span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 400,
                        color: "var(--gray)",
                        marginLeft: "0.25rem",
                      }}
                    >
                      (e.g., Capacity, Color, Size)
                    </span>
                    <button
                      type="button"
                      onClick={() => setVariantTutorialOpen(true)}
                      style={{
                        background: "rgba(212,168,67,0.15)",
                        border: "1px solid rgba(212,168,67,0.3)",
                        borderRadius: "50%",
                        width: "18px",
                        height: "18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#D4A843",
                        fontSize: "0.65rem",
                        fontWeight: 800,
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                      title="How to add variant types"
                    >
                      ?
                    </button>
                  </label>
                  <p className="form-hint" style={{ marginBottom: "1rem" }}>
                    {editMaterial && editMaterial.hasVariants && (
                      <span style={{ color: "#f59e0b", marginLeft: "0.5rem" }}>
                        Cannot uncheck: variant types already exist
                      </span>
                    )}
                  </p>

                  {/* Variant Types List */}
                  {form.variantTypes.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                        marginBottom: "1rem",
                      }}
                    >
                      {form.variantTypes.map((vt, typeIdx) => (
                        <div
                          key={vt.id}
                          style={{
                            background: "rgba(0,0,0,0.15)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            padding: "1rem",
                          }}
                        >
                          {/* Variant Type Header */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "0.75rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "var(--gray)",
                                  background: "rgba(212,168,67,0.15)",
                                  border: "1px solid rgba(212,168,67,0.3)",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "10px",
                                }}
                              >
                                Type {typeIdx + 1}
                              </span>
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: "var(--white)",
                                  fontSize: "0.9rem",
                                }}
                              >
                                {vt.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (hasLockedOptions(typeIdx)) {
                                  setVariantTypeRemoveModal(true);
                                } else {
                                  removeVariantType(typeIdx);
                                }
                              }}
                              style={{
                                background: hasLockedOptions(typeIdx)
                                  ? "rgba(100,100,100,0.15)"
                                  : "#7f1d1d",
                                border: `1px solid ${hasLockedOptions(typeIdx) ? "rgba(100,100,100,0.3)" : "#ef4444"}`,
                                color: hasLockedOptions(typeIdx)
                                  ? "rgba(255,255,255,0.3)"
                                  : "#fca5a5",
                                borderRadius: "6px",
                                padding: "0.25rem 0.6rem",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                cursor: hasLockedOptions(typeIdx)
                                  ? "not-allowed"
                                  : "pointer",
                              }}
                            >
                              Remove Type
                            </button>
                          </div>

                          {/* Variant Options Chips */}
                          {vt.options.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.4rem",
                                marginBottom: "0.75rem",
                              }}
                            >
                              {vt.options.map((opt, optIdx) => {
                                const isLocked =
                                  lockedOptions[`${vt.name}::${opt}`];
                                return (
                                  <span
                                    key={optIdx}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "0.35rem",
                                      padding: "0.25rem 0.6rem",
                                      background: isLocked
                                        ? "rgba(212,168,67,0.08)"
                                        : "rgba(100,100,100,0.12)",
                                      border: `1px solid ${isLocked ? "rgba(212,168,67,0.3)" : "rgba(100,100,100,0.35)"}`,
                                      borderRadius: "20px",
                                      fontSize: "0.8rem",
                                      color: isLocked ? "#D4A843" : "#9ca3af",
                                      fontWeight: 500,
                                    }}
                                  >
                                    {opt}
                                    {isLocked ? (
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#D4A843"
                                        strokeWidth="2.5"
                                        style={{ flexShrink: 0 }}
                                      >
                                        <rect
                                          x="3"
                                          y="11"
                                          width="18"
                                          height="11"
                                          rx="2"
                                          ry="2"
                                        />
                                        <path d="M7 11V7a5 5 0 0110 0v4" />
                                      </svg>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeVariantOption(typeIdx, optIdx)
                                        }
                                        style={{
                                          background: "none",
                                          border: "none",
                                          cursor: "pointer",
                                          color: "#9ca3af",
                                          padding: 0,
                                          lineHeight: 1,
                                          display: "flex",
                                          alignItems: "center",
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
                                          <path d="M18 6L6 18M6 6l12 12" />
                                        </svg>
                                      </button>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* Add Option Input */}
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <input
                              type="text"
                              style={{
                                ...inputStyle,
                                flex: 1,
                                padding: "0.5rem 0.65rem",
                                fontSize: "0.8rem",
                              }}
                              value={variantOptionInputs[typeIdx] || ""}
                              onChange={(e) =>
                                setVariantOptionInputs((prev) => ({
                                  ...prev,
                                  [typeIdx]: e.target.value.slice(0, 40),
                                }))
                              }
                              placeholder={`Add option to ${vt.name}...`}
                              maxLength={40}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addVariantOption(typeIdx);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => addVariantOption(typeIdx)}
                              style={{
                                padding: "0 1rem",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Variant Type Input */}
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <input
                      type="text"
                      style={{ ...inputStyle, flex: 1 }}
                      value={variantTypeInput}
                      onChange={(e) =>
                        setVariantTypeInput(e.target.value.slice(0, 40))
                      }
                      placeholder="Variant Type name (e.g., Capacity, Color, Size)..."
                      maxLength={40}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addVariantType();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={addVariantType}
                      style={{
                        padding: "0 1rem",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      + Add Variant Type
                    </button>
                  </div>
                  {errors.variantTypes && (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--red)",
                        marginTop: "0.2rem",
                        display: "block",
                        marginBottom: "0.75rem",
                      }}
                    >
                      {errors.variantTypes}
                    </span>
                  )}

                  {/* Combination Preview */}
                  {form.variantTypes.length > 0 &&
                    getTotalCombinations() > 0 && (
                      <div
                        style={{
                          background: "rgba(212,168,67,0.08)",
                          border: "1px solid rgba(212,168,67,0.3)",
                          borderRadius: "8px",
                          padding: "0.75rem 1rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <strong style={{ color: "var(--gold)" }}>
                              Total Combinations:
                            </strong>
                            <span
                              style={{
                                color: "var(--white)",
                                marginLeft: "0.5rem",
                                fontWeight: 600,
                              }}
                            >
                              {getTotalCombinations()} unique SKU
                              {getTotalCombinations() !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div
                            style={{ fontSize: "0.7rem", color: "var(--gray)" }}
                          >
                            {form.variantTypes
                              .map((vt) => `${vt.options.length} ${vt.name}`)
                              .join(" × ")}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Per-Combination Cost Table */}
                  {form.hasVariants && (
                    <div style={{ marginTop: "1rem" }}>
                      <label className="form-label">
                        Cost Per Combination <span className="required">*</span>
                      </label>
                      <p
                        className="form-hint"
                        style={{ marginBottom: "0.75rem" }}
                      >
                        Set individual cost for each variant combination.
                        {errors.variantCost && (
                          <span
                            style={{
                              color: "var(--red)",
                              marginLeft: "0.5rem",
                              fontWeight: 600,
                            }}
                          >
                            {errors.variantCost}
                          </span>
                        )}
                      </p>
                      {previewSKUs.length === 0 ? (
                        <div
                          style={{
                            padding: "1rem",
                            background: "rgba(245,158,11,0.08)",
                            border: "1px solid rgba(245,158,11,0.2)",
                            borderRadius: "8px",
                            textAlign: "center",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2"
                            style={{ marginBottom: "0.35rem" }}
                          >
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          <p
                            style={{
                              fontSize: "0.8rem",
                              color: "#f59e0b",
                              margin: 0,
                            }}
                          >
                            Add variant types above to see cost fields for each
                            combination.
                          </p>
                        </div>
                      ) : (
                        <div
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            overflow: "hidden",
                          }}
                        >
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
                                <th
                                  style={{
                                    padding: "0.5rem 0.75rem",
                                    textAlign: "left",
                                    color: "var(--gray)",
                                    fontWeight: 700,
                                    fontSize: "0.6rem",
                                    textTransform: "uppercase",
                                    width: "30px",
                                  }}
                                >
                                  #
                                </th>
                                <th
                                  style={{
                                    padding: "0.5rem 0.75rem",
                                    textAlign: "left",
                                    color: "var(--gray)",
                                    fontWeight: 700,
                                    fontSize: "0.6rem",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Combination
                                </th>
                                <th
                                  style={{
                                    padding: "0.5rem 0.75rem",
                                    textAlign: "right",
                                    color: "var(--gray)",
                                    fontWeight: 700,
                                    fontSize: "0.6rem",
                                    textTransform: "uppercase",
                                    width: "120px",
                                  }}
                                >
                                  Cost (₱)
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {previewSKUs.map((skuInfo, idx) => {
                                const cost =
                                  variantCosts[skuInfo.comboKey] || "";
                                return (
                                  <tr
                                    key={skuInfo.sku || idx}
                                    style={{
                                      borderBottom:
                                        idx < previewSKUs.length - 1
                                          ? "1px solid rgba(255,255,255,0.04)"
                                          : "none",
                                    }}
                                  >
                                    <td
                                      style={{
                                        padding: "0.5rem 0.75rem",
                                        color: "var(--gray)",
                                        fontSize: "0.75rem",
                                      }}
                                    >
                                      {idx + 1}
                                    </td>
                                    <td
                                      style={{
                                        padding: "0.5rem 0.75rem",
                                        color: "#E5E2E1",
                                        fontSize: "0.8rem",
                                      }}
                                    >
                                      <div>{skuInfo.variantName}</div>
                                      <div
                                        style={{
                                          fontSize: "0.65rem",
                                          color: "var(--gray)",
                                          fontFamily: "monospace",
                                          marginTop: "0.1rem",
                                        }}
                                      >
                                        {skuInfo.sku}
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        padding: "0.5rem 0.75rem",
                                        textAlign: "right",
                                      }}
                                    >
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        style={{
                                          ...inputStyle,
                                          padding: "0.35rem 0.5rem",
                                          fontSize: "0.8rem",
                                          textAlign: "right",
                                          width: "100px",
                                        }}
                                        value={cost}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (
                                            val === "" ||
                                            /^\d*\.?\d{0,2}$/.test(val)
                                          ) {
                                            setVariantCosts((prev) => ({
                                              ...prev,
                                              [skuInfo.comboKey]: val,
                                            }));
                                          }
                                        }}
                                        onKeyDown={(e) =>
                                          ["e", "E", "+", " ", "-"].includes(
                                            e.key,
                                          ) && e.preventDefault()
                                        }
                                        placeholder="0.00"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="form-hint">
                    {form.variantTypes.length === 0
                      ? "No variant types — item will be stocked as a single product."
                      : `${form.variantTypes.length} variant type(s) defined. Each combination will be a unique SKU in inventory.`}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="modal-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Material
            </button>
          </div>
        </form>
      </div>

      {/* Variant Type Remove Error Modal */}
      {variantTypeRemoveModal && (
        <div
          className="modal-overlay"
          onClick={() => setVariantTypeRemoveModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "420px" }}
          >
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: "#f59e0b" }}>
                Cannot Remove Variant Type
              </h2>
              <button
                className="modal-close"
                onClick={() => setVariantTypeRemoveModal(false)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ padding: "1.5rem 2rem" }}>
              <p
                style={{
                  color: "#E5E2E1",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                }}
              >
                This variant type has options that are used by active inventory
                items. Remove all options first or archive the linked inventory
                items.
              </p>
            </div>
            <div
              className="modal-actions"
              style={{ justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn-primary"
                onClick={() => setVariantTypeRemoveModal(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant Types Tutorial Modal */}
      {variantTutorialOpen && (
        <div
          className="modal-overlay"
          onClick={() => setVariantTutorialOpen(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "640px", width: "95%" }}
          >
            <div className="modal-header">
              <div>
                <h2 className="modal-title" style={{ fontSize: "1.1rem" }}>
                  How to Add Variant Types
                </h2>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--gray)",
                    marginTop: "0.1rem",
                  }}
                >
                  Learn how to create materials with multiple variants such as
                  Size, Color, Capacity
                </p>
              </div>
              <button
                className="modal-close"
                onClick={() => setVariantTutorialOpen(false)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div
              style={{
                padding: "1.5rem 2rem",
                maxHeight: "65vh",
                overflowY: "auto",
              }}
            >
              {/* Step 1 */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div
                  style={{
                    fontSize: "0.65rem",
                    color: "#D4A843",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  Step 1: Add a Variant Type
                </div>
                <div
                  style={{
                    marginBottom: "0.5rem",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.2)",
                    padding: "1rem",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/tutorials/Tutorial.png"
                    alt="Add Variant Type"
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextElementSibling.style.display = "flex";
                    }}
                  />
                  <div
                    style={{
                      display: "none",
                      padding: "1rem",
                      textAlign: "center",
                      color: "var(--gray)",
                      fontSize: "0.8rem",
                    }}
                  >
                    Type the variant type name and click Add Variant Type
                  </div>
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Type the name of the variant type (e.g., "Size", "Color",
                  "Type") in the input field, then click the gold{" "}
                  <strong style={{ color: "#D4A843" }}>
                    + Add Variant Type
                  </strong>{" "}
                  button.
                </p>
              </div>

              {/* Step 2 */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div
                  style={{
                    fontSize: "0.65rem",
                    color: "#D4A843",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  Step 2: Add Options to the Type
                </div>
                <div
                  style={{
                    marginBottom: "0.5rem",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.2)",
                    padding: "1rem",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/tutorials/Tutorial2.png"
                    alt="Add Options"
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextElementSibling.style.display = "flex";
                    }}
                  />
                  <div
                    style={{
                      display: "none",
                      padding: "1rem",
                      textAlign: "center",
                      color: "var(--gray)",
                      fontSize: "0.8rem",
                    }}
                  >
                    Type each option and click Add
                  </div>
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Type each option value in the input field (e.g., "Small
                  10x12", "Medium 12x14") and click the{" "}
                  <strong style={{ color: "#D4A843" }}>+ Add</strong> button.
                  Each option appears as a removable chip. You can add multiple
                  options to a single type.
                </p>
              </div>

              {/* Step 3 */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div
                  style={{
                    fontSize: "0.65rem",
                    color: "#D4A843",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  Step 3: Add More Types (Optional)
                </div>
                <div
                  style={{
                    marginBottom: "0.5rem",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.2)",
                    padding: "1rem",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/tutorials/Tutorial3.png"
                    alt="Multiple Types"
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextElementSibling.style.display = "flex";
                    }}
                  />
                  <div
                    style={{
                      display: "none",
                      padding: "1rem",
                      textAlign: "center",
                      color: "var(--gray)",
                      fontSize: "0.8rem",
                    }}
                  >
                    Add more variant types for combinations
                  </div>
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Repeat Step 1 to add another variant type. In the example
                  shown, there are two types:{" "}
                  <strong style={{ color: "#E5E2E1" }}>Type</strong> (Plain, W
                  Zipper and Pocket) and{" "}
                  <strong style={{ color: "#E5E2E1" }}>Size</strong> (Small
                  10x12, Medium 12x14, Large 14x16). Multiple types create a
                  cross-combination of all options.
                </p>
              </div>

              {/* Step 4 */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div
                  style={{
                    fontSize: "0.65rem",
                    color: "#D4A843",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: "0.5rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  Step 4: Result - Each Combination Gets a Unique SKU
                </div>
                <div
                  style={{
                    marginBottom: "0.5rem",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.2)",
                    padding: "1rem",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/tutorials/Tutorial4.png"
                    alt="Final Result"
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextElementSibling.style.display = "flex";
                    }}
                  />
                  <div
                    style={{
                      display: "none",
                      padding: "1rem",
                      textAlign: "center",
                      color: "var(--gray)",
                      fontSize: "0.8rem",
                    }}
                  >
                    Each variant combination gets its own SKU
                  </div>
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  After saving, the parent material expands to show all variant
                  children. Each combination gets its own unique SKU. In the
                  example, 2 types x 3 sizes ={" "}
                  <strong style={{ color: "#D4A843" }}>6 SKUs</strong>:
                </p>
              </div>

              {/* SKU Example */}
              <div
                style={{
                  marginBottom: "1.25rem",
                  padding: "0.75rem 1rem",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "8px",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "var(--gray)",
                  lineHeight: 1.8,
                }}
              >
                CT-TO-PLA-SMA-0003
                <br />
                CT-TO-PLA-MED-0002
                <br />
                CT-TO-PLA-LAR-0001
                <br />
                CT-TO-WZI-SMA-0003
                <br />
                CT-TO-WZI-MED-0002
                <br />
                CT-TO-WZI-LAR-0001
              </div>

              {/* Cost per combination note */}
              <div
                style={{
                  marginBottom: "1.25rem",
                  padding: "0.75rem 1rem",
                  background: "rgba(212,168,67,0.06)",
                  border: "1px solid rgba(212,168,67,0.2)",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#D4A843",
                    fontWeight: 700,
                    marginBottom: "0.35rem",
                  }}
                >
                  Cost Per Combination
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Each variant combination has its own cost field. After adding
                  types and options, a table of all combinations appears below.
                  Click each row to set its specific unit cost.
                </p>
              </div>

              {/* Important Note */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#f59e0b",
                    fontWeight: 700,
                    marginBottom: "0.25rem",
                  }}
                >
                  Important
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Once a variant has stock, its type and options become locked.
                  You cannot rename or remove them without first clearing the
                  stock from those items.
                </p>
              </div>
            </div>
            <div
              className="modal-actions"
              style={{ justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn-primary"
                onClick={() => setVariantTutorialOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function VendorFormModal({ vendor, allVendors, materials, units, onClose, onSave }) {
  const [form, setForm] = useState({
    name: "",
    contact: [],
    itemsSupplied: [],
    email: [],
    phone: [],
    address: "",
  });
  const [itemNameInput, setItemNameInput] = useState("");
  const [itemUomInput, setItemUomInput] = useState("pcs");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errors, setErrors] = useState({});
  const [newContact, setNewContact] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Check if this vendor has linked materials
  const linkedMaterials = useMemo(() => {
    if (!vendor) return [];
    return (materials || []).filter((m) => m.preferredVendorId === vendor.id);
  }, [vendor, materials]);

  const hasLinkedMaterials = linkedMaterials.length > 0;

  // Get items that are actually used by linked materials (from their categories)
  const usedItems = useMemo(() => {
    if (!hasLinkedMaterials) return [];
    const items = new Set();
    linkedMaterials.forEach((m) => {
      if (m.category) items.add(m.category);
    });
    return [...items];
  }, [linkedMaterials, hasLinkedMaterials]);

  // Collect all unique items from all vendors — normalize to {name, uom} objects
  const allKnownItems = useMemo(() => {
    const items = [];
    const seen = new Set();
    (allVendors || []).forEach((v) => {
      (v.itemsSupplied || []).forEach((item) => {
        const name = typeof item === "string" ? item : item.name;
        if (!seen.has(name)) {
          seen.add(name);
          items.push(name);
        }
      });
    });
    return [...items].sort();
  }, [allVendors]);

  // Filter suggestions based on current input
  const suggestions = useMemo(() => {
    if (!itemNameInput.trim()) return allKnownItems;
    return allKnownItems.filter((i) =>
      i.toLowerCase().includes(itemNameInput.toLowerCase()),
    );
  }, [itemNameInput, allKnownItems]);

  // Normalize itemsSupplied to {name, uom} objects
  const normalizeItems = (items) => {
    return (items || []).map((item) => {
      if (typeof item === "string") return { name: item, uom: "pcs" };
      return item;
    });
  };

  // Normalize single values to arrays for backwards compatibility
  const normalizeToArray = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val.trim()) return [val.trim()];
    return [];
  };

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name || "",
        contact: normalizeToArray(vendor.contacts || vendor.contact),
        itemsSupplied: normalizeItems(vendor.itemsSupplied),
        email: normalizeToArray(vendor.emails || vendor.email),
        phone: normalizeToArray(vendor.phones || vendor.phone),
        address: vendor.address || "",
      });
    }
  }, [vendor]);

  const addItem = () => {
    const trimmed = itemNameInput.trim();
    if (!trimmed) return;
    if (
      form.itemsSupplied.some(
        (i) => i.name.toLowerCase() === trimmed.toLowerCase(),
      )
    )
      return;
    setForm((p) => ({
      ...p,
      itemsSupplied: [...p.itemsSupplied, { name: trimmed, uom: itemUomInput }],
    }));
    setItemNameInput("");
    setItemUomInput("pcs");
    setShowSuggestions(false);
  };

  const removeItem = (idx) => {
    const itemToRemove = form.itemsSupplied[idx];
    if (usedItems.includes(itemToRemove.name)) return;
    setForm((p) => ({
      ...p,
      itemsSupplied: p.itemsSupplied.filter((_, i) => i !== idx),
    }));
  };

  const handleItemKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
    if (
      e.key === "Backspace" &&
      itemNameInput === "" &&
      form.itemsSupplied.length > 0
    ) {
      const lastItem = form.itemsSupplied[form.itemsSupplied.length - 1];
      if (!usedItems.includes(lastItem.name)) {
        removeItem(form.itemsSupplied.length - 1);
      }
    }
  };

  const handlePhoneInputChange = (val) => {
    let cleaned = val.replace(/[^0-9+]/g, "");
    if (cleaned.startsWith("+63")) {
      cleaned =
        "+63" +
        cleaned
          .slice(3)
          .replace(/[^0-9]/g, "")
          .slice(0, 10);
    } else if (cleaned.startsWith("0")) {
      cleaned =
        "0" +
        cleaned
          .slice(1)
          .replace(/[^0-9]/g, "")
          .slice(0, 10);
    } else if (cleaned.startsWith("63")) {
      cleaned =
        "+63" +
        cleaned
          .slice(2)
          .replace(/[^0-9]/g, "")
          .slice(0, 10);
    } else {
      cleaned = cleaned.replace(/[^0-9]/g, "").slice(0, 11);
      if (cleaned.length > 0 && !cleaned.startsWith("0"))
        cleaned = "0" + cleaned;
    }
    setNewPhone(cleaned);
  };

  const addContact = () => {
    const trimmed = newContact.trim();
    if (!trimmed) return;
    if (form.contact.includes(trimmed)) return;
    setForm((p) => ({ ...p, contact: [...p.contact, trimmed] }));
    setNewContact("");
  };

  const removeContact = (idx) => {
    setForm((p) => ({ ...p, contact: p.contact.filter((_, i) => i !== idx) }));
  };

  const addEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    if (form.email.includes(trimmed)) return;
    setForm((p) => ({ ...p, email: [...p.email, trimmed] }));
    setNewEmail("");
  };

  const removeEmail = (idx) => {
    setForm((p) => ({ ...p, email: p.email.filter((_, i) => i !== idx) }));
  };

  const addPhone = () => {
    const trimmed = newPhone.trim();
    if (!trimmed) return;
    if (form.phone.includes(trimmed)) return;
    setForm((p) => ({ ...p, phone: [...p.phone, trimmed] }));
    setNewPhone("");
  };

  const removePhone = (idx) => {
    setForm((p) => ({ ...p, phone: p.phone.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = "Company name is required";
    if (form.itemsSupplied.length === 0)
      newErrors.items = "Add at least one item";
    if (form.contact.length === 0)
      newErrors.contact = "Add at least one contact person";
    if (form.email.length === 0) newErrors.email = "Add at least one email";
    if (form.phone.length === 0)
      newErrors.phone = "Add at least one phone number";
    if (!form.address.trim()) newErrors.address = "Address is required";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    onSave({ ...form });
  };
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
  const lockedInputStyle = {
    ...inputStyle,
    opacity: 0.5,
    cursor: "not-allowed",
    background: "rgba(255,255,255,0.03)",
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "560px" }}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            {vendor ? "Edit Vendor" : "Add New Vendor"}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div
            className="modal-body"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div>
              <label className="form-label">
                Company Name <span className="required">*</span>
                {hasLinkedMaterials && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      color: "#f59e0b",
                      marginLeft: "0.5rem",
                      fontWeight: 600,
                    }}
                  >
                    (Locked: {linkedMaterials.length} material
                    {linkedMaterials.length > 1 ? "s" : ""} linked)
                  </span>
                )}
              </label>
              <input
                type="text"
                style={
                  hasLinkedMaterials
                    ? lockedInputStyle
                    : {
                        ...inputStyle,
                        borderColor: errors.name ? "#ef4444" : undefined,
                      }
                }
                value={form.name}
                onChange={(e) => {
                  setForm((p) => ({
                    ...p,
                    name: e.target.value.slice(0, 100),
                  }));
                  if (errors.name) setErrors((er) => ({ ...er, name: "" }));
                }}
                placeholder="e.g., Global Garments Inc."
                required
                maxLength={100}
                readOnly={hasLinkedMaterials}
              />
              {errors.name && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "#ef4444",
                    marginTop: "0.2rem",
                    display: "block",
                  }}
                >
                  {errors.name}
                </span>
              )}
            </div>

            {/* Items Supplied — each item has name + required unit */}
            <div>
              <label className="form-label">
                Items Supplied <span className="required">*</span>
                {hasLinkedMaterials && (
                  <span
                    style={{
                      fontSize: "0.6rem",
                      color: "var(--gray)",
                      marginLeft: "0.5rem",
                      fontWeight: 400,
                    }}
                  >
                    (Locked items cannot be removed)
                  </span>
                )}
              </label>
              {errors.items && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "#ef4444",
                    marginBottom: "0.3rem",
                    display: "block",
                  }}
                >
                  {errors.items}
                </span>
              )}
              {/* Existing items as cards */}
              {form.itemsSupplied.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  {form.itemsSupplied.map((item, i) => {
                    const isUsed = usedItems.includes(item.name);
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          padding: "0.5rem 0.75rem",
                          background: isUsed
                            ? "rgba(212,168,67,0.08)"
                            : "rgba(255,255,255,0.04)",
                          border: `1px solid ${isUsed ? "rgba(212,168,67,0.3)" : "rgba(255,255,255,0.1)"}`,
                          borderRadius: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.82rem",
                              color: "#E5E2E1",
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: "var(--gray)",
                              textTransform: "uppercase",
                            }}
                          >
                            {item.uom || "pcs"}
                          </span>
                        </div>
                        {!isUsed ? (
                          <button
                            type="button"
                            onClick={() => removeItem(i)}
                            style={{
                              background: "rgba(239,68,68,0.1)",
                              border: "1px solid rgba(239,68,68,0.2)",
                              borderRadius: "6px",
                              padding: "0.2rem 0.4rem",
                              cursor: "pointer",
                              color: "#f87171",
                              display: "flex",
                              alignItems: "center",
                              lineHeight: 1,
                              fontSize: "0.7rem",
                            }}
                          >
                            ✕
                          </button>
                        ) : (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#D4A843"
                            strokeWidth="2.5"
                            style={{ flexShrink: 0 }}
                          >
                            <rect
                              x="3"
                              y="11"
                              width="18"
                              height="11"
                              rx="2"
                              ry="2"
                            />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Add new item row */}
              <div
                style={{ display: "flex", gap: "0.5rem", position: "relative" }}
              >
                <input
                  type="text"
                  style={{ ...inputStyle, flex: 2 }}
                  value={itemNameInput}
                  onChange={(e) => {
                    setItemNameInput(e.target.value.slice(0, 60));
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 150)
                  }
                  onKeyDown={handleItemKeyDown}
                  placeholder="Item name..."
                  maxLength={60}
                />
                <select
                  style={{ ...inputStyle, flex: 1, minWidth: "100px" }}
                  value={itemUomInput}
                  onChange={(e) => setItemUomInput(e.target.value)}
                >
                  {(units && units.length > 0 ? units : [{ code: "pcs", name: "Pieces" }]).map((u) => (
                    <option key={u.code} value={u.code}>{u.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={addItem}
                  style={{
                    padding: "0 1rem",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  + Add
                </button>
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      zIndex: 100,
                      background: "#1a1a1a",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      maxHeight: "160px",
                      overflowY: "auto",
                      marginTop: "0.25rem",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    {suggestions
                      .filter(
                        (s) =>
                          !form.itemsSupplied.some(
                            (i) => i.name.toLowerCase() === s.toLowerCase(),
                          ),
                      )
                      .map((name, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => setItemNameInput(name)}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "0.5rem 0.75rem",
                            background: "transparent",
                            border: "none",
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                            color: "#E5E2E1",
                            fontSize: "0.8rem",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(212,168,67,0.1)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          {name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Contact Persons */}
            <div>
              <label className="form-label">
                Contact Person <span className="required">*</span>
              </label>
              {form.contact.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  {form.contact.map((c, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.25rem 0.5rem",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                      }}
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => removeContact(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#f87171",
                          cursor: "pointer",
                          padding: 0,
                          display: "flex",
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
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  style={inputStyle}
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value.slice(0, 80))}
                  placeholder="Juan Dela Cruz"
                  maxLength={80}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addContact();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addContact}
                  style={{
                    background: "rgba(212,168,67,0.15)",
                    border: "1px solid rgba(212,168,67,0.3)",
                    borderRadius: "6px",
                    padding: "0.5rem 0.75rem",
                    color: "#D4A843",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Add
                </button>
              </div>
              {errors.contact && (
                <p
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--red)",
                    marginTop: "0.25rem",
                  }}
                >
                  {errors.contact}
                </p>
              )}
            </div>

            {/* Emails */}
            <div>
              <label className="form-label">
                Email <span className="required">*</span>
              </label>
              {form.email.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  {form.email.map((em, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.25rem 0.5rem",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                      }}
                    >
                      {em}
                      <button
                        type="button"
                        onClick={() => removeEmail(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#f87171",
                          cursor: "pointer",
                          padding: 0,
                          display: "flex",
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
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="email"
                  style={inputStyle}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value.slice(0, 100))}
                  placeholder="vendor@email.com"
                  maxLength={100}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addEmail}
                  style={{
                    background: "rgba(212,168,67,0.15)",
                    border: "1px solid rgba(212,168,67,0.3)",
                    borderRadius: "6px",
                    padding: "0.5rem 0.75rem",
                    color: "#D4A843",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Add
                </button>
              </div>
              {errors.email && (
                <p
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--red)",
                    marginTop: "0.25rem",
                  }}
                >
                  {errors.email}
                </p>
              )}
            </div>

            {/* Phone Numbers */}
            <div>
              <label className="form-label">
                Phone <span className="required">*</span>
              </label>
              {form.phone.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  {form.phone.map((ph, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.25rem 0.5rem",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                      }}
                    >
                      {ph}
                      <button
                        type="button"
                        onClick={() => removePhone(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#f87171",
                          cursor: "pointer",
                          padding: 0,
                          display: "flex",
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
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  style={inputStyle}
                  value={newPhone}
                  onChange={(e) => handlePhoneInputChange(e.target.value)}
                  placeholder="09xx-xxx-xxxx"
                  maxLength={15}
                  inputMode="tel"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPhone();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addPhone}
                  style={{
                    background: "rgba(212,168,67,0.15)",
                    border: "1px solid rgba(212,168,67,0.3)",
                    borderRadius: "6px",
                    padding: "0.5rem 0.75rem",
                    color: "#D4A843",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Add
                </button>
              </div>
              {errors.phone && (
                <p
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--red)",
                    marginTop: "0.25rem",
                  }}
                >
                  {errors.phone}
                </p>
              )}
            </div>

            <div>
              <label className="form-label">
                Address <span className="required">*</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", minHeight: "60px" }}
                value={form.address}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    address: e.target.value.slice(0, 200),
                  }))
                }
                placeholder="Full address"
                maxLength={200}
              />
              {errors.address && (
                <p
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--red)",
                    marginTop: "0.25rem",
                  }}
                >
                  {errors.address}
                </p>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {vendor ? "Save Changes" : "Save Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BOM TAB
// ══════════════════════════════════════════════════════════════════════════════
function BOMTab({ materials, boms, token, units, refreshBoms }) {
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editBOM, setEditBOM] = useState(null);
  const [addVariantToGroup, setAddVariantToGroup] = useState(null);
  const [expandedGroupsState, setExpandedGroupsState] = useState(new Set());
  const [bomPage, setBomPage] = useState(1);
  const [bomPerPage, setBomPerPage] = useState(10);
  const [infoModal, setInfoModal] = useState({
    isOpen: false,
    title: "",
    message: "",
  });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  // Helper function to generate abbreviation from material name
  const abbreviateMaterial = (name) => {
    if (!name) return "";
    const parts = name.split(/[-\s]+/);

    let abbr = "";
    for (const part of parts) {
      if (part.length === 0) continue;
      if (
        ["a", "an", "the", "of", "for", "with", "in", "on"].includes(
          part.toLowerCase(),
        )
      )
        continue;
      abbr += part[0].toUpperCase();
      if (abbr.length >= 4) break;
    }

    const numbers = name.match(/\d+/g);
    if (numbers && abbr.length > 0) {
      abbr += numbers[0].substring(0, 3);
    }

    return abbr || name.substring(0, 4).toUpperCase();
  };

  // Helper function to generate SKU on-the-fly from BOM components
  const generateBomSku = (bom) => {
    if (!bom || !bom.components || bom.components.length === 0)
      return "BOM-NEW";

    const materialNames = bom.components
      .map((c) => {
        const mid = c.materialId ?? c.inventoryId;
        const mat = materials.find(
          (m) => String(m.id ?? m._id) === String(mid),
        );
        return mat?.name || "";
      })
      .filter((name) => name);

    if (materialNames.length === 0) return "BOM-NEW";

    const abbreviations = materialNames.map((name) => abbreviateMaterial(name));
    const combined = abbreviations.join("-");

    return `BOM-${combined}`;
  };

  useEffect(() => { setBomPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return boms.filter(
      (b) =>
        !q ||
        b.productName.toLowerCase().includes(q) ||
        generateBomSku(b).toLowerCase().includes(q) ||
        (b.variantGroup || "").toLowerCase().includes(q),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boms, search, materials]);

  const handleDelete = async (id) => {
    const bom = boms.find((b) => (b.id ?? b._id) === id);
    const groupName = (bom?.productGroupName || bom?.productName || "").trim().toLowerCase();

    if (groupName && token) {
      try {
        const prods = await fetchProducts(token);
        const prodList = Array.isArray(prods) ? prods : (prods?.data ?? []);
        const linked = prodList.find((p) =>
          (p.bomGroupName || p.name || "").trim().toLowerCase() === groupName
        );
        if (linked) {
          setInfoModal({
            isOpen: true,
            title: "Cannot Delete BOM",
            message: `This BOM is linked to the product "${linked.subCategoryName || linked.name || "a product"}". Remove or unlink the product first.`,
          });
          return;
        }
      } catch { /* skip guard if fetch fails */ }
    }

    setConfirmModal({
      isOpen: true,
      title: "Delete BOM",
      message: "Are you sure you want to delete this BOM? This action cannot be undone.",
      onConfirm: async () => {
        if (!token) {
          setInfoModal({ isOpen: true, title: "Sign in required", message: "Sign in as admin to delete BOMs." });
          setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: null });
          return;
        }
        try {
          await deleteBOM(id, token);
          await refreshBoms();
        } catch (e) {
          setInfoModal({ isOpen: true, title: "Delete failed", message: e?.message || "Could not delete BOM." });
        }
        setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: null });
      },
    });
  };

  const handleSave = async (bom) => {
    if (!token) {
      setInfoModal({ isOpen: true, title: "Sign in required", message: "Sign in as admin to save BOMs." });
      return;
    }
    try {
      const payload = bomToApiPayload(bom, materials);
      if (editBOM) {
        await updateBOM(editBOM.id ?? editBOM._id, payload, token);
      } else {
        await createBOM(payload, token);
      }
      await refreshBoms();
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  };

  const EditIcon = () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
  const TrashIcon = () => (
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
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="inventory-toolbar" style={{ marginBottom: "1rem" }}>
        <div className="search-wrapper" style={{ maxWidth: "300px" }}>
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
            placeholder="Search BOMs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch("")}>
              x
            </button>
          )}
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setEditBOM(null);
            setShowAddModal(true);
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
          Create Product
        </button>
      </div>

      {/* ── Grouped BOM table ── */}
      {(() => {
        const groups = {};
        filtered.forEach((b) => {
          const grp = b.productGroupName || b.productName || "Uncategorized";
          if (!groups[grp]) groups[grp] = { category: b.category || "", boms: [] };
          groups[grp].boms.push(b);
        });
        const groupEntries = Object.entries(groups);
        if (groupEntries.length === 0) return (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--gray)", fontSize: "0.875rem" }}>
            No products yet. Click <strong style={{ color: "#D4A843" }}>Create Product</strong> to get started.
          </div>
        );
        const totalPages = Math.ceil(groupEntries.length / bomPerPage);
        const pagedEntries = groupEntries.slice((bomPage - 1) * bomPerPage, bomPage * bomPerPage);
        return (
          <>
            <div style={{ background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 160px 120px 165px", gap: 0, background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border)", padding: "0.75rem 1rem" }}>
                {["", "Product / Variant", "BOM Cost", "Producible", "Actions"].map((h, i) => (
                  <span key={i} style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(229,226,225,0.4)", textAlign: i >= 2 ? "right" : "left", paddingRight: i === 4 ? "0.25rem" : 0 }}>{h}</span>
                ))}
              </div>
              {pagedEntries.map(([groupName, { category, boms: groupBoms }], gi) => {
                const isExpanded = expandedGroupsState.has(groupName);
                const isMulti = groupBoms.length > 1;
                const costs = groupBoms.map((b) => b.totalCost || 0);
                const minCost = Math.min(...costs);
                const maxCost = Math.max(...costs);
                const getBatchQty = (inv) => {
                  if (!inv) return 0;
                  if (inv.batches && inv.batches.length) {
                    return inv.batches.reduce((s, b) => s + Math.max(0, b.remainingQty != null ? b.remainingQty : (b.goodQty ?? b.qtyGood ?? 0)), 0);
                  }
                  return inv.stockQty || 0;
                };
                const maxProd = groupBoms.reduce((mn, b) => {
                  let perBom = Infinity;
                  (b.components || []).forEach((c) => {
                    const inv = materials.find((m) => String(m.id) === String(c.inventoryId ?? c.materialId));
                    const can = Math.floor(getBatchQty(inv) / (c.qty || 1));
                    if (can < perBom) perBom = can;
                  });
                  const v = perBom === Infinity ? 0 : perBom;
                  return mn === null ? v : Math.min(mn, v);
                }, null) ?? 0;
                return (
                  <div key={groupName} style={{ borderBottom: gi < pagedEntries.length - 1 ? "1px solid var(--border)" : "none" }}>
                    {/* Group row */}
                    <div
                      style={{ display: "grid", gridTemplateColumns: "40px 1fr 160px 120px 165px", gap: 0, padding: "0.875rem 1rem", alignItems: "center", cursor: isMulti ? "pointer" : "default", background: "transparent" }}
                      onClick={() => isMulti && setExpandedGroupsState((p) => { const n = new Set(p); n.has(groupName) ? n.delete(groupName) : n.add(groupName); return n; })}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isMulti && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: isExpanded ? "#D4A843" : "var(--gray)", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div>
                          <div style={{ fontWeight: 700, color: "#E5E2E1", fontSize: "0.875rem" }}>{groupName}</div>
                          {!isMulti && groupBoms[0]?.productName && groupBoms[0].productName !== groupName && (
                            <div style={{ fontSize: "0.65rem", color: "var(--gray)", marginTop: "0.2rem" }}>{groupBoms[0].productName}</div>
                          )}
                        </div>
                        {isMulti && (
                          <span style={{ padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.6rem", fontWeight: 700, background: "rgba(212,168,67,0.15)", color: "#D4A843", flexShrink: 0 }}>Has Variants</span>
                        )}
                      </div>
                      <div style={{ fontWeight: 700, color: "#D4A843", fontSize: "0.875rem", fontFamily: "monospace", textAlign: "right" }}>
                        {isMulti && minCost !== maxCost
                          ? `₱${minCost.toFixed(2)} – ₱${maxCost.toFixed(2)}`
                          : `₱${(groupBoms[0]?.totalCost || 0).toFixed(2)}`}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: maxProd === 0 ? "#ef4444" : "#22c55e" }}>{maxProd} units</span>
                      </div>
                      <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                        {!isMulti && (
                          <>
                            <button type="button" title="Add variant" onClick={(e) => { e.stopPropagation(); setEditBOM(null); setAddVariantToGroup(groupName); setShowAddModal(true); }}
                              style={{ background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.2)", borderRadius: "6px", padding: "0.3rem 0.6rem", color: "#D4A843", cursor: "pointer", fontSize: "0.65rem", fontWeight: 700 }}>
                              + Variant
                            </button>
                            <button type="button" title="Edit" onClick={(e) => { e.stopPropagation(); setEditBOM(groupBoms[0]); setShowAddModal(true); }}
                              style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.5rem", color: "var(--gray)", cursor: "pointer" }}>
                              <EditIcon />
                            </button>
                            <button type="button" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(groupBoms[0].id ?? groupBoms[0]._id); }}
                              style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.5rem", color: "var(--gray)", cursor: "pointer" }}>
                              <TrashIcon />
                            </button>
                          </>
                        )}
                        {isMulti && (
                          <button type="button" title="Add variant" onClick={(e) => { e.stopPropagation(); setEditBOM(null); setAddVariantToGroup(groupName); setShowAddModal(true); }}
                            style={{ background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.2)", borderRadius: "6px", padding: "0.3rem 0.6rem", color: "#D4A843", cursor: "pointer", fontSize: "0.65rem", fontWeight: 700 }}>
                            + Variant
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Variant sub-rows */}
                    {isMulti && isExpanded && (
                      <div>
                        {groupBoms.map((b, bi) => {
                          const compRanges = (b.components || []).map((c) => {
                            const mat = materials.find((m) => String(m.id) === String(c.inventoryId ?? c.materialId));
                            const qty = c.qty || 1;
                            const bc = (mat?.batches || []).filter((bt) => (bt.remainingQty || 0) > 0).map((bt) => bt.unitCost || 0).filter((v) => v > 0);
                            const fallback = mat?.baseCost || mat?.averageCost || 0;
                            const vals = bc.length > 0 ? bc : [fallback];
                            return { min: Math.min(...vals) * qty, max: Math.max(...vals) * qty };
                          });
                          const minCost = compRanges.reduce((s, r) => s + r.min, 0) || b.totalCost || 0;
                          const maxCost = compRanges.reduce((s, r) => s + r.max, 0) || b.totalCost || 0;
                          const mp = (() => { let mn = Infinity; (b.components || []).forEach((c) => { const inv = materials.find((m) => String(m.id) === String(c.inventoryId ?? c.materialId)); const avail = inv?.batches?.length ? inv.batches.reduce((s, bt) => s + Math.max(0, bt.remainingQty != null ? bt.remainingQty : (bt.goodQty ?? bt.qtyGood ?? 0)), 0) : (inv?.stockQty || 0); const can = Math.floor(avail / (c.qty || 1)); if (can < mn) mn = can; }); return mn === Infinity ? 0 : mn; })();
                          return (
                            <div key={b.id ?? bi}
                              style={{ display: "grid", gridTemplateColumns: "40px 1fr 160px 120px 165px", gap: 0, padding: "0.875rem 1rem", alignItems: "center", borderTop: "1px solid var(--border)", background: "transparent" }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(229,226,225,0.25)", fontSize: "1rem", fontWeight: 300 }}>—</div>
                              <div>
                                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#E5E2E1" }}>{b.productName || groupName}</div>
                                <div style={{ fontSize: "0.65rem", color: "var(--gray)", marginTop: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {(b.components || []).map((c) => {
                                    const invId = c.inventoryId ?? c.materialId;
                                    const mat = materials.find((m) => String(m.id) === String(invId));
                                    return `${mat?.name || "?"}${(c.qty || 1) > 1 ? ` ×${c.qty}` : ""}`;
                                  }).join(" + ")}
                                </div>
                              </div>
                              <div style={{ fontWeight: 700, color: "#D4A843", fontSize: "0.875rem", fontFamily: "monospace", textAlign: "right" }}>
                                {minCost !== maxCost ? `₱${minCost.toFixed(2)} – ₱${maxCost.toFixed(2)}` : `₱${minCost.toFixed(2)}`}
                              </div>
                              <div style={{ fontSize: "0.78rem", color: mp === 0 ? "#ef4444" : "#22c55e", fontWeight: 600, textAlign: "right" }}>{mp} units</div>
                              <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                                <button type="button" title="Edit" onClick={() => { setEditBOM(b); setShowAddModal(true); }}
                                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.5rem", color: "var(--gray)", cursor: "pointer" }}>
                                  <EditIcon />
                                </button>
                                <button type="button" title="Delete" onClick={() => handleDelete(b.id ?? b._id)}
                                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.5rem", color: "var(--gray)", cursor: "pointer" }}>
                                  <TrashIcon />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            {/* Pagination inside table */}
            <div style={{ borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 1rem", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--gray)" }}>Rows per page:</span>
                <select
                  value={bomPerPage}
                  onChange={(e) => { setBomPerPage(Number(e.target.value)); setBomPage(1); }}
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", borderRadius: "6px", color: "#E5E2E1", padding: "0.2rem 0.5rem", fontSize: "0.72rem", outline: "none" }}
                >
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.72rem", color: "var(--gray)" }}>
                <span>{(bomPage - 1) * bomPerPage + 1}–{Math.min(bomPage * bomPerPage, groupEntries.length)} of {groupEntries.length}</span>
                <button
                  onClick={() => setBomPage((p) => Math.max(1, p - 1))}
                  disabled={bomPage === 1}
                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: "4px", color: bomPage === 1 ? "rgba(229,226,225,0.2)" : "#E5E2E1", cursor: bomPage === 1 ? "not-allowed" : "pointer", padding: "0.15rem 0.5rem", lineHeight: 1 }}>
                  ‹
                </button>
                <button
                  onClick={() => setBomPage((p) => Math.min(totalPages, p + 1))}
                  disabled={bomPage === totalPages}
                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: "4px", color: bomPage === totalPages ? "rgba(229,226,225,0.2)" : "#E5E2E1", cursor: bomPage === totalPages ? "not-allowed" : "pointer", padding: "0.15rem 0.5rem", lineHeight: 1 }}>
                  ›
                </button>
              </div>
            </div>
          </div>
        </>
        );
      })()}

      {showAddModal && (
        <BOMFormModal
          bom={editBOM}
          addToGroup={addVariantToGroup}
          existingGroupBoms={addVariantToGroup ? boms.filter((b) => (b.productGroupName || b.productName) === addVariantToGroup) : []}
          materials={materials}
          units={units}
          categories={[...new Set((boms || []).map((b) => b.category).filter(Boolean))]}
          productGroups={[...new Set((boms || []).map((b) => b.productGroupName || b.productName).filter(Boolean))]}
          onClose={() => { setShowAddModal(false); setEditBOM(null); setAddVariantToGroup(null); }}
          onSave={handleSave}
        />
      )}
      <InfoModal
        isOpen={infoModal.isOpen}
        onClose={() =>
          setInfoModal({ isOpen: false, title: "", message: "" })
        }
        title={infoModal.title}
        message={infoModal.message}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() =>
          setConfirmModal({
            isOpen: false,
            title: "",
            message: "",
            onConfirm: null,
          })
        }
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Delete"
        confirmClass="btn-danger"
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// UNITS OF MEASUREMENT TAB
// ══════════════════════════════════════════════════════════════════════════════
function UnitMasterTab({
  units: initialUnits,
  onUnitsChange,
  vendors,
  materials,
  token,
  refreshUnits,
}) {
  const [units, setUnits] = useState(initialUnits || []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [search, setSearch] = useState("");
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, unit: null });
  const [infoModal, setInfoModal] = useState({
    isOpen: false,
    title: "",
    message: "",
  });

  useEffect(() => {
    setUnits(initialUnits || []);
  }, [initialUnits]);

  const handleSaveUnit = async (unitData) => {
    if (!token) {
      setInfoModal({
        isOpen: true,
        title: "Sign in required",
        message: "Sign in as admin to manage units.",
      });
      return;
    }
    try {
      await saveUnit(
        {
          name: unitData.name,
          abbreviation: unitData.code || "",
          id: editingUnit ? String(editingUnit.id) : undefined,
        },
        token,
      );
      await refreshUnits();
      setShowAddModal(false);
      setEditingUnit(null);
    } catch (e) {
      setInfoModal({
        isOpen: true,
        title: "Could not save unit",
        message: e?.message || "Save failed.",
      });
    }
  };

  const handleEditUnit = (unit) => {
    setEditingUnit(unit);
    setShowAddModal(true);
  };

  const handleDeleteClick = (unit) => {
    setDeleteModal({ isOpen: true, unit });
  };

  const handleConfirmDelete = async () => {
    const unit = deleteModal.unit;
    if (!unit) return;

    const usage = checkUnitUsage(unit.code, vendors, materials);

    if (usage.totalUsage === 0) {
      if (!token) return;
      try {
        await saveUnit(
          {
            id: String(unit.id),
            name: unit.name,
            abbreviation: unit.code || "",
            isActive: false,
          },
          token,
        );
        await refreshUnits();
        setDeleteModal({ isOpen: false, unit: null });
      } catch (e) {
        setInfoModal({
          isOpen: true,
          title: "Could not remove unit",
          message: e?.message || "Remove failed.",
        });
      }
    } else {
      setInfoModal({
        isOpen: true,
        title: "Cannot Delete Unit",
        message: `The unit "${unit.name}" (${unit.code}) is currently used by ${usage.totalUsage} item(s). Please update those items first before deleting this unit.`,
      });
      setDeleteModal({ isOpen: false, unit: null });
    }
  };

  const filteredUnits = useMemo(() => {
    let result = [...units];
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(searchLower) ||
          u.code.toLowerCase().includes(searchLower),
      );
    }
    return result;
  }, [units, search]);

  return (
    <div>
      <div className="inventory-toolbar" style={{ marginBottom: "1rem" }}>
        <div className="search-wrapper" style={{ maxWidth: "300px" }}>
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
            placeholder="Search units..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch("")}>
              x
            </button>
          )}
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setEditingUnit(null);
            setShowAddModal(true);
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
          Add Unit
        </button>
      </div>

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
              <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gray)", width: "50px" }}>#</th>
              <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gray)" }}>Code</th>
              <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gray)" }}>Name</th>
              <th style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--gray)", width: "120px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUnits.length === 0 ? (
              <tr>
                <td
                  colSpan="4"
                  style={{
                    textAlign: "center",
                    padding: "3rem",
                    color: "var(--gray)",
                  }}
                >
                  {search ? "No units match your search." : "No units found."}
                </td>
              </tr>
            ) : (
              filteredUnits.map((unit, index) => (
                <tr
                  key={unit.id}
                  style={{
                    borderBottom: index < filteredUnits.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <td style={{ padding: "0.75rem 1rem", color: "var(--gray)", fontSize: "0.8rem" }}>
                    {index + 1}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <code
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.82rem",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {unit.code}
                    </code>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{unit.name}</td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => handleEditUnit(unit)}
                        title="Edit unit"
                        style={{
                          padding: "0.375rem",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "6px",
                          color: "var(--gray)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
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
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteClick(unit)}
                        title="Delete unit"
                        style={{
                          padding: "0.375rem",
                          background: "rgba(239,68,68,0.08)",
                          border: "1px solid rgba(239,68,68,0.2)",
                          borderRadius: "6px",
                          color: "var(--red)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <UnitFormModal
          unit={editingUnit}
          onClose={() => {
            setShowAddModal(false);
            setEditingUnit(null);
          }}
          onSave={handleSaveUnit}
        />
      )}

      {deleteModal.isOpen && deleteModal.unit && (
        <DeleteConfirmModal
          unit={deleteModal.unit}
          onClose={() => setDeleteModal({ isOpen: false, unit: null })}
          onConfirm={handleConfirmDelete}
        />
      )}

      <InfoModal
        isOpen={infoModal.isOpen}
        onClose={() => setInfoModal({ isOpen: false, title: "", message: "" })}
        title={infoModal.title}
        message={infoModal.message}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// UNIT FORM MODAL
// ══════════════════════════════════════════════════════════════════════════════
function UnitFormModal({ unit, onClose, onSave }) {
  const [formData, setFormData] = useState({
    code: unit?.code || "",
    name: unit?.name || "",
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!formData.code.trim()) {
      newErrors.code = "Unit code is required";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.code)) {
      newErrors.code =
        "Code can only contain letters, numbers, hyphens, and underscores";
    } else if (formData.code.length > 20) {
      newErrors.code = "Code must be 20 characters or less";
    }
    if (!formData.name.trim()) {
      newErrors.name = "Unit name is required";
    } else if (formData.name.length > 100) {
      newErrors.name = "Name must be 100 characters or less";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validate()) {
      await onSave({
        code: formData.code.toLowerCase().trim(),
        name: formData.name.trim(),
      });
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "var(--dark)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "500px",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            padding: "1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
            {unit ? "Edit Unit" : "Add Unit of Measurement"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--gray)",
              cursor: "pointer",
              padding: "0.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "1.5rem" }}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Unit Code <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => handleChange("code", e.target.value)}
              placeholder="e.g., dozen, bundle, yard"
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                background: "rgba(255,255,255,0.06)",
                border: errors.code
                  ? "1px solid #EF4444"
                  : "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#E5E2E1",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
            {errors.code && (
              <p
                style={{
                  margin: "0.375rem 0 0",
                  fontSize: "0.75rem",
                  color: "#EF4444",
                }}
              >
                {errors.code}
              </p>
            )}
            <p
              style={{
                margin: "0.375rem 0 0",
                fontSize: "0.75rem",
                color: "var(--gray)",
              }}
            >
              Short code used in database (e.g., pcs, kg, doz)
            </p>
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Unit Name <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              maxLength={50}
              onChange={(e) => handleChange("name", e.target.value.slice(0, 50))}
              placeholder="e.g., Dozen, Bundle of 50, Yard"
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                background: "rgba(255,255,255,0.06)",
                border: errors.name
                  ? "1px solid #EF4444"
                  : "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#E5E2E1",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
            {errors.name && (
              <p
                style={{
                  margin: "0.375rem 0 0",
                  fontSize: "0.75rem",
                  color: "#EF4444",
                }}
              >
                {errors.name}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "0.625rem 1.5rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#E5E2E1",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "0.625rem 1.5rem",
                background: "var(--gold)",
                border: "none",
                borderRadius: "8px",
                color: "#000",
                fontSize: "0.875rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {unit ? "Update Unit" : "Save Unit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE CONFIRMATION MODAL
// ══════════════════════════════════════════════════════════════════════════════
function DeleteConfirmModal({ unit, onClose, onConfirm }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "var(--dark)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "400px",
        }}
      >
        <div
          style={{
            padding: "1.5rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
            Confirm Delete
          </h2>
        </div>
        <div style={{ padding: "1.5rem" }}>
          <p style={{ margin: 0, color: "#E5E2E1", lineHeight: 1.6 }}>
            Are you sure you want to delete the unit{" "}
            <strong>
              "{unit.name}" ({unit.code})
            </strong>
            ? This action cannot be undone.
          </p>
        </div>
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "0.75rem",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "0.625rem 1.5rem",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#E5E2E1",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "0.625rem 1.5rem",
              background: "#EF4444",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function MasterDataPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("materials");
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [boms, setBoms] = useState([]);
  const [units, setUnits] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);

  const refreshMaterials = useCallback(async () => {
    if (!token) {
      setMaterials([]);
      return;
    }
    try {
      const data = await fetchInventory(token);
      setMaterials((Array.isArray(data) ? data : []).map(normalizeInventoryRow));
    } catch (e) {
      console.error(e);
      setMaterials([]);
    }
  }, [token]);

  const refreshBoms = useCallback(async () => {
    if (!token) {
      setBoms([]);
      return;
    }
    try {
      const data = await fetchBOMs(token);
      setBoms(
        (Array.isArray(data) ? data : []).map((b) => ({
          ...b,
          id: b.id ?? b._id,
        })),
      );
    } catch (e) {
      console.error(e);
      setBoms([]);
    }
  }, [token]);

  const refreshUnits = useCallback(async () => {
    if (!token) {
      setUnits([]);
      return;
    }
    try {
      const raw = await fetchUnits(token);
      const arr = Array.isArray(raw) ? raw : [];
      setUnits(
        arr.map((u) => ({
          id: u._id || u.id,
          code: u.abbreviation || u.code || "",
          name: u.name,
          description: u.description || "",
        })),
      );
    } catch (e) {
      console.error(e);
      setUnits([]);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setVendors([]);
      setMaterials([]);
      setBoms([]);
      setUnits([]);
      setPageLoading(false);
      return;
    }
    let cancelled = false;
    setPageLoading(true);
    Promise.all([
      fetchSuppliers(token)
        .then((d) => {
          const arr = Array.isArray(d) ? d : [];
          if (!cancelled) {
            setVendors(arr.map((v) => ({ ...v, id: v.id ?? v._id })));
          }
        })
        .catch(() => {
          if (!cancelled) setVendors([]);
        }),
      refreshMaterials(),
      refreshBoms(),
      refreshUnits(),
    ]).finally(() => {
      if (!cancelled) setPageLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, refreshMaterials, refreshBoms, refreshUnits]);

  // Collect all unique item names from all vendors' itemsSupplied
  const itemCategories = useMemo(() => {
    const items = new Set();
    vendors.forEach((v) => {
      (v.itemsSupplied || []).forEach((item) => {
        // itemsSupplied contains objects { name, uom }, extract the name
        const itemName = typeof item === "string" ? item : item.name;
        if (itemName) items.add(itemName);
      });
    });
    return [...items].sort();
  }, [vendors]);

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

  if (pageLoading) {
    return (
      <div className="page-content-wrapper">
        <div className="skeleton-page">
          <div className="skeleton-header">
            <div className="skeleton-title" />
            <div className="skeleton-subtitle" />
          </div>
          <div className="skeleton-cards">
            {[...Array(4)].map((_, i) => (
              <div className="skeleton-card" key={i} />
            ))}
          </div>
          <div className="skeleton-table">
            <div className="skeleton-table-header" />
            {[...Array(5)].map((_, i) => (
              <div className="skeleton-row" key={i}>
                <div className="skeleton-cell skeleton-cell-short" />
                <div className="skeleton-cell skeleton-cell-wide" />
                <div className="skeleton-cell skeleton-cell-mid" />
                <div className="skeleton-cell-badge" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="page-content-wrapper">
      <div className="page-header">
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
            style={tabStyle("materials")}
            onClick={() => setActiveTab("materials")}
          >
            Material Master
          </button>
          <button
            style={tabStyle("vendors")}
            onClick={() => setActiveTab("vendors")}
          >
            Vendors
          </button>
          <button style={tabStyle("bom")} onClick={() => setActiveTab("bom")}>
            Product Creation
          </button>
        </div>
      </div>

      {activeTab === "materials" && (
        <MaterialMasterTab
          itemCategories={itemCategories}
          materials={materials}
          vendors={vendors}
          token={token}
          boms={boms}
          units={units}
          refreshMaterials={refreshMaterials}
          onVendorsChange={setVendors}
          onOpenUnits={() => setShowUnitsModal(true)}
        />
      )}
      {activeTab === "vendors" && (
        <VendorsApiTab
          onVendorsChange={setVendors}
          materials={materials}
          units={units}
          onOpenUnits={() => setShowUnitsModal(true)}
        />
      )}
      {activeTab === "bom" && (
        <BOMTab
          materials={materials}
          boms={boms}
          token={token}
          units={units}
          refreshBoms={refreshBoms}
        />
      )}
      {showUnitsModal && (
        <div
          onClick={() => setShowUnitsModal(false)}
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: "16px", width: "100%", maxWidth: "860px", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#E5E2E1" }}>Units of Measurement</h2>
              <button onClick={() => setShowUnitsModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray)", padding: "4px", display: "flex" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
              <UnitMasterTab
                units={units}
                onUnitsChange={setUnits}
                vendors={vendors}
                materials={materials}
                token={token}
                refreshUnits={refreshUnits}
              />
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
