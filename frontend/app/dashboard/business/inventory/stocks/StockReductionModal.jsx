"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// ── Custom Dropdown Component (Dark Theme) ────────────────────────────────────
function CustomDropdown({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Update dropdown position when opened
  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 99999,
      });
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "0.75rem 1rem",
          background: "rgba(255,255,255,0.06)",
          border: open
            ? "1px solid rgba(212,168,67,0.5)"
            : "1px solid rgba(255,255,255,0.1)",
          borderRadius: "8px",
          color: selected ? "#E5E2E1" : "var(--gray)",
          fontSize: "0.85rem",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxSizing: "border-box",
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {open && (
        <div
          style={{
            ...dropdownStyle,
            background: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            maxHeight: "240px",
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                padding: "0.625rem 1rem",
                color: opt.value === value ? "#D4A843" : "#E5E2E1",
                background:
                  opt.value === value ? "rgba(212,168,67,0.12)" : "transparent",
                cursor: "pointer",
                fontSize: "0.85rem",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value)
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single  helper — avoids ₱₱ when formatPrice already adds the symbol ─────
function peso(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Base product name extractor (matches NestedInventoryTable) ────────────────
function extractBaseProductName(fullName) {
  const patterns = [
    /\s+[A-Za-z]+\s*\/\s*\d+oz.*$/i,
    /\s+[A-Za-z]+\s*\/\s*\d+ml.*$/i,
    /\s+\d+oz\s*\/.*$/i,
    /\s+\d+ml\s*\/.*$/i,
    /\s+\d+oz$/i,
    /\s+\d+ml$/i,
  ];
  for (const p of patterns) {
    const m = fullName.match(p);
    if (m) return fullName.substring(0, m.index).trim();
  }
  return fullName.trim();
}
function extractVariantName(fullName, base) {
  return fullName
    .replace(base, "")
    .trim()
    .replace(/^[\s\/-]+/, "")
    .trim();
}

// ── Integer Input ─────────────────────────────────────────────────────────────
function IntegerInput({
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
      value={value}
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d+$/.test(v)) {
          const n = v === "" ? 0 : parseInt(v, 10);
          if (max !== undefined && n > max) return;
          if (v !== "" && n < min) return;
          onChange(v);
        }
      }}
      onKeyDown={(e) => {
        if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
      }}
      onWheel={(e) => {
        if (document.activeElement === e.target) e.target.blur();
      }}
    />
  );
}

// ── Decimal Input ─────────────────────────────────────────────────────────────
function DecimalInput({ value, onChange, placeholder, style, disabled }) {
  return (
    <input
      type="text"
      value={value}
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) {
          if ((parseFloat(v) || 0) <= 999999.99) onChange(v);
        }
      }}
      onKeyDown={(e) => {
        if (["e", "E", "+", "-", " "].includes(e.key)) e.preventDefault();
      }}
      onWheel={(e) => {
        if (document.activeElement === e.target) e.target.blur();
      }}
    />
  );
}

// ── Info Modal ────────────────────────────────────────────────────────────────
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

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconWarning = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fbbf24"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ── Constants ─────────────────────────────────────────────────────────────────
const GOLD = "#D4A843";
const GOLD_BG = "rgba(212,168,67,0.12)";
const GOLD_BORDER = "rgba(212,168,67,0.4)";
const inputBase = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#E5E2E1",
  padding: "0.625rem 0.75rem",
  fontSize: "0.85rem",
  outline: "none",
  fontFamily: "inherit",
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function StockReductionModal({
  isOpen,
  onClose,
  onConfirm,
  item,
  items, // array of items for multi-select
  inventory,
  masterlist,
}) {
  const [batchMode, setBatchMode] = useState("fifo"); // 'fifo' | 'pick'
  const [reason, setReason] = useState("sales"); // 'sales' | 'damaged' | 'writeoff'
  const [priceMode, setPriceMode] = useState("unit"); // 'unit' | 'total'
  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [customer, setCustomer] = useState("");
  const [remarks, setRemarks] = useState("");
  const [variants, setVariants] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [variantQtys, setVariantQtys] = useState({}); // { id: '46' }
  const [unitPrices, setUnitPrices] = useState({}); // { id: '35' } - Per variant unit price
  const [totalAmounts, setTotalAmounts] = useState({}); // { id: '5000' } - Per variant total amount
  const [pickedBatches, setPickedBatches] = useState({}); // { variantId: { batchId: '10' } }
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [pending, setPending] = useState(null);
  const [completedSale, setCompletedSale] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(""); // For material selector when no item pre-selected
  const [selectedItem, setSelectedItem] = useState(item); // Internal item state

  // Sync internal item when prop changes
  useEffect(() => {
    // If items array provided (multi-select), use first item as display header
    if (items && items.length > 0) {
      setSelectedItem(items[0]);
    } else {
      setSelectedItem(item);
    }
  }, [item, items]);

  const isSale = reason === "sales";

  // Helper: Get tier price from masterlist based on quantity
  const getTierPriceFromMasterlist = (variantSku, qty) => {
    if (!masterlist || !variantSku) return null;

    // Find the product in masterlist that matches this SKU
    for (const category of masterlist) {
      for (const product of category.products || []) {
        // Check if this product's variants match our SKU pattern
        const catPrefix = category.name.substring(0, 3).toUpperCase();
        const prodPrefix = product.name.substring(0, 3).toUpperCase();
        const skuPrefix = `${catPrefix}-${prodPrefix}-`;

        if (variantSku.startsWith(skuPrefix)) {
          // Found matching product, now check pricing
          if (product.priceType === "tiered" && product.priceTiers) {
            // Find matching tier based on quantity
            for (const tier of product.priceTiers) {
              const minQty = tier.minQty || 0;
              const maxQty = tier.maxQty || Infinity;
              if (qty >= minQty && qty <= maxQty) {
                // Return the price for this variant
                if (tier.prices) {
                  // Try exact SKU match first
                  if (tier.prices[variantSku]) return tier.prices[variantSku];
                  // Try base price
                  if (tier.prices["__base__"]) return tier.prices["__base__"];
                }
              }
            }
          } else if (product.priceType === "fixed" && product.flatPrice) {
            return product.flatPrice;
          }
        }
      }
    }
    return null;
  };

  // Auto-populate price when quantity changes (for FIFO mode)
  useEffect(() => {
    if (!isSale || !masterlist) return;

    selectedIds.forEach((id) => {
      const qty = parseInt(variantQtys[id]) || 0;
      if (qty > 0) {
        const variant = variants.find((v) => v.id === id);
        if (variant) {
          const tierPrice = getTierPriceFromMasterlist(variant.sku, qty);
          if (tierPrice && !unitPrices[id]) {
            // Only auto-fill if user hasn't manually set a price
            setUnitPrices((prev) => ({ ...prev, [id]: tierPrice.toString() }));
          }
        }
      }
    });
  }, [variantQtys, isSale, masterlist, selectedIds, variants, unitPrices]);

  // Sale ref — new each time modal opens
  const saleRef = useMemo(() => {
    const d = new Date(),
      pad = (n) => String(n).padStart(2, "0");
    return `SL-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Math.floor(Math.random() * 9000) + 1000}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Load variants from all selected items (multi-select) or single item
  useEffect(() => {
    if (!isOpen) return;

    // Determine which items to load variants from
    const sourceItems =
      items && items.length > 0 ? items : selectedItem ? [selectedItem] : [];
    if (sourceItems.length === 0) return;

    const allVariants = [];
    const seenSkus = new Set();

    sourceItems.forEach((srcItem) => {
      if (!srcItem) return;

      // If parent with variants, load children directly
      const isParent = srcItem.hasVariants && !srcItem.parentId;
      let resolved = [];

      if (isParent) {
        resolved = (inventory || []).filter(
          (inv) =>
            String(inv.parentId) === String(srcItem.id) &&
            inv.isActive !== false,
        );
      }

      // Fallback: standalone item or no children found
      if (resolved.length === 0) {
        const exact = (inventory || []).find(
          (inv) => inv.id === srcItem.id && inv.isActive !== false,
        );
        if (exact) {
          const hasChildren = (inventory || []).some(
            (c) => c.parentId === exact.id,
          );
          if (!hasChildren) resolved = [exact];
        }
      }

      // Final fallback: use srcItem itself
      if (resolved.length === 0) {
        resolved = [srcItem];
      }

      resolved.forEach((inv) => {
        if (seenSkus.has(inv.sku || inv.id)) return;
        // Only include variants that have been stocked in (have batch data)
        const hasBatches =
          Array.isArray(inv.batches) &&
          inv.batches.length > 0 &&
          inv.batches.some(
            (b) =>
              (b.originalQty ||
                b.qtyReceived ||
                b.goodQty ||
                b.qtyGood ||
                b.remainingQty ||
                0) > 0,
          );
        if (!hasBatches) return; // Skip variants never stocked in
        seenSkus.add(inv.sku || inv.id);
        // Compute accurate stock from batches (remainingQty)
        const activeBatches = Array.isArray(inv.batches)
          ? inv.batches
              .filter((b) => (b.remainingQty || 0) > 0)
              .sort(
                (a, b) => new Date(a.dateReceived) - new Date(b.dateReceived),
              )
          : [];
        const accurateStock = activeBatches.reduce(
          (s, b) => s + (b.remainingQty || 0),
          0,
        );
        allVariants.push({
          id: inv.id,
          variantName: inv.name,
          sku: inv.sku,
          stock: accurateStock, // Use batch-computed stock, not stockQty field
          parentName: isParent ? srcItem.name : null,
          batches: activeBatches,
        });
      });
    });

    setVariants(allVariants.length > 0 ? allVariants : []);
  }, [isOpen, selectedItem, items, inventory]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setBatchMode("fifo");
      setReason("sales");
      setPriceMode("unit");
      setSaleDate(new Date().toISOString().split("T")[0]);
      setCustomer("");
      setRemarks("");
      setSelectedIds([]);
      setVariantQtys({});
      setUnitPrices({});
      setTotalAmounts({});
      setPickedBatches({});
      setShowConfirm(false);
      setShowReceipt(false);
      setPending(null);
      setCompletedSale(null);
      setSelectedMaterialId("");
      // If no item pre-selected, start with material selector
      if (!item) setSelectedItem(null);
    }
  }, [isOpen, item]);

  // Clear appropriate state when switching batch modes
  useEffect(() => {
    if (batchMode === "pick") {
      // Clear variantQtys when switching to pick mode (user will input via batch cards)
      setVariantQtys({});
      setPickedBatches({});
    } else {
      // Clear pickedBatches when switching to FIFO mode
      setPickedBatches({});
    }
  }, [batchMode]);

  // Effective unit prices (per variant)
  const effectivePrices = useMemo(() => {
    if (priceMode === "unit") return unitPrices;
    const out = {};
    selectedIds.forEach((id) => {
      const qty =
        batchMode === "fifo"
          ? parseInt(variantQtys[id]) || 0
          : Object.values(pickedBatches[id] || {}).reduce(
              (sum, val) => sum + (parseInt(val) || 0),
              0,
            );
      const total = parseFloat(totalAmounts[id]) || 0;
      out[id] = qty > 0 && total > 0 ? (total / qty).toFixed(2) : "";
    });
    return out;
  }, [
    priceMode,
    unitPrices,
    totalAmounts,
    selectedIds,
    variantQtys,
    pickedBatches,
    batchMode,
  ]);

  // FIFO calc
  const fifoCalc = useMemo(() => {
    console.log(
      "[StockReduction] fifoCalc - selectedIds:",
      selectedIds,
      "variantQtys:",
      variantQtys,
      "variants:",
      variants,
    );
    const res = {};
    selectedIds.forEach((id) => {
      const v = variants.find((x) => x.id === id),
        qty = parseInt(variantQtys[id]) || 0;
      console.log(
        "[StockReduction] fifoCalc processing id:",
        id,
        "variant:",
        v?.variantName,
        "qty:",
        qty,
      );
      if (!v || qty <= 0) {
        console.warn(
          "[StockReduction] Skipping id:",
          id,
          "no variant or qty <= 0",
        );
        return;
      }
      const consumption = [];
      let rem = qty;
      for (const b of v.batches) {
        if (rem <= 0) break;
        const take = Math.min(rem, b.remainingQty);
        consumption.push({
          batchId: b.batchId,
          invoiceNumber: b.invoiceNumber,
          batchDate: b.dateReceived,
          take,
          unitCost: b.unitCost || 0,
          totalCost: take * (b.unitCost || 0),
          remainingAfter: b.remainingQty - take,
        });
        rem -= take;
      }
      console.log(
        "[StockReduction] fifoCalc result for id:",
        id,
        "qtyFulfilled:",
        qty - rem,
        "unfulfilledQty:",
        rem,
      );
      res[id] = {
        variantId: id,
        variantName: v.variantName,
        sku: v.sku,
        qtyRequested: qty,
        qtyFulfilled: qty - rem,
        unfulfilledQty: rem,
        totalCostValue: consumption.reduce((s, c) => s + c.totalCost, 0),
        consumption,
      };
    });
    console.log("[StockReduction] fifoCalc final result:", res);
    return res;
  }, [selectedIds, variantQtys, variants]);

  // Pick calc
  const pickCalc = useMemo(() => {
    const res = {};
    selectedIds.forEach((id) => {
      const v = variants.find((x) => x.id === id);
      if (!v) return;
      const picked = pickedBatches[id] || {};
      let assigned = 0;
      const consumption = [];
      const totalFromBatches = Object.values(picked).reduce(
        (sum, val) => sum + (parseInt(val) || 0),
        0,
      );

      v.batches.forEach((b) => {
        const take = Math.min(parseInt(picked[b.batchId]) || 0, b.remainingQty);
        if (take <= 0) return;
        assigned += take;
        consumption.push({
          batchId: b.batchId,
          invoiceNumber: b.invoiceNumber,
          batchDate: b.dateReceived,
          take,
          unitCost: b.unitCost || 0,
          totalCost: take * (b.unitCost || 0),
          remainingAfter: b.remainingQty - take,
        });
      });

      res[id] = {
        variantId: id,
        variantName: v.variantName,
        sku: v.sku,
        qtyRequested: totalFromBatches,
        qtyAssigned: assigned,
        stillNeeded: 0,
        fullyAssigned: totalFromBatches > 0,
        totalCostValue: consumption.reduce((s, c) => s + c.totalCost, 0),
        consumption,
      };
    });
    return res;
  }, [selectedIds, variants, pickedBatches]);

  // Totals
  const totals = useMemo(() => {
    let qty = 0,
      cost = 0,
      revenue = 0;
    const calc = batchMode === "fifo" ? fifoCalc : pickCalc;
    console.log(
      "[StockReduction] totals calc - batchMode:",
      batchMode,
      "selectedIds:",
      selectedIds,
      "fifoCalc:",
      fifoCalc,
      "pickCalc:",
      pickCalc,
    );
    selectedIds.forEach((id) => {
      const c = calc[id];
      if (!c) {
        console.warn("[StockReduction] No calc entry for id:", id);
        return;
      }
      const ful =
        batchMode === "fifo" ? c.qtyFulfilled || 0 : c.qtyAssigned || 0;
      console.log("[StockReduction] Adding qty for id:", id, "fulfilled:", ful);
      qty += ful;
      cost += c.totalCostValue;
      if (isSale) revenue += ful * (parseFloat(effectivePrices[id]) || 0);
    });
    console.log("[StockReduction] totals result:", { qty, cost, revenue });
    return { qty, cost, revenue };
  }, [batchMode, fifoCalc, pickCalc, selectedIds, isSale, effectivePrices]);

  const toggleId = (id) => {
    const isSelected = selectedIds.includes(id);
    if (!isSelected) {
      setSelectedIds((prev) => [...prev, id]);
      // Don't auto-set qty - let user enter it manually
    } else {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      // Clear qty and batch picks when deselecting
      setVariantQtys((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      setPickedBatches((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      setUnitPrices((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      setTotalAmounts((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
  };

  // Validate
  const validate = () => {
    if (selectedIds.length === 0) {
      setInfoModal({
        title: "Validation Error",
        message: "Select at least one variant.",
      });
      return false;
    }
    for (const id of selectedIds) {
      const v = variants.find((x) => x.id === id);
      const totalFromBatches =
        batchMode === "pick"
          ? Object.values(pickedBatches[id] || {}).reduce(
              (sum, val) => sum + (parseInt(val) || 0),
              0,
            )
          : parseInt(variantQtys[id]) || 0;

      if (totalFromBatches <= 0) {
        setInfoModal({
          title: "Validation Error",
          message:
            batchMode === "pick"
              ? "Add quantities from batches for all selected variants."
              : "Enter a quantity greater than 0 for all selected variants.",
        });
        return false;
      }
      if (v && totalFromBatches > v.stock) {
        setInfoModal({
          title: "Validation Error",
          message: `Quantity exceeds stock for ${v.variantName}.`,
        });
        return false;
      }
      if (batchMode === "fifo") {
        const f = fifoCalc[id];
        if (f && f.unfulfilledQty > 0) {
          setInfoModal({
            title: "Validation Error",
            message: `Insufficient batch stock for ${v?.variantName}. ${f.unfulfilledQty} pcs cannot be fulfilled.`,
          });
          return false;
        }
      }
      if (isSale) {
        const price =
          priceMode === "unit"
            ? parseFloat(unitPrices[id]) || 0
            : parseFloat(totalAmounts[id]) || 0;
        if (price <= 0) {
          setInfoModal({
            title: "Validation Error",
            message: `Enter a ${priceMode === "total" ? "total amount" : "selling price"} for ${v?.variantName}.`,
          });
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const calc = batchMode === "fifo" ? fifoCalc : pickCalc;
    const data = {
      batchMode,
      reason,
      saleRef: isSale ? saleRef : null,
      saleDate: isSale ? saleDate : null,
      customer: isSale ? customer : null,
      remarks: !isSale ? remarks : null,
      variants: selectedIds.map((id) => {
        const v = variants.find((x) => x.id === id),
          c = calc[id];
        const ful =
          batchMode === "fifo" ? c?.qtyFulfilled || 0 : c?.qtyAssigned || 0;
        const qtyRequested =
          batchMode === "pick"
            ? Object.values(pickedBatches[id] || {}).reduce(
                (sum, val) => sum + (parseInt(val) || 0),
                0,
              )
            : parseInt(variantQtys[id]) || 0;
        const up = isSale ? parseFloat(effectivePrices[id]) || 0 : 0;
        return {
          variantId: id,
          variantName: v?.variantName,
          sku: v?.sku,
          qtyRequested,
          qtyFulfilled: ful,
          sellingPrice: up,
          totalRevenue: ful * up,
          batches: c?.consumption || [],
          totalCostValue: c?.totalCostValue || 0,
        };
      }),
      totals,
    };
    setPending(data);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    try {
      onConfirm(pending);
      setShowConfirm(false);
      if (isSale) {
        setCompletedSale(pending);
        setShowReceipt(true);
      } else {
        setPending(null);
        onClose();
      }
    } catch (err) {
      setInfoModal({
        title: "Error",
        message: err.message || "Failed to process. Please try again.",
      });
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.78)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    modal: {
      maxWidth: "1100px",
      width: "95%",
      maxHeight: "92vh",
      display: "flex",
      flexDirection: "column",
      background: "#0E0E0E",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "14px",
      overflow: "hidden",
    },
    header: {
      padding: "1.5rem 2rem",
      flexShrink: 0,
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      background: "#131313",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    body: {
      flex: 1,
      display: "grid",
      gridTemplateColumns: "1fr 360px",
      minHeight: 0,
      overflow: "hidden",
    },
    left: { padding: "1.5rem 2rem", overflowY: "auto", background: "#0E0E0E" },
    right: {
      padding: "1.5rem 1.75rem",
      background: "#131313",
      borderLeft: "1px solid rgba(255,255,255,0.08)",
      overflowY: "auto",
    },
    footer: {
      padding: "1rem 2rem",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexShrink: 0,
      background: "#131313",
    },
    lbl: {
      fontSize: "0.6rem",
      fontWeight: 700,
      color: "var(--gray)",
      textTransform: "uppercase",
      letterSpacing: "0.09em",
      marginBottom: "0.5rem",
      display: "block",
    },
    modeBtn: (active) => ({
      display: "flex",
      alignItems: "center",
      gap: "0.4rem",
      padding: "0.5rem 0.875rem",
      borderRadius: "8px",
      fontSize: "0.75rem",
      fontWeight: 700,
      cursor: "pointer",
      border: active ? `2px solid ${GOLD}` : "1px solid rgba(255,255,255,0.1)",
      background: active ? GOLD_BG : "rgba(255,255,255,0.04)",
      color: active ? GOLD : "var(--gray)",
    }),
    reasonBtn: (active) => ({
      flex: 1,
      padding: "0.625rem",
      borderRadius: "8px",
      fontSize: "0.75rem",
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "center",
      border: active ? `2px solid ${GOLD}` : "1px solid rgba(255,255,255,0.1)",
      background: active ? GOLD_BG : "rgba(255,255,255,0.04)",
      color: active ? GOLD : "var(--gray)",
    }),
    th: {
      padding: "0.75rem 0.875rem",
      textAlign: "left",
      fontSize: "0.6rem",
      fontWeight: 700,
      color: "var(--gray)",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      background: "rgba(0,0,0,0.3)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      whiteSpace: "nowrap",
    },
    td: (sel) => ({
      padding: "0.875rem",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      background: sel ? "rgba(212,168,67,0.04)" : "transparent",
      opacity: sel ? 1 : 0.45,
    }),
    qtyInput: {
      width: "64px",
      textAlign: "center",
      fontWeight: 700,
      background: "rgba(255,255,255,0.06)",
      border: `1px solid ${GOLD_BORDER}`,
      borderRadius: "7px",
      color: "#E5E2E1",
      padding: "0.4rem 0.25rem",
      fontSize: "0.85rem",
      outline: "none",
    },
    batchCard: (picked) => ({
      borderRadius: "10px",
      padding: "0.875rem 1rem",
      marginBottom: "0.625rem",
      border: picked ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.07)",
      background: picked ? GOLD_BG : "rgba(255,255,255,0.02)",
    }),
    fifoTh: {
      padding: "0.6rem 0.75rem",
      fontSize: "0.6rem",
      fontWeight: 700,
      color: "var(--gray)",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      background: "rgba(0,0,0,0.3)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    summaryBox: {
      padding: "1rem",
      borderRadius: "10px",
      marginTop: "1rem",
      background: "rgba(212,168,67,0.07)",
      border: "1px solid rgba(212,168,67,0.2)",
    },
  };

  if (!isOpen) return null;

  // If no item pre-selected and none selected internally, show material selector
  // If items array has data, skip the single-item selector entirely
  const hasMultiItems = items && items.length > 0;

  if (!selectedItem && !hasMultiItems) {
    const availableMaterials = (inventory || []).filter(
      (inv) => inv.isActive !== false,
    );
    return (
      <div style={{ ...S.overlay, zIndex: 9999 }} onClick={onClose}>
        <div
          style={{
            ...S.modal,
            maxWidth: "500px",
            width: "95%",
            position: "relative",
            zIndex: 10000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={S.header}>
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
                Stock Adjustment
              </div>
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#E5E2E1",
                  margin: 0,
                }}
              >
                Select Material
              </h2>
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
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(239,68,68,0.15)";
                e.currentTarget.style.color = "#ef4444";
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
          <div
            style={{
              padding: "1.5rem 2rem",
              overflowY: "auto",
              maxHeight: "60vh",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "0.72rem",
                color: "var(--gray)",
                fontWeight: 600,
                textTransform: "uppercase",
                marginBottom: "0.5rem",
                letterSpacing: "0.08em",
              }}
            >
              Choose a material to adjust
            </label>
            <CustomDropdown
              value={selectedMaterialId}
              onChange={setSelectedMaterialId}
              placeholder="— Select a material —"
              options={[
                { value: "", label: "— Select a material —" },
                ...availableMaterials
                  .filter(
                    (m) =>
                      !m.hasVariants ||
                      (inventory || []).filter((c) => c.parentId === m.id)
                        .length === 0,
                  )
                  .filter((m) => (m.stockQty || 0) > 0) // Only show materials with stock > 0
                  .map((m) => ({
                    value: m.id,
                    label: `${m.name} (${m.category}) — ${m.stockQty} pcs`,
                  })),
              ]}
            />
            {selectedMaterialId && (
              <button
                type="button"
                onClick={() => {
                  const mat = availableMaterials.find(
                    (m) => m.id === selectedMaterialId,
                  );
                  if (mat) {
                    setSelectedItem(mat); // Set internal state and proceed to variant selection
                  }
                }}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  marginTop: "1rem",
                  background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#000",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isMulti = items && items.length > 1;
  const baseName = isMulti
    ? `${items.length} Materials`
    : extractBaseProductName(selectedItem.name);
  const totalStock = variants.reduce((s, v) => s + v.stock, 0);

  // ── Variant row ───────────────────────────────────────────────────────────
  const renderRow = (variant, idx) => {
    // Show group header if this variant has a parentName and it's different from prev
    const prevParent = idx > 0 ? variants[idx - 1]?.parentName : null;
    const currentGroup = variant.parentName || variant.variantName;
    const prevGroup =
      prevParent ||
      (idx > 0
        ? variants[idx - 1]?.parentName || variants[idx - 1]?.variantName
        : null);
    const showGroupHeader = isMulti && currentGroup !== prevGroup;
    const sel = selectedIds.includes(variant.id);
    const qty = parseInt(variantQtys[variant.id]) || 0;
    const remaining = variant.stock - qty;
    const td = (center = false) => ({
      ...S.td(sel),
      textAlign: center ? "center" : "left",
      ...(idx === 0 ? { borderTop: "none" } : {}),
    });

    // In pick batch mode, calculate total from batches instead of showing input
    const totalFromBatches =
      batchMode === "pick" && sel
        ? Object.values(pickedBatches[variant.id] || {}).reduce(
            (sum, val) => sum + (parseInt(val) || 0),
            0,
          )
        : 0;

    return (
      <React.Fragment key={variant.sku || variant.id}>
        {showGroupHeader && (
          <tr>
            <td
              colSpan={5}
              style={{
                padding: "0.5rem 0.875rem",
                background: "rgba(212,168,67,0.06)",
                borderBottom: "1px solid rgba(212,168,67,0.15)",
                fontSize: "0.65rem",
                fontWeight: 700,
                color: GOLD,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {variant.parentName || variant.variantName}
            </td>
          </tr>
        )}
        <tr
          style={{
            borderLeft: sel ? `3px solid ${GOLD}` : "3px solid transparent",
          }}
        >
          <td style={td(true)}>
            <input
              type="checkbox"
              checked={sel}
              onChange={() => toggleId(variant.id)}
              style={{
                width: "16px",
                height: "16px",
                cursor: "pointer",
                accentColor: GOLD,
              }}
            />
          </td>
          <td style={td()}>
            <div
              style={{ fontWeight: 700, color: "#E5E2E1", fontSize: "0.85rem" }}
            >
              {variant.variantName}
            </div>
            <div
              style={{
                fontSize: "0.65rem",
                color: "var(--gray)",
                fontFamily: "monospace",
                marginTop: "2px",
              }}
            >
              {variant.sku}
            </div>
          </td>
          <td style={td(true)}>
            <span style={{ fontWeight: 700, color: GOLD }}>
              {variant.stock}
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--gray)",
                marginLeft: "3px",
              }}
            >
              pcs
            </span>
          </td>
          {/* Qty to Reduce - hidden in pick batch mode, shown in FIFO */}
          {batchMode === "fifo" && (
            <td style={td(true)}>
              {sel ? (
                <IntegerInput
                  value={variantQtys[variant.id] || ""}
                  onChange={(val) =>
                    setVariantQtys((p) => ({ ...p, [variant.id]: val }))
                  }
                  min={1}
                  max={variant.stock}
                  placeholder="0"
                  style={S.qtyInput}
                />
              ) : (
                <span style={{ color: "var(--gray)" }}>—</span>
              )}
            </td>
          )}
          {/* Total from batches - shown only in pick batch mode */}
          {batchMode === "pick" && (
            <td style={td(true)}>
              {sel && totalFromBatches > 0 ? (
                <span style={{ fontWeight: 700, color: GOLD }}>
                  {totalFromBatches} pcs
                </span>
              ) : sel ? (
                <span style={{ color: "var(--gray)", fontSize: "0.7rem" }}>
                  Select batches below
                </span>
              ) : (
                <span style={{ color: "var(--gray)" }}>—</span>
              )}
            </td>
          )}
          <td style={td(true)}>
            {sel && (batchMode === "fifo" ? qty > 0 : totalFromBatches > 0) ? (
              <span
                style={{
                  fontWeight: 700,
                  color: remaining < 0 ? "#ef4444" : "#E5E2E1",
                }}
              >
                {batchMode === "fifo"
                  ? remaining
                  : variant.stock - totalFromBatches}{" "}
                pcs
              </span>
            ) : (
              <span style={{ color: "var(--gray)" }}>—</span>
            )}
          </td>
        </tr>
      </React.Fragment>
    );
  };

  // ── FIFO breakdown (only shown in fifo mode) ──────────────────────────────
  const renderFifo = () => {
    const entries = Object.values(fifoCalc).filter(
      (f) => f.consumption.length > 0,
    );
    if (entries.length === 0) return null;
    return (
      <div style={{ marginTop: "1.25rem" }}>
        <div style={{ ...S.lbl, marginBottom: "0.625rem" }}>
          Batch consumption — FIFO
        </div>
        {entries.map((fifo) => (
          <div key={fifo.variantId} style={{ marginBottom: "1.25rem" }}>
            <div
              style={{
                fontSize: "0.78rem",
                color: "#E5E2E1",
                fontWeight: 700,
                marginBottom: "0.5rem",
              }}
            >
              {fifo.variantName}
              {fifo.unfulfilledQty > 0 && (
                <span
                  style={{
                    color: "#ef4444",
                    fontWeight: 400,
                    fontSize: "0.72rem",
                    marginLeft: "0.5rem",
                  }}
                >
                  — {fifo.unfulfilledQty} pcs cannot be fulfilled
                </span>
              )}
            </div>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                overflow: "hidden",
                marginBottom: "0.5rem",
              }}
            >
              <thead>
                <tr>
                  <th style={S.fifoTh}>Batch ID</th>
                  <th style={{ ...S.fifoTh, textAlign: "center" }}>Taking</th>
                  <th style={{ ...S.fifoTh, textAlign: "center" }}>
                    Remaining After
                  </th>
                  <th style={{ ...S.fifoTh, textAlign: "center" }}>
                    Unit Cost
                  </th>
                  <th style={{ ...S.fifoTh, textAlign: "right" }}>
                    Cost Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {fifo.consumption.map((c, ci) => (
                  // Fix: Use combination of variantId, batchId and index for unique key
                  <tr
                    key={`${fifo.variantId}-${c.batchId}-${ci}`}
                    style={{
                      background:
                        ci % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                      borderTop: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <div
                        style={{
                          fontFamily: "monospace",
                          color: GOLD,
                          fontWeight: 700,
                          fontSize: "0.8rem",
                        }}
                      >
                        {c.invoiceNumber || c.batchId}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "0.6rem 0.75rem",
                        textAlign: "center",
                        fontWeight: 700,
                        color: "#E5E2E1",
                      }}
                    >
                      {c.take} pcs
                    </td>
                    <td
                      style={{
                        padding: "0.6rem 0.75rem",
                        textAlign: "center",
                        color: "var(--gray)",
                      }}
                    >
                      {c.remainingAfter} pcs
                    </td>
                    <td
                      style={{
                        padding: "0.6rem 0.75rem",
                        textAlign: "center",
                        color: "var(--gray)",
                      }}
                    >
                      {peso(c.unitCost)}
                    </td>
                    <td
                      style={{
                        padding: "0.6rem 0.75rem",
                        textAlign: "right",
                        fontWeight: 700,
                        color: GOLD,
                      }}
                    >
                      {peso(c.totalCost)}
                    </td>
                  </tr>
                ))}
                <tr
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <td
                    colSpan={4}
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.72rem",
                      color: "var(--gray)",
                    }}
                  >
                    Total cost value removed
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      textAlign: "right",
                      fontWeight: 700,
                      color: GOLD,
                    }}
                  >
                    {peso(fifo.totalCostValue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  // ── Pick-batch cards (only shown in pick mode) ────────────────────────────
  const renderPickCards = () => {
    if (selectedIds.length === 0) return null;
    return (
      <div style={{ marginTop: "1.25rem" }}>
        {selectedIds.map((id) => {
          const variant = variants.find((v) => v.id === id),
            pick = pickCalc[id];
          if (!variant) return null;
          return (
            <div key={id} style={{ marginBottom: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.625rem",
                }}
              >
                <span style={{ ...S.lbl, marginBottom: 0 }}>
                  Pick batches — {variant.variantName}
                </span>
                <span
                  style={{
                    color: "#E5E2E1",
                    fontWeight: 700,
                    fontSize: "0.72rem",
                  }}
                >
                  Total:{" "}
                  <strong style={{ color: GOLD }}>
                    {pick?.qtyAssigned || 0} pcs
                  </strong>
                </span>
              </div>

              {pick?.qtyAssigned > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    padding: "0.6rem 0.875rem",
                    marginBottom: "0.75rem",
                    fontSize: "0.78rem",
                    color: "#E5E2E1",
                  }}
                >
                  Assigned from {pick.consumption.length} batch
                  {pick.consumption.length !== 1 ? "es" : ""}
                </div>
              )}

              {variant.batches.map((batch, bi) => {
                const batchInputs = pickedBatches[id] || {};
                const pickedQty = parseInt(batchInputs[batch.batchId]) || 0;
                const isPicked = pickedQty > 0;
                // Use batch ID as key (now safe since we don't merge duplicate SKUs)
                const uniqueKey = `${id}-${batch.batchId}`;

                return (
                  <div key={uniqueKey} style={S.batchCard(isPicked)}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "monospace",
                            color: GOLD,
                            fontWeight: 700,
                            fontSize: "0.82rem",
                          }}
                        >
                          {batch.batchId}
                        </span>
                        {isPicked && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              color: GOLD,
                              background: GOLD_BG,
                              padding: "2px 8px",
                              borderRadius: "10px",
                              border: `1px solid ${GOLD_BORDER}`,
                            }}
                          >
                            Selected
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          color: "#E5E2E1",
                        }}
                      >
                        {batch.remainingQty} pcs available
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "16px",
                        fontSize: "0.72rem",
                        color: "var(--gray)",
                        marginBottom: "8px",
                      }}
                    >
                      {batch.dateReceived && (
                        <span>
                          Received:{" "}
                          {new Date(batch.dateReceived).toLocaleDateString()}
                        </span>
                      )}
                      <span>
                        Unit Cost:{" "}
                        <strong style={{ color: GOLD }}>
                          {peso(batch.unitCost || 0)}
                        </strong>
                      </span>
                      {batch.invoiceNumber && (
                        <span>Invoice: {batch.invoiceNumber}</span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--gray)",
                          flexShrink: 0,
                        }}
                      >
                        Qty from this batch:
                      </span>
                      <IntegerInput
                        value={batchInputs[batch.batchId] || ""}
                        onChange={(val) =>
                          setPickedBatches((p) => ({
                            ...p,
                            [id]: { ...(p[id] || {}), [batch.batchId]: val },
                          }))
                        }
                        min={0}
                        max={batch.remainingQty}
                        placeholder="0"
                        style={{
                          ...S.qtyInput,
                          width: "56px",
                          borderColor: isPicked
                            ? GOLD
                            : "rgba(255,255,255,0.12)",
                          color: isPicked ? GOLD : "#E5E2E1",
                        }}
                      />
                      {isPicked && (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--gray)",
                            marginLeft: "4px",
                          }}
                        >
                          ={" "}
                          <strong style={{ color: GOLD }}>
                            {peso(pickedQty * (batch.unitCost || 0))}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {pick && pick.qtyAssigned > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.6rem 0.875rem",
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span style={{ fontSize: "0.72rem", color: "var(--gray)" }}>
                    Total assigned:{" "}
                    <strong style={{ color: "#E5E2E1" }}>
                      {pick.qtyAssigned} pcs
                    </strong>
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--gray)" }}>
                    Cost value:{" "}
                    <strong style={{ color: GOLD }}>
                      {peso(pick.totalCostValue)}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Summary ───────────────────────────────────────────────────────────────
  const renderSummary = () => {
    if (totals.qty <= 0) return null;
    return (
      <div style={S.summaryBox}>
        <div style={{ ...S.lbl, marginBottom: "0.75rem" }}>Summary</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "0.5rem",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
            Total qty {isSale ? "removed" : "written off"}
          </span>
          <span style={{ fontWeight: 700, color: "#E5E2E1" }}>
            {totals.qty} pcs
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: isSale ? "0.5rem" : 0,
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
            Cost value {isSale ? "removed" : "lost"}
          </span>
          <span style={{ fontWeight: 700, color: GOLD }}>
            {peso(totals.cost)}
          </span>
        </div>
        {isSale && (
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.07)",
              paddingTop: "0.5rem",
              marginTop: "0.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.4rem",
              }}
            >
              <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
                Revenue recorded
              </span>
              <span style={{ fontWeight: 700, color: "#E5E2E1" }}>
                {peso(totals.revenue)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
                Gross profit
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color:
                    totals.revenue - totals.cost >= 0 ? "#E5E2E1" : "#ef4444",
                }}
              >
                {peso(totals.revenue - totals.cost)}
              </span>
            </div>
          </div>
        )}
        {!isSale && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem 0.75rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontSize: "0.65rem",
                color: "var(--gray)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              No revenue recorded — write-off only
            </span>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...S.overlay, overflowY: "auto" }} onClick={onClose}>
      <div
        style={{ ...S.modal, maxWidth: "900px", width: "95%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div style={S.header}>
          <div>
            <div
              style={{
                fontSize: "0.6rem",
                color: GOLD,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                marginBottom: "0.3rem",
                fontWeight: 700,
              }}
            >
              Inventory Management
            </div>
            <h2
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "#E5E2E1",
                margin: 0,
              }}
            >
              Reduce Stock — {baseName}
            </h2>
            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--gray)",
                marginTop: "0.35rem",
              }}
            >
              {isMulti
                ? `${items.map((i) => i.name).join(", ")} | `
                : `${selectedItem.category} | `}
              Current stock:{" "}
              <strong style={{ color: GOLD }}>{totalStock} pcs</strong>
            </div>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}
          >
            <button
              type="button"
              style={S.modeBtn(batchMode === "fifo")}
              onClick={() => setBatchMode("fifo")}
            >
              FIFO
            </button>
            <button
              type="button"
              style={S.modeBtn(batchMode === "pick")}
              onClick={() => setBatchMode("pick")}
            >
              Pick Batch
            </button>
            <button
              onClick={onClose}
              style={{
                marginLeft: "0.5rem",
                background: "rgba(255,255,255,0.05)",
                border: "none",
                borderRadius: "50%",
                width: "38px",
                height: "38px",
                cursor: "pointer",
                color: "var(--gray)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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

        {/* BODY */}
        <div style={{ ...S.body, overflow: "visible" }}>
          {/* LEFT */}
          <div style={S.left}>
            <div
              style={{
                fontSize: "0.75rem",
                color: GOLD,
                background: "rgba(212,168,67,0.06)",
                border: "1px solid rgba(212,168,67,0.18)",
                borderRadius: "8px",
                padding: "0.625rem 0.875rem",
                marginBottom: "1.25rem",
              }}
            >
              {batchMode === "fifo"
                ? "Auto FIFO — system pulls from oldest batches first. Review the breakdown below."
                : "Pick Batch — choose which batch(es) to pull from per variant. If a batch is short, pick another to cover the remainder."}
            </div>

            <div style={{ ...S.lbl, marginBottom: "0.625rem" }}>
              {isSale
                ? "Select variants & qty to reduce"
                : "Select variants to write off"}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.82rem",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  marginBottom: "1.25rem",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: "40px" }}></th>
                    <th style={S.th}>Variant</th>
                    <th style={{ ...S.th, textAlign: "center" }}>Stock</th>
                    <th style={{ ...S.th, textAlign: "center" }}>
                      {batchMode === "fifo"
                        ? isSale
                          ? "Qty to Reduce"
                          : "Qty to Write Off"
                        : "Total from Batches"}
                    </th>
                    <th style={{ ...S.th, textAlign: "center" }}>Remaining</th>
                  </tr>
                </thead>
                <tbody>{variants.map((v, i) => renderRow(v, i))}</tbody>
              </table>
            </div>

            {/* FIX: Only one section shows at a time */}
            {batchMode === "fifo" && renderFifo()}
            {batchMode === "pick" && renderPickCards()}
          </div>

          {/* RIGHT */}
          <div style={S.right}>
            {isSale && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  padding: "0.6rem 0.875rem",
                  background: "rgba(212,168,67,0.06)",
                  border: "1px solid rgba(212,168,67,0.15)",
                  borderRadius: "8px",
                }}
              >
                <span style={{ ...S.lbl, marginBottom: 0 }}>Sale Ref</span>
                <span
                  style={{
                    fontFamily: "monospace",
                    color: GOLD,
                    fontWeight: 700,
                    fontSize: "0.8rem",
                  }}
                >
                  {saleRef}
                </span>
              </div>
            )}

            {/* Reason — 3 options in toggle style */}
            <div style={{ marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "8px",
                    padding: "3px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    flex: 1,
                  }}
                >
                  {[
                    ["sales", "Manual Sale"],
                    ["damaged", "Damage"],
                    ["writeoff", "Write-off"],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setReason(val)}
                      style={{
                        flex: 1,
                        padding: "0.4rem 0.75rem",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        borderRadius: "6px",
                        border: "none",
                        cursor: "pointer",
                        background: reason === val ? "#D4A843" : "transparent",
                        color: reason === val ? "#000" : "var(--gray)",
                        transition: "all 0.15s",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--gray)" }}>
                {reason === "sales" &&
                  "Creates a sales record and reduces inventory."}
                {reason === "damaged" &&
                  "Records damaged stock. No sales record created."}
                {reason === "writeoff" &&
                  "Permanently writes off stock. No sales record created."}
              </div>
            </div>

            {isSale ? (
              <>
                {/* Selling Price Input Mode Toggle */}
                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: "#D4A843",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Selling Price:
                    </span>
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
                        ["unit", "Per Unit"],
                        ["total", "Total Amount"],
                      ].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPriceMode(val)}
                          style={{
                            padding: "0.4rem 0.75rem",
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            borderRadius: "6px",
                            border: "none",
                            cursor: "pointer",
                            background:
                              priceMode === val ? "#D4A843" : "transparent",
                            color: priceMode === val ? "#000" : "var(--gray)",
                            transition: "all 0.15s",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--gray)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {priceMode === "unit"
                      ? "Enter price per piece — total auto-computes."
                      : "Enter total amount received — unit price auto-computes."}
                  </div>
                </div>

                {/* Per-variant price inputs */}
                {selectedIds.length > 0 && (
                  <div
                    style={{
                      marginBottom: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--gray)",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Enter price for selected variants:
                    </div>
                    {selectedIds.map((id) => {
                      const v = variants.find((x) => x.id === id);
                      if (!v) return null;
                      const qty =
                        batchMode === "fifo"
                          ? parseInt(variantQtys[id]) || 0
                          : Object.values(pickedBatches[id] || {}).reduce(
                              (sum, val) => sum + (parseInt(val) || 0),
                              0,
                            );
                      return (
                        <div
                          key={id}
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "8px",
                            padding: "0.625rem 0.75rem",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "#E5E2E1",
                              marginBottom: "4px",
                            }}
                          >
                            {v.variantName}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              background: "rgba(255,255,255,0.05)",
                              border: `1px solid ${GOLD_BORDER}`,
                              borderRadius: "8px",
                              padding: "0.5rem 0.75rem",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.85rem",
                                color: GOLD,
                                fontWeight: 700,
                              }}
                            >
                              ₱
                            </span>
                            {priceMode === "unit" ? (
                              <DecimalInput
                                value={unitPrices[id] || ""}
                                onChange={(val) =>
                                  setUnitPrices((p) => ({ ...p, [id]: val }))
                                }
                                placeholder="0.00"
                                style={{
                                  width: "100%",
                                  background: "none",
                                  border: "none",
                                  color: "#E5E2E1",
                                  fontSize: "0.95rem",
                                  textAlign: "left",
                                  outline: "none",
                                  fontWeight: 600,
                                }}
                              />
                            ) : (
                              <DecimalInput
                                value={totalAmounts[id] || ""}
                                onChange={(val) =>
                                  setTotalAmounts((p) => ({ ...p, [id]: val }))
                                }
                                placeholder="0.00"
                                style={{
                                  width: "100%",
                                  background: "none",
                                  border: "none",
                                  color: "#E5E2E1",
                                  fontSize: "0.95rem",
                                  textAlign: "left",
                                  outline: "none",
                                  fontWeight: 600,
                                }}
                              />
                            )}
                          </div>
                          {priceMode === "unit" &&
                            unitPrices[id] &&
                            qty > 0 && (
                              <div
                                style={{
                                  fontSize: "0.65rem",
                                  color: "var(--gray)",
                                  marginTop: "0.35rem",
                                }}
                              >
                                Total:{" "}
                                <strong style={{ color: "#E5E2E1" }}>
                                  {peso(parseFloat(unitPrices[id]) * qty)}
                                </strong>
                              </div>
                            )}
                          {priceMode === "total" &&
                            totalAmounts[id] &&
                            qty > 0 && (
                              <div
                                style={{
                                  fontSize: "0.65rem",
                                  color: "var(--gray)",
                                  marginTop: "0.35rem",
                                }}
                              >
                                /unit:{" "}
                                <strong style={{ color: "#E5E2E1" }}>
                                  {peso(parseFloat(totalAmounts[id]) / qty)}
                                </strong>
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ marginBottom: "1rem" }}>
                  <label style={S.lbl}>
                    Sale Date <span style={{ color: GOLD }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    style={inputBase}
                  />
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={S.lbl}>
                    Customer{" "}
                    <span style={{ color: "var(--gray)", fontWeight: 400 }}>
                      (Optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value.slice(0, 60))}
                    placeholder="e.g., Juan Dela Cruz"
                    style={inputBase}
                  />
                </div>
              </>
            ) : (
              <div style={{ marginBottom: "1rem" }}>
                <label style={S.lbl}>
                  Remarks{" "}
                  <span style={{ color: "var(--gray)", fontWeight: 400 }}>
                    (Optional)
                  </span>
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value.slice(0, 300))}
                  placeholder="e.g., Broken during shipping, QC failed..."
                  rows={3}
                  style={{ ...inputBase, resize: "vertical" }}
                />
              </div>
            )}

            <hr
              style={{
                border: "none",
                borderTop: "1px solid rgba(255,255,255,0.07)",
                margin: "1rem 0",
              }}
            />
            {renderSummary()}
          </div>
        </div>

        {/* FOOTER */}
        <div style={S.footer}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "var(--gray)",
              borderRadius: "8px",
              padding: "0.6rem 1.25rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239,68,68,0.08)";
              e.currentTarget.style.color = "#ef4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--gray)";
            }}
          >
            Cancel
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {totals.qty > 0 && (
              <span style={{ fontSize: "0.75rem", color: "var(--gray)" }}>
                {totals.qty} pcs | {selectedIds.length} variant
                {selectedIds.length !== 1 ? "s" : ""} selected
              </span>
            )}
            <button
              type="button"
              disabled={totals.qty <= 0}
              onClick={handleSubmit}
              style={{
                background: totals.qty <= 0 ? "rgba(255,255,255,0.08)" : GOLD,
                border: "none",
                color: totals.qty <= 0 ? "var(--gray)" : "#000",
                borderRadius: "8px",
                padding: "0.6rem 1.5rem",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: totals.qty <= 0 ? "not-allowed" : "pointer",
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
                stroke={totals.qty <= 0 ? "var(--gray)" : "#000"}
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {isSale
                ? "Confirm Reduction"
                : reason === "damaged"
                  ? "Confirm Damage"
                  : "Confirm Write-off"}
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRM MODAL */}
      {showConfirm && pending && (
        <div style={S.overlay} onClick={() => setShowConfirm(false)}>
          <div
            className="modal-content modal-content-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title modal-title-warning">
                Confirm{" "}
                {isSale
                  ? "Stock Reduction"
                  : reason === "damaged"
                    ? "Damage Record"
                    : "Write-off"}
              </h2>
              <button
                className="modal-close"
                onClick={() => setShowConfirm(false)}
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
            <div className="modal-body">
              <div className="confirm-summary">
                <div className="confirm-row">
                  <span className="confirm-label">Mode:</span>
                  <span className="confirm-value">
                    {pending.batchMode === "fifo"
                      ? "Auto FIFO"
                      : "Manual Batch Pick"}
                  </span>
                </div>
                <div className="confirm-row">
                  <span className="confirm-label">Reason:</span>
                  <span className="confirm-value">
                    {pending.reason === "sales"
                      ? "Manual Sale (Outside System)"
                      : pending.reason === "damaged"
                        ? "Damage"
                        : "Write-off"}
                  </span>
                </div>
                <div className="confirm-row">
                  <span className="confirm-label">Total Qty:</span>
                  <span
                    className="confirm-value"
                    style={{ color: "#ef4444", fontWeight: 700 }}
                  >
                    −{pending.totals.qty} pcs
                  </span>
                </div>
                <div className="confirm-row">
                  <span className="confirm-label">Cost Value:</span>
                  <span
                    className="confirm-value"
                    style={{ color: GOLD, fontWeight: 700 }}
                  >
                    {peso(pending.totals.cost)}
                  </span>
                </div>
                {pending.reason === "sales" && (
                  <>
                    <div className="confirm-row">
                      <span className="confirm-label">Revenue:</span>
                      <span
                        className="confirm-value"
                        style={{ color: "#E5E2E1", fontWeight: 700 }}
                      >
                        {peso(pending.totals.revenue)}
                      </span>
                    </div>
                    {pending.saleDate && (
                      <div className="confirm-row">
                        <span className="confirm-label">Sale Date:</span>
                        <span className="confirm-value">
                          {new Date(
                            pending.saleDate + "T00:00:00",
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {pending.customer && (
                      <div className="confirm-row">
                        <span className="confirm-label">Customer:</span>
                        <span className="confirm-value">
                          {pending.customer}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {pending.reason !== "sales" && pending.remarks && (
                  <div className="confirm-row">
                    <span className="confirm-label">Remarks:</span>
                    <span className="confirm-value">{pending.remarks}</span>
                  </div>
                )}
              </div>
              <p
                className="confirm-hint"
                style={{ marginTop: "1rem", color: "#facc15" }}
              >
                {pending.reason === "sales"
                  ? "This will reduce inventory and create a sales record."
                  : "This will permanently remove stock. This cannot be undone."}
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirm}
              >
                {isSale
                  ? "Confirm Reduction"
                  : reason === "damaged"
                    ? "Confirm Damage"
                    : "Confirm Write-off"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {showReceipt && completedSale && (
        <div
          style={{ ...S.overlay, zIndex: 1100 }}
          onClick={() => {
            setShowReceipt(false);
            setPending(null);
            onClose();
          }}
        >
          <div
            style={{
              background: "#1a1a1a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "14px",
              width: "420px",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                background: "#131313",
              }}
            >
              <div
                style={{
                  fontSize: "0.6rem",
                  color: "#E5E2E1",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  fontWeight: 700,
                  marginBottom: "0.25rem",
                }}
              >
                Sale Recorded
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#E5E2E1",
                }}
              >
                Stock reduced successfully
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--gray)",
                  marginTop: "0.25rem",
                }}
              >
                Ref:{" "}
                <span style={{ fontFamily: "monospace", color: GOLD }}>
                  {completedSale.saleRef}
                </span>
              </div>
            </div>
            <div style={{ padding: "1.25rem 1.5rem" }}>
              <div
                style={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  padding: "1rem",
                  fontFamily: "monospace",
                  fontSize: "0.78rem",
                  color: "#d1d5db",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ textAlign: "center", marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#E5E2E1",
                      fontSize: "0.9rem",
                    }}
                  >
                    PERSONALIZE ME PRINTS
                  </div>
                  <div style={{ color: "var(--gray)", fontSize: "0.7rem" }}>
                    Official Sales Record
                  </div>
                  <div
                    style={{
                      borderTop: "1px dashed rgba(255,255,255,0.1)",
                      margin: "0.5rem 0",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.4rem",
                    fontSize: "0.72rem",
                  }}
                >
                  <span style={{ color: "var(--gray)" }}>Ref #</span>
                  <span style={{ color: GOLD }}>{completedSale.saleRef}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.4rem",
                    fontSize: "0.72rem",
                  }}
                >
                  <span style={{ color: "var(--gray)" }}>Date</span>
                  <span>
                    {completedSale.saleDate
                      ? new Date(
                          completedSale.saleDate + "T00:00:00",
                        ).toLocaleDateString("en-PH", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
                {completedSale.customer && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "0.4rem",
                      fontSize: "0.72rem",
                    }}
                  >
                    <span style={{ color: "var(--gray)" }}>Customer</span>
                    <span style={{ color: "#E5E2E1" }}>
                      {completedSale.customer}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    borderTop: "1px dashed rgba(255,255,255,0.1)",
                    margin: "0.5rem 0",
                  }}
                />
                {completedSale.variants.map((v) => (
                  <div key={v.variantId} style={{ marginBottom: "0.4rem" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "#E5E2E1" }}>{v.variantName}</span>
                      <span style={{ color: "#E5E2E1" }}>
                        {peso(v.sellingPrice * v.qtyFulfilled)}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--gray)" }}>
                      {v.qtyFulfilled} pcs × {peso(v.sellingPrice)}
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    borderTop: "1px dashed rgba(255,255,255,0.1)",
                    margin: "0.5rem 0",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                    color: "#E5E2E1",
                    fontSize: "0.85rem",
                  }}
                >
                  <span>TOTAL</span>
                  <span>{peso(completedSale.totals.revenue)}</span>
                </div>
                <div
                  style={{
                    marginTop: "0.75rem",
                    textAlign: "center",
                    fontSize: "0.65rem",
                    color: "var(--gray)",
                  }}
                >
                  Thank you for your purchase!
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.625rem" }}>
                <button
                  onClick={() => {
                    setShowReceipt(false);
                    setPending(null);
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "var(--gray)",
                    borderRadius: "8px",
                    padding: "0.625rem",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={() => {
                    const r = completedSale;
                    const lines = [
                      "PERSONALIZE ME PRINTS",
                      "Official Sales Record",
                      "─────────────────────────",
                      `Ref #    : ${r.saleRef}`,
                      `Date     : ${r.saleDate ? new Date(r.saleDate + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "—"}`,
                      r.customer ? `Customer : ${r.customer}` : "",
                      "─────────────────────────",
                      ...r.variants.map(
                        (v) =>
                          `${v.variantName}\n  ${v.qtyFulfilled} pcs × ${peso(v.sellingPrice)} = ${peso(v.sellingPrice * v.qtyFulfilled)}`,
                      ),
                      "─────────────────────────",
                      `TOTAL    : ${peso(r.totals.revenue)}`,
                      "",
                      "Thank you for your purchase!",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    const w = window.open("", "_blank", "width=400,height=600");
                    w.document.write(
                      `<pre style="font-family:monospace;padding:24px;font-size:14px;">${lines}</pre>`,
                    );
                    w.document.close();
                    w.print();
                  }}
                  style={{
                    flex: 1,
                    background: GOLD,
                    border: "none",
                    color: "#000",
                    borderRadius: "8px",
                    padding: "0.625rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Print Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <InfoModal
        isOpen={!!infoModal}
        onClose={() => setInfoModal(null)}
        title={infoModal?.title || ""}
        message={infoModal?.message || ""}
      />
    </div>
  );
}
