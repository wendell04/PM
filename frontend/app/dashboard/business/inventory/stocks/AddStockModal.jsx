"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export const DAMAGE_TYPES = [
  { id: "damaged", label: "Damaged" },
  { id: "shortage", label: "Shortage" },
  { id: "defective", label: "Defective" },
  { id: "wrong_item", label: "Wrong Item Shipped" },
];

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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
            <div style={{ fontWeight: 600, color: "var(--white)", fontSize: "1rem" }}>
              {group.category}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--gray)", marginTop: "0.1rem" }}>
              {group.materials.length} material{group.materials.length !== 1 ? "s" : ""}
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
                  <div style={{ fontSize: "0.65rem", color: "var(--gray)", marginTop: "0.1rem" }}>
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
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
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

function InfoModal({ isOpen, onClose, title, message }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "440px" }}
      >
        <div className="modal-header">
          <h2 className="modal-title" style={{ fontSize: "1rem" }}>
            {title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function BadOrderIssuesPopover({ isOpen, onClose, damageIssues, onChange, qtyReceived }) {
  if (!isOpen) return null;
  const setField = (id, v) => {
    onChange({ ...damageIssues, [id]: v });
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "#141414",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.1)",
          padding: "1.25rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, marginBottom: "1rem", color: "#E5E2E1" }}>
          Issues / Bad orders
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {DAMAGE_TYPES.map((dt) => (
            <div key={dt.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: "0.8rem", color: "var(--gray)" }}>
                {dt.label}
              </span>
              <div style={{ width: "80px" }}>
                <IntegerInput
                  value={damageIssues[dt.id] ?? ""}
                  onChange={(e) => setField(dt.id, e.target.value)}
                  min={0}
                  max={qtyReceived || undefined}
                  qtyValue={qtyReceived ? String(qtyReceived) : undefined}
                  placeholder="0"
                />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "none",
              background: "#D4A843",
              color: "#000",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AddStockModal({
  isOpen,
  onClose,
  onSave,
  materials,
  vendors,
  onAddVendor,
}) {
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [stockRowsByMaterial, setStockRowsByMaterial] = useState({});
  const [applyAllCost, setApplyAllCost] = useState("");
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
  const [issuePopoverTarget, setIssuePopoverTarget] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSearch("");
    setSelectedMaterials([]);
    setStockRowsByMaterial({});
    setApplyAllCost("");
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

  const generateRows = (mat) => {
    if (!mat.hasVariants) {
      return [
        {
          materialId: mat._id,
          variantLabel: mat.name,
          sku: mat.sku || "",
          uom: mat.uom || "pcs",
          qty: "",
          damageIssues: { damaged: "", shortage: "", defective: "", wrong_item: "" },
          unitCost: mat.baseCost != null && mat.baseCost > 0 ? String(mat.baseCost) : "",
          minStockLevel: String(mat.minStock || 10),
        },
      ];
    }
    const children = materials.filter((c) => c.parentId === mat._id);
    if (children.length === 0) {
      return [
        {
          materialId: mat._id,
          variantLabel: mat.name + " (Parent)",
          sku: mat.sku || "",
          uom: mat.uom || "pcs",
          qty: "",
          damageIssues: { damaged: "", shortage: "", defective: "", wrong_item: "" },
          unitCost: mat.baseCost != null && mat.baseCost > 0 ? String(mat.baseCost) : "",
          minStockLevel: "10",
        },
      ];
    }
    return children.map((c) => ({
      materialId: c._id,
      variantLabel: c.name,
      sku: c.sku || "",
      uom: c.uom || mat.uom || "pcs",
      qty: "",
      damageIssues: { damaged: "", shortage: "", defective: "", wrong_item: "" },
      unitCost:
        c.baseCost != null && c.baseCost > 0
          ? String(c.baseCost)
          : mat.baseCost != null && mat.baseCost > 0
            ? String(mat.baseCost)
            : "",
      minStockLevel: String(c.minStock || mat.minStock || 10),
    }));
  };

  const totalReceived = selectedMaterials.reduce((sum, m) => {
    const rows = stockRowsByMaterial[m.id] || [];
    return sum + rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  }, 0);

  const totalDamaged = selectedMaterials.reduce((sum, m) => {
    const rows = stockRowsByMaterial[m.id] || [];
    return sum + rows.reduce((s, r) => {
      const issues = r.damageIssues || {};
      return s + Object.values(issues).reduce((ss, v) => ss + (parseInt(v) || 0), 0);
    }, 0);
  }, 0);

  const totalGood = totalReceived - totalDamaged;

  const categoriesWithQty = useMemo(() => {
    const cats = selectedMaterials
      .filter((m) =>
        (stockRowsByMaterial[m.id] || []).some((r) => (parseInt(r.qty) || 0) > 0),
      )
      .map((m) => m.category);
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
        rows.reduce((s, r) => s + (parseInt(r.qty) || 0) * (parseFloat(r.unitCost) || 0), 0)
      );
    }, 0);
  }, [selectedMaterials, stockRowsByMaterial, materialCostModes, materialTotalAmounts]);

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
        unitCost = totalQty > 0 ? (parseFloat(totalAmt.replace(/,/g, "")) || 0) / totalQty : 0;
      }
      return (
        sum +
        rows.reduce((s, r) => {
          const issues = r.damageIssues || {};
          const totalBO = Object.values(issues).reduce((ss, v) => ss + (parseInt(v) || 0), 0);
          const good = Math.max(0, (parseInt(r.qty) || 0) - totalBO);
          const cost = mode === "total" ? unitCost : parseFloat(r.unitCost) || 0;
          return s + good * cost;
        }, 0)
      );
    }, 0);
  }, [selectedMaterials, stockRowsByMaterial, materialCostModes, materialTotalAmounts]);

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
            const c = mode === "total" ? productUnitCost : parseFloat(r.unitCost) || 0;
            const label = DAMAGE_TYPES.find((dt) => dt.id === type)?.label || type;
            return `${d}x${label}(${formatPrice(d * c)})`;
          });
      });
    });
    return parts.join("  ");
  }, [selectedMaterials, stockRowsByMaterial, materialCostModes, materialTotalAmounts, totalDamaged]);

  const step1Valid = selectedMaterials.length > 0;
  const totalMaterialQty = totalReceived;

  const step2Valid = () =>
    selectedMaterials.some((m) =>
      (stockRowsByMaterial[m.id] || []).some((r) => (parseInt(r.qty) || 0) > 0),
    );

  const step3Valid = () => {
    if (!invoice.invoiceNumber?.trim()) return false;
    if (!invoice.deliveryDate) return false;
    for (const m of selectedMaterials) {
      const rows = (stockRowsByMaterial[m.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      if (rows.length === 0) continue;
      const mode = materialCostModes[m.id] || "unit";
      const totalAmt = materialTotalAmounts[m.id] || "";
      if (mode === "total") {
        const v = parseFloat(String(totalAmt).replace(/,/g, "")) || 0;
        if (v <= 0) return false;
      } else {
        for (const r of rows) {
          if (!(parseFloat(r.unitCost) > 0)) return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = () => {
    if (!step1Valid) {
      setInfoModal({ title: "Validation Error", message: "Select at least one material." });
      return;
    }
    if (!step2Valid()) {
      setInfoModal({ title: "Validation Error", message: "Enter received quantity for at least one item." });
      return;
    }
    if (!step3Valid()) {
      setInfoModal({
        title: "Validation Error",
        message: "Complete all required invoice fields (invoice number, delivery date, and cost).",
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
        const totalBO = Object.values(issues).reduce((s, v) => s + (parseInt(v) || 0), 0);
        const good = received - totalBO;
        const unitCost = mode === "total" ? computedUnitCost : parseFloat(r.unitCost) || 0;

        const badOrders = [];
        Object.entries(issues).forEach(([type, val]) => {
          const qty = parseInt(val) || 0;
          if (qty > 0) {
            const label = DAMAGE_TYPES.find((dt) => dt.id === type)?.label || type;
            badOrders.push({ type, label, qty, unitCost, totalValue: qty * unitCost });
          }
        });

        return {
          inventoryId: r.materialId,
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

    if (invoice.vendorId && categoriesWithQty.length > 0) {
      const vendor = vendors.find((v) => v.id === invoice.vendorId);
      if (vendor) {
        const vItems = vendor.itemsSupplied || [];
        const existingItemNames = vItems.map((item) =>
          typeof item === "string" ? item.toLowerCase() : (item.name || "").toLowerCase(),
        );
        const missingCats = categoriesWithQty.filter(
          (cat) => !existingItemNames.includes(cat.toLowerCase()),
        );
        if (missingCats.length > 0) {
          const updatedVendors = vendors.map((v) =>
            v._id === vendor._id
              ? {
                  ...v,
                  itemsSupplied: [
                    ...new Set([...vItems, ...missingCats.map((cat) => ({ name: cat, uom: "pcs" }))]),
                  ],
                }
              : v,
          );
        }
      }
    }

    onSave(stockData);
    onClose();
  };

  const goNext = () => {
    if (step === 1) {
      if (!step1Valid) {
        setInfoModal({ title: "Validation Error", message: "Select at least one material." });
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!step2Valid()) {
        setInfoModal({ title: "Validation Error", message: "Enter received quantity for at least one item." });
        return;
      }
      setStep(3);
    }
  };

  const handleBackToStep1 = () => setStep(1);
  const handleBackToStep2 = () => setStep(2);

  const toggleCategory = (cat) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  if (!isOpen) return null;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.65)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
        onClick={onClose}
      >
        {/* Modal card */}
        <div
          style={{
            width: "100%",
            maxWidth: "960px",
            maxHeight: "90vh",
            background: "#0a0a0a",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
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
                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#E5E2E1", margin: 0 }}>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Selected:{" "}
                    <span style={{ color: "#D4A843", fontWeight: 600 }}>
                      {selectedMaterials.length} material{selectedMaterials.length !== 1 ? "s" : ""}
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                      background: "linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)",
                      zIndex: 1,
                      borderRadius: "2px",
                      transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: seg.valid ? "0 0 12px rgba(212,168,67,0.4)" : "none",
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
                  s.num === 1 ? step1Valid : s.num === 2 ? step2Valid() : step3Valid();
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
                        color: isComplete ? "#000" : isCurrent ? "#D4A843" : "var(--gray)",
                        border: isCurrent ? "2px solid #D4A843" : "2px solid transparent",
                        transition: "all 0.3s ease",
                        boxShadow: isCurrent ? "0 0 16px rgba(212,168,67,0.4)" : "none",
                        transform: isCurrent ? "scale(1.08)" : "scale(1)",
                      }}
                    >
                      {isComplete ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{s.num}</span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.12em",
                        fontWeight: 600,
                        color: isComplete || isCurrent ? "#D4A843" : "var(--gray)",
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
          {/* ── END Header ── */}

          {/* ── Body ── */}
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
            {/* STEP 1 */}
            {step === 1 && (
              <div style={{ flex: 1, overflow: "auto", padding: "1.25rem" }}>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                      {groupedByCategory
                        .filter((_, i) => i % 2 === 0)
                        .map((group) => (
                          <CategoryCard
                            key={`left-${group.category}`}
                            group={group}
                            isExpanded={!!expandedCategories[group.category]}
                            onToggle={() => toggleCategory(group.category)}
                            selectedMaterials={selectedMaterials}
                            onToggleMaterial={(m, isSelected) => {
                              if (isSelected) {
                                setSelectedMaterials((prev) => prev.filter((s) => s.id !== m.id));
                                const n = { ...stockRowsByMaterial };
                                delete n[m.id];
                                setStockRowsByMaterial(n);
                              } else {
                                setSelectedMaterials([...selectedMaterials, m]);
                                setStockRowsByMaterial({ ...stockRowsByMaterial, [m.id]: generateRows(m) });
                              }
                            }}
                          />
                        ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                      {groupedByCategory
                        .filter((_, i) => i % 2 === 1)
                        .map((group) => (
                          <CategoryCard
                            key={`right-${group.category}`}
                            group={group}
                            isExpanded={!!expandedCategories[group.category]}
                            onToggle={() => toggleCategory(group.category)}
                            selectedMaterials={selectedMaterials}
                            onToggleMaterial={(m, isSelected) => {
                              if (isSelected) {
                                setSelectedMaterials((prev) => prev.filter((s) => s.id !== m.id));
                                const n = { ...stockRowsByMaterial };
                                delete n[m.id];
                                setStockRowsByMaterial(n);
                              } else {
                                setSelectedMaterials([...selectedMaterials, m]);
                                setStockRowsByMaterial({ ...stockRowsByMaterial, [m.id]: generateRows(m) });
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
                    Select one or more materials to receive. All variant combinations will be shown automatically.
                  </p>
                )}
              </div>
            )}

            {/* STEP 2 */}
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
                {/* LEFT */}
                <div
                  style={{
                    minHeight: 0,
                    overflowY: "auto",
                    padding: "1rem 1.25rem",
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.62rem",
                      color: "var(--gray)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "1rem",
                    }}
                  >
                    Total qty (all materials):{" "}
                    <span style={{ color: "#D4A843", fontWeight: 700 }}>{totalMaterialQty}</span> pcs
                  </div>
                  {selectedMaterials.map((mat) => {
                    const rows = stockRowsByMaterial[mat.id] || [];
                    let matGood = 0;
                    let matDmg = 0;
                    rows.forEach((r) => {
                      const q = parseInt(r.qty) || 0;
                      const issues = r.damageIssues || {};
                      const bo = Object.values(issues).reduce((s, v) => s + (parseInt(v) || 0), 0);
                      matDmg += bo;
                      matGood += Math.max(0, q - bo);
                    });
                    return (
                      <div key={mat.id} style={{ marginBottom: "1.25rem" }}>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: "#E5E2E1",
                            marginBottom: "0.75rem",
                          }}
                        >
                          {mat.name}
                        </div>
                        <div
                          style={{
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: "12px",
                            overflow: "hidden",
                            border: "1px solid rgba(255,255,255,0.08)",
                            marginBottom: "1rem",
                          }}
                        >
                          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                            <thead>
                              <tr style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                <th style={{ padding: "0.875rem 1rem", textAlign: "left", fontSize: "0.65rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.08em", width: "auto" }}>
                                  Variant Name
                                </th>
                                <th style={{ padding: "0.875rem 0.75rem", textAlign: "center", fontSize: "0.65rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.08em", width: "110px", minWidth: "110px" }}>
                                  Qty Received
                                </th>
                                <th style={{ padding: "0.875rem 0.75rem", textAlign: "center", fontSize: "0.65rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.08em", width: "120px", minWidth: "120px" }}>
                                  Issues / BO
                                  <span style={{ display: "block", fontSize: "0.55rem", fontWeight: 400, color: "var(--gray)", textTransform: "none", marginTop: "0.15rem" }}>
                                    Damaged, Shortage, etc.
                                  </span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, idx) => {
                                const issues = row.damageIssues || {};
                                const totalBO = Object.values(issues).reduce((s, v) => s + (parseInt(v) || 0), 0);
                                return (
                                  <tr
                                    key={row.variantLabel}
                                    style={{
                                      background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                                    }}
                                  >
                                    <td style={{ padding: "1rem" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                        <div>
                                          <div style={{ fontWeight: 600, color: "#E5E2E1", fontSize: "0.85rem" }}>
                                            {row.variantLabel}
                                          </div>
                                          <div style={{ fontSize: "0.65rem", color: "var(--gray)", fontFamily: "monospace", marginTop: "0.1rem" }}>
                                            SKU: {row.sku || "—"}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td style={{ padding: "0.625rem 0.5rem", textAlign: "center", color: "#D4A843", fontWeight: 700 }}>
                                      {parseInt(row.qty) || 0}
                                    </td>
                                    <td
                                      style={{
                                        padding: "0.625rem 0.5rem",
                                        textAlign: "center",
                                        color: totalBO > 0 ? "#F87171" : "var(--gray)",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {totalBO}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {selectedMaterials.filter((m) =>
                          (stockRowsByMaterial[m.id] || []).some((r) => (parseInt(r.qty) || 0) > 0),
                        ).length > 1 && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                            <div style={{ padding: "0.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px", textAlign: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: "var(--gray)", textTransform: "uppercase" }}>Good</div>
                              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#E5E2E1" }}>
                                {matGood} <span style={{ fontSize: "0.6rem" }}>pcs</span>
                              </div>
                            </div>
                            <div style={{ padding: "0.5rem", background: "rgba(248,113,113,0.06)", borderRadius: "6px", textAlign: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: "var(--gray)", textTransform: "uppercase" }}>Bad Orders</div>
                              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#F87171" }}>
                                {matDmg} <span style={{ fontSize: "0.6rem" }}>pcs</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* RIGHT */}
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
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
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
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#E5E2E1", fontSize: "1rem" }}>Invoice Preview</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--gray)" }}>Go to Step 3 to fill details</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem", opacity: 0.5, pointerEvents: "none" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.65rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                        Supplier
                      </label>
                      <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.625rem 0.75rem", color: "var(--gray)", fontSize: "0.85rem" }}>
                        Select in Step 3
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.65rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                          Invoice Number
                        </label>
                        <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.625rem 0.75rem", color: "var(--gray)", fontSize: "0.85rem" }}>
                          Required
                        </div>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.65rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                          Delivery Date
                        </label>
                        <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.625rem 0.75rem", color: "var(--gray)", fontSize: "0.85rem" }}>
                          Required
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: "2rem", padding: "1rem", background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.2)", borderRadius: "8px", textAlign: "center" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2" style={{ margin: "0 auto 0.5rem" }}>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    <div style={{ fontSize: "0.75rem", color: "#D4A843", fontWeight: 600 }}>
                      Navigate to Step 3 to complete invoice details
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
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
                {/* LEFT */}
                <div
                  style={{
                    minHeight: 0,
                    overflowY: "auto",
                    padding: "1rem 1.25rem",
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
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
                      <div style={{ fontSize: "0.62rem", color: "var(--gray)", textTransform: "uppercase", marginBottom: "0.35rem", fontWeight: 600, letterSpacing: "0.08em" }}>
                        Total Effective Qty
                      </div>
                      <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#E5E2E1" }}>
                        {totalGood}{" "}
                        <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--gray)" }}>units</span>
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
                      <div style={{ fontSize: "0.62rem", color: "var(--gray)", textTransform: "uppercase", marginBottom: "0.35rem", fontWeight: 600, letterSpacing: "0.08em" }}>
                        Bad Orders
                      </div>
                      <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#F87171" }}>
                        {totalDamaged}{" "}
                        <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--gray)" }}>units</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT — Invoice Details */}
                <div
                  style={{
                    minHeight: 0,
                    overflowY: "auto",
                    padding: "1rem 1.25rem",
                    background: "#0f0f0f",
                    borderLeft: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.25rem",
                  }}
                >
                  <div style={{ marginTop: "1.5rem" }}>
                    <label style={{ display: "block", fontSize: "0.65rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
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
                        e.currentTarget.style.background = "rgba(212,168,67,0.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                        e.currentTarget.style.background = "rgba(0,0,0,0.15)";
                      }}
                    >
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--gray)" }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--gray)", fontWeight: 600 }}>
                        {invoice.receiptImage ? "Receipt uploaded ✓" : "Upload Receipt Image"}
                      </span>
                      <span style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray)" }}>
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
                            setInfoModal({ title: "File Too Large", message: "Receipt must be under 5MB." });
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) =>
                            setInvoice((p) => ({ ...p, receiptImage: ev.target.result }));
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {invoice.receiptImage && (
                      <div style={{ position: "relative", marginTop: "0.5rem" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={invoice.receiptImage}
                          alt="Receipt"
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
                          onClick={() => setInvoice((p) => ({ ...p, receiptImage: null }))}
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
                </div>
              </div>
            )}
          </div>
          {/* ── END Body ── */}

          {/* ── Footer ── */}
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.75rem" }}>
                  <span style={{ color: "var(--gray)" }}>
                    Effective:{" "}
                    <strong style={{ color: "#FACC15" }}>{formatPrice(effectiveValue)}</strong>
                  </span>
                  <span style={{ color: "var(--gray)" }}>
                    Receipt Total:{" "}
                    <strong style={{ color: "#FACC15" }}>{formatPrice(totalInvoiceValue)}</strong>
                  </span>
                </div>
              )}
              {step < 3 ? (
                <button
                  onClick={goNext}
                  disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid())}
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
                    if (!((step === 1 && !step1Valid) || (step === 2 && !step2Valid())))
                      e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                >
                  Next
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                    boxShadow: step3Valid() ? "0 0 16px rgba(212,168,67,0.3)" : "none",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (step3Valid()) e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                >
                  Save Stock-In
                </button>
              )}
            </div>
          </div>
          {/* ── END Footer ── */}
        </div>
        {/* END Modal card */}
      </div>
      {/* END Overlay */}

      <BadOrderIssuesPopover
        isOpen={issuePopoverOpen}
        onClose={() => {
          setIssuePopoverOpen(false);
          setIssuePopoverTarget(null);
        }}
        damageIssues={
          issuePopoverTarget
            ? stockRowsByMaterial[issuePopoverTarget.materialId]?.[issuePopoverTarget.rowIndex]?.damageIssues ||
              { damaged: "", shortage: "", defective: "", wrong_item: "" }
            : { damaged: "", shortage: "", defective: "", wrong_item: "" }
        }
        onChange={(newIssues) => {
          if (!issuePopoverTarget) return;
          const matRows = stockRowsByMaterial[issuePopoverTarget.materialId] || [];
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
                stockRowsByMaterial[issuePopoverTarget.materialId]?.[issuePopoverTarget.rowIndex]?.qty,
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