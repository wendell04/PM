"use client";

import { useEffect, useMemo, useState } from "react";
import { GOODS_ISSUE_TYPES } from "../utils";

// Build badge lookup from GOODS_ISSUE_TYPES for backward rendering
const ISSUE_TYPE_BADGE_MAP = {};
GOODS_ISSUE_TYPES.forEach((t) => {
  ISSUE_TYPE_BADGE_MAP[t.id] = {
    label: t.label,
    color: t.color,
    bg: t.color + "1a",
    border: t.color + "33",
  };
});

function IssueTypeBadge({ type }) {
  const cfg = ISSUE_TYPE_BADGE_MAP[type] || ISSUE_TYPE_BADGE_MAP.damage;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.2rem 0.5rem",
        borderRadius: "6px",
        fontSize: "0.6rem",
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

// ── Single peso helper ──────────────────────────────────────────────────────
function peso(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
// GOODS ISSUE MODAL — For damage, scrap, production use, lost, adjustment
// Supports: FIFO / Pick Batch, 5 issue types, multi-variant, 2-step confirm
// ─────────────────────────────────────────────────────────────────────────────
export default function GoodsIssueModal({
  isOpen,
  onClose,
  onConfirm,
  item,
  inventory,
}) {
  const [batchMode, setBatchMode] = useState("fifo"); // 'fifo' | 'pick'
  const [issueType, setIssueType] = useState("damage");
  const [performedBy, setPerformedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [variants, setVariants] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [variantQtys, setVariantQtys] = useState({}); // { id: '46' }
  const [pickedBatches, setPickedBatches] = useState({}); // { variantId: { batchId: '10' } }
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(null);
  const [infoModal, setInfoModal] = useState(null);

  // Load variants from inventory (materials with batches)
  useEffect(() => {
    if (!isOpen || !item) return;

    // If item is a parent with variants, load children
    if (item.hasVariants && !item.parentId) {
      const src = (inventory || []).filter((inv) => inv.parentId === item.id);
      if (src.length > 0) {
        const res = src.map((inv) => ({
          id: inv.id,
          variantName: inv.name,
          sku: inv.sku || "",
          uom: inv.uom || "pcs",
          stock: inv.stockQty || 0,
          batches: Array.isArray(inv.batches)
            ? inv.batches
                .filter((b) => (b.remainingQty || 0) > 0)
                .sort(
                  (a, b) => new Date(a.dateReceived) - new Date(b.dateReceived),
                )
            : [],
        }));
        setVariants(res);
        return;
      }
    }

    // Standalone material or parent treated as single
    const batches = Array.isArray(item.batches)
      ? item.batches
          .filter((b) => (b.remainingQty || 0) > 0)
          .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))
      : [];
    setVariants([
      {
        id: item.id,
        variantName: item.name,
        sku: item.sku || "",
        uom: item.uom || "pcs",
        stock: item.stockQty || 0,
        batches,
      },
    ]);
  }, [isOpen, item, inventory]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setBatchMode("fifo");
      setIssueType("damage");
      setRemarks("");
      setSelectedIds([]);
      setVariantQtys({});
      setPickedBatches({});
      setShowConfirm(false);
      setPending(null);
      setInfoModal(null);
      // Auto-fill performedBy from logged-in user
      try {
        const u = JSON.parse(localStorage.getItem("auth_user") || "null");
        if (u?.firstName && u?.lastName)
          setPerformedBy(u.firstName + " " + u.lastName);
        else if (u?.firstName) setPerformedBy(u.firstName);
        else if (u?.email) setPerformedBy(u.email);
      } catch {
        /* ignore */
      }
    }
  }, [isOpen]);
  useEffect(() => {
    if (batchMode === "pick") {
      setVariantQtys({});
    } else {
      setPickedBatches({});
    }
  }, [batchMode]);

  // FIFO calc
  const fifoCalc = useMemo(() => {
    const res = {};
    selectedIds.forEach((id) => {
      const v = variants.find((x) => x.id === id),
        qty = parseInt(variantQtys[id]) || 0;
      if (!v || qty <= 0) return;
      const consumption = [];
      let rem = qty;
      for (const b of v.batches) {
        if (rem <= 0) break;
        const take = Math.min(rem, b.remainingQty || 0);
        if (take <= 0) continue;
        consumption.push({
          batchId: b.batchId,
          invoiceNumber: b.invoiceNumber || b.invoiceNo || "",
          batchDate: b.dateReceived,
          take,
          unitCost: b.unitCost || 0,
          totalCost: take * (b.unitCost || 0),
          remainingAfter: (b.remainingQty || 0) - take,
        });
        rem -= take;
      }
      res[id] = {
        variantId: id,
        variantName: v.variantName,
        sku: v.sku,
        uom: v.uom,
        qtyRequested: qty,
        qtyFulfilled: qty - rem,
        unfulfilledQty: rem,
        totalCostValue: consumption.reduce((s, c) => s + c.totalCost, 0),
        consumption,
      };
    });
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
        const take = Math.min(
          parseInt(picked[b.batchId]) || 0,
          b.remainingQty || 0,
        );
        if (take <= 0) return;
        assigned += take;
        consumption.push({
          batchId: b.batchId,
          invoiceNumber: b.invoiceNumber || b.invoiceNo || "",
          batchDate: b.dateReceived,
          take,
          unitCost: b.unitCost || 0,
          totalCost: take * (b.unitCost || 0),
          remainingAfter: (b.remainingQty || 0) - take,
        });
      });

      res[id] = {
        variantId: id,
        variantName: v.variantName,
        sku: v.sku,
        uom: v.uom,
        qtyRequested: totalFromBatches,
        qtyAssigned: assigned,
        totalCostValue: consumption.reduce((s, c) => s + c.totalCost, 0),
        consumption,
      };
    });
    return res;
  }, [selectedIds, variants, pickedBatches]);

  // Totals
  const totals = useMemo(() => {
    let qty = 0,
      cost = 0;
    const calc = batchMode === "fifo" ? fifoCalc : pickCalc;
    selectedIds.forEach((id) => {
      const c = calc[id];
      if (!c) return;
      const ful =
        batchMode === "fifo" ? c.qtyFulfilled || 0 : c.qtyAssigned || 0;
      qty += ful;
      cost += c.totalCostValue;
    });
    return { qty, cost, avgCost: qty > 0 ? cost / qty : 0 };
  }, [batchMode, fifoCalc, pickCalc, selectedIds]);

  const toggleId = (id) => {
    const isSelected = selectedIds.includes(id);
    if (!isSelected) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
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
    }
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const calc = batchMode === "fifo" ? fifoCalc : pickCalc;
    const data = {
      batchMode,
      issueType,
      performedBy: performedBy.trim(),
      remarks: remarks.trim(),
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
        return {
          variantId: id,
          variantName: v?.variantName,
          sku: v?.sku,
          uom: v?.uom,
          qtyRequested,
          qtyFulfilled: ful,
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
      setPending(null);
      onClose();
    } catch (err) {
      setInfoModal({
        title: "Error",
        message: err.message || "Failed to process. Please try again.",
      });
    }
  };

  if (!isOpen || !item) return null;

  const totalStock = variants.reduce((s, v) => s + v.stock, 0);

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
      background: "rgba(239,68,68,0.07)",
      border: "1px solid rgba(239,68,68,0.2)",
    },
  };

  // ── Variant row ───────────────────────────────────────────────────────────
  const renderRow = (variant, idx) => {
    const sel = selectedIds.includes(variant.id);
    const qty = parseInt(variantQtys[variant.id]) || 0;
    const remaining = variant.stock - qty;
    const hasNoStock = variant.stock === 0;
    const td = (center = false) => ({
      ...S.td(sel),
      textAlign: center ? "center" : "left",
      ...(idx === 0 ? { borderTop: "none" } : {}),
      ...(hasNoStock ? { opacity: 0.4 } : {}),
    });

    const totalFromBatches =
      batchMode === "pick" && sel
        ? Object.values(pickedBatches[variant.id] || {}).reduce(
            (sum, val) => sum + (parseInt(val) || 0),
            0,
          )
        : 0;

    return (
      <tr
        key={variant.sku || variant.id}
        style={{
          borderLeft: sel ? `3px solid ${GOLD}` : "3px solid transparent",
          ...(hasNoStock ? { cursor: "not-allowed" } : {}),
        }}
        title={hasNoStock ? "No stock available" : undefined}
      >
        <td style={td(true)}>
          <input
            type="checkbox"
            checked={sel}
            onChange={() => !hasNoStock && toggleId(variant.id)}
            disabled={hasNoStock}
            style={{
              width: "16px",
              height: "16px",
              cursor: hasNoStock ? "not-allowed" : "pointer",
              accentColor: GOLD,
              opacity: hasNoStock ? 0.4 : 1,
            }}
          />
        </td>
        <td style={td()}>
          <div
            style={{
              fontWeight: 700,
              color: hasNoStock ? "var(--gray)" : "#E5E2E1",
              fontSize: "0.85rem",
            }}
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
          <span
            style={{
              fontWeight: 700,
              color: hasNoStock ? "#ef4444" : GOLD,
            }}
          >
            {variant.stock}
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--gray)",
              marginLeft: "3px",
            }}
          >
            {variant.uom}
          </span>
        </td>
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
        {batchMode === "pick" && (
          <td style={td(true)}>
            {sel && totalFromBatches > 0 ? (
              <span style={{ fontWeight: 700, color: GOLD }}>
                {totalFromBatches} {variant.uom}
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
              {variant.uom}
            </span>
          ) : (
            <span style={{ color: "var(--gray)" }}>—</span>
          )}
        </td>
      </tr>
    );
  };

  // ── FIFO breakdown ──────────────────────────────────────────────────────
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
                        {c.batchId}
                      </div>
                      {c.invoiceNumber && (
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "var(--gray)",
                            marginTop: "2px",
                          }}
                        >
                          INV: {c.invoiceNumber}
                        </div>
                      )}
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

  // ── Pick-batch cards ────────────────────────────────────────────────────
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

              {variant.batches.map((batch) => {
                const batchInputs = pickedBatches[id] || {};
                const pickedQty = parseInt(batchInputs[batch.batchId]) || 0;
                const isPicked = pickedQty > 0;
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
    const cfg = ISSUE_TYPES[issueType] || ISSUE_TYPES.adjustment;
    return (
      <div
        style={{
          ...S.summaryBox,
          background: `${cfg.color === "#ef4444" ? "rgba(239,68,68,0.07)" : cfg.color === "#f97316" ? "rgba(249,115,22,0.07)" : cfg.color === "#8b5cf6" ? "rgba(139,92,246,0.07)" : cfg.color === "#f59e0b" ? "rgba(245,158,11,0.07)" : "rgba(156,163,175,0.07)"}`,
          border: `1px solid ${cfg.border}`,
        }}
      >
        <div style={{ ...S.lbl, marginBottom: "0.75rem" }}>Issue Summary</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "0.5rem",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
            Total qty to issue
          </span>
          <span style={{ fontWeight: 700, color: "#ef4444" }}>
            {totals.qty} pcs
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "0.5rem",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
            Est. loss value
          </span>
          <span style={{ fontWeight: 700, color: GOLD }}>
            {peso(totals.cost)}
          </span>
        </div>
        {totals.qty > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              paddingTop: "0.5rem",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: "var(--gray)" }}>
              Avg unit cost
            </span>
            <span style={{ fontWeight: 700, color: "#E5E2E1" }}>
              {peso(totals.avgCost)}
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
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
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
              Issue Stock
            </div>
            <h2
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "#E5E2E1",
                margin: 0,
              }}
            >
              {item.name}
            </h2>
            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--gray)",
                marginTop: "0.35rem",
              }}
            >
              {item.category} · Available stock:{" "}
              <strong style={{ color: GOLD }}>
                {totalStock} {item.uom || "pcs"}
              </strong>
            </div>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}
          >
            <button
              onClick={onClose}
              style={{
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
        <div style={S.body}>
          {/* LEFT */}
          <div style={S.left}>
            {/* Batch Selection Mode Toggle — moved just above variant table */}
            <div
              style={{
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
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
                Batch Selection Mode:
              </span>
              <button
                type="button"
                style={S.modeBtn(batchMode === "fifo")}
                onClick={() => setBatchMode("fifo")}
              >
                Auto FIFO
              </button>
              <button
                type="button"
                style={S.modeBtn(batchMode === "pick")}
                onClick={() => setBatchMode("pick")}
              >
                Pick Batch
              </button>
            </div>

            <div style={{ ...S.lbl, marginBottom: "0.625rem" }}>
              Select variants & qty to issue
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
                    <th style={{ ...S.th, textAlign: "center" }}>Available</th>
                    <th style={{ ...S.th, textAlign: "center" }}>
                      {batchMode === "fifo"
                        ? "Qty to Issue"
                        : "Total from Batches"}
                    </th>
                    <th style={{ ...S.th, textAlign: "center" }}>Remaining</th>
                  </tr>
                </thead>
                <tbody>{variants.map((v, i) => renderRow(v, i))}</tbody>
              </table>
            </div>

            {batchMode === "fifo" && renderFifo()}
            {batchMode === "pick" && renderPickCards()}
          </div>

          {/* RIGHT */}
          <div style={S.right}>
            {/* Issue Type Grouped by Category */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={S.lbl}>
                Issue Type <span style={{ color: GOLD }}>*</span>
              </label>
              {Object.entries(ISSUE_TYPE_CATEGORIES).map(([catKey, catCfg]) => (
                <div key={catKey} style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      fontSize: "0.58rem",
                      fontWeight: 700,
                      color: "var(--gray)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "0.35rem",
                      paddingBottom: "0.25rem",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    ── {catCfg.label} ──
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.4rem",
                    }}
                  >
                    {GOODS_ISSUE_TYPES.filter((t) => t.category === catKey).map(
                      (t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setIssueType(t.id)}
                          style={{
                            padding: "0.55rem 0.6rem",
                            borderRadius: "7px",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            textAlign: "center",
                            border:
                              issueType === t.id
                                ? `2px solid ${t.color}`
                                : "1px solid rgba(255,255,255,0.1)",
                            background:
                              issueType === t.id
                                ? t.color + "1a"
                                : "rgba(255,255,255,0.04)",
                            color: issueType === t.id ? t.color : "var(--gray)",
                            transition: "all 0.15s",
                          }}
                        >
                          {t.label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ))}
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "var(--gray)",
                  marginTop: "0.35rem",
                  minHeight: "2.4em",
                }}
              >
                {(() => {
                  const t = GOODS_ISSUE_TYPES.find((x) => x.id === issueType);
                  const cat = t ? ISSUE_TYPE_CATEGORIES[t.category] : null;
                  return cat
                    ? `${cat.label}: ${cat.description}`
                    : "Select an issue type.";
                })()}
              </div>
            </div>

            {/* Performed By — auto-filled from auth, read-only */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={S.lbl}>
                Performed By{" "}
                <span style={{ color: "var(--gray)", fontWeight: 400 }}>
                  (auto-filled)
                </span>
              </label>
              <input
                type="text"
                value={performedBy}
                readOnly
                placeholder="Loading…"
                style={{
                  ...inputBase,
                  background: "rgba(255,255,255,0.03)",
                  color: performedBy ? "#E5E2E1" : "var(--gray)",
                  cursor: "not-allowed",
                }}
              />
            </div>

            {/* Remarks */}
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
                {totals.qty} pcs · {selectedIds.length} variant
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
              Confirm Issue
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
                Confirm Issue Stock
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
                  <span className="confirm-label">Type:</span>
                  <span className="confirm-value">
                    <IssueTypeBadge type={pending.issueType} />
                  </span>
                </div>
                <div className="confirm-row">
                  <span className="confirm-label">Performed By:</span>
                  <span className="confirm-value">{pending.performedBy}</span>
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
                  <span className="confirm-label">Loss Value:</span>
                  <span
                    className="confirm-value"
                    style={{ color: GOLD, fontWeight: 700 }}
                  >
                    {peso(pending.totals.cost)}
                  </span>
                </div>
                {pending.remarks && (
                  <div className="confirm-row">
                    <span className="confirm-label">Remarks:</span>
                    <span className="confirm-value">{pending.remarks}</span>
                  </div>
                )}
              </div>

              {/* Variant breakdown */}
              {pending.variants
                .filter((v) => v.qtyFulfilled > 0)
                .map((v) => (
                  <div
                    key={v.variantId}
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        marginBottom: "0.35rem",
                      }}
                    >
                      {v.variantName} — {v.qtyFulfilled} {v.uom}
                    </div>
                    {v.batches.map((c, ci) => (
                      <div
                        key={ci}
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--gray)",
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.15rem 0",
                        }}
                      >
                        <span style={{ fontFamily: "monospace" }}>
                          {c.batchId}
                        </span>
                        <span>
                          −{c.take} pcs @ {peso(c.unitCost)} ={" "}
                          {peso(c.totalCost)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}

              <p
                className="confirm-hint"
                style={{ marginTop: "1rem", color: "#facc15" }}
              >
                This will permanently remove stock. This cannot be undone.
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
                Confirm Issue
              </button>
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
