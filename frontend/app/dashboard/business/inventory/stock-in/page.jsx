"use client";

import CustomDropdown from "@/app/components/CustomDropdown";
import { useAuth } from "@/contexts/AuthContext";
import { createBadOrder } from "@/lib/badOrdersApi";
import {
  adjustInventoryStock,
  createSupplier,
  fetchInventory,
  fetchSuppliers,
} from "@/lib/inventoryApi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { genDocNumber, thStyle } from "../utils";
import AddStockModal from "./AddStockModal";

// ── Shared Input Style ─────────────────────────────────────────────────────────
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

// ── Comma Number Input ─────────────────────────────────────────────────────────
function CommaNumberInput({ value, onChange, placeholder, style }) {
  const handleChange = (e) => {
    const val = e.target.value.replace(/,/g, "");
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      const numVal = parseFloat(val) || 0;
      if (numVal <= 999999999.99) {
        const parts = val.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        onChange(parts.join("."));
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

// ── Info Modal ─────────────────────────────────────────────────────────────────
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

// ── Add Vendor Quick Modal ─────────────────────────────────────────────────────
function AddVendorQuickModal({
  isOpen,
  onClose,
  onAdd,
  existingVendors,
  preFillCategories = [],
}) {
  const [form, setForm] = useState({
    name: "",
    contact: "",
    phone: "",
    address: "",
    email: "",
    categories: [],
  });
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    if (isOpen)
      setForm({
        name: "",
        contact: "",
        phone: "",
        address: "",
        email: "",
        categories: preFillCategories.length > 0 ? preFillCategories : [],
      });
  }, [isOpen, preFillCategories]);

  const handlePhoneChange = (e) => {
    const val = e.target.value.replace(/[^0-9-]/g, "").slice(0, 15);
    setForm((p) => ({ ...p, phone: val }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setInfoModal({
        title: "Validation Error",
        message: "Please enter a vendor name.",
      });
      return;
    }
    if (!form.contact.trim()) {
      setInfoModal({
        title: "Validation Error",
        message: "Please enter a contact person.",
      });
      return;
    }
    if (
      existingVendors.some(
        (v) => v.name.toLowerCase() === form.name.trim().toLowerCase(),
      )
    ) {
      setInfoModal({
        title: "Duplicate Vendor",
        message: `"${form.name.trim()}" already exists.`,
      });
      return;
    }
    onAdd({
      ...form,
      name: form.name.trim(),
      contact: form.contact.trim(),
      address: form.address.trim(),
    });
    onClose();
  };

  if (!isOpen) return null;

  // Shared input style matching the app design system
  const inputStyle = {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    color: "#E5E2E1",
    fontSize: "0.875rem",
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#E5E2E1",
    marginBottom: "0.5rem",
    letterSpacing: "0.02em",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1A1A1A",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "16px",
          width: "90%",
          maxWidth: "480px",
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.6rem",
                color: "#D4A843",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                fontWeight: 700,
                marginBottom: "0.25rem",
              }}
            >
              Vendor Management
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.15rem",
                fontWeight: 700,
                color: "#E5E2E1",
              }}
            >
              Add New Vendor
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              width: "36px",
              height: "36px",
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
              e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "var(--gray)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div>
            <label style={labelStyle}>
              Vendor Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((p) => ({ ...p, name: e.target.value.slice(0, 80) }))
              }
              placeholder="e.g., SanRoque Trading"
              autoFocus
              maxLength={80}
              style={{
                ...inputStyle,
                borderColor: "rgba(212,168,67,0.4)",
                boxShadow: "0 0 0 3px rgba(212,168,67,0.1)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "rgba(212,168,67,0.6)";
                e.target.style.boxShadow = "0 0 0 3px rgba(212,168,67,0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(212,168,67,0.4)";
                e.target.style.boxShadow = "0 0 0 3px rgba(212,168,67,0.1)";
              }}
            />
          </div>
          <div>
            <label style={labelStyle}>
              Contact Person <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={form.contact}
              onChange={(e) =>
                setForm((p) => ({ ...p, contact: e.target.value.slice(0, 60) }))
              }
              placeholder="e.g., Juan Dela Cruz"
              maxLength={60}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value.slice(0, 100) }))
              }
              placeholder="e.g., vendor@email.com"
              maxLength={100}
              style={inputStyle}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div>
              <label style={labelStyle}>Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={handlePhoneChange}
                placeholder="09xx-xxx-xxxx"
                maxLength={15}
                inputMode="tel"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    address: e.target.value.slice(0, 100),
                  }))
                }
                placeholder="e.g., Marikina City"
                maxLength={100}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.75rem",
            padding: "1.25rem 1.5rem",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.625rem 1.25rem",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#E5E2E1",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            style={{
              padding: "0.625rem 1.5rem",
              background: "linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)",
              border: "none",
              borderRadius: "8px",
              color: "#000",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 4px 12px rgba(212,168,67,0.3)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 6px 16px rgba(212,168,67,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 12px rgba(212,168,67,0.3)";
            }}
          >
            Add Vendor
          </button>
        </div>
      </div>

      <InfoModal
        isOpen={!!infoModal}
        onClose={() => setInfoModal(null)}
        title={infoModal?.title || ""}
        message={infoModal?.message || ""}
      />
    </div>
  );
}

// ── Confirm Save Modal ─────────────────────────────────────────────────────────
function ConfirmSaveModal({
  isOpen,
  onClose,
  onConfirm,
  entries,
  totalGood,
  totalDamaged,
}) {
  if (!isOpen || !entries || entries.length === 0) return null;

  const entriesByMaterial = entries.reduce((acc, entry) => {
    if (!acc[entry.materialName])
      acc[entry.materialName] = {
        name: entry.materialName,
        category: entry.category,
        sku: entry.sku,
        entries: [],
      };
    acc[entry.materialName].entries.push(entry);
    return acc;
  }, {});

  const materials = Object.values(entriesByMaterial);
  const firstMaterial = materials[0];
  const variantCount = entries.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "550px" }}
      >
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: "#D4A843" }}>
            Add Item
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
          <div
            style={{
              padding: "1rem",
              background: "rgba(212,168,67,0.1)",
              border: "1px solid rgba(212,168,67,0.3)",
              borderRadius: "10px",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "#E5E2E1",
                fontSize: "1rem",
                marginBottom: "0.5rem",
              }}
            >
              {firstMaterial.name}
            </div>
            <div
              style={{
                display: "flex",
                gap: "1rem",
                fontSize: "0.75rem",
                color: "var(--gray)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span>
                Category:{" "}
                <strong style={{ color: "#D4A843" }}>
                  {firstMaterial.category || "—"}
                </strong>
              </span>
              <span style={{ fontFamily: "monospace" }}>
                SKU: {firstMaterial.sku || "—"}
              </span>
              {variantCount > 1 && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#D4A843",
                    fontWeight: 600,
                    background: "rgba(212,168,67,0.15)",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "4px",
                  }}
                >
                  {variantCount} combo variant{variantCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            {[
              {
                label: "Total Stock",
                value: `${totalGood}`,
                color: "#D4A843",
                bg: "rgba(255,255,255,0.03)",
                border: "rgba(255,255,255,0.08)",
              },
              {
                label: "Bad Orders",
                value: `${totalDamaged}`,
                color: "#F87171",
                bg: "rgba(248,113,113,0.06)",
                border: "rgba(248,113,113,0.2)",
              },
              {
                label: "Min Level",
                value: "10",
                color: "#E5E2E1",
                bg: "rgba(255,255,255,0.03)",
                border: "rgba(255,255,255,0.08)",
              },
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  padding: "0.875rem",
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.65rem",
                    color: "var(--gray)",
                    textTransform: "uppercase",
                    marginBottom: "0.25rem",
                  }}
                >
                  {c.label}
                </div>
                <div
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    color: c.color,
                  }}
                >
                  {c.value}{" "}
                  <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                    pcs
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <div
              style={{
                fontSize: "0.65rem",
                color: "var(--gray)",
                textTransform: "uppercase",
                marginBottom: "0.5rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
              }}
            >
              Variants & Batch Details
            </div>
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              {entries.map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  style={{
                    padding: "0.75rem",
                    borderBottom:
                      idx < entries.length - 1
                        ? "1px solid rgba(255,255,255,0.04)"
                        : "none",
                    background:
                      idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: "#E5E2E1",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {entry.materialName}
                      </div>
                      <div
                        style={{
                          fontSize: "0.65rem",
                          fontFamily: "monospace",
                          color: "var(--gray)",
                        }}
                      >
                        {entry.sku || "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          color: "#D4A843",
                        }}
                      >
                        {entry.goodQty || 0}
                      </div>
                      <div
                        style={{ fontSize: "0.65rem", color: "var(--gray)" }}
                      >
                        pcs
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.5rem",
                      fontSize: "0.7rem",
                    }}
                  >
                    {[
                      ["Supplier", entry.vendorName, "#E5E2E1", null],
                      ["Invoice", entry.invoiceNo, "#E5E2E1", null],
                    ].map(([l, v, c, ff]) => (
                      <div key={l}>
                        <div
                          style={{
                            fontSize: "0.6rem",
                            color: "var(--gray)",
                            textTransform: "uppercase",
                            marginBottom: "0.15rem",
                          }}
                        >
                          {l}
                        </div>
                        <div
                          style={{
                            fontFamily: ff || "inherit",
                            color: c,
                            fontSize: "0.65rem",
                          }}
                        >
                          {v || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              fontSize: "0.78rem",
              color: "var(--gray)",
              textAlign: "center",
              fontStyle: "italic",
              marginBottom: "1rem",
            }}
          >
            This will add a new item to your physical inventory.
          </div>
        </div>
        <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            style={{
              background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)",
              color: "#000",
              fontWeight: 700,
            }}
          >
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Material Report Group (collapsible) ────────────────────────────────────────
function MaterialReportGroup({ group, isLast }) {
  const [open, setOpen] = useState(false);
  const entries = group.entries || [];
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1.5rem",
          background: "rgba(255,255,255,0.02)",
          border: "none",
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
              color: "var(--gray)",
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 0.2s",
            }}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <div>
            <div
              style={{ fontWeight: 600, color: "#E5E2E1", fontSize: "0.85rem" }}
            >
              {group.name}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--gray)" }}>
              {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
              {group.category && ` • ${group.category}`}
            </div>
          </div>
        </div>
      </button>
      {open && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.78rem",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th style={{ ...thStyle, padding: "0.5rem 1.5rem" }}>Date</th>
                <th style={{ ...thStyle, padding: "0.5rem 1rem" }}>SKU</th>
                <th style={{ ...thStyle, padding: "0.5rem 1rem" }}>Vendor</th>
                <th
                  style={{
                    ...thStyle,
                    padding: "0.5rem 0.75rem",
                    textAlign: "center",
                  }}
                >
                  Qty
                </th>
                <th
                  style={{
                    ...thStyle,
                    padding: "0.5rem 0.75rem",
                    textAlign: "center",
                  }}
                >
                  Dmg
                </th>
                <th
                  style={{
                    ...thStyle,
                    padding: "0.5rem 0.75rem",
                    textAlign: "right",
                  }}
                >
                  Unit Cost
                </th>
                <th
                  style={{
                    ...thStyle,
                    padding: "0.5rem 0.75rem",
                    textAlign: "right",
                  }}
                >
                  Total
                </th>
                <th style={{ ...thStyle, padding: "0.5rem 1rem" }}>
                  Invoice No.
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr
                  key={e.id || i}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                >
                  <td
                    style={{
                      padding: "0.5rem 1.5rem",
                      color: "var(--gray)",
                      fontSize: "0.75rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(e.dateAdded || e.dateReceived).toLocaleDateString(
                      "en-PH",
                    )}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 1rem",
                      fontFamily: "monospace",
                      fontSize: "0.72rem",
                      color: "var(--gray)",
                    }}
                  >
                    {e.sku || "—"}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 1rem",
                      fontSize: "0.78rem",
                      color: "#E5E2E1",
                    }}
                  >
                    {e.vendorName || "—"}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "center",
                      fontWeight: 700,
                      color: "#4ade80",
                    }}
                  >
                    {e.goodQty || e.receivedQty || 0}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "center",
                      fontWeight: 600,
                      color: e.damagedQty > 0 ? "#F87171" : "var(--gray)",
                    }}
                  >
                    {e.damagedQty || 0}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                    }}
                  >
                    ₱
                    {(e.unitCost || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
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
                    ₱
                    {(e.totalCost || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 1rem",
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                      color: "var(--gray)",
                    }}
                  >
                    {e.invoiceNo || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vendor Combobox ────────────────────────────────────────────────────────────
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

  const uniqueVendors = useMemo(() => {
    const seen = new Map();
    vendors.forEach((v) => {
      if (!seen.has(v.id)) seen.set(v.id, v);
    });
    return [...seen.values()];
  }, [vendors]);

  const eligibleVendors = useMemo(
    () =>
      uniqueVendors.filter((v) => {
        const rawItems = v.itemsSupplied || v.categories || [];
        const vItems = [
          ...new Set(
            rawItems.map((item) =>
              typeof item === "string" ? item : item.name || "",
            ),
          ),
        ];
        if (vItems.length === 0) return true;
        if (!selectedCategories || selectedCategories.length === 0) return true;
        return selectedCategories.every((cat) => vItems.includes(cat));
      }),
    [uniqueVendors, selectedCategories],
  );

  const display = !value
    ? "General Merchandise"
    : vendorName || "General Merchandise";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "0.65rem 0.875rem",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "8px",
          color: "#E5E2E1",
          fontSize: "0.85rem",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span>{display}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{
            flexShrink: 0,
            color: "var(--gray)",
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
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "8px",
            zIndex: 50,
            boxShadow: "0 8px 32px rgba(0,0,0,1)",
            maxHeight: "260px",
            overflowY: "auto",
          }}
        >
          {/* General Merchandise */}
          <button
            type="button"
            onClick={() => {
              onChange("", "General Merchandise");
              setOpen(false);
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.65rem 0.875rem",
              background: !value ? "rgba(212,168,67,0.12)" : "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: !value ? "#D4A843" : "#E5E2E1",
                }}
              >
                General Merchandise
              </div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--gray)",
                  marginTop: "0.1rem",
                }}
              >
                Local market / various vendors
              </div>
            </div>
            {!value && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#D4A843"
                strokeWidth="3"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
          {eligibleVendors.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                onChange(v.id, v.name);
                setOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.65rem 0.875rem",
                background:
                  value === v.id ? "rgba(212,168,67,0.12)" : "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: value === v.id ? "#D4A843" : "#E5E2E1",
                  }}
                >
                  {v.name}
                </div>
                <div
                  style={{
                    fontSize: "0.62rem",
                    color: "var(--gray)",
                    marginTop: "0.1rem",
                  }}
                >
                  {v.itemsSupplied?.length > 0
                    ? v.itemsSupplied
                        .map((item) =>
                          typeof item === "string" ? item : item.name || "",
                        )
                        .join(" • ")
                    : "General supplier"}
                </div>
              </div>
              {value === v.id && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#D4A843"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
          {eligibleVendors.length === 0 && selectedCategories.length > 0 && (
            <div
              style={{
                padding: "1rem 0.875rem",
                textAlign: "center",
                color: "var(--gray)",
                fontSize: "0.75rem",
              }}
            >
              No vendors supply the selected categories.
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddNew();
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.65rem 0.875rem",
              background: "transparent",
              border: "none",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              cursor: "pointer",
              color: "#D4A843",
              fontSize: "0.82rem",
              fontWeight: 600,
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
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add New Vendor...
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function StockInPage() {
  const { token } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [stockInLog, setStockInLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [vendorPreFillCategories, setVendorPreFillCategories] = useState([]);
  const [activeTab, setActiveTab] = useState("history");

  // Confirm modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [pendingGood, setPendingGood] = useState(0);
  const [pendingDamaged, setPendingDamaged] = useState(0);
  const [pendingShortage, setPendingShortage] = useState(0);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardVendors, setWizardVendors] = useState([]);

  // History tab
  const [historySearch, setHistorySearch] = useState("");
  const [historyVendorFilter, setHistoryVendorFilter] = useState("");

  // Reports tab
  const [reportMode, setReportMode] = useState("month");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportVendorFilter, setReportVendorFilter] = useState("");
  const [reportGenerated, setReportGenerated] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [reportSummary, setReportSummary] = useState(null);
  const [showCSVPreview, setShowCSVPreview] = useState(false);
  const reportRef = useRef(null);

  const loadData = useCallback(async () => {
    if (!token) {
      setMaterials([]);
      setVendors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [mats, sups] = await Promise.all([
        fetchInventory(token),
        fetchSuppliers(token),
      ]);
      setMaterials(mats.map((m) => ({ ...m, id: m.id ?? m._id })));
      setVendors(sups.map((v) => ({ ...v, id: v.id ?? v._id })));
    } catch (e) {
      setLoadError(e?.message || "Failed to load");
      setInfoModal({
        title: "Could not load data",
        message: e?.message || "Failed to load inventory or suppliers.",
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const selectableMaterials = useMemo(
    () => materials.filter((m) => !m.parentId),
    [materials],
  );

  const openWizard = () => {
    setWizardVendors([...vendors]);
    setWizardOpen(true);
  };
  const closeWizard = () => {
    setWizardOpen(false);
    setWizardVendors([]);
  };

  // Handle save from AddStockModal — API: adjust-stock (restock) + returns (bad orders)
  const handleSaveStock = async (stockData) => {
    if (!stockData || stockData.length === 0) return;
    if (!token) {
      setInfoModal({
        title: "Sign in required",
        message: "Sign in as admin to record stock-in.",
      });
      return;
    }

    const entries = [];
    let totalGoodAll = 0;
    let totalDamagedAll = 0;

    try {
      for (const entry of stockData) {
        const received = entry.receivedQty || 0;
        const good = entry.goodQty ?? 0;
        const boSum = (entry.badOrders || []).reduce(
          (s, b) => s + (parseInt(b.qty, 10) || 0),
          0,
        );
        const damaged = entry.damagedQty ?? boSum;
        totalGoodAll += good;
        totalDamagedAll += damaged;

        const invId = entry.materialId;
        const unitCost = entry.unitCost || 0;

        if (good > 0) {
          await adjustInventoryStock(
            invId,
            {
              quantity: good,
              adjustmentType: "add",
              reason: "restock",
              unitCost,
              supplierId: entry.vendorId || undefined,
              supplierName: entry.vendorName || undefined,
              invoiceNumber: entry.invoiceNumber || undefined,
              deliveryDate: entry.dateReceived,
              remarks: entry.notes || undefined,
            },
            token,
          );
        }

        if (entry.badOrders && entry.badOrders.length > 0) {
          for (const bo of entry.badOrders) {
            const q = parseInt(bo.qty, 10) || 0;
            if (q <= 0) continue;
            await createBadOrder(token, {
              materialId: invId,
              vendorId: entry.vendorId || undefined,
              damageType: bo.type,
              quantity: q,
              notes: `${bo.label || bo.type} — Invoice ${entry.invoiceNumber || "—"}`,
            });
          }
        }

        entries.push({
          id: genDocNumber("SI"),
          materialId: entry.materialId,
          materialName: entry.materialName,
          sku: entry.sku || "",
          category: "",
          uom: entry.uom || "pcs",
          vendorId: entry.vendorId || null,
          vendorName: entry.vendorName || "General Merchandise",
          receivedQty: received,
          goodQty: good,
          damagedQty: damaged,
          unitCost,
          totalCost: received * unitCost,
          invoiceNo: entry.invoiceNumber || "",
          deliveryDate: entry.dateReceived?.split("T")[0] || "",
          notes: entry.notes || "",
          receiptImage: entry.receiptImage || null,
          dateReceived: entry.dateReceived,
          dateAdded: new Date().toISOString(),
        });
      }

      const [mats, sups] = await Promise.all([
        fetchInventory(token),
        fetchSuppliers(token),
      ]);
      setMaterials(mats.map((m) => ({ ...m, id: m.id ?? m._id })));
      setVendors(sups.map((v) => ({ ...v, id: v.id ?? v._id })));

      setStockInLog((prev) => [...entries, ...prev]);

      setPendingEntries(entries);
      setPendingGood(totalGoodAll);
      setPendingDamaged(totalDamagedAll);
      setPendingShortage(0);
      setShowConfirmModal(true);
      setToast({ type: "success", message: "Stock-in saved successfully." });
    } catch (e) {
      setInfoModal({
        title: "Stock-in failed",
        message: e?.message || "Could not complete stock-in.",
      });
    }
  };

  const handleConfirmSave = () => setShowConfirmModal(false);

  // Reports
  const generateReport = () => {
    let filtered = [...stockInLog];
    const now = new Date();
    if (reportMode === "today")
      filtered = filtered.filter(
        (e) =>
          new Date(e.dateAdded || e.dateReceived).toDateString() ===
          now.toDateString(),
      );
    else if (reportMode === "week") {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      filtered = filtered.filter(
        (e) => new Date(e.dateAdded || e.dateReceived) >= w,
      );
    } else if (reportMode === "month")
      filtered = filtered.filter((e) => {
        const d = new Date(e.dateAdded || e.dateReceived);
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      });
    else if (reportMode === "year")
      filtered = filtered.filter(
        (e) =>
          new Date(e.dateAdded || e.dateReceived).getFullYear() ===
          now.getFullYear(),
      );
    else if (reportMode === "custom" && reportFrom && reportTo) {
      const from = new Date(reportFrom);
      const to = new Date(reportTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((e) => {
        const d = new Date(e.dateAdded || e.dateReceived);
        return d >= from && d <= to;
      });
    }
    if (reportVendorFilter)
      filtered = filtered.filter((e) => e.vendorId === reportVendorFilter);
    filtered.sort(
      (a, b) =>
        new Date(b.dateAdded || b.dateReceived) -
        new Date(a.dateAdded || a.dateReceived),
    );
    setReportData(filtered);
    setReportSummary({
      totalEntries: filtered.length,
      totalQtyIn: filtered.reduce(
        (s, e) => s + (e.goodQty || e.receivedQty || 0),
        0,
      ),
      totalAmount: filtered.reduce((s, e) => s + (e.totalCost || 0), 0),
      totalDamaged: filtered.reduce((s, e) => s + (e.damagedQty || 0), 0),
    });
    setReportGenerated(true);
  };
  const handlePrint = () => {
    if (!reportGenerated) return;
    window.print();
  };

  // Generate CSV string for Stock In Reports
  const generateStockInCSV = () => {
    if (!reportGenerated || !reportData.length) return "";
    const lines = [];
    lines.push(
      [
        "Date",
        "Material",
        "SKU",
        "Vendor",
        "Invoice No",
        "Delivery Date",
        "Received Qty",
        "Damaged",
        "Unit Cost",
        "Total Cost",
      ].join(","),
    );
    let grandReceived = 0,
      grandDamaged = 0,
      grandTotalCost = 0;
    reportData.forEach((e) => {
      lines.push(
        [
          new Date(e.dateAdded || e.dateReceived).toLocaleDateString("en-PH"),
          `"${e.materialName}"`,
          e.sku || "",
          `"${e.vendorName || "General Merchandise"}"`,
          e.invoiceNo || "",
          e.deliveryDate
            ? new Date(e.deliveryDate).toLocaleDateString("en-PH")
            : "",
          e.goodQty || e.receivedQty || 0,
          e.damagedQty || 0,
          (e.unitCost || 0).toFixed(2),
          (e.totalCost || 0).toFixed(2),
        ].join(","),
      );
      grandReceived += e.goodQty || e.receivedQty || 0;
      grandDamaged += e.damagedQty || 0;
      grandTotalCost += e.totalCost || 0;
    });
    lines.push(
      [
        "GRAND TOTAL",
        "",
        "",
        "",
        "",
        "",
        grandReceived,
        grandDamaged,
        "",
        grandTotalCost.toFixed(2),
      ].join(","),
    );
    return lines.join("\n");
  };

  // Download Stock In CSV (from preview modal)
  const handleDownloadStockInCSV = () => {
    const csvContent = generateStockInCSV();
    if (!csvContent) return;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-in-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowCSVPreview(false);
  };

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase();
    return stockInLog
      .filter((e) => {
        const matchSearch =
          !q ||
          (e.materialName || "").toLowerCase().includes(q) ||
          (e.invoiceNo || "").toLowerCase().includes(q) ||
          (e.sku || "").toLowerCase().includes(q);
        const matchVendor =
          !historyVendorFilter || e.vendorId === historyVendorFilter;
        return matchSearch && matchVendor;
      })
      .sort(
        (a, b) =>
          new Date(b.dateAdded || b.dateReceived) -
          new Date(a.dateAdded || a.dateReceived),
      );
  }, [stockInLog, historySearch, historyVendorFilter]);

  const historyVendors = useMemo(() => {
    const map = new Map();
    stockInLog.forEach((e) => {
      if (e.vendorId && !map.has(e.vendorId))
        map.set(e.vendorId, e.vendorName || "General Merchandise");
    });
    return [
      { value: "", label: "All Vendors" },
      ...[...map.entries()].map(([id, name]) => ({ value: id, label: name })),
    ];
  }, [stockInLog]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          color: "var(--gray)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid var(--border)",
              borderTop: "3px solid var(--gold)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 1rem",
            }}
          />
          <p>Loading Stock In…</p>
        </div>
      </div>
    );

  // ── Main Render ──────────────────────────────────────────────────────────────
  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-report-view, .print-report-view * { visibility: visible; }
          .print-report-view { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
          .no-print { display: none !important; }
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .si-wizard-step-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {loadError && (
        <div
          className="no-print"
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "var(--white)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.875rem" }}>{loadError}</span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setLoadError(null)}
            style={{ fontSize: "0.75rem" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "1.5rem",
            right: "1.5rem",
            zIndex: 9999,
            padding: "0.875rem 1.25rem",
            borderRadius: "10px",
            background:
              toast.type === "success"
                ? "rgba(34,197,94,0.15)"
                : "rgba(239,68,68,0.15)",
            border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: toast.type === "success" ? "#4ade80" : "#f87171",
            fontSize: "0.85rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div className="page-header no-print">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <h1 className="page-title">Stock In</h1>
            <p className="page-subtitle">
              Manual stock entries — multi-material, per-variant, with invoice
              tracking.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={openWizard}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)",
              color: "#000",
              fontWeight: 700,
              whiteSpace: "nowrap",
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
            Add Stock
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="no-print">
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: "1.5rem",
            borderBottom: "2px solid var(--border)",
          }}
        >
          {[
            { key: "history", label: "History" },
            { key: "reports", label: "Reports" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "0.75rem 1.25rem",
                background: "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab.key
                    ? "2px solid #D4A843"
                    : "2px solid transparent",
                color: activeTab === tab.key ? "#D4A843" : "var(--gray)",
                fontWeight: activeTab === tab.key ? 700 : 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.2s",
                marginBottom: "-2px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ HISTORY TAB ═══ */}
      {activeTab === "history" && (
        <div className="no-print">
          <div
            style={{
              background: "var(--dark)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                gap: "0.75rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  position: "relative",
                  flex: "1",
                  minWidth: "200px",
                  maxWidth: "300px",
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
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search material, invoice, SKU…"
                  style={{ ...inputStyle, paddingLeft: "2.25rem" }}
                />
              </div>
              <CustomDropdown
                value={historyVendorFilter}
                onChange={setHistoryVendorFilter}
                options={historyVendors}
                placeholder="All Vendors"
                style={{ minWidth: "150px" }}
              />
              {filteredHistory.length > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0.25rem 0.75rem",
                    background: "rgba(212,168,67,0.1)",
                    border: "1px solid rgba(212,168,67,0.3)",
                    borderRadius: "99px",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    color: "#D4A843",
                  }}
                >
                  {filteredHistory.length} record
                  {filteredHistory.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {filteredHistory.length === 0 ? (
              <div
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "var(--gray)",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 0.5rem",
                    color: "var(--white)",
                    fontSize: "1rem",
                  }}
                >
                  {stockInLog.length === 0
                    ? "No Stock-In Records"
                    : "No matching records"}
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  {stockInLog.length === 0
                    ? "Stocked-in items will appear here."
                    : "Try adjusting your search or filters."}
                </p>
              </div>
            ) : (
              <div
                style={{
                  overflowX: "auto",
                  maxHeight: "60vh",
                  overflowY: "auto",
                }}
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
                      background: "rgba(0,0,0,1)",
                    }}
                  >
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Material</th>
                      <th style={thStyle}>Vendor</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Qty</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>
                        Unit Cost
                      </th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                      <th style={thStyle}>Invoice No.</th>
                      <th style={thStyle}>Delivery Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((e, idx) => (
                      <tr
                        key={e.id || idx}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                        onMouseEnter={(ev) =>
                          (ev.currentTarget.style.background =
                            "rgba(255,255,255,0.02)")
                        }
                        onMouseLeave={(ev) =>
                          (ev.currentTarget.style.background = "transparent")
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
                          {new Date(
                            e.dateAdded || e.dateReceived,
                          ).toLocaleDateString("en-PH")}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#E5E2E1",
                              fontSize: "0.85rem",
                            }}
                          >
                            {e.materialName}
                          </div>
                          {e.sku && (
                            <div
                              style={{
                                fontSize: "0.65rem",
                                color: "var(--gray)",
                                fontFamily: "monospace",
                                marginTop: "0.1rem",
                              }}
                            >
                              {e.sku}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            color: "#E5E2E1",
                            fontSize: "0.82rem",
                          }}
                        >
                          {e.vendorName || "—"}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            textAlign: "center",
                            fontWeight: 700,
                            color: "#4ade80",
                          }}
                        >
                          {e.goodQty || e.receivedQty || 0} {e.uom || "pcs"}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            textAlign: "right",
                            color: "#E5E2E1",
                            fontFamily: "monospace",
                            fontSize: "0.8rem",
                          }}
                        >
                          ₱
                          {(e.unitCost || 0).toLocaleString("en-PH", {
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
                          {(e.totalCost || 0).toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            color: "#E5E2E1",
                            fontSize: "0.82rem",
                            fontFamily: "monospace",
                          }}
                        >
                          {e.invoiceNo || "—"}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            color: "var(--gray)",
                            fontSize: "0.78rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e.deliveryDate
                            ? new Date(
                                e.deliveryDate + "T00:00:00",
                              ).toLocaleDateString("en-PH")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ REPORTS TAB ═══ */}
      {activeTab === "reports" && (
        <div>
          <div
            className="no-print"
            style={{
              background: "var(--dark)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <h3
              style={{
                margin: "0 0 1rem",
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--white)",
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
                stroke="var(--gold)"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Stock In Reports
            </h3>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                flexWrap: "wrap",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <label
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    color: "var(--gray)",
                    textTransform: "uppercase",
                  }}
                >
                  Date Range
                </label>
                <CustomDropdown
                  value={reportMode}
                  onChange={(val) => {
                    setReportMode(val);
                    setReportGenerated(false);
                  }}
                  options={[
                    { value: "all", label: "All Time" },
                    { value: "today", label: "Today" },
                    { value: "week", label: "This Week" },
                    { value: "month", label: "This Month" },
                    { value: "year", label: "This Year" },
                    { value: "custom", label: "Custom Range" },
                  ]}
                  placeholder="All Time"
                  style={{ minWidth: "160px" }}
                />
              </div>
              {reportMode === "custom" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: "var(--gray)",
                        textTransform: "uppercase",
                      }}
                    >
                      From
                    </label>
                    <input
                      type="date"
                      value={reportFrom}
                      onChange={(e) => {
                        setReportFrom(e.target.value);
                        setReportGenerated(false);
                      }}
                      style={{ ...inputStyle, width: "auto" }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: "var(--gray)",
                        textTransform: "uppercase",
                      }}
                    >
                      To
                    </label>
                    <input
                      type="date"
                      value={reportTo}
                      onChange={(e) => {
                        setReportTo(e.target.value);
                        setReportGenerated(false);
                      }}
                      style={{ ...inputStyle, width: "auto" }}
                    />
                  </div>
                </>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <label
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    color: "var(--gray)",
                    textTransform: "uppercase",
                  }}
                >
                  Vendor
                </label>
                <CustomDropdown
                  value={reportVendorFilter}
                  onChange={setReportVendorFilter}
                  options={[
                    { value: "", label: "All Vendors" },
                    ...vendors.map((v) => ({ value: v.id, label: v.name })),
                  ]}
                  placeholder="All Vendors"
                  style={{ minWidth: "180px" }}
                />
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={generateReport}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Generate Report
              </button>
              {reportGenerated && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCSVPreview(true)}
                  style={{
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
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export CSV
                </button>
              )}
              {reportGenerated && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handlePrint}
                  style={{
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
                    strokeWidth="2"
                  >
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print
                </button>
              )}
            </div>
          </div>

          {reportGenerated && reportSummary && (
            <div>
              <div
                className="no-print"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
                  gap: "0.75rem",
                  marginBottom: "1.5rem",
                }}
              >
                {[
                  {
                    label: "Total Entries",
                    value: reportSummary.totalEntries.toString(),
                    color: "#E5E2E1",
                  },
                  {
                    label: "Total Qty In",
                    value: reportSummary.totalQtyIn.toLocaleString(),
                    color: "#E5E2E1",
                  },
                  {
                    label: "Total Invoice Amount",
                    value: formatPrice(reportSummary.totalAmount),
                    color: "#D4A843",
                  },
                  {
                    label: "Damaged on Arrival",
                    value: reportSummary.totalDamaged.toLocaleString(),
                    color: "#ef4444",
                  },
                ].map((card, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--dark)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      padding: "1.25rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.62rem",
                        color: "var(--gray)",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {card.label}
                    </div>
                    <div
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 800,
                        color: card.color,
                        marginTop: "0.25rem",
                      }}
                    >
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  background: "var(--dark)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "1.25rem 1.5rem",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "var(--white)",
                    }}
                  >
                    Detailed Entries
                  </h3>
                </div>
                {reportData.length === 0 ? (
                  <div
                    style={{
                      padding: "3rem",
                      textAlign: "center",
                      color: "var(--gray)",
                      fontSize: "0.85rem",
                    }}
                  >
                    No entries found for the selected filters.
                  </div>
                ) : (
                  <div
                    style={{
                      overflowX: "auto",
                      maxHeight: "50vh",
                      overflowY: "auto",
                    }}
                  >
                    {(() => {
                      const groups = {};
                      reportData.forEach((e) => {
                        const key = e.materialId || e.materialName;
                        if (!groups[key])
                          groups[key] = {
                            name: e.materialName,
                            category: e.category,
                            entries: [],
                          };
                        groups[key].entries.push(e);
                      });
                      let grandQty = 0,
                        grandDmg = 0,
                        grandTotal = 0;
                      const groupEntries = Object.entries(groups);
                      return (
                        <>
                          {groupEntries.map(([gKey, group], gi) => {
                            grandQty += group.entries.reduce(
                              (s, e) => s + (e.goodQty || e.receivedQty || 0),
                              0,
                            );
                            grandDmg += group.entries.reduce(
                              (s, e) => s + (e.damagedQty || 0),
                              0,
                            );
                            grandTotal += group.entries.reduce(
                              (s, e) => s + (e.totalCost || 0),
                              0,
                            );
                            return (
                              <MaterialReportGroup
                                key={gKey}
                                group={group}
                                isLast={gi === groupEntries.length - 1}
                              />
                            );
                          })}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "1rem 1.5rem",
                              background: "rgba(212,168,67,0.08)",
                              borderTop: "2px solid rgba(212,168,67,0.3)",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                color: "#D4A843",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                              }}
                            >
                              Grand Total
                            </span>
                            <div
                              style={{
                                display: "flex",
                                gap: "2rem",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.82rem",
                                  color: "#4ade80",
                                  fontWeight: 700,
                                }}
                              >
                                {grandQty} pcs
                              </span>
                              <span
                                style={{
                                  fontSize: "0.82rem",
                                  color: "#F87171",
                                  fontWeight: 700,
                                }}
                              >
                                {grandDmg} damaged
                              </span>
                              <span
                                style={{
                                  fontSize: "1rem",
                                  fontWeight: 800,
                                  color: "#D4A843",
                                  fontFamily: "monospace",
                                }}
                              >
                                {formatPrice(grandTotal)}
                              </span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {reportGenerated && reportSummary && (
            <div
              className="print-report-view"
              style={{ display: "none" }}
              ref={reportRef}
            >
              <div
                style={{
                  fontFamily: "sans-serif",
                  padding: "2rem",
                  color: "#000",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    marginBottom: "2rem",
                    borderBottom: "2px solid #000",
                    paddingBottom: "1rem",
                  }}
                >
                  <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>
                    Stock-In Report
                  </h1>
                  <p style={{ fontSize: "0.75rem", margin: 0, color: "#666" }}>
                    Generated: {new Date().toLocaleString("en-PH")}
                  </p>
                </div>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.75rem",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid #000" }}>
                      {[
                        "Date",
                        "Material",
                        "Vendor",
                        "Qty",
                        "Damaged",
                        "Unit Cost",
                        "Total",
                        "Invoice No.",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{ padding: "0.5rem", textAlign: "left" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((e, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                        <td style={{ padding: "0.5rem" }}>
                          {new Date(
                            e.dateAdded || e.dateReceived,
                          ).toLocaleDateString("en-PH")}
                        </td>
                        <td style={{ padding: "0.5rem" }}>{e.materialName}</td>
                        <td style={{ padding: "0.5rem" }}>
                          {e.vendorName || "—"}
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>
                          {e.goodQty || e.receivedQty || 0}
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>
                          {e.damagedQty || 0}
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>
                          ₱
                          {(e.unitCost || 0).toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>
                          ₱
                          {(e.totalCost || 0).toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          {e.invoiceNo || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Stock Modal */}
      <AddStockModal
        isOpen={wizardOpen}
        onClose={closeWizard}
        onSave={handleSaveStock}
        materials={materials}
        vendors={vendors}
        onAddVendor={(categories) => {
          setVendorPreFillCategories(categories || []);
          setShowAddVendor(true);
        }}
      />

      {/* Info / Confirm Modal */}
      {infoModal && infoModal.onConfirm ? (
        <div className="modal-overlay" onClick={() => setInfoModal(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "400px" }}
          >
            <div className="modal-header">
              <h2 className="modal-title" style={{ fontSize: "1rem" }}>
                {infoModal.title}
              </h2>
              <button
                className="modal-close"
                onClick={() => setInfoModal(null)}
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
                padding: "1.25rem 2rem",
                fontSize: "0.85rem",
                color: "#E5E2E1",
                lineHeight: 1.6,
              }}
            >
              {infoModal.message}
            </div>
            <div
              className="modal-actions"
              style={{ justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setInfoModal(null)}
              >
                No, Keep Editing
              </button>
              <button
                type="button"
                onClick={infoModal.onConfirm}
                style={{
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "#ef4444",
                  borderRadius: "6px",
                  padding: "0.5rem 1rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Yes, Discard
              </button>
            </div>
          </div>
        </div>
      ) : infoModal ? (
        <InfoModal
          isOpen={!!infoModal}
          onClose={() => setInfoModal(null)}
          title={infoModal.title || ""}
          message={infoModal.message || ""}
        />
      ) : null}

      {/* Add Vendor Modal */}
      <AddVendorQuickModal
        isOpen={showAddVendor}
        onClose={() => setShowAddVendor(false)}
        onAdd={(data) => {
          if (!token) {
            setInfoModal({
              title: "Sign in required",
              message: "Sign in as admin to add suppliers.",
            });
            return;
          }
          createSupplier(
            {
              name: data.name.trim(),
              contactPerson: data.contact?.trim() || null,
              phone: data.phone?.trim() || null,
              email: data.email?.trim() || null,
              address: data.address?.trim() || null,
              notes: null,
              itemsSupplied: (data.categories || []).map((name) => ({
                name,
                uom: "pcs",
              })),
            },
            token,
          )
            .then((created) => {
              const nv = { ...created, id: created.id ?? created._id };
              setVendors((prev) => [...prev, nv]);
            })
            .catch((e) =>
              setInfoModal({
                title: "Could not add vendor",
                message: e?.message || "Failed to create supplier.",
              }),
            );
        }}
        existingVendors={vendors}
        preFillCategories={vendorPreFillCategories}
      />

      {/* Confirm Save Modal */}
      <ConfirmSaveModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        entries={pendingEntries}
        totalGood={pendingGood}
        totalDamaged={pendingDamaged}
      />

      {/* CSV Preview Modal */}
      {showCSVPreview && reportData.length > 0 && (
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
                  {reportData.length} entries
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
                      Date
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
                      Vendor
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
                      Received
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
                        textAlign: "right",
                        color: "#D4A843",
                        fontWeight: 700,
                        fontSize: "0.6rem",
                        textTransform: "uppercase",
                      }}
                    >
                      Total Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((e, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <td
                        style={{
                          padding: "0.4rem 0.75rem",
                          color: "var(--gray)",
                          fontSize: "0.72rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(
                          e.dateAdded || e.dateReceived,
                        ).toLocaleDateString("en-PH")}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.75rem",
                          color: "#E5E2E1",
                          fontWeight: 600,
                        }}
                      >
                        {e.materialName}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.75rem",
                          color: "var(--gray)",
                        }}
                      >
                        {e.vendorName || "General Merchandise"}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.75rem",
                          textAlign: "center",
                          color: "#E5E2E1",
                        }}
                      >
                        {e.goodQty || e.receivedQty || 0}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.75rem",
                          textAlign: "center",
                          color:
                            (e.damagedQty || 0) > 0 ? "#ef4444" : "var(--gray)",
                        }}
                      >
                        {e.damagedQty || 0}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.75rem",
                          textAlign: "right",
                          fontFamily: "monospace",
                          color: "#D4A843",
                        }}
                      >
                        ₱
                        {(e.totalCost || 0).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                  <tr
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
                      {reportData.reduce(
                        (s, e) => s + (e.goodQty || e.receivedQty || 0),
                        0,
                      )}
                    </td>
                    <td
                      style={{
                        padding: "0.6rem 0.75rem",
                        textAlign: "center",
                        fontWeight: 800,
                        color: reportData.some((e) => (e.damagedQty || 0) > 0)
                          ? "#ef4444"
                          : "#22c55e",
                      }}
                    >
                      {reportData.reduce((s, e) => s + (e.damagedQty || 0), 0)}
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
                      ₱
                      {reportData
                        .reduce((s, e) => s + (e.totalCost || 0), 0)
                        .toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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
                onClick={handleDownloadStockInCSV}
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
