"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

// ── DAMAGE TYPES FOR BAD ORDERS ──────────────────────────────────────────────
// These are the bad order categories that get created during stock-in
export const DAMAGE_TYPES = [
  { id: "damaged", label: "Damaged" },
  { id: "shortage", label: "Shortage" },
  { id: "defective", label: "Defective" },
  { id: "wrong_item", label: "Wrong Item Shipped" },
];

// ── Format Price ───────────────────────────────────────────────────────────────
function formatPrice(val) {
  const num =
    typeof val === "string" ? parseFloat(val.replace(/,/g, "")) || 0 : val || 0;
  return (
    "₱" +
    num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// ── Integer Input ─────────────────────────────────────────────────────────────
function IntegerInput({
  value,
  onChange,
  min = 0,
  max,
  placeholder,
  className,
  disabled,
  autoFocus,
  qtyValue,
}) {
  const handleChange = (e) => {
    if (disabled) return;
    const val = e.target.value;
    if (val === "" || /^\d+$/.test(val)) {
      const numVal = val === "" ? 0 : parseInt(val, 10);
      if (max !== undefined && numVal > max) return;
      if (numVal < min) return;
      if (qtyValue !== undefined) {
        const qty = parseInt(qtyValue) || 0;
        if (numVal > qty) return;
      }
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
      className={className}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="numeric"
      pattern="[0-9]*"
    />
  );
}

// ── Decimal Input ─────────────────────────────────────────────────────────────
function DecimalInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  style,
  max = 999999.99,
}) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      const numVal = parseFloat(val) || 0;
      if (numVal <= max) {
        onChange({ ...e, target: { ...e.target, value: val } });
      }
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
      className={className}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      placeholder={placeholder}
      disabled={disabled}
      inputMode="decimal"
      style={style}
    />
  );
}

// ── Comma-formatted Number Input ──────────────────────────────────────────────
function CommaNumberInput({
  value,
  onChange,
  placeholder,
  className,
  style,
  max = 999999999.99,
}) {
  const handleChange = (e) => {
    const val = e.target.value.replace(/,/g, "");
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      const numVal = parseFloat(val) || 0;
      if (numVal <= max) {
        const parts = val.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        const formatted = parts.join(".");
        onChange({ ...e, target: { ...e.target, value: formatted } });
      }
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
      className={className}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      placeholder={placeholder}
      inputMode="decimal"
      style={{
        ...style,
        background: "transparent",
        border: "none",
        outline: "none",
        minWidth: 0,
      }}
    />
  );
}

// ── Vendor Combobox ──────────────────────────────────────────────────────────
function VendorCombobox({
  value,
  vendorName,
  onChange,
  vendors,
  selectedCategories,
  onAddNew,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = vendors.filter((v) => {
    const vItems = v.itemsSupplied || [];
    // Always show the currently selected vendor (so it doesn't disappear when switching)
    if (value && v.id === value) return true;

    // If no categories selected, show all vendors
    if (!selectedCategories || selectedCategories.length === 0) return true;

    // Extract category names from itemsSupplied (handle both strings and objects)
    const itemNames = vItems
      .map((item) =>
        typeof item === "string" ? item : item?.name || item?.category || "",
      )
      .filter(Boolean);

    // Show vendor if it supplies ANY of the selected material categories
    return selectedCategories.some((cat) => itemNames.includes(cat));
  });
  const display =
    value === "" ? "General Merchandise" : vendorName || "General Merchandise";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        className="combobox-field"
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer" }}
      >
        <input
          type="text"
          className="form-input"
          value={display}
          readOnly
          style={{ cursor: "pointer" }}
        />
        <button type="button" className="combobox-toggle">
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (
        <div
          className="combobox-menu"
          style={{ maxHeight: "200px", overflowY: "auto" }}
        >
          <button
            type="button"
            className={`combobox-item${value === "" ? " active" : ""}`}
            onClick={() => {
              onChange("", "General Merchandise");
              setOpen(false);
            }}
          >
            General Merchandise
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--gray)",
                marginLeft: "0.5rem",
              }}
            >
              Local Market / Various Vendors
            </span>
          </button>
          {filtered.map((v) => {
            const vItems = v.itemsSupplied || [];
            // Handle both string arrays and object arrays for itemsSupplied
            const itemNames = vItems
              .map((item) =>
                typeof item === "string"
                  ? item
                  : item?.name || item?.category || "",
              )
              .filter(Boolean);

            const matchesCategories =
              selectedCategories && selectedCategories.length > 0
                ? selectedCategories.some((cat) => itemNames.includes(cat))
                : false;

            return (
              <button
                key={v.id}
                type="button"
                className={`combobox-item${value === v.id ? " active" : ""}`}
                onClick={() => {
                  onChange(v.id, v.name);
                  setOpen(false);
                }}
              >
                {v.name}
                {itemNames.length > 0 ? (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: matchesCategories ? "#D4A843" : "var(--gray)",
                      marginLeft: "0.5rem",
                      fontWeight: matchesCategories ? 600 : 400,
                    }}
                  >
                    ({itemNames.join(", ")})
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--gray)",
                      marginLeft: "0.5rem",
                    }}
                  >
                    (General)
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            className="combobox-item combobox-add"
            onClick={() => {
              setOpen(false);
              onAddNew();
            }}
          >
            <span>+</span> Add New Vendor...
          </button>
        </div>
      )}
    </div>
  );
}

// ── Category Card (isolated to prevent cross-column expansion) ─────────────
function CategoryCard({
  group,
  isExpanded,
  onToggle,
  selectedMaterials,
  onToggleMaterial,
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "12px",
        overflow: "hidden",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.875rem 1rem",
          background: "rgba(255,255,255,0.04)",
          border: "none",
          borderBottom: isExpanded
            ? "1px solid rgba(255,255,255,0.05)"
            : "1px solid rgba(255,255,255,0.02)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transition: "transform 0.2s",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              color: "var(--gray)",
            }}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <div>
            <div
              style={{
                fontWeight: 600,
                color: "var(--white)",
                fontSize: "1rem",
              }}
            >
              {group.category}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--gray)",
                marginTop: "0.1rem",
              }}
            >
              {group.materials.length} material
              {group.materials.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </button>
      {isExpanded &&
        group.materials.map((m, idx) => {
          const isSelected = selectedMaterials.some((s) => s.id === m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggleMaterial(m, isSelected)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem 0.75rem 2.5rem",
                background: isSelected
                  ? "rgba(212,168,67,0.12)"
                  : idx % 2 === 0
                    ? "rgba(0,0,0,0.15)"
                    : "transparent",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: isSelected ? "#D4A843" : "var(--white)",
                    fontSize: "0.85rem",
                  }}
                >
                  {m.name}
                </div>
                {m.hasVariants && (
                  <div
                    style={{
                      fontSize: "0.65rem",
                      color: "var(--gray)",
                      marginTop: "0.1rem",
                    }}
                  >
                    {m.variantCount || 0} variants
                  </div>
                )}
              </div>
              {isSelected && (
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "#D4A843",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginLeft: "0.5rem",
                  }}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#000"
                    strokeWidth="3"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
    </div>
  );
}

// ── InfoModal ─────────────────────────────────────────────────────────────────
function InfoModal({ isOpen, onClose, title, message }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div
        className="modal-content modal-content-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">{title}</h2>
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
        <div className="modal-body">
          <p className="delete-confirm-text">{message}</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD STOCK MODAL — 3-Step Wizard
// ══════════════════════════════════════════════════════════════════════════════

export default function AddStockModal({
  isOpen,
  onClose,
  onSave,
  materials,
  vendors,
  onAddVendor,
}) {
  // ── State ────────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [stockRowsByMaterial, setStockRowsByMaterial] = useState({});
  const [applyAllCostByMaterial, setApplyAllCostByMaterial] = useState({});
  const [applyAllMinStock, setApplyAllMinStock] = useState("10");
  const [invoice, setInvoice] = useState({
    vendorId: "",
    vendorName: "General Merchandise",
    invoiceNumber: "",
    deliveryDate: new Date().toISOString().split("T")[0],
    notes: "",
    receiptImage: null,
    costMode: "unit",
    totalInvoiceAmount: "",
  });
  const [materialCostModes, setMaterialCostModes] = useState({});
  const [materialTotalAmounts, setMaterialTotalAmounts] = useState({});
  const [infoModal, setInfoModal] = useState(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [issuePopoverOpen, setIssuePopoverOpen] = useState(false);
  const [issuePopoverTarget, setIssuePopoverTarget] = useState(null); // { materialId, rowIndex }

  // ── Reset on open ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSearch("");
    setSelectedMaterials([]);
    setStockRowsByMaterial({});
    setApplyAllCostByMaterial({});
    setExpandedCategories({});
    setInvoice({
      vendorId: "",
      vendorName: "General Merchandise",
      invoiceNumber: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      notes: "",
      receiptImage: null,
      costMode: "unit",
      totalInvoiceAmount: "",
    });
    setMaterialCostModes({});
    setMaterialTotalAmounts({});
  }, [isOpen]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const handleBackToStep2 = () => {
    setStep(2);
    setInvoice({
      vendorId: "",
      vendorName: "General Merchandise",
      invoiceNumber: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      notes: "",
      receiptImage: null,
      costMode: "unit",
      totalInvoiceAmount: "",
    });
    setMaterialCostModes({});
    setMaterialTotalAmounts({});
  };
  const handleBackToStep1 = () => {
    setStep(1);
    setStockRowsByMaterial({});
    setApplyAllCostByMaterial({});
    setInvoice({
      vendorId: "",
      vendorName: "General Merchandise",
      invoiceNumber: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      notes: "",
      receiptImage: null,
      costMode: "unit",
      totalInvoiceAmount: "",
    });
    setMaterialCostModes({});
    setMaterialTotalAmounts({});
  };
  const handleGoToStep2 = () => {
    if (
      selectedMaterials.length > 0 &&
      Object.keys(stockRowsByMaterial).length === 0
    ) {
      const newRows = {};
      selectedMaterials.forEach((m) => {
        newRows[m.id] = generateRows(m);
      });
      setStockRowsByMaterial(newRows);
    }
    setStep(2);
  };
  const goNext = () => {
    if (step === 1) {
      handleGoToStep2();
    } else if (step === 2) {
      // Only auto-detect vendor if none is currently selected
      if (!invoice.vendorId || invoice.vendorId === "") {
        const selectedMaterialIds = Object.keys(stockRowsByMaterial);
        const selectedMats = materials.filter((m) =>
          selectedMaterialIds.includes(m.id),
        );

        // Find common preferred vendor
        const vendorCounts = {};
        selectedMats.forEach((m) => {
          if (m.preferredVendorId) {
            vendorCounts[m.preferredVendorId] =
              (vendorCounts[m.preferredVendorId] || 0) + 1;
          }
        });

        let defaultVendorId = "";
        let defaultVendorName = "General Merchandise";

        // If all materials have the same preferred vendor, use it
        const vendorEntries = Object.entries(vendorCounts);
        if (
          vendorEntries.length === 1 &&
          vendorEntries[0][1] === selectedMats.length
        ) {
          const commonVendorId = vendorEntries[0][0];
          const commonVendor = vendors.find((v) => v.id === commonVendorId);
          if (commonVendor) {
            defaultVendorId = commonVendorId;
            defaultVendorName = commonVendor.name;
          }
        }

        setInvoice((prev) => ({
          ...prev,
          vendorId: defaultVendorId,
          vendorName: defaultVendorName,
        }));
      }

      setStep(3);
    }
  };

  const toggleCategory = (catName) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  // ── Filter & Group Materials ─────────────────────────────────────────────────
  const selectableMaterials = useMemo(
    () => materials.filter((m) => !m.parentId),
    [materials],
  );

  const filteredMaterials = useMemo(() => {
    if (!search.trim()) return selectableMaterials;
    const q = search.toLowerCase();
    return selectableMaterials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.sku || "").toLowerCase().includes(q) ||
        (m.category || "").toLowerCase().includes(q),
    );
  }, [search, selectableMaterials]);

  const groupedByCategory = useMemo(() => {
    const groups = {};
    filteredMaterials.forEach((m) => {
      const cat = m.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = { category: cat, materials: [] };
      const variantCount = m.hasVariants
        ? materials.filter((c) => c.parentId === m.id).length
        : 0;
      groups[cat].materials.push({ ...m, variantCount });
    });
    return Object.values(groups);
  }, [filteredMaterials, materials]);

  // ── Generate rows ────────────────────────────────────────────────────────────
  const generateRows = (mat) => {
    if (!mat.hasVariants) {
      return [
        {
          materialId: mat.id,
          variantLabel: mat.name,
          sku: mat.sku || "",
          uom: mat.uom || "pcs",
          qty: "",
          damageIssues: {
            damaged: "",
            shortage: "",
            defective: "",
            wrong_item: "",
          },
          unitCost:
            mat.baseCost != null && mat.baseCost > 0
              ? String(mat.baseCost)
              : "",
          minStockLevel: String(mat.minStock || 10),
        },
      ];
    }
    const children = materials.filter((c) => c.parentId === mat.id);
    if (children.length === 0) {
      return [
        {
          materialId: mat.id,
          variantLabel: mat.name + " (Parent)",
          sku: mat.sku || "",
          uom: mat.uom || "pcs",
          qty: "",
          damageIssues: {
            damaged: "",
            shortage: "",
            defective: "",
            wrong_item: "",
          },
          unitCost:
            mat.baseCost != null && mat.baseCost > 0
              ? String(mat.baseCost)
              : "",
          minStockLevel: "10",
        },
      ];
    }
    return children.map((c) => ({
      materialId: c.id,
      variantLabel: c.name,
      sku: c.sku || "",
      uom: c.uom || mat.uom || "pcs",
      qty: "",
      damageIssues: {
        damaged: "",
        shortage: "",
        defective: "",
        wrong_item: "",
      },
      unitCost:
        c.baseCost != null && c.baseCost > 0
          ? String(c.baseCost)
          : mat.baseCost != null && mat.baseCost > 0
            ? String(mat.baseCost)
            : "",
      minStockLevel: String(c.minStock || mat.minStock || 10),
    }));
  };

  // ── Bad Order Issues Popover ───────────────────────────────────────────────
  // Clickable popover to specify damage types when entering bad orders
  function BadOrderIssuesPopover({
    isOpen,
    onClose,
    damageIssues,
    onChange,
    qtyReceived,
  }) {
    if (!isOpen) return null;

    const totalBO = Object.values(damageIssues).reduce(
      (s, v) => s + (parseInt(v) || 0),
      0,
    );

    const handleChange = (type, val) => {
      const num = val === "" ? 0 : parseInt(val) || 0;
      const othersTotal = Object.entries(damageIssues)
        .filter(([k]) => k !== type)
        .reduce((s, [, v]) => s + (parseInt(v) || 0), 0);
      const remaining = qtyReceived - othersTotal;
      if (num > remaining) return;
      onChange({ ...damageIssues, [type]: val });
    };

    return (
      <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={onClose}>
        <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "380px", width: "90%" }}
        >
          <div className="modal-header">
            <h2 className="modal-title" style={{ fontSize: "0.95rem" }}>
              Bad Order Issues ({qtyReceived} units received)
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
          <div className="modal-body">
            {totalBO > qtyReceived && (
              <p
                style={{
                  color: "#ef4444",
                  fontSize: "0.78rem",
                  marginBottom: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Total issues cannot exceed received quantity.
              </p>
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {DAMAGE_TYPES.map((dt) => {
                const val = damageIssues[dt.id] || "";
                const num = parseInt(val) || 0;
                const othersTotal = Object.entries(damageIssues)
                  .filter(([k]) => k !== dt.id)
                  .reduce((s, [, v]) => s + (parseInt(v) || 0), 0);
                const maxAllow = qtyReceived - othersTotal;
                return (
                  <div key={dt.id}>
                    <label
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.78rem",
                        color: "#E5E2E1",
                        fontWeight: 600,
                        marginBottom: "0.35rem",
                      }}
                    >
                      <span>{dt.label}</span>
                      {num > 0 && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            color: "#D4A843",
                            fontWeight: 700,
                          }}
                        >
                          {num} unit{num !== 1 ? "s" : ""}
                        </span>
                      )}
                    </label>
                    <IntegerInput
                      value={val}
                      onChange={(e) => handleChange(dt.id, e.target.value)}
                      min={0}
                      max={maxAllow}
                      placeholder="0"
                      className="form-input"
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.06)",
                        border:
                          num > 0
                            ? "1px solid rgba(212,168,67,0.4)"
                            : "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        color: num > 0 ? "#E5E2E1" : "var(--gray)",
                        padding: "0.5rem 0.75rem",
                        fontSize: "0.85rem",
                        textAlign: "center",
                        fontWeight: 700,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "rgba(248,113,113,0.06)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Total Bad Orders
              </span>
              <span
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: totalBO > 0 ? "#F87171" : "var(--gray)",
                }}
              >
                {totalBO}{" "}
                <span style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                  units
                </span>
              </span>
            </div>
          </div>
          <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived totals ───────────────────────────────────────────────────────────
  const totalReceived = selectedMaterials.reduce((sum, m) => {
    const rows = stockRowsByMaterial[m.id] || [];
    return sum + rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  }, 0);
  const totalDamaged = selectedMaterials.reduce((sum, m) => {
    const rows = stockRowsByMaterial[m.id] || [];
    return (
      sum +
      rows.reduce((s, r) => {
        const issues = r.damageIssues || {};
        return (
          s +
          Object.values(issues).reduce((ss, v) => ss + (parseInt(v) || 0), 0)
        );
      }, 0)
    );
  }, 0);
  const totalGood = totalReceived - totalDamaged;

  const categoriesWithQty = useMemo(() => {
    const cats = selectedMaterials
      .filter((m) =>
        (stockRowsByMaterial[m.id] || []).some(
          (r) => (parseInt(r.qty) || 0) > 0,
        ),
      )
      .map((m) => m.category);
    // Remove duplicates while preserving order
    return [...new Set(cats)];
  }, [selectedMaterials, stockRowsByMaterial]);

  const totalInvoiceValue = useMemo(() => {
    return selectedMaterials.reduce((sum, m) => {
      const rows = (stockRowsByMaterial[m.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      if (rows.length === 0) return sum;
      const mode = materialCostModes[m.id] || "unit";
      const totalAmt = materialTotalAmounts[m.id] || "";
      if (mode === "total" && totalAmt)
        return sum + (parseFloat(totalAmt.replace(/,/g, "")) || 0);
      return (
        sum +
        rows.reduce(
          (s, r) => s + (parseInt(r.qty) || 0) * (parseFloat(r.unitCost) || 0),
          0,
        )
      );
    }, 0);
  }, [
    selectedMaterials,
    stockRowsByMaterial,
    materialCostModes,
    materialTotalAmounts,
  ]);

  const effectiveValue = useMemo(() => {
    return selectedMaterials.reduce((sum, m) => {
      const rows = (stockRowsByMaterial[m.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      const mode = materialCostModes[m.id] || "unit";
      const totalAmt = materialTotalAmounts[m.id] || "";
      let unitCost = 0;
      if (mode === "total" && totalAmt) {
        const totalQty = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
        unitCost =
          totalQty > 0
            ? (parseFloat(totalAmt.replace(/,/g, "")) || 0) / totalQty
            : 0;
      }
      return (
        sum +
        rows.reduce((s, r) => {
          const issues = r.damageIssues || {};
          const totalBO = Object.values(issues).reduce(
            (ss, v) => ss + (parseInt(v) || 0),
            0,
          );
          const good = Math.max(0, (parseInt(r.qty) || 0) - totalBO);
          const cost =
            mode === "total" ? unitCost : parseFloat(r.unitCost) || 0;
          return s + good * cost;
        }, 0)
      );
    }, 0);
  }, [
    selectedMaterials,
    stockRowsByMaterial,
    materialCostModes,
    materialTotalAmounts,
  ]);

  const damagedBreakdown = useMemo(() => {
    if (totalDamaged <= 0) return "";
    const parts = selectedMaterials.flatMap((m) => {
      const rows = (stockRowsByMaterial[m.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      const mode = materialCostModes[m.id] || "unit";
      const totalAmt = materialTotalAmounts[m.id] || "";
      const totalQty = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
      const productUnitCost =
        mode === "total" && totalQty > 0
          ? (parseFloat(totalAmt.replace(/,/g, "")) || 0) / totalQty
          : 0;
      return rows.flatMap((r) => {
        const issues = r.damageIssues || {};
        return Object.entries(issues)
          .filter(([, v]) => (parseInt(v) || 0) > 0)
          .map(([type, v]) => {
            const d = parseInt(v) || 0;
            const c =
              mode === "total" ? productUnitCost : parseFloat(r.unitCost) || 0;
            const label =
              DAMAGE_TYPES.find((dt) => dt.id === type)?.label || type;
            return `${d}x${label}(${formatPrice(d * c)})`;
          });
      });
    });
    return parts.join("  ");
  }, [
    selectedMaterials,
    stockRowsByMaterial,
    materialCostModes,
    materialTotalAmounts,
    totalDamaged,
  ]);

  // ── Validation ───────────────────────────────────────────────────────────────
  const step1Valid = selectedMaterials.length > 0;
  const step2Valid = () => {
    if (selectedMaterials.length === 0) return false;
    const hasQty = selectedMaterials.some((m) =>
      (stockRowsByMaterial[m.id] || []).some((r) => (parseInt(r.qty) || 0) > 0),
    );
    if (!hasQty) return false;
    // Validate: total damageIssues cannot exceed qty received
    for (const m of selectedMaterials) {
      const rows = stockRowsByMaterial[m.id] || [];
      for (const r of rows) {
        const issues = r.damageIssues || {};
        const totalIssues = Object.values(issues).reduce(
          (s, v) => s + (parseInt(v) || 0),
          0,
        );
        const qty = parseInt(r.qty) || 0;
        if (totalIssues > qty) return false;
      }
    }
    return true;
  };
  const step3Valid = () => {
    const hasInvoice = invoice.invoiceNumber.trim() && invoice.deliveryDate;
    if (!hasInvoice) return false;
    return selectedMaterials.every((m) => {
      const rows = (stockRowsByMaterial[m.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      if (rows.length === 0) return true;
      const mode = materialCostModes[m.id] || "unit";
      const totalAmt = materialTotalAmounts[m.id] || "";
      if (mode === "total")
        return (parseFloat(totalAmt.replace(/,/g, "")) || 0) > 0;
      return rows.some((r) => (parseFloat(r.unitCost) || 0) > 0);
    });
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!step1Valid) {
      setInfoModal({
        title: "Validation Error",
        message: "Select at least one material.",
      });
      return;
    }
    if (!step2Valid()) {
      setInfoModal({
        title: "Validation Error",
        message: "Enter received quantity for at least one item.",
      });
      return;
    }
    if (!step3Valid()) {
      setInfoModal({
        title: "Validation Error",
        message:
          "Complete all required invoice fields (invoice number, delivery date, and cost).",
      });
      return;
    }

    const stockData = selectedMaterials.flatMap((mat) => {
      const rows = (stockRowsByMaterial[mat.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      const mode = materialCostModes[mat.id] || "unit";
      const totalAmt = materialTotalAmounts[mat.id] || "";
      const totalQty = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
      const computedUnitCost =
        mode === "total" && totalAmt
          ? (parseFloat(totalAmt.replace(/,/g, "")) || 0) / (totalQty || 1)
          : 0;

      return rows.map((r) => {
        const received = parseInt(r.qty) || 0;
        const issues = r.damageIssues || {};
        const totalBO = Object.values(issues).reduce(
          (s, v) => s + (parseInt(v) || 0),
          0,
        );
        const good = received - totalBO;
        const unitCost =
          mode === "total" ? computedUnitCost : parseFloat(r.unitCost) || 0;

        // Build badOrders array from damageIssues
        const badOrders = [];
        Object.entries(issues).forEach(([type, val]) => {
          const qty = parseInt(val) || 0;
          if (qty > 0) {
            const label =
              DAMAGE_TYPES.find((dt) => dt.id === type)?.label || type;
            badOrders.push({
              type,
              label,
              qty,
              unitCost,
              totalValue: qty * unitCost,
            });
          }
        });

        return {
          materialId: r.materialId,
          materialName: r.variantLabel,
          sku: r.sku || "",
          uom: r.uom || "pcs",
          vendorId: invoice.vendorId || null,
          vendorName: invoice.vendorName || "General Merchandise",
          receivedQty: received,
          goodQty: good,
          badOrders,
          unitCost,
          effectiveUnitCost: good > 0 ? (received * unitCost) / good : unitCost,
          totalPaid: received * unitCost,
          invoiceNumber: invoice.invoiceNumber.trim(),
          notes: invoice.notes.trim(),
          dateReceived: invoice.deliveryDate + "T00:00:00.000Z",
          receiptImage: invoice.receiptImage || null,
        };
      });
    });

    onSave(stockData);
    onClose();
  };

  if (!isOpen) return null;

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "1300px",
          width: "95%",
          height: "90vh",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#0E0E0E",
          border: "1px solid rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        {/* ── Header (fixed) ─────────────────────────────────────────────── */}
        <div
          style={{
            padding: "1.5rem 2rem",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "#131313",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.25rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.62rem",
                  color: "#D4A843",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  marginBottom: "0.35rem",
                  fontWeight: 600,
                }}
              >
                Stock-In
              </div>
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "#E5E2E1",
                  margin: 0,
                }}
              >
                Add Stock
              </h2>
              {selectedMaterials.length > 0 && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray)",
                    marginTop: "0.4rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#D4A843"
                    strokeWidth="2.5"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Selected:{" "}
                  <span style={{ color: "#D4A843", fontWeight: 600 }}>
                    {selectedMaterials.length} material
                    {selectedMaterials.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "none",
                borderRadius: "50%",
                width: "40px",
                height: "40px",
                cursor: "pointer",
                color: "var(--gray)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(239,68,68,0.15)";
                e.currentTarget.style.color = "#ef4444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "var(--gray)";
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              position: "relative",
              paddingLeft: "2rem",
              paddingRight: "2rem",
            }}
          >
            {[
              { left: "calc(16.67%)", valid: step1Valid },
              { left: "calc(50%)", valid: step2Valid() },
              { left: "calc(83.33%)", valid: step3Valid() },
            ].map((seg, i) => (
              <React.Fragment key={i}>
                <div
                  style={{
                    position: "absolute",
                    top: "14px",
                    left: seg.left,
                    width: "calc(33.33%)",
                    height: "2px",
                    background: "rgba(255,255,255,0.08)",
                    zIndex: 0,
                    borderRadius: "2px",
                    transform: "translateX(-50%)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "14px",
                    left: seg.left,
                    width: seg.valid ? "calc(33.33%)" : "0%",
                    height: "2px",
                    background:
                      "linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)",
                    zIndex: 1,
                    borderRadius: "2px",
                    transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: seg.valid
                      ? "0 0 12px rgba(212,168,67,0.4)"
                      : "none",
                    transform: "translateX(-50%)",
                  }}
                />
              </React.Fragment>
            ))}
            {[
              { num: 1, label: "Select Materials" },
              { num: 2, label: "Stock Entry" },
              { num: 3, label: "Invoice" },
            ].map((s) => {
              const isComplete =
                s.num === 1
                  ? step1Valid
                  : s.num === 2
                    ? step2Valid()
                    : step3Valid();
              const isCurrent = step === s.num;
              return (
                <div
                  key={s.num}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.5rem",
                    flex: 1,
                    position: "relative",
                    zIndex: 2,
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isComplete
                        ? "linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)"
                        : isCurrent
                          ? "rgba(255,255,255,0.15)"
                          : "rgba(255,255,255,0.08)",
                      color: isComplete
                        ? "#000"
                        : isCurrent
                          ? "#D4A843"
                          : "var(--gray)",
                      border: isCurrent
                        ? "2px solid #D4A843"
                        : "2px solid transparent",
                      transition: "all 0.3s ease",
                      boxShadow: isCurrent
                        ? "0 0 16px rgba(212,168,67,0.4)"
                        : "none",
                      transform: isCurrent ? "scale(1.08)" : "scale(1)",
                    }}
                  >
                    {isComplete ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#000"
                        strokeWidth="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                        {s.num}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "0.6rem",
                      letterSpacing: "0.12em",
                      fontWeight: 600,
                      color:
                        isComplete || isCurrent ? "#D4A843" : "var(--gray)",
                      textTransform: "uppercase",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body (flex: 1, overflow hidden) ────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            width: "100%",
            alignItems: "stretch",
          }}
        >
          {/* ── STEP 1: Select Materials ─────────────────────────────────── */}
          {step === 1 && (
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "2rem 4rem",
                width: "100%",
                maxWidth: "1400px",
                margin: "0 auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Search Bar - Full Width */}
              <div
                style={{
                  position: "relative",
                  marginBottom: "1.5rem",
                  width: "100%",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    position: "absolute",
                    left: "0.875rem",
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
                  placeholder="Search categories or materials..."
                  style={{
                    width: "100%",
                    padding: "0.875rem 1rem 0.875rem 2.75rem",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    color: "var(--white)",
                    fontSize: "0.9rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Two-Column Layout — explicitly separated */}
              {groupedByCategory.length === 0 ? (
                <div
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "var(--gray)",
                    fontSize: "0.875rem",
                  }}
                >
                  {selectableMaterials.length === 0
                    ? "No materials available. Add materials in Master Data first."
                    : `No results for "${search}"`}
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1.25rem",
                    width: "100%",
                    alignItems: "start",
                  }}
                >
                  {/* LEFT Column */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.25rem",
                    }}
                  >
                    {groupedByCategory
                      .filter((_, i) => i % 2 === 0)
                      .map((group, groupIdx) => (
                        <CategoryCard
                          key={`left-${group.category}`}
                          group={group}
                          isExpanded={!!expandedCategories[group.category]}
                          onToggle={() => toggleCategory(group.category)}
                          selectedMaterials={selectedMaterials}
                          onToggleMaterial={(m, isSelected) => {
                            if (isSelected) {
                              setSelectedMaterials((prev) =>
                                prev.filter((s) => s.id !== m.id),
                              );
                              const n = { ...stockRowsByMaterial };
                              delete n[m.id];
                              setStockRowsByMaterial(n);
                            } else {
                              setSelectedMaterials([...selectedMaterials, m]);
                              setStockRowsByMaterial({
                                ...stockRowsByMaterial,
                                [m.id]: generateRows(m),
                              });
                            }
                          }}
                        />
                      ))}
                  </div>
                  {/* RIGHT Column */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.25rem",
                    }}
                  >
                    {groupedByCategory
                      .filter((_, i) => i % 2 === 1)
                      .map((group, groupIdx) => (
                        <CategoryCard
                          key={`right-${group.category}`}
                          group={group}
                          isExpanded={!!expandedCategories[group.category]}
                          onToggle={() => toggleCategory(group.category)}
                          selectedMaterials={selectedMaterials}
                          onToggleMaterial={(m, isSelected) => {
                            if (isSelected) {
                              setSelectedMaterials((prev) =>
                                prev.filter((s) => s.id !== m.id),
                              );
                              const n = { ...stockRowsByMaterial };
                              delete n[m.id];
                              setStockRowsByMaterial(n);
                            } else {
                              setSelectedMaterials([...selectedMaterials, m]);
                              setStockRowsByMaterial({
                                ...stockRowsByMaterial,
                                [m.id]: generateRows(m),
                              });
                            }
                          }}
                        />
                      ))}
                  </div>
                </div>
              )}
              {selectedMaterials.length === 0 && (
                <p
                  style={{
                    gridColumn: "1 / -1",
                    fontSize: "0.78rem",
                    color: "var(--gray)",
                    marginTop: "0.5rem",
                    textAlign: "center",
                  }}
                >
                  Select one or more materials to receive. All variant
                  combinations will be shown automatically.
                </p>
              )}
            </div>
          )}

          {/* ── STEP 2: Stock Entry ──────────────────────────────────────── */}
          {step === 2 && (
            <div
              style={{
                flex: 1,
                display: "grid",
                gridTemplateColumns: "1fr 420px",
                minHeight: 0,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              {/* LEFT — Stock Entry Table */}
              <div
                style={{
                  padding: "1.5rem 2rem",
                  overflowY: "auto",
                  background: "#0E0E0E",
                  minHeight: 0,
                  height: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "rgba(212,168,67,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D4A843"
                      strokeWidth="2"
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#E5E2E1",
                        fontSize: "1rem",
                      }}
                    >
                      Step 2: Stock Entry
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "#D4A843",
                        fontWeight: 600,
                      }}
                    >
                      {selectedMaterials.length} Material
                      {selectedMaterials.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {/* Multiple tables - one per material */}
                {selectedMaterials.map((mat, mIdx) => {
                  const rows = stockRowsByMaterial[mat.id] || [];
                  const totalMaterialQty = rows.reduce(
                    (s, r) => s + (parseInt(r.qty) || 0),
                    0,
                  );
                  const totalMaterialDamaged = rows.reduce(
                    (s, r) => s + (parseInt(r.damaged) || 0),
                    0,
                  );

                  return (
                    <div
                      key={mat.id}
                      style={{
                        marginBottom:
                          mIdx < selectedMaterials.length - 1
                            ? "2rem"
                            : "1.25rem",
                      }}
                    >
                      {/* Material Header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "6px",
                            background: "rgba(212,168,67,0.15)",
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
                            stroke="#D4A843"
                            strokeWidth="2"
                          >
                            <path d="M20 7h-9" />
                            <path d="M14 17H5" />
                            <circle cx="17" cy="17" r="3" />
                            <circle cx="7" cy="7" r="3" />
                          </svg>
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#E5E2E1",
                              fontSize: "0.85rem",
                            }}
                          >
                            {mat.category} / {mat.name}
                          </div>
                          <div
                            style={{
                              fontSize: "0.65rem",
                              color: "var(--gray)",
                            }}
                          >
                            {rows.length} Variant{rows.length !== 1 ? "s" : ""}{" "}
                            {totalMaterialQty > 0 &&
                              `${totalMaterialQty} pcs`}
                          </div>
                        </div>
                      </div>

                      {/* Variant Table for this material */}
                      <div
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          borderRadius: "12px",
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.08)",
                          marginBottom: "1rem",
                        }}
                      >
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            tableLayout: "fixed",
                          }}
                        >
                          <thead>
                            <tr
                              style={{
                                background: "rgba(0,0,0,0.2)",
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.08)",
                              }}
                            >
                              <th
                                style={{
                                  padding: "0.875rem 1rem",
                                  textAlign: "left",
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  color: "var(--gray)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                  width: "auto",
                                }}
                              >
                                Variant Name
                              </th>
                              <th
                                style={{
                                  padding: "0.875rem 0.75rem",
                                  textAlign: "center",
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  color: "var(--gray)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                  width: "110px",
                                  minWidth: "110px",
                                }}
                              >
                                Qty Received
                              </th>
                              <th
                                style={{
                                  padding: "0.875rem 0.75rem",
                                  textAlign: "center",
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  color: "var(--gray)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                  width: "120px",
                                  minWidth: "120px",
                                }}
                              >
                                Issues / BO
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "0.55rem",
                                    fontWeight: 400,
                                    color: "var(--gray)",
                                    textTransform: "none",
                                    marginTop: "0.15rem",
                                  }}
                                >
                                  Damaged, Shortage, etc.
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, idx) => {
                              const q = parseInt(row.qty) || 0;
                              const issues = row.damageIssues || {};
                              const totalBO = Object.values(issues).reduce(
                                (s, v) => s + (parseInt(v) || 0),
                                0,
                              );
                              const hasIssues = totalBO > 0;
                              return (
                                <tr
                                  key={row.variantLabel}
                                  style={{
                                    background:
                                      idx % 2 === 0
                                        ? "transparent"
                                        : "rgba(255,255,255,0.015)",
                                    borderBottom:
                                      "1px solid rgba(255,255,255,0.04)",
                                  }}
                                >
                                  <td style={{ padding: "1rem" }}>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.75rem",
                                      }}
                                    >
                                      <div>
                                        <div
                                          style={{
                                            fontWeight: 600,
                                            color: "#E5E2E1",
                                            fontSize: "0.85rem",
                                          }}
                                        >
                                          {row.variantLabel}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "0.65rem",
                                            color: "var(--gray)",
                                            fontFamily: "monospace",
                                            marginTop: "0.1rem",
                                          }}
                                        >
                                          SKU: {row.sku || "—"}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "1rem 0.75rem",
                                      textAlign: "center",
                                    }}
                                  >
                                    <IntegerInput
                                      className="form-input"
                                      value={row.qty}
                                      onChange={(e) => {
                                        const newRows = [...rows];
                                        newRows[idx] = {
                                          ...row,
                                          qty: e.target.value,
                                        };
                                        setStockRowsByMaterial({
                                          ...stockRowsByMaterial,
                                          [mat.id]: newRows,
                                        });
                                      }}
                                      min={0}
                                      max={99999}
                                      placeholder="0"
                                      style={{
                                        textAlign: "center",
                                        width: "80px",
                                        background: "rgba(255,255,255,0.06)",
                                        border:
                                          "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                        color:
                                          q > 0 ? "#D4A843" : "var(--gray)",
                                        fontWeight: 700,
                                        padding: "0.5rem",
                                      }}
                                    />
                                  </td>
                                  <td
                                    style={{
                                      padding: "1rem 0.75rem",
                                      textAlign: "center",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      disabled={q === 0}
                                      onClick={() => {
                                        setIssuePopoverTarget({
                                          materialId: mat.id,
                                          rowIndex: idx,
                                        });
                                        setIssuePopoverOpen(true);
                                      }}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "0.35rem",
                                        width: "100px",
                                        padding: "0.5rem 0.6rem",
                                        background: hasIssues
                                          ? "rgba(248,113,113,0.12)"
                                          : q === 0
                                            ? "rgba(255,255,255,0.02)"
                                            : "rgba(255,255,255,0.06)",
                                        border: hasIssues
                                          ? "1px solid rgba(248,113,113,0.3)"
                                          : q === 0
                                            ? "1px solid rgba(255,255,255,0.05)"
                                            : "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                        color: hasIssues
                                          ? "#F87171"
                                          : q === 0
                                            ? "var(--gray)"
                                            : "var(--gray-light)",
                                        fontWeight: 700,
                                        fontSize: "0.85rem",
                                        cursor:
                                          q === 0 ? "not-allowed" : "pointer",
                                        transition: "all 0.15s",
                                      }}
                                      onMouseEnter={(e) => {
                                        if (q > 0) {
                                          e.currentTarget.style.borderColor =
                                            "rgba(212,168,67,0.4)";
                                          e.currentTarget.style.background =
                                            "rgba(212,168,67,0.08)";
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor =
                                          hasIssues
                                            ? "rgba(248,113,113,0.3)"
                                            : q === 0
                                              ? "rgba(255,255,255,0.05)"
                                              : "rgba(255,255,255,0.1)";
                                        e.currentTarget.style.background =
                                          hasIssues
                                            ? "rgba(248,113,113,0.12)"
                                            : q === 0
                                              ? "rgba(255,255,255,0.02)"
                                              : "rgba(255,255,255,0.06)";
                                      }}
                                    >
                                      <span>{totalBO || "0"}</span>
                                      {q > 0 && (
                                        <svg
                                          width="12"
                                          height="12"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5"
                                        >
                                          <path d="M12 5v14M5 12h14" />
                                        </svg>
                                      )}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {/* Summary Cards */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      padding: "1rem",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.62rem",
                        color: "var(--gray)",
                        textTransform: "uppercase",
                        marginBottom: "0.35rem",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                      }}
                    >
                      Total Effective Qty
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 800,
                        color: "#E5E2E1",
                      }}
                    >
                      {totalGood}{" "}
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 500,
                          color: "var(--gray)",
                        }}
                      >
                        units
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "1rem",
                      background: "rgba(248,113,113,0.06)",
                      border: "1px solid rgba(248,113,113,0.2)",
                      borderRadius: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.62rem",
                        color: "var(--gray)",
                        textTransform: "uppercase",
                        marginBottom: "0.35rem",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                      }}
                    >
                      Bad Orders
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 800,
                        color: "#F87171",
                      }}
                    >
                      {totalDamaged}{" "}
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 500,
                          color: "var(--gray)",
                        }}
                      >
                        units
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT — Invoice Details Preview */}
              <div
                style={{
                  padding: "1.5rem 2rem",
                  background: "#131313",
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                  overflowY: "auto",
                  minHeight: 0,
                  height: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "rgba(212,168,67,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D4A843"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#E5E2E1",
                        fontSize: "1rem",
                      }}
                    >
                      Invoice Preview
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--gray)" }}>
                      Go to Step 3 to fill details
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                    opacity: 0.5,
                    pointerEvents: "none",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: "var(--gray)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Supplier
                    </label>
                    <div
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        padding: "0.625rem 0.75rem",
                        color: "var(--gray)",
                        fontSize: "0.85rem",
                      }}
                    >
                      Select in Step 3
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          color: "var(--gray)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Invoice Number
                      </label>
                      <div
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          padding: "0.625rem 0.75rem",
                          color: "var(--gray)",
                          fontSize: "0.85rem",
                        }}
                      >
                        Required
                      </div>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          color: "var(--gray)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Delivery Date
                      </label>
                      <div
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          padding: "0.625rem 0.75rem",
                          color: "var(--gray)",
                          fontSize: "0.85rem",
                        }}
                      >
                        Required
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "2rem",
                    padding: "1rem",
                    background: "rgba(212,168,67,0.08)",
                    border: "1px solid rgba(212,168,67,0.2)",
                    borderRadius: "8px",
                    textAlign: "center",
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#D4A843"
                    strokeWidth="2"
                    style={{ margin: "0 auto 0.5rem" }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#D4A843",
                      fontWeight: 600,
                    }}
                  >
                    Navigate to Step 3 to complete invoice details
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Invoice Details ──────────────────────────────────── */}
          {step === 3 && (
            <div
              style={{
                flex: 1,
                display: "grid",
                gridTemplateColumns: "1fr 420px",
                minHeight: 0,
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* LEFT — Stock Summary */}
              <div
                style={{
                  padding: "1.5rem 2rem",
                  overflowY: "auto",
                  background: "#0E0E0E",
                  minHeight: 0,
                  height: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "rgba(212,168,67,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D4A843"
                      strokeWidth="2"
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#E5E2E1",
                        fontSize: "1rem",
                      }}
                    >
                      Stock Summary
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "#D4A843",
                        fontWeight: 600,
                      }}
                    >
                      {selectedMaterials.length} Material
                      {selectedMaterials.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                {selectedMaterials.map((mat, mIdx) => {
                  const rows = (stockRowsByMaterial[mat.id] || []).filter(
                    (r) => (parseInt(r.qty) || 0) > 0,
                  );
                  if (rows.length === 0) return null;
                  const matQty = rows.reduce(
                    (s, r) => s + (parseInt(r.qty) || 0),
                    0,
                  );
                  const matDmg = rows.reduce((s, r) => {
                    const issues = r.damageIssues || {};
                    return (
                      s +
                      Object.values(issues).reduce(
                        (ss, v) => ss + (parseInt(v) || 0),
                        0,
                      )
                    );
                  }, 0);
                  const matGood = matQty - matDmg;
                  return (
                    <div
                      key={mat.id}
                      style={{
                        marginBottom:
                          mIdx < selectedMaterials.length - 1 ? "1.5rem" : 0,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <div
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "4px",
                            background: "rgba(212,168,67,0.15)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#D4A843"
                            strokeWidth="2"
                          >
                            <path d="M20 7h-9" />
                            <path d="M14 17H5" />
                            <circle cx="17" cy="17" r="3" />
                            <circle cx="7" cy="7" r="3" />
                          </svg>
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#E5E2E1",
                              fontSize: "0.8rem",
                            }}
                          >
                            {mat.category} / {mat.name}
                          </div>
                          <div
                            style={{ fontSize: "0.6rem", color: "var(--gray)" }}
                          >
                            {rows.length} variant{rows.length !== 1 ? "s" : ""}{" "}
                            with qty
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          borderRadius: "10px",
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.06)",
                          marginBottom: "0.75rem",
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
                                background: "rgba(0,0,0,0.2)",
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              <th
                                style={{
                                  padding: "0.625rem 0.75rem",
                                  textAlign: "left",
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  color: "var(--gray)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                }}
                              >
                                Variant
                              </th>
                              <th
                                style={{
                                  padding: "0.625rem 0.5rem",
                                  textAlign: "center",
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  color: "var(--gray)",
                                  textTransform: "uppercase",
                                  width: "60px",
                                }}
                              >
                                Qty
                              </th>
                              <th
                                style={{
                                  padding: "0.625rem 0.5rem",
                                  textAlign: "center",
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  color: "var(--gray)",
                                  textTransform: "uppercase",
                                  width: "60px",
                                }}
                              >
                                BO
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, idx) => (
                              <tr
                                key={row.materialId}
                                style={{
                                  borderBottom:
                                    idx < rows.length - 1
                                      ? "1px solid rgba(255,255,255,0.03)"
                                      : "none",
                                }}
                              >
                                <td style={{ padding: "0.625rem 0.75rem" }}>
                                  <div
                                    style={{
                                      fontWeight: 600,
                                      color: "#E5E2E1",
                                      fontSize: "0.75rem",
                                    }}
                                  >
                                    {row.variantLabel}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.55rem",
                                      color: "var(--gray)",
                                      fontFamily: "monospace",
                                    }}
                                  >
                                    SKU: {row.sku || "—"}
                                  </div>
                                </td>
                                <td
                                  style={{
                                    padding: "0.625rem 0.5rem",
                                    textAlign: "center",
                                    color: "#D4A843",
                                    fontWeight: 700,
                                  }}
                                >
                                  {parseInt(row.qty) || 0}
                                </td>
                                <td
                                  style={{
                                    padding: "0.625rem 0.5rem",
                                    textAlign: "center",
                                    color: (() => {
                                      const issues = row.damageIssues || {};
                                      const total = Object.values(
                                        issues,
                                      ).reduce(
                                        (s, v) => s + (parseInt(v) || 0),
                                        0,
                                      );
                                      return total > 0
                                        ? "#F87171"
                                        : "var(--gray)";
                                    })(),
                                    fontWeight: 600,
                                  }}
                                >
                                  {(() => {
                                    const issues = row.damageIssues || {};
                                    return Object.values(issues).reduce(
                                      (s, v) => s + (parseInt(v) || 0),
                                      0,
                                    );
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {selectedMaterials.filter((m) =>
                        (stockRowsByMaterial[m.id] || []).some(
                          (r) => (parseInt(r.qty) || 0) > 0,
                        ),
                      ).length > 1 && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "0.5rem",
                          }}
                        >
                          <div
                            style={{
                              padding: "0.5rem",
                              background: "rgba(255,255,255,0.03)",
                              borderRadius: "6px",
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "0.55rem",
                                color: "var(--gray)",
                                textTransform: "uppercase",
                              }}
                            >
                              Good
                            </div>
                            <div
                              style={{
                                fontSize: "0.9rem",
                                fontWeight: 700,
                                color: "#E5E2E1",
                              }}
                            >
                              {matGood}{" "}
                              <span style={{ fontSize: "0.6rem" }}>pcs</span>
                            </div>
                          </div>
                          <div
                            style={{
                              padding: "0.5rem",
                              background: "rgba(248,113,113,0.06)",
                              borderRadius: "6px",
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "0.55rem",
                                color: "var(--gray)",
                                textTransform: "uppercase",
                              }}
                            >
                              Bad Orders
                            </div>
                            <div
                              style={{
                                fontSize: "0.9rem",
                                fontWeight: 700,
                                color: "#F87171",
                              }}
                            >
                              {matDmg}{" "}
                              <span style={{ fontSize: "0.6rem" }}>pcs</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                    marginTop: "1rem",
                  }}
                >
                  <div
                    style={{
                      padding: "1rem",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.62rem",
                        color: "var(--gray)",
                        textTransform: "uppercase",
                        marginBottom: "0.35rem",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                      }}
                    >
                      Total Effective Qty
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 800,
                        color: "#E5E2E1",
                      }}
                    >
                      {totalGood}{" "}
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 500,
                          color: "var(--gray)",
                        }}
                      >
                        units
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "1rem",
                      background: "rgba(248,113,113,0.06)",
                      border: "1px solid rgba(248,113,113,0.2)",
                      borderRadius: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.62rem",
                        color: "var(--gray)",
                        textTransform: "uppercase",
                        marginBottom: "0.35rem",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                      }}
                    >
                      Bad Orders
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 800,
                        color: "#F87171",
                      }}
                    >
                      {totalDamaged}{" "}
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 500,
                          color: "var(--gray)",
                        }}
                      >
                        units
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT — Invoice Details */}
              <div
                style={{
                  padding: "1.5rem 1.5rem",
                  background: "#131313",
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                  overflowY: "auto",
                  minHeight: 0,
                  height: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "rgba(212,168,67,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D4A843"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#E5E2E1",
                        fontSize: "1rem",
                      }}
                    >
                      Step 3: Invoice Details
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.25rem",
                  }}
                >
                  {/* Vendor */}
                  <div>
                    <label
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: "var(--gray)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        display: "block",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Vendor
                    </label>
                    <VendorCombobox
                      value={invoice.vendorId}
                      vendorName={invoice.vendorName}
                      onChange={(id, name) =>
                        setInvoice((p) => ({
                          ...p,
                          vendorId: id,
                          vendorName: name,
                        }))
                      }
                      vendors={vendors}
                      selectedCategories={categoriesWithQty}
                      onAddNew={() => {
                        if (onAddVendor) {
                          onAddVendor(categoriesWithQty);
                        }
                      }}
                    />
                    {categoriesWithQty.length > 0 && (
                      <div
                        style={{
                          fontSize: "0.62rem",
                          color: "var(--gray)",
                          marginTop: "0.4rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4M12 8h.01" />
                        </svg>
                        Showing vendors for:{" "}
                        <span style={{ color: "#D4A843", fontWeight: 600 }}>
                          {categoriesWithQty.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Invoice # & Date */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          color: "var(--gray)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          display: "block",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Invoice / OR Number{" "}
                        <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={invoice.invoiceNumber}
                        onChange={(e) =>
                          setInvoice((p) => ({
                            ...p,
                            invoiceNumber: e.target.value.slice(0, 50),
                          }))
                        }
                        placeholder="INV-2024-001"
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          color: "#E5E2E1",
                          fontSize: "0.85rem",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          color: "var(--gray)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          display: "block",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Delivery Date{" "}
                        <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        type="date"
                        value={invoice.deliveryDate}
                        onChange={(e) =>
                          setInvoice((p) => ({
                            ...p,
                            deliveryDate: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          color: "#E5E2E1",
                          fontSize: "0.85rem",
                          outline: "none",
                          colorScheme: "dark",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                  {/* Per-material cost inputs */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.5rem",
                    }}
                  >
                    {selectedMaterials.map((mat) => {
                      const rows = (stockRowsByMaterial[mat.id] || []).filter(
                        (r) => (parseInt(r.qty) || 0) > 0,
                      );
                      if (rows.length === 0) return null;
                      const mode = materialCostModes[mat.id] || "unit";
                      const totalAmt = materialTotalAmounts[mat.id] || "";
                      const totalQty = rows.reduce(
                        (s, r) => s + (parseInt(r.qty) || 0),
                        0,
                      );
                      const computedUnitCost =
                        totalQty > 0 && totalAmt
                          ? (parseFloat(totalAmt.replace(/,/g, "")) || 0) /
                            totalQty
                          : 0;
                      return (
                        <div key={mat.id}>
                          <div
                            style={{
                              fontSize: "0.65rem",
                              color: "#D4A843",
                              fontWeight: 600,
                              marginBottom: "0.5rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.4rem",
                            }}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M20 7h-9" />
                              <path d="M14 17H5" />
                              <circle cx="17" cy="17" r="3" />
                              <circle cx="7" cy="7" r="3" />
                            </svg>
                            {mat.category} / {mat.name}
                          </div>
                          <div
                            style={{
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: "8px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0.5rem 0.75rem",
                                background: "rgba(0,0,0,0.15)",
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.04)",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  color: "var(--gray)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.08em",
                                }}
                              >
                                Cost Mode
                              </span>
                              <div
                                style={{
                                  display: "flex",
                                  background: "rgba(0,0,0,0.3)",
                                  borderRadius: "6px",
                                  padding: "2px",
                                }}
                              >
                                {[
                                  ["unit", "Unit"],
                                  ["total", "Total"],
                                ].map(([val, label]) => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() =>
                                      setMaterialCostModes((p) => ({
                                        ...p,
                                        [mat.id]: val,
                                      }))
                                    }
                                    style={{
                                      padding: "0.25rem 0.5rem",
                                      fontSize: "0.6rem",
                                      fontWeight: 700,
                                      borderRadius: "4px",
                                      border: "none",
                                      cursor: "pointer",
                                      background:
                                        mode === val
                                          ? "#D4A843"
                                          : "transparent",
                                      color:
                                        mode === val ? "#000" : "var(--gray)",
                                      transition: "all 0.15s",
                                    }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {mode === "total" ? (
                              <div
                                style={{
                                  padding: "0.75rem",
                                  background: "rgba(212,168,67,0.05)",
                                }}
                              >
                                <label
                                  style={{
                                    fontSize: "0.6rem",
                                    color: "var(--gray)",
                                    textTransform: "uppercase",
                                    display: "block",
                                    marginBottom: "0.4rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  Total Amount
                                </label>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "1.1rem",
                                      color: "#D4A843",
                                      fontWeight: 800,
                                    }}
                                  >
                                    ₱
                                  </span>
                                  <CommaNumberInput
                                    value={totalAmt}
                                    onChange={(e) => {
                                      const val = typeof e === 'string' ? e : e?.target?.value ?? e;
                                      setMaterialTotalAmounts((p) => ({
                                        ...p,
                                        [mat.id]: val,
                                      }));
                                    }}
                                    placeholder="0.00"
                                    style={{
                                      fontSize: "1.1rem",
                                      fontWeight: 800,
                                      color: "#E5E2E1",
                                      flex: 1,
                                    }}
                                  />
                                </div>
                                {computedUnitCost > 0 && (
                                  <div
                                    style={{
                                      fontSize: "0.65rem",
                                      color: "var(--gray)",
                                      marginTop: "0.5rem",
                                      paddingTop: "0.5rem",
                                      borderTop:
                                        "1px solid rgba(255,255,255,0.06)",
                                    }}
                                  >
                                    Unit Cost:{" "}
                                    <strong style={{ color: "#D4A843" }}>
                                      {formatPrice(computedUnitCost)}
                                    </strong>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                {rows.length > 1 && (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "0.5rem",
                                      padding: "0.75rem",
                                      borderBottom:
                                        "1px solid rgba(255,255,255,0.04)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        flex: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.5rem",
                                        background: "rgba(255,255,255,0.06)",
                                        padding: "0.4rem 0.6rem",
                                        borderRadius: "6px",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: "0.8rem",
                                          color: "#D4A843",
                                          fontWeight: 700,
                                        }}
                                      >
                                        ₱
                                      </span>
                                      <DecimalInput
                                        value={applyAllCostByMaterial[mat.id] || ""}
                                        onChange={(e) => setApplyAllCostByMaterial((p) => ({ ...p, [mat.id]: e.target.value }))}
                                        placeholder="0.00"
                                        style={{
                                          flex: 1,
                                          background: "none",
                                          border: "none",
                                          color: "var(--white)",
                                          fontSize: "0.8rem",
                                          outline: "none",
                                        }}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const allMatRows =
                                          stockRowsByMaterial[mat.id] || [];
                                        const costVal = applyAllCostByMaterial[mat.id] || "";
                                        const updated = allMatRows.map((r) => ({
                                          ...r,
                                          unitCost: costVal,
                                        }));
                                        setStockRowsByMaterial((p) => ({
                                          ...p,
                                          [mat.id]: updated,
                                        }));
                                      }}
                                      style={{
                                        background: "rgba(212,168,67,0.15)",
                                        border:
                                          "1px solid rgba(212,168,67,0.4)",
                                        color: "#D4A843",
                                        borderRadius: "6px",
                                        padding: "0 0.65rem",
                                        fontSize: "0.65rem",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Apply All
                                    </button>
                                  </div>
                                )}
                                {rows.map((row) => {
                                  const qty = parseInt(row.qty) || 0;
                                  const cost = parseFloat(row.unitCost) || 0;
                                  const subtotal = qty * cost;
                                  const allMatRows =
                                    stockRowsByMaterial[mat.id] || [];
                                  const origIdx = allMatRows.findIndex(
                                    (r) => r.materialId === row.materialId,
                                  );
                                  return (
                                    <div
                                      key={row.materialId}
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 80px 80px",
                                        padding: "0.625rem 0.75rem",
                                        borderTop:
                                          "1px solid rgba(255,255,255,0.04)",
                                        alignItems: "center",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: "0.8rem",
                                          color: "var(--white)",
                                          fontWeight: 500,
                                        }}
                                      >
                                        {row.variantLabel}
                                      </span>
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "0.25rem",
                                          background: "rgba(255,255,255,0.06)",
                                          padding: "0.35rem 0.5rem",
                                          borderRadius: "6px",
                                          justifyContent: "center",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "0.7rem",
                                            color: "#D4A843",
                                            fontWeight: 700,
                                          }}
                                        >
                                          ₱
                                        </span>
                                        <DecimalInput
                                          value={row.unitCost}
                                          onChange={(e) => {
                                            const val = typeof e === 'string' ? e : e?.target?.value ?? e;
                                            if (origIdx >= 0) {
                                              const n = [...allMatRows];
                                              n[origIdx] = {
                                                ...row,
                                                unitCost: val,
                                              };
                                              setStockRowsByMaterial((p) => ({
                                                ...p,
                                                [mat.id]: n,
                                              }));
                                            }
                                          }}
                                          placeholder="0.00"
                                          style={{
                                            width: "50px",
                                            background: "none",
                                            border: "none",
                                            color: "var(--white)",
                                            fontSize: "0.8rem",
                                            textAlign: "center",
                                            outline: "none",
                                          }}
                                        />
                                      </div>
                                      <span
                                        style={{
                                          textAlign: "center",
                                          fontSize: "0.8rem",
                                          color:
                                            subtotal > 0
                                              ? "#FACC15"
                                              : "var(--gray)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {subtotal > 0
                                          ? formatPrice(subtotal)
                                          : "—"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Receipt upload */}
                <div style={{ marginTop: "1.5rem" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      color: "var(--gray)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Proof of Purchase / Receipt{" "}
                    <span style={{ fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      padding: "1.25rem",
                      border: "2px dashed rgba(255,255,255,0.15)",
                      borderRadius: "10px",
                      background: "rgba(0,0,0,0.15)",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#D4A843";
                      e.currentTarget.style.background =
                        "rgba(212,168,67,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor =
                        "rgba(255,255,255,0.15)";
                      e.currentTarget.style.background = "rgba(0,0,0,0.15)";
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.08)",
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
                        strokeWidth="1.5"
                        style={{ color: "var(--gray)" }}
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--gray)",
                        fontWeight: 600,
                      }}
                    >
                      {invoice.receiptImage
                        ? "Receipt uploaded"
                        : "Upload Receipt Image"}
                    </span>
                    <span
                      style={{
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--gray)",
                      }}
                    >
                      JPG, PNG up to 5MB
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          setInfoModal({
                            title: "File Too Large",
                            message: "Receipt must be under 5MB.",
                          });
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = (ev) =>
                          setInvoice((p) => ({
                            ...p,
                            receiptImage: ev.target.result,
                          }));
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {invoice.receiptImage && (
                    <div style={{ position: "relative", marginTop: "0.5rem" }}>
                      <Image
                        src={invoice.receiptImage}
                        alt="Receipt"
                        fill
                        style={{
                          maxHeight: "100px",
                          maxWidth: "100%",
                          objectFit: "contain",
                          borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          display: "block",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setInvoice((p) => ({ ...p, receiptImage: null }))
                        }
                        style={{
                          position: "absolute",
                          top: "-6px",
                          right: "-6px",
                          background: "#ef4444",
                          border: "none",
                          borderRadius: "50%",
                          width: "22px",
                          height: "22px",
                          cursor: "pointer",
                          color: "#fff",
                          fontSize: "0.85rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                {/* Receipt summary */}
                {totalInvoiceValue > 0 && (
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: "1rem",
                      background: "rgba(212,168,67,0.08)",
                      border: "1px solid rgba(212,168,67,0.25)",
                      borderRadius: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#D4A843"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#D4A843",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Receipt Summary
                      </span>
                    </div>
                    {selectedMaterials.length > 1 && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.75rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        {selectedMaterials.map((mat) => {
                          const rows = (
                            stockRowsByMaterial[mat.id] || []
                          ).filter((r) => (parseInt(r.qty) || 0) > 0);
                          if (rows.length === 0) return null;
                          const mode = materialCostModes[mat.id] || "unit";
                          const totalAmt = materialTotalAmounts[mat.id] || "";
                          const totalQty = rows.reduce(
                            (s, r) => s + (parseInt(r.qty) || 0),
                            0,
                          );
                          let subtotal = 0,
                            displayUnit = null;
                          if (mode === "total" && totalAmt) {
                            subtotal =
                              parseFloat(totalAmt.replace(/,/g, "")) || 0;
                            displayUnit =
                              totalQty > 0 ? subtotal / totalQty : 0;
                          } else {
                            subtotal = rows.reduce(
                              (s, r) =>
                                s +
                                (parseInt(r.qty) || 0) *
                                  (parseFloat(r.unitCost) || 0),
                              0,
                            );
                            const costs = rows.map(
                              (r) => parseFloat(r.unitCost) || 0,
                            );
                            displayUnit = costs.every((c) => c === costs[0])
                              ? costs[0]
                              : null;
                          }
                          return (
                            <div
                              key={mat.id}
                              style={{
                                padding: "0.75rem",
                                background: "rgba(0,0,0,0.2)",
                                borderRadius: "8px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "#E5E2E1",
                                  fontWeight: 600,
                                  marginBottom: "0.5rem",
                                }}
                              >
                                {mat.name}
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr 1fr",
                                  gap: "0.5rem",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.55rem",
                                      color: "var(--gray)",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    Total Qty
                                  </div>
                                  <div
                                    style={{
                                      color: "#D4A843",
                                      fontWeight: 700,
                                      fontSize: "0.75rem",
                                    }}
                                  >
                                    {totalQty}{" "}
                                    <span
                                      style={{
                                        fontWeight: 400,
                                        color: "var(--gray)",
                                      }}
                                    >
                                      pcs
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.55rem",
                                      color: "var(--gray)",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    Unit Cost
                                  </div>
                                  <div
                                    style={{
                                      color: "#D4A843",
                                      fontWeight: 700,
                                      fontSize: "0.75rem",
                                    }}
                                  >
                                    {displayUnit !== null ? (
                                      formatPrice(displayUnit)
                                    ) : (
                                      <span
                                        style={{
                                          fontSize: "0.6rem",
                                          color: "var(--gray)",
                                        }}
                                      >
                                        Varies
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.55rem",
                                      color: "var(--gray)",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    Subtotal
                                  </div>
                                  <div
                                    style={{
                                      color: "#facc15",
                                      fontWeight: 700,
                                      fontSize: "0.75rem",
                                    }}
                                  >
                                    {formatPrice(subtotal)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem 0",
                        borderTop:
                          selectedMaterials.length > 1
                            ? "1px solid rgba(212,168,67,0.3)"
                            : "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--gray)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                        }}
                      >
                        Total Invoice Amount
                      </span>
                      <span
                        style={{
                          fontSize: "0.9rem",
                          color: "#facc15",
                          fontWeight: 800,
                        }}
                      >
                        {formatPrice(totalInvoiceValue)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer (fixed) ─────────────────────────────────────────────── */}
        <div
          style={{
            padding: "1rem 2rem",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "#131313",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {step > 1 && (
              <button
                onClick={step === 3 ? handleBackToStep2 : handleBackToStep1}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "var(--white)",
                  borderRadius: "8px",
                  padding: "0.625rem 1rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
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
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "var(--gray)",
                borderRadius: "8px",
                padding: "0.625rem 1rem",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(239,68,68,0.1)";
                e.currentTarget.style.color = "#ef4444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "var(--gray)";
              }}
            >
              {step === 3 ? "Discard" : "Cancel"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {step === 3 && totalInvoiceValue > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  fontSize: "0.75rem",
                }}
              >
                <span style={{ color: "var(--gray)" }}>
                  Effective:{" "}
                  <strong style={{ color: "#FACC15" }}>
                    {formatPrice(effectiveValue)}
                  </strong>
                </span>
                <span style={{ color: "var(--gray)" }}>
                  Receipt Total:{" "}
                  <strong style={{ color: "#FACC15" }}>
                    {formatPrice(totalInvoiceValue)}
                  </strong>
                </span>
              </div>
            )}
            {step < 3 ? (
              <button
                onClick={goNext}
                disabled={
                  (step === 1 && !step1Valid) || (step === 2 && !step2Valid())
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background:
                    (step === 1 && !step1Valid) || (step === 2 && !step2Valid())
                      ? "rgba(255,255,255,0.1)"
                      : "linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)",
                  border: "none",
                  color:
                    (step === 1 && !step1Valid) || (step === 2 && !step2Valid())
                      ? "var(--gray)"
                      : "#000",
                  borderRadius: "8px",
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor:
                    (step === 1 && !step1Valid) || (step === 2 && !step2Valid())
                      ? "not-allowed"
                      : "pointer",
                  boxShadow:
                    (step === 1 && !step1Valid) || (step === 2 && !step2Valid())
                      ? "none"
                      : "0 0 16px rgba(212,168,67,0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (
                    !(
                      (step === 1 && !step1Valid) ||
                      (step === 2 && !step2Valid())
                    )
                  )
                    e.currentTarget.style.transform = "scale(1.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                Next
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!step3Valid()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: step3Valid()
                    ? "linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)"
                    : "rgba(255,255,255,0.1)",
                  border: "none",
                  color: step3Valid() ? "#000" : "var(--gray)",
                  borderRadius: "8px",
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: step3Valid() ? "pointer" : "not-allowed",
                  boxShadow: step3Valid()
                    ? "0 0 16px rgba(212,168,67,0.3)"
                    : "none",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (step3Valid())
                    e.currentTarget.style.transform = "scale(1.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                Save Stock-In
              </button>
            )}
          </div>
        </div>
      </div>

      <BadOrderIssuesPopover
        isOpen={issuePopoverOpen}
        onClose={() => {
          setIssuePopoverOpen(false);
          setIssuePopoverTarget(null);
        }}
        damageIssues={
          issuePopoverTarget
            ? stockRowsByMaterial[issuePopoverTarget.materialId]?.[
                issuePopoverTarget.rowIndex
              ]?.damageIssues || {
                damaged: "",
                shortage: "",
                defective: "",
                wrong_item: "",
              }
            : { damaged: "", shortage: "", defective: "", wrong_item: "" }
        }
        onChange={(newIssues) => {
          if (!issuePopoverTarget) return;
          const matRows =
            stockRowsByMaterial[issuePopoverTarget.materialId] || [];
          const updatedRows = [...matRows];
          updatedRows[issuePopoverTarget.rowIndex] = {
            ...updatedRows[issuePopoverTarget.rowIndex],
            damageIssues: newIssues,
          };
          setStockRowsByMaterial({
            ...stockRowsByMaterial,
            [issuePopoverTarget.materialId]: updatedRows,
          });
        }}
        qtyReceived={
          issuePopoverTarget
            ? parseInt(
                stockRowsByMaterial[issuePopoverTarget.materialId]?.[
                  issuePopoverTarget.rowIndex
                ]?.qty,
              ) || 0
            : 0
        }
      />

      <InfoModal
        isOpen={!!infoModal}
        onClose={() => setInfoModal(null)}
        title={infoModal?.title || ""}
        message={infoModal?.message || ""}
      />
    </div>
  );
}
