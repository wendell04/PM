"use client";

import { useMemo, useState } from "react";

const REASONS = [
  { value: "sale", label: "Sales" },
  { value: "damaged", label: "Damaged / Bad Order" },
  { value: "writeoff", label: "Write-Off" },
  { value: "missing", label: "Missing / Shortage" },
];

const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#E5E2E1",
  padding: "0.625rem 0.75rem",
  fontSize: "0.85rem",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: "0.75rem",
  color: "var(--gray)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "0.375rem",
  display: "block",
};

// FIFO cost: unit cost of oldest active batch
function getFifoCost(batches) {
  if (!batches || !Array.isArray(batches) || batches.length === 0) return 0;
  const oldest = [...batches]
    .filter((b) => (b.remainingQty || b.goodQty || b.qtyGood || 0) > 0)
    .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))[0];
  return oldest ? oldest.unitCost || 0 : 0;
}

// Stock available from batches or stockQty fallback
function getAvailableStock(item) {
  if (item.batches && Array.isArray(item.batches) && item.batches.length > 0) {
    return item.batches.reduce(
      (s, b) => s + (b.remainingQty || b.goodQty || b.qtyGood || 0),
      0,
    );
  }
  return item.stockQty || 0;
}

function invId(item) {
  return String(item?.id ?? item._id ?? "");
}

export default function GoodsIssueModal({ materials, onClose, onConfirm, currentUser }) {
  const [reason, setReason] = useState("sale");
  const [remarks, setRemarks] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [customer, setCustomer] = useState("");
  const [qtys, setQtys] = useState({}); // { [id]: string }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Build flat issuable list: standalone + variant children only (skip parents)
  const issuableItems = useMemo(() => {
    return (materials || [])
      .filter((m) => !m.hasVariants)
      .map((m) => ({
        ...m,
        availableStock: getAvailableStock(m),
        fifoCost: getFifoCost(m.batches) || m.baseCost || m.averageCost || 0,
      }));
  }, [materials]);

  const setQty = (_id, val) => {
    setQtys((prev) => ({ ...prev, [_id]: val }));
  };

  // Build variants array for onConfirm
  const buildVariants = () => {
    return issuableItems
      .filter((item) => {
        const q = parseFloat(qtys[invId(item)]);
        return !isNaN(q) && q > 0;
      })
      .map((item) => {
        const q = parseFloat(qtys[invId(item)]);
        const id = invId(item);
        return {
          inventoryId: id,
          variantId: id,
          qtyFulfilled: q,
          totalCostValue: q * item.fifoCost,
          sellingPrice: null,
        };
      });
  };

  const validate = () => {
    const variants = buildVariants();
    if (variants.length === 0) return "Select at least one item with a quantity.";
    for (const item of issuableItems) {
      const q = parseFloat(qtys[invId(item)]);
      if (!isNaN(q) && q > 0 && q > item.availableStock) {
        return `"${item.name}" — quantity exceeds available stock (${item.availableStock} ${item.uom || "pcs"}).`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm({
        reason,
        remarks: remarks.trim() || null,
        variants: buildVariants(),
        saleDate: saleDate || null,
        customer: customer.trim() || null,
        performedBy: currentUser?.name || null,
        saleRef: null,
      });
    } catch (err) {
      setError(err.message || "Failed to issue stock.");
      setSubmitting(false);
    }
  };

  const totalUnits = buildVariants().reduce((s, v) => s + v.qtyFulfilled, 0);
  const totalCost = buildVariants().reduce((s, v) => s + v.totalCostValue, 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #1a1a1a)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "14px",
          width: "100%",
          maxWidth: 580,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#E5E2E1" }}>
              Goods Issue
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--gray)",
                marginTop: "0.125rem",
              }}
            >
              Deduct stock from inventory
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--gray)",
              cursor: "pointer",
              fontSize: "1.25rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}>
          {/* Reason + Sale fields */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label style={labelStyle}>Reason *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={inputStyle}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {reason === "sale" && (
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Customer Name</label>
              <input
                type="text"
                placeholder="Optional"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={labelStyle}>Remarks</label>
            <input
              type="text"
              placeholder="Optional"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Items table */}
          <div style={{ marginBottom: "0.5rem" }}>
            <label style={labelStyle}>Items to Issue</label>
          </div>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 80px 88px",
                padding: "0.5rem 0.75rem",
                background: "rgba(255,255,255,0.03)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontSize: "0.7rem",
                color: "var(--gray)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <span>Item</span>
              <span style={{ textAlign: "center" }}>Available</span>
              <span style={{ textAlign: "center" }}>Unit Cost</span>
              <span style={{ textAlign: "center" }}>Qty to Issue</span>
            </div>

            {/* Rows */}
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {issuableItems.length === 0 && (
                <div
                  style={{
                    padding: "1.5rem",
                    textAlign: "center",
                    color: "var(--gray)",
                    fontSize: "0.85rem",
                  }}
                >
                  No inventory items available.
                </div>
              )}
              {issuableItems.map((item, idx) => {
                const qty = qtys[invId(item)] || "";
                const parsed = parseFloat(qty);
                const overLimit = !isNaN(parsed) && parsed > item.availableStock;
                const hasQty = !isNaN(parsed) && parsed > 0;
                return (
                  <div
                    key={invId(item)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 80px 88px",
                      padding: "0.625rem 0.75rem",
                      borderBottom:
                        idx < issuableItems.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                      background: hasQty
                        ? "rgba(212,168,67,0.04)"
                        : "transparent",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          color: "#E5E2E1",
                        }}
                      >
                        {item.name}
                        {item.parentId && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--gray)",
                              marginLeft: "0.375rem",
                            }}
                          >
                            (variant)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.68rem",
                          color: "var(--gray)",
                          fontFamily: "monospace",
                        }}
                      >
                        {item.sku || "—"} | {item.uom || "pcs"}
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color:
                          item.availableStock === 0
                            ? "#ef4444"
                            : item.availableStock < (item.minStock || 10)
                              ? "#f59e0b"
                              : "#E5E2E1",
                      }}
                    >
                      {item.availableStock}
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "0.78rem",
                        color: "var(--gray)",
                        fontFamily: "monospace",
                      }}
                    >
                      ₱
                      {item.fifoCost.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <input
                        type="number"
                        min={0}
                        max={item.availableStock}
                        placeholder="0"
                        value={qty}
                        onChange={(e) => setQty(invId(item), e.target.value)}
                        style={{
                          width: 72,
                          background: "rgba(255,255,255,0.06)",
                          border: `1px solid ${overLimit ? "#ef4444" : "rgba(255,255,255,0.1)"}`,
                          borderRadius: "6px",
                          color: overLimit ? "#ef4444" : "#E5E2E1",
                          padding: "0.375rem 0.5rem",
                          fontSize: "0.82rem",
                          outline: "none",
                          textAlign: "center",
                        }}
                        disabled={item.availableStock === 0}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          {totalUnits > 0 && (
            <div
              style={{
                marginTop: "0.875rem",
                padding: "0.625rem 0.875rem",
                background: "rgba(212,168,67,0.06)",
                border: "1px solid rgba(212,168,67,0.15)",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.82rem",
              }}
            >
              <span style={{ color: "var(--gray)" }}>
                Total:{" "}
                <strong style={{ color: "#E5E2E1" }}>
                  {totalUnits} units
                </strong>
              </span>
              <span style={{ color: "var(--gray)" }}>
                Est. Cost:{" "}
                <strong style={{ color: "#D4A843", fontFamily: "monospace" }}>
                  ₱
                  {totalCost.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </strong>
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.625rem 0.875rem",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: "8px",
                fontSize: "0.82rem",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            gap: "0.75rem",
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "0.625rem 1.25rem",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "8px",
              color: "var(--gray)",
              cursor: submitting ? "not-allowed" : "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || totalUnits === 0}
            style={{
              padding: "0.625rem 1.25rem",
              background:
                submitting || totalUnits === 0
                  ? "rgba(212,168,67,0.3)"
                  : "var(--gold, #D4A843)",
              border: "none",
              borderRadius: "8px",
              color:
                submitting || totalUnits === 0 ? "rgba(0,0,0,0.4)" : "#000",
              cursor:
                submitting || totalUnits === 0 ? "not-allowed" : "pointer",
              fontSize: "0.85rem",
              fontWeight: 700,
            }}
          >
            {submitting
              ? "Issuing…"
              : `Issue Stock${totalUnits > 0 ? ` (${totalUnits} units)` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
